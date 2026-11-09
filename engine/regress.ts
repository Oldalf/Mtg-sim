/**
 * Refactor safety net: the simulator must give exactly the same results before and after a change.
 *   npm run sim -- gale --regress record     save the current results to regress_baseline/<deck>.json
 *   npm run sim -- gale --regress check      run again and compare (must print IDENTICAL)
 * It records, per seed, the first kill turn ("any" and "with counter backup") for each list, the full
 * output of the log analyzer for every game log, and the kill-test output.
 */
import * as fs from "fs";
import * as path from "path";
import * as C from "./cards";
import { run as analyze } from "./analyze";
import { Deck, simulate } from "./runner";

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
    out.push(a.map(String).join(" "));
  };
  try {
    fn();
  } catch (e) {
    out.push("ERROR " + (e instanceof Error ? e.message : String(e)));
  } finally {
    console.log = orig;
  }
  return out.join("\n");
}

async function collect(deck: Deck, spec: RegressSpec, workers: number) {
  const res = { games: {} as Record<string, unknown>, logs: {} as Record<string, string>, tests: "" };
  for (const l of spec.lists) {
    const r = await simulate(deck, path.join(deck.dir, l), SEEDS, { ...deck.cfg }, workers);
    res.games[l] = r.kills;
    console.log(`  ${l}: ${SEEDS} games`);
  }
  const logDir = path.join(deck.dir, "logs");
  for (const f of fs.existsSync(logDir) ? fs.readdirSync(logDir).sort() : []) {
    if (!f.endsWith(".txt")) continue;
    const list = path.join(deck.dir, spec.logLists?.[f] ?? deck.defaultList);
    res.logs[f] = capture(() => analyze(deck, path.join(logDir, f), list, AI_RUNS, 20000));
    console.log(`  log ${f}`);
  }
  res.tests = capture(() => {
    spec.tests();
  });
  return res;
}

export async function regress(deck: Deck, spec: RegressSpec, mode: string, workers: number): Promise<boolean> {
  const file = path.join(C.ROOT, "regress_baseline", `${deck.name}.json`);
  const res = await collect(deck, spec, workers);
  if (mode === "record") {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(res), "utf-8");
    console.log(`recorded to ${file}`);
    return true;
  }
  const base = JSON.parse(fs.readFileSync(file, "utf-8")) as typeof res;
  let bad = 0;
  for (const [l, rows] of Object.entries(base.games) as [string, [number | null, number | null][]][]) {
    const now = (res.games[l] ?? []) as [number | null, number | null][];
    const diff: number[] = [];
    rows.forEach((r, i) => {
      if (!now[i] || now[i][0] !== r[0] || now[i][1] !== r[1]) diff.push(i + 1);
    });
    bad += diff.length;
    console.log(`${diff.length ? "BAD" : "OK "} ${l}: ${diff.length} of ${rows.length} seeds differ` +
      (diff.length ? ` (first: ${diff.slice(0, 10).join(", ")})` : ""));
  }
  for (const [f, txt] of Object.entries(base.logs)) {
    const same = res.logs[f] === txt;
    if (!same) bad++;
    console.log(`${same ? "OK " : "BAD"} log ${f}`);
  }
  const same = res.tests === base.tests;
  if (!same) bad++;
  console.log(`${same ? "OK " : "BAD"} kill-finder tests`);
  console.log(bad ? "DIFFERENT" : "IDENTICAL");
  return !bad;
}
