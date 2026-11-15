/**
 * The mana a kill search (or any search over a copy of the game) works with: the sources we could tap, kept apart
 * from the mana already made. A source (a land, a rock, a mana creature) stays untapped until a payment needs it, so
 * effects that depend on which lands are untapped at that moment (High Tide, Bubbling Muck: an Island tapped from now
 * on adds {U}; an untap spell: a land that was tapped for an earlier cost can be tapped again) come out right.
 *
 * What the search tapped is recorded (`payments`), and the real game plays the same taps (GameCore.sourcesPlannedFor
 * and GameCore.landsToUntap), so a line the search found is paid for the way it counted.
 */
import { Cost } from '../cards/cards';
import type { GameCore } from './game-core';
import type { Permanent } from './game-types';

export type Pool = { U: number; B: number; A: number; C: number; S: number };
type PoolKey = keyof Pool;

/** A kind of land: what it taps for (a manaSourceKind) and whether it is an Island / a Swamp (High Tide / Muck). */
export interface LandClass {
  kind: string;
  isIsland: boolean;
  isSwamp: boolean;
  /** False for a filter Signet: it taps like a land here but Turnabout and the untap spells don't untap it. */
  isLand: boolean;
}

/** The cost text of a PaymentRecord that is an untap effect: its `taps` are the lands it untapped. */
export const UNTAP = 'untap';

/** How the search paid for one cost: the lands (kinds) it tapped, in order. The real game taps the same ones. */
export interface PaymentRecord {
  cost: string;
  taps: LandClass[];
}

/** Pays a cost from a pool (changing it). Returns null if paid, else what the pool is short of:
 *  'U' or 'B' (a coloured mana) or 'any' (generic, or a hybrid mana). */
function spendFromPool(
  pool: Pool,
  cost: Cost,
  isInstantOrSorcery: boolean,
): 'U' | 'B' | 'any' | null {
  let blueNeeded = cost.blue,
    blackNeeded = cost.black;
  let take = Math.min(pool.U, blueNeeded);
  pool.U -= take;
  blueNeeded -= take;
  take = Math.min(pool.B, blackNeeded);
  pool.B -= take;
  blackNeeded -= take;
  if (blueNeeded + blackNeeded > pool.A) {
    // any-colour mana covers what is left; the colour we are short of decides which land to tap
    return blueNeeded > 0 && (blackNeeded === 0 || blueNeeded >= blackNeeded)
      ? 'U'
      : 'B';
  }
  pool.A -= blueNeeded + blackNeeded;
  for (let hybridIndex = 0; hybridIndex < cost.hybrid; hybridIndex++) {
    const kind: PoolKey | null =
      pool.U >= pool.B && pool.U > 0
        ? 'U'
        : pool.B > 0
          ? 'B'
          : pool.A > 0
            ? 'A'
            : null;
    if (!kind) return 'any';
    pool[kind] -= 1;
  }
  let genericLeft = cost.generic;
  const bFirst = pool.B >= pool.U;
  const order: PoolKey[] = isInstantOrSorcery
    ? ['S', 'C', bFirst ? 'B' : 'U', bFirst ? 'U' : 'B', 'A']
    : ['C', bFirst ? 'B' : 'U', bFirst ? 'U' : 'B', 'A'];
  for (const kind of order) {
    take = Math.min(pool[kind], genericLeft);
    pool[kind] -= take;
    genericLeft -= take;
  }
  return genericLeft === 0 ? null : 'any';
}

/** Can this kind of land tap for this colour? */
function landMakes(
  landClass: LandClass,
  colour: 'U' | 'B' | 'any',
  isEnergybent: boolean,
): boolean {
  if (colour === 'any' || isEnergybent) return true;
  const kind = landClass.kind;
  if (kind === 'UB' || kind === 'F') return true;
  if (kind === 'U' || kind === 'B') return kind === colour;
  return kind !== 'C' && kind !== 'C2'; // a flexible land
}

