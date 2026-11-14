/**
 * Tags mark the games of a run that are worth reading: the fastest and slowest wins, a few average ones, games
 * where a win was stopped... They are worked out after the run from the index rows (game-log-files.ts).
 * Each tag is given to at most GAMES_PER_TAG games, lowest seeds first, so the list stays short. Fastest, slowest
 * and most-interaction only go to games that share the extreme value, never to runners-up.
 */
import { GameIndexRow } from './game-log-files';
import { PodGame } from '../../shared/pod-types';

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

/** Gives the tag to the games with the lowest score, and only those: a game just above it is not tagged.
 *  If more than GAMES_PER_TAG tie, the lowest seeds get it. */
function tagLowestScoringGames(
  rows: GameIndexRow[],
  tag: string,
  scoreOf: (row: GameIndexRow) => number,
): void {
  if (!rows.length) return;
  const lowestScore = Math.min(...rows.map(scoreOf));
  tagFirstGames(rows, tag, (row) => scoreOf(row) === lowestScore);
}

function median(numbers: number[]): number | null {
  if (!numbers.length) return null;
  const sorted = numbers.slice().sort((first, second) => first - second);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

/**
 * fastest, slowest and average, by the turn (or round) a game was won in. Fastest and slowest are the games won on
 * the earliest and the latest turn; if those are the same turn no game stands out and neither is given. Average is
 * the median turn, for games that are neither.
 */
function tagByWinTurn(
  rows: GameIndexRow[],
  winTurnOf: (row: GameIndexRow) => number | null,
): void {
  const wonGames = rows.filter((row) => winTurnOf(row) !== null);
  if (!wonGames.length) return;
  const winTurn = (row: GameIndexRow) => winTurnOf(row)!;
  const turns = wonGames.map(winTurn);
  const earliestTurn = Math.min(...turns);
  const latestTurn = Math.max(...turns);
  const hasSpread = earliestTurn < latestTurn;
  const isExtreme = (row: GameIndexRow) =>
    hasSpread && [earliestTurn, latestTurn].includes(winTurn(row));
  if (hasSpread) {
    tagFirstGames(wonGames, 'fastest', (row) => winTurn(row) === earliestTurn);
    tagFirstGames(wonGames, 'slowest', (row) => winTurn(row) === latestTurn);
  }
  const medianTurn = median(turns);
  tagFirstGames(
    wonGames,
    'average',
    (row) => winTurn(row) === medianTurn && !isExtreme(row),
  );
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
  tagLowestScoringGames(
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
