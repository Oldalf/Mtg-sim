/**
 * The game viewer's table, as plain functions: where each seat sits, what the chosen line changed (the cards that
 * glow, the life that moved), the marks of the scrub bar and how big a seat's cards can be. Everything comes from the
 * log and its events; nothing here asks the server.
 */
import { playersBySeat } from '../../../../../../shared/game-log-lines';
import type {
  GameEvent,
  GameLog,
} from '../../../../../../shared/game-log-types';
import type { LogTurn, PermanentStack } from './game-steps';

// ================================================================ seats

/** The players (indexes into GameLog.players) on the top and the bottom row of the table. */
export interface SeatRows {
  top: number[];
  bottom: number[];
}

/**
 * Seats keep their place for the whole game and run clockwise, as at a real table: the first half left to right along
 * the top, the rest right to left along the bottom. 3 players sit 2 + 1, 5 sit 3 + 2; one player fills the top row.
 */
export function seatRows(gameLog: GameLog): SeatRows {
  const bySeat = playersBySeat(gameLog);
  const topCount = Math.ceil(bySeat.length / 2);
  return {
    top: bySeat.slice(0, topCount),
    bottom: bySeat.slice(topCount).reverse(),
  };
}

// ================================================================ what the chosen line changed

/** Per player, the cards the event moved or changed (each once): they glow on the board. */
export function changedCardsByPlayer(
  gameLog: GameLog,
  event: GameEvent,
): string[][] {
  return gameLog.players.map((_, player) => [
    ...new Set(
      event.moves
        .filter((move) => move.player === player)
        .map((move) => move.card),
    ),
  ]);
}

/** Per player, the life gained (positive) or lost (negative) on the event; 0 for the first event. */
export function lifeChanges(gameLog: GameLog, eventIndex: number): number[] {
  const event = gameLog.events[eventIndex];
  const eventBefore = gameLog.events[eventIndex - 1] ?? event;
  return gameLog.players.map(
    (_, player) => (event.life[player] ?? 0) - (eventBefore.life[player] ?? 0),
  );
}

export interface GoldfishOpponent {
  life: number;
  poison: number;
}

/**
 * A goldfish game logs the made-up opponents' life and poison after the player's own: shown so the race to 0 (or
 * to 10 poison) can be watched. Empty in a pod (each player's life and counters are on their seat).
 */
export function goldfishOpponents(
  gameLog: GameLog,
  event: GameEvent,
): GoldfishOpponent[] {
  if (gameLog.players.length !== 1) return [];
  return event.life.slice(1).map((life, slot) => ({
    life,
    poison: event.playerCounters?.[slot + 1]?.poison ?? 0,
  }));
}

// ================================================================ the scrub bar

export interface TurnTick {
  eventIndex: number;
  /** Where on the bar, 0 to 100. */
  percent: number;
  title: string;
  /** The first player's turn: a new round in a pod, every turn in a goldfish game. */
  startsRound: boolean;
}

export interface HighlightMark {
  eventIndex: number;
  percent: number;
}

export interface ScrubMarks {
  turns: TurnTick[];
  highlights: HighlightMark[];
}

/** A tick for each turn's start and a mark for each highlight, as percentages of the game. */
export function scrubMarks(gameLog: GameLog, turns: LogTurn[]): ScrubMarks {
  const lastEvent = Math.max(gameLog.events.length - 1, 1);
  const percentOf = (eventIndex: number) => (100 * eventIndex) / lastEvent;
  const firstToPlay = playersBySeat(gameLog)[0];
  const highlights: HighlightMark[] = [];
  gameLog.events.forEach((event, eventIndex) => {
    if (event.isHighlight)
      highlights.push({ eventIndex, percent: percentOf(eventIndex) });
  });
  return {
    turns: turns.map((turn) => ({
      eventIndex: turn.firstEvent,
      percent: percentOf(turn.firstEvent),
      title: turn.title,
      startsRound: gameLog.events[turn.firstEvent].activePlayer === firstToPlay,
    })),
    highlights,
  };
}

// ================================================================ a seat's cards

/** How a seat lays out its permanents (lands apart): the seat's style sizes the cards from this. */
export interface PermanentGrid {
  rows: number;
  perRow: number;
}

/** A rough fit: more permanents, more rows (up to 3), so a big board shrinks its cards instead of scrolling. */
export function permanentGrid(stackCount: number): PermanentGrid {
  const stacks = Math.max(stackCount, 1);
  const rows = stacks <= 6 ? 1 : stacks <= 16 ? 2 : 3;
  return { rows, perRow: Math.ceil(stacks / rows) };
}

/** How many lands a seat has, and how many of them are untapped. */
export function countLands(lands: PermanentStack[]): {
  total: number;
  untapped: number;
} {
  let total = 0;
  let untapped = 0;
  for (const stack of lands) {
    total += stack.count;
    if (!stack.permanent.tapped) untapped += stack.count;
  }
  return { total, untapped };
}
