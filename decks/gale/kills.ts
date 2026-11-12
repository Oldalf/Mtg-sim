/**
 * Gale kill lines: the snapshot of the game the kill search works on, and the moves it may make.
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
import * as Facts from '../../engine/card-facts';
import { Cost, CardDef } from '../../engine/cards';
import { KillSearch } from '../../engine/search';
import { Rng } from '../../engine/rng';
import { COMBO_SPELLS } from './roles';

export const FODDER_EXCLUDE = new Set([
  'Syr Konrad, the Grim',
  'The Mindskinner',
  'Duskmantle Guildmage',
]);
export const SINGLE_MILL: Record<string, string> = {
  Traumatize: '{3}{U}{U}',
  'Cut Your Losses': '{4}{U}{U}',
};
const RELEVANT = new Set([
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
export const EV = { MILL, PUTGY, LOSE, DMG, KONRAD, SELFMILL };

/** A step that touched the opponents: kind + arguments ("ev" carries a flat event list). */
export type Op = (string | number | number[])[];
interface OlogNode {
  prev: OlogNode | null;
  gmAct: number;
  crank: boolean;
  konrad: boolean;
  skinner: boolean;
  op: Op;
}

/** Linked step description: [parent, text, life, lib, poison] (text is only built for the winning line). */
export type Path = [Path, string, number[], number[], number[]] | null;

/** Python's round(): halves go to the even neighbour. */
function pyRound(x: number): number {
  const f = Math.floor(x);
  const d = x - f;
  if (Math.abs(d - 0.5) < 1e-12) return f % 2 === 0 ? f : f + 1;
  return Math.round(x);
}

function remove1(a: string[], name: string): string[] {
  const i = a.indexOf(name);
  const out = a.slice();
  out.splice(i, 1);
  return out;
}

function addSorted(a: string[], names: string[]): string[] {
  return [...a, ...names].sort();
}

function uniqSorted(a: string[]): string[] {
  const out: string[] = [];
  for (const x of a) if (!out.includes(x)) out.push(x);
  return out.sort();
}

export class Light {
  // ht / muck: how many High Tides / Bubbling Mucks resolved this turn (each adds +1 per Island / Swamp).
  // htCount / swCount / lands: untapped Island-typed / Swamp-typed / all lands (already in the pool).
  // mix: [dual, island-only, swamp-only, other] over ALL our lands, used when Frantic Search / Snap /
  // Unwind / Turnabout untap lands that were tapped earlier.
  // free: coloured mana from outside our lands (rocks, floating mana, Dark Ritual). High Tide / Bubbling
  // Muck are paid from it if possible; otherwise an Island / Swamp taps for them and misses the bonus.
  // freeC: the same for colourless mana (Sol Ring), used first for Energybending's {2}.
  pool: Pool = { U: 0, B: 0, A: 0, C: 0, S: 0 };
  htCount = 0;
  swCount = 0;
  ht = 0;
  muck = 0;
  mix: number[] = [0, 0, 0, 0];
  free = 0;
  freeC = 0;
  hand: string[] = [];
  gy: string[] = [];
  gyCr: string[] = []; // sorted names
  gale = false;
  gm = false;
  gmAct = 0;
  crank = false;
  konrad = false;
  skinner = false;
  skinnerAtk = false;
  mon = false;
  monEx = false;
  emet = false;
  emetUsed = false;
  lost = false;
  fodder = 0;
  nCre = 0;
  redIs = 0;
  redNc = 0;
  redBlue = 0;
  redGy = 0;
  life: number[] = [];
  lib: number[] = [];
  ogy: number[] = [];
  cacc: number[] = [];
  poison: number[] = [];
  myLib = 0;
  myCacc = 0;
  myDens = 0;
  pCre = 0;
  oppHand = 0;
  oppCre = 0;
  lands = 0;
  // Energy Tap: mana values of our untapped creatures it could tap (highest first); Drain Power: an opponent's
  // lands; Cabal Ritual: graveyard cards that aren't instants/sorceries (gy only lists those)
  tapMvs: number[] = [];
  oppLands = 0;
  gyOther = 0;
  path: Path = null;
  // olog: every step that touched the opponents, with the flags active then (replayed by chainProb)
  // rnd: a Konrad trigger used the "expected 30% creatures" count, so the result is only an average
  olog: OlogNode | null = null;
  ologKey = '';
  rnd = false;

  copy(): Light {
    const n: Light = Object.create(Object.getPrototypeOf(this));
    n.pool = {
      U: this.pool.U,
      B: this.pool.B,
      A: this.pool.A,
      C: this.pool.C,
      S: this.pool.S,
    };
    n.htCount = this.htCount;
    n.swCount = this.swCount;
    n.ht = this.ht;
    n.muck = this.muck;
    n.mix = this.mix; // replaced, never changed in place
    n.free = this.free;
    n.freeC = this.freeC;
    n.hand = this.hand;
    n.gy = this.gy;
    n.gyCr = this.gyCr; // replaced, never changed in place
    n.gale = this.gale;
    n.gm = this.gm;
    n.gmAct = this.gmAct;
    n.crank = this.crank;
    n.konrad = this.konrad;
    n.skinner = this.skinner;
    n.skinnerAtk = this.skinnerAtk;
    n.mon = this.mon;
    n.monEx = this.monEx;
    n.emet = this.emet;
    n.emetUsed = this.emetUsed;
    n.lost = this.lost;
    n.fodder = this.fodder;
    n.nCre = this.nCre;
    n.redIs = this.redIs;
    n.redNc = this.redNc;
    n.redBlue = this.redBlue;
    n.redGy = this.redGy;
    n.life = this.life.slice();
    n.lib = this.lib.slice();
    n.ogy = this.ogy.slice();
    n.cacc = this.cacc.slice();
    n.poison = this.poison.slice();
    n.myLib = this.myLib;
    n.myCacc = this.myCacc;
    n.myDens = this.myDens;
    n.pCre = this.pCre;
    n.oppHand = this.oppHand;
    n.oppCre = this.oppCre;
    n.lands = this.lands;
    n.tapMvs = this.tapMvs;
    n.oppLands = this.oppLands;
    n.gyOther = this.gyOther; // (tapMvs is replaced, never changed)
    n.path = this.path;
    n.olog = this.olog;
    n.ologKey = this.ologKey;
    n.rnd = this.rnd;
    return n;
  }

