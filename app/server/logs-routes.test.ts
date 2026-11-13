/**
 * Checks of the game log calls (PLAN.md task 5) through a real server on a free port: a small goldfish run and a small
 * pod run are written with the engine's functions, then listed and read through the API; wrong names are refused; and
 * every real log of every deck loads. The run folders the test writes are removed afterwards.
 */
import * as fs from 'fs';
import * as path from 'path';
import type { AddressInfo } from 'net';
import { DECKS } from '../../decks/index';
import { runFolderOf } from '../../engine/game-log-files';
import { finishLoggedRun } from '../../engine/game-log-run';
import {
  createGoldfishRunFolder,
  createPodRunFolder,
} from '../../engine/logged-runs';
import * as Pod from '../../engine/pod';
import * as Runner from '../../engine/runner';
import type {
  GameAnswer,
  GamesAnswer,
  LogsAnswer,
  RealLogsAnswer,
} from '../api-types';
import { forgetUnzippedGamesFile } from './logs-routes';
import { startServer } from './server';

const GAME_COUNT = 30;
const WORKERS = 2;

function check(label: string, isGood: boolean): boolean {
  console.log(`${isGood ? 'OK ' : 'BAD'} ${label}`);
  return isGood;
}

async function getJson<Body>(
  port: number,
  apiPath: string,
): Promise<{ status: number; body: Body }> {
  const response = await fetch(`http://127.0.0.1:${port}${apiPath}`);
  return { status: response.status, body: (await response.json()) as Body };
}

/** Plays and logs a small goldfish run. Returns its folder name. */
async function writeGoldfishRun(): Promise<string> {
  const deck = DECKS.meren;
  const listFile = path.join(deck.dir, deck.defaultList);
  const runFolder = createGoldfishRunFolder(
    deck,
    listFile,
    GAME_COUNT,
    {},
    'kills',
  );
  const result = await Runner.simulate(
    deck,
    listFile,
    GAME_COUNT,
    {},
    WORKERS,
    'kills',
    7,
    runFolder,
  );
  finishLoggedRun(runFolder, result.logRows ?? []);
  return path.basename(runFolder);
}

/** Plays and logs a small pod run. Returns its folder name. */
async function writePodRun(): Promise<string> {
  const podSpec = Pod.podSpec(
    DECKS,
    ['gale', 'meren', 'samfrodo'].map(
      (name) => `${name}:${DECKS[name].defaultList}`,
    ),
    17,
    {},
  );
  const runFolder = createPodRunFolder(podSpec, GAME_COUNT);
  const result = await Pod.simulatePod(
    podSpec,
    GAME_COUNT,
    WORKERS,
    100,
    runFolder,
  );
  finishLoggedRun(runFolder, result.logRows ?? []);
  return path.basename(runFolder);
}

async function checkRuns(
  port: number,
  goldfishName: string,
  podName: string,
): Promise<boolean> {
  const logs = await getJson<LogsAnswer>(port, '/api/logs');
  const goldfish = logs.body.find((run) => run.info.name === goldfishName);
  const pod = logs.body.find((run) => run.info.name === podName);
  const allGames = await getJson<GamesAnswer>(
    port,
    `/api/logs/${goldfishName}/games`,
  );
  const firstRow = allGames.body.rows[0];
  const page = await getJson<GamesAnswer>(
    port,
    `/api/logs/${goldfishName}/games?from=5&count=10`,
  );
  const firstTag = Object.keys(goldfish?.tagCounts ?? {})[0];
  const tagged = await getJson<GamesAnswer>(
    port,
    `/api/logs/${goldfishName}/games?tag=${firstTag}`,
  );
  const game = await getJson<GameAnswer>(
    port,
    `/api/logs/${goldfishName}/games/${firstRow.seed}`,
  );
  const secondGame = await getJson<GameAnswer>(
    port,
    `/api/logs/${goldfishName}/games/${allGames.body.rows[1].seed}`,
  );
  const podGames = await getJson<GamesAnswer>(
    port,
    `/api/logs/${podName}/games`,
  );
  const wonByFirstDeck = await getJson<GamesAnswer>(
    port,
    `/api/logs/${podName}/games?winner=0`,
  );
  const expectedWins = podGames.body.rows.filter(
    (row) => row.pod?.winner === 0,
  ).length;
  return [
    check(
      'GET /api/logs lists both runs with their tag counts',
      goldfish?.info.gameCount === GAME_COUNT &&
        pod?.info.mode === 'pod' &&
        firstTag !== undefined,
    ),
    check(
      'the games list has every game with its result in words',
      allGames.body.total === GAME_COUNT &&
        allGames.body.rows.length === GAME_COUNT &&
        firstRow.result.length > 0,
    ),
    check(
      'from and count give one page',
      page.body.total === GAME_COUNT &&
        page.body.rows.length === 10 &&
        page.body.rows[0].seed === allGames.body.rows[5].seed,
    ),
    check(
      'the tag filter keeps only games with the tag',
      tagged.body.total === goldfish?.tagCounts[firstTag] &&
        tagged.body.rows.every((row) => row.tags.includes(firstTag)),
    ),
    check(
      'a game comes back as its GameLog (and a second one from the same file)',
      game.status === 200 &&
        game.body.seed === firstRow.seed &&
        game.body.events.length > 0 &&
        secondGame.body.seed === allGames.body.rows[1].seed,
    ),
    check(
      'the winner filter keeps only the pod games that deck won',
      podGames.body.total === GAME_COUNT &&
        wonByFirstDeck.body.total === expectedWins &&
        wonByFirstDeck.body.rows.every((row) => row.pod?.winner === 0),
    ),
    check(
      'an unknown run, an unknown seed and a bad count are refused',
      (await getJson(port, '/api/logs/99-nosuch/games')).status === 404 &&
        (await getJson(port, `/api/logs/${goldfishName}/games/-5`)).status ===
          404 &&
        (await getJson(port, `/api/logs/${goldfishName}/games?count=x`))
          .status === 400,
    ),
  ].every(Boolean);
}

async function checkRealLogs(port: number): Promise<boolean> {
  let allLoaded = true;
  let logCount = 0;
  for (const deckName of Object.keys(DECKS)) {
    const fileNames = await getJson<RealLogsAnswer>(
      port,
      `/api/decks/${deckName}/logs`,
    );
    allLoaded &&= fileNames.status === 200;
    for (const fileName of fileNames.body) {
      const log = await getJson<GameAnswer>(
        port,
        `/api/decks/${deckName}/logs/${encodeURIComponent(fileName)}`,
      );
      logCount++;
      allLoaded &&= log.status === 200 && log.body.events.length > 0;
    }
  }
  const outsideLogsFolder = await getJson(
    port,
    '/api/decks/gale/logs/..%2FPRIMER.txt',
  );
  return [
    check(`every real log of every deck loads (${logCount})`, allLoaded),
    check(
      'a log name that leaves the logs folder is refused',
      outsideLogsFolder.status === 400,
    ),
  ].every(Boolean);
}

export async function runLogsRoutesTests(): Promise<boolean> {
  const server = await startServer(0);
  const port = (server.address() as AddressInfo).port;
  const runNames: string[] = [];
  try {
    runNames.push(await writeGoldfishRun());
    runNames.push(await writePodRun());
    const runsPassed = await checkRuns(port, runNames[0], runNames[1]);
    const realLogsPassed = await checkRealLogs(port);
    return runsPassed && realLogsPassed;
  } finally {
    server.close();
    forgetUnzippedGamesFile();
    for (const runName of runNames)
      fs.rmSync(runFolderOf(runName), { recursive: true, force: true });
  }
}
