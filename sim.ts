/**
 * Goldfish simulator for Commander decks. One command for every deck in decks/.
 *
 *   npm run sim -- gale                                  kill-turn table for decks/gale/decklist.txt
 *   npm run sim -- gale -n 20000                         more games = less noise
 *   npm run sim -- gale decklist.txt lists/proposed.txt  compare lists on the same seeds (first = base)
 *   npm run sim -- gale --set planner=0                  same list, changed setting vs default
 *   npm run sim -- gale --trace 5                        play-by-play of 5 games
 *   npm run sim -- gale --rank                           rank cards by how much seeing them early helps
 *   npm run sim -- gale --cut "Card A" "Card B"          cut each card for a basic land and compare
 *   npm run sim -- gale --analyze logs/game6.txt         check a real game (Archidekt log) for missed kills
 *   npm run sim -- gale --fetch lists/new.txt            download card data for new cards from Scryfall
 *   npm run sim -- gale --eco                             power-save mode: runs in the background without loading the machine
 *                                                         (below-normal priority, a quarter of the cores, resting between chunks;
 *                                                         --duty N sets the busy percentage, -w N the worker count)
 *   npm run sim -- aesi lists/a.txt --diag                the deck's own consistency measures per list (same seeds)
 *   npm run sim -- aesi lists/a.txt --hands -n 8000       how opening hands do (by land count and contents), for mulligan advice
 *   npm run sim -- gale --test                           the deck's kill-finder tests
 *   npm run sim -- gale --regress check                  after a refactor: results must be IDENTICAL
 *                                                        (--regress record saves a new baseline)
 *
 * Lists and logs are looked up as given, then inside the deck's folder.
 */
import * as os from "os";
import * as path from "path";
import { isMainThread, parentPort, workerData } from "worker_threads";
import * as R from "./engine/runner";
import { Config } from "./engine/game";
import { deck as gale } from "./decks/gale/index";
import { deck as meren } from "./decks/meren/index";
import { deck as samfrodo } from "./decks/samfrodo/index";
import { deck as aesi } from "./decks/aesi/index";
import { deck as mike } from "./decks/mike/index";
import { deck as codie } from "./decks/codie/index";
import { deck as goldfish } from "./decks/goldfish/index";
import { runKillTests } from "./decks/gale/tests/kills.test";
import { runMerenTests } from "./decks/meren/tests/meren.test";
import { runSamFrodoTests } from "./decks/samfrodo/tests/samfrodo.test";
import { runAesiTests } from "./decks/aesi/tests/aesi.test";
import { runMikeTests } from "./decks/mike/tests/mike.test";
import { runCodieTests } from "./decks/codie/tests/codie.test";
import { regress, RegressSpec } from "./engine/regress";
import * as P from "./engine/pod";
import { runPodTests } from "./engine/pod.test";

const DECKS: Record<string, R.Deck> = { gale, meren, samfrodo, aesi, mike, codie, goldfish };
const TESTS: Record<string, () => boolean> = { gale: runKillTests, meren: runMerenTests, samfrodo: runSamFrodoTests, aesi: runAesiTests, mike: runMikeTests, codie: runCodieTests };
/** What --regress records per deck (lists relative to the deck folder). */
const REGRESS: Record<string, RegressSpec> = {
  gale: { lists: ["decklist.txt", "lists/proposed.txt"], tests: runKillTests,
    logLists: { "game6_t9_duskmantle_singularity.txt": "lists/proposed.txt" } }, // played with the proposed list
  meren: { lists: ["decklist.txt"], tests: runMerenTests },
  samfrodo: { lists: ["decklist.txt"], tests: runSamFrodoTests },
  aesi: { lists: ["decklist.txt"], tests: runAesiTests },
  mike: { lists: ["decklist.txt"], tests: runMikeTests },
  codie: { lists: ["decklist.txt"], tests: runCodieTests },
};

