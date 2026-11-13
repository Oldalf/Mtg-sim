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
 *   npm run cards -- update                              download Scryfall's bulk data (only when new sets are out); cards a list
 *                                                         needs are then added to data/cards.json automatically
 *   npm run sim -- gale --eco                             power-save mode: runs in the background without loading the machine
 *                                                         (below-normal priority, a quarter of the cores, resting between chunks;
 *                                                         --duty N sets the busy percentage, -w N the worker count)
 *   npm run sim -- aesi lists/a.txt --diag                the deck's own consistency measures per list (same seeds)
 *   npm run sim -- aesi lists/a.txt --hands -n 8000       how opening hands do (by land count and contents), for mulligan advice
 *   npm run logs                                         read the games of the last run (see cli/logs-command.ts);
 *                                                        every run writes its games to session-logs/ unless --no-log is given
 *   npm run sim -- gale --test                           the deck's kill-finder tests
 *   npm run sim -- gale --regress check                  after a refactor: results must be IDENTICAL
 *                                                        (--regress record saves a new baseline)
 *
 * Lists and logs are looked up as given, then inside the deck's folder.
 */
import { isMainThread, parentPort, workerData } from 'worker_threads';
import * as Runner from './engine/runner';
import { regress } from './engine/regress';
import { runGoldfishLogTests } from './engine/game-log.test';
import * as Pod from './engine/pod';
import { PodJob } from './engine/pod-types';
import { Args, parseArgs, wantsEcoMode } from './cli/args';
import { runDeckCommand } from './cli/deck-command';
import { enableEcoMode, reportCpuUseAtExit } from './cli/eco';
import { runCardsCommand } from './cli/cards-command';
import { runPodCommand } from './cli/pod-command';
import { runLogsCommand } from './cli/logs-command';
import { addMissingCards } from './engine/scryfall';
import { DECKS, REGRESS, TESTS } from './decks/index';

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2), Object.keys(DECKS));
  if (args.deck === 'pod') return runPodCommand(args, DECKS);
  if (args.deck === 'cards') return runCardsCommand(args);
  if (args.deck === 'logs') return runLogsCommand(args);
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
  await addMissingCards(listFiles);
  if (await runSpecialCommand(args, deck, listFiles)) return;
  await runDeckCommand(args, deck, listFiles);
}

/** The commands that are not a simulation report: tests, regress, the log analyzer.
 *  Returns true if one of them was asked for (and has run). */
async function runSpecialCommand(
  args: Args,
  deck: Runner.Deck,
  listFiles: string[],
): Promise<boolean> {
  if (args.test) {
    const isLogHarmless = runGoldfishLogTests(deck);
    const deckTestsPassed = TESTS[deck.name]();
    process.exit(isLogHarmless && deckTestsPassed ? 0 : 1);
  }
  if (args.regress) {
    const identical = await regress(
      deck,
      REGRESS[deck.name],
      args.regress,
      args.workers,
    );
    process.exit(identical ? 0 : 1);
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