  // ---------------------------------------------------------------- state
  alive(i: number): boolean {
    return this.life[i] > 0 && this.lib[i] > 0 && this.poison[i] < 10;
  }

  won(): boolean {
    const life = this.life,
      lib = this.lib,
      poison = this.poison;
    for (let i = 0; i < life.length; i++)
      if (life[i] > 0 && lib[i] > 0 && poison[i] < 10) return false;
    return true;
  }

  /** For de-duplication inside one search. */
  key(): string {
    const p = this.pool;
    return (
      `${p.U},${p.B},${p.A},${p.C},${p.S},${this.ht},${this.muck},${this.htCount},${this.swCount},` +
      `${this.mix},${this.free},${this.freeC}|${this.hand}|${this.gy}|${this.gyCr}|` +
      `${+this.gm}${this.gmAct}${+this.crank}${+this.konrad}${+this.skinner}${+this.skinnerAtk}${+this.mon}` +
      `${+this.monEx}${+this.emetUsed}${+this.lost},${this.fodder}|${this.life}|${this.lib}|${this.poison}|${this.tapMvs}`
    );
  }

  /** Every field that can influence the search (the result cache key). */
  fullKey(): string {
    return (
      this.key() +
      `|${+this.gale}${+this.emet},${this.nCre},${this.redIs},${this.redNc},${this.redBlue},` +
      `${this.redGy}|${this.ogy}|${this.cacc}|${this.myLib},${this.myCacc},${this.myDens},${this.pCre},` +
      `${this.oppHand},${this.oppCre},${this.lands}|${this.oppLands},${this.gyOther}`
    );
  }

  // ---------------------------------------------------------------- mana
  costOf(
    cd: CardDef,
    base: Cost | null = null,
    fromGy = false,
    extraRed = 0,
  ): Cost {
    const cost = base ?? cd.cost;
    let red = extraRed;
    if (cd.isIS) red += this.redIs;
    if (!cd.isCreature) red += this.redNc;
    if (cost.u || cost.h) red += this.redBlue;
    if (fromGy) red += this.redGy;
    return cost.withGeneric(Math.max(0, cost.g - red));
  }

  spend(cost: Cost, isIS = false): boolean {
    const p = this.pool;
    let u = cost.u,
      b = cost.b;
    let take = Math.min(p.U, u);
    p.U -= take;
    u -= take;
    take = Math.min(p.B, b);
    p.B -= take;
    b -= take;
    if (u + b > p.A) return false;
    p.A -= u + b;
    for (let h = 0; h < cost.h; h++) {
      const k: PoolKey | null =
        p.U >= p.B && p.U > 0 ? 'U' : p.B > 0 ? 'B' : p.A > 0 ? 'A' : null;
      if (!k) return false;
      p[k] -= 1;
    }
    let g = cost.g;
    const bFirst = p.B >= p.U;
    const order: PoolKey[] = isIS
      ? ['S', 'C', bFirst ? 'B' : 'U', bFirst ? 'U' : 'B', 'A']
      : ['C', bFirst ? 'B' : 'U', bFirst ? 'U' : 'B', 'A'];
    for (const k of order) {
      take = Math.min(p[k], g);
      p[k] -= take;
      g -= take;
    }
    return g === 0;
  }

  pay(cd: CardDef, base: Cost | null = null, fromGy = false): boolean {
    return this.spend(this.costOf(cd, base, fromGy), cd.isIS);
  }

