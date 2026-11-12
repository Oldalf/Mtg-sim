/**
 * Gale kill lines: the state the kill search works on (a light-weight snapshot of the game) and its rules.
 *
 * A light-weight snapshot ("Light") of the game is searched depth-first over the actions that
 * matter for killing the table this turn: casting/activating combo pieces, rituals, mill spells
 * and Gale/Emet-Selch graveyard recasts.
 *
 * Opponent outcome is deterministic: creature cards milled are an *expected* fraction (pCre)
 * accumulated per library, so the search can't "peek". Lines that rely on that average (Konrad
 * chains) are checked against real shuffles (chainProb). A win = every opponent has life <= 0,
 * an empty library or 10+ poison counters.
 */
import * as C from '../../engine/cards';
import { COMBO_SPELLS } from './roles';
import { CardDef, Cost } from '../../engine/cards';

export const FODDER_EXCLUDE = new Set([
  'Syr Konrad, the Grim',
  'The Mindskinner',
  'Duskmantle Guildmage',
]);
export const SINGLE_MILL: Record<string, string> = {
  Traumatize: '{3}{U}{U}',
  'Cut Your Losses': '{4}{U}{U}',
};
export const RELEVANT = new Set([
  ...COMBO_SPELLS,
  ...Object.keys(SINGLE_MILL),
  'Overture',
]);
export const relevantSpell = (name: string): boolean => RELEVANT.has(name);

export type Pool = { U: number; B: number; A: number; C: number; S: number };
type PoolKey = keyof Pool;

// opponent events: [kind, opponent index (-1 = none / us), amount] on a flat number stack
const MILL = 0,
  PUTGY = 1,
  LOSE = 2,
  DMG = 3,
  KONRAD = 4,
  SELFMILL = 5;
export const OPPONENT_EVENT = { MILL, PUTGY, LOSE, DMG, KONRAD, SELFMILL };

/** A step that touched the opponents: kind + arguments ("ev" carries a flat event list). */
export type Op = (string | number | number[])[];
export interface OlogNode {
  prev: OlogNode | null;
  gmAct: number;
  crank: boolean;
  konrad: boolean;
  skinner: boolean;
  op: Op;
}

/** Linked step description: [parent, text, life, lib, poison] (text is only built for the winning line). */
export type Path = [Path, string, number[], number[], number[]] | null;

export function remove1(list: string[], name: string): string[] {
  const i = list.indexOf(name);
  const out = list.slice();
  out.splice(i, 1);
  return out;
}

export function addSorted(list: string[], names: string[]): string[] {
  return [...list, ...names].sort();
}

export function uniqSorted(list: string[]): string[] {
  const out: string[] = [];
  for (const name of list) if (!out.includes(name)) out.push(name);
  return out.sort();
}

