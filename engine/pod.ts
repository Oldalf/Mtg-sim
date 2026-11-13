/**
 * Pod simulation: several decks play against each other (see POD_PLAN.md).
 *
 * Each player keeps its own Game (its hand, battlefield, mana and AI). The pod owns the shared truth: who is alive,
 * each player's life, library and poison, and the turn order (see pod-table.ts). Before a player's turn the pod
 * writes the other players into that game's opponent arrays; after the turn it reads them back and applies what
 * changed to the real players. So a deck's "each opponent loses 1" hits real decks.
 *
 * What a pod game has, and where it lives:
 *  - A race: shared life, elimination, declared wins (a combo or kill line wins on the spot).
 *  - Real combat: an attack goes at one chosen opponent, who blocks with its real untapped creatures by the shared
 *    rule (pod-blocking.ts); creatures die; 21 combat damage from one commander kills (pod-combat.ts). With
 *    `--set pod_race=true` this is switched off and each deck's goldfish combat rule decides what connects.
 *  - Interaction (pod-interaction.ts; engine/answers.ts lists the cards). When a deck declares a win in the middle of
 *    its turn, the others may answer at instant speed with the mana they left untapped. A big spell may be countered
 *    when it is cast. After its own turn a deck uses removal on the biggest threat and a board wipe when far behind.
 *    `--set pod_answers=false` switches all of this off.
 *  - Threat: each player has a threat score (Game.threat: board, mana, hand, damage dealt, the deck's own "close to
 *    winning"). Attacks lean to the biggest threat (`--set threat=leader`, the default), or spread (the player we've
 *    hurt least), weakest (the lowest life) or damage (where the attack does most). Removal and counterspells aim at
 *    the biggest threat.
 *
 * This file plays a game round by round, and runs many games in worker threads.
 *
 *   npm run pod -- gale meren samfrodo aesi mike -n 1000       (a deck may name its list: gale:lists/proposed.txt)
 */
import { Worker } from 'worker_threads';
import { Config } from './game-types';
import { gamesFileName, writeGamesFile } from './game-log-files';
import { buildArena } from './pod-arena';
import { useRemovalAfterTurn } from './pod-interaction';
import { PodTable } from './pod-table';
import { PodGame, PodJob, PodJobResult, PodSpec } from './pod-types';
import { Deck, resolveList } from './runner';

/** Play one pod game. */
export function playPod(
  allDecks: Record<string, Deck>,
  spec: PodSpec,
  seed: number,
  verbose = false,
): PodGame {
  return playRounds(seatPlayers(allDecks, spec, seed, verbose), spec);
}

/** A new table with every player seated and holding an opening hand. */
export function seatPlayers(
  allDecks: Record<string, Deck>,
  spec: PodSpec,
  seed: number,
  verbose: boolean,
): PodTable {
  const table = new PodTable(allDecks, spec, seed, verbose);
  if (table.isRealCombat) {
    const arena = buildArena(table);
    for (const game of table.games) game.arena = arena;
  }
  for (const game of table.games) game.setup();
  return table;
}

/** Plays the game at a table to its end. */
export function playRounds(table: PodTable, spec: PodSpec): PodGame {
  for (table.round = 1; table.round <= spec.cap; table.round++) {
    for (const player of table.turnOrder) {
      if (!table.isAlive[player]) continue;
      const finishedGame = playTurn(table, player);
      if (finishedGame) return finishedGame;
    }
  }
  table.logRemainingCardMoves();
  return table.result(null, spec.cap, 'cap');
}

/** One player's turn. Returns the finished game if the turn ended it. */
function playTurn(table: PodTable, player: number): PodGame | null {
  const game = table.games[player];
  const round = table.round;
  if (game.library.length === 0 && !table.decks[player].ownsDecking) {
    // would draw from an empty library
    table.eliminate(player, 'decked');
    const left = table.livingPlayers();
    if (left.length === 1) return lastStandingWins(table, left[0]);
    return null;
  }

  table.prepareTurn(player);
  const waitsBefore = game.podWaits;
  table.startTurnLog(player);
  const declaredWin = game.takeTurn();
  game.pendingCrackback = 0;
  table.flushCurrentPlayerLog();
  table.currentPlayer = -1;
  if (game.podWaits > waitsBefore) table.stats.waited[player]++;

  // what this turn did to the others
  table.applyChangesFrom(player);
  if (game.died) table.eliminate(player, 'its own doing');
  table.eliminateLosers();
  const left = table.livingPlayers();
  if (declaredWin && table.isAlive[player]) {
    // the deck says it has won: a combo, a kill line, or its own win rule
    const how = left.length === 1 ? 'last standing' : 'declared';
    table.sayAs(player, `WINS (${how})`, 'win');
    table.logRemainingCardMoves();
    return table.result(player, round, how);
  }
  if (left.length === 1) return lastStandingWins(table, left[0]);
  if (left.length === 0) return table.result(null, round, 'nobody left');
  if (table.answersEnabled && table.isAlive[player])
    table.runOffTurn(() => useRemovalAfterTurn(table, player));
  return null;
}

function lastStandingWins(table: PodTable, winner: number): PodGame {
  table.sayAs(winner, 'WINS (last standing)', 'win');
  table.logRemainingCardMoves();
  return table.result(winner, table.round, 'last standing');
}

