/**
 * The run calls of the API (PLAN.md task 4): start a run, follow it, stop it. One run at a time (decision 4); the
 * last run is kept so the page can read its report. Every run is logged to session-logs/, as on the command line.
 */
import * as path from 'path';
import { DECKS } from '../../decks/index';
import { correctGameCount } from '../../engine/game-log-files';
import { finishLoggedRun } from '../../engine/game-log-run';
import { Config } from '../../engine/game-types';
import {
  createGoldfishRunFolder,
  createPodRunFolder,
  GoldfishMeasure,
} from '../../engine/logged-runs';
import * as Pod from '../../engine/pod';
import { buildPodReport } from '../../engine/pod-report';
import { PodSpec } from '../../engine/pod-types';
import {
  POWER_SAVE_BUSY_PERCENT,
  powerSaveWorkers,
  setLowPriority,
} from '../../engine/power-save';
import {
  buildDiagReport,
  buildKillTurnReport,
  table,
} from '../../engine/report';
import * as Runner from '../../engine/runner';
import { RunControl } from '../../engine/worker-pool';
import type {
  CurrentRunAnswer,
  GameIndexRow,
  GoldfishRunRequest,
  PodRunRequest,
  RunReport,
  RunState,
  StartRunAnswer,
} from '../api-types';
import { RequestError } from './decks-routes';
import { checkRunRequest } from './run-requests';

/** The run in progress, or the last one. */
interface AppRun {
  state: RunState;
  startTime: number;
  /** Set when the run is over, so its seconds stop counting. */
  endTime?: number;
  stopper: AbortController;
}

/** A run that has been checked and is ready to play. play() resolves with the report, or undefined when stopped. */
interface PreparedRun {
  gamesTotal: number;
  play: (run: AppRun) => Promise<RunReport | undefined>;
}

let currentRun: AppRun | undefined;
let runsStarted = 0;

// ================================================================ the calls

/** POST /api/runs: checks the request and starts the run; answers before its games are played. */
export function startRun(body: unknown): StartRunAnswer {
  if (currentRun?.state.status === 'running')
    throw new RequestError(409, 'a run is going: wait for it or stop it');
  const request = checkRunRequest(body);
  const prepared =
    request.mode === 'goldfish'
      ? prepareGoldfishRun(request)
      : preparePodRun(request);
  const run: AppRun = {
    state: {
      runId: String(++runsStarted),
      request,
      status: 'running',
      gamesPlayed: 0,
      gamesTotal: prepared.gamesTotal,
      secondsSoFar: 0,
      runFolders: [],
    },
    startTime: Date.now(),
    stopper: new AbortController(),
  };
  currentRun = run;
  void playRun(run, prepared, request.powerSave);
  return { runId: run.state.runId };
}

/** GET /api/runs/current */
export function answerCurrentRun(): CurrentRunAnswer {
  if (!currentRun) return null;
  const endTime = currentRun.endTime ?? Date.now();
  const seconds = (endTime - currentRun.startTime) / 1000;
  return { ...currentRun.state, secondsSoFar: Math.round(seconds * 10) / 10 };
}

/** POST /api/runs/current/stop: asks the run to stop (it ends within moments) and answers its state. */
export function stopCurrentRun(): CurrentRunAnswer {
  if (currentRun?.state.status === 'running') currentRun.stopper.abort();
  return answerCurrentRun();
}

// ================================================================ playing a run

/** Workers and their busy share: all but one core, or what power-save mode (--eco) uses. */
function machineUse(powerSave: boolean): {
  workers: number;
  busyPercent: number;
} {
  return powerSave
    ? { workers: powerSaveWorkers(), busyPercent: POWER_SAVE_BUSY_PERCENT }
    : { workers: Runner.defaultWorkers(), busyPercent: 100 };
}

async function playRun(
  run: AppRun,
  prepared: PreparedRun,
  powerSave: boolean,
): Promise<void> {
  setLowPriority(powerSave);
  try {
    const report = await prepared.play(run);
    run.state.report = report;
    run.state.status = report ? 'done' : 'stopped';
  } catch (error) {
    run.state.status = 'failed';
    run.state.error = error instanceof Error ? error.message : String(error);
    console.error(error);
  } finally {
    setLowPriority(false);
    Runner.setDuty(100);
    run.endTime = Date.now();
  }
}

/** Progress of one part of a run (a list), counted on top of the games its earlier parts played. */
function controlOf(run: AppRun): RunControl {
  const gamesBefore = run.state.gamesPlayed;
  return {
    stopSignal: run.stopper.signal,
    onProgress: (gamesPlayed) => {
      run.state.gamesPlayed = gamesBefore + gamesPlayed;
    },
  };
}

/** Tags and indexes the games of a run folder; a stopped one says in run.json how many games it holds. */
function finishRunFolder(
  runFolder: string,
  rows: GameIndexRow[],
  wasStopped: boolean,
): void {
  finishLoggedRun(runFolder, rows);
  if (wasStopped) correctGameCount(runFolder, rows.length);
}

// ================================================================ goldfish

/** One list played with one set of settings: a row of the report. */
interface ListPlay {
  listFile: string;
  label: string;
  config: Config;
  /** Added to the run folder's name ("-default", "-changed"). */
  folderSuffix: string;
}

