/**
 * `npm run app`: starts the app's server and prints its address (PLAN.md, roadmap step 4). It does not open the browser.
 *
 *   npm run app                  build the simulator and the page, start the server
 *   npm run app -- --port 5000   another port than 4173
 *   npm run app:dev              the server plus `ng serve` (live reload while working on the page)
 *   npm run app -- --test        the app's tests (progress and stopping of runs, deck calls, card image calls, run calls)
 *
 * It runs inside the simulator's bundle (dist/sim.js app), so the worker threads of a run start as they always do.
 */
import { DECKS } from '../../decks/index';
import { runRunControlTests } from '../../engine/run/worker-pool.test';
import { clearSessionLogs } from '../../engine/game-log/game-log-files';
import { runCardsRoutesTests } from './cards-routes.test';
import { runDecksRoutesTests } from './decks-routes.test';
import { runLogsRoutesTests } from './logs-routes.test';
import { runRunsTests } from './runs.test';
import { startServer } from './server';

const DEFAULT_PORT = 4173;

interface AppOptions {
  port: number;
  /** --test: run the app's tests instead of the server. */
  runsTests: boolean;
}

function parseAppOptions(argv: string[]): AppOptions {
  const options: AppOptions = {
    port: DEFAULT_PORT,
    runsTests: false,
  };
  for (let index = 0; index < argv.length; index++) {
    const option = argv[index];
    if (option === '--port') {
      options.port = parseInt(argv[++index] ?? '', 10);
      if (!Number.isInteger(options.port))
        throw new Error('--port needs a number');
    } else if (option === '--test') options.runsTests = true;
    else
      throw new Error(`unknown option ${option} (app takes --port N, --test)`);
  }
  return options;
}

export async function runAppCommand(argv: string[]): Promise<void> {
  const options = parseAppOptions(argv);
  if (options.runsTests) {
    const runControlPassed = await runRunControlTests(DECKS);
    const decksPassed = await runDecksRoutesTests();
    const cardsPassed = await runCardsRoutesTests();
    const logsPassed = await runLogsRoutesTests();
    const runsPassed = await runRunsTests();
    const testsPassed =
      runControlPassed &&
      decksPassed &&
      cardsPassed &&
      logsPassed &&
      runsPassed;
    process.exit(testsPassed ? 0 : 1);
  }
  // every run of this session stays on disk until the app starts again (PLAN.md decision 6)
  clearSessionLogs();
  await startServer(options.port);
  const url = `http://127.0.0.1:${options.port}/`;
  console.log(`The app is running at ${url} (Ctrl+C stops it).`);
}
