/**
 * `npm run pod -- gale meren samfrodo aesi mike -n 1000 [--turns 17] [--trace 1 --seed 5] [--eco] [--set key=value]`
 * Decks play each other (see engine/pod/pod.ts).
 */
import * as path from 'path';
import { Config } from '../engine/game/game-types';
import * as Pod from '../engine/pod/pod';
import { buildPodReport, printPod } from '../engine/pod/pod-report';
import { runPodTests } from '../engine/pod/pod.test';
import { runControlExchangeTests } from '../engine/pod/pod-exchange.test';
import { runForcedAttackTests } from '../engine/pod/pod-forced-attacks.test';
import { runBlinkTests } from '../engine/game/blink.test';
import { runSearchManaTests } from '../engine/game/search-mana.test';
import { runOpponentCastTests } from '../engine/pod/pod-opponent-cast.test';
import {
  runPodExactMoveTests,
  runPodLogTests,
  runPaymentLogTests,
  runPlayerCounterTests,
} from '../engine/game-log/game-log.test';
import { describePodResult } from '../engine/pod/pod-report';
import { formatGameLog } from '../engine/game-log/game-log-text';
import { PodSpec } from '../shared/pod-types';
import { addMissingCards } from '../engine/cards/scryfall';
import { createPodRunFolder } from '../engine/game-log/logged-runs';
import { Deck } from '../engine/run/runner';
import { Args, wantsEcoMode } from './args';
import { enableEcoMode } from './eco';
import { LogSession } from './log-session';

const DEFAULT_ROUNDS_CAP = 17;
const DEFAULT_GAMES = 1000;

/** The --set options: threat and policy are pod settings of their own, the rest are deck settings for every deck. */
function parsePodSettings(settings: string[]): {
  deckSettings: Config;
  threat?: string;
  policy?: string;
} {
  const deckSettings: Config = {};
  let threat: string | undefined;
  let policy: string | undefined;
  for (const setting of settings) {
    const [key, value] = setting.split('=');
    if (key === 'threat') threat = value;
    else if (key === 'policy') policy = value;
    else
      deckSettings[key] =
        value === 'true' ? true : value === 'false' ? false : Number(value);
  }
  return { deckSettings, threat, policy };
}

export async function runPodCommand(
  args: Args,
  decks: Record<string, Deck>,
): Promise<void> {
  const { deckSettings, threat, policy } = parsePodSettings(args.settings);
  if (args.test) {
    const podTestsPassed = runPodTests();
    const isLogHarmless = runPodLogTests(decks);
    const areMovesRecorded = runPodExactMoveTests(decks);
    const areCountersLogged = runPlayerCounterTests(decks);
    const arePaymentsLogged = runPaymentLogTests(decks);
    const isExchangeRight = runControlExchangeTests(decks);
    const areForcedAttacksRight = runForcedAttackTests(decks);
    const areOpponentCastTriggersRight = runOpponentCastTests(decks);
    const isSearchManaRight = runSearchManaTests();
    const isBlinkRight = runBlinkTests(decks);
    process.exit(
      podTestsPassed &&
        isLogHarmless &&
        areMovesRecorded &&
        areCountersLogged &&
        arePaymentsLogged &&
        isExchangeRight &&
        areForcedAttacksRight &&
        areOpponentCastTriggersRight &&
        isSearchManaRight &&
        isBlinkRight
        ? 0
        : 1,
    );
  }
  const spec = Pod.podSpec(
    decks,
    args.lists,
    args.turns ?? DEFAULT_ROUNDS_CAP,
    deckSettings,
    threat,
    policy,
  );
  await addMissingCards(spec.lists);
  if (args.trace) {
    printTracedGames(args, decks, spec);
    return;
  }
  let workers = args.workers;
  let dutyPercent = 100;
  if (wantsEcoMode(args)) ({ workers, dutyPercent } = enableEcoMode(args));
  const games = args.gamesGiven ? args.games : DEFAULT_GAMES;
  const startTime = Date.now();
  const logSession = new LogSession(!args.noLog);
  const runFolder = logSession.startRun(() => createPodRunFolder(spec, games));
  const result = await Pod.simulatePod(
    spec,
    games,
    workers,
    dutyPercent,
    runFolder,
  );
  logSession.finishRun(runFolder, result.logRows);
  const report = buildPodReport(spec, result.games);
  logSession.saveReport({
    ...report,
    runFolder: runFolder && path.basename(runFolder),
  });
  printPod(report);
  logSession.printGamesWorthALook();
  console.log(`\n(${((Date.now() - startTime) / 1000).toFixed(0)}s)`);
}

/** --trace: plays a few games with the full play-by-play log. */
function printTracedGames(
  args: Args,
  decks: Record<string, Deck>,
  spec: PodSpec,
): void {
  for (let seed = args.seed; seed < args.seed + args.trace; seed++) {
    const game = Pod.playPod(decks, spec, seed, true);
    const title = `Pod game, seed ${seed}: ${describePodResult(spec, game)}`;
    console.log(
      '\n' + formatGameLog(game.log!, { title, showMoves: args.showMoves }),
    );
  }
}