/** The lists to play, as the command line plays them: with one list and changed settings, default against changed. */
function planListPlays(
  request: GoldfishRunRequest,
  deck: Runner.Deck,
  defaultConfig: Config,
): ListPlay[] {
  const configWithSettings = { ...defaultConfig, ...request.settings };
  const changedSettings = Object.entries(request.settings).filter(
    ([name, value]) => defaultConfig[name] !== value,
  );
  const listFiles = request.lists.map((list) => Runner.resolveList(deck, list));
  if (!request.diag && listFiles.length === 1 && changedSettings.length)
    return [
      {
        listFile: listFiles[0],
        label: 'default',
        config: defaultConfig,
        folderSuffix: '-default',
      },
      {
        listFile: listFiles[0],
        label: changedSettings
          .map(([name, value]) => `${name}=${value}`)
          .join(' '),
        config: configWithSettings,
        folderSuffix: '-changed',
      },
    ];
  return listFiles.map((listFile) => ({
    listFile,
    label: path.basename(listFile),
    config: configWithSettings,
    folderSuffix: '',
  }));
}

function prepareGoldfishRun(request: GoldfishRunRequest): PreparedRun {
  const deck = DECKS[request.deck];
  const defaultConfig: Config = { ...deck.config };
  if (request.turns) defaultConfig.max_turn = request.turns;
  const plays = planListPlays(request, deck, defaultConfig);
  const measure: GoldfishMeasure = request.diag ? 'diag' : 'kills';
  return {
    gamesTotal: plays.length * request.games,
    play: async (run) => {
      const { workers, busyPercent } = machineUse(request.powerSave);
      Runner.setDuty(busyPercent);
      const results: Runner.JobResult[] = [];
      for (const listPlay of plays) {
        const result = await playList(
          run,
          deck,
          listPlay,
          request.games,
          measure,
          workers,
        );
        if (result.wasStopped) return undefined;
        results.push(result);
      }
      return goldfishReport(
        request,
        deck,
        defaultConfig,
        plays.map((listPlay) => listPlay.label),
        results,
        run.state.runFolders,
      );
    },
  };
}

/** Plays the games of one list into a new run folder. */
async function playList(
  run: AppRun,
  deck: Runner.Deck,
  listPlay: ListPlay,
  gameCount: number,
  measure: GoldfishMeasure,
  workers: number,
): Promise<Runner.JobResult> {
  const runFolder = createGoldfishRunFolder(
    deck,
    listPlay.listFile,
    gameCount,
    listPlay.config,
    measure,
    listPlay.folderSuffix,
  );
  run.state.runFolders.push(path.basename(runFolder));
  const result = await Runner.simulate(
    deck,
    listPlay.listFile,
    gameCount,
    listPlay.config,
    workers,
    measure,
    7,
    runFolder,
    controlOf(run),
  );
  finishRunFolder(runFolder, result.logRows ?? [], result.wasStopped === true);
  return result;
}

/** The kill-turn table of each list (or the --diag measures), each row with its run folder. */
function goldfishReport(
  request: GoldfishRunRequest,
  deck: Runner.Deck,
  defaultConfig: Config,
  labels: string[],
  results: Runner.JobResult[],
  runFolders: string[],
): RunReport {
  if (request.diag) {
    const report = buildDiagReport(
      deck,
      labels,
      results.map((result) => result.diag!),
      request.games,
    );
    report.rows.forEach((row, index) => (row.runFolder = runFolders[index]));
    return report;
  }
  const maxTurn = defaultConfig.max_turn as number;
  const report = buildKillTurnReport(
    labels,
    results.map((result) => table(result.kills!, maxTurn)),
    defaultConfig,
    request.games,
    deck.metrics,
    deck.compareTurns,
  );
  report.rows.forEach((row, index) => (row.runFolder = runFolders[index]));
  return report;
}

// ================================================================ pod

/** The pod as the engine plays it. podSpec's own checks (threat, policy) become a 400 answer. */
function buildPodSpec(request: PodRunRequest): PodSpec {
  try {
    return Pod.podSpec(
      DECKS,
      request.decks.map((seat) => `${seat.deck}:${seat.list}`),
      request.rounds,
      request.settings,
      request.threat,
      request.policy,
    );
  } catch (error) {
    throw new RequestError(
      400,
      error instanceof Error ? error.message : String(error),
    );
  }
}

function preparePodRun(request: PodRunRequest): PreparedRun {
  const podSpec = buildPodSpec(request);
  return {
    gamesTotal: request.games,
    play: async (run) => {
      const { workers, busyPercent } = machineUse(request.powerSave);
      const runFolder = createPodRunFolder(podSpec, request.games);
      run.state.runFolders.push(path.basename(runFolder));
      const result = await Pod.simulatePod(
        podSpec,
        request.games,
        workers,
        busyPercent,
        runFolder,
        controlOf(run),
      );
      finishRunFolder(
        runFolder,
        result.logRows ?? [],
        result.wasStopped === true,
      );
      if (result.wasStopped) return undefined;
      return {
        ...buildPodReport(podSpec, result.games),
        runFolder: path.basename(runFolder),
      };
    },
  };
}