/** A group of mana sources of one kind, counted untapped and in all. Copies share it; a change makes a new one. */
export class SearchMana {
  pool: Pool = { U: 0, B: 0, A: 0, C: 0, S: 0 };
  /** High Tides / Bubbling Mucks resolved this turn: a land tapped from now on adds that much more. */
  highTides = 0;
  bubblingMucks = 0;
  landClasses: LandClass[] = [];
  untappedLands: number[] = [];
  allLands: number[] = [];
  /** Energybending: every land is an Island and a Swamp (it taps for either colour). */
  isEnergybent = false;
  /** The payments (and untaps) since the last time the caller took them. */
  payments: PaymentRecord[] = [];

  copy(): SearchMana {
    const mana = new SearchMana();
    mana.pool = { ...this.pool };
    mana.highTides = this.highTides;
    mana.bubblingMucks = this.bubblingMucks;
    mana.landClasses = this.landClasses; // replaced, never changed in place
    mana.untappedLands = this.untappedLands.slice();
    mana.allLands = this.allLands; // replaced, never changed in place
    mana.isEnergybent = this.isEnergybent;
    mana.payments = this.payments; // replaced, never changed in place
    return mana;
  }

  /** For telling two searched positions apart. */
  key(): string {
    const pool = this.pool;
    return `${pool.U},${pool.B},${pool.A},${pool.C},${pool.S},${this.highTides},${this.bubblingMucks},${+this.isEnergybent},${this.untappedLands},${this.allLands}`;
  }

  /** The mana the game has now (nextTurn: at the start of our next turn, everything untapped, no High Tide).
   *  landFromHand: a land drop next turn makes one more mana. */
  static fromGame(
    game: GameCore<unknown>,
    nextTurn: boolean,
    landFromHand: boolean,
  ): SearchMana {
    const mana = new SearchMana();
    if (!nextTurn) {
      mana.pool.U = game.pool.U;
      mana.pool.B = game.pool.B;
      mana.pool.C = game.pool.C;
      mana.pool.S = game.pool.S;
    }
    mana.highTides = nextTurn ? 0 : game.highTidesThisTurn;
    mana.bubblingMucks = nextTurn ? 0 : game.muck;
    mana.isEnergybent = game.isEnergybendingActive && !nextTurn;
    for (const permanent of game.battlefield) {
      const kind = game.manaSourceKind(permanent, nextTurn);
      if (kind === null) continue;
      const isUntapped = nextTurn || !permanent.tapped;
      if (kind === 'S') {
        if (isUntapped) mana.pool.S += 1; // only pays for instants and sorceries
        continue;
      }
      // a rock or a mana creature has no land types; a filter Signet is fed a mana when it is tapped
      const land = permanent.land;
      mana.countSource(
        {
          kind,
          isIsland: !!land?.island,
          isSwamp: !!land?.swamp,
          isLand: land !== null,
        },
        isUntapped,
      );
    }
    if (nextTurn && landFromHand)
      mana.countSource(
        { kind: 'A', isIsland: false, isSwamp: false, isLand: true },
        true,
      );
    return mana;
  }

  private indexOfClass(landClass: LandClass): number {
    return this.landClasses.findIndex(
      (existing) =>
        existing.kind === landClass.kind &&
        existing.isIsland === landClass.isIsland &&
        existing.isSwamp === landClass.isSwamp &&
        existing.isLand === landClass.isLand,
    );
  }

  /** Counts one more source of this kind (untapped or tapped). */
  private countSource(landClass: LandClass, isUntapped: boolean): void {
    let index = this.indexOfClass(landClass);
    if (index < 0) {
      index = this.landClasses.length;
      this.landClasses = [...this.landClasses, landClass];
      this.allLands = [...this.allLands, 0];
      this.untappedLands.push(0);
    }
    this.allLands = this.allLands.slice();
    this.allLands[index] += 1;
    if (isUntapped) this.untappedLands[index] += 1;
  }

  /** A land comes into play untapped. */
  addLand(landClass: LandClass): void {
    this.countSource(landClass, true);
  }

