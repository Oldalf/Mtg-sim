/**
 * The log of one game, as data. A goldfish game and a pod game share this format (a goldfish game has one player),
 * and a real Archidekt log can be loaded into it too. Text for reading is made from it by game-log-text.ts.
 *
 * A game is a list of events. An event is one readable line ("cast Gray Merchant of Asphodel") plus the card moves
 * it caused, each written as a line of Archidekt's simple format ("moved hand => battlefield", "tapped").
 */
import { CardDef } from '../cards/cards';
import type {
  CardMove,
  EventKind,
  GameEvent,
  GameLog,
  LogPlayer,
  PlayerCounters,
} from '../../shared/game-log-types';
import { PLAYER_COUNTER_KINDS } from '../../shared/game-log-types';

export type {
  CardMove,
  EventKind,
  GameEvent,
  GameLog,
  LogPlayer,
  PlayerCounters,
};

const HIGHLIGHT_KINDS: ReadonlySet<EventKind> = new Set([
  'answer',
  'out',
  'win',
]);

/** The names of the cards among the parts of a log line (cards and lists of cards; plain text is not searched). */
export function cardNamesAmong(parts: unknown[]): string[] {
  const names: string[] = [];
  for (const part of parts) {
    if (part instanceof CardDef) names.push(part.logName);
    else if (Array.isArray(part)) names.push(...cardNamesAmong(part));
  }
  return names;
}

/** A new event by player 0 on its own turn. A pod sets the players when it copies the event into its own log. */
export function buildEvent(
  kind: EventKind,
  turn: number,
  text: string,
  cards: string[],
  life: number[],
  playerCounters: PlayerCounters[] = [],
): GameEvent {
  const event: GameEvent = {
    turn,
    player: 0,
    activePlayer: 0,
    kind,
    text,
    cards,
    isHighlight: HIGHLIGHT_KINDS.has(kind),
    moves: [],
    life,
  };
  setPlayerCounters(event, playerCounters);
  return event;
}

/** Puts the players' counters on the event, only the ones above 0; none at all when every count is 0 (so a log
 *  without counters stays as it was). */
export function setPlayerCounters(
  event: GameEvent,
  playerCounters: PlayerCounters[],
): void {
  const countersAboveZero = playerCounters.map((counters) => {
    const kept: PlayerCounters = {};
    for (const kind of PLAYER_COUNTER_KINDS)
      if (counters[kind]) kept[kind] = counters[kind];
    return kept;
  });
  if (countersAboveZero.some((counters) => Object.keys(counters).length))
    event.playerCounters = countersAboveZero;
  else delete event.playerCounters;
}

/** The log of a goldfish game: one player. */
export function goldfishGameLog(
  seed: number,
  deckName: string,
  commanders: string[],
  librarySize: number,
  events: GameEvent[],
): GameLog {
  return {
    seed,
    players: [{ name: deckName, deckName, commanders, seat: 0, librarySize }],
    events,
  };
}
