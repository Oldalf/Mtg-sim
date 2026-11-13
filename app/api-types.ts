/**
 * The shapes the server sends and the page reads: one type for every request and answer of the API (PLAN.md, "The API").
 * Both sides import this file. It holds types only, so the page's bundle gets no engine code from it.
 *
 * A task that needs a shape that is not here adds it here first, in its own small change.
 */
import type { GameLog } from '../engine/game-log-types';
import type { GameIndexRow, RunInfo, Table } from '../engine/run-types';

export type { GameIndexRow, GameLog, RunInfo, Table };

/** Every error answer (with a 4xx or 5xx status). */
export interface ErrorAnswer {
  error: string;
}

/** GET /api/health */
export interface HealthAnswer {
  status: 'ok';
}

// ================================================================ decks and decklists

/** A deck setting (decks/<name>/config.ts) and its default value. A run can change it (`--set`). */
export interface DeckSetting {
  name: string;
  defaultValue: number | boolean;
}

/** One deck, as GET /api/decks lists it. */
export interface DeckSummary {
  name: string;
  /** The commanders of its default list. */
  commanders: string[];
  /** The default list file, relative to the deck folder (e.g. "decklist.txt"). */
  defaultList: string;
  /** Every list file of the deck, relative to the deck folder (e.g. "decklist.txt", "lists/proposed.txt"). */
  lists: string[];
  settings: DeckSetting[];
  /** What the two numbers of a game mean, in long words (Deck.metrics), e.g. "Win possible (any)". */
  resultNames: [string, string];
  /** Can a run of this deck use --diag (the deck has its own diag measures)? */
  hasDiag: boolean;
}

/** GET /api/decks */
export type DecksAnswer = DeckSummary[];

/** A card of a decklist. */
export interface DecklistCard {
  name: string;
  count: number;
  /** From data/cards.json; missing for a card without data. */
  typeLine?: string;
  manaCost?: string;
  manaValue?: number;
  scryfallId?: string;
}

/** A section of a decklist, as it is headed in the file (e.g. "ramp", "removal"). */
export interface DecklistSection {
  name: string;
  cards: DecklistCard[];
}

/** GET /api/decks/<deck>/lists/<list> */
export interface DecklistAnswer {
  deck: string;
  /** The list file, relative to the deck folder. */
  list: string;
  commanders: DecklistCard[];
  /** The other cards, by section, in the order of the file. */
  sections: DecklistSection[];
  /** All cards, commanders included (a Commander deck has 100). */
  cardCount: number;
  /** Cards without card data (they cannot be played). */
  missing: string[];
  /** Cards with data but no rules of their own: played by their type. */
  generic: string[];
}

// ================================================================ runs

/** POST /api/runs, a goldfish run: one deck, one or more lists (the first is the base the others are compared to). */
export interface GoldfishRunRequest {
  mode: 'goldfish';
  deck: string;
  /** List files, relative to the deck folder. */
  lists: string[];
  games: number;
  /** Turns to play (`--turns`); the deck's max_turn when left out. It counts as part of the defaults, as on the command line. */
  turns?: number;
  /** Settings that differ from the deck's defaults (`--set`). With one list, the report compares default and changed. */
  settings: Record<string, number | boolean>;
  /** The deck's own measures instead of the kill-turn table (`--diag`). */
  diag: boolean;
  powerSave: boolean;
}

/** POST /api/runs, a pod run: 3 to 6 decks play each other. */
export interface PodRunRequest {
  mode: 'pod';
  /** One per seat, in the order given; the same deck may appear twice. List relative to the deck folder. */
  decks: { deck: string; list: string }[];
  games: number;
  /** A game is a draw after this many rounds. */
  rounds: number;
  /** Deck settings for every deck (`--set`). */
  settings: Record<string, number | boolean>;
  /** Who attacks aim at: leader (default), spread, weakest, damage. */
  threat?: string;
  /** When a deck with a kill line goes for it without counter backup: any (default), protected, mixed, window. */
  policy?: string;
  powerSave: boolean;
}

export type RunRequest = GoldfishRunRequest | PodRunRequest;

/** POST /api/runs (409 with an ErrorAnswer when a run is going). */
export interface StartRunAnswer {
  runId: string;
}

export type RunStatus = 'running' | 'done' | 'stopped' | 'failed';

/** GET /api/runs/current: the run in progress, or the last one (null before the first run). */
export interface RunState {
  runId: string;
  request: RunRequest;
  status: RunStatus;
  gamesPlayed: number;
  /** All the games of the run (a run of three lists plays three times `games`). */
  gamesTotal: number;
  secondsSoFar: number;
  /** When done. */
  report?: RunReport;
  /** The session-logs folders the run wrote, one per list or one for a pod (see GET /api/logs). */
  runFolders: string[];
  /** When failed: what went wrong. */
  error?: string;
}

