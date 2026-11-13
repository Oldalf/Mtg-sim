/**
 * `npm run pod -- gale meren samfrodo aesi mike -n 1000 [--turns 17] [--trace 1 --seed 5] [--eco] [--set key=value]`
 * Decks play each other (see engine/pod.ts).
 */
import { Config } from '../engine/game-types';
import * as Pod from '../engine/pod';
import { printPod } from '../engine/pod-report';
import { runPodTests } from '../engine/pod.test';
import { PodSpec } from '../engine/pod-types';
import { addMissingCards } from '../engine/scryfall';
import { Deck } from '../engine/runner';
import { Args, wantsEcoMode } from './args';
import { enableEcoMode } from './eco';

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
  if (args.test) process.exit(runPodTests() ? 0 : 1);
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
  const result = await Pod.simulatePod(spec, games, workers, dutyPercent);
  printPod(spec, result.games);
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
    const seats = spec.decks
      .map((deck, player) => `${deck}=${game.seat[player] + 1}`)
      .join(', ');
    const outcome =
      game.winner === null ? 'no winner' : spec.decks[game.winner] + ' wins';
    console.log(
      `\n===== pod game seed ${seed}: seats ${seats} -> ${outcome} in round ${game.turn} (${game.how})`,
    );
    for (const line of game.log ?? []) console.log(line);
  }
}