export function runPodJob(
  all: Record<string, Deck>,
  job: PodJob,
): PodJobResult {
  const result: PodJobResult = { games: [], errors: [] };
  const logFolder = job.logFolder;
  const isLogged = logFolder !== undefined;
  const gamesAsJson: string[] = [];
  if (isLogged) result.logRows = [];
  /** Keeps the log of a game for the job's games file, and its result for the index. */
  const keepLog = (
    seed: number,
    table: PodTable | null,
    game?: PodGame,
    error?: string,
  ) => {
    if (!isLogged || table === null) return;
    result.logRows!.push({
      seed,
      file: gamesFileName(job.jobNumber!),
      line: gamesAsJson.length,
      tags: [],
      pod: game,
      error,
    });
    gamesAsJson.push(JSON.stringify(table.gameLog()));
  };

  for (const seed of job.seeds) {
    let table: PodTable | null = null;
    try {
      table = seatPlayers(all, job.pod, seed, isLogged);
      // the log goes to the games file, not back to the main thread
      const game: PodGame = { ...playRounds(table, job.pod), log: undefined };
      result.games.push(game);
      keepLog(seed, table, game);
    } catch (error) {
      const message =
        error instanceof Error ? (error.stack ?? error.message) : String(error);
      result.errors.push([seed, message]);
      keepLog(seed, table, undefined, message); // the log up to the crash
    }
  }
  if (isLogged) writeGamesFile(logFolder, job.jobNumber!, gamesAsJson);
  return result;
}

/** Play seeds 1..n in worker threads (the same bundle runs as each worker; see sim.ts).
 *  logFolder: a run folder (game-log-files.ts) to write every game's log to. */
export async function simulatePod(
  spec: PodSpec,
  gameCount: number,
  workers: number,
  duty: number,
  logFolder?: string,
): Promise<PodJobResult> {
  const seeds = Array.from({ length: gameCount }, (_, i) => i + 1);
  const chunk = Math.max(1, Math.floor(gameCount / (workers * 8)));
  const jobs: PodJob[] = [];
  for (let i = 0; i < gameCount; i += chunk)
    jobs.push({
      pod: spec,
      seeds: seeds.slice(i, i + chunk),
      logFolder,
      jobNumber: jobs.length,
    });
  const results: PodJobResult[] = new Array(jobs.length);
  let next = 0;
  const pool = Array.from(
    { length: Math.min(workers, jobs.length) },
    () => new Worker(__filename, { workerData: 'sim-worker' }),
  );
  await Promise.all(
    pool.map(
      (worker) =>
        new Promise<void>((resolve, reject) => {
          const give = () => {
            if (next >= jobs.length) {
              worker.terminate().then(() => resolve());
              return;
            }
            const index = next++;
            const startedAt = Date.now();
            worker.once('message', (jobResult: PodJobResult) => {
              results[index] = jobResult;
              const rest =
                duty < 100 ? (Date.now() - startedAt) * (100 / duty - 1) : 0;
              if (rest > 1) setTimeout(give, rest);
              else give();
            });
            worker.postMessage(jobs[index]);
          };
          worker.on('error', reject);
          give();
        }),
    ),
  );
  const all: PodJobResult = {
    games: results.flatMap((jobResult) => jobResult.games),
    errors: results.flatMap((jobResult) => jobResult.errors),
  };
  if (logFolder !== undefined)
    all.logRows = results.flatMap((jobResult) => jobResult.logRows ?? []);
  if (all.errors.length)
    console.log(
      `!! ${all.errors.length} game(s) hit a simulator bug and were skipped (seeds ${all.errors
        .slice(0, 10)
        .map((failure) => failure[0])
        .join(', ')}). First error:\n${all.errors[0][1]}`,
    );
  return all;
}

/** Parse "gale" or "gale:lists/proposed.txt" into a deck and its list file. */
export function podSpec(
  all: Record<string, Deck>,
  args: string[],
  cap: number,
  set: Config,
  threat?: string,
  policyArg?: string,
): PodSpec {
  if (args.length < 3 || args.length > 6)
    throw new Error(
      `a pod has 3 to 6 decks (got ${args.length}); decks: ${Object.keys(all).join(', ')}`,
    );
  const decks: string[] = [],
    files: string[] = [];
  for (const deckArgument of args) {
    const [deckName, listName] = deckArgument.split(':');
    const deck = all[deckName];
    if (!deck)
      throw new Error(
        `unknown deck ${deckName}; choose from ${Object.keys(all).join(', ')}`,
      );
    decks.push(deckName);
    files.push(resolveList(deck, listName ?? deck.defaultList));
  }
  if (threat && !['leader', 'spread', 'weakest', 'damage'].includes(threat))
    throw new Error(
      `threat=${threat}: choose leader, spread, weakest or damage`,
    );
  const policy: Record<string, string> = {};
  for (const policyPair of (policyArg ?? '').split(',').filter(Boolean)) {
    const [deckName, policyName] = policyPair.split(':');
    if (
      !decks.includes(deckName) ||
      !['any', 'protected', 'mixed', 'window'].includes(policyName)
    )
      throw new Error(
        `policy=${policyPair}: use deck:any|protected|mixed|window (e.g. policy=gale:window)`,
      );
    policy[deckName] = policyName;
  }
  return { decks, lists: files, cap, set, threat, policy };
}