export type CurrentRunAnswer = RunState | null;

// ================================================================ reports

export type RunReport = KillTurnReport | DiagReport | PodReport;

/** A goldfish run: the kill-turn table of each list (what `printSingle` and `printCompare` print). */
export interface KillTurnReport {
  kind: 'kill-turns';
  gameCount: number;
  /** Games are played to this turn. */
  maxTurn: number;
  opponents: number;
  opponentLife: number;
  /** What the two numbers of a game mean: [long name, short column name] for each (Deck.metrics). */
  resultNames: [[string, string], [string, string]];
  /** The turns a comparison shows (Deck.compareTurns, default 6, 7 and the last turn). */
  compareTurns: number[];
  /** About this many percentage points of a difference between lists is noise. */
  noisePoints: number;
  /** The first row is the base; the page shows the others as a difference to it. */
  rows: KillTurnRow[];
}

export interface KillTurnRow {
  /** The list file name, or "default" / the changed settings when one list is run with changed settings. */
  label: string;
  table: Table;
  /** Set by the server, which knows the run folders; the engine's report leaves it out. */
  runFolder?: string;
}

/** A goldfish run with --diag: the deck's own measures for each list (what `printDiag` prints). */
export interface DiagReport {
  kind: 'diag';
  gameCount: number;
  measures: { label: string; unit: '%' | 'turn' | 'n' }[];
  /** The first row is the base. values[i] belongs to measures[i]. */
  rows: { label: string; values: number[]; runFolder?: string }[];
}

/** A pod run (what `printPod` prints). */
export interface PodReport {
  kind: 'pod';
  gameCount: number;
  playerCount: number;
  roundsCap: number;
  /** The win share each deck would get in an even pod (100 / players). */
  evenSharePercent: number;
  /** About this many points of a win rate is noise. */
  noisePoints: number;
  /** One per seat of the request, in its order. */
  decks: PodDeckReport[];
  /** The rounds of the "won by the end of round" table. */
  roundsShown: number[];
  noWinnerPercent: number;
  /** The average length of the games that had a winner (null when none had). */
  averageGameLength: number | null;
  /** Did any game have a win attempt, removal or counterspell? If not, the page leaves the interaction table out. */
  hadInteraction: boolean;
  /** Set by the server, like the run folder of the other reports. */
  runFolder?: string;
}

export interface PodDeckReport {
  /** The deck name, with "#2" when the same deck plays twice. */
  label: string;
  deck: string;
  list: string;
  winPercent: number;
  /** The turns of its wins: the average, and the 10% and 90% points (null when it never won). */
  averageWinTurn: number | null;
  winTurn10Percent: number | null;
  winTurn90Percent: number | null;
  /** Of its wins: its own win with others alive, and last one standing (null when it never won). */
  declaredPercent: number | null;
  standingPercent: number | null;
  /** Share of all games in which it was the first one out. */
  outFirstPercent: number;
  /** Its win rate in each seat (0 = first to play); null for a seat it never had. */
  winPercentBySeat: (number | null)[];
  /** wonByRound[i] = share of all games it won by the end of roundsShown[i]. */
  wonByRoundPercent: number[];
  interaction: PodInteraction;
  /** How it went out (life, commander, poison, decked, its own doing): share of all games, only reasons that happened. */
  wentOutPercent: Record<string, number>;
}

/** Averages per game, except stoppedPercent. */
export interface PodInteraction {
  winAttempts: number;
  /** Share of its win attempts that were stopped (null when it made none). */
  stoppedPercent: number | null;
  turnsWaited: number;
  spellsCountered: number;
  removalTaken: number;
  shielded: number;
  answersUsed: number;
  removalCast: number;
}

// ================================================================ game logs

/** A run folder of this session in session-logs/. */
export interface LoggedRunSummary {
  info: RunInfo;
  /** How many games carry each tag. */
  tagCounts: Record<string, number>;
}

/** GET /api/logs */
export type LogsAnswer = LoggedRunSummary[];

/** An index row with its result in words ("win T6", "samfrodo wins in round 8 (last standing)"). */
export interface GameListRow extends GameIndexRow {
  result: string;
}

/** GET /api/logs/<run>/games?tag=&winner=&from=&count= */
export interface GamesAnswer {
  /** How many games match the filter (the page shows `count` of them from `from`). */
  total: number;
  rows: GameListRow[];
}

/** GET /api/logs/<run>/games/<seed> and GET /api/decks/<deck>/logs/<file> */
export type GameAnswer = GameLog;

/** GET /api/decks/<deck>/logs: the file names in the deck's logs/ folder. */
export type RealLogsAnswer = string[];
