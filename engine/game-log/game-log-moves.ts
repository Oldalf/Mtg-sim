/**
 * Card moves for the game log, in Archidekt's simple format ("moved hand => battlefield", "tapped", "untapped",
 * "counter:+1 / +1=3").
 *
 * Zone changes are recorded at the moment they happen: the game tells the recorder when a card leaves a zone and
 * when it arrives in one (GameCore.takeCard / putCard / moveCard and the battlefield functions).
 *
 * The recorder also remembers what a player's table looked like at the last log event, and compares at the next
 * one. That gives the tapped / untapped and counter changes (a payment that is only tested taps lands and undoes
 * it, so only the end result counts), and it finds every zone change that went around the functions above: those
 * are still written as moves (in no known order, and a card that moved twice shows as one move), and they are
 * listed in `unrecordedChanges` so that a test can point at the code that made them.
 *
 * Cards are told apart by name, creature tokens by name and face (see CardMove.token): inside the recorder each is
 * known by its log key, "Swamp" or "Vampire (2/2 black flying)". The recorder only reads the game.
 */
import { CardDef } from '../cards/cards';
import { CardMove } from './game-log';
import { Permanent } from '../game/game-types';
import {
  BoardPermanent,
  PlayerBoard,
  applyMove,
  describeLoggedCard,
} from '../../shared/game-log-board';
import type { TokenFace } from '../../shared/game-log-types';

/** The zones of a game that the recorder reads. */
export interface TableZones {
  library: CardDef[];
  hand: CardDef[];
  graveyard: CardDef[];
  exile: CardDef[];
  command: CardDef[];
  battlefield: Permanent[];
}

/** Archidekt's zone names. Tokens come from and go back to miscCards. */
const CARD_ZONES = [
  'library',
  'hand',
  'battlefield',
  'graveyard',
  'exile',
  'commandZone',
] as const;
export type CardZone = (typeof CARD_ZONES)[number];
const TOKEN_ZONE = 'miscCards';
/** Archidekt's zone for another player's cards: where a card goes when another player gains control of it, and
 *  where it comes from when it goes back to its owner (see GameCore.giveControlTo). */
const OTHER_PLAYER_ZONE = 'opponentsCards';
/** Where a card is written to when it left every zone the engine keeps (a deck dropped it), and where it is
 *  written from when it shows up out of nowhere. */
const UNKNOWN_ZONE: CardZone = 'exile';
const PLUS_ONE_COUNTER = '+1 / +1';

type CountByName = Map<string, number>;

/** The name and face behind each log key of a creature token (a card's log key is its name). */
const loggedTokenByKey = new Map<string, { name: string; face: TokenFace }>();

/** How the recorder knows a card: its log name, and a creature token's face with it. */
function logKeyOf(card: CardDef): string {
  const face = card.tokenFace;
  if (face === null) return card.logName;
  const key = describeLoggedCard(card.logName, face);
  if (!loggedTokenByKey.has(key))
    loggedTokenByKey.set(key, { name: card.logName, face });
  return key;
}

/** The log line for a log key and an action. */
function cardMoveOf(player: number, key: string, action: string): CardMove {
  const token = loggedTokenByKey.get(key);
  if (token === undefined) return { player, card: key, action };
  return { player, card: token.name, action, token: token.face };
}

/** What a player's table looks like at one moment, by card name. */
interface TableState {
  cardsInZone: Record<CardZone, CountByName>;
  tokens: CountByName;
  /** Each permanent's tapped state and +1/+1 counters. */
  permanents: Map<Permanent, PermanentState>;
}

interface PermanentState {
  isTapped: boolean;
  counters: number;
}

/** A card that left its zone and has not shown up in another one yet (a spell that is still resolving). */
interface CardOnItsWay {
  card: string;
  fromZone: CardZone;
  /** Did the game tell the recorder that it left (false = found by comparing)? */
  wasRecorded: boolean;
}

/** A zone change the game told the recorder about. fromZone is null while it is not known where the card came
 *  from (the game put it somewhere without saying where it took it from). */