export class KillSearchState {
  // ht / muck: how many High Tides / Bubbling Mucks resolved this turn (each adds +1 per Island / Swamp).
  // htCount / swCount / lands: untapped Island-typed / Swamp-typed / all lands (already in the pool).
  // mix: [dual, island-only, swamp-only, other] over ALL our lands, used when Frantic Search / Snap /
  // Unwind / Turnabout untap lands that were tapped earlier.
  // free: coloured mana from outside our lands (rocks, floating mana, Dark Ritual). High Tide / Bubbling
  // Muck are paid from it if possible; otherwise an Island / Swamp taps for them and misses the bonus.
  // freeC: the same for colourless mana (Sol Ring), used first for Energybending's {2}.
  pool: Pool = { U: 0, B: 0, A: 0, C: 0, S: 0 };
  islandsForHighTide = 0;
  swampsForMuck = 0;
  highTides = 0;
  bubblingMucks = 0;
  landMix: number[] = [0, 0, 0, 0];
  coloursFromOutsideLands = 0;
  colourlessFromOutsideLands = 0;
  hand: string[] = [];
  graveyardSpells: string[] = [];
  graveyardCreatures: string[] = []; // sorted names
  hasGale = false;
  hasGuildmage = false;
  guildmageActivations = 0;
  hasMindcrank = false;
  hasKonrad = false;
  hasMindskinner = false;
  mindskinnerCanAttack = false;
  hasMonument = false;
  monumentCanExhaust = false;
  hasEmetSelch = false;
  emetSelchUsed = false;
  opponentLostLife = false;
  sacrificeFodder = 0;
  creatureCount = 0;
  reductionInstantSorcery = 0;
  reductionNoncreature = 0;
  reductionBlue = 0;
  reductionFromGraveyard = 0;
  opponentLife: number[] = [];
  opponentLibrary: number[] = [];
  opponentGraveyard: number[] = [];
  opponentCreatureAccumulator: number[] = [];
  opponentPoison: number[] = [];
  ownLibrarySize = 0;
  ownCreatureAccumulator = 0;
  ownCreatureDensity = 0;
  opponentCreatureDensity = 0;
  opponentHandSize = 0;
  opponentCreaturesOnBoard = 0;
  landCount = 0;
  // Energy Tap: mana values of our untapped creatures it could tap (highest first); Drain Power: an opponent's
  // lands; Cabal Ritual: graveyard cards that aren't instants/sorceries (gy only lists those)
  energyTapTargets: number[] = [];
  opponentLandCount = 0;
  graveyardNonSpellCount = 0;
  killLine: Path = null;
  // olog: every step that touched the opponents, with the flags active then (replayed by chainProb)
  // rnd: a Konrad trigger used the "expected 30% creatures" count, so the result is only an average
  opponentStepLog: OlogNode | null = null;
  opponentStepKey = '';
  isAverageOnly = false;

  copy(): KillSearchState {
    const state: KillSearchState = Object.create(Object.getPrototypeOf(this));
    state.pool = {
      U: this.pool.U,
      B: this.pool.B,
      A: this.pool.A,
      C: this.pool.C,
      S: this.pool.S,
    };
    state.islandsForHighTide = this.islandsForHighTide;
    state.swampsForMuck = this.swampsForMuck;
    state.highTides = this.highTides;
    state.bubblingMucks = this.bubblingMucks;
    state.landMix = this.landMix; // replaced, never changed in place
    state.coloursFromOutsideLands = this.coloursFromOutsideLands;
    state.colourlessFromOutsideLands = this.colourlessFromOutsideLands;
    state.hand = this.hand;
    state.graveyardSpells = this.graveyardSpells;
    state.graveyardCreatures = this.graveyardCreatures; // replaced, never changed in place
    state.hasGale = this.hasGale;
    state.hasGuildmage = this.hasGuildmage;
    state.guildmageActivations = this.guildmageActivations;
    state.hasMindcrank = this.hasMindcrank;
    state.hasKonrad = this.hasKonrad;
    state.hasMindskinner = this.hasMindskinner;
    state.mindskinnerCanAttack = this.mindskinnerCanAttack;
    state.hasMonument = this.hasMonument;
    state.monumentCanExhaust = this.monumentCanExhaust;
    state.hasEmetSelch = this.hasEmetSelch;
    state.emetSelchUsed = this.emetSelchUsed;
    state.opponentLostLife = this.opponentLostLife;
    state.sacrificeFodder = this.sacrificeFodder;
    state.creatureCount = this.creatureCount;
    state.reductionInstantSorcery = this.reductionInstantSorcery;
    state.reductionNoncreature = this.reductionNoncreature;
    state.reductionBlue = this.reductionBlue;
    state.reductionFromGraveyard = this.reductionFromGraveyard;
    state.opponentLife = this.opponentLife.slice();
    state.opponentLibrary = this.opponentLibrary.slice();
    state.opponentGraveyard = this.opponentGraveyard.slice();
    state.opponentCreatureAccumulator =
      this.opponentCreatureAccumulator.slice();
    state.opponentPoison = this.opponentPoison.slice();
    state.ownLibrarySize = this.ownLibrarySize;
    state.ownCreatureAccumulator = this.ownCreatureAccumulator;
    state.ownCreatureDensity = this.ownCreatureDensity;
    state.opponentCreatureDensity = this.opponentCreatureDensity;
    state.opponentHandSize = this.opponentHandSize;
    state.opponentCreaturesOnBoard = this.opponentCreaturesOnBoard;
    state.landCount = this.landCount;
    state.energyTapTargets = this.energyTapTargets;
    state.opponentLandCount = this.opponentLandCount;
    state.graveyardNonSpellCount = this.graveyardNonSpellCount; // (tapMvs is replaced, never changed)
    state.killLine = this.killLine;
    state.opponentStepLog = this.opponentStepLog;
    state.opponentStepKey = this.opponentStepKey;
    state.isAverageOnly = this.isAverageOnly;
    return state;
  }

