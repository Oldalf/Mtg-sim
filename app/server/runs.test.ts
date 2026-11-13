/**
 * Checks of the run calls (PLAN.md task 4) through a real server on a free port: a small goldfish run and a small pod
 * run play to the end and give their report and run folder; a second start during a run gets 409; a run can be
 * stopped; wrong requests get 400. The run folders the tests write are removed afterwards.
 */
import * as fs from 'fs';
import type { AddressInfo } from 'net';
import { DECKS } from '../../decks/index';
import {
  readIndex,
  readRunInfo,
  runFolderOf,
} from '../../engine/game-log-files';
import type {
  CurrentRunAnswer,
  RunRequest,
  RunState,
  StartRunAnswer,
} from '../api-types';
import { startServer } from './server';

const POLL_MILLISECONDS = 200;
const RUN_TIMEOUT_MILLISECONDS = 300_000;

function check(label: string, isGood: boolean): boolean {
  console.log(`${isGood ? 'OK ' : 'BAD'} ${label}`);
  return isGood;
}

/** Calls the API of the server on this port: a GET, or a POST with a JSON body. */
async function callApi<Body>(
  port: number,
  apiPath: string,
  postBody?: unknown,
): Promise<{ status: number; body: Body }> {
  const response = await fetch(`http://127.0.0.1:${port}${apiPath}`, {
    method: postBody === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: postBody === undefined ? undefined : JSON.stringify(postBody),
  });
  return { status: response.status, body: (await response.json()) as Body };
}

const wait = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

/** Asks for the current run until isWanted holds for it (or the timeout passes). */
async function pollRunUntil(
  port: number,
  isWanted: (state: RunState) => boolean,
): Promise<RunState> {
  const giveUpTime = Date.now() + RUN_TIMEOUT_MILLISECONDS;
  for (;;) {
    const { body: state } = await callApi<CurrentRunAnswer>(
      port,
      '/api/runs/current',
    );
    if (state && (isWanted(state) || Date.now() > giveUpTime)) return state;
    await wait(POLL_MILLISECONDS);
  }
}

const isOver = (state: RunState) => state.status !== 'running';

function goldfishRequest(games: number, lists: string[]): RunRequest {
  return {
    mode: 'goldfish',
    deck: 'meren',
    lists,
    games,
    settings: {},
    diag: false,
    powerSave: false,
  };
}

/** A goldfish run of two lists; a second start while it plays is refused. */
async function checkGoldfishRun(
  port: number,
  runFolders: string[],
): Promise<boolean> {
  const games = 60;
  const lists = [DECKS.meren.defaultList, DECKS.meren.defaultList];
  const started = await callApi<StartRunAnswer>(
    port,
    '/api/runs',
    goldfishRequest(games, lists),
  );
  const secondStart = await callApi(
    port,
    '/api/runs',
    goldfishRequest(games, lists),
  );
  const state = await pollRunUntil(port, isOver);
  runFolders.push(...state.runFolders);
  const report = state.report;
  const isEveryFolderIndexed = state.runFolders.every(
    (runName) => readIndex(runFolderOf(runName)).length === games,
  );
  return [
    check(
      'goldfish: POST /api/runs answers a run id',
      started.status === 200 && started.body.runId === state.runId,
    ),
    check('a second POST during a run gets 409', secondStart.status === 409),
    check(
      `goldfish: done with ${state.gamesPlayed} of ${state.gamesTotal} games in ${state.secondsSoFar}s`,
      state.status === 'done' &&
        state.gamesPlayed === 2 * games &&
        state.gamesTotal === 2 * games,
    ),
    check(
      'goldfish: the report has a kill-turn row per list, each with its run folder',
      report?.kind === 'kill-turns' &&
        report.rows.length === 2 &&
        report.rows.every(
          (row, index) => row.runFolder === state.runFolders[index],
        ),
    ),
    check(
      `goldfish: each run folder holds its ${games} games`,
      state.runFolders.length === 2 && isEveryFolderIndexed,
    ),
  ].every(Boolean);
}