interface RecordedMove {
  card: string;
  fromZone: string | null;
  toZone: string;
  /** Set for a line that is not a zone change ("untapped"): it is written instead of the move. */
  otherAction?: string;
}

function addToCount(counts: CountByName, name: string, change: number): void {
  counts.set(name, (counts.get(name) ?? 0) + change);
}

const copyOfCounts = (counts: CountByName): CountByName => new Map(counts);

function addOne(counts: CountByName, name: string): void {
  counts.set(name, (counts.get(name) ?? 0) + 1);
}

function countNames(cards: CardDef[]): CountByName {
  const counts: CountByName = new Map();
  for (const card of cards) addOne(counts, logKeyOf(card));
  return counts;
}

function readTableState(zones: TableZones): TableState {
  const state: TableState = {
    cardsInZone: {
      library: countNames(zones.library),
      hand: countNames(zones.hand),
      battlefield: new Map(),
      graveyard: countNames(zones.graveyard),
      exile: countNames(zones.exile),
      commandZone: countNames(zones.command),
    },
    tokens: new Map(),
    permanents: new Map(),
  };
  for (const permanent of zones.battlefield) {
    addOne(
      permanent.token ? state.tokens : state.cardsInZone.battlefield,
      logKeyOf(permanent.card),
    );
    state.permanents.set(permanent, {
      isTapped: permanent.tapped,
      counters: permanent.counters,
    });
  }
  return state;
}

function emptyTableState(): TableState {
  return readTableState({
    library: [],
    hand: [],
    graveyard: [],
    exile: [],
    command: [],
    battlefield: [],
  });
}

/** Every name that is a key of one of the maps, each once. */
function namesIn(...maps: Map<string, unknown>[]): string[] {
  const names = new Set<string>();
  for (const map of maps) for (const name of map.keys()) names.add(name);
  return [...names];
}

export class MoveRecorder {
  /** The table at the last log event, kept up to date with the zone changes the game reports. */
  private lastState: TableState;
  private cardsOnTheirWay: CardOnItsWay[] = [];
  private recordedMoves: RecordedMove[] = [];
  /** Zone changes that were found by comparing, not reported by the game ("Swamp; moved hand => battlefield").
   *  Whoever reads them empties the list. */
  unrecordedChanges: string[] = [];
  /** The battlefield as whoever replays the log rebuilds it (see applyMove): permanents known by name only. When
   *  identical tokens differ in tapped state or counters, the replay can mix them up: corrections fix that. */
  private replayedBoard: PlayerBoard = emptyPlayerBoard();

  /** zones: the table to start from (null = an empty table). */
  constructor(zones: TableZones | null) {
    this.lastState = zones ? readTableState(zones) : emptyTableState();
    if (zones)
      this.replayedBoard.battlefield = zones.battlefield.map(
        (permanent): BoardPermanent => ({
          name: permanent.card.logName,
          tapped: permanent.tapped,
          counters: permanent.counters,
          isToken: permanent.token,
          ...(permanent.card.tokenFace
            ? { token: permanent.card.tokenFace }
            : {}),
        }),
      );
  }

  /** A recorder that goes on from the same point, for a copy of the game that may replace the game. The copy has
   *  its own permanents: `permanentsOfCopy[i]` is the copy of `permanents[i]`. */
  copy(permanents: Permanent[], permanentsOfCopy: Permanent[]): MoveRecorder {
    const copy = new MoveRecorder(null);
    const state = this.lastState;
    const statesOfCopies = new Map<Permanent, PermanentState>();
    permanents.forEach((permanent, index) => {
      const permanentState = state.permanents.get(permanent);
      if (permanentState)
        statesOfCopies.set(permanentsOfCopy[index], permanentState);
    });
    copy.lastState = {
      permanents: statesOfCopies,
      tokens: copyOfCounts(state.tokens),
      cardsInZone: {
        library: copyOfCounts(state.cardsInZone.library),
        hand: copyOfCounts(state.cardsInZone.hand),
        battlefield: copyOfCounts(state.cardsInZone.battlefield),
        graveyard: copyOfCounts(state.cardsInZone.graveyard),
        exile: copyOfCounts(state.cardsInZone.exile),
        commandZone: copyOfCounts(state.cardsInZone.commandZone),
      },
    };
    copy.cardsOnTheirWay = this.cardsOnTheirWay.slice();
    copy.recordedMoves = this.recordedMoves.slice();
    copy.replayedBoard = {
      ...emptyPlayerBoard(),
      battlefield: this.replayedBoard.battlefield.map((permanent) => ({
        ...permanent,
      })),
    };
    return copy;
  }

