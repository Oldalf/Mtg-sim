/**
 * What happens to the logs of a run once its games are played: the games are tagged, the index is written, and
 * every tagged game is saved as readable text. Nothing here prints (the command line and, later, the web page do).
 */
import * as path from 'path';
import { GameLog } from './game-log';
import {
  GameIndexRow,
  RunInfo,
  readGame,
  readRunInfo,
  writeIndex,
  writeTaggedGame,
} from './game-log-files';
import { tagGoldfishGames, tagPodGames } from './game-log-tags';
import { formatGameLog, GameLogTextOptions } from './game-log-text';
import { describePodResult } from './pod-report';
import { KillTurns } from './runner';

/** The list under a report shows this many games of a tag in full; the others only by seed. */
const GAMES_LISTED_PER_TAG = 2;

/** A game worth a look: one tag of one game, and the text file it was saved to. */
export interface TaggedGame {
  tag: string;
  seed: number;
  result: string;
  file: string;
}

/** A finished run: its folder and its tagged games. */
export interface LoggedRun {
  runFolder: string;
  gameCount: number;
  taggedGames: TaggedGame[];
}

/** The two kill turns of a goldfish game in words: "win turn 9, 1st dead turn 8", "no win, 1st dead turn 10". */
export function describeKillTurns(
  killTurns: KillTurns,
  killTurnNames: [string, string],
): string {
  return killTurns
    .map((turn, index) =>
      turn === null
        ? `no ${killTurnNames[index]}`
        : `${killTurnNames[index]} turn ${turn}`,
    )
    .join(', ');
}

/** How a game of a run ended, in a few words. */
export function describeGameResult(
  runInfo: RunInfo,
  row: GameIndexRow,
): string {
  if (row.error !== undefined)
    return `simulator bug: ${row.error.split('\n')[0]}`;
  if (row.pod && runInfo.pod) return describePodResult(runInfo.pod, row.pod);
  if (row.killTurns && runInfo.killTurnNames)
    return describeKillTurns(row.killTurns, runInfo.killTurnNames);
  return '';
}

/** The first line of a game's text: what the game was and how it ended. */
export function gameTitle(runInfo: RunInfo, row: GameIndexRow): string {
  const gameName = runInfo.mode === 'pod' ? 'Pod game' : 'Game';
  return `${gameName}, seed ${row.seed}: ${describeGameResult(runInfo, row)}`;
}

/** A game of a run as text for reading. */
export function formatGameOfRun(
  runInfo: RunInfo,
  row: GameIndexRow,
  gameLog: GameLog,
  options: GameLogTextOptions = {},
): string {
  return formatGameLog(gameLog, {
    title: gameTitle(runInfo, row),
    tags: row.tags,
    ...options,
  });
}

/** Tags the games of a run, writes its index and saves each tagged game as text. */
export function finishLoggedRun(
  runFolder: string,
  rows: GameIndexRow[],
): LoggedRun {
  const runInfo = readRunInfo(runFolder);
  rows.sort((first, second) => first.seed - second.seed);
  if (runInfo.mode === 'pod') tagPodGames(rows);
  else tagGoldfishGames(rows);
  writeIndex(runFolder, rows);

  const taggedGames: TaggedGame[] = [];
  for (const row of rows) {
    if (!row.tags.length) continue;
    const text = formatGameOfRun(runInfo, row, readGame(runFolder, row));
    for (const tag of row.tags) {
      const fileName = `${tag}-seed-${String(row.seed).padStart(4, '0')}.txt`;
      taggedGames.push({
        tag,
        seed: row.seed,
        result: describeGameResult(runInfo, row),
        file: writeTaggedGame(runFolder, fileName, text),
      });
    }
  }
  taggedGames.sort(
    (first, second) =>
      first.tag.localeCompare(second.tag) || first.seed - second.seed,
  );
  return { runFolder, gameCount: rows.length, taggedGames };
}

/** The "Games worth a look" list of a run, as lines of text. */
export function describeTaggedGames(
  run: LoggedRun,
  projectFolder: string,
): string[] {
  const runName = path.basename(run.runFolder);
  const lines = [
    `Games worth a look (${runName}, ${run.gameCount} games logged; \`npm run logs\` shows more):`,
  ];
  const tagWidth = Math.max(
    ...run.taggedGames.map((game) => game.tag.length),
    0,
  );
  const tags = [...new Set(run.taggedGames.map((game) => game.tag))];
  for (const tag of tags) {
    const games = run.taggedGames.filter((game) => game.tag === tag);
    for (const game of games.slice(0, GAMES_LISTED_PER_TAG))
      lines.push(
        `  ${tag.padEnd(tagWidth)}  seed ${String(game.seed).padStart(5)}  ${game.result}  ${path.relative(projectFolder, game.file)}`,
      );
    if (games.length > GAMES_LISTED_PER_TAG)
      lines.push(
        `  ${''.padEnd(tagWidth)}  and seeds ${games
          .slice(GAMES_LISTED_PER_TAG)
          .map((game) => game.seed)
          .join(', ')}`,
      );
  }
  return lines;
}