  // ---------------------------------------------------------------- state
  isOpponentAlive(i: number): boolean {
    return (
      this.opponentLife[i] > 0 &&
      this.opponentLibrary[i] > 0 &&
      this.opponentPoison[i] < 10
    );
  }

  hasWon(): boolean {
    const life = this.opponentLife,
      lib = this.opponentLibrary,
      poison = this.opponentPoison;
    for (let i = 0; i < life.length; i++)
      if (life[i] > 0 && lib[i] > 0 && poison[i] < 10) return false;
    return true;
  }

  /** For de-duplication inside one search. */
  searchKey(): string {
    const pool = this.pool;
    return (
      `${pool.U},${pool.B},${pool.A},${pool.C},${pool.S},${this.highTides},${this.bubblingMucks},${this.islandsForHighTide},${this.swampsForMuck},` +
      `${this.landMix},${this.coloursFromOutsideLands},${this.colourlessFromOutsideLands}|${this.hand}|${this.graveyardSpells}|${this.graveyardCreatures}|` +
      `${+this.hasGuildmage}${this.guildmageActivations}${+this.hasMindcrank}${+this.hasKonrad}${+this.hasMindskinner}${+this.mindskinnerCanAttack}${+this.hasMonument}` +
      `${+this.monumentCanExhaust}${+this.emetSelchUsed}${+this.opponentLostLife},${this.sacrificeFodder}|${this.opponentLife}|${this.opponentLibrary}|${this.opponentPoison}|${this.energyTapTargets}`
    );
  }

  /** Every field that can influence the search (the result cache key). */
  fullKey(): string {
    return (
      this.searchKey() +
      `|${+this.hasGale}${+this.hasEmetSelch},${this.creatureCount},${this.reductionInstantSorcery},${this.reductionNoncreature},${this.reductionBlue},` +
      `${this.reductionFromGraveyard}|${this.opponentGraveyard}|${this.opponentCreatureAccumulator}|${this.ownLibrarySize},${this.ownCreatureAccumulator},${this.ownCreatureDensity},${this.opponentCreatureDensity},` +
      `${this.opponentHandSize},${this.opponentCreaturesOnBoard},${this.landCount}|${this.opponentLandCount},${this.graveyardNonSpellCount}`
    );
  }

  // ---------------------------------------------------------------- mana
  costOf(
    card: CardDef,
    base: Cost | null = null,
    fromGy = false,
    extraRed = 0,
  ): Cost {
    const cost = base ?? card.cost;
    let red = extraRed;
    if (card.isIS) red += this.reductionInstantSorcery;
    if (!card.isCreature) red += this.reductionNoncreature;
    if (cost.u || cost.h) red += this.reductionBlue;
    if (fromGy) red += this.reductionFromGraveyard;
    return cost.withGeneric(Math.max(0, cost.g - red));
  }