  /**
   * The game took a permanent off the battlefield. If the log has it as tapped it is untapped first: a log tells
   * permanents apart by name only, so whoever replays it takes an untapped one off the battlefield (see applyMove
   * in shared/game-log-board.ts), and the number of tapped ones stays right.
   */
  notePermanentLeft(permanent: Permanent): void {
    if (this.lastState.permanents.get(permanent)?.isTapped)
      this.recordedMoves.push({
        card: logKeyOf(permanent.card),
        fromZone: 'battlefield',
        toZone: 'battlefield',
        otherAction: 'untapped',
      });
    this.lastState.permanents.delete(permanent);
    this.noteCardLeft(permanent.card, 'battlefield', permanent.token);
  }

  /** A permanent went to another player's battlefield (a change of control). A token is written as gone, as it
   *  comes from nowhere on the other side. */
  notePermanentGivenAway(permanent: Permanent): void {
    this.notePermanentLeft(permanent);
    if (!permanent.token) this.noteCardGivenAway(permanent.card);
  }

  /** A card on its way (it left a zone) went to another player: a stolen card that died goes to its owner. */
  noteCardGivenAway(cardDef: CardDef): void {
    const card = logKeyOf(cardDef);
    const fromZone = this.takeCardOnItsWay(card);
    this.recordedMoves.push({ card, fromZone, toZone: OTHER_PLAYER_ZONE });
  }

  /** A card of ours (or a permanent we now control) came from another player into a zone of ours. */
  noteCardFromOtherPlayer(cardDef: CardDef, toZone: CardZone): void {
    const card = logKeyOf(cardDef);
    addToCount(this.lastState.cardsInZone[toZone], card, 1);
    this.recordedMoves.push({ card, fromZone: OTHER_PLAYER_ZONE, toZone });
  }

  /** The game took a card out of a zone. A token that leaves the battlefield is gone. */
  noteCardLeft(cardDef: CardDef, fromZone: CardZone, isToken = false): void {
    const card = logKeyOf(cardDef);
    if (isToken) {
      addToCount(this.lastState.tokens, card, -1);
      this.recordedMoves.push({ card, fromZone, toZone: TOKEN_ZONE });
      return;
    }
    addToCount(this.lastState.cardsInZone[fromZone], card, -1);
    this.cardsOnTheirWay.push({ card, fromZone, wasRecorded: true });
  }

  /** The game put a card into a zone. A token comes from nowhere. */
  noteCardArrived(cardDef: CardDef, toZone: CardZone, isToken = false): void {
    const card = logKeyOf(cardDef);
    if (isToken) {
      addToCount(this.lastState.tokens, card, 1);
      this.recordedMoves.push({ card, fromZone: TOKEN_ZONE, toZone });
      return;
    }
    addToCount(this.lastState.cardsInZone[toZone], card, 1);
    const fromZone = this.takeCardOnItsWay(card);
    if (fromZone !== toZone)
      this.recordedMoves.push({ card, fromZone, toZone });
  }

  /**
   * The moves since the last call. Each move gets `player` as its owner.
   * settleCardsOnTheirWay: write the cards that left a zone and went nowhere as moved to exile (at the end of a turn).
   */
  collectMoves(
    zones: TableZones,
    player: number,
    settleCardsOnTheirWay: boolean,
  ): CardMove[] {
    const before = this.lastState;
    const after = readTableState(zones);
    this.lastState = after;
    // what the game did not report shows as a difference between the table we kept up to date and the real one
    const foundByComparing = [
      ...this.zoneChanges(before, after),
      ...tokenChanges(before, after),
    ];
    this.unrecordedChanges.push(...foundByComparing.map(describeAction));
    const actions = [
      ...this.takeRecordedMoves(),
      ...untapsOfPermanentsThatLeft(before, after),
      ...foundByComparing,
      ...(settleCardsOnTheirWay ? this.settleCardsOnTheirWay() : []),
      ...permanentChanges(before, after),
    ];
    const moves = actions.map(([card, action]) =>
      cardMoveOf(player, card, action),
    );
    for (const move of moves) applyMove(this.replayedBoard, move);
    for (const [card, action] of this.correctionsForReplay(after))
      moves.push(cardMoveOf(player, card, action));
    return moves;
  }