  // ---------------------------------------------------------------- opponent engine
  /** Resolve opponent events (a flat [kind, i, n, kind, i, n, ...] stack, last event first). */
  run(events: number[]): void {
    const life = this.life,
      lib = this.lib,
      ogy = this.ogy,
      poison = this.poison;
    const nOpp = life.length;
    const gmAct = this.gmAct,
      crank = this.crank,
      konrad = this.konrad,
      skinner = this.skinner;
    const won = (): boolean => {
      for (let j = 0; j < nOpp; j++)
        if (life[j] > 0 && lib[j] > 0 && poison[j] < 10) return false;
      return true;
    };
    // Only a mill or a life loss can change whether everyone is dead, so that's the only time the
    // answer is recomputed; after other events it is the same as before.
    let done: boolean | null = null;
    let guard = 0;
    while (events.length && guard < 5000) {
      guard++;
      let n = events.pop()!;
      const i = events.pop()!;
      const kind = events.pop()!;
      if (kind === MILL && !konrad) {
        // Fast path for the straight chain mill -> (Guildmage) lose -> (Mindcrank) mill -> ...:
        // without Konrad each step causes at most one next step, handled right away.
        for (;;) {
          if (life[i] <= 0) break;
          if (lib[i] < n) n = lib[i];
          lib[i] -= n;
          if (n <= 0) break;
          ogy[i] += n;
          done = won();
          if (done) return;
          if (!gmAct) break;
          if (guard >= 5000) return;
          guard++;
          n *= gmAct; // the "lose" step
          if (life[i] <= 0) break;
          life[i] -= n;
          this.lost = true;
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
          if (lib[i] < n) n = lib[i];
          lib[i] -= n;
        }
        if (n <= 0) continue;
        ogy[i] += n;
        if (gmAct) events.push(LOSE, i, n * gmAct);
        if (konrad) {
          const k = this.hits(i, n, kind === MILL);
          if (k) events.push(KONRAD, -1, k);
        }
        if (kind === MILL) done = won();
      } else if (kind === LOSE) {
        if (life[i] <= 0) continue;
        life[i] -= n;
        this.lost = true;
        if (crank) events.push(MILL, i, n);
        done = won();
      } else if (kind === DMG) {
        if (life[i] <= 0) continue;
        if (skinner) for (let j = 0; j < nOpp; j++) events.push(MILL, j, n);
        else events.push(LOSE, i, n);
      } else if (kind === KONRAD) {
        for (let j = 0; j < nOpp; j++) events.push(DMG, j, n);
      } else if (kind === SELFMILL) {
        if (this.myLib < n) n = this.myLib;
        this.myLib -= n;
        if (konrad && n) {
          const k = this.hits(-1, n, true);
          if (k) events.push(KONRAD, -1, k);
        }
      }
      if (done === null) done = won();
      if (done) return;
    }
  }

  /** Creature cards among n cards put into graveyard i (-1 = our own) while Konrad is out.
   *  Here: the expected fraction, carried over between mills. World (below) uses real shuffles. */
  hits(i: number, n: number, _fromLib: boolean): number {
    this.rnd = true;
    if (i < 0) {
      this.myCacc += n * this.myDens;
      const k = Math.floor(this.myCacc + 1e-9);
      this.myCacc -= k;
      return k;
    }
    this.cacc[i] += n * this.pCre;
    const k = Math.floor(this.cacc[i] + 1e-9);
    this.cacc[i] -= k;
    return k;
  }

  drawOpp(i: number, n: number): void {
    this.lib[i] = this.lib[i] < n ? 0 : this.lib[i] - n;
  }

  /** Every effect on the opponents goes through opp(), so a winning line can be replayed with real shuffles. */
  opp(...op: Op): void {
    this.olog = {
      prev: this.olog,
      gmAct: this.gmAct,
      crank: this.crank,
      konrad: this.konrad,
      skinner: this.skinner,
      op,
    };
    this.ologKey += `;${this.gmAct}${+this.crank}${+this.konrad}${+this.skinner}${op.join(',')}`;
    this.applyOp(op);
  }

  applyOp(op: Op): void {
    const kind = op[0];
    const nOpp = this.life.length;
    if (kind === 'ev') {
      // fixed events, e.g. a Konrad trigger from a creature dying
      this.run((op[1] as number[]).slice());
    } else if (kind === 'each') {
      // each opponent mills: a number, "half", "halfup" or "ogy"
      const how = op[1];
      const ev: number[] = [];
      for (let i = 0; i < nOpp; i++) {
        if (!this.alive(i)) continue;
        const n =
          typeof how === 'number'
            ? how
            : how === 'half'
              ? Math.floor(this.lib[i] / 2)
              : how === 'halfup'
                ? Math.floor((this.lib[i] + 1) / 2)
                : this.ogy[i];
        ev.push(MILL, i, n);
      }
      this.run(ev);
    } else if (kind === 'tmill' || kind === 'tdmg' || kind === 'thalf') {
      // the opponent with the biggest library
      const t = this.target();
      if (t !== null) {
        if (kind === 'tdmg') this.run([DMG, t, op[1] as number]);
        else
          this.run([
            MILL,
            t,
            kind === 'thalf' ? Math.floor(this.lib[t] / 2) : (op[1] as number),
          ]);
      }
    } else if (kind === 'dmg_each') {
      const ev: number[] = [];
      for (let i = 0; i < nOpp; i++)
        if (this.alive(i)) ev.push(DMG, i, op[1] as number);
      this.run(ev);
    } else if (kind === 'konact') {
      // Konrad {1}{B}: each player mills 1
      const ev: number[] = [];
      for (let i = 0; i < nOpp; i++) if (this.alive(i)) ev.push(MILL, i, 1);
      ev.push(SELFMILL, -1, 1);
      this.run(ev);
    } else if (kind === 'poison') {
      // Prologue to Phyresis: each opponent gets a poison counter
      for (let i = 0; i < nOpp; i++) if (this.alive(i)) this.poison[i] += 1;
    } else if (kind === 'prolif') {
      // Expansion Algorithm: proliferate X times (only poison matters)
      for (let i = 0; i < nOpp; i++)
        if (this.alive(i) && this.poison[i] > 0)
          this.poison[i] += op[1] as number;
    } else if (kind === 'windfall') {
      // opponents discard their hands, then draw n
      const oppHand = op[1] as number,
        nDraw = op[2] as number;
      const ev: number[] = [];
      for (let i = 0; i < nOpp; i++)
        if (this.alive(i)) ev.push(PUTGY, i, oppHand);
      this.run(ev);
      for (let i = 0; i < nOpp; i++) if (this.alive(i)) this.drawOpp(i, nDraw);
    }
  }

  millEach(how: number | string): void {
    this.opp('each', how);
  }