  spendMana(cost: Cost, isIS = false): boolean {
    const pool = this.pool;
    let blueNeeded = cost.u,
      blackNeeded = cost.b;
    let take = Math.min(pool.U, blueNeeded);
    pool.U -= take;
    blueNeeded -= take;
    take = Math.min(pool.B, blackNeeded);
    pool.B -= take;
    blackNeeded -= take;
    if (blueNeeded + blackNeeded > pool.A) return false;
    pool.A -= blueNeeded + blackNeeded;
    for (let hybridIndex = 0; hybridIndex < cost.h; hybridIndex++) {
      const kind: PoolKey | null =
        pool.U >= pool.B && pool.U > 0
          ? 'U'
          : pool.B > 0
            ? 'B'
            : pool.A > 0
              ? 'A'
              : null;
      if (!kind) return false;
      pool[kind] -= 1;
    }
    let genericLeft = cost.g;
    const bFirst = pool.B >= pool.U;
    const order: PoolKey[] = isIS
      ? ['S', 'C', bFirst ? 'B' : 'U', bFirst ? 'U' : 'B', 'A']
      : ['C', bFirst ? 'B' : 'U', bFirst ? 'U' : 'B', 'A'];
    for (const kind of order) {
      take = Math.min(pool[kind], genericLeft);
      pool[kind] -= take;
      genericLeft -= take;
    }
    return genericLeft === 0;
  }

  payForSpell(
    card: CardDef,
    base: Cost | null = null,
    fromGy = false,
  ): boolean {
    return this.spendMana(this.costOf(card, base, fromGy), card.isIS);
  }

  /** Resolve opponent events (a flat [kind, i, n, kind, i, n, ...] stack, last event first). One long loop on purpose:
   *  the kill search runs it millions of times, so it works on local copies of the fields and avoids helper calls. */
  /** Resolve opponent events (a flat [kind, i, n, kind, i, n, ...] stack, last event first). */
  resolveOpponentEvents(events: number[]): void {
    const life = this.opponentLife,
      lib = this.opponentLibrary,
      ogy = this.opponentGraveyard,
      poison = this.opponentPoison;
    const nOpp = life.length;
    const gmAct = this.guildmageActivations,
      crank = this.hasMindcrank,
      konrad = this.hasKonrad,
      skinner = this.hasMindskinner;
    const won = (): boolean => {
      for (let opponent = 0; opponent < nOpp; opponent++)
        if (life[opponent] > 0 && lib[opponent] > 0 && poison[opponent] < 10)
          return false;
      return true;
    };
    // Only a mill or a life loss can change whether everyone is dead, so that's the only time the
    // answer is recomputed; after other events it is the same as before.
    let done: boolean | null = null;
    let guard = 0;
    while (events.length && guard < 5000) {
      guard++;
      let amount = events.pop()!;
      const i = events.pop()!;
      const kind = events.pop()!;
      if (kind === MILL && !konrad) {
        // Fast path for the straight chain mill -> (Guildmage) lose -> (Mindcrank) mill -> ...:
        // without Konrad each step causes at most one next step, handled right away.
        for (;;) {
          if (life[i] <= 0) break;
          if (lib[i] < amount) amount = lib[i];
          lib[i] -= amount;
          if (amount <= 0) break;
          ogy[i] += amount;
          done = won();
          if (done) return;
          if (!gmAct) break;
          if (guard >= 5000) return;
          guard++;
          amount *= gmAct; // the "lose" step
          if (life[i] <= 0) break;
          life[i] -= amount;
          this.opponentLostLife = true;
          done = won();
          if (done) return;
          if (!crank) break;
          if (guard >= 5000) return;
          guard++; // the next "mill" step
        }
        continue;
      }
      if (kind === MILL || kind === PUTGY) {
        if (life[i] <= 0) continue;
        if (kind === MILL) {
          if (lib[i] < amount) amount = lib[i];
          lib[i] -= amount;
        }
        if (amount <= 0) continue;
        ogy[i] += amount;
        if (gmAct) events.push(LOSE, i, amount * gmAct);
        if (konrad) {
          const creatureCards = this.creatureCardsMilled(
            i,
            amount,
            kind === MILL,
          );
          if (creatureCards) events.push(KONRAD, -1, creatureCards);
        }
        if (kind === MILL) done = won();
      } else if (kind === LOSE) {
        if (life[i] <= 0) continue;
        life[i] -= amount;
        this.opponentLostLife = true;
        if (crank) events.push(MILL, i, amount);
        done = won();
      } else if (kind === DMG) {
        if (life[i] <= 0) continue;
        if (skinner)
          for (let opponent = 0; opponent < nOpp; opponent++)
            events.push(MILL, opponent, amount);
        else events.push(LOSE, i, amount);
      } else if (kind === KONRAD) {
        for (let opponent = 0; opponent < nOpp; opponent++)
          events.push(DMG, opponent, amount);
      } else if (kind === SELFMILL) {
        if (this.ownLibrarySize < amount) amount = this.ownLibrarySize;
        this.ownLibrarySize -= amount;
        if (konrad && amount) {
          const creatureCards = this.creatureCardsMilled(-1, amount, true);
          if (creatureCards) events.push(KONRAD, -1, creatureCards);
        }
      }
      if (done === null) done = won();
      if (done) return;
    }
  }