  /** Lines that make a replay of the log end with the real permanents. A replay applies "tapped" and "counter"
   *  lines to the first permanent of that name that they change, so identical tokens that differ in tapped state
   *  and counters can end up with the right states on the wrong tokens. A log tells permanents apart by name only,
   *  so what has to be right per name is how many are tapped and the counters in all (see the board test).
   *  Nothing is added when the replay already has them right. */
  private correctionsForReplay(after: TableState): CardAction[] {
    const wanted = new Map<string, { tapped: number; counters: number }>();
    for (const [permanent, state] of after.permanents) {
      const name = logKeyOf(permanent.card);
      const total = wanted.get(name) ?? { tapped: 0, counters: 0 };
      total.tapped += state.isTapped ? 1 : 0;
      total.counters += state.counters;
      wanted.set(name, total);
    }
    const corrections: CardAction[] = [];
    for (const [name, target] of wanted) {
      const replayed = this.replayedBoard.battlefield.filter(
        (permanent) =>
          describeLoggedCard(permanent.name, permanent.token) === name,
      );
      for (let attempt = 0; attempt < 40; attempt++) {
        const tappedNow = replayed.filter((permanent) => permanent.tapped);
        const countersNow = replayed.reduce(
          (total, permanent) => total + permanent.counters,
          0,
        );
        let action: string | null = null;
        if (tappedNow.length !== target.tapped)
          action = tappedNow.length < target.tapped ? 'tapped' : 'untapped';
        else if (countersNow !== target.counters)
          action = counterActionFor(replayed, target.counters - countersNow);
        if (action === null) break;
        applyMove(this.replayedBoard, cardMoveOf(0, name, action));
        corrections.push([name, action]);
      }
    }
    return corrections;
  }

  /** The reported zone changes since the last call, in the order they happened. */
  private takeRecordedMoves(): CardAction[] {
    const actions = this.recordedMoves.map((move): CardAction => [
      move.card,
      move.otherAction ??
        `moved ${move.fromZone ?? UNKNOWN_ZONE} => ${move.toZone}`,
    ]);
    this.recordedMoves = [];
    return actions;
  }

  /** A reported arrival of this card that does not know yet where the card came from. */
  private arrivalWithoutOrigin(card: string): RecordedMove | undefined {
    return this.recordedMoves.find(
      (move) =>
        move.card === card && move.fromZone === null && !move.otherAction,
    );
  }

  /** Cards that left one zone and showed up in another. */
  private zoneChanges(before: TableState, after: TableState): CardAction[] {
    const actions: CardAction[] = [];
    const allNames = namesIn(
      ...CARD_ZONES.map((zone) => before.cardsInZone[zone]),
      ...CARD_ZONES.map((zone) => after.cardsInZone[zone]),
    );
    for (const card of allNames) {
      const zonesLeft: CardZone[] = [];
      const zonesEntered: CardZone[] = [];
      for (const zone of CARD_ZONES) {
        const change =
          (after.cardsInZone[zone].get(card) ?? 0) -
          (before.cardsInZone[zone].get(card) ?? 0);
        for (let i = 0; i < -change; i++) zonesLeft.push(zone);
        for (let i = 0; i < change; i++) zonesEntered.push(zone);
      }
      for (const toZone of zonesEntered) {
        const fromZone =
          zonesLeft.shift() ?? this.takeCardOnItsWay(card) ?? UNKNOWN_ZONE;
        if (fromZone !== toZone)
          actions.push([card, `moved ${fromZone} => ${toZone}`]);
      }
      for (const fromZone of zonesLeft) {
        // the game reported where the card went but not where it came from: now we know
        const arrival = this.arrivalWithoutOrigin(card);
        if (arrival) {
          arrival.fromZone = fromZone;
          this.unrecordedChanges.push(`${card}; left ${fromZone}`);
        } else
          this.cardsOnTheirWay.push({ card, fromZone, wasRecorded: false });
      }
    }
    return actions;
  }

