/**
 * Checks of progress and stopping (worker-pool.ts) on real runs: a goldfish run and a pod run are stopped part way,
 * and must hand back the games played so far; a stopped logged run still gets its index. Run: npm run app -- --test
 */
import * as fs from 'fs';
import { createRunFolder, readGame, readIndex } from './game-log-files';
import { finishLoggedRun } from './game-log-run';
import { podSpec, simulatePod } from './pod';
import { Deck, defaultWorkers, resolveList, simulate } from './runner';
import { RunControl } from './worker-pool';

const GOLDFISH_GAMES = 2000;
const POD_GAMES = 2000;
const POD_DECKS = ['gale', 'meren', 'samfrodo', 'aesi'];
const POD_ROUNDS_CAP = 20;

function check(label: string, isGood: boolean): boolean {
  console.log(`${isGood ? 'OK ' : 'BAD'} ${label}`);
  return isGood;
}

/** A run control that records every progress report and stops the run once it has played stopAfterGames. */
function stoppingControl(stopAfterGames: number): {
  control: RunControl;
  progress: number[];
} {
  const stopper = new AbortController();
  const progress: number[] = [];
  const control: RunControl = {
    stopSignal: stopper.signal,
    onProgress: (gamesPlayed) => {
      progress.push(gamesPlayed);
      if (gamesPlayed >= stopAfterGames) stopper.abort();
    },
  };
  return { control, progress };
}

const isGrowing = (numbers: number[]) =>
  numbers.length >= 2 &&
  numbers.every((number, i) => i === 0 || number > numbers[i - 1]);

/** A logged goldfish run of 2,000 games, stopped after about a fifth. */
async function checkStoppedGoldfishRun(deck: Deck): Promise<boolean> {
  const listFile = resolveList(deck, deck.defaultList);
  const runFolder = createRunFolder(
    `${deck.name}-stop-test`,
    {
      mode: 'goldfish',
      gameCount: GOLDFISH_GAMES,
      decks: [deck.name],
      config: deck.config,
      gameMode: 'protected',
    },
    [listFile],
  );
  try {
    const { control, progress } = stoppingControl(GOLDFISH_GAMES / 5);
    const result = await simulate(
      deck,
      listFile,
      GOLDFISH_GAMES,
      deck.config,
      defaultWorkers(),
      'kills',
      7,
      runFolder,
      control,
    );
    const gamesPlayed = result.kills!.length;
    const run = finishLoggedRun(runFolder, result.logRows!);
    const index = readIndex(runFolder);
    let isEveryGameReadable = true;
    for (const row of index)
      if (readGame(runFolder, row).seed !== row.seed)
        isEveryGameReadable = false;
    return [
      check(
        `goldfish: progress grows (${progress.join(', ')})`,
        isGrowing(progress),
      ),
      check(
        `goldfish: stopped with ${gamesPlayed} of ${GOLDFISH_GAMES} games`,
        result.wasStopped === true &&
          gamesPlayed > 0 &&
          gamesPlayed < GOLDFISH_GAMES &&
          gamesPlayed === progress[progress.length - 1],
      ),
      check(
        `goldfish: the index of the stopped run has its ${index.length} games, each readable`,
        index.length === gamesPlayed &&
          run.gameCount === gamesPlayed &&
          isEveryGameReadable,
      ),
    ].every(Boolean);
  } finally {
    fs.rmSync(runFolder, { recursive: true, force: true });
  }
}

/** A pod run of 2,000 games, stopped after its first jobs. */
async function checkStoppedPodRun(
  decks: Record<string, Deck>,
): Promise<boolean> {
  const spec = podSpec(decks, POD_DECKS, POD_ROUNDS_CAP, {});
  const { control, progress } = stoppingControl(1);
  const result = await simulatePod(
    spec,
    POD_GAMES,
    defaultWorkers(),
    100,
    undefined,
    control,
  );
  const gamesPlayed = result.games.length + result.errors.length;
  return check(
    `pod: stopped with ${gamesPlayed} of ${POD_GAMES} games`,
    result.wasStopped === true &&
      gamesPlayed > 0 &&
      gamesPlayed < POD_GAMES &&
      gamesPlayed === progress[progress.length - 1],
  );
}

/** A small run that is not stopped plays every game and says so. */
async function checkFullRun(deck: Deck): Promise<boolean> {
  const gameCount = 100;
  const progress: number[] = [];
  const result = await simulate(
    deck,
    resolveList(deck, deck.defaultList),
    gameCount,
    deck.config,
    defaultWorkers(),
    'kills',
    7,
    undefined,
    { onProgress: (gamesPlayed) => progress.push(gamesPlayed) },
  );
  return check(
    `goldfish: a run that is not stopped plays all ${gameCount} games`,
    result.wasStopped === false &&
      result.kills!.length === gameCount &&
      progress[progress.length - 1] === gameCount,
  );
}

export async function runRunControlTests(
  decks: Record<string, Deck>,
): Promise<boolean> {
  const results = [
    await checkStoppedGoldfishRun(decks.meren),
    await checkStoppedPodRun(decks),
    await checkFullRun(decks.meren),
  ];
  return results.every(Boolean);
}
