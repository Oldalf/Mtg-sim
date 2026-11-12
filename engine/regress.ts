/**
 * Refactor safety net: the simulator must give exactly the same results before and after a change.
 *   npm run sim -- gale --regress record     save the current results to regress_baseline/<deck>.json
 *   npm run sim -- gale --regress check      run again and compare (must print IDENTICAL)
 * It records, per seed, the first kill turn ("any" and "with counter backup") for each list, the full
 * output of the log analyzer for every game log, and the kill-test output.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as C from './cards';
import { run as analyze } from './analyze';
import { Deck, simulate } from './runner';

const SEEDS = 600;
const AI_RUNS = 20;

export interface RegressSpec {
  lists: string[]; // relative to the deck folder
  logLists?: Record<string, string>; // log file -> list it was played with (default: the deck's list)
  tests: () => boolean;
}

function capture(fn: () => void): string {
  const out: string[] = [];
  const orig = console.log;
  console.log = (...a: unknown[]) => {
    out.push(a.map(String).join(' '));
  };
  try {
    fn();
  } catch (e) {
    out.push('ERROR ' + (e instanceof Error ? e.message : String(e)));
  } finally {
    console.log = orig;
  }
  return out.join('\n');
}

async function collect(deck: Deck, spec: RegressSpec, workers: number) {
  const results = {
    games: {} as Record<string, unknown>,
    logs: {} as Record<string, string>,
    tests: '',
  };
  for (const listFile of spec.lists) {
    const r = await simulate(
      deck,
      path.join(deck.dir, listFile),
      SEEDS,
      { ...deck.cfg },
      workers,
    );
    results.games[listFile] = r.kills;
    console.log(`  ${listFile}: ${SEEDS} games`);
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
  return results;
}

export async function regress(
  deck: Deck,
  spec: RegressSpec,
  mode: string,
  workers: number,
): Promise<boolean> {
  const file = path.join(C.ROOT, 'regress_baseline', `${deck.name}.json`);
  const results = await collect(deck, spec, workers);
  if (mode === 'record') {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(results), 'utf-8');
    console.log(`recorded to ${file}`);
    return true;
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
    rows.forEach((row, i) => {
      if (!current[i] || current[i][0] !== row[0] || current[i][1] !== row[1])
        diff.push(i + 1);
    });
    bad += diff.length;
    console.log(
      `${diff.length ? 'BAD' : 'OK '} ${listFile}: ${diff.length} of ${rows.length} seeds differ` +
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
  return !bad;
}