  /** Pays a cost from the pool, tapping more lands (one at a time) while the pool falls short.
   *  keepTypedLandsBack: a High Tide / Muck is still to come, so Islands and Swamps stay untapped if anything else
   *  will do (tapping them first would waste their bonus). */
  spendMana(
    cost: Cost,
    isInstantOrSorcery: boolean,
    keepTypedLandsBack: boolean,
  ): boolean {
    const taps: LandClass[] = [];
    for (;;) {
      const poolAfterPaying = { ...this.pool };
      const shortOf = spendFromPool(poolAfterPaying, cost, isInstantOrSorcery);
      if (shortOf === null) {
        this.pool = poolAfterPaying;
        this.payments = [...this.payments, { cost: `${cost}`, taps }];
        return true;
      }
      if (
        !this.tapAnotherLand(
          shortOf,
          poolAfterPaying,
          false,
          taps,
          keepTypedLandsBack,
        )
      )
        return false;
    }
  }

  /** Taps a land of this class: adds its mana to the pool (High Tides and Mucks count). */
  tapLand(landClass: LandClass, shortOf: 'U' | 'B' | 'any' = 'any'): void {
    const pool = this.pool;
    const isEnergybent = this.isEnergybent && landClass.isLand;
    const isIsland = landClass.isIsland || isEnergybent;
    const isSwamp = landClass.isSwamp || isEnergybent;
    const kind = isEnergybent ? 'A' : landClass.kind;
    if (kind === 'U') pool.U += 1;
    else if (kind === 'B') pool.B += 1;
    else if (kind === 'UB') {
      pool.U += 1;
      pool.B += 1;
    } else if (kind === 'C') pool.C += 1;
    else if (kind === 'C2') pool.C += 2;
    else if (kind === 'F') {
      // a filter source (its fed mana was taken from the pool already) adds one of each
      pool.U += 1;
      pool.B += 1;
    } else if (shortOf === 'U') pool.U += 1;
    else pool.B += 1; // an any-colour source makes a colour when it is tapped: the one we are short of, else black like the game
    if (isIsland) pool.U += this.highTides;
    if (isSwamp) pool.B += this.bubblingMucks;
  }

  /** How much mana tapping a land of this class makes now. */
  landYield(landClass: LandClass): number {
    const isEnergybent = this.isEnergybent && landClass.isLand;
    const isIsland = landClass.isIsland || isEnergybent;
    const isSwamp = landClass.isSwamp || isEnergybent;
    const makesTwo =
      !isEnergybent && (landClass.kind === 'C2' || landClass.kind === 'UB');
    return (
      (makesTwo ? 2 : 1) +
      (isIsland ? this.highTides : 0) +
      (isSwamp ? this.bubblingMucks : 0)
    );
  }

  /** Taps one more untapped land to make what the pool is short of. False if no land can. */
  private tapAnotherLand(
    shortOf: 'U' | 'B' | 'any',
    poolAfterPaying: Pool,
    skipFilters: boolean,
    taps: LandClass[],
    keepTypedLandsBack: boolean,
  ): boolean {
    // For a generic cost, an Island or a Swamp from the colour we have more of (a tie: the Swamp), so the
    // scarcer colour stays for the costs still to come.
    let blueSupply = poolAfterPaying.U;
    let blackSupply = poolAfterPaying.B;
    for (let index = 0; index < this.landClasses.length; index++) {
      if (this.landClasses[index].kind === 'U')
        blueSupply += this.untappedLands[index];
      if (this.landClasses[index].kind === 'B')
        blackSupply += this.untappedLands[index];
    }
    const colourToSpendFirst = blackSupply >= blueSupply ? 'B' : 'U';
    let bestClass = -1;
    let bestScore = Infinity;
    for (let index = 0; index < this.landClasses.length; index++) {
      if (this.untappedLands[index] <= 0) continue;
      const landClass = this.landClasses[index];
      if (!landMakes(landClass, shortOf, this.isEnergybent)) continue;
      if (landClass.kind === 'F' && skipFilters) continue;
      const isEnergybent = this.isEnergybent && landClass.isLand;
      const typeCount =
        (landClass.isIsland || isEnergybent ? 1 : 0) +
        (landClass.isSwamp || isEnergybent ? 1 : 0);
      // Smaller is better. Keeping typed lands back: the fewest types first. Otherwise: the most mana first.
      // Ties: the least flexible land first (keep the any-colour lands for later).
      const flexibility =
        landClass.kind === 'F'
          ? 3 // a filter source needs a mana to feed it: only when nothing else will do
          : landClass.kind === 'C' || landClass.kind === 'C2'
            ? 0
            : landClass.kind === 'U' || landClass.kind === 'B'
              ? landClass.kind === colourToSpendFirst
                ? 1
                : 1.5
              : 2;
      const score = keepTypedLandsBack
        ? typeCount * 100 + flexibility
        : (100 - this.landYield(landClass)) * 100 + flexibility;
      if (score < bestScore) {
        bestScore = score;
        bestClass = index;
      }
    }
    if (bestClass < 0) return false;
    if (this.landClasses[bestClass].kind === 'F') {
      // fed with a mana the payment doesn't need; if there is none, tap something else for it first
      const leftover =
        poolAfterPaying.U +
        poolAfterPaying.B +
        poolAfterPaying.A +
        poolAfterPaying.C +
        poolAfterPaying.S;
      if (leftover === 0)
        return this.tapAnotherLand(
          'any',
          poolAfterPaying,
          true,
          taps,
          keepTypedLandsBack,
        );
      this.feedFilterSource(poolAfterPaying, shortOf);
    }
    this.untappedLands[bestClass] -= 1;
    this.tapLand(this.landClasses[bestClass], shortOf);
    taps.push(this.landClasses[bestClass]);
    return true;
  }