  /** Creature cards among n cards put into graveyard i (-1 = our own) while Konrad is out.
   *  Here: the expected fraction, carried over between mills. World (below) uses real shuffles. */
  creatureCardsMilled(i: number, amount: number, _fromLib: boolean): number {
    this.isAverageOnly = true;
    if (i < 0) {
      this.ownCreatureAccumulator += amount * this.ownCreatureDensity;
      const creatureCards = Math.floor(this.ownCreatureAccumulator + 1e-9);
      this.ownCreatureAccumulator -= creatureCards;
      return creatureCards;
    }
    this.opponentCreatureAccumulator[i] +=
      amount * this.opponentCreatureDensity;
    const creatureCards = Math.floor(
      this.opponentCreatureAccumulator[i] + 1e-9,
    );
    this.opponentCreatureAccumulator[i] -= creatureCards;
    return creatureCards;
  }

  opponentDraws(i: number, amount: number): void {
    this.opponentLibrary[i] =
      this.opponentLibrary[i] < amount ? 0 : this.opponentLibrary[i] - amount;
  }

  /** Every effect on the opponents goes through opp(), so a winning line can be replayed with real shuffles. */
  recordOpponentStep(...step: Op): void {
    this.opponentStepLog = {
      prev: this.opponentStepLog,
      gmAct: this.guildmageActivations,
      crank: this.hasMindcrank,
      konrad: this.hasKonrad,
      skinner: this.hasMindskinner,
      op: step,
    };
    this.opponentStepKey += `;${this.guildmageActivations}${+this.hasMindcrank}${+this.hasKonrad}${+this.hasMindskinner}${step.join(',')}`;
    this.applyOpponentStep(step);
  }

  applyOpponentStep(step: Op): void {
    const kind = step[0];
    const nOpp = this.opponentLife.length;
    if (kind === 'ev') {
      // fixed events, e.g. a Konrad trigger from a creature dying
      this.resolveOpponentEvents((step[1] as number[]).slice());
    } else if (kind === 'each') {
      // each opponent mills: a number, "half", "halfup" or "ogy"
      const how = step[1];
      const events: number[] = [];
      for (let i = 0; i < nOpp; i++) {
        if (!this.isOpponentAlive(i)) continue;
        const amount =
          typeof how === 'number'
            ? how
            : how === 'half'
              ? Math.floor(this.opponentLibrary[i] / 2)
              : how === 'halfup'
                ? Math.floor((this.opponentLibrary[i] + 1) / 2)
                : this.opponentGraveyard[i];
        events.push(MILL, i, amount);
      }
      this.resolveOpponentEvents(events);
    } else if (kind === 'tmill' || kind === 'tdmg' || kind === 'thalf') {
      // the opponent with the biggest library
      const target = this.biggestLibraryOpponent();
      if (target !== null) {
        if (kind === 'tdmg')
          this.resolveOpponentEvents([DMG, target, step[1] as number]);
        else
          this.resolveOpponentEvents([
            MILL,
            target,
            kind === 'thalf'
              ? Math.floor(this.opponentLibrary[target] / 2)
              : (step[1] as number),
          ]);
      }
    } else if (kind === 'dmg_each') {
      const events: number[] = [];
      for (let i = 0; i < nOpp; i++)
        if (this.isOpponentAlive(i)) events.push(DMG, i, step[1] as number);
      this.resolveOpponentEvents(events);
    } else if (kind === 'konact') {
      // Konrad {1}{B}: each player mills 1
      const events: number[] = [];
      for (let i = 0; i < nOpp; i++)
        if (this.isOpponentAlive(i)) events.push(MILL, i, 1);
      events.push(SELFMILL, -1, 1);
      this.resolveOpponentEvents(events);
    } else if (kind === 'poison') {
      // Prologue to Phyresis: each opponent gets a poison counter
      for (let i = 0; i < nOpp; i++)
        if (this.isOpponentAlive(i)) this.opponentPoison[i] += 1;
    } else if (kind === 'prolif') {
      // Expansion Algorithm: proliferate X times (only poison matters)
      for (let i = 0; i < nOpp; i++)
        if (this.isOpponentAlive(i) && this.opponentPoison[i] > 0)
          this.opponentPoison[i] += step[1] as number;
    } else if (kind === 'windfall') {
      // opponents discard their hands, then draw n
      const oppHand = step[1] as number,
        nDraw = step[2] as number;
      const events: number[] = [];
      for (let i = 0; i < nOpp; i++)
        if (this.isOpponentAlive(i)) events.push(PUTGY, i, oppHand);
      this.resolveOpponentEvents(events);
      for (let i = 0; i < nOpp; i++)
        if (this.isOpponentAlive(i)) this.opponentDraws(i, nDraw);
    }
  }

