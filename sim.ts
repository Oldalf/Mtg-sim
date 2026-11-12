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
import { isMainThread, parentPort, workerData } from 'worker_threads';
import * as Runner from './engine/runner';
import { regress } from './engine/regress';
import * as Pod from './engine/pod';
import { PodJob } from './engine/pod-types';
import { Args, parseArgs, wantsEcoMode } from './cli/args';
import { runDeckCommand } from './cli/deck-command';
import { enableEcoMode, reportCpuUseAtExit } from './cli/eco';
import { runPodCommand } from './cli/pod-command';
import { DECKS, REGRESS, TESTS } from './decks/index';

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2), Object.keys(DECKS));
  if (args.deck === 'pod') return runPodCommand(args, DECKS);
  const deck = DECKS[args.deck];
  if (!deck)
    throw new Error(
      `unknown deck ${args.deck}; choose from ${Object.keys(DECKS).join(', ')}`,
    );
  if (wantsEcoMode(args)) {
    const { workers, dutyPercent } = enableEcoMode(args);
    args.workers = workers;
    Runner.setDuty(dutyPercent);
    reportCpuUseAtExit();
  }
  const listFiles = (args.lists.length ? args.lists : [deck.defaultList]).map(
    (list) => Runner.resolveList(deck, list),
  );
  if (await runSpecialCommand(args, deck, listFiles)) return;
  await runDeckCommand(args, deck, listFiles);
}

/** The commands that are not a simulation report: tests, regress, fetching card data, the log analyzer.
 *  Returns true if one of them was asked for (and has run). */
async function runSpecialCommand(
  args: Args,
  deck: Runner.Deck,
  listFiles: string[],
): Promise<boolean> {
  if (args.test) process.exit(TESTS[deck.name]() ? 0 : 1);
  if (args.regress) {
    const identical = await regress(
      deck,
      REGRESS[deck.name],
      args.regress,
      args.workers,
    );
    process.exit(identical ? 0 : 1);
  }
  if (args.fetch) {
    const { fetchMissing } = await import('./engine/fetch');
    await fetchMissing(listFiles);
    return true;
  }
  if (args.analyzeLog) {
    const { run: analyzeLog } = await import('./engine/analyze');
    const logFile = Runner.resolveList(deck, args.analyzeLog);
    const listFile = args.analyzeList
      ? Runner.resolveList(deck, args.analyzeList)
      : listFiles[0];
    analyzeLog(deck, logFile, listFile, args.analyzeRuns, args.analyzeBudget);
    return true;
  }
  return false;
}

if (!isMainThread && workerData === 'sim-worker') {
  // a worker thread: play the seeds it is sent
  parentPort!.on('message', (job: Runner.Job | PodJob) =>
    parentPort!.postMessage(
      'pod' in job
        ? Pod.runPodJob(DECKS, job)
        : Runner.runJob(DECKS[job.deck], job),
    ),
  );
} else {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
