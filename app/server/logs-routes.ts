/**
 * The game log calls of the API (PLAN.md task 5): the runs of this session, their games, one game as a GameLog, and the
 * real Archidekt logs of a deck.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { DECKS } from '../../decks/index';
import { readArchidektLog } from '../../engine/game-log-archidekt';
import {
  listRuns,
  readIndex,
  readRunInfo,
  runFolderOf,
} from '../../engine/game-log-files';
import { describeGameResult } from '../../engine/game-log-run';
import type { GameIndexRow } from '../../engine/run-types';
import type {
  GameAnswer,
  GameListRow,
  GamesAnswer,
  LoggedRunSummary,
  LogsAnswer,
  RealLogsAnswer,
} from '../api-types';
import { RequestError } from './decks-routes';

const DEFAULT_GAMES_PER_PAGE = 50;
const MAX_GAMES_PER_PAGE = 500;

/** The games file that was unzipped last: stepping between games of one file must not unzip it again. */
let lastGamesFile: { file: string; lines: string[] } | undefined;

function findRunFolder(runName: string): string {
  if (!listRuns().includes(runName))
    throw new RequestError(404, `no run ${runName}`);
  return runFolderOf(runName);
}

function countTags(rows: GameIndexRow[]): Record<string, number> {
  const tagCounts: Record<string, number> = {};
  for (const row of rows)
    for (const tag of row.tags) tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
  return tagCounts;
}

export function answerLogs(): LogsAnswer {
  return listRuns().map((runName): LoggedRunSummary => {
    const runFolder = runFolderOf(runName);
    return {
      info: readRunInfo(runFolder),
      tagCounts: countTags(readIndex(runFolder)),
    };
  });
}

/** A whole number from a query value; the default when it is missing, a 400 when it is not a number. */
function readWholeNumber(
  name: string,
  value: string | null,
  defaultValue: number,
): number {
  if (value === null) return defaultValue;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0)
    throw new RequestError(400, `${name} must be a whole number, not ${value}`);
  return number;
}

export interface GamesFilter {
  tag: string | null;
  /** Pod: the index of the winning deck. */
  winner: string | null;
  from: string | null;
  count: string | null;
}

export function answerGames(runName: string, filter: GamesFilter): GamesAnswer {
  const runFolder = findRunFolder(runName);
  const runInfo = readRunInfo(runFolder);
  // "winner=none" asks for the pod games nobody won
  const isWinnerFiltered = filter.winner !== null;
  const winnerWanted =
    filter.winner === 'none'
      ? null
      : readWholeNumber('winner', filter.winner, 0);
  const matchingRows = readIndex(runFolder).filter((row) => {
    if (filter.tag !== null && !row.tags.includes(filter.tag)) return false;
    return (
      !isWinnerFiltered ||
      (row.pod !== undefined && row.pod.winner === winnerWanted)
    );
  });
  const from = readWholeNumber('from', filter.from, 0);
  const count = Math.min(
    readWholeNumber('count', filter.count, DEFAULT_GAMES_PER_PAGE),
    MAX_GAMES_PER_PAGE,
  );
  const rows = matchingRows
    .slice(from, from + count)
    .map((row): GameListRow => ({
      ...row,
      result: describeGameResult(runInfo, row),
    }));
  return { total: matchingRows.length, rows };
}

export function answerGame(runName: string, seedText: string): GameAnswer {
  const runFolder = findRunFolder(runName);
  const seed = Number(seedText);
  const row = readIndex(runFolder).find((candidate) => candidate.seed === seed);
  if (!row) throw new RequestError(404, `no game with seed ${seedText}`);
  const file = path.join(runFolder, row.file);
  if (lastGamesFile?.file !== file)
    lastGamesFile = {
      file,
      lines: zlib
        .gunzipSync(fs.readFileSync(file))
        .toString('utf-8')
        .split('\n'),
    };
  return JSON.parse(lastGamesFile.lines[row.line]) as GameAnswer;
}

/** Forgets the unzipped games file (the tests remove run folders, and a new run may reuse a folder name). */
export function forgetUnzippedGamesFile(): void {
  lastGamesFile = undefined;
}

function realLogsFolder(deckName: string): string {
  const deck = Object.hasOwn(DECKS, deckName) ? DECKS[deckName] : undefined;
  if (!deck) throw new RequestError(404, `no deck ${deckName}`);
  return path.join(deck.dir, 'logs');
}

export function answerRealLogs(deckName: string): RealLogsAnswer {
  const folder = realLogsFolder(deckName);
  if (!fs.existsSync(folder)) return [];
  return fs
    .readdirSync(folder)
    .filter((name) => name.endsWith('.txt'))
    .sort();
}

/** One real log as a GameLog; a file name that leaves the logs folder is refused (400). */
export function answerRealLog(deckName: string, fileName: string): GameAnswer {
  const folder = path.resolve(realLogsFolder(deckName));
  const file = path.resolve(folder, fileName);
  if (!file.startsWith(folder + path.sep) || !file.endsWith('.txt'))
    throw new RequestError(400, `not a log of ${deckName}: ${fileName}`);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile())
    throw new RequestError(404, `no log ${fileName} in ${deckName}`);
  return readArchidektLog(file);
}
