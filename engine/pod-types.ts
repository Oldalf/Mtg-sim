/** The shapes of the data that go into and come out of a pod game. */
import type { GameLog } from './game-log-types';
import type { Config, GameIndexRow } from './run-types';

export interface PodSpec {
  decks: string[]; // deck names, in the order given on the command line
  lists: string[]; // the decklist file of each
  cap: number; // the game is a draw after this many rounds
  set: Config; // settings applied to every deck (--set)
  threat?: string; // who attacks aim at: leader (default) | spread | weakest | damage
  /** When a deck with a kill line (Gale) goes for it without counter backup: any (default: at once) | protected (only with
   *  backup) | mixed (protected until round protect_until, default 9, then any) | window (with backup, or when every opponent
   *  has at most window_mana untapped mana, default 1, or no cards in hand). Keyed by deck name. */
  policy?: Record<string, string>;
}

/** Counts kept per deck during a game. Each array is indexed by deck (the position in PodSpec.decks). */
export interface PodStats {
  tried: number[]; // win attempts that the others could have answered
  stopped: number[]; // of those, how many were stopped
  answers: number[]; // counterspells / removal used to stop a win or counter a spell
  countered: number[]; // spells that were countered (not win attempts)
  removals: number[]; // removal spells and wipes cast on its own turn
  removed: number[]; // permanents taken by targeted removal on another deck's turn (not a win attempt)
  waited: number[]; // turns it had a kill and waited (its policy: no counter backup yet)
  shields: number[]; // answers its Kira / Rainshaper / Stormtamer countered
}

export interface PodGame extends PodStats {
  winner: number | null; // index into spec.decks (null = no winner by the cap)
  turn: number; // the round the game ended in
  how: string; // "last standing" | "declared" (a combo / kill line / the deck's own win rule)
  why: string[]; // why[i] = how deck i was eliminated ("" = it wasn't): life | commander | poison | decked
  out: number[]; // players eliminated, in order
  seat: number[]; // seat[i] = the seat (0 = first to play) of deck i
  /** The game's log (only when it was played with the log on). */
  log?: GameLog;
}

export interface PodJob {
  pod: PodSpec;
  seeds: number[];
  /** Set to log the games: the run folder the job writes its games file to, and the job's number in the run. */
  logFolder?: string;
  jobNumber?: number;
}

export type PodJobResult = {
  games: PodGame[];
  /** One row per logged game (see game-log-files.ts). */
  logRows?: GameIndexRow[];
  errors: [number, string][];
};
