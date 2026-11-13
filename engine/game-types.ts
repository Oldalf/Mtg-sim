/** The plain data types and constants shared by the game engine, the pod and every deck. */
import { Cost, CardDef } from './cards';
import { LandInfo } from './card-facts';
import { Answer } from './answers';
import type { Game } from './game';

export type Config = Record<string, number | boolean>;

export class Permanent {
  tapped: boolean;
  sick: boolean;
  exhausted = false;
  transformed = false;
  /** A token (or a token copy of a card): it doesn't go to the graveyard when it dies. */
  token = false;
  /** +1/+1 counters minus -1/-1 counters. */
  counters = 0;
  /** Power changes that aren't counters (e.g. Saw in Half copies at half power). */
  powerMod = 0;
  /** Free bit flags a deck may use for attachments and the like (copied with the permanent). */
  marks = 0;

  constructor(
    public card: CardDef,
    public land: LandInfo | null = null,
    tapped = false,
  ) {
    this.tapped = tapped;
    this.sick = card.isCreature;
  }

  get name(): string {
    return this.card.name;
  }

  get isCreature(): boolean {
    return this.card.isCreature;
  }

  copy(): Permanent {
    const permanent = new Permanent(this.card, this.land, this.tapped);
    permanent.sick = this.sick;
    permanent.exhausted = this.exhausted;
    permanent.transformed = this.transformed;
    permanent.token = this.token;
    permanent.counters = this.counters;
    permanent.powerMod = this.powerMod;
    permanent.marks = this.marks;
    return permanent;
  }
}

/** Settings every deck starts from. A deck's config.ts spreads this and overrides what differs. */
export const BASE_CONFIG: Config = {
  opponents: 3,
  opp_life: 40,
  opp_library: 92, // 99 - opening 7
  on_play_chance: 0.25, // 4-player pod: 1 in 4 to skip the first draw
  search_budget: 0, // 0 = no kill search
  smart_mulligan: true, // the deck's mulligan rule (mulligan.ts); off = keep 2 to 5 lands
  planner: true, // AI tries its best few plays on copies of the game and keeps the best
  planner_width: 4, // how many plays it compares at each decision
  planner_rollouts: 2, // random futures per play (library re-shuffled: no peeking)
  planner_budget: 0, // kill-search effort when scoring a position
};

/** Where a permanent came from when it entered the battlefield. */
export type Zone =
  'hand' | 'graveyard' | 'library' | 'command' | 'exile' | 'token' | 'stack';

/** What a deck may read of the board that the log analyzer rebuilt from an Archidekt log (see Game.syncFromLog). */
export interface LogBoardView {
  landsFromHand: number; // lands put onto the battlefield from hand this turn
  trackers: Record<string, number>; // the counters the player keeps in Archidekt's misc zone
  battlefield: { name: string }[];
}

/** Something the AI may do now. act() returns false if it couldn't be done after all. */
export interface Candidate {
  score: number;
  cost: Cost;
  isInstantOrSorcery: boolean;
  action: () => boolean;
  rock?: CardDef; // the mana rock this casts from hand (see rockFirst)
}

/** The kill search a deck provides. */
export interface KillSearcher<S> {
  search(state: S, budget: number): number;
  lastLine: string[] | null;
  lastLineProbability: number | null;
  bestMiss: number | null;
  readonly minChance: number;
}

export type ManaPool = {
  U: number;
  B: number;
  C: number;
  S: number;
  W: number;
  R: number;
  G: number;
};
export const emptyPool = (): ManaPool => ({
  U: 0,
  B: 0,
  C: 0,
  S: 0,
  W: 0,
  R: 0,
  G: 0,
});

/** How an attacker gets past blockers. "skulk": creatures with greater power can't block it. */
export type Evasion = 'none' | 'flying' | 'skulk' | 'unblockable';
/** A creature in a pod combat, as both sides see it. */
export interface Fighter {
  permanent: Permanent;
  name: string;
  power: number;
  toughness: number;
  evasion: Evasion;
  /** Can block flyers (flying or reach). */
  air: boolean;
  deathtouch: boolean;
  trample?: boolean;
  /** First strike or double strike: it deals its damage first. */
  first?: boolean;
  /** Menace: it takes two blockers. */
  menace?: boolean;
  /** What its owner would pay to keep it (tokens are cheap, the commander is dear). */
  value: number;
  commander: boolean;
}
export interface FightRow {
  attacker: Fighter;
  blocker: Fighter | null;
  attackerDies: boolean;
  blockerDies: boolean;
}
/** A deck going for the win in a pod: what the others can answer. Countering one of `spells`, or removing one of
 *  `perms` (the most important first), stops it. `backup`: answers of ours that we can answer back (a counterspell with mana). */
export interface WinAttempt {
  spells: string[];
  perms: string[];
  backup: number;
}
/** An opposing permanent, as a removal spell sees it. */
export interface Target {
  permanent: Permanent;
  name: string;
  value: number;
  power: number;
  types: Set<string>;
  token: boolean;
  commander: boolean;
}
export interface FightResult {
  /** The defender returned the attackers to their owner's hand (Aetherize). */
  bounced?: boolean;
  rows: FightRow[];
  /** Combat damage that reaches the defending player. */
  damage: number;
  /** The defender is dead from this attack (life or 21 commander damage). */
  kills: boolean;
}
/** The pod, as a game sees it (engine/pod.ts supplies it; null in a goldfish game). */
export interface Arena {
  /** Is this the real game of a player (not a planner copy)? */
  real(game: Game<unknown>): boolean;
  /** Attack opponent `slot` with these creatures: the defender blocks by the shared rule. apply = false only forecasts. */
  fight(
    game: Game<unknown>,
    slot: number,
    attackers: Fighter[],
    apply: boolean,
  ): FightResult;
  /** The power of each creature opponent `slot` controls (what could attack us on their turn). */
  board(game: Game<unknown>, slot: number): number[];
  /** Each opponent sacrifices its least valuable creature (nontoken only: Accursed Marauder). */
  edict(game: Game<unknown>, nontoken: boolean): void;
  /** Take the best legal target of the biggest threat off the battlefield (an enters-the-battlefield removal effect). Returns its name. */
  snipe(game: Game<unknown>, ans: Answer): string | null;
  say(game: Game<unknown>, text: string): void;
  /** We declared a win in the middle of our turn: the others may answer it now. True = it was stopped (the turn goes on). */
  answerWin(game: Game<unknown>): boolean;
  /** We cast this spell (paid, on the stack): does an opponent counter it? */
  counter(game: Game<unknown>, card: CardDef): boolean;
  /** How much we'd rather attack opponent `slot` (the pod's threat rule, step 4). */
  prefer(game: Game<unknown>, slot: number): number;
  /** We found a kill without counter backup: go for it now (the deck's pod policy)? */
  go(game: Game<unknown>): boolean;
  /** Windfall: each opponent discards its hand and draws as many as the biggest hand discarded (at least `mine`). Returns that number. */
  wheel(game: Game<unknown>, mine: number): number;
  /** Each player draws n (Folio of Fancies): the opponents' part. */
  eachDraws(game: Game<unknown>, count: number): void;
}
