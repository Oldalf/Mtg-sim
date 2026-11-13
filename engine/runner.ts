/**
 * Run many goldfish games for a deck, in parallel worker threads. Every list is played on the same seeds (1..n), so
 * differences between lists come from the cards. The tables are printed by report.ts, the card ranking is in ranking.ts.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Worker } from 'worker_threads';
import * as C from './cards';
import { Config } from './game-types';
import { Game } from './game';
import { goldfishGameLog } from './game-log';
import { GameIndexRow, gamesFileName, writeGamesFile } from './game-log-files';
import { describeKillTurns } from './game-log-run';
import { formatGameLog } from './game-log-text';
import { Rng } from './rng';

/** What a deck folder exports (decks/<name>/index.ts). */
export interface Deck {
  name: string;
  dir: string;
  defaultList: string;
  /** What the two numbers a game returns mean: [long name, short column name] for each.
   *  Default (Gale): first turn with any kill, and with counter backup. */
  metrics?: [[string, string], [string, string]];
  /** The turns shown in comparison tables (default: 6, 7 and the last turn). */
  compareTurns?: number[];
  /** Card ranking: decklist sections whose cards aren't judged (interaction is dead in a goldfish game, like
   *  counterspells), except the cards listed; and the turn the "win by" column uses (default 7). */
  rankProtect?: { sections: string[]; except?: string[]; cards?: string[] };
  rankTurn?: number;
  /** --diag: what to report per list from the games' diag() records plus "win" (the win turn, null = none).
   *  unit "%" = share of games, "turn" = a turn number, "n" = a plain number. */
  diagMetrics?: {
    label: string;
    unit: '%' | 'turn' | 'n';
    measure: (rows: DiagRow[]) => number;
  }[];
  /** --hands: yes/no questions about an opening hand (per deck), reported next to the outcome. */
  handFeatures?: { label: string; matches: (hand: C.CardDef[]) => boolean }[];
  /** Names the player uses in Archidekt logs as trackers, not cards (their counter is read by syncFromLog). */
  logTrackers?: string[];
  /** Tokens that are sacrificed whenever they're tapped (Food, Treasure): a tap in the log means they're gone. */
  logSacOnTap?: string[];
  /** Pod games: settings that differ from the goldfish ones (e.g. a win rule that only made sense against goldfish opponents). */
  podCfg?: (players: number) => Config;
  /** Every zone change in the deck's code goes through the engine's functions (takeCard, putCard, moveCard, draw,
   *  enter...). Then `--test` fails on a zone change that goes around them. */
  recordsExactMoves?: boolean;
  /** The deck handles drawing from its own empty library itself (Mike: Laboratory Maniac / Living Conundrum). */
  ownsDecking?: boolean;
  config: Config;
  Game: new (
    commanders: string[],
    library: string[],
    rng: Rng,
    config: Config,
    verbose?: boolean,
    mode?: 'any' | 'protected',
  ) => Game<unknown>;
}

/** Short names of a deck's two kill turns, for a line of text: ["win", "1st dead"]. */
export function killTurnNamesOf(deck: Deck): [string, string] {
  if (!deck.metrics) return ['win', 'win with backup'];
  return [deck.metrics[0][1] || 'win', deck.metrics[1][1]];
}

/** The two kill turns of a game (see Deck.metrics): the first turn with any kill, and with counter backup. Null = none. */
export type KillTurns = [number | null, number | null];

/** What a game reports for --diag: its win turn ("win") and the deck's own numbers from Game.diag(). */
export type DiagRow = Record<string, number | null>;

/** What to measure in a batch of games. */
type JobKind = 'kills' | 'seen4' | 'diag' | 'hands';

/** A batch of games for a worker thread to play. */
export interface Job {
  deck: string;
  list: string;
  seeds: number[];
  config: Config;
  what: JobKind;
  /** hands: 7 = the raw opening 7, 6 = draw 7 and bottom the least useful card (a mulligan to 6). */
  size?: number;
  /** Set to log the games: the run folder the job writes its games file to, and the job's number in the run. */
  logFolder?: string;
  jobNumber?: number;
}

/** A game's win turn and a list of card names: the opening hand (--hands), or the cards seen by turn 4 (--rank). */
type WinTurnAndCards = [number | null, string[]];

export type JobResult = {
  kills?: KillTurns[];
  seen4?: WinTurnAndCards[];
  diag?: DiagRow[];
  hands?: WinTurnAndCards[];
  /** One row per logged game (see game-log-files.ts). */
  logRows?: GameIndexRow[];
  errors: [number, string][];
};

// ================================================================ machine and files

