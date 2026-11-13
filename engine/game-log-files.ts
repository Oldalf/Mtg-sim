/**
 * The game logs of a run on disk, in session-logs/ (not in git). One run = one folder:
 *
 *   session-logs/
 *     01-meren-decklist/         one folder per list in a comparison (02-meren-test, ...)
 *       run.json                 what was run, enough to play it again (RunInfo)
 *       index.json               one row per game: seed, result, tags, file, line (GameIndexRow)
 *       games-000.jsonl.gz ...   one file per worker job, one game (GameLog) per line, gzipped
 *       tagged/fastest-seed-0412.txt   readable text of every tagged game
 *
 * The folder is cleared when a new `sim` or `pod` command starts a logged run. Nothing here prints, so a web server
 * can use these functions as they are.
 */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import * as C from './cards';
import { GameLog } from './game-log';
import type { GameIndexRow, RunInfo } from './run-types';

export type { GameIndexRow, RunInfo };

export const SESSION_LOGS_FOLDER = path.join(C.ROOT, 'session-logs');
const RUN_INFO_FILE = 'run.json';
const INDEX_FILE = 'index.json';
const TAGGED_FOLDER = 'tagged';

// ================================================================ writing a run

/** Removes the logs of the last session. */
export function clearSessionLogs(): void {
  fs.rmSync(SESSION_LOGS_FOLDER, { recursive: true, force: true });
  fs.mkdirSync(SESSION_LOGS_FOLDER, { recursive: true });
}

/** A short hash of a file's contents (to see later whether a decklist changed). */
export function hashOfFile(file: string): string {
  return crypto
    .createHash('sha256')
    .update(fs.readFileSync(file))
    .digest('hex')
    .slice(0, 16);
}

/** Makes the next run folder ("02-<label>") with its run.json. Returns the folder's path. */
export function createRunFolder(
  label: string,
  run: Omit<RunInfo, 'name' | 'date' | 'lists' | 'listHashes'>,
  listFiles: string[],
): string {
  fs.mkdirSync(SESSION_LOGS_FOLDER, { recursive: true });
  const runNumber = listRuns().length + 1;
  const safeLabel = label.replace(/[^A-Za-z0-9_.-]+/g, '-');
  const name = `${String(runNumber).padStart(2, '0')}-${safeLabel}`;
  const runFolder = path.join(SESSION_LOGS_FOLDER, name);
  fs.mkdirSync(runFolder);
  const runInfo: RunInfo = {
    ...run,
    name,
    date: new Date().toISOString(),
    lists: listFiles.map((file) =>
      path.relative(C.ROOT, path.resolve(file)).replace(/\\/g, '/'),
    ),
    listHashes: listFiles.map(hashOfFile),
  };
  fs.writeFileSync(
    path.join(runFolder, RUN_INFO_FILE),
    JSON.stringify(runInfo, null, 2),
    'utf-8',
  );
  return runFolder;
}

/** A stopped run played fewer games than it asked for: run.json then says how many it played. */
export function correctGameCount(runFolder: string, gamesPlayed: number): void {
  const runInfo: RunInfo = {
    ...readRunInfo(runFolder),
    gameCount: gamesPlayed,
  };
  fs.writeFileSync(
    path.join(runFolder, RUN_INFO_FILE),
    JSON.stringify(runInfo, null, 2),
    'utf-8',
  );
}

/** The name of the games file of a worker job. */
export function gamesFileName(jobNumber: number): string {
  return `games-${String(jobNumber).padStart(3, '0')}.jsonl.gz`;
}

/** Writes the games of one worker job: one game per line, each already turned into JSON. */
export function writeGamesFile(
  runFolder: string,
  jobNumber: number,
  gamesAsJson: string[],
): void {
  fs.writeFileSync(
    path.join(runFolder, gamesFileName(jobNumber)),
    zlib.gzipSync(gamesAsJson.join('\n'), { level: 4 }),
  );
}

export function writeIndex(runFolder: string, rows: GameIndexRow[]): void {
  fs.writeFileSync(
    path.join(runFolder, INDEX_FILE),
    JSON.stringify(rows),
    'utf-8',
  );
}

/** Saves the readable text of a tagged game. Returns the file's path. */
export function writeTaggedGame(
  runFolder: string,
  fileName: string,
  text: string,
): string {
  const folder = path.join(runFolder, TAGGED_FOLDER);
  fs.mkdirSync(folder, { recursive: true });
  const file = path.join(folder, fileName);
  fs.writeFileSync(file, text + '\n', 'utf-8');
  return file;
}

// ================================================================ reading a run

/** The run folders of this session, oldest first (their names). */
export function listRuns(): string[] {
  if (!fs.existsSync(SESSION_LOGS_FOLDER)) return [];
  return fs
    .readdirSync(SESSION_LOGS_FOLDER)
    .filter((name) =>
      fs.existsSync(path.join(SESSION_LOGS_FOLDER, name, RUN_INFO_FILE)),
    )
    .sort();
}

export function runFolderOf(runName: string): string {
  return path.join(SESSION_LOGS_FOLDER, runName);
}

export function readRunInfo(runFolder: string): RunInfo {
  return JSON.parse(
    fs.readFileSync(path.join(runFolder, RUN_INFO_FILE), 'utf-8'),
  ) as RunInfo;
}

/** The games of a run. Empty while the run is still going (the index is written at the end). */
export function readIndex(runFolder: string): GameIndexRow[] {
  const file = path.join(runFolder, INDEX_FILE);
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, 'utf-8')) as GameIndexRow[];
}

/** The log of one game of a run. */
export function readGame(runFolder: string, row: GameIndexRow): GameLog {
  const lines = zlib
    .gunzipSync(fs.readFileSync(path.join(runFolder, row.file)))
    .toString('utf-8')
    .split('\n');
  return JSON.parse(lines[row.line]) as GameLog;
}
