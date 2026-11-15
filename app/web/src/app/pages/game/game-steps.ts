/**
 * The game viewer's view of a log, as plain functions: the lines grouped by turn, and where each step (line,
 * highlight, turn) goes. A position in the game is an event's index in GameLog.events; the board shown is the
 * board after that event.
 */
import {
  describeEventText,
  describeTokenFace,
  type BoardPermanent,
  type PlayerBoard,
} from '../../../../../../shared/game-log-board';
import {
  isPodGame,
  namesItsPlayer,
  startsNewTurn,
} from '../../../../../../shared/game-log-lines';
import type {
  GameEvent,
  GameLog,
} from '../../../../../../shared/game-log-types';

/** A line of the log: one event with text. */
export interface LogLine {
  eventIndex: number;
  /** The acting player's name when the line names it (a pod line on another player's turn), else empty. */
  playerName: string;
  text: string;
  isHighlight: boolean;
  /** The card moves of the event, as `--moves` shows them ("gale; Island; moved hand => battlefield"). */
  moves: string[];
}

/** A turn of the log; in a pod, one player's turn of a round. */
export interface LogTurn {
  /** "Turn 3", or "Round 3, meren" in a pod. */
  title: string;
  /** The event that starts the turn: choosing the turn's title goes there. */
  firstEvent: number;
  lastEvent: number;
  lines: LogLine[];
}

function turnTitle(gameLog: GameLog, event: GameEvent): string {
  return isPodGame(gameLog)
    ? `Round ${event.turn}, ${gameLog.players[event.activePlayer].name}`
    : `Turn ${event.turn}`;
}

function movesOf(gameLog: GameLog, event: GameEvent): string[] {
  return event.moves.map((move) => {
    const owner = isPodGame(gameLog)
      ? `${gameLog.players[move.player].name}; `
      : '';
    return `${owner}${move.card}; ${move.action}`;
  });
}

/** The log's lines grouped by turn, as the text log shows them (an event without text is only its turn's start). */
export function turnsOfGame(gameLog: GameLog): LogTurn[] {
  const turns: LogTurn[] = [];
  gameLog.events.forEach((event, eventIndex) => {
    if (startsNewTurn(event, gameLog.events[eventIndex - 1]))
      turns.push({
        title: turnTitle(gameLog, event),
        firstEvent: eventIndex,
        lastEvent: eventIndex,
        lines: [],
      });
    const turn = turns[turns.length - 1];
    turn.lastEvent = eventIndex;
    if (event.text === '') return;
    turn.lines.push({
      eventIndex,
      playerName: namesItsPlayer(gameLog, event)
        ? gameLog.players[event.player].name
        : '',
      text: describeEventText(event),
      isHighlight: event.isHighlight,
      moves: movesOf(gameLog, event),
    });
  });
  return turns;
}

// ================================================================ steps

export function nextEvent(gameLog: GameLog, eventIndex: number): number {
  return Math.min(eventIndex + 1, gameLog.events.length - 1);
}

export function previousEvent(eventIndex: number): number {
  return Math.max(eventIndex - 1, 0);
}

/** The next highlight after the event; the event itself when there is none. */
export function nextHighlight(gameLog: GameLog, eventIndex: number): number {
  const found = gameLog.events.findIndex(
    (event, index) => index > eventIndex && event.isHighlight,
  );
  return found < 0 ? eventIndex : found;
}

/** The highlight before the event; the event itself when there is none. */
export function previousHighlight(
  gameLog: GameLog,
  eventIndex: number,
): number {
  for (let index = eventIndex - 1; index >= 0; index--)
    if (gameLog.events[index].isHighlight) return index;
  return eventIndex;
}

function turnIndexOf(turns: LogTurn[], eventIndex: number): number {
  return turns.findIndex((turn) => eventIndex <= turn.lastEvent);
}

/** The start of the next turn; the last event when this is the last turn. */
export function nextTurn(turns: LogTurn[], eventIndex: number): number {
  const turn = turns[turnIndexOf(turns, eventIndex) + 1];
  return turn ? turn.firstEvent : turns[turns.length - 1].lastEvent;
}

/** The start of this turn, or of the turn before when already at the start (as a music player's "previous"). */
export function previousTurn(turns: LogTurn[], eventIndex: number): number {
  const turnIndex = turnIndexOf(turns, eventIndex);
  const turn = turns[turnIndex];
  if (eventIndex > turn.firstEvent || turnIndex === 0) return turn.firstEvent;
  return turns[turnIndex - 1].firstEvent;
}

// ================================================================ autoplay

export type AutoplaySpeed = 'slow' | 'normal' | 'fast';

export const AUTOPLAY_SPEEDS: AutoplaySpeed[] = ['slow', 'normal', 'fast'];