/** Eco mode: each worker rests after every chunk of games so that it is busy only this percent of the time. */
let busyPercent = 100;
export function setDuty(percent: number): void {
  busyPercent = Math.min(100, Math.max(5, percent));
}

export function cpuCores(): number {
  return os.availableParallelism?.() ?? os.cpus().length;
}

/** One worker thread per core but one, so the machine stays usable. */
export function defaultWorkers(): number {
  return Math.max(1, cpuCores() - 1);
}

/** A decklist path as given, or relative to the deck's folder (e.g. lists/proposed.txt). */
export function resolveList(deck: Deck, listPath: string): string {
  if (fs.existsSync(listPath)) return listPath;
  const inDeckFolder = path.join(deck.dir, listPath);
  if (fs.existsSync(inDeckFolder)) return inDeckFolder;
  throw new Error(
    `decklist not found: ${listPath} (also looked in ${deck.dir})`,
  );
}

/** Stops with a hint if a list has cards without data; notes cards that are played generically. */
export function checkList(file: string): void {
  const decklist = C.loadDecklist(file);
  const total = decklist.commanders.length + decklist.library.length;
  if (decklist.missing.length) {
    // addMissingCards (scryfall.ts) already tried to find these cards
    console.log(`!! ${file}: no card data for: ${decklist.missing.join(', ')}`);
    process.exit(1);
  }
  if (decklist.generic.length)
    console.log(
      `Note (${path.basename(file)}): these cards have no special rules in the simulator and are played ` +
        `generically: ${decklist.generic.join(', ')}`,
    );
  if (total !== 100)
    console.log(
      `Note (${path.basename(file)}): deck has ${total} cards (expected 100).`,
    );
}

// ================================================================ playing games

function newGame(
  deck: Deck,
  decklist: C.Decklist,
  seed: number,
  config: Config,
  mode: 'any' | 'protected',
  verbose = false,
): Game<unknown> {
  return new deck.Game(
    decklist.commanders,
    decklist.library,
    new Rng(seed),
    config,
    verbose,
    mode,
  );
}

/** Plays the seeds of a job and collects what the job asks for. */
export function runJob(deck: Deck, job: Job): JobResult {
  const decklist = C.loadDecklist(job.list);
  const result: JobResult = { errors: [] };
  if (job.what === 'seen4') result.seen4 = [];
  else if (job.what === 'diag') result.diag = [];
  else if (job.what === 'hands') result.hands = [];
  else result.kills = [];

  const logFolder = job.logFolder;
  const isLogged = logFolder !== undefined;
  const gamesAsJson: string[] = [];
  if (isLogged) result.logRows = [];
  /** Keeps the log of a game for the job's games file, and its result for the index. */
  const keepLog = (
    seed: number,
    game: Game<unknown> | null,
    killTurns?: KillTurns,
    error?: string,
  ) => {
    if (!isLogged) return;
    result.logRows!.push({
      seed,
      file: gamesFileName(job.jobNumber!),
      line: gamesAsJson.length,
      tags: [],
      killTurns,
      error,
    });
    gamesAsJson.push(
      JSON.stringify(
        goldfishGameLog(seed, deck.name, decklist.commanders, game?.log ?? []),
      ),
    );
  };

  for (const seed of job.seeds) {
    let game: Game<unknown> | null = null;
    try {
      if (job.what === 'hands') {
        result.hands!.push(playOpeningHand(deck, decklist, seed, job));
        continue;
      }
      // "kills": one game gives both kill turns: until the first kill appears the "any" and "protected" games
      // make identical choices, and the protected game records that first kill too
      const mode = job.what === 'kills' ? 'protected' : 'any';
      game = newGame(deck, decklist, seed, job.config, mode, isLogged);
      const killTurns = game.play();
      const [anyKillTurn] = killTurns;
      if (job.what === 'diag')
        result.diag!.push({ win: anyKillTurn, ...game.diag() });
      else if (job.what === 'seen4') {
        if (game.seen4 !== null)
          result.seen4!.push([anyKillTurn, [...game.seen4]]);
      } else result.kills!.push(killTurns);
      keepLog(seed, game, killTurns);
    } catch (error) {
      // a simulator bug in one game must not kill the whole run
      const message =
        error instanceof Error ? (error.stack ?? error.message) : String(error);
      result.errors.push([seed, message]);
      keepLog(seed, game, undefined, message); // the log up to the crash
    }
  }
  if (isLogged) writeGamesFile(logFolder, job.jobNumber!, gamesAsJson);
  return result;
}