  private takeCardOnItsWay(card: string): CardZone | null {
    const index = this.cardsOnTheirWay.findIndex(
      (onItsWay) => onItsWay.card === card,
    );
    if (index < 0) return null;
    return this.cardsOnTheirWay.splice(index, 1)[0].fromZone;
  }

  private settleCardsOnTheirWay(): CardAction[] {
    const settled = this.cardsOnTheirWay.filter(
      (onItsWay) => onItsWay.fromZone !== UNKNOWN_ZONE,
    );
    const actionOf = (onItsWay: CardOnItsWay): CardAction => [
      onItsWay.card,
      `moved ${onItsWay.fromZone} => ${UNKNOWN_ZONE}`,
    ];
    this.unrecordedChanges.push(
      ...settled
        .filter((onItsWay) => !onItsWay.wasRecorded)
        .map((onItsWay) => describeAction(actionOf(onItsWay))),
    );
    this.cardsOnTheirWay = [];
    return settled.map(actionOf);
  }
}

/** A card name and what happened to it. */
type CardAction = [string, string];

const describeAction = ([card, action]: CardAction) => `${card}; ${action}`;

function tokenChanges(before: TableState, after: TableState): CardAction[] {
  const actions: CardAction[] = [];
  for (const token of namesIn(before.tokens, after.tokens)) {
    const change =
      (after.tokens.get(token) ?? 0) - (before.tokens.get(token) ?? 0);
    for (let i = 0; i < change; i++)
      actions.push([token, `moved ${TOKEN_ZONE} => battlefield`]);
    for (let i = 0; i < -change; i++)
      actions.push([token, `moved battlefield => ${TOKEN_ZONE}`]);
  }
  return actions;
}

/** Tapped permanents that left the battlefield without the game saying so: untapped first (see notePermanentLeft). */
function untapsOfPermanentsThatLeft(
  before: TableState,
  after: TableState,
): CardAction[] {
  const actions: CardAction[] = [];
  for (const [permanent, earlier] of before.permanents)
    if (earlier.isTapped && !after.permanents.has(permanent))
      actions.push([logKeyOf(permanent.card), 'untapped']);
  return actions;
}

/** Permanents that were tapped or untapped, or whose +1/+1 counters changed. A permanent that is new and tapped
 *  counts as tapped, as in a real log. */
function permanentChanges(before: TableState, after: TableState): CardAction[] {
  const actions: CardAction[] = [];
  for (const [permanent, now] of after.permanents) {
    const name = logKeyOf(permanent.card);
    const earlier = before.permanents.get(permanent) ?? {
      isTapped: false,
      counters: 0,
    };
    if (now.isTapped !== earlier.isTapped)
      actions.push([name, now.isTapped ? 'tapped' : 'untapped']);
    if (now.counters !== earlier.counters)
      actions.push([name, `counter:${PLUS_ONE_COUNTER}=${now.counters}`]);
  }
  return actions;
}

function emptyPlayerBoard(): PlayerBoard {
  return {
    hand: [],
    battlefield: [],
    graveyard: [],
    exile: [],
    commandZone: [],
    librarySize: 0,
    life: null,
    playerCounters: {},
    pool: '',
  };
}

/** A counter line that changes the counters of the permanents by `change` in all. A replay sets the first permanent
 *  whose counters differ, so we look for the permanent that line will hit. */
function counterActionFor(
  permanents: BoardPermanent[],
  change: number,
): string | null {
  for (const permanent of permanents) {
    const counters = permanent.counters + change;
    const hit = permanents.find((other) => other.counters !== counters);
    if (hit === permanent) return `counter:${PLUS_ONE_COUNTER}=${counters}`;
  }
  return null;
}