  millEach(how: number | string): void {
    this.recordOpponentStep('each', how);
  }

  biggestLibraryOpponent(): number | null {
    let biggestLibrary = -1,
      lifeOfBiggest = -1,
      biggestIndex: number | null = null;
    for (let i = 0; i < this.opponentLife.length; i++) {
      if (!this.isOpponentAlive(i)) continue;
      if (
        biggestIndex === null ||
        this.opponentLibrary[i] > biggestLibrary ||
        (this.opponentLibrary[i] === biggestLibrary &&
          this.opponentLife[i] > lifeOfBiggest)
      ) {
        biggestLibrary = this.opponentLibrary[i];
        lifeOfBiggest = this.opponentLife[i];
        biggestIndex = i;
      }
    }
    return biggestIndex;
  }

  // ---------------------------------------------------------------- spell effects
  resolveSpell(name: string, variant: string): void {
    if (this.resolveMillSpell(name, variant)) return;
    if (this.resolveManaSpell(name)) return;
    if (name === 'Unearth') {
      if (variant === 'The Mindskinner') this.hasMindskinner = true;
      else if (variant === 'Duskmantle Guildmage') this.hasGuildmage = true;
      if (this.graveyardCreatures.includes(variant))
        this.graveyardCreatures = this.graveyardCreatures.filter(
          (name) => name !== variant,
        );
      this.creatureCount += 1;
      if (this.hasKonrad) this.recordOpponentStep('ev', [KONRAD, -1, 1]);
    }
  }