  target(): number | null {
    let bl = -1,
      bf = -1,
      bi: number | null = null;
    for (let i = 0; i < this.life.length; i++) {
      if (!this.alive(i)) continue;
      if (
        bi === null ||
        this.lib[i] > bl ||
        (this.lib[i] === bl && this.life[i] > bf)
      ) {
        bl = this.lib[i];
        bf = this.life[i];
        bi = i;
      }
    }
    return bi;
  }

  // ---------------------------------------------------------------- spell effects
  resolve(name: string, variant: string): void {
    if (name === 'Maddening Cacophony') {
      this.millEach(variant === 'kick' ? 'halfup' : 8);
    } else if (
      name === 'Traumatize' ||
      name === 'Cut Your Losses' ||
      name === 'Overture'
    ) {
      const copies = variant === 'casualty' ? 2 : 1;
      if (variant === 'casualty') {
        if (this.fodder > 0) this.fodder -= 1;
        else this.gm = false;
        this.nCre -= 1;
        if (this.konrad) this.opp('ev', [KONRAD, -1, 1]);
      }
      for (let c = 0; c < copies; c++) {
        if (this.target() === null) break;
        this.opp('thalf', 0);
      }
    } else if (name === 'Singularity Rupture') {
      let alive = 0;
      for (let i = 0; i < this.life.length; i++) if (this.alive(i)) alive++;
      const dead = this.nCre - (this.konrad ? 1 : 0) + this.oppCre * alive;
      const hadKonrad = this.konrad;
      this.konrad = this.skinner = this.gm = false;
      this.skinnerAtk = false;
      this.nCre = this.fodder = 0;
      this.millEach('half');
      if (hadKonrad && dead > 0) {
        this.konrad = true; // LKI: triggers resolve with Konrad's damage, Konrad itself is gone
        this.opp('ev', [KONRAD, -1, dead]);
        this.konrad = false;
      }
    } else if (name === 'Windfall') {
      const nDraw = Math.max(this.oppHand, this.hand.length);
      this.opp('windfall', this.oppHand, nDraw);
      // our own hand is discarded: instants/sorceries become Gale targets
      const add = this.hand.filter((h) => C.get(h).isIS);
      if (add.length) this.gy = addSorted(this.gy, add);
      this.hand = [];
    } else if (name === 'Prologue to Phyresis') {
      this.opp('poison'); // (its card draw is ignored in the search)
    } else if (name === 'Expansion Algorithm') {
      this.opp('prolif', parseInt(variant.slice(1), 10));
    } else if (name === 'Extended Absence') {
      this.opp('dmg_each', 1);
    } else if (name === 'Cabal Ritual') {
      const n = this.gyOther + this.gy.length >= 7 ? 5 : 3; // threshold: seven or more cards in the graveyard
      this.pool.B += n;
      this.free += n;
    } else if (name === 'Drain Power') {
      this.pool.C += this.oppLands; // (a second cast via Gale targets another opponent)
      this.freeC += this.oppLands;
    } else if (name === 'Energy Tap') {
      if (this.tapMvs.length) {
        const mv = this.tapMvs[0];
        this.tapMvs = this.tapMvs.slice(1);
        this.pool.C += mv;
        this.freeC += mv;
      }
    } else if (name === 'Dark Ritual') {
      this.pool.B += 3;
      this.free += 3;
    } else if (name === 'High Tide') {
      // every copy stacks: +1 U for each Island not yet tapped
      this.paidByLand('htCount');
      this.pool.U += this.htCount;
      this.ht += 1;
    } else if (name === 'Bubbling Muck') {
      this.paidByLand('swCount');
      this.pool.B += this.swCount;
      this.muck += 1;
    } else if (name === 'Energybending') {
      // every land becomes an Island and a Swamp: High Tides / Mucks already resolved now also count
      // the untapped lands that weren't Islands / Swamps before. Its {2} (after reducers) comes from
      // rocks if possible, otherwise from lands (assumed to be the ones that would gain the new types).
      let paid = 0;
      const g = this.costOf(C.get('Energybending')).g;
      for (let k = 0; k < g; k++) {
        if (this.freeC > 0) this.freeC -= 1;
        else if (this.free > 0) this.free -= 1;
        else paid += 1;
      }
      paid = Math.min(paid, this.lands);
      this.pool.U += Math.max(0, this.lands - this.htCount - paid) * this.ht;
      this.pool.B += Math.max(0, this.lands - this.swCount - paid) * this.muck;
      this.lands -= paid;
      this.htCount = this.swCount = this.lands;
      this.mix = [
        this.mix[0] + this.mix[1] + this.mix[2] + this.mix[3],
        0,
        0,
        0,
      ];
    } else if (name === 'Turnabout') {
      this.untap(this.mix[0] + this.mix[1] + this.mix[2] + this.mix[3]); // every land was tapped for the pool already
    } else if (name === 'Frantic Search' || name === 'Snap') {
      this.untap(name === 'Frantic Search' ? 3 : 2);
    } else if (name === 'Unearth') {
      if (variant === 'The Mindskinner') this.skinner = true;
      else if (variant === 'Duskmantle Guildmage') this.gm = true;
      if (this.gyCr.includes(variant))
        this.gyCr = this.gyCr.filter((x) => x !== variant);
      this.nCre += 1;
      if (this.konrad) this.opp('ev', [KONRAD, -1, 1]);
    }
  }

