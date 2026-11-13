/**
 * Tags mark the games of a run that are worth reading: the fastest and slowest wins, a few average ones, games
 * where a win was stopped... They are worked out after the run from the index rows (game-log-files.ts).
 * Each tag is given to at most GAMES_PER_TAG games, lowest seeds first, so the list stays short.
 */
import { GameIndexRow } from './game-log-files';
import { PodGame } from './pod-types';

const GAMES_PER_TAG = 5;

const sum = (numbers: number[]) =>
  numbers.reduce((total, value) => total + value, 0);

const bySeed = (first: GameIndexRow, second: GameIndexRow) =>
  first.seed - second.seed;

/** Gives the tag to the first few games (by seed) that match. */
function tagFirstGames(
  rows: GameIndexRow[],
  tag: string,
  matches: (row: GameIndexRow) => boolean,
): void {
  const matching = rows.filter(matches).sort(bySeed);
  for (const row of matching.slice(0, GAMES_PER_TAG)) row.tags.push(tag);
}

/** Gives the tag to the few games with the lowest score (ties: lowest seeds first). */
function tagLowestGames(
  rows: GameIndexRow[],
  tag: string,
  scoreOf: (row: GameIndexRow) => number,
): void {
  const sorted = rows
    .slice()
    .sort(
      (first, second) =>
        scoreOf(first) - scoreOf(second) || bySeed(first, second),
    );
  for (const row of sorted.slice(0, GAMES_PER_TAG)) row.tags.push(tag);
}

function median(numbers: number[]): number | null {
  if (!numbers.length) return null;
  const sorted = numbers.slice().sort((first, second) => first - second);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

/** fastest, slowest and average, by the turn (or round) a game was won in. */
function tagByWinTurn(
  rows: GameIndexRow[],
  winTurnOf: (row: GameIndexRow) => number | null,
): void {
  const wonGames = rows.filter((row) => winTurnOf(row) !== null);
  const winTurn = (row: GameIndexRow) => winTurnOf(row)!;
  tagLowestGames(wonGames, 'fastest', winTurn);
  tagLowestGames(wonGames, 'slowest', (row) => -winTurn(row));
  const medianTurn = median(wonGames.map(winTurn));
  tagFirstGames(wonGames, 'average', (row) => winTurn(row) === medianTurn);
}

const hasNoError = (row: GameIndexRow) => row.error === undefined;

/**
 * Sets the tags of the games of a goldfish run:
 *   fastest / slowest   the earliest and the latest wins
 *   average             the win turn equals the median
 *   no-win              no win within the turns played
 *   error               the game hit a simulator bug (the log up to the crash is kept)
 */
export function tagGoldfishGames(rows: GameIndexRow[]): void {
  for (const row of rows) row.tags = [];
  const finished = rows.filter(hasNoError);
  const winTurnOf = (row: GameIndexRow) => row.killTurns?.[0] ?? null;
  tagByWinTurn(finished, winTurnOf);
  tagFirstGames(finished, 'no-win', (row) => winTurnOf(row) === null);
  tagFirstGames(rows, 'error', (row) => !hasNoError(row));
}

/** How much the players interacted: answers, counterspells and removal. */
function interactionCount(game: PodGame): number {
  return (
    sum(game.answers) +
    sum(game.countered) +
    sum(game.removals) +
    sum(game.removed)
  );
}

/**
 * Sets the tags of the games of a pod run:
 *   fastest / slowest / average   by the round the game was won in
 *   no-winner                     reached the round cap
 *   win-stopped                   a win attempt was answered
 *   most-interaction              the most answers, counters and removal
 *   waited                        a deck held a kill for counter backup
 *   commander-kill / poison / decked   someone went out this way
 *   error                         the game hit a simulator bug
 */
export function tagPodGames(rows: GameIndexRow[]): void {
  for (const row of rows) row.tags = [];
  const finished = rows.filter((row) => hasNoError(row) && row.pod);
  const podOf = (row: GameIndexRow) => row.pod!;
  tagByWinTurn(finished, (row) =>
    podOf(row).winner === null ? null : podOf(row).turn,
  );
  tagFirstGames(finished, 'no-winner', (row) => podOf(row).winner === null);
  tagFirstGames(finished, 'win-stopped', (row) => sum(podOf(row).stopped) > 0);
  tagLowestGames(
    finished.filter((row) => interactionCount(podOf(row)) > 0),
    'most-interaction',
    (row) => -interactionCount(podOf(row)),
  );
  tagFirstGames(finished, 'waited', (row) => sum(podOf(row).waited) > 0);
  const someoneWentOutBy = (reason: string) => (row: GameIndexRow) =>
    podOf(row).why.includes(reason);
  tagFirstGames(finished, 'commander-kill', someoneWentOutBy('commander'));
  tagFirstGames(finished, 'poison', someoneWentOutBy('poison'));
  tagFirstGames(finished, 'decked', someoneWentOutBy('decked'));
  tagFirstGames(rows, 'error', (row) => !hasNoError(row));
}