  /** The mill, drain and poison spells. Returns false if this is not one of them. */
  private resolveMillSpell(name: string, variant: string): boolean {
    if (name === 'Maddening Cacophony') {
      this.millEach(variant === 'kick' ? 'halfup' : 8);
    } else if (
      name === 'Traumatize' ||
      name === 'Cut Your Losses' ||
      name === 'Overture'
    ) {
      const copies = variant === 'casualty' ? 2 : 1;
      if (variant === 'casualty') {
        if (this.sacrificeFodder > 0) this.sacrificeFodder -= 1;
        else this.hasGuildmage = false;
        this.creatureCount -= 1;
        if (this.hasKonrad) this.recordOpponentStep('ev', [KONRAD, -1, 1]);
      }
      for (let copyNumber = 0; copyNumber < copies; copyNumber++) {
        if (this.biggestLibraryOpponent() === null) break;
        this.recordOpponentStep('thalf', 0);
      }
    } else if (name === 'Singularity Rupture') {
      let alive = 0;
      for (let i = 0; i < this.opponentLife.length; i++)
        if (this.isOpponentAlive(i)) alive++;
      const dead =
        this.creatureCount -
        (this.hasKonrad ? 1 : 0) +
        this.opponentCreaturesOnBoard * alive;
      const hadKonrad = this.hasKonrad;
      this.hasKonrad = this.hasMindskinner = this.hasGuildmage = false;
      this.mindskinnerCanAttack = false;
      this.creatureCount = this.sacrificeFodder = 0;
      this.millEach('half');
      if (hadKonrad && dead > 0) {
        this.hasKonrad = true; // LKI: triggers resolve with Konrad's damage, Konrad itself is gone
        this.recordOpponentStep('ev', [KONRAD, -1, dead]);
        this.hasKonrad = false;
      }
    } else if (name === 'Windfall') {
      const nDraw = Math.max(this.opponentHandSize, this.hand.length);
      this.recordOpponentStep('windfall', this.opponentHandSize, nDraw);
      // our own hand is discarded: instants/sorceries become Gale targets
      const add = this.hand.filter((name) => C.get(name).isIS);
      if (add.length)
        this.graveyardSpells = addSorted(this.graveyardSpells, add);
      this.hand = [];
    } else if (name === 'Prologue to Phyresis') {
      this.recordOpponentStep('poison'); // (its card draw is ignored in the search)
    } else if (name === 'Expansion Algorithm') {
      this.recordOpponentStep('prolif', parseInt(variant.slice(1), 10));
    } else if (name === 'Extended Absence') {
      this.recordOpponentStep('dmg_each', 1);
    } else {
      return false;
    }
    return true;
  }

  /** The mana spells and the untap spells. Returns false if this is not one of them. */
  private resolveManaSpell(name: string): boolean {
    if (name === 'Cabal Ritual') {
      const manaMade =
        this.graveyardNonSpellCount + this.graveyardSpells.length >= 7 ? 5 : 3; // threshold: seven or more cards in the graveyard
      this.pool.B += manaMade;
      this.coloursFromOutsideLands += manaMade;
    } else if (name === 'Drain Power') {
      this.pool.C += this.opponentLandCount; // (a second cast via Gale targets another opponent)
      this.colourlessFromOutsideLands += this.opponentLandCount;
    } else if (name === 'Energy Tap') {
      if (this.energyTapTargets.length) {
        const manaValue = this.energyTapTargets[0];
        this.energyTapTargets = this.energyTapTargets.slice(1);
        this.pool.C += manaValue;
        this.colourlessFromOutsideLands += manaValue;
      }
    } else if (name === 'Dark Ritual') {
      this.pool.B += 3;
      this.coloursFromOutsideLands += 3;
    } else if (name === 'High Tide') {
      // every copy stacks: +1 U for each Island not yet tapped
      this.paidByLand('islandsForHighTide');
      this.pool.U += this.islandsForHighTide;
      this.highTides += 1;
    } else if (name === 'Bubbling Muck') {
      this.paidByLand('swampsForMuck');
      this.pool.B += this.swampsForMuck;
      this.bubblingMucks += 1;
    } else if (name === 'Energybending') {
      // every land becomes an Island and a Swamp: High Tides / Mucks already resolved now also count
      // the untapped lands that weren't Islands / Swamps before. Its {2} (after reducers) comes from
      // rocks if possible, otherwise from lands (assumed to be the ones that would gain the new types).
      let paid = 0;
      const genericCost = this.costOf(C.get('Energybending')).g;
      for (let payment = 0; payment < genericCost; payment++) {
        if (this.colourlessFromOutsideLands > 0)
          this.colourlessFromOutsideLands -= 1;
        else if (this.coloursFromOutsideLands > 0)
          this.coloursFromOutsideLands -= 1;
        else paid += 1;
      }
      paid = Math.min(paid, this.landCount);
      this.pool.U +=
        Math.max(0, this.landCount - this.islandsForHighTide - paid) *
        this.highTides;
      this.pool.B +=
        Math.max(0, this.landCount - this.swampsForMuck - paid) *
        this.bubblingMucks;
      this.landCount -= paid;
      this.islandsForHighTide = this.swampsForMuck = this.landCount;
      this.landMix = [
        this.landMix[0] + this.landMix[1] + this.landMix[2] + this.landMix[3],
        0,
        0,
        0,
      ];
    } else if (name === 'Turnabout') {
      this.untapLands(
        this.landMix[0] + this.landMix[1] + this.landMix[2] + this.landMix[3],
      ); // every land was tapped for the pool already
    } else if (name === 'Frantic Search' || name === 'Snap') {
      this.untapLands(name === 'Frantic Search' ? 3 : 2);
    } else {
      return false;
    }
    return true;
  }

