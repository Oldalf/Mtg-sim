/**
 * Refactor safety net: the simulator must give exactly the same results before and after a change.
 *   npm run sim -- gale --regress record     save the current results to regress_baseline/<deck>.json
 *   npm run sim -- gale --regress check      run again and compare (must print IDENTICAL)
 * It records, per seed, the first kill turn ("any" and "with counter backup") for each list, the full
 * output of the log analyzer for every game log, and the kill-test output.
 * The games of the deck's own list are also checked for kill misses (as --test does, on more seeds), so
 * scripts/verify.mjs skips that part of --test for a deck whose regress it runs.
 *   npm run sim -- gale --regress check -n 100   only seeds 1-100 (a quick check while editing)
 */
import * as fs from 'fs';
import * as path from 'path';
import * as C from '../cards/cards';
import { run as analyze } from './analyze';
import { Deck, simulate } from '../run/runner';

const SEEDS = 600;
const AI_RUNS = 20;

export interface RegressSpec {
  lists: string[]; // relative to the deck folder
  logLists?: Record<string, string>; // log file -> list it was played with (default: the deck's list)
  tests: () => boolean;
}

function capture(action: () => void): string {
  const out: string[] = [];
  const orig = console.log;
  console.log = (...values: unknown[]) => {
    out.push(values.map(String).join(' '));
  };
  try {
    action();
  } catch (error) {
    out.push(
      'ERROR ' + (error instanceof Error ? error.message : String(error)),
    );
  } finally {
    console.log = orig;
  }
  return out.join('\n');
}

async function collect(
  deck: Deck,
  spec: RegressSpec,
  workers: number,
  seeds: number,
) {
  const results = {
    games: {} as Record<string, unknown>,
    logs: {} as Record<string, string>,
    tests: '',
  };
  let killMissSeeds: number[] = [];
  for (const listFile of spec.lists) {
    const result = await simulate(
      deck,
      path.join(deck.dir, listFile),
      seeds,
      { ...deck.config },
      workers,
    );
    results.games[listFile] = result.kills;
    if (listFile === deck.defaultList)
      killMissSeeds = result.killMissSeeds ?? [];
    console.log(`  ${listFile}: ${seeds} games`);
  }
  const logDir = path.join(deck.dir, 'logs');
  for (const logFile of fs.existsSync(logDir)
    ? fs.readdirSync(logDir).sort()
    : []) {
    if (!logFile.endsWith('.txt')) continue;
    const list = path.join(
      deck.dir,
      spec.logLists?.[logFile] ?? deck.defaultList,
    );
    results.logs[logFile] = capture(() =>
      analyze(deck, path.join(logDir, logFile), list, AI_RUNS, 20000),
    );
    console.log(`  log ${logFile}`);
  }
  results.tests = capture(() => {
    spec.tests();
  });
  return { results, killMissSeeds };
}

/** The kill-miss check of --test (kill-line.test.ts), on the games regress played with the deck's own list. */
function reportKillMisses(
  deck: Deck,
  killMissSeeds: number[],
  seeds: number,
): boolean {
  const isGood = killMissSeeds.length === 0;
  console.log(
    `${isGood ? 'OK ' : 'BAD'} kill lines played for real: ${seeds} seeds of ${deck.defaultList}, ` +
      `${killMissSeeds.length} with a kill miss` +
      (isGood
        ? ''
        : ` (seeds ${killMissSeeds.slice(0, 10).join(', ')}; KILL_MISS_LOG_SEED=<seed> with --test shows the log)`),
  );
  return isGood;
}

/** seeds: how many seeds to play and compare (fewer than the baseline's 600 only for a check). */
export async function regress(
  deck: Deck,
  spec: RegressSpec,
  mode: string,
  workers: number,
  seeds = SEEDS,
): Promise<boolean> {
  const file = path.join(C.ROOT, 'regress_baseline', `${deck.name}.json`);
  if (mode === 'record' && seeds !== SEEDS)
    throw new Error(`a baseline is always recorded with ${SEEDS} seeds`);
  const { results, killMissSeeds } = await collect(deck, spec, workers, seeds);
  const hasNoKillMisses = reportKillMisses(deck, killMissSeeds, seeds);
  if (mode === 'record') {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(results), 'utf-8');
    console.log(`recorded to ${file}`);
    return hasNoKillMisses;
  }
  const base = JSON.parse(fs.readFileSync(file, 'utf-8')) as typeof results;
  let bad = 0;
  for (const [listFile, rows] of Object.entries(base.games) as [
    string,
    [number | null, number | null][],
  ][]) {
    const current = (results.games[listFile] ?? []) as [
      number | null,
      number | null,
    ][];
    const diff: number[] = [];
    rows.slice(0, seeds).forEach((row, i) => {
      if (!current[i] || current[i][0] !== row[0] || current[i][1] !== row[1])
        diff.push(i + 1);
    });
    bad += diff.length;
    console.log(
      `${diff.length ? 'BAD' : 'OK '} ${listFile}: ${diff.length} of ${Math.min(seeds, rows.length)} seeds differ` +
        (diff.length ? ` (first: ${diff.slice(0, 10).join(', ')})` : ''),
    );
  }
  for (const [logFile, savedText] of Object.entries(base.logs)) {
    const same = results.logs[logFile] === savedText;
    if (!same) bad++;
    console.log(`${same ? 'OK ' : 'BAD'} log ${logFile}`);
  }
  const same = results.tests === base.tests;
  if (!same) bad++;
  console.log(`${same ? 'OK ' : 'BAD'} kill-finder tests`);
  console.log(bad ? 'DIFFERENT' : 'IDENTICAL');
  return !bad && hasNoKillMisses;
}
