/**
 * The shapes of a game's log (see game-log.ts), as plain types. No Node code and no engine code here, so the app's page
 * can import them too (app/api-types.ts).
 */

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
  /** The turn; in a pod, the round. 0 = before the first turn (the opening hand). */
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
  /** The cards in the library before the opening hand is drawn. */
  librarySize: number;
}

export interface GameLog {
  seed: number;
  /** A goldfish game has one player. */
  players: LogPlayer[];
  events: GameEvent[];
}
