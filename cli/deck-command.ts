/**
 * `npm run sim -- <deck> [lists...] [options]`: simulates one deck's goldfish games and prints the report the options
 * ask for (kill-turn table, list comparison, settings comparison, --diag, --hands, --rank, --cut, --trace).
 */
import * as path from 'path';
import { Config } from '../engine/game-types';
import * as Runner from '../engine/runner';
import {
  buildDiagReport,
  buildKillTurnReport,
  printCompare,
  printDiag,
  printHands,
  printSingle,
  Table,
  table,
} from '../engine/report';
import { cuts, rank } from '../engine/ranking';
import { createGoldfishRunFolder } from '../engine/logged-runs';
import { Args } from './args';
import { LogSession } from './log-session';

/** The deck's settings, plus --turns, as the "default" to compare against; and with --set applied on top of that. */
function buildConfigs(
  args: Args,
  deck: Runner.Deck,
): { defaultConfig: Config; configWithSettings: Config } {
  const defaultConfig: Config = { ...deck.config };
  if (args.turns) defaultConfig.max_turn = args.turns;
  const configWithSettings: Config = { ...defaultConfig };
  for (const setting of args.settings) {
    const [key, value] = setting.split('=', 2);
    if (!(key in deck.config))
      throw new Error(
        `unknown setting ${key}; choose from ${Object.keys(deck.config).join(', ')}`,
      );
    configWithSettings[key] =
      typeof deck.config[key] === 'boolean'
        ? ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
        : Number(value);
  }
  return { defaultConfig, configWithSettings };
}

export async function runDeckCommand(
  args: Args,
  deck: Runner.Deck,
  listFiles: string[],
): Promise<void> {
  const { defaultConfig, configWithSettings } = buildConfigs(args, deck);
  for (const listFile of listFiles) Runner.checkList(listFile);

  const startTime = Date.now();
  const firstList = listFiles[0];
  if (args.trace) {
    Runner.trace(
      deck,
      firstList,
      configWithSettings,
      args.seed,
      args.trace,
      args.mode,
      args.showMoves,
    );
    return;
  }
  const { games, workers } = args;
  const maxTurn = defaultConfig.max_turn as number;
  // the normal table, list comparisons and --diag are logged; the many small runs of --rank, --cut and --hands are not
  const isLogged = !args.noLog && !args.hands && !args.rank && !args.cutCards;
  const logSession = new LogSession(isLogged);
  /** Plays a list's games; with the log on, every game goes to a new run folder in session-logs/. */
  const simulateLogged = async (
    listFile: string,
    config: Config,
    what: 'kills' | 'diag',
    labelSuffix = '',
  ) => {
    const runFolder = logSession.startRun(() =>
      createGoldfishRunFolder(deck, listFile, games, config, what, labelSuffix),
    );
    const result = await Runner.simulate(
      deck,
      listFile,
      games,
      config,
      workers,
      what,
      7,
      runFolder,
    );
    logSession.finishRun(runFolder, result.logRows);
    return result;
  };
  /** The kill-turn table of a list played with the given settings. */
  const killTable = async (
    listFile: string,
    config: Config,
    labelSuffix = '',
  ) =>
    table(
      (await simulateLogged(listFile, config, 'kills', labelSuffix)).kills!,
      maxTurn,
    );

  if (args.hands) {
    await printHandReport(args, deck, firstList, configWithSettings);
  } else if (args.diag) {
    const rowsPerList: Runner.DiagRow[][] = [];
    for (const listFile of listFiles)
      rowsPerList.push(
        (await simulateLogged(listFile, configWithSettings, 'diag')).diag!,
      );
    printDiag(
      buildDiagReport(
        deck,
        listFiles.map((listFile) => path.basename(listFile)),
        rowsPerList,
        games,
      ),
    );
  } else if (args.rank) {
    await rank(deck, firstList, games, configWithSettings, workers);
  } else if (args.cutCards) {
    await cuts(
      deck,
      firstList,
      args.cutCards,
      args.cutReplacement,
      games,
      configWithSettings,
      workers,
    );
  } else if (listFiles.length === 1 && args.settings.length) {
    // one list, default settings against the --set ones
    const defaultTable = await killTable(firstList, defaultConfig, '-default');
    const settingsTable = await killTable(
      firstList,
      configWithSettings,
      '-changed',
    );
    printCompare(
      buildKillTurnReport(
        ['default', args.settings.join(' ')],
        [defaultTable, settingsTable],
        defaultConfig,
        games,
        deck.metrics,
        deck.compareTurns,
      ),
    );
  } else if (listFiles.length === 1) {
    const table = await killTable(firstList, configWithSettings);
    printSingle(
      path.relative(deck.dir, firstList) || firstList,
      table,
      defaultConfig,
      games,
      deck.metrics,
    );
  } else {
    const tables: Table[] = [];
    for (const listFile of listFiles) {
      tables.push(await killTable(listFile, configWithSettings));
      console.log(
        `  done: ${path.basename(listFile)} (${((Date.now() - startTime) / 1000).toFixed(0)}s)`,
      );
    }
    printCompare(
      buildKillTurnReport(
        listFiles,
        tables,
        defaultConfig,
        games,
        deck.metrics,
        deck.compareTurns,
      ),
    );
  }
  logSession.printGamesWorthALook();
  console.log(`\n(${((Date.now() - startTime) / 1000).toFixed(0)}s)`);
}

/** --hands: how opening hands of seven and of six do. */
async function printHandReport(
  args: Args,
  deck: Runner.Deck,
  listFile: string,
  config: Config,
): Promise<void> {
  const handsOfSeven = (
    await Runner.simulate(
      deck,
      listFile,
      args.games,
      config,
      args.workers,
      'hands',
      7,
    )
  ).hands!;
  const handsOfSix = (
    await Runner.simulate(
      deck,
      listFile,
      args.games,
      config,
      args.workers,
      'hands',
      6,
    )
  ).hands!;
  printHands(deck, handsOfSeven, handsOfSix, config);
}
