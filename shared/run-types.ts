/**
 * The shapes of a run and its results, as plain types: the settings, a game's kill turns, the kill-turn table, and
 * what is written to session-logs/ (see game-log-files.ts). No Node code and no engine code here, so the app's page
 * can import them too (app/api-types.ts).
 */
import type { PodGame, PodSpec } from './pod-types';

/** A deck's settings (decks/<name>/config.ts), changed per run with --set. */
export type Config = Record<string, number | boolean>;

/** The two kill turns of a game (see Deck.metrics): the first turn with any kill, and with counter backup. Null = none. */
export type KillTurns = [number | null, number | null];

/** The two kinds of kill a game reports: any kill found, and a kill with counterspell backup ("protected"). */
export type KillKind = 'any' | 'protected';

/** The kill-turn results of many games of one list. */
export interface Table {
  /** percentOnTurn[kind][turn] = % of games whose first kill is on that turn (index 0 is unused). */
  percentOnTurn: Record<KillKind, number[]>;
  /** The average turn of the games that killed. */
  averageTurn: Record<KillKind, number>;
  /** % of games that killed at all. */
  percentKilled: Record<KillKind, number>;
}

/** What was run, enough to play any of its games again. */
export interface RunInfo {
  /** The folder name, e.g. "01-meren-decklist". */
  name: string;
  mode: 'goldfish' | 'pod';
  date: string;
  gameCount: number;
  /** The deck names (a goldfish run has one). */
  decks: string[];
  /** Each deck's list file, relative to the project folder, and a hash of its contents when the run started. */
  lists: string[];
  listHashes: string[];
  /** Goldfish: the settings, and how the games were played ("protected" for the normal table, "any" for --diag). */
  config?: Config;
  gameMode?: 'any' | 'protected';
  /** Goldfish: short names of the two kill turns of a game, e.g. ["win", "1st dead"] (see Deck.metrics). */
  killTurnNames?: [string, string];
  /** Pod: the pod as it was run. */
  pod?: PodSpec;
}

/** One game of a run: its result and where its log is. The list of these lets a viewer filter thousands of games
 *  without reading their events. */
export interface GameIndexRow {
  seed: number;
  /** The games file, and the line in it (0 = the first). */
  file: string;
  line: number;
  tags: string[];
  /** The game hit a simulator bug: the message. Its log holds what happened up to then. */
  error?: string;
  /** Goldfish: the two kill turns (see Deck.metrics). */
  killTurns?: KillTurns;
  /** Pod: the finished game, without its log. */
  pod?: PodGame;
}