async function checkPodRun(
  port: number,
  runFolders: string[],
): Promise<boolean> {
  const games = 40;
  const podDecks = ['gale', 'meren', 'samfrodo', 'aesi'];
  await callApi<StartRunAnswer>(port, '/api/runs', {
    mode: 'pod',
    decks: podDecks.map((deck) => ({ deck, list: DECKS[deck].defaultList })),
    games,
    rounds: 17,
    settings: {},
    powerSave: false,
  } satisfies RunRequest);
  const state = await pollRunUntil(port, isOver);
  runFolders.push(...state.runFolders);
  const report = state.report;
  return check(
    `pod: done with ${state.gamesPlayed} games, a report of ${podDecks.length} decks and its run folder`,
    state.status === 'done' &&
      state.gamesPlayed === games &&
      report?.kind === 'pod' &&
      report.decks.length === podDecks.length &&
      report.runFolder === state.runFolders[0] &&
      readIndex(runFolderOf(state.runFolders[0])).length === games,
  );
}

/** A big run is stopped once it has played some games: it ends as stopped, with run.json matching its index. */
async function checkStoppedRun(
  port: number,
  runFolders: string[],
): Promise<boolean> {
  const games = 20_000;
  await callApi(
    port,
    '/api/runs',
    goldfishRequest(games, [DECKS.meren.defaultList]),
  );
  await pollRunUntil(port, (state) => state.gamesPlayed > 0 || isOver(state));
  await callApi(port, '/api/runs/current/stop', {});
  const state = await pollRunUntil(port, isOver);
  runFolders.push(...state.runFolders);
  const runFolder = runFolderOf(state.runFolders[0]);
  const gamesLogged = readIndex(runFolder).length;
  return check(
    `stop: stopped with ${state.gamesPlayed} of ${games} games, ${gamesLogged} logged`,
    state.status === 'stopped' &&
      state.report === undefined &&
      state.gamesPlayed > 0 &&
      state.gamesPlayed < games &&
      gamesLogged === state.gamesPlayed &&
      readRunInfo(runFolder).gameCount === gamesLogged,
  );
}

/** Wrong requests are refused with 400 and start nothing. */
async function checkWrongRequests(port: number): Promise<boolean> {
  const goodRequest = goldfishRequest(10, [DECKS.meren.defaultList]);
  const wrongRequests: [string, unknown][] = [
    ['an unknown deck', { ...goodRequest, deck: 'nosuchdeck' }],
    ['0 games', { ...goodRequest, games: 0 }],
    ['too many games', { ...goodRequest, games: 50_001 }],
    ['a list outside the deck', { ...goodRequest, lists: ['../gale/x.txt'] }],
    ['an unknown setting', { ...goodRequest, settings: { nosuch: 1 } }],
    [
      'a setting of the wrong type',
      { ...goodRequest, settings: { max_turn: true } },
    ],
    ['an unknown mode', { ...goodRequest, mode: 'solitaire' }],
    [
      'a pod of two',
      {
        mode: 'pod',
        decks: [
          { deck: 'gale', list: DECKS.gale.defaultList },
          { deck: 'meren', list: DECKS.meren.defaultList },
        ],
        games: 10,
        rounds: 17,
        settings: {},
        powerSave: false,
      },
    ],
  ];
  const runBefore = await callApi<CurrentRunAnswer>(port, '/api/runs/current');
  let allRefused = true;
  for (const [what, request] of wrongRequests) {
    const answer = await callApi<{ error?: string }>(
      port,
      '/api/runs',
      request,
    );
    allRefused &&= check(
      `${what} is refused (${answer.status}: ${answer.body.error})`,
      answer.status === 400,
    );
  }
  const runAfter = await callApi<CurrentRunAnswer>(port, '/api/runs/current');
  return (
    check(
      'a refused request starts no run',
      runAfter.body?.runId === runBefore.body?.runId,
    ) && allRefused
  );
}

export async function runRunsTests(): Promise<boolean> {
  const server = await startServer(0);
  const port = (server.address() as AddressInfo).port;
  const runFolders: string[] = [];
  try {
    const results = [
      await checkGoldfishRun(port, runFolders),
      await checkPodRun(port, runFolders),
      await checkStoppedRun(port, runFolders),
      await checkWrongRequests(port),
    ];
    return results.every(Boolean);
  } finally {
    server.close();
    for (const runName of runFolders)
      fs.rmSync(runFolderOf(runName), { recursive: true, force: true });
  }
}