const SPEED_FACTOR: Record<AutoplaySpeed, number> = {
  slow: 1.75,
  normal: 1,
  fast: 0.5,
};

const BASE_MILLISECONDS = 1200;
const HIGHLIGHT_MILLISECONDS = 2500;
const TURN_START_MILLISECONDS = 2000;

/** How long autoplay stays on a line: longer for a highlight and for the first line of a turn. */
export function autoplayDelay(
  event: GameEvent,
  startsTurn: boolean,
  speed: AutoplaySpeed,
): number {
  const normalDelay = event.isHighlight
    ? HIGHLIGHT_MILLISECONDS
    : startsTurn
      ? TURN_START_MILLISECONDS
      : BASE_MILLISECONDS;
  return normalDelay * SPEED_FACTOR[speed];
}

/** The speed kept from the last visit; anything unknown (or nothing kept) is normal. */
export function speedFromStored(stored: string | null): AutoplaySpeed {
  return AUTOPLAY_SPEEDS.find((speed) => speed === stored) ?? 'normal';
}

// ================================================================ the chosen line in the URL

/**
 * The line in the URL (`?line=`, counted from 1 as the page shows it) as an event index. A missing or out of range
 * line is the first line.
 */
export function eventIndexFromLine(
  line: string | null,
  eventCount: number,
): number {
  const lineNumber = Number(line);
  if (
    !Number.isInteger(lineNumber) ||
    lineNumber < 1 ||
    lineNumber > eventCount
  )
    return 0;
  return lineNumber - 1;
}

// ================================================================ what is shown

const MOVE_BETWEEN_ZONES = /^moved (\w+) => (\w+)$/;

/**
 * The cards of an event: those named in its line, then those it moved, each once. A card that ends the line where
 * it started (the hand put back for a mulligan) is left out, unless the line names it.
 */
export function cardsOfEvent(event: GameEvent): string[] {
  return [...new Set([...event.cards, ...cardsMovedForGood(event)])];
}

/** The cards an event moved, without those whose moves cancel out (as many arrivals as departures in every zone). */
function cardsMovedForGood(event: GameEvent): string[] {
  const countChanges = new Map<string, Map<string, number>>();
  const changeCount = (card: string, zone: string, change: number) => {
    const countsOfCard = countChanges.get(card) ?? new Map<string, number>();
    countsOfCard.set(zone, (countsOfCard.get(zone) ?? 0) + change);
    countChanges.set(card, countsOfCard);
  };
  const otherChanges: string[] = [];
  for (const move of event.moves) {
    const zones = MOVE_BETWEEN_ZONES.exec(move.action);
    if (!zones) {
      // tapped, counters...: the card changed, so it is shown
      otherChanges.push(move.card);
      continue;
    }
    const [, fromZone, toZone] = zones;
    changeCount(move.card, fromZone, -1);
    changeCount(move.card, toZone, +1);
  }
  return event.moves
    .map((move) => move.card)
    .filter(
      (card) =>
        otherChanges.includes(card) ||
        [...(countChanges.get(card)?.values() ?? [])].some(
          (change) => change !== 0,
        ),
    );
}

/** Every card name in a game: what the viewer asks the card facts for. */
export function cardNamesOfGame(gameLog: GameLog): string[] {
  const names = new Set<string>();
  for (const player of gameLog.players)
    for (const commander of player.commanders) names.add(commander);
  for (const event of gameLog.events) {
    for (const card of event.cards) names.add(card);
    for (const move of event.moves) names.add(move.card);
  }
  return [...names].sort();
}

/** Permanents that look alike (name, tapped, counters, token) shown once with how many there are. */
export interface PermanentStack {
  permanent: BoardPermanent;
  count: number;
}

/** The battlefield as stacks of alike permanents, in the order they came. */
export function stackPermanents(
  permanents: BoardPermanent[],
): PermanentStack[] {
  const stacks = new Map<string, PermanentStack>();
  for (const permanent of permanents) {
    const key = [
      permanent.name,
      permanent.tapped,
      permanent.counters,
      permanent.isToken,
      permanent.token ? describeTokenFace(permanent.token) : '',
    ].join('|');
    const stack = stacks.get(key);
    if (stack) stack.count++;
    else stacks.set(key, { permanent, count: 1 });
  }
  return [...stacks.values()];
}

/** A player's battlefield split into lands and the rest. `isLand` knows the card data. */
export function splitBattlefield(
  board: PlayerBoard,
  isLand: (cardName: string) => boolean,
): { lands: PermanentStack[]; others: PermanentStack[] } {
  const isLandPermanent = (permanent: BoardPermanent) =>
    !permanent.isToken && isLand(permanent.name);
  return {
    lands: stackPermanents(board.battlefield.filter(isLandPermanent)),
    others: stackPermanents(
      board.battlefield.filter((permanent) => !isLandPermanent(permanent)),
    ),
  };
}
