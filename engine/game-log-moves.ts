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
 * Cards are told apart by name only. The recorder only reads the game.
 */
import { CardDef } from './cards';
import { CardMove } from './game-log';
import { Permanent } from './game-types';

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
/** Where a card is written to when it left every zone the engine keeps (a deck dropped it), and where it is
 *  written from when it shows up out of nowhere. */
const UNKNOWN_ZONE: CardZone = 'exile';
const PLUS_ONE_COUNTER = '+1 / +1';

type CountByName = Map<string, number>;

/** What a player's table looks like at one moment, by card name. */
interface TableState {
  cardsInZone: Record<CardZone, CountByName>;
  tokens: CountByName;
  /** Permanents (cards and tokens) with that name that are tapped, and that are untapped. */
  tapped: CountByName;
  untapped: CountByName;
  /** The +1/+1 counters of each permanent with that name, lowest first. */
  counters: Map<string, number[]>;
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
  for (const card of cards) addOne(counts, card.name);
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
    tapped: new Map(),
    untapped: new Map(),
    counters: new Map(),
  };
  for (const permanent of zones.battlefield) {
    const name = permanent.card.name;
    addOne(
      permanent.token ? state.tokens : state.cardsInZone.battlefield,
      name,
    );
    addOne(permanent.tapped ? state.tapped : state.untapped, name);
    const counters = state.counters.get(name);
    if (counters) counters.push(permanent.counters);
    else state.counters.set(name, [permanent.counters]);
  }
  for (const counters of state.counters.values())
    counters.sort((first, second) => first - second);
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

/** The values of `after` that `before` does not have (both sorted, with repeats). */
function valuesAdded(before: number[], after: number[]): number[] {
  const unmatched = before.slice();
  const added: number[] = [];
  for (const value of after) {
    const index = unmatched.indexOf(value);
    if (index >= 0) unmatched.splice(index, 1);
    else added.push(value);
  }
  return added;
}

export class MoveRecorder {
  /** The table at the last log event, kept up to date with the zone changes the game reports. */
  private lastState: TableState;
  private cardsOnTheirWay: CardOnItsWay[] = [];
  private recordedMoves: RecordedMove[] = [];
  /** Zone changes that were found by comparing, not reported by the game ("Swamp; moved hand => battlefield").
   *  Whoever reads them empties the list. */
  unrecordedChanges: string[] = [];

  /** zones: the table to start from (null = an empty table). */
  constructor(zones: TableZones | null) {
    this.lastState = zones ? readTableState(zones) : emptyTableState();
  }

  /** A recorder that goes on from the same point (for a copy of the game that may replace the game). */
  copy(): MoveRecorder {
    const copy = new MoveRecorder(null);
    const state = this.lastState;
    copy.lastState = {
      ...state, // tapped, untapped and counters are never changed, only replaced
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
    return copy;
  }

  /** The game took a card out of a zone. A token that leaves the battlefield is gone. */
  noteCardLeft(card: string, fromZone: CardZone, isToken = false): void {
    if (isToken) {
      addToCount(this.lastState.tokens, card, -1);
      this.recordedMoves.push({ card, fromZone, toZone: TOKEN_ZONE });
      return;
    }
    addToCount(this.lastState.cardsInZone[fromZone], card, -1);
    this.cardsOnTheirWay.push({ card, fromZone, wasRecorded: true });
  }

  /** The game put a card into a zone. A token comes from nowhere. */
  noteCardArrived(card: string, toZone: CardZone, isToken = false): void {
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
      ...foundByComparing,
      ...(settleCardsOnTheirWay ? this.settleCardsOnTheirWay() : []),
      ...tapChanges(before, after),
      ...counterChanges(before, after),
    ];
    return actions.map(([card, action]) => ({ player, card, action }));
  }

  /** The reported zone changes since the last call, in the order they happened. */
  private takeRecordedMoves(): CardAction[] {
    const actions = this.recordedMoves.map((move): CardAction => [
      move.card,
      `moved ${move.fromZone ?? UNKNOWN_ZONE} => ${move.toZone}`,
    ]);
    this.recordedMoves = [];
    return actions;
  }

  /** A reported arrival of this card that does not know yet where the card came from. */
  private arrivalWithoutOrigin(card: string): RecordedMove | undefined {
    return this.recordedMoves.find(
      (move) => move.card === card && move.fromZone === null,
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

/** A permanent counts as tapped (or untapped) when one more with its name is tapped and one fewer is untapped; a
 *  permanent that enters tapped counts as tapped too, as in a real log. */
function tapChanges(before: TableState, after: TableState): CardAction[] {
  const actions: CardAction[] = [];
  for (const name of namesIn(after.tapped, after.untapped)) {
    const moreTapped =
      (after.tapped.get(name) ?? 0) - (before.tapped.get(name) ?? 0);
    const moreUntapped =
      (after.untapped.get(name) ?? 0) - (before.untapped.get(name) ?? 0);
    for (let i = 0; i < moreTapped; i++) actions.push([name, 'tapped']);
    const untappedCount = Math.min(-moreTapped, moreUntapped);
    for (let i = 0; i < untappedCount; i++) actions.push([name, 'untapped']);
  }
  return actions;
}

function counterChanges(before: TableState, after: TableState): CardAction[] {
  const actions: CardAction[] = [];
  for (const [name, countersAfter] of after.counters) {
    const countersBefore = before.counters.get(name) ?? [];
    let newPermanents = countersAfter.length - countersBefore.length;
    for (const counters of valuesAdded(countersBefore, countersAfter)) {
      // a permanent that just entered without counters is not a counter change
      if (counters === 0 && newPermanents > 0) {
        newPermanents--;
        continue;
      }
      actions.push([name, `counter:${PLUS_ONE_COUNTER}=${counters}`]);
    }
  }
  return actions;
}