  /** High Tide / Muck cost one coloured mana. Use mana from outside our lands if there is any;
   *  otherwise one Island / Swamp was tapped to pay, so it no longer counts for the bonus. */
  paidByLand(attr: 'htCount' | 'swCount'): void {
    if (this.free > 0) this.free -= 1;
    else if (this[attr] > 0) {
      this[attr] -= 1;
      this.lands -= 1;
    }
  }

  /** Untap k of our lands (already tapped) and tap them again, best lands first. Base mana: Islands
   *  give U, other lands either colour; each High Tide adds U per Island, each Muck adds B per Swamp. */
  untap(k: number): void {
    const [d, io, so, ot] = this.mix;
    const ht = this.ht,
      mk = this.muck;
    const kinds: [number, number, boolean, boolean][] = [
      [1 + ht + mk, d, true, true],
      [1 + ht, io, true, false],
      [1 + mk, so, false, true],
      [1, ot, false, false],
    ];
    kinds.sort((x, y) => y[0] - x[0]); // stable, like Python's sort
    for (const [, n, isl, sw] of kinds) {
      const t = Math.min(n, k);
      if (t <= 0) continue;
      k -= t;
      if (isl) this.pool.U += t * (1 + ht);
      else this.pool.A += t;
      if (sw) this.pool.B += t * mk;
    }
  }

  /** The ways to cast a spell: [variant, base cost]. */
  variants(name: string, _fromGy: boolean): [string, Cost][] {
    const cd = C.get(name);
    if (name === 'Maddening Cacophony')
      return [
        ['unk', cd.cost],
        ['kick', cd.cost.plus(new Cost(3, 1))],
      ];
    if (name === 'Cut Your Losses') {
      const v: [string, Cost][] = [['single', cd.cost]];
      if (this.fodder > 0 || (this.gm && this.gmAct > 0))
        v.push(['casualty', cd.cost]);
      return v;
    }
    if (name === 'Expansion Algorithm') {
      // X just big enough: from the lowest poison count, or one less if a Prologue (e.g. via Gale) resolves first
      let m = Infinity;
      for (let i = 0; i < this.life.length; i++)
        if (this.alive(i)) m = Math.min(m, this.poison[i]);
      if (m === Infinity) m = 0;
      const xs =
        m === 0
          ? [9]
          : [...new Set([10 - m, Math.max(1, 9 - m)])].sort((a, b) => a - b);
      return xs.map(
        (x) => [`X${x}`, cd.cost.plus(new Cost(x))] as [string, Cost],
      );
    }
    if (name === 'Unearth') {
      return uniqSorted(this.gyCr)
        .filter((c) => c === 'The Mindskinner' || c === 'Duskmantle Guildmage')
        .map((c) => [c, cd.cost] as [string, Cost]);
    }
    return [['x', cd.cost]]; // (Snap / Extended Absence assume some creature target is available)
  }
}

// ---------------------------------------------------------------- Konrad chains with real shuffles
/** One random deal of the opponents' (and our own) libraries, for replaying a line's opponent steps.
 *  Cards are drawn lazily: deck[i] = [cards left, creatures left]; the last entry is our own library. */
class World extends Light {
  deck: [number, number][] = [];
  rng!: Rng;

  take(d: [number, number], n: number): number {
    let hits = 0;
    let [rem, cre] = d;
    const m = Math.min(n, rem);
    for (let k = 0; k < m; k++) {
      if (this.rng.random() * rem < cre) {
        cre -= 1;
        hits += 1;
      }
      rem -= 1;
    }
    d[0] = rem;
    d[1] = cre;
    return hits;
  }

  override hits(i: number, n: number, fromLib: boolean): number {
    if (fromLib)
      return this.take(this.deck[i < 0 ? this.deck.length - 1 : i], n);
    let h = 0;
    for (let k = 0; k < n; k++) if (this.rng.random() < this.pCre) h++; // cards from hand (Windfall)
    return h;
  }

  override drawOpp(i: number, n: number): void {
    super.drawOpp(i, n);
    this.take(this.deck[i], n);
  }
}

export const CHAIN_MIN = 0.9; // a line that relies on Konrad's creature count must win at least this often
const CHAIN_N = 400; // random deals per line (40, then 100, then 400; stop once clearly above or below CHAIN_MIN)
const CHAIN_CACHE = new Map<string, number>();

/** Fraction of random deals in which the leaf's logged opponent steps kill every opponent.
 *  root: the position the search started from (life, libraries, graveyards before the line). */
export function chainProb(root: Light, leaf: Light): number {
  const ck = `${root.life}|${root.lib}|${root.ogy}|${root.poison}|${root.myLib}|${root.myDens}|${root.pCre}|${leaf.ologKey}`;
  const hit = CHAIN_CACHE.get(ck);
  if (hit !== undefined) return hit;
  const rng = new Rng(12345); // fixed seed: the same line always gets the same answer
  const nMy = pyRound(root.myLib * root.myDens);
  const steps: OlogNode[] = [];
  for (let s = leaf.olog; s; s = s.prev) steps.push(s);
  steps.reverse();

  const deal = (zero: boolean): boolean => {
    const w = new World();
    w.life = root.life.slice();
    w.lib = root.lib.slice();
    w.ogy = root.ogy.slice();
    w.poison = root.poison.slice();
    w.cacc = root.life.map(() => 0);
    w.myLib = root.myLib;
    w.myCacc = 0;
    w.myDens = root.myDens;
    w.pCre = zero ? 0 : root.pCre;
    w.rng = rng;
    w.deck = root.lib.map(
      (L) => [L, zero ? 0 : pyRound(L * root.pCre)] as [number, number],
    );
    w.deck.push([root.myLib, zero ? 0 : nMy]);
    for (const s of steps) {
      if (w.won()) break;
      w.gmAct = s.gmAct;
      w.crank = s.crank;
      w.konrad = s.konrad;
      w.skinner = s.skinner;
      w.applyOp(s.op);
    }
    return w.won();
  };

  // more creatures milled never hurts, so a line that wins with none at all always wins (e.g. Mindskinner)
  if (deal(true)) {
    CHAIN_CACHE.set(ck, 1);
    return 1;
  }
  let wins = 0,
    done = 0;
  for (const nTotal of [40, 100, CHAIN_N]) {
    // stop as soon as the answer is clear
    while (done < nTotal) {
      if (deal(false)) wins++;
      done++;
    }
    if (wins / done < CHAIN_MIN - 0.15 || wins / done >= 0.98) break;
  }
  const p = wins / done;
  if (CHAIN_CACHE.size > 100000) CHAIN_CACHE.clear();
  CHAIN_CACHE.set(ck, p);
  return p;
}

