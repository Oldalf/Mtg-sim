/**
 * The log of one game, as data. A goldfish game and a pod game share this format (a goldfish game has one player),
 * and a real Archidekt log can be loaded into it too. Text for reading is made from it by game-log-text.ts.
 *
 * A game is a list of events. An event is one readable line ("cast Gray Merchant of Asphodel") plus the card moves
 * it caused, each written as a line of Archidekt's simple format ("moved hand => battlefield", "tapped").
 */
import { CardDef } from './cards';

export type EventKind =
  | 'turn-start'
  | 'land'
  | 'cast'
  | 'attack'
  | 'answer'
  | 'out'
  | 'win'
  | 'turn-end'
  | 'note';

/** One line of Archidekt's simple format, plus whose card it is. */
export interface CardMove {
  player: number;
  card: string;
  /** "moved hand => battlefield" | "tapped" | "untapped" | "counter:+1 / +1=3" */
  action: string;
}

export interface GameEvent {
  /** The turn; in a pod, the round. */
  turn: number;
  /** Who does it (index into GameLog.players). In a pod this can differ from whose turn it is. */
  player: number;
  /** Whose turn it is. */
  activePlayer: number;
  kind: EventKind;
  /** The readable line, e.g. "cast Gray Merchant of Asphodel". Empty for a turn start. */
  text: string;
  /** The card names in the line. */
  cards: string[];
  /** Worth jumping to: a win attempt, a counterspell, removal, a wipe, a player out, the win. */
  isHighlight: boolean;
  /** What changed on the table with this event: the changes found when it was logged, and the ones up to the
   *  next action of the turn. */
  moves: CardMove[];
  /** Every player's life after the event (goldfish: ours, then the opponents'). */
  life: number[];
}

export interface LogPlayer {
  /** The deck name, "gale#2" when a deck is in the pod twice. */
  name: string;
  deckName: string;
  commanders: string[];
  /** 0 = first to play. */
  seat: number;
}

export interface GameLog {
  seed: number;
  /** A goldfish game has one player. */
  players: LogPlayer[];
  events: GameEvent[];
}

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
  events: GameEvent[],
): GameLog {
  return {
    seed,
    players: [{ name: deckName, deckName, commanders, seat: 0 }],
    events,
  };
}