/** --hands: the opening hand is the first 7 cards (no mulligan); size 6 puts the least useful card on the bottom. */
function playOpeningHand(
  deck: Deck,
  decklist: C.Decklist,
  seed: number,
  job: Job,
): WinTurnAndCards {
  const game = newGame(deck, decklist, seed, job.config, 'any');
  let handNames: string[] = [];
  game.mulligan = function (this: Game<unknown>) {
    this.hand = this.library.splice(0, 7);
    if (job.size === 6) {
      let worst = this.hand[0];
      for (const card of this.hand)
        if (this.cardValue(card) < this.cardValue(worst)) worst = card;
      this.hand.splice(this.hand.indexOf(worst), 1);
      this.library.push(worst);
    }
    handNames = this.hand.map((card) => card.name);
  };
  const [anyKillTurn] = game.play();
  return [anyKillTurn, handNames];
}

/** Play seeds 1..n in worker threads; the same bundle (dist/sim.js) runs as each worker.
 *  logFolder: a run folder (game-log-files.ts) to write every game's log to. */
export async function simulate(
  deck: Deck,
  listFile: string,
  gameCount: number,
  config: Config,
  workers: number,
  what: JobKind = 'kills',
  handSize = 7,
  logFolder?: string,
): Promise<JobResult> {
  const seeds = Array.from({ length: gameCount }, (_, i) => i + 1);
  const chunkSize = Math.max(1, Math.floor(gameCount / (workers * 8)));
  const jobs: Job[] = [];
  for (let start = 0; start < gameCount; start += chunkSize)
    jobs.push({
      deck: deck.name,
      list: listFile,
      seeds: seeds.slice(start, start + chunkSize),
      config: config,
      what,
      size: handSize,
      logFolder,
      jobNumber: jobs.length,
    });
  const resultOfJob: JobResult[] = new Array(jobs.length);
  let nextJob = 0;
  const pool = Array.from(
    { length: Math.min(workers, jobs.length) },
    () => new Worker(__filename, { workerData: 'sim-worker' }),
  );
  await Promise.all(
    pool.map(
      (worker) =>
        new Promise<void>((resolve, reject) => {
          const giveNextJob = () => {
            if (nextJob >= jobs.length) {
              worker.terminate().then(() => resolve());
              return;
            }
            const jobIndex = nextJob++;
            const startTime = Date.now();
            worker.once('message', (result: JobResult) => {
              resultOfJob[jobIndex] = result;
              const restMilliseconds =
                busyPercent < 100
                  ? (Date.now() - startTime) * (100 / busyPercent - 1)
                  : 0;
              if (restMilliseconds > 1)
                setTimeout(giveNextJob, restMilliseconds);
              else giveNextJob();
            });
            worker.postMessage(jobs[jobIndex]);
          };
          worker.on('error', reject);
          giveNextJob();
        }),
    ),
  );
  return mergeResults(what, resultOfJob);
}

function mergeResults(what: JobKind, results: JobResult[]): JobResult {
  const merged: JobResult = { errors: [] };
  if (what === 'seen4')
    merged.seen4 = results.flatMap((result) => result.seen4 ?? []);
  else if (what === 'diag')
    merged.diag = results.flatMap((result) => result.diag ?? []);
  else if (what === 'hands')
    merged.hands = results.flatMap((result) => result.hands ?? []);
  else merged.kills = results.flatMap((result) => result.kills ?? []);
  if (results.some((result) => result.logRows))
    merged.logRows = results.flatMap((result) => result.logRows ?? []);
  merged.errors = results.flatMap((result) => result.errors);
  if (merged.errors.length) {
    console.log(
      `!! ${merged.errors.length} game(s) hit a simulator bug and were skipped (seeds ` +
        `${merged.errors
          .slice(0, 10)
          .map((error) => error[0])
          .join(', ')}). First error:\n${merged.errors[0][1]}`,
    );
  }
  return merged;
}

/** --trace: plays a few games with the full play-by-play log. */
export function trace(
  deck: Deck,
  listFile: string,
  config: Config,
  firstSeed: number,
  gameCount: number,
  mode: 'any' | 'protected',
  showMoves = false,
): void {
  const decklist = C.loadDecklist(listFile);
  for (let seed = firstSeed; seed < firstSeed + gameCount; seed++) {
    const game = newGame(deck, decklist, seed, config, mode, true);
    const killTurns = game.play();
    const gameLog = goldfishGameLog(
      seed,
      deck.name,
      decklist.commanders,
      game.log,
    );
    const title = `Game, seed ${seed}: ${describeKillTurns(killTurns, killTurnNamesOf(deck))}`;
    console.log('\n' + formatGameLog(gameLog, { title, showMoves }));
  }
}