// ---------------------------------------------------------------- search moves
function lab(c: Light, desc: string): Light {
  // a labelled snapshot is never changed afterwards: its children get their own copies of these lists
  c.path = [c.path, desc, c.life, c.lib, c.poison];
  return c;
}

export function renderPath(path: unknown): string[] {
  const out: string[] = [];
  let p = path as Path;
  while (p) {
    const [prev, desc, life, lib, poison] = p;
    let alive = 0;
    for (let i = 0; i < life.length; i++)
      if (life[i] > 0 && lib[i] > 0 && poison[i] < 10) alive++;
    out.push(
      `${desc}   | opp life [${life.join(', ')}] library [${lib.join(', ')}]` +
        (alive ? '' : '  => ALL OPPONENTS DONE'),
    );
    p = prev;
  }
  return out.reverse();
}

const COST_GM_ACT = new Cost(1, 1, 1);
const COST_GM_MILL = new Cost(2, 1, 1);
const COST_KONRAD = new Cost(1, 0, 1);
const COST_MON_EX = new Cost(2, 2);
const COST_MON = new Cost(1);
const OVERTURE_COST = Cost.parse('{4}{U}{U}');

export function children(st: Light): Light[] {
  const out: Light[] = [];
  const hand = st.hand;

  const perm = (name: string, attr: 'gm' | 'crank' | 'konrad'): void => {
    if (hand.includes(name) && !st[attr]) {
      const c = st.copy();
      const cd = C.get(name);
      if (c.pay(cd)) {
        c.hand = remove1(c.hand, name);
        c[attr] = true;
        if (cd.isCreature) {
          c.nCre += 1;
          c.tapMvs = [...c.tapMvs, cd.mv].sort((a, b) => b - a); // (Energy Tap can tap a creature that just arrived)
        }
        out.push(lab(c, `cast ${name}`));
      }
    }
  };
  perm('Duskmantle Guildmage', 'gm');
  perm('Mindcrank', 'crank');
  perm('Syr Konrad, the Grim', 'konrad');
  // creatures that untap lands as they enter (Peregrine Drake, Cloud of Faeries)
  for (const [name, k] of Object.entries(Facts.UNTAP_ON_ETB)) {
    if (!hand.includes(name)) continue;
    const c = st.copy();
    if (c.pay(C.get(name))) {
      c.hand = remove1(c.hand, name);
      c.nCre += 1;
      c.untap(k);
      out.push(lab(c, `cast ${name} (untap ${k} lands)`));
    }
  }
  if (hand.includes('Riverchurn Monument') && !st.mon) {
    const c = st.copy();
    if (c.pay(C.get('Riverchurn Monument'))) {
      c.hand = remove1(c.hand, 'Riverchurn Monument');
      c.mon = c.monEx = true;
      out.push(lab(c, 'cast Riverchurn Monument'));
    }
  }
  if (st.gm && st.gmAct < 2) {
    const c = st.copy();
    if (c.spend(COST_GM_ACT)) {
      c.gmAct += 1;
      out.push(
        lab(
          c,
          'activate Guildmage {1}{U}{B} (opponents lose 1 life per card to graveyard)',
        ),
      );
    }
  }
  if (st.gm && (st.gmAct || st.crank)) {
    const c = st.copy();
    if (c.spend(COST_GM_MILL) && c.target() !== null) {
      c.opp('tmill', 2);
      out.push(lab(c, 'Guildmage {2}{U}{B}: opponent mills 2'));
    }
  }
  if (st.konrad) {
    const c = st.copy();
    if (c.spend(COST_KONRAD)) {
      c.opp('konact');
      out.push(lab(c, 'Syr Konrad {1}{B}: each player mills 1'));
    }
  }
  if (st.mon) {
    if (st.monEx) {
      const c = st.copy();
      if (c.spend(COST_MON_EX)) {
        c.mon = c.monEx = false;
        c.millEach('ogy');
        out.push(
          lab(
            c,
            'Riverchurn Monument exhaust {2}{U}{U}: mill = graveyard size',
          ),
        );
      }
    }
    const c = st.copy();
    if (c.spend(COST_MON)) {
      c.mon = false;
      c.millEach(2);
      out.push(lab(c, 'Riverchurn Monument {1}: each opponent mills 2'));
    }
  }
  if (st.skinnerAtk) {
    const c = st.copy();
    c.skinnerAtk = false;
    if (c.target() !== null) {
      c.opp('tdmg', 10);
      out.push(lab(c, 'attack with The Mindskinner (each opponent mills 10)'));
    }
  }

  // spells from hand (+ Gale trigger)
  let prev = '';
  for (const name of hand) {
    if (name === prev) continue; // hand is sorted: each name once
    prev = name;
    let spell: string, cd: CardDef, isSorc: boolean, vlist: [string, Cost][];
    if (name === 'Jidoor, Aristocratic Capital') {
      spell = 'Overture';
      cd = C.get('Traumatize'); // a sorcery
      vlist = [['x', OVERTURE_COST]];
      isSorc = true;
    } else {
      cd = C.get(name);
      // counters need a target; Archmage's Charm can always pick "target player draws two"
      if (!cd.isIS || (Facts.COUNTERS.has(name) && name !== "Archmage's Charm"))
        continue;
      spell = name;
      isSorc = cd.isSorcery;
      vlist = RELEVANT.has(name)
        ? st.variants(name, false)
        : [['enabler', cd.cost]];
    }
    for (const [v, base] of vlist) {
      const c0 = st.copy();
      if (!c0.pay(cd, base)) continue;
      c0.hand = remove1(c0.hand, name);
      const opts: (string | null)[] = [null];
      if (c0.gale) {
        for (const y of uniqSorted(c0.gy)) {
          const ycd = C.get(y);
          if (RELEVANT.has(y) && (isSorc ? ycd.isInstant : ycd.isSorcery))
            opts.push(y);
        }
      }
      for (const y of opts) {
        if (v === 'enabler' && y === null) continue;
        const ylist: ([string, Cost] | null)[] =
          y === null ? [null] : c0.variants(y, true);
        for (const yv of ylist) {
          let c = c0.copy();
          if (y !== null && yv !== null) {
            if (!c.pay(C.get(y), yv[1], true)) continue;
            c.gy = remove1(c.gy, y);
            c.resolve(y, yv[0]);
          }
          // with the hand spell still on the stack we may respond at instant speed,
          // e.g. use Dark Ritual mana (cast via Gale) to activate Guildmage first
          const responses = [c];
          if (c.gm && v !== 'enabler') {
            let k = c;
            for (let r = 0; r < 2 - c.gmAct; r++) {
              k = k.copy();
              if (!k.spend(COST_GM_ACT)) break;
              k.gmAct += 1;
              responses.push(k);
            }
          }
          responses.forEach((rc, ri) => {
            let d =
              `cast ${spell}` +
              (v !== 'x' && v !== 'enabler' ? ` [${v}]` : '') +
              ' from hand';
            if (y !== null && yv !== null)
              d +=
                ` -> Gale: cast ${y}` +
                (yv[0] !== 'x' ? ` [${yv[0]}]` : '') +
                ' from graveyard';
            if (ri) d += ` -> in response activate Guildmage x${ri}`;
            if (v !== 'enabler') rc.resolve(spell, v);
            if (spell !== 'Overture') rc.gy = addSorted(rc.gy, [name]);
            out.push(lab(rc, d));
          });
          c = responses[0];
        }
      }
    }
  }
  for (const s of selfCounters(st)) out.push(s);
  // Emet-Selch: cast an instant/sorcery from graveyard after opponents lost life
  if (st.emet && st.lost && !st.emetUsed) {
    for (const y of uniqSorted(st.gy)) {
      if (!RELEVANT.has(y)) continue;
      for (const [yv, yb] of st.variants(y, true)) {
        const c = st.copy();
        if (c.pay(C.get(y), yb, true)) {
          c.emetUsed = true;
          c.gy = remove1(c.gy, y);
          c.resolve(y, yv);
          out.push(
            lab(c, `Emet-Selch trigger: cast ${y} [${yv}] from graveyard`),
          );
        }
      }
    }
  }
  return out;
}

