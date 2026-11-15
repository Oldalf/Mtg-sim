/**
 * Gale kill lines: the state the kill search works on (a stripped-down copy of the game) and its rules.
 *
 * A stripped-down copy of the game ("KillSearchState") is searched depth-first over the actions that
 * matter for killing the table this turn: casting/activating combo pieces, rituals, mill spells
 * and Gale/Emet-Selch graveyard recasts.
 *
 * Opponent outcome is deterministic: creature cards milled are an *expected* fraction (pCre)
 * accumulated per library, so the search can't "peek". Lines that rely on that average (Konrad
 * chains) are checked against real shuffles (chainProb). A win = every opponent has life <= 0,
 * an empty library or 10+ poison counters.
 */
import * as C from '../../engine/cards/cards';
import { COMBO_SPELLS, isUnearthLike } from './roles';
import { CardDef, Cost } from '../../engine/cards/cards';
import { KillStep } from '../../engine/game/game-types';
import { PaymentRecord, Pool, SearchMana } from '../../engine/game/search-mana';

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
  opponentStep: Op;
}

/** Gale's abilities the kill search activates. */
export type GaleAbility =
  | 'guildmageDrain'
  | 'guildmageMill'
  | 'konradMill'
  | 'monumentExhaust'
  | 'monumentMill';

/** One step of a Gale kill line, as data the real game plays (kill-play.ts). */
export interface GaleKillStep extends KillStep {
  kind:
    | 'castPermanent'
    | 'ability'
    | 'attack'
    | 'castSpell'
    | 'emetSelch'
    | 'selfCounter';
  ability?: GaleAbility;
  /** How the search paid for each cost of this step, in order (see PaymentRecord). */
  payments?: PaymentRecord[];
  /** Gale's trigger: the graveyard spell cast after this one, and its variant. */
  galeRecast?: [string, string];
  /** Guildmage drains activated in response, while the hand spell is on the stack. */
  guildmageResponses?: number;
  /** A self-counter: our counterspell, and the spell Gale recasts after it. */
  counter?: string;
  counterRecast?: [string, string];
}