  /** High Tide / Muck cost one coloured mana. Use mana from outside our lands if there is any;
   *  otherwise one Island / Swamp was tapped to pay, so it no longer counts for the bonus. */
  paidByLand(attr: 'islandsForHighTide' | 'swampsForMuck'): void {
    if (this.coloursFromOutsideLands > 0) this.coloursFromOutsideLands -= 1;
    else if (this[attr] > 0) {
      this[attr] -= 1;
      this.landCount -= 1;
    }
  }

  /** Untap k of our lands (already tapped) and tap them again, best lands first. Base mana: Islands
   *  give U, other lands either colour; each High Tide adds U per Island, each Muck adds B per Swamp. */
  untapLands(count: number): void {
    const [dual, islandOnly, swampOnly, other] = this.landMix;
    const highTides = this.highTides,
      mucks = this.bubblingMucks;
    const kinds: [number, number, boolean, boolean][] = [
      [1 + highTides + mucks, dual, true, true],
      [1 + highTides, islandOnly, true, false],
      [1 + mucks, swampOnly, false, true],
      [1, other, false, false],
    ];
    kinds.sort((first, second) => second[0] - first[0]); // stable, like Python's sort
    for (const [, available, isl, isSwamp] of kinds) {
      const toUntap = Math.min(available, count);
      if (toUntap <= 0) continue;
      count -= toUntap;
      if (isl) this.pool.U += toUntap * (1 + highTides);
      else this.pool.A += toUntap;
      if (isSwamp) this.pool.B += toUntap * mucks;
    }
  }

  /** The ways to cast a spell: [variant, base cost]. */
  castVariants(name: string, _fromGy: boolean): [string, Cost][] {
    const card = C.get(name);
    if (name === 'Maddening Cacophony')
      return [
        ['unk', card.cost],
        ['kick', card.cost.plus(new Cost(3, 1))],
      ];
    if (name === 'Cut Your Losses') {
      const variants: [string, Cost][] = [['single', card.cost]];
      if (
        this.sacrificeFodder > 0 ||
        (this.hasGuildmage && this.guildmageActivations > 0)
      )
        variants.push(['casualty', card.cost]);
      return variants;
    }
    if (name === 'Expansion Algorithm') {
      // X just big enough: from the lowest poison count, or one less if a Prologue (e.g. via Gale) resolves first
      let lowestPoison = Infinity;
      for (let i = 0; i < this.opponentLife.length; i++)
        if (this.isOpponentAlive(i))
          lowestPoison = Math.min(lowestPoison, this.opponentPoison[i]);
      if (lowestPoison === Infinity) lowestPoison = 0;
      const xValues =
        lowestPoison === 0
          ? [9]
          : [
              ...new Set([10 - lowestPoison, Math.max(1, 9 - lowestPoison)]),
            ].sort((first, second) => first - second);
      return xValues.map(
        (xValue) =>
          [`X${xValue}`, card.cost.plus(new Cost(xValue))] as [string, Cost],
      );
    }
    if (name === 'Unearth') {
      return uniqSorted(this.graveyardCreatures)
        .filter(
          (name) =>
            name === 'The Mindskinner' || name === 'Duskmantle Guildmage',
        )
        .map((name) => [name, card.cost] as [string, Cost]);
    }
    return [['x', card.cost]]; // (Snap / Extended Absence assume some creature target is available)
  }
}