const SELF_COUNTER: Record<string, string> = {
  "An Offer You Can't Refuse": 'noncreature',
  Unwind: 'noncreature',
  Rewind: 'any',
  Counterspell: 'any',
  'Arcane Denial': 'any',
  'Mana Sculpt': 'any',
  Dispel: 'instant',
};

/** Relevant graveyard spells Gale could cast ([null] = skip the trigger). */
function galeOpts(
  c: Light,
  wantSorcery: boolean,
): [string | null, string | null, Cost | null][] {
  const opts: [string | null, string | null, Cost | null][] = [
    [null, null, null],
  ];
  if (c.gale) {
    for (const y of uniqSorted(c.gy)) {
      const ycd = C.get(y);
      if (RELEVANT.has(y) && (wantSorcery ? ycd.isSorcery : ycd.isInstant)) {
        for (const [yv, yb] of c.variants(y, true)) opts.push([y, yv, yb]);
      }
    }
  }
  return opts;
}

/** Cast a cheap spell from hand, then counter it with your own counterspell from hand. Both casts
 *  can trigger Gale; An Offer You Can't Refuse gives you two Treasures and Unwind untaps three lands. */
function selfCounters(st: Light): Light[] {
  const out: Light[] = [];
  const hand = st.hand;
  const names = uniqSorted(hand);
  for (const k of names) {
    const need = SELF_COUNTER[k];
    if (need === undefined) continue;
    const kcd = C.get(k);
    const targets: CardDef[] = [];
    for (const t of names) {
      if (t === k || t === 'Jidoor, Aristocratic Capital') continue;
      const tcd = C.get(t);
      if (
        tcd.land !== null ||
        (need === 'noncreature' && tcd.isCreature) ||
        (need === 'instant' && !tcd.isInstant)
      )
        continue;
      targets.push(tcd);
    }
    // worth trying: the cheapest target, plus instants/sorceries whose own Gale trigger matters
    targets.sort(
      (a, b) => a.mv - b.mv || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
    );
    const keep = targets.slice(0, 1);
    if (st.gale) {
      for (const c of targets.slice(1)) {
        if (
          c.isIS &&
          c.mv <= 3 &&
          st.gy.some(
            (y) =>
              RELEVANT.has(y) &&
              (c.isInstant ? C.get(y).isSorcery : C.get(y).isInstant),
          )
        )
          keep.push(c);
      }
    }
    for (const tcd of keep) {
      const t = tcd.name;
      const c0 = st.copy();
      if (!c0.pay(tcd)) continue;
      c0.hand = remove1(c0.hand, t);
      const y1s = tcd.isIS
        ? galeOpts(c0, tcd.isInstant)
        : [[null, null, null] as [null, null, null]];
      for (const [y1, y1v, y1b] of y1s) {
        const c1 = c0.copy();
        if (y1 !== null) {
          if (!c1.pay(C.get(y1), y1b, true)) continue;
          c1.gy = remove1(c1.gy, y1);
          c1.resolve(y1, y1v as string);
        }
        if (!c1.hand.includes(k) || !c1.pay(kcd)) continue; // e.g. a graveyard Windfall discarded it
        c1.hand = remove1(c1.hand, k);
        for (const [y2, y2v, y2b] of galeOpts(c1, true)) {
          if (
            y1 === null &&
            y2 === null &&
            k !== "An Offer You Can't Refuse" &&
            k !== 'Unwind' &&
            k !== 'Rewind'
          )
            continue;
          const c = c1.copy();
          if (y2 !== null) {
            if (!c.pay(C.get(y2), y2b, true)) continue;
            c.gy = remove1(c.gy, y2);
            c.resolve(y2, y2v as string);
          }
          if (k === "An Offer You Can't Refuse") {
            c.pool.A += 2;
            c.free += 2;
          } else if (k === 'Unwind') c.untap(3);
          else if (k === 'Rewind') c.untap(4);
          c.gy = addSorted(c.gy, tcd.isIS ? [k, t] : [k]);
          let d = `cast ${t} from hand`;
          if (y1)
            d +=
              ` -> Gale: cast ${y1}` +
              (y1v !== 'x' && y1v !== null ? ` [${y1v}]` : '') +
              ' from graveyard';
          d += `, then counter it with your own ${k}`;
          if (y2)
            d +=
              ` -> Gale: cast ${y2}` +
              (y2v !== 'x' && y2v !== null ? ` [${y2v}]` : '') +
              ' from graveyard';
          if (k === "An Offer You Can't Refuse") d += ' (+2 Treasures)';
          else if (k === 'Unwind') d += ' (untap 3 lands)';
          else if (k === 'Rewind') d += ' (untap 4 lands)';
          out.push(lab(c, d));
        }
      }
    }
  }
  return out;
}