  /** The mana a filter source eats from the pool: colourless first, never the colour we are short of if another will do. */
  private feedFilterSource(
    poolAfterPaying: Pool,
    shortOf: 'U' | 'B' | 'any',
  ): void {
    const order: PoolKey[] =
      shortOf === 'B' ? ['C', 'U', 'B', 'S', 'A'] : ['C', 'B', 'U', 'S', 'A'];
    for (const kind of order)
      if (poolAfterPaying[kind] > 0) {
        this.pool[kind] -= 1;
        return;
      }
  }

  /** Untap up to `count` of our tapped lands, the way the game does (GameCore.untapLands): the lands that make the
   *  most first (counting High Tide's and Muck's bonus), then one that makes two colours. */
  untapLands(count: number): void {
    const untapOrderKey = (landClass: LandClass): number => {
      const isEnergybent = this.isEnergybent && landClass.isLand;
      const manaMade =
        1 +
        (landClass.isIsland || isEnergybent ? this.highTides : 0) +
        (landClass.isSwamp || isEnergybent ? this.bubblingMucks : 0);
      const makesTwoColours =
        isEnergybent || landClass.kind === 'A' || landClass.kind === 'UB';
      return -2 * manaMade + (makesTwoColours ? 0 : 1);
    };
    const order = this.landClasses
      .map((_landClass, index) => index)
      .filter((index) => this.landClasses[index].isLand)
      .sort(
        (first, second) =>
          untapOrderKey(this.landClasses[first]) -
          untapOrderKey(this.landClasses[second]),
      );
    const untapped: LandClass[] = [];
    for (const index of order) {
      const tapped = this.allLands[index] - this.untappedLands[index];
      const toUntap = Math.min(tapped, count);
      if (toUntap <= 0) continue;
      this.untappedLands[index] += toUntap;
      count -= toUntap;
      for (let land = 0; land < toUntap; land++)
        untapped.push(this.landClasses[index]);
    }
    this.payments = [...this.payments, { cost: UNTAP, taps: untapped }];
  }

  /** The pool if every untapped land were tapped now (how much mana we could have: for scoring and the log). */
  manaWithAllLandsTapped(): Pool {
    const everything = this.copy();
    for (let index = 0; index < everything.landClasses.length; index++)
      while (everything.untappedLands[index] > 0) {
        everything.untappedLands[index] -= 1;
        everything.tapLand(everything.landClasses[index]);
        if (everything.landClasses[index].kind === 'F') everything.pool.B -= 1; // (it ate a mana to make the two)
      }
    return everything.pool;
  }
}

/** Is this permanent a source of the kind the search counted? */
export function isSourceOfClass(
  game: GameCore<unknown>,
  permanent: Permanent,
  landClass: LandClass,
): boolean {
  if (game.manaSourceKind(permanent) !== landClass.kind) return false;
  const land = permanent.land;
  return (
    (land !== null) === landClass.isLand &&
    !!land?.island === landClass.isIsland &&
    !!land?.swamp === landClass.isSwamp
  );
}
