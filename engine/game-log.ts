/**
 * The log of one game, as data. A goldfish game and a pod game share this format (a goldfish game has one player),
 * and a real Archidekt log can be loaded into it too. Text for reading is made from it by game-log-text.ts.
 *
 * A game is a list of events. An event is one readable line ("cast Gray Merchant of Asphodel") plus the card moves
 * it caused, each written as a line of Archidekt's simple format ("moved hand => battlefield", "tapped").
 */
import { CardDef } from './cards';
import type {
  CardMove,
  EventKind,
  GameEvent,
  GameLog,
  LogPlayer,
} from './game-log-types';

export type { CardMove, EventKind, GameEvent, GameLog, LogPlayer };

const HIGHLIGHT_KINDS: ReadonlySet<EventKind> = new Set([
  'answer',
  'out',
  'win',
]);

/** The names of the cards among the parts of a log line (cards and lists of cards; plain text is not searched). */
export function cardNamesAmong(parts: unknown[]): string[] {
  const names: string[] = [];
  for (const part of parts) {
    if (part instanceof CardDef) names.push(part.name);
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
): GameEvent {
  return {
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
