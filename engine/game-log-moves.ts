/**
 * Card moves for the game log, in Archidekt's simple format ("moved hand => battlefield", "tapped", "untapped",
 * "counter:+1 / +1=3").
 *
 * The recorder remembers what a player's table looked like at the last log event. At the next event it compares
 * and writes down the differences. It only reads the game.
 *
 * Limits of comparing: a card that moves twice between two events shows as one move, and the order of the moves
 * inside one event is not known. Cards are told apart by name only.
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
type CardZone = (typeof CARD_ZONES)[number];
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
}

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
  private lastState: TableState;
  private cardsOnTheirWay: CardOnItsWay[] = [];

  /** zones: the table to start from (null = an empty table). */
  constructor(zones: TableZones | null) {
    this.lastState = zones ? readTableState(zones) : emptyTableState();
  }

  /** A recorder that goes on from the same point (for a copy of the game that may replace the game). */
  copy(): MoveRecorder {
    const copy = new MoveRecorder(null);
    copy.lastState = this.lastState; // a state is never changed, only replaced
    copy.cardsOnTheirWay = this.cardsOnTheirWay.slice();
    return copy;
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
    const actions = [
      ...this.zoneChanges(before, after),
      ...(settleCardsOnTheirWay ? this.settleCardsOnTheirWay() : []),
      ...tokenChanges(before, after),
      ...tapChanges(before, after),
      ...counterChanges(before, after),
    ];
    return actions.map(([card, action]) => ({ player, card, action }));
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
      for (const fromZone of zonesLeft)
        this.cardsOnTheirWay.push({ card, fromZone });
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
    const actions = this.cardsOnTheirWay
      .filter((onItsWay) => onItsWay.fromZone !== UNKNOWN_ZONE)
      .map((onItsWay): CardAction => [
        onItsWay.card,
        `moved ${onItsWay.fromZone} => ${UNKNOWN_ZONE}`,
      ]);
    this.cardsOnTheirWay = [];
    return actions;
  }
}

/** A card name and what happened to it. */
type CardAction = [string, string];

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