interface Args {
  deck: string;
  lists: string[];
  games: number;
  workers: number;
  workersGiven: boolean;
  gamesGiven: boolean;
  eco: boolean;
  duty: number | null;
  turns: number | null;
  set: string[];
  trace: number;
  seed: number;
  mode: "any" | "protected";
  rank: boolean;
  cut: string[] | null;
  replace: string;
  analyze: string | null;
  list: string | null;
  ai: number;
  budget: number;
  fetch: boolean;
  test: boolean;
  diag: boolean;
  hands: boolean;
  regress: string | null;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { deck: "", lists: [], games: 5000, workers: R.defaultWorkers(), workersGiven: false, gamesGiven: false, eco: false, duty: null, turns: null, set: [], trace: 0,
    seed: 1, mode: "any", rank: false, cut: null, replace: "Island", analyze: null, list: null, ai: 200,
    budget: 20000, fetch: false, test: false, diag: false, hands: false, regress: null };
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    const val = () => {
      if (i + 1 >= argv.length) throw new Error(`${x} needs a value`);
      return argv[++i];
    };
    if (x === "-n" || x === "--games") { a.games = parseInt(val(), 10); a.gamesGiven = true; }
    else if (x === "-w" || x === "--workers") { a.workers = parseInt(val(), 10); a.workersGiven = true; }
    else if (x === "--eco") a.eco = true;
    else if (x === "--duty") a.duty = parseInt(val(), 10);
    else if (x === "--turns") a.turns = parseInt(val(), 10);
    else if (x === "--set") a.set.push(val());
    else if (x === "--trace") a.trace = parseInt(val(), 10);
    else if (x === "--seed") a.seed = parseInt(val(), 10);
    else if (x === "--mode") a.mode = val() as "any" | "protected";
    else if (x === "--rank") a.rank = true;
    else if (x === "--cut") {
      a.cut = [];
      while (i + 1 < argv.length && !argv[i + 1].startsWith("-")) a.cut.push(argv[++i]);
    } else if (x === "--replace") a.replace = val();
    else if (x === "--analyze") a.analyze = val();
    else if (x === "-d" || x === "--list") a.list = val();
    else if (x === "--ai") a.ai = parseInt(val(), 10);
    else if (x === "--budget") a.budget = parseInt(val(), 10);
    else if (x === "--fetch") a.fetch = true;
    else if (x === "--test") a.test = true;
    else if (x === "--diag") a.diag = true;
    else if (x === "--hands") a.hands = true;
    else if (x === "--regress") a.regress = val();
    else if (x === "-h" || x === "--help") {
      console.log("usage: npm run sim -- <deck> [lists...] [options]   (see the top of sim.ts / README.md)");
      process.exit(0);
    } else if (x.startsWith("-")) throw new Error(`unknown option ${x}`);
    else rest.push(x);
  }
  if (!rest.length) throw new Error(`which deck? one of: ${Object.keys(DECKS).join(", ")}`);
  a.deck = rest[0];
  a.lists = rest.slice(1);
  return a;
}