/** Linked steps: [parent, step, life, lib, poison] (the opponents after the step; the line is only built for the winner). */
export type Path = [Path, GaleKillStep, number[], number[], number[]] | null;

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
  // our mana sources, untapped until a payment needs them (engine/game/search-mana.ts)
  mana = new SearchMana();
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
    state.mana = this.mana.copy();
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
    return (
      `${this.mana.key()}|${this.hand}|${this.graveyardSpells}|${this.graveyardCreatures}|` +
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
      `${this.opponentHandSize},${this.opponentCreaturesOnBoard}|${this.opponentLandCount},${this.graveyardNonSpellCount}`
    );
  }

  // ---------------------------------------------------------------- mana
  costOf(
    card: CardDef,
    base: Cost | null = null,
    fromGraveyard = false,
    extraRed = 0,
  ): Cost {
    const cost = base ?? card.cost;
    let red = extraRed;
    if (card.isInstantOrSorcery) red += this.reductionInstantSorcery;
    if (!card.isCreature) red += this.reductionNoncreature;
    if (cost.blue || cost.hybrid) red += this.reductionBlue;
    if (fromGraveyard) red += this.reductionFromGraveyard;
    return cost.withGeneric(Math.max(0, cost.generic - red));
  }

  get pool(): Pool {
    return this.mana.pool;
  }

  /** Pays a cost, tapping sources as needed (see SearchMana.spendMana). */
  spendMana(cost: Cost, isInstantOrSorcery = false): boolean {
    return this.mana.spendMana(
      cost,
      isInstantOrSorcery,
      this.isBonusSpellStillToCome(),
    );
  }

  /** Is a High Tide or Muck still to come this turn (in hand, or in the graveyard for Gale)? Islands and
   *  Swamps are then kept back: tapping them first would waste their bonus. */
  private isBonusSpellStillToCome(): boolean {
    const isBonusSpell = (name: string) =>
      name === 'High Tide' || name === 'Bubbling Muck';
    return (
      this.hand.some(isBonusSpell) ||
      (this.hasGale && this.graveyardSpells.some(isBonusSpell))
    );
  }

  untapLands(count: number): void {
    this.mana.untapLands(count);
  }

  payForSpell(
    card: CardDef,
    base: Cost | null = null,
    fromGraveyard = false,
  ): boolean {
    return this.spendMana(
      this.costOf(card, base, fromGraveyard),
      card.isInstantOrSorcery,
    );
  }

  /** Resolve opponent events (a flat [kind, i, n, kind, i, n, ...] stack, last event first). One long loop on purpose:
   *  the kill search runs it millions of times, so it works on local copies of the fields and avoids helper calls. */
  /** Resolve opponent events (a flat [kind, i, n, kind, i, n, ...] stack, last event first). */
  resolveOpponentEvents(events: number[]): void {
    const life = this.opponentLife,
      lib = this.opponentLibrary,
      ogy = this.opponentGraveyard,
      poison = this.opponentPoison;
    const opponentCount = life.length;
    const gmAct = this.guildmageActivations,
      crank = this.hasMindcrank,
      konrad = this.hasKonrad,
      skinner = this.hasMindskinner;
    const won = (): boolean => {
      for (let opponent = 0; opponent < opponentCount; opponent++)
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
          for (let opponent = 0; opponent < opponentCount; opponent++)
            events.push(MILL, opponent, amount);
        else events.push(LOSE, i, amount);
      } else if (kind === KONRAD) {
        for (let opponent = 0; opponent < opponentCount; opponent++)
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
  creatureCardsMilled(
    i: number,
    amount: number,
    _fromLibrary: boolean,
  ): number {
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
      opponentStep: step,
    };
    this.opponentStepKey += `;${this.guildmageActivations}${+this.hasMindcrank}${+this.hasKonrad}${+this.hasMindskinner}${step.join(',')}`;
    this.applyOpponentStep(step);
  }

  applyOpponentStep(step: Op): void {
    const kind = step[0];
    const opponentCount = this.opponentLife.length;
    if (kind === 'events') {
      // fixed events, e.g. a Konrad trigger from a creature dying
      this.resolveOpponentEvents((step[1] as number[]).slice());
    } else if (kind === 'eachOpponentMills') {
      // each opponent mills: a number, "half", "halfup" or "graveyardSize"
      const how = step[1];
      const events: number[] = [];
      for (let i = 0; i < opponentCount; i++) {
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
    } else if (
      kind === 'millBiggestLibrary' ||
      kind === 'damageBiggestLibrary' ||
      kind === 'halveBiggestLibrary'
    ) {
      // the opponent with the biggest library
      const target = this.biggestLibraryOpponent();
      if (target !== null) {
        if (kind === 'damageBiggestLibrary')
          this.resolveOpponentEvents([DMG, target, step[1] as number]);
        else
          this.resolveOpponentEvents([
            MILL,
            target,
            kind === 'halveBiggestLibrary'
              ? Math.floor(this.opponentLibrary[target] / 2)
              : (step[1] as number),
          ]);
      }
    } else if (kind === 'dmg_each') {
      const events: number[] = [];
      for (let i = 0; i < opponentCount; i++)
        if (this.isOpponentAlive(i)) events.push(DMG, i, step[1] as number);
      this.resolveOpponentEvents(events);
    } else if (kind === 'konact') {
      // Konrad {1}{B}: each player mills 1
      const events: number[] = [];
      for (let i = 0; i < opponentCount; i++)
        if (this.isOpponentAlive(i)) events.push(MILL, i, 1);
      events.push(SELFMILL, -1, 1);
      this.resolveOpponentEvents(events);
    } else if (kind === 'poison') {
      // Prologue to Phyresis: each opponent gets a poison counter
      for (let i = 0; i < opponentCount; i++)
        if (this.isOpponentAlive(i)) this.opponentPoison[i] += 1;
    } else if (kind === 'prolif') {
      // Expansion Algorithm: proliferate X times (only poison matters)
      for (let i = 0; i < opponentCount; i++)
        if (this.isOpponentAlive(i) && this.opponentPoison[i] > 0)
          this.opponentPoison[i] += step[1] as number;
    } else if (kind === 'windfall') {
      // opponents discard their hands, then draw n
      const oppHand = step[1] as number,
        nDraw = step[2] as number;
      const events: number[] = [];
      for (let i = 0; i < opponentCount; i++)
        if (this.isOpponentAlive(i)) events.push(PUTGY, i, oppHand);
      this.resolveOpponentEvents(events);
      for (let i = 0; i < opponentCount; i++)
        if (this.isOpponentAlive(i)) this.opponentDraws(i, nDraw);
    }
  }

  millEach(how: number | string): void {
    this.recordOpponentStep('eachOpponentMills', how);
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
    if (isUnearthLike(name)) {
      if (variant === 'The Mindskinner') this.hasMindskinner = true;
      else if (variant === 'Duskmantle Guildmage') this.hasGuildmage = true;
      if (this.graveyardCreatures.includes(variant))
        this.graveyardCreatures = this.graveyardCreatures.filter(
          (name) => name !== variant,
        );
      this.creatureCount += 1;
      if (this.hasKonrad) this.recordOpponentStep('events', [KONRAD, -1, 1]);
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
        if (this.hasKonrad) this.recordOpponentStep('events', [KONRAD, -1, 1]);
      }
      for (let copyNumber = 0; copyNumber < copies; copyNumber++) {
        if (this.biggestLibraryOpponent() === null) break;
        this.recordOpponentStep('halveBiggestLibrary', 0);
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
      this.hasGale = this.hasEmetSelch = false; // creatures too
      this.mindskinnerCanAttack = false;
      this.creatureCount = this.sacrificeFodder = 0;
      this.millEach('half');
      if (hadKonrad && dead > 0) {
        this.hasKonrad = true; // LKI: triggers resolve with Konrad's damage, Konrad itself is gone
        this.recordOpponentStep('events', [KONRAD, -1, dead]);
        this.hasKonrad = false;
      }
    } else if (name === 'Windfall') {
      const nDraw = Math.max(this.opponentHandSize, this.hand.length);
      this.recordOpponentStep('windfall', this.opponentHandSize, nDraw);
      // our own hand is discarded: instants/sorceries become Gale targets
      const add = this.hand.filter((name) => C.get(name).isInstantOrSorcery);
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
      this.mana.pool.B +=
        this.graveyardNonSpellCount + this.graveyardSpells.length >= 7 ? 5 : 3; // threshold: seven or more cards in the graveyard
    } else if (name === 'Drain Power') {
      this.mana.pool.C += this.opponentLandCount; // (a second cast via Gale targets another opponent)
    } else if (name === 'Energy Tap') {
      if (this.energyTapTargets.length) {
        this.mana.pool.C += this.energyTapTargets[0];
        this.energyTapTargets = this.energyTapTargets.slice(1);
      }
    } else if (name === 'Dark Ritual') {
      this.mana.pool.B += 3;
    } else if (name === 'High Tide') {
      // every copy stacks: each Island tapped from now on makes one more U
      this.mana.highTides += 1;
    } else if (name === 'Bubbling Muck') {
      this.mana.bubblingMucks += 1;
    } else if (name === 'Energybending') {
      this.mana.isEnergybent = true; // the lands tapped to pay for it are already tapped and gain nothing
    } else if (name === 'Turnabout') {
      this.untapLands(Infinity); // every land untaps
    } else if (name === 'Frantic Search' || name === 'Snap') {
      this.untapLands(name === 'Frantic Search' ? 3 : 2);
    } else {
      return false;
    }
    return true;
  }

  /** The ways to cast a spell: [variant, base cost]. */
  castVariants(name: string, _fromGraveyard: boolean): [string, Cost][] {
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
    if (isUnearthLike(name)) {
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
