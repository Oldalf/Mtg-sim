/**
 * `npm run logs`: read the game logs of the last `sim` or `pod` command (session-logs/). It never clears them.
 *
 *   npm run logs                               the runs of this session, with how many games carry each tag
 *   npm run logs -- 01-meren-decklist          the tagged games of a run (the name may be shortened to its number: 1)
 *   npm run logs -- 1 --seed 412               one game as text (no run given = the latest run)
 *   npm run logs -- 1 --tag average            every game with that tag
 *   npm run logs -- 1 --seed 412 --highlights  only the highlights, with two lines around each
 *   npm run logs -- 1 --seed 412 --moves       with the card moves under each line
 */
import {
  GameIndexRow,
  listRuns,
  readGame,
  readIndex,
  readRunInfo,
  runFolderOf,
} from '../engine/game-log-files';
import { describeGameResult, formatGameOfRun } from '../engine/game-log-run';
import { highlightsOf } from '../engine/game-log-text';
import { Args } from './args';

/** The run asked for: its full name, its number ("1", "01"), or nothing for the latest. */
function findRun(runs: string[], asked: string | undefined): string {
  if (asked === undefined) return runs[runs.length - 1];
  const found = runs.find(
    (name) => name === asked || parseInt(name, 10) === Number(asked),
  );
  if (!found)
    throw new Error(
      `no run ${asked} in session-logs; runs: ${runs.join(', ')}`,
    );
  return found;
}

/** "fastest 5, slowest 5, average 5" */
function describeTagCounts(rows: GameIndexRow[]): string {
  const gamesPerTag = new Map<string, number>();
  for (const row of rows)
    for (const tag of row.tags)
      gamesPerTag.set(tag, (gamesPerTag.get(tag) ?? 0) + 1);
  return [...gamesPerTag]
    .map(([tag, gameCount]) => `${tag} ${gameCount}`)
    .join(', ');
}

function printRuns(runs: string[]): void {
  console.log('Runs of this session (session-logs/):');
  for (const runName of runs) {
    const rows = readIndex(runFolderOf(runName));
    console.log(`  ${runName}: ${rows.length} games`);
    console.log(`      tags: ${describeTagCounts(rows) || 'none'}`);
  }
  console.log(
    '\nA run: npm run logs -- <run>.  A game: npm run logs -- <run> --seed <seed> [--moves] [--highlights]',
  );
}

function printTaggedGames(runName: string): void {
  const runFolder = runFolderOf(runName);
  const runInfo = readRunInfo(runFolder);
  const rows = readIndex(runFolder);
  console.log(`${runName}: ${rows.length} games, the tagged ones:`);
  for (const row of rows.filter((row) => row.tags.length))
    console.log(
      `  seed ${String(row.seed).padStart(5)}  ${row.tags.join(', ').padEnd(26)}  ${describeGameResult(runInfo, row)}`,
    );
  console.log(
    `\nRead one: npm run logs -- ${parseInt(runName, 10)} --seed <seed>`,
  );
}

function printGames(runName: string, rows: GameIndexRow[], args: Args): void {
  const runFolder = runFolderOf(runName);
  const runInfo = readRunInfo(runFolder);
  for (const row of rows) {
    const wholeGame = readGame(runFolder, row);
    const gameLog = args.highlights ? highlightsOf(wholeGame) : wholeGame;
    console.log(
      formatGameOfRun(runInfo, row, gameLog, { showMoves: args.showMoves }) +
        '\n',
    );
    if (row.error !== undefined) console.log(row.error + '\n');
  }
}

export function runLogsCommand(args: Args): void {
  const runs = listRuns();
  if (!runs.length) {
    console.log(
      'No game logs yet. A `npm run sim -- <deck>` or `npm run pod -- ...` run writes them to session-logs/.',
    );
    return;
  }
  const askedRun = args.lists[0];
  const isGameAsked = args.seedGiven || args.tag !== null;
  if (askedRun === undefined && !isGameAsked) return printRuns(runs);

  const runName = findRun(runs, askedRun);
  if (!isGameAsked) return printTaggedGames(runName);

  const rows = readIndex(runFolderOf(runName)).filter((row) =>
    args.tag !== null ? row.tags.includes(args.tag) : row.seed === args.seed,
  );
  if (!rows.length)
    throw new Error(
      args.tag !== null
        ? `no game with tag ${args.tag} in ${runName}`
        : `no game with seed ${args.seed} in ${runName}`,
    );
  printGames(runName, rows, args);
}