/** npm run pod -- gale meren samfrodo aesi mike -n 1000 [--turns 17] [--trace 1 --seed 5] [--eco] [--set key=value] */
async function podMain(args: Args): Promise<void> {
  const set: Config = {};
  let threat: string | undefined, policy: string | undefined;
  for (const s of args.set) {
    const [k, v] = s.split("=");
    if (k === "threat") threat = v;
    else if (k === "policy") policy = v;
    else set[k] = v === "true" ? true : v === "false" ? false : Number(v);
  }
  if (args.test) process.exit(runPodTests() ? 0 : 1);
  const spec = P.podSpec(DECKS, args.lists, args.turns ?? 17, set, threat, policy);
  if (args.trace) {
    for (let s = args.seed; s < args.seed + args.trace; s++) {
      const g = P.playPod(DECKS, spec, s, true);
      console.log(`\n===== pod game seed ${s}: seats ${spec.decks.map((d, i) => `${d}=${g.seat[i] + 1}`).join(", ")} -> ${g.winner === null ? "no winner" : spec.decks[g.winner] + " wins"} in round ${g.turn} (${g.how})`);
      for (const l of g.log ?? []) console.log(l);
    }
    return;
  }
  let workers = args.workers, duty = 100;
  if (args.eco || args.duty !== null) {
    if (!args.workersGiven) workers = Math.max(1, Math.floor(P.cores() / 4));
    duty = args.duty ?? 70;
    try { os.setPriority(os.constants.priority.PRIORITY_BELOW_NORMAL); } catch { /* not allowed here */ }
    console.log(`eco mode: ${workers} worker(s), below-normal priority, busy about ${duty}% of the time`);
  }
  const games = args.gamesGiven ? args.games : 1000;
  const t0 = Date.now();
  const r = await P.simulatePod(spec, games, workers, duty);
  P.printPod(spec, r.games);
  console.log(`\n(${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.deck === "pod") return podMain(args);
  const deck = DECKS[args.deck];
  if (!deck) throw new Error(`unknown deck ${args.deck}; choose from ${Object.keys(DECKS).join(", ")}`);
  if (args.eco || args.duty !== null) {
    // power-save mode: a quarter of the cores (at least 1), below-normal priority, and rests so the cores don't run flat out
    const cores = os.availableParallelism?.() ?? os.cpus().length;
    if (!args.workersGiven) args.workers = Math.max(1, Math.floor(cores / 4));
    const duty = args.duty ?? 70;
    R.setDuty(duty);
    try {
      os.setPriority(os.constants.priority.PRIORITY_BELOW_NORMAL);
    } catch {
      /* not allowed here: the other limits still apply */
    }
    console.log(`eco mode: ${args.workers} worker(s), below-normal priority, busy about ${duty}% of the time`);
    const t0 = Date.now(), c0 = process.cpuUsage();
    process.on("exit", () => {
      const c = process.cpuUsage(c0);
      const wall = (Date.now() - t0) / 1000;
      console.log(`(eco: ${((c.user + c.system) / 1e6 / wall).toFixed(1)} of ${cores} cores busy on average)`);
    });
  }
  const lists = (args.lists.length ? args.lists : [deck.defaultList]).map((p) => R.resolveList(deck, p));
  const fetchHint = `npm run sim -- ${deck.name} --fetch ` + (args.lists.length ? args.lists : [deck.defaultList]).join(" ");

  if (args.test) process.exit(TESTS[deck.name]() ? 0 : 1);
  if (args.regress) process.exit((await regress(deck, REGRESS[deck.name], args.regress, args.workers)) ? 0 : 1);
  if (args.fetch) {
    const { fetchMissing } = await import("./engine/fetch");
    await fetchMissing(lists);
    return;
  }
  if (args.analyze) {
    const { run } = await import("./engine/analyze");
    const log = R.resolveList(deck, args.analyze);
    const lst = args.list ? R.resolveList(deck, args.list) : lists[0];
    run(deck, log, lst, args.ai, args.budget);
    return;
  }

  const cfg: Config = { ...deck.cfg };
  if (args.turns) cfg.max_turn = args.turns;
  const cfgB: Config = { ...cfg };
  for (const kv of args.set) {
    const [k, v] = kv.split("=", 2);
    if (!(k in deck.cfg)) throw new Error(`unknown setting ${k}; choose from ${Object.keys(deck.cfg).join(", ")}`);
    cfgB[k] = typeof deck.cfg[k] === "boolean" ? ["1", "true", "yes", "on"].includes(v.toLowerCase()) : Number(v);
  }
  for (const p of lists) R.checkList(p, fetchHint);

  const t0 = Date.now();
  const T = cfg.max_turn as number;
  if (args.trace) {
    R.trace(deck, lists[0], cfgB, args.seed, args.trace, args.mode);
    return;
  }
  if (args.hands) {
    const r7 = (await R.simulate(deck, lists[0], args.games, cfgB, args.workers, "hands", 7)).hands!;
    const r6 = (await R.simulate(deck, lists[0], args.games, cfgB, args.workers, "hands", 6)).hands!;
    R.printHands(deck, r7, r6, cfgB);
  } else if (args.diag) {
    const rows: R.DiagRow[][] = [];
    for (const p of lists) rows.push((await R.simulate(deck, p, args.games, cfgB, args.workers, "diag")).diag!);
    R.printDiag(deck, lists.map((p) => path.basename(p)), rows, args.games);
  } else if (args.rank) await R.rank(deck, lists[0], args.games, cfgB, args.workers);
  else if (args.cut) await R.cuts(deck, lists[0], args.cut, args.replace, args.games, cfgB, args.workers);
  else if (lists.length === 1 && args.set.length) {
    const ta = R.table((await R.simulate(deck, lists[0], args.games, cfg, args.workers)).kills!, T);
    const tb = R.table((await R.simulate(deck, lists[0], args.games, cfgB, args.workers)).kills!, T);
    R.printCompare(["default", args.set.join(" ")], [ta, tb], cfg, args.games, deck.metrics, deck.compareTurns);
  } else if (lists.length === 1) {
    const t = R.table((await R.simulate(deck, lists[0], args.games, cfgB, args.workers)).kills!, T);
    R.printSingle(path.relative(deck.dir, lists[0]) || lists[0], t, cfg, args.games, deck.metrics);
  } else {
    const tabs: R.Table[] = [];
    for (const p of lists) {
      tabs.push(R.table((await R.simulate(deck, p, args.games, cfgB, args.workers)).kills!, T));
      console.log(`  done: ${path.basename(p)} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    }
    R.printCompare(lists, tabs, cfg, args.games, deck.metrics, deck.compareTurns);
  }
  console.log(`\n(${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}

if (!isMainThread && workerData === "sim-worker") {
  // a runner worker: play the seeds it is sent
  parentPort!.on("message", (job: R.Job | P.PodJob) =>
    parentPort!.postMessage("pod" in job ? P.runPodJob(DECKS, job) : R.runJob(DECKS[job.deck], job)));
} else {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