/** Can we still cast a counterspell from hand with what's left? */
export function isProtected(st: Light): boolean {
  for (const name of uniqSorted(st.hand)) {
    if (Facts.COUNTERS.has(name)) {
      const c = st.copy();
      if (c.pay(C.get(name))) return true;
    }
  }
  return false;
}

export const search = new KillSearch<Light>({
  children,
  protected: isProtected,
  uncertain: (st) => st.rnd, // won only "on average": check against real shuffles
  chance: chainProb,
  minChance: CHAIN_MIN,
  prepare: (root) => {
    root.olog = null;
    root.ologKey = '';
    root.rnd = false;
  },
  render: renderPath,
});

/** Cheap pre-filter so we only search when a kill is conceivable. */
export function finisherReachable(st: Light): boolean {
  const have = new Set(st.hand);
  const acc = new Set(st.hand);
  if (st.gale) for (const g of st.gy) acc.add(g);
  const gm = st.gm || have.has('Duskmantle Guildmage');
  const mon = st.mon || have.has('Riverchurn Monument');
  const caco = acc.has('Maddening Cacophony');
  if (gm) return true;
  // poison: Expansion Algorithm needs a poison counter already there, or a Prologue to go first
  if (
    acc.has('Expansion Algorithm') &&
    (Math.max(...st.poison) > 0 || acc.has('Prologue to Phyresis'))
  )
    return true;
  if (caco && (mon || st.lib.some((x) => x <= 16))) return true;
  if (st.skinnerAtk) return true;
  if (mon && st.monEx) return true;
  const konrad = st.konrad || have.has('Syr Konrad, the Grim');
  if (konrad && st.skinner) return true;
  // Konrad + a big mill: every creature card milled pings each opponent (more with Mindcrank). game4.
  const bigMill = [
    'Maddening Cacophony',
    'Traumatize',
    'Cut Your Losses',
    'Singularity Rupture',
    'Windfall',
  ];
  if (
    konrad &&
    (bigMill.some((n) => acc.has(n)) ||
      have.has('Jidoor, Aristocratic Capital'))
  )
    return true;
  if (
    ['Traumatize', 'Cut Your Losses', 'Singularity Rupture'].some((n) =>
      acc.has(n),
    ) ||
    have.has('Jidoor, Aristocratic Capital')
  ) {
    let alive = 0;
    for (let i = 0; i < st.lib.length; i++) if (st.alive(i)) alive++;
    return st.lib.some((x) => x <= 2) || alive <= 2;
  }
  return false;
}
