/**
 * `npm run logs`: read the game logs of the last `sim` or `pod` command (session-logs/). It never clears them.
 *
 *   npm run logs                               the runs of this session, with how many games carry each tag
 *   npm run logs -- 01-meren-decklist          the tagged games of a run (the name may be shortened to its number: 1)
 *   npm run logs -- 1 --seed 412               one game as text (no run given = the latest run)
 *   npm run logs -- 1 --tag average            every game with that tag
 *   npm run logs -- 1 --seed 412 --highlights  only the highlights, with two lines around each
 *   npm run logs -- 1 --seed 412 --moves       with the card moves under each line
 *   npm run logs -- 1 --seed 412 --board       with the board at the end of each turn
 *   npm run logs -- 1 --seed 412 --archidekt   the game as an Archidekt log (a pod: each player's in turn)
 *   npm run logs -- 1 --seed 412 --replay      play the game again instead of reading the stored log
 *   npm run logs -- decks/meren/logs/game1_t9_gray_merchant.txt --board   a real Archidekt log, shown the same way
 */
import * as fs from 'fs';
import { archidektLines, readArchidektLog } from '../engine/game-log-archidekt';
import { GameLog } from '../engine/game-log';
import { replayGame } from '../engine/game-log-replay';
import { Deck } from '../engine/runner';
import {
  GameIndexRow,
  listRuns,
  readGame,
  readIndex,
  readRunInfo,
  runFolderOf,
} from '../engine/game-log-files';
import { describeGameResult, formatGameOfRun } from '../engine/game-log-run';
import {
  GameLogTextOptions,
  formatGameLog,
  highlightsOf,
} from '../engine/game-log-text';
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

/** How the options ask a game to be shown. The board needs every event, so it is left out with --highlights. */
function textOptions(args: Args): GameLogTextOptions {
  return {
    showMoves: args.showMoves,
    showBoard: args.showBoard && !args.highlights,
  };
}

/** --archidekt: the card moves of each player as an Archidekt log. */
function printAsArchidektLog(gameLog: GameLog): void {
  gameLog.players.forEach((player, playerIndex) => {
    if (gameLog.players.length > 1) console.log(`\n# ${player.name}`);
    console.log(archidektLines(gameLog, playerIndex).join('\n'));
  });
}

function printGames(
  runName: string,
  rows: GameIndexRow[],
  args: Args,
  decks: Record<string, Deck>,
): void {
  const runFolder = runFolderOf(runName);
  const runInfo = readRunInfo(runFolder);
  for (const row of rows) {
    const wholeGame = args.replay
      ? replayGame(decks, runFolder, row.seed)
      : readGame(runFolder, row);
    if (args.archidekt) {
      printAsArchidektLog(wholeGame);
      continue;
    }
    const gameLog = args.highlights ? highlightsOf(wholeGame) : wholeGame;
    console.log(
      formatGameOfRun(runInfo, row, gameLog, textOptions(args)) + '\n',
    );
    if (row.error !== undefined) console.log(row.error + '\n');
  }
}

/** A real Archidekt log file, shown like a simulated game. */
function printArchidektFile(file: string, args: Args): void {
  const wholeGame = readArchidektLog(file);
  const gameLog = args.highlights ? highlightsOf(wholeGame) : wholeGame;
  console.log(
    formatGameLog(gameLog, { title: file, ...textOptions(args) }) + '\n',
  );
}

export function runLogsCommand(args: Args, decks: Record<string, Deck>): void {
  const askedFile = args.lists[0];
  if (askedFile !== undefined && fs.existsSync(askedFile))
    return printArchidektFile(askedFile, args);
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
  printGames(runName, rows, args, decks);
}
