/**
 * One goldfish game, played by a heuristic AI. The rules part of the engine, shared by every deck.
 * (game.ts adds what a pod game needs on top of this: real opponents, blockers, removal and counterspells.)
 *
 * The engine knows the rules a deck relies on: zones, mana and lands, casting, cost reducers,
 * draw / scry / tutor effects of common cards, the turn loop, mulligans, and the turn planner
 * (it tries its best few plays on copies of the game and keeps the best one).
 *
 * Reading order (one section per banner below):
 *   state and helpers -> mana -> zones and drawing -> effects of common cards -> creatures -> life and damage
 *   -> casting -> lands -> choosing what to do (candidates, the turn planner) -> the turn -> deck hooks -> combat.
 *
 * A turn (takeTurn): startTurn, upkeep, draw, playLand, developWin (cast things until nothing is worth doing; each
 * step first checks for a kill), combat, developWin again (second main phase), endTurn.
 * develop() asks the deck for its candidates() (everything it may do now with a score), keeps the ones we can pay
 * for, and lets the planner pick between the best few by playing them out on copies of the game.
 *
 * A deck subclasses Game (see decks/goldfish/index.ts for the smallest one, decks/gale for a full one) and fills in:
 *   must have:    light / lightKey / killSearch (or extend GameWithoutKillSearch), candidates
 *   what it wants: cardValue, discardValue, devValueIS, tutorTarget, positionValue, landWant, landBias
 *   card effects: resolveOther, castTriggers, beforeDraw, onToGy, onEnter, onDies, onLandEnter, powerBonus,
 *                 toughnessBonus, upkeep, endStep, commanderCost, onCommanderCast
 *   combat:       canAttack, fogBlocker, evasive, winsWith, onAttack, onCombatDamage (or combat() itself)
 *   setup:        initDeck, mulliganRule, diag (numbers to report per game)
 */
import * as C from './cards';
import * as Facts from './card-facts';
import { Cost, CardDef } from './cards';
import { LandInfo } from './card-facts';
import { Rng } from './rng';
import { MulliganRule, DEFAULT_MULLIGAN, keepsHand } from './mulligan';
import { fmt, fmtList, fmtPool } from './log-format';
import { firstMax, firstMin, removeOrThrow, sortDesc } from './lists';
import {
  Cand,
  Config,
  KillSearcher,
  LogBoardView,
  ManaPool,
  Perm,
  Zone,
  emptyPool,
} from './game-types';

const COLOURS: readonly string[] = ['W', 'U', 'B', 'R', 'G'];
const BASIC_OF: Record<string, string> = {
  W: 'Plains',
  U: 'Island',
  B: 'Swamp',
  R: 'Mountain',
  G: 'Forest',
};
type Snap = [ManaPool, boolean[]];

/** How good a land that makes this kind of mana is to play (A = any colour, UB = blue and black, F = fetch land). */
const LAND_MANA_SCORE: Record<string, number> = {
  A: 6,
  UB: 7,
  F: 4,
  U: 5,
  B: 5,
  G: 5,
  W: 5,
  R: 5,
  C: 3,
  '': 4,
};

/** A land card's land side (a modal double-faced card has it on the back). */
const landInfoOf = (card: CardDef): LandInfo => (card.land ?? card.mdfcLand)!;

/** Which mana source to tap first for what we're short of (a colour, H = hybrid, N = generic). */
const RANK: Record<string, Record<string, number>> = {
  U: { U: 0, UB: 1, A: 2, F: 3 },
  B: { B: 0, UB: 1, A: 2, F: 3 },
  W: { W: 0, A: 2 },
  R: { R: 0, A: 2 },
  G: { G: 0, A: 2 },
  H: { U: 0, B: 0, UB: 1, A: 2, F: 3 },
  N: { S: 0, C2: 1, C: 2, B: 3, U: 4, G: 4, W: 4, R: 4, UB: 5, A: 6, F: 7 },
};

/** Ranks for source kinds not in RANK: a two-colour land ("G/W"), n colourless ("C3"), {G}{U} ("GU"). */
function extraRank(short: string, k: string): number | null {
  if (k.length === 3 && k[1] === '/') {
    if (short === 'N') return 5.5;
    if (short === 'H') return k.includes('U') || k.includes('B') ? 1.5 : null;
    return k.includes(short) ? 1 : null;
  }
  if (/^[WUBRG](\/[WUBRG]){2}$/.test(k)) {
    // a three-colour land ("W/U/B")
    if (short === 'N') return 5.6;
    if (short === 'H') return k.includes('U') || k.includes('B') ? 1.6 : null;
    return k.includes(short) ? 1.2 : null;
  }
  if (/^C\d+$/.test(k)) return short === 'N' ? 0.5 : null;
  if (k === 'GU')
    return short === 'G' || short === 'U' ? 1 : short === 'N' ? 5 : null; // Simic Growth Chamber: both
  return null;
}

export abstract class GameCore<S = unknown> {
  killNow = false;
  inRollout = false;
  seen4: Set<string> | null = null;
  log: string[] = [];
  library: CardDef[];
  command: CardDef[];
  /** Our commanders' names (this.command only holds the ones in the command zone right now). */
  commanderNames: string[] = [];
  hand: CardDef[] = [];
  gy: CardDef[] = [];
  exile: CardDef[] = [];
  bf: Perm[] = [];
  pool: ManaPool = emptyPool();
  /** The deck's colours: what an "either colour" source (Command Tower, a dual land) makes. */
  colors: string[] = ['U', 'B'];
  turn = 0;
  life: number[];
  lib: number[];
  ogy: number[];
  poison: number[];
  myLife = 40;
  unprot: number | null = null;
  prot: number | null = null;
  caseSolved = false;
  onPlay: boolean;
  lastKey: string | null = null;
  ht = 0; // High Tides resolved this turn
  muck = 0; // Bubbling Mucks resolved this turn
  energy = false;
  spellsCast = 0;
  isCast = 0;
  attacked = false;
  firstDrawDone = false;
  wallUsed = false;
  landPlayed = false;
  /** Pain damage of the lands tapped by the payment in progress (dealt when pay() commits). */
  painTaps = 0;
  /** Mana paid so far in the game (spells and abilities), and the total at the end of each turn (for diag()). */
  spent = 0;
  spentEnd: number[] = [];
  /** Total life opponents have lost (damage, drains). */
  damageDealt = 0;
  /** The turn the first opponent died (null = none yet). */
  firstOppDead: number | null = null;
  /** We lost: our life reached 0. */
  died = false;

  /**
   * mode "any": go for the first kill found.  mode "protected": only go when a counterspell can
   * back the kill up, and meanwhile never take an action that breaks an available kill.
   */
  constructor(
    commanders: string[],
    library: string[],
    public rng: Rng,
    public cfg: Config,
    public verbose = false,
    public mode: 'any' | 'protected' = 'any',
  ) {
    this.library = library.map((n) => C.get(n));
    rng.shuffle(this.library);
    this.command = commanders.map((n) => C.get(n));
    this.commanderNames = commanders.slice();
    const n = cfg.opponents as number;
    this.life = new Array(n).fill(cfg.opp_life);
    this.lib = new Array(n).fill(cfg.opp_library);
    this.ogy = new Array(n).fill(0);
    this.poison = new Array(n).fill(0);
    this.onPlay = rng.random() < (cfg.on_play_chance as number);
    this.initDeck();
  }

  /** Deck-specific state (a deck's Game subclass overrides this). */
  initDeck(): void {}

  /** A copy of the game: lists and permanents are copied, the random numbers continue the same. */
  clone(): this {
    const g = Object.create(Object.getPrototypeOf(this)) as this;
    for (const k of Object.keys(this)) {
      const v = (this as Record<string, unknown>)[k];
      (g as Record<string, unknown>)[k] = Array.isArray(v) ? v.slice() : v;
    }
    g.bf = this.bf.map((p) => p.copy());
    g.pool = { ...this.pool };
    g.rng = this.rng.clone();
    return g;
  }

  say(...a: unknown[]): void {
    if (this.verbose) this.log.push(`T${this.turn}: ` + a.map(fmt).join(' '));
  }

  // ================================================================ helpers
  onBf(name: string): boolean {
    for (const p of this.bf) if (p.cd.name === name) return true;
    return false;
  }

  perm(name: string): Perm | null {
    for (const p of this.bf) if (p.cd.name === name) return p;
    return null;
  }

  landsBf(): Perm[] {
    return this.bf.filter((p) => p.land !== null);
  }

  countLandsHand(): number {
    return this.hand.filter((c) => c.land !== null).length;
  }

  manaSources(): number {
    return (
      this.bf.filter((p) => this.srcKind(p, true)).length +
      (this.onBf('Sol Ring') ? 1 : 0)
    );
  }

  hasCounterInHand(): boolean {
    return this.hand.some((c) => Facts.COUNTERS.has(c.name));
  }

  redIS(): number {
    let n = 0;
    for (const p of this.bf) {
      if (Facts.REDUCE_IS.has(p.cd.name)) n++;
      if (p.cd.name === 'Curious Homunculus' && p.transformed) n++;
    }
    return n;
  }

  effCost(cd: CardDef, base: Cost | null = null, fromGy = false): Cost {
    const cost = base ?? cd.cost;
    let red = 0;
    if (cd.isIS) red += this.redIS();
    if (!cd.isCreature)
      for (const p of this.bf)
        if (Facts.REDUCE_NONCREATURE.has(p.cd.name)) red++;
    if (cost.u || cost.h)
      for (const p of this.bf) if (Facts.REDUCE_BLUE.has(p.cd.name)) red++;
    if (fromGy)
      for (const p of this.bf)
        if (Facts.REDUCE_FROM_GY2.has(p.cd.name)) red += 2;
    if (cd.name === 'Focus the Mind' && this.spellsCast > 0) red += 2;
    return cost.withGeneric(Math.max(0, cost.g - red));
  }

  // ================================================================ mana
  srcKind(p: Perm, ignoreSick = false): string | null {
    if (p.land !== null) {
      // "Activate only if you control a Swamp" (Tainted Wood): colourless without one
      const need = p.land.colourIf;
      if (
        need &&
        !this.bf.some(
          (q) =>
            q !== p &&
            q.land !== null &&
            (q.land as unknown as Record<string, boolean>)[need],
        )
      )
        return 'C';
      const m = p.land.mana;
      if (m.length === 3 && m[1] === '/')
        return this.colors.length <= 2 ? 'A' : m; // a two-colour land
      return m || null;
    }
    if (p.cd.rock) return p.cd.rock;
    if (
      p.cd.name === 'Curious Homunculus' &&
      !p.transformed &&
      (ignoreSick || !p.sick)
    )
      return 'S';
    const mc = Facts.MANA_CREATURES[p.cd.name];
    if (mc && (ignoreSick || !p.sick)) return mc;
    return null;
  }

  islandTyped(p: Perm): boolean {
    return p.land !== null && (!!p.land.island || this.energy);
  }

  swampTyped(p: Perm): boolean {
    return p.land !== null && (!!p.land.swamp || this.energy);
  }

  /** What the pool is still short of to pay cost (null = enough). With mutate, pays it. */
  private short(cost: Cost, isIS: boolean, mutate = false): string | null {
    const p = mutate ? this.pool : { ...this.pool };
    if (p.U < cost.u) return 'U';
    p.U -= cost.u;
    if (p.B < cost.b) return 'B';
    p.B -= cost.b;
    if (p.G < cost.gn) return 'G';
    p.G -= cost.gn;
    if (p.W < cost.w) return 'W';
    p.W -= cost.w;
    if (p.R < cost.r) return 'R';
    p.R -= cost.r;
    for (let h = 0; h < cost.h; h++) {
      if (p.U >= p.B && p.U > 0) p.U -= 1;
      else if (p.B > 0) p.B -= 1;
      else return 'H';
    }
    let g = cost.g;
    const order: (keyof ManaPool)[] = [
      ...(isIS ? ['S' as const] : []),
      'C',
      ...(p.B >= p.U ? (['B', 'U'] as const) : (['U', 'B'] as const)),
      'G',
      'W',
      'R',
    ];
    for (const k of order) {
      const t = Math.min(p[k], g);
      p[k] -= t;
      g -= t;
    }
    return g > 0 ? 'N' : null;
  }

  /** Which source to tap first for a generic cost (N) can be adjusted by a deck: lower = tapped first. */
  rankAdjust(_short: string, _kind: string, rank: number): number {
    return rank;
  }

  private pick(short: string, isIS: boolean): Perm | null {
    const rank = RANK[short];
    let best: Perm | null = null,
      br = 99;
    const feed = this.pool.U + this.pool.B + this.pool.C;
    for (const p of this.bf) {
      if (p.tapped) continue;
      const k = this.srcKind(p);
      if (k === null) continue;
      if (!(k in rank)) {
        const r2 = extraRank(short, k);
        if (r2 === null) continue;
        if (r2 < br) {
          best = p;
          br = r2;
        }
        continue;
      }
      if (k === 'S' && !isIS) continue;
      if (k === 'F' && feed < 1) continue;
      let r = this.rankAdjust(short, k, rank[k]);
      if (
        this.ht &&
        this.islandTyped(p) &&
        (short === 'U' || short === 'N' || short === 'H')
      )
        r -= 0.5;
      if (r < br) {
        best = p;
        br = r;
      }
    }
    return best;
  }

  /** A pain land: the colour we need costs 1 life, {C} (for generic costs) is free. The engine taps lands to test a
   *  payment and then undoes it, so the damage is only counted here (painTaps) and dealt when pay() commits. */
  private tapPain(p: Perm, short: string): void {
    p.tapped = true;
    const l = p.land!;
    const pain = l.pain ?? '';
    const makes = (col: string) => C.landMakes(p.cd, col);
    let col: string | null = null;
    if (COLOURS.includes(short) && makes(short)) col = short;
    else if (short === 'H') col = ['U', 'B'].find(makes) ?? null;
    else {
      // a generic cost: colourless if the land can, else a colour that costs no life, else any
      if (l.colourless) {
        this.pool.C += 1;
        return;
      }
      col =
        this.colors.find((c) => makes(c) && !pain.includes(c)) ??
        this.colors.find(makes) ??
        null;
    }
    if (col === null) {
      this.pool.C += 1;
      return;
    }
    this.pool[col as keyof ManaPool] += 1;
    if (pain.includes(col)) this.painTaps += 1;
  }

  tap(p: Perm, short: string): void {
    if (p.land?.pain) {
      this.tapPain(p, short);
      return;
    }
    const k = this.srcKind(p);
    p.tapped = true;
    const pool = this.pool;
    if (k === 'U') pool.U += 1;
    else if (k === 'B') pool.B += 1;
    else if (k === 'G') pool.G += 1;
    else if (k === 'W') pool.W += 1;
    else if (k === 'R') pool.R += 1;
    else if (k === 'A') {
      // either of the deck's colours: the one we're short of; for generic, black if the deck plays it
      if (COLOURS.includes(short)) pool[short as keyof ManaPool] += 1;
      else if (short === 'N')
        pool[
          (this.colors.includes('B') ? 'B' : this.colors[0]) as keyof ManaPool
        ] += 1;
      else
        pool[
          (this.colors.includes('U') ? 'U' : this.colors[0]) as keyof ManaPool
        ] += 1;
    } else if (k === 'UB') {
      pool.U += 1;
      pool.B += 1;
    } else if (k === 'GU') {
      pool.G += 1;
      pool.U += 1;
    } else if (k === 'C') pool.C += 1;
    else if (k === 'C2') pool.C += 2;
    else if (k !== null && /^C\d+$/.test(k)) pool.C += parseInt(k.slice(1), 10);
    else if (k !== null && k.length === 3 && k[1] === '/') {
      // a two-colour land: the colour we're short of if it makes it, else its first colour
      const col =
        k.includes(short) && COLOURS.includes(short)
          ? short
          : short === 'H' && k.includes('B')
            ? 'B'
            : k[0];
      pool[col as keyof ManaPool] += 1;
    } else if (k === 'S') pool.S += 1;
    else if (k === 'F') {
      for (const c of ['C', 'B', 'U'] as const)
        if (pool[c] > 0) {
          pool[c] -= 1;
          break;
        }
      pool.U += 1;
      pool.B += 1;
    }
    if (p.land !== null) {
      if (this.ht && this.islandTyped(p)) pool.U += this.ht;
      if (this.muck && this.swampTyped(p)) pool.B += this.muck;
    }
  }

  snap(): Snap {
    return [{ ...this.pool }, this.bf.map((p) => p.tapped)];
  }

  restore(s: Snap): void {
    this.pool = { ...s[0] };
    const n = Math.min(this.bf.length, s[1].length);
    for (let i = 0; i < n; i++) this.bf[i].tapped = s[1][i];
  }

  pay(cost: Cost, isIS = false, commit = true): boolean {
    // undo = untap what this payment tapped and restore the pool (cheaper than a snapshot of a big board)
    const pool0 = { ...this.pool };
    const tapped: Perm[] = [];
    const undo = () => {
      this.pool = pool0;
      for (const p of tapped) p.tapped = false;
    };
    this.painTaps = 0;
    for (;;) {
      const short = this.short(cost, isIS);
      if (short === null) {
        this.short(cost, isIS, true);
        if (!commit) undo();
        else {
          this.spent += cost.mv;
          if (this.painTaps) this.loseLife(this.painTaps);
        }
        this.painTaps = 0;
        return true;
      }
      const src = this.pick(short, isIS);
      if (src === null) {
        undo();
        this.painTaps = 0;
        return false;
      }
      this.tap(src, short);
      tapped.push(src);
    }
  }

  canPay(cost: Cost, isIS = false): boolean {
    return this.pay(cost, isIS, false);
  }

  oppsBeaten(): boolean {
    for (let i = 0; i < this.life.length; i++)
      if (!(this.life[i] <= 0 || this.lib[i] <= 0 || this.poison[i] >= 10))
        return false;
    return true;
  }

  checkKill(): number {
    if (this.prot !== null || (this.mode === 'any' && this.unprot !== null))
      return 2;
    const st = this.light();
    const k = this.lightKey(st);
    if (k === this.lastKey) return 0;
    this.lastKey = k;
    if (!this.killReachable(st)) return 0;
    const ks = this.killSearch();
    const r = ks.search(st, this.cfg.search_budget as number);
    if (r >= 1 && this.verbose && (this.unprot === null || r === 2)) {
      this.say(
        `--- state: mana ${fmtPool(this.lightPool(this.light()))}, hand ${fmtList(this.hand.map((c) => c.name))}`,
      );
      this.say(
        `--- battlefield ${fmtList(this.bf.filter((p) => p.land === null).map((p) => p.name))}, ` +
          `lands ${this.landsBf().length}, graveyard ${fmtList(this.gy.map((c) => c.name))}`,
      );
      for (const step of ks.lastLine ?? []) this.say('      > ' + step);
    }
    if (r >= 1) this.lastKillLine = (ks.lastLine ?? []).slice();
    if (r >= 1 && this.unprot === null) this.unprot = this.turn;
    if (r === 2) this.prot = this.turn;
    this.killNow = r >= 1;
    if (r === 2 || (r === 1 && this.mode === 'any' && this.podAllowsKill())) {
      this.say(
        'KILL -> WIN' +
          (r === 2 ? ' (with counter backup)' : ' (no counter backup)'),
      );
      return 2;
    }
    if (r === 1) {
      this.podWaits++;
      this.say(
        'kill available but no counter backup: keep the kill intact and look for protection',
      );
    }
    return r;
  }

  // ================================================================ zones / drawing
  toGy(cd: CardDef, _fromLib = false): void {
    this.gy.push(cd);
    this.onToGy(cd);
  }

  draw(n = 1): void {
    for (let i = 0; i < n; i++) {
      if (!this.library.length) return;
      this.beforeDraw();
      this.firstDrawDone = true;
      this.hand.push(this.library.shift()!);
    }
  }

  discard(n: number): void {
    for (let i = 0; i < n; i++) {
      if (!this.hand.length) return;
      const c = firstMin(this.hand, (x) => this.discardValue(x));
      removeOrThrow(this.hand, c);
      this.toGy(c);
      this.say('discard', c);
    }
  }

  scry(n: number, surveil = false): void {
    const top = this.library.splice(0, n);
    const keep: CardDef[] = [],
      away: CardDef[] = [];
    for (const c of top)
      ((surveil ? this.discardValue(c) : this.cardValue(c)) >= 40
        ? keep
        : away
      ).push(c);
    sortDesc(keep, (c) => this.cardValue(c));
    this.library.unshift(...keep);
    if (surveil) for (const c of away) this.toGy(c);
    else this.library.push(...away);
  }

  shuffle(): void {
    this.rng.shuffle(this.library);
  }

  doTutor(
    allowed: (c: CardDef) => boolean,
    toTop: boolean,
    spentCard: string | null = null,
  ): void {
    const t = this.tutorTarget(allowed, toTop, spentCard, true);
    if (t === null) return;
    removeOrThrow(this.library, t);
    this.shuffle();
    if (toTop) this.library.unshift(t);
    else this.hand.push(t);
    this.say('tutor ->', t, toTop ? '(top)' : '');
  }

  // ================================================================ effects of common cards
  /** What a spell does when it resolves, for the cards the engine knows. Other cards go to the deck's resolveOther(). */
  resolve(cd: CardDef, fromGy = false, mode: string | null = null): void {
    if (this.resolveCardSelection(cd, fromGy)) return;
    if (this.resolveManaOrTutor(cd, mode)) return;
    this.resolveOther(cd, fromGy, mode);
  }

  /** Draw, scry and "look at the top cards" spells. Returns false if this isn't one of them. */
  private resolveCardSelection(cd: CardDef, fromGy: boolean): boolean {
    switch (cd.name) {
      case 'Brainstorm': {
        this.draw(3);
        for (let i = 0; i < Math.min(2, this.hand.length); i++) {
          const card = firstMin(this.hand, (x) => this.cardValue(x));
          removeOrThrow(this.hand, card);
          this.library.unshift(card);
        }
        return true;
      }
      case 'Consider':
        this.scry(1, true);
        this.draw(1);
        return true;
      case 'Opt':
        this.scry(1);
        this.draw(1);
        return true;
      case 'Chart a Course':
        this.draw(2);
        if (!this.attacked) this.discard(1);
        return true;
      case 'Read the Bones':
        this.scry(2);
        this.draw(2);
        this.myLife -= 2;
        return true;
      case 'Pieces of the Puzzle':
      case 'Fact or Fiction':
        this.resolveTopFiveSplit(cd.name);
        return true;
      case 'Ponder':
        this.ponder();
        return true;
      case 'Preordain':
        this.scry(2);
        this.draw(1);
        return true;
      case 'Deep Analysis':
      case "Night's Whisper":
      case "Archmage's Charm":
        this.draw(2);
        return true;
      case 'Diresight':
        this.scry(2, true);
        this.draw(2);
        return true;
      case 'Stock Up':
        this.stockUp();
        return true;
      case 'See the Truth':
        this.seeTheTruth(fromGy);
        return true;
      case 'Energybending':
        this.energy = true;
        this.draw(1);
        return true;
      case 'Focus the Mind':
        this.draw(3);
        this.discard(1);
        return true;
      case 'Frantic Search':
        this.draw(2);
        this.discard(2);
        this.untapLands(3);
        return true;
      default:
        return false;
    }
  }

  /** Look at the top three: shuffle them away if none is good, otherwise put them back best first. Then draw. */
  private ponder(): void {
    const top = this.library.slice(0, 3);
    if (top.length && Math.max(...top.map((c) => this.cardValue(c))) < 40)
      this.shuffle();
    else {
      this.library.splice(0, 3);
      sortDesc(top, (c) => this.cardValue(c));
      this.library.unshift(...top);
    }
    this.draw(1);
  }

  /** Take the two best of the top five; the rest go to the bottom. */
  private stockUp(): void {
    const top = this.library.splice(0, 5);
    sortDesc(top, (c) => this.cardValue(c));
    this.hand.push(...top.slice(0, 2));
    this.library.push(...top.slice(2));
  }

  /** Look at the top three: from the graveyard all go to hand, otherwise the best one does and the rest go to the bottom. */
  private seeTheTruth(fromGraveyard: boolean): void {
    const top = this.library.splice(0, 3);
    if (fromGraveyard || !top.length) this.hand.push(...top);
    else {
      sortDesc(top, (c) => this.cardValue(c));
      this.hand.push(top[0]);
      this.library.push(...top.slice(1));
    }
  }

  /** Looks at the top five cards and keeps some in hand, the rest go to the graveyard. */
  private resolveTopFiveSplit(
    spell: 'Pieces of the Puzzle' | 'Fact or Fiction',
  ): void {
    const top = this.library.splice(0, 5);
    let keep: CardDef[];
    if (spell === 'Pieces of the Puzzle') {
      // up to two instants/sorceries to hand, the rest to the graveyard
      keep = sortDesc(
        top.filter((c) => c.isIS),
        (c) => this.cardValue(c),
      ).slice(0, 2);
    } else {
      // opponent splits: the best card alone vs the other four
      sortDesc(top, (c) => this.cardValue(c));
      const rest = top.slice(1);
      keep =
        top.length &&
        this.cardValue(top[0]) >
          rest.reduce((s, c) => s + this.cardValue(c), 0) * 0.6
          ? top.slice(0, 1)
          : rest;
    }
    for (const card of top) {
      if (keep.includes(card)) this.hand.push(card);
      else this.toGy(card, true);
    }
  }

  /** Rituals, untap spells and tutors. Returns false if this isn't one of them. */
  private resolveManaOrTutor(cd: CardDef, mode: string | null): boolean {
    switch (cd.name) {
      case 'Snap':
        this.untapLands(2);
        return true;
      case 'Dark Ritual':
        this.pool.B += 3;
        return true;
      case 'Cabal Ritual':
        this.pool.B += this.cabalMana();
        return true;
      case 'Drain Power':
        this.pool.C += this.drainPowerMana();
        return true;
      case 'Energy Tap': {
        const target = this.energyTapTarget();
        if (target) {
          target.tapped = true;
          this.pool.C += target.cd.mv;
        }
        return true;
      }
      case 'High Tide':
        this.ht += 1;
        return true;
      case 'Bubbling Muck':
        this.muck += 1;
        return true;
      case 'Diabolic Tutor':
        this.doTutor(() => true, false);
        return true;
      case 'Solve the Equation':
        this.doTutor((c) => c.isIS, false);
        return true;
      case 'Personal Tutor':
        this.doTutor((c) => c.isSorcery, true);
        return true;
      case 'Waterlogged Teachings':
        this.doTutor((c) => c.isInstant, false);
        return true;
      case 'Insatiable Avarice':
        if (mode === 'tutor' || mode === 'both') this.doTutor(() => true, true);
        if (mode === 'draw' || mode === 'both') {
          this.draw(3);
          this.myLife -= 3;
        }
        return true;
      default:
        return false;
    }
  }

  untapLands(k: number): void {
    const tapped = this.bf.filter((p) => p.land !== null && p.tapped);
    const key = (p: Perm) =>
      (!(this.ht && this.islandTyped(p)) ? 2 : 0) +
      (p.land!.mana !== 'UB' ? 1 : 0);
    tapped.sort((a, b) => key(a) - key(b));
    for (const p of tapped.slice(0, k)) p.tapped = false;
  }

  enter(
    cd: CardDef,
    from: Zone = 'hand',
    opts: { token?: boolean; tapped?: boolean } = {},
  ): Perm {
    const p = new Perm(cd);
    if (opts.token || cd.isToken) p.token = true;
    if (opts.tapped) p.tapped = true;
    this.bf.push(p);
    if (cd.name === 'Baleful Strix') this.draw(1);
    const untap = Facts.UNTAP_ON_ETB[cd.name];
    if (untap) this.untapLands(untap);
    this.onEnter(p, from);
    return p;
  }

  /** Create n tokens (each one "enters" and triggers onEnter). */
  createTokens(cd: CardDef, n = 1, opts: { tapped?: boolean } = {}): Perm[] {
    const out: Perm[] = [];
    for (let i = 0; i < n; i++)
      out.push(this.enter(cd, 'token', { token: true, tapped: opts.tapped }));
    return out;
  }

  // ================================================================ creatures
  creatures(): Perm[] {
    return this.bf.filter((p) => p.cd.isCreature);
  }

  power(p: Perm): number {
    return Math.max(
      0,
      p.cd.power + p.counters + p.powerMod + this.powerBonus(p),
    );
  }

  toughness(p: Perm): number {
    return p.cd.toughness + p.counters + this.toughnessBonus(p);
  }

  /** A creature dies (destroyed or sacrificed): tokens are gone, cards go to the graveyard. */
  dies(p: Perm): void {
    const i = this.bf.indexOf(p);
    if (i < 0) return;
    this.bf.splice(i, 1);
    if (!p.token) this.toGy(p.cd);
    this.onDies(p);
  }

  sacrifice(p: Perm): void {
    this.say('sacrifice', p.cd);
    this.dies(p);
  }

  /** Devotion to a colour: its pips in the mana costs of our permanents (token copies count too). */
  devotion(colour: 'W' | 'U' | 'B' | 'R' | 'G'): number {
    const pip = { W: 'w', U: 'u', B: 'b', R: 'r', G: 'gn' }[colour] as
      'w' | 'u' | 'b' | 'r' | 'gn';
    let n = 0;
    for (const p of this.bf) n += p.cd.cost[pip];
    return n;
  }

  // ================================================================ life and damage
  /** Opponent i loses n life (damage or life loss). Returns the life actually lost. */
  hurtOpp(i: number, n: number): number {
    if (n <= 0 || this.life[i] <= 0) return 0;
    const lost = Math.min(n, this.life[i]);
    this.life[i] -= n;
    this.damageDealt += lost;
    if (this.life[i] <= 0 && this.firstOppDead === null)
      this.firstOppDead = this.turn;
    return lost;
  }

  /** Each opponent still alive loses n. Returns the total lost. */
  drainEach(n: number): number {
    let t = 0;
    for (let i = 0; i < this.life.length; i++)
      if (this.oppAlive(i)) t += this.hurtOpp(i, n);
    return t;
  }

  oppAlive(i: number): boolean {
    return this.life[i] > 0 && this.lib[i] > 0 && this.poison[i] < 10;
  }

  oppsAlive(): number {
    let n = 0;
    for (let i = 0; i < this.life.length; i++) if (this.oppAlive(i)) n++;
    return n;
  }

  /** The opponent to focus single-target damage on: the one closest to dead. */
  focusOpp(): number | null {
    let best: number | null = null;
    for (let i = 0; i < this.life.length; i++)
      if (this.oppAlive(i) && (best === null || this.life[i] < this.life[best]))
        best = i;
    return best;
  }

  loseLife(n: number): void {
    this.myLife -= n;
    if (this.myLife <= 0 && !this.died) {
      this.died = true;
      this.say('we die');
    }
  }

  gainLife(n: number): void {
    this.myLife += n;
  }

  // ================================================================ casting
  castIS(
    cd: CardDef,
    fromGy = false,
    base: Cost | null = null,
    mode: string | null = null,
    trig: Record<string, unknown> = {},
  ): boolean {
    const cost = this.effCost(cd, base, fromGy);
    if (!this.pay(cost, true)) return false;
    removeOrThrow(fromGy ? this.gy : this.hand, cd);
    this.say(
      'cast',
      cd,
      fromGy ? '(from graveyard)' : '',
      mode ? `[${mode}]` : '',
    );
    this.spellsCast += 1;
    this.onCastIS(fromGy);
    this.castTriggers(cd, fromGy, trig);
    if (this.podCounters(cd)) {
      (fromGy ? this.exile : this.gy).push(cd);
      return true;
    }
    this.resolve(cd, fromGy, mode);
    (fromGy ? this.exile : this.gy).push(cd);
    return true;
  }

  onCastIS(fromGy: boolean): void {
    this.isCast += 1;
    for (const p of this.bf.slice()) {
      const n = p.cd.name;
      if (n === 'Archmage Emeritus' || n === 'Archmage of Runes') this.draw(1);
      else if (n === 'Academy Wall' && !this.wallUsed) {
        this.wallUsed = true;
        this.draw(1);
        this.discard(1);
      } else if (n === 'Secrets of the Dead' && fromGy) this.draw(1);
    }
    if (this.caseSolved && this.onBf('Case of the Ransacked Lab')) this.draw(1);
  }

  castPerm(cd: CardDef, fromCommand = false): boolean {
    let cost = this.effCost(cd);
    if (fromCommand) cost = this.commanderCost(cd, cost);
    if (!this.pay(cost, false)) return false;
    if (fromCommand) {
      removeOrThrow(this.command, cd);
      this.onCommanderCast(cd);
    } else removeOrThrow(this.hand, cd);
    this.spellsCast += 1;
    this.say('cast', cd);
    if (this.podCounters(cd)) {
      // countered: a commander goes back to the command zone (its tax still counts this cast)
      (fromCommand ? this.command : this.gy).push(cd);
      return true;
    }
    this.enter(cd);
    return true;
  }

  // ================================================================ lands
  /** Does this land enter tapped right now? It checks the card's real condition: lands that always enter tapped;
   *  snarls (a Forest or Island card in hand to reveal); check lands (control a land of those types); fast lands
   *  (two or fewer other lands); slow lands (two or more other lands); battle lands and Sunken Hollow (two or
   *  more basic lands). Evaluate it before the land is on the battlefield; a land in hand doesn't count itself. */
  entersTapped(cd: CardDef): boolean {
    const i = (cd.land ?? cd.mdfcLand)!;
    const e = i.etb ?? 'untapped';
    if (e === 'tapped') return true;
    const flag = (l: LandInfo | null, t: string) =>
      !!(l && (l as unknown as Record<string, boolean>)[t]);
    const lands = this.landsBf();
    if (e === 'catacomb')
      return !lands.some((p) => p.land && (p.land.island || p.land.swamp));
    if (e === 'hollow')
      return lands.filter((p) => p.land && p.land.basic).length < 2;
    if (e.startsWith('reveal:')) {
      const types = e.slice(7).split(',');
      return !this.hand.some(
        (c) =>
          c !== cd && c.land !== null && types.some((t) => flag(c.land, t)),
      );
    }
    const cond = i.cond;
    if (!cond) return false;
    if (cond.startsWith('check:')) {
      const types = cond.slice(6).split(',');
      return !lands.some((q) => types.some((t) => flag(q.land, t)));
    }
    if (cond === 'fast') return lands.length > 2;
    if (cond === 'slow') return lands.length < 2;
    if (cond === 'basics2')
      return lands.filter((p) => p.land && p.land.basic).length < 2;
    return false;
  }

  /** Plays the best land from hand, if we haven't played one this turn. */
  playLand(): void {
    if (this.landPlayed) return;
    const lands = this.landsWeCouldPlay();
    if (!lands.length) return;
    const landsOnBattlefield = this.landsBf().length;
    const needManaNow = this.needsManaThisTurn();

    const land = firstMax(lands, (candidate) =>
      this.scoreLandToPlay(candidate, landsOnBattlefield, needManaNow),
    );
    removeOrThrow(this.hand, land);
    this.landPlayed = true;
    const landInfo = { ...landInfoOf(land) };
    if (landInfo.special === 'wilds') {
      this.crackEvolvingWilds(land, landInfo);
      return;
    }
    const permanent = new Perm(land, landInfo, this.landEntersTapped(land));
    permanent.sick = false;
    this.say(
      'play land',
      land.land !== null ? land : 'Inundated Archive (MDFC)',
      permanent.tapped ? '(tapped)' : '',
    );
    if (landInfo.special === 'bounce') this.returnLandToHand();
    this.bf.push(permanent);
    this.onLandEnter(permanent, false);
  }

  /** The lands in hand. A land-on-the-back-side card counts only when we have no real land and few lands out. */
  private landsWeCouldPlay(): CardDef[] {
    const lands = this.hand.filter((c) => c.land !== null);
    const mdfcLands = this.hand.filter((c) => c.mdfcLand);
    if (!lands.length && mdfcLands.length && this.landsBf().length < 5)
      return mdfcLands;
    return lands;
  }

  private landEntersTapped(land: CardDef): boolean {
    return this.entersTapped(land) || landInfoOf(land).special === 'wilds';
  }

  /** Would a land that enters untapped let us cast a spell we want this turn? (Then a tapped land is bad.) */
  private needsManaThisTurn(): boolean {
    const manaAvailable =
      this.bf.filter((p) => !p.tapped && this.srcKind(p)).length +
      this.pool.U +
      this.pool.B +
      this.pool.C +
      this.pool.S;
    for (const card of [...this.hand, ...this.command]) {
      if (card.land !== null) continue;
      // only spells the AI would actually cast proactively (not counters, rituals, combo sorceries)
      const [wantScore, cost] = this.landWant(card);
      if (wantScore >= 50 && cost.mv === manaAvailable + 1) return true;
    }
    return false;
  }

  /** How good a land is to play now (higher is better): its mana, the colour we need, and whether it enters tapped. */
  private scoreLandToPlay(
    land: CardDef,
    landsOnBattlefield: number,
    needManaNow: boolean,
  ): number {
    const info = landInfoOf(land);
    let score =
      LAND_MANA_SCORE[
        info.mana.length === 3 && info.mana[1] === '/' ? 'A' : (info.mana ?? '')
      ] ?? 3;
    if (
      info.mana.length === 1 &&
      COLOURS.includes(info.mana) &&
      info.mana === this.colourNeededFromNewLand()
    )
      score += 1.5;
    if (info.special === 'bounce') score = landsOnBattlefield >= 1 ? 8 : -5;
    if (this.landEntersTapped(land)) score += needManaNow ? -6 : 4;
    if (land.mdfcLand) score -= 3;
    score += this.landBias(land);
    return score;
  }

  /** The colour we most want the next land to make. */
  private colourNeededFromNewLand(): string {
    if (
      this.colors.length === 2 &&
      this.colors[0] === 'U' &&
      this.colors[1] === 'B'
    )
      return this.colourNeededByBlueBlackDeck();
    return this.colourNeededByOtherDeck();
  }

  private colourNeededByBlueBlackDeck(): string {
    const sourcesOf = (kinds: string[]) =>
      this.bf.filter((p) => kinds.includes(this.srcKind(p, true) ?? '')).length;
    const blueSources = sourcesOf(['U', 'A', 'UB', 'F']);
    const blackSources = sourcesOf(['B', 'A', 'UB', 'F']);
    const blackNeeded = this.hand.some((c) => c.cost.b);
    return (blackSources === 0 && blackNeeded) ||
      (blueSources >= blackSources + 3 && blackNeeded)
      ? 'B'
      : 'U';
  }

  /** First, a colour that lets us cast a spell this turn with the new land (e.g. a turn-1 Llanowar Elves);
   *  otherwise the colour with the most pips in hand per source we already have. */
  private colourNeededByOtherDeck(): string {
    const pipsOf: Record<string, (c: CardDef) => number> = {
      W: (c) => c.cost.w,
      U: (c) => c.cost.u,
      B: (c) => c.cost.b,
      R: (c) => c.cost.r,
      G: (c) => c.cost.gn,
    };
    const makesColour = (p: Perm, colour: string) => {
      const kind = this.srcKind(p, true) ?? '';
      return kind === colour || kind === 'A';
    };
    const manaWithNewLand =
      this.bf.filter((p) => !p.tapped && this.srcKind(p)).length + 1;
    const castable = this.hand
      .filter((c) => c.land === null && c.mv > 0 && c.mv <= manaWithNewLand)
      .sort((x, y) => y.mv - x.mv || this.cardValue(y) - this.cardValue(x));
    for (const spell of castable) {
      const coloursNeeded = this.colors.filter((col) => pipsOf[col](spell) > 0);
      const missing = coloursNeeded.filter(
        (col) => !this.bf.some((p) => makesColour(p, col)),
      );
      if (missing.length === 1) return missing[0];
    }
    let bestColour = this.colors[0];
    let bestPipsPerSource = -1;
    for (const colour of this.colors) {
      const pips = this.hand.reduce((sum, c) => sum + pipsOf[colour](c), 0);
      const sources = this.bf.filter((p) => {
        const kind = this.srcKind(p, true) ?? '';
        return (
          makesColour(p, colour) || (kind.length === 2 && kind.includes(colour))
        );
      }).length;
      const pipsPerSource = pips / (sources + 1);
      if (pipsPerSource > bestPipsPerSource) {
        bestColour = colour;
        bestPipsPerSource = pipsPerSource;
      }
    }
    return bestColour;
  }

  /** Evolving Wilds: sacrifice it and put a basic land onto the battlefield tapped. */
  private crackEvolvingWilds(wilds: CardDef, wildsInfo: LandInfo): void {
    const colour = this.colourNeededFromNewLand();
    const basic =
      this.library.find((c) => c.name === BASIC_OF[colour]) ??
      this.library.find((c) => c.land && c.land.basic) ??
      null;
    this.gy.push(wilds);
    if (basic) {
      removeOrThrow(this.library, basic);
      this.shuffle();
      const basicPermanent = new Perm(basic, basic.land, true);
      this.bf.push(basicPermanent);
      this.onLandEnter(new Perm(wilds, wildsInfo), true);
      this.onLandEnter(basicPermanent, false);
    }
    this.say('play Evolving Wilds -> crack for', basic ?? 'None');
  }

  /** A land that returns another land to hand (a bounce land): returns the best one, preferring a nonbasic and a tapped
   *  one. An untapped one is tapped for mana first, so the mana isn't lost. */
  private returnLandToHand(): void {
    const others = this.bf.filter((q) => q.land !== null);
    if (!others.length) return;
    others.sort(
      (a, b) => +!a.land!.basic - +!b.land!.basic || +!a.tapped - +!b.tapped,
    );
    const returned = others[0];
    if (!returned.tapped && this.srcKind(returned)) this.tap(returned, 'N');
    removeOrThrow(this.bf, returned);
    this.hand.push(returned.cd);
  }

  /** A land entered the battlefield under our control (landfall). gone = it was sacrificed right away (Evolving Wilds). */
  onLandEnter(_p: Perm, _gone: boolean): void {}

  // ================================================================ card actions
  flashback(cd: CardDef): boolean {
    if (!this.pay(this.effCost(cd, new Cost(1, 1), true), true)) return false;
    removeOrThrow(this.gy, cd);
    this.myLife -= 3;
    this.say('flashback', cd);
    this.spellsCast += 1;
    this.onCastIS(true);
    this.resolve(cd, true);
    this.exile.push(cd);
    return true;
  }

  wishclaw(cd: CardDef): boolean {
    if (!this.pay(this.effCost(cd).plus(new Cost(1)), false)) return false;
    removeOrThrow(this.hand, cd);
    this.say('Wishclaw Talisman (cast + activate)');
    this.doTutor(() => true, false);
    return true;
  }

  transmute(cd: CardDef): boolean {
    if (!this.pay(new Cost(1, 2), false)) return false;
    removeOrThrow(this.hand, cd);
    this.gy.push(cd);
    this.say('transmute', cd.name);
    this.doTutor((c) => c.mv === cd.mv && c.land === null, false);
    return true;
  }

  cycle(cd: CardDef): boolean {
    if (!this.pay(new Cost(2))) return false;
    removeOrThrow(this.hand, cd);
    this.gy.push(cd);
    this.say('cycle', cd);
    this.draw(1);
    return true;
  }

  // ================================================================ choosing what to do
  /** Use a ritual only if it lets us cast something good we otherwise can't. */
  ritualCandidates(cands: Cand[]): Cand[] {
    const out: Cand[] = [];
    const bestAffordable = () =>
      Math.max(
        0,
        ...cands.filter((c) => this.canPay(c.cost, c.isIS)).map((c) => c.score),
      );
    let affordableBest: number | null = null; // (worked out only if there is a ritual in hand)
    for (const cd of this.hand) {
      const n = cd.name;
      if (
        n !== 'Dark Ritual' &&
        n !== 'High Tide' &&
        n !== 'Cabal Ritual' &&
        n !== 'Drain Power' &&
        n !== 'Energy Tap'
      )
        continue;
      if (affordableBest === null) affordableBest = bestAffordable();
      const s = this.snap();
      if (!this.pay(this.effCost(cd), true)) {
        this.restore(s);
        continue;
      }
      if (n === 'Dark Ritual') this.pool.B += 3;
      else if (n === 'High Tide') this.ht += 1;
      else if (n === 'Cabal Ritual') this.pool.B += this.cabalMana();
      else if (n === 'Drain Power') this.pool.C += this.drainPowerMana();
      else this.pool.C += this.energyTapTarget()?.cd.mv ?? 0;
      const gain = bestAffordable();
      if (n === 'High Tide') this.ht -= 1;
      this.restore(s);
      if (gain >= 60 && gain > affordableBest!)
        out.push({
          score: gain - 1,
          cost: this.effCost(cd),
          isIS: true,
          act: () => this.castRitual(cd),
        });
    }
    return out;
  }

  /** Cabal Ritual: {B}{B}{B}, or five with threshold (seven or more cards in the graveyard). */
  cabalMana(): number {
    return this.gy.length >= 7 ? 5 : 3;
  }

  /** Drain Power: a goldfish opponent has about one land per turn, and part of them (cfg.opp_lands_untapped,
   *  rounded down) is still untapped during our turn. */
  drainPowerMana(): number {
    return Math.floor(
      this.turn *
        ((this.cfg.opp_lands_per_turn as number) ?? 1) *
        ((this.cfg.opp_lands_untapped as number) ?? 1),
    );
  }

  /** Energy Tap: the untapped creature with the highest mana value that isn't a mana source and isn't about to
   *  attack (a deck can refine this). */
  energyTapTarget(): Perm | null {
    const cs = this.bf.filter(
      (p) =>
        p.cd.isCreature &&
        !p.tapped &&
        !this.srcKind(p, true) &&
        this.canTapForEnergy(p),
    );
    return cs.length ? firstMax(cs, (p) => p.cd.mv) : null;
  }

  canTapForEnergy(_p: Perm): boolean {
    return true;
  }

  /** How a ritual from ritualCandidates is cast (a deck may add its cast triggers). */
  castRitual(cd: CardDef): boolean {
    return this.castIS(cd);
  }

  /** If casting a mana rock first still leaves enough (with the rock's own mana) for the best play,
   *  move the rock to the front: e.g. Waterskin, tap it, then Scion with the rest. */
  rockFirst(cands: Cand[]): void {
    const top = cands.find((c) => c.score > 0 && this.canPay(c.cost, c.isIS));
    if (!top) return;
    for (let i = 0; i < cands.length; i++) {
      const c = cands[i];
      if (c.score < 50 || !c.rock || c === top) continue;
      const s = this.snap();
      let ok = false;
      if (this.pay(c.cost, false)) {
        const p = new Perm(c.rock);
        this.bf.push(p);
        ok = this.canPay(top.cost, top.isIS);
        this.bf.pop();
      }
      this.restore(s);
      if (ok) {
        cands.splice(i, 1);
        cands.unshift(c);
        return;
      }
    }
  }

  orderedCands(main2: boolean): Cand[] {
    const cands = this.candidates(main2);
    cands.push(...this.ritualCandidates(cands));
    sortDesc(cands, (c) => c.score);
    this.rockFirst(cands);
    return cands;
  }

  // ---------------------------------------------------------------- turn planner
  /** Try each option on a copy of the game (library re-shuffled, so no peeking at draws), finish the
   *  turn greedily, and score where it ends up. Returns the best index. */
  plan(options: number[], main2: boolean): number {
    let best = options[0];
    let bv: number | null = null;
    const nRoll = (this.cfg.planner_rollouts as number) ?? 2;
    for (const idx of options) {
      let tot: number | null = 0;
      for (let r = 0; r < nRoll; r++) {
        const cl = this.clone();
        cl.verbose = false;
        cl.inRollout = true;
        cl.mode = 'any';
        cl.killNow = false;
        cl.cfg = {
          ...this.cfg,
          search_budget: (this.cfg.planner_budget as number) ?? 600,
        };
        cl.rng = new Rng(Math.floor(this.rng.random() * 4294967296));
        cl.rng.shuffle(cl.library);
        if (cl.orderedCands(main2)[idx].act() === false) {
          tot = null;
          break;
        }
        tot += cl.rolloutValue(main2);
      }
      if (tot === null) continue;
      if (bv === null || tot > bv) {
        best = idx;
        bv = tot;
      }
    }
    return best;
  }

  /** Finish this turn greedily, then play the next turn greedily (with random draws). Rollouts always
   *  play in "any" mode and score kills the same way in both modes, so the "any" and "protected"
   *  games make identical choices until the first kill appears (that's what lets the runner get both
   *  results from one game). */
  rolloutValue(main2: boolean): number {
    const killScore = (): number | null => {
      if (this.prot !== null) return 10000;
      if (this.unprot !== null) return 9000;
      if (this.oppsBeaten()) return 10000; // e.g. Mindskinner combat kill
      return null;
    };
    let won = this.develop(main2);
    if (!won && !main2) {
      this.combat();
      if (!this.oppsBeaten()) this.develop(true);
    }
    let k = killScore();
    if (k !== null) return k;
    this.endTurn();
    const v0 = this.positionValue();
    if (this.turn >= (this.cfg.max_turn as number) + 1) return v0;
    this.startTurn();
    this.upkeep();
    this.draw(1);
    this.playLand();
    won = this.develop();
    if (!won) {
      this.combat();
      if (!this.oppsBeaten()) this.develop(true);
    }
    k = killScore();
    if (k !== null) return k / 2 + 0.2 * v0;
    return v0 + 0.3 * this.positionValue();
  }

  develop(main2 = false): boolean {
    for (let step = 0; step < 40; step++) {
      if (this.checkKill() === 2) return true;
      const cands = this.orderedCands(main2);
      const afford: number[] = [];
      const reserve = this.podReserve();
      cands.forEach((c, i) => {
        if (
          c.score > 0 &&
          this.canPay(c.cost, c.isIS) &&
          (reserve === 0 || this.openMana() - c.cost.mv >= reserve)
        )
          afford.push(i);
      });
      if (!afford.length) return false;
      if (this.mode === 'protected' && this.killNow) {
        let done = false;
        for (const idx of afford) {
          // try the action on a copy; keep it only if the kill survives
          const cl = this.clone();
          if (cl.orderedCands(main2)[idx].act() === false) continue;
          if (
            this.killSearch().search(
              cl.light(),
              this.cfg.search_budget as number,
            ) === 0
          )
            continue;
          const log = this.log;
          Object.assign(this, cl);
          this.log = [...log, ...cl.log.slice(log.length)];
          done = true;
          break;
        }
        if (!done) return false;
        continue;
      }
      let order = afford;
      if (
        this.cfg.planner &&
        !this.inRollout &&
        afford.length > 1 &&
        this.turn >= 2
      ) {
        const opts = afford.slice(0, (this.cfg.planner_width as number) ?? 4);
        const pick = this.plan(opts, main2);
        order = [pick, ...afford.filter((i) => i !== pick)];
      }
      let done = false;
      for (const idx of order) {
        if (cands[idx].act() !== false) {
          done = true;
          break;
        }
      }
      if (!done) return false;
    }
    return false;
  }

  // ================================================================ turn
  /** The deck's mulligan rule (engine/mulligan.ts), or null for the default: keep 2 to 5 lands. */
  mulliganRule(): MulliganRule | null {
    return null;
  }

  mulligan(): void {
    const rule = this.mulliganRule() ?? DEFAULT_MULLIGAN;
    const sizes = [7, 7, 6, 5];
    for (let attempt = 0; attempt < sizes.length; attempt++) {
      const size = sizes[attempt];
      this.library.push(...this.hand);
      this.hand = [];
      this.shuffle();
      this.hand = this.library.splice(0, 7);
      if (
        size <= (rule.alwaysKeep ?? 5) ||
        keepsHand(rule, attempt, this.hand)
      ) {
        for (let i = 0; i < 7 - size; i++) {
          const c = firstMin(this.hand, (x) => this.cardValue(x));
          removeOrThrow(this.hand, c);
          this.library.push(c);
        }
        return;
      }
    }
  }

  startTurn(): void {
    if (this.turn > 0) this.spentEnd[this.turn] = this.spent;
    this.turn += 1;
    for (const p of this.bf) {
      p.tapped = false;
      p.sick = false;
    }
    this.pool = emptyPool();
    this.ht = this.muck = 0;
    this.energy = false;
    this.spellsCast = this.isCast = 0;
    this.firstDrawDone = false;
    this.attacked = false;
    this.landPlayed = false;
    this.wallUsed = false;
    this.lastKey = null;
    if (this.turn > 1)
      this.lib = this.lib.map((x, i) =>
        this.life[i] > 0 ? Math.max(0, x - 1) : x,
      );
    for (const p of this.bf) {
      if (
        p.cd.name === 'Curious Homunculus' &&
        !p.transformed &&
        this.gy.filter((c) => c.isIS).length >= 3
      ) {
        p.transformed = true;
        this.say('Curious Homunculus transforms');
      }
    }
  }

  endTurn(): void {
    this.endStep();
    if (this.isCast >= 4 && this.onBf('Case of the Ransacked Lab'))
      this.caseSolved = true;
    if (this.hand.length > 7 && !this.onBf('Reliquary Tower'))
      this.discard(this.hand.length - 7);
  }

  /** Before the first turn: the opening hand and mulligans. */
  setup(): void {
    this.energy = false;
    this.ht = this.muck = 0;
    this.spellsCast = 0;
    this.mulligan();
  }

  /** One full turn of ours. Returns true when the game ended in it (a win, or we lost). A pod plays the decks' turns in seat order. */
  takeTurn(): boolean {
    this.startTurn();
    this.upkeep();
    if (!(this.turn === 1 && this.onPlay)) this.draw(1);
    this.playLand();
    if (this.developWin()) return true;
    this.combat();
    if (this.oppsBeaten()) {
      if (this.unprot === null) this.unprot = this.turn;
      this.prot = this.turn;
      this.say('Opponents beaten in combat');
      return true;
    }
    this.lastKey = null;
    if (this.developWin(true)) return true;
    if (this.inArena() && this.cfg.pod_defence !== false) this.podDefence();
    this.endTurn();
    if (this.turn === 4) {
      // for the card ranking: every card seen by the end of turn 4
      this.seen4 = new Set(
        [...this.hand, ...this.gy, ...this.exile].map((c) => c.name),
      );
      for (const p of this.bf) this.seen4.add(p.cd.name);
    }
    this.say('end: hand', fmtList(this.hand.map((c) => c.name)));
    return false;
  }

  /** develop(), but in a pod a declared win may be answered: then the turn goes on without the card it was stopped at. */
  developWin(main2 = false): boolean {
    for (let tries = 0; tries < 4; tries++) {
      if (!this.develop(main2)) return false;
      if (this.died || !this.podAnswersWin()) return true;
      this.unprot = this.prot = null;
      this.killNow = false;
      this.lastKey = null;
    }
    return false;
  }

  /** Play the game. Returns [first turn with any kill, first turn with a kill + counter backup]. */
  play(): [number | null, number | null] {
    this.setup();
    const maxt = this.cfg.max_turn as number;
    while (this.turn < maxt) if (this.takeTurn()) break;
    return [this.unprot, this.prot];
  }

  // ================================================================ deck hooks
  /** The snapshot of this game that the deck's kill search works on. */
  abstract light(nextTurn?: boolean, add?: string[], remove?: string[]): S;
  /** A de-duplication key of a snapshot (the main kill check skips a search if nothing changed). */
  abstract lightKey(st: S): string;
  /** The snapshot's mana pool (for the verbose log). */
  lightPool(_st: S): Record<string, number> {
    return {};
  }
  /** Cheap pre-filter: is a kill conceivable at all? */
  killReachable(_st: S): boolean {
    return true;
  }
  abstract killSearch(): KillSearcher<S>;
  /** Everything the AI may do now. */
  abstract candidates(main2: boolean): Cand[];

  /** How much we want this card in hand (used for discards, scry, tutors, mulligans). */
  cardValue(cd: CardDef): number {
    return cd.land !== null ? 60 : 30;
  }
  discardValue(cd: CardDef): number {
    return this.cardValue(cd);
  }
  devValueIS(_cd: CardDef, _fromGy = false): number {
    return 0;
  }
  tutorTarget(
    allowed: (c: CardDef) => boolean,
    _toTop: boolean,
    _spent: string | null = null,
    _rampOk = false,
  ): CardDef | null {
    const cands = this.library.filter(allowed);
    return cands.length ? firstMax(cands, (c) => this.cardValue(c)) : null;
  }
  /** Rough value of a position when no kill is in sight (higher is better). */
  positionValue(): number {
    return 0;
  }
  /** Attack (the default goldfish deals no combat damage). */
  combat(): void {}
  /** Something entered the battlefield (ETB triggers, "whenever a creature enters"). */
  onEnter(_p: Perm, _from: Zone): void {}
  /** A creature died (death triggers). It's already off the battlefield (and in the graveyard if a card). */
  onDies(_p: Perm): void {}
  /** Extra power / toughness from static effects (e.g. +1/+1 per creature card in the graveyard). */
  powerBonus(_p: Perm): number {
    return 0;
  }
  toughnessBonus(_p: Perm): number {
    return 0;
  }
  /** At the beginning of our end step (before cleanup). */
  endStep(): void {}
  /** At the beginning of our upkeep (before the draw). */
  upkeep(): void {}

  // ================================================================ goldfish combat for creature decks
  /** Can this creature attack now? (A deck may keep some home, e.g. Spore Frog.) */
  canAttack(p: Perm): boolean {
    return (
      p.cd.isCreature &&
      !p.tapped &&
      (!p.sick || p.cd.haste) &&
      this.power(p) > 0
    );
  }

  /** A creature that stays home and stops all combat damage to us (Spore Frog), or null. */
  fogBlocker(): Perm | null {
    return null;
  }

  /** Would this much extra damage win the game? (Default: every opponent dead.) */
  winsWith(damage: number): boolean {
    let left = damage;
    for (let i = 0; i < this.life.length; i++)
      if (this.oppAlive(i)) left -= this.life[i];
    return left >= 0;
  }

  /** Attack triggers, called with the attackers before damage. Returns creatures that join the attack
   *  (e.g. tokens put onto the battlefield tapped and attacking); they count for blocking too. */
  onAttack(_attackers: Perm[]): Perm[] {
    return [];
  }

  /**
   * Goldfish combat (rules agreed for creature decks):
   * - flying attackers always connect; of the others, opponents block half (rounded down), the biggest ones;
   * - crackback: we take back what we dealt, minus a third for each untapped creature kept home
   *   (none if a fog creature such as Spore Frog stays home; it is sacrificed before our next turn);
   * - if attacking with everything wins, do it; otherwise the biggest attack that keeps us above
   *   cfg.combat_safety life (default 10).
   * Damage goes to the opponent closest to dead first, the rest to the next one.
   */
  creatureCombat(): void {
    if (this.attacked) return;
    const cands = this.creatures().filter((p) => this.canAttack(p));
    if (!cands.length) return;
    if (this.inArena()) {
      this.arenaCombat(cands);
      return;
    }
    const fog = this.fogBlocker();
    const pool = fog ? cands.filter((p) => p !== fog) : cands;
    pool.sort((a, b) => this.power(b) - this.power(a));
    const untappedOthers = (attacking: Set<Perm>) =>
      this.creatures().filter((p) => !p.tapped && !attacking.has(p)).length;
    const connecting = (att: Perm[]) => {
      const fly = att.filter((p) => this.evasive(p)),
        ground = att.filter((p) => !this.evasive(p));
      const blocked = Math.floor(ground.length / 2);
      // opponents block the biggest ground attackers
      const g = ground
        .slice()
        .sort((a, b) => this.power(b) - this.power(a))
        .slice(blocked);
      return [...fly, ...g];
    };
    const deal = (att: Perm[]) =>
      connecting(att).reduce((s, p) => s + this.power(p), 0);
    const crackback = (att: Perm[], dmg: number) => {
      if (fog) return 0;
      const home = untappedOthers(new Set(att));
      return Math.round(dmg * Math.max(0, 1 - home / 3));
    };
    const safety = (this.cfg.combat_safety as number) ?? 10;
    let best: Perm[] = [],
      bestDmg = 0;
    for (let k = 1; k <= pool.length; k++) {
      const att = pool.slice(0, k);
      const dmg = deal(att);
      if (this.winsWith(dmg)) {
        best = att;
        bestDmg = dmg;
        break;
      } // a winning attack: always take it
      if (this.myLife - crackback(att, dmg) > safety && dmg > bestDmg) {
        best = att;
        bestDmg = dmg;
      }
    }
    if (!best.length) return;
    this.attacked = true;
    for (const p of best) p.tapped = true;
    const all = [...best, ...this.onAttack(best)].filter((p) =>
      this.bf.includes(p),
    );
    let dmg = deal(all);
    const total = dmg;
    while (dmg > 0) {
      const t = this.focusOpp();
      if (t === null) break;
      const hit = Math.min(dmg, this.life[t]);
      this.hurtOpp(t, hit);
      dmg -= hit;
    }
    this.onCombatDamage(connecting(all), total);
    this.pendingCrackback += crackback(best, total);
    if (fog) this.fogUsed = true;
    this.say(
      `attack with ${all.length} creature(s): ${total} damage, opp life [${this.life.join(', ')}]` +
        (fog
          ? ` (${fog.cd.name} stays home)`
          : `, crackback ${crackback(best, total)}`),
    );
  }

  /** Can this attacker not be blocked (flying, shadow, "can't be blocked")? Decks override it. */
  evasive(p: Perm): boolean {
    return p.cd.flying;
  }
  /** After combat damage: the attackers that connected and the total damage dealt. */
  onCombatDamage(_connected: Perm[], _damage: number): void {}

  // ================================================================ hooks for pod games (game.ts fills them in)
  // A goldfish game has no other players, so these do nothing. Game (game.ts) overrides them with the pod rules.
  /** Are we the real game of a player in a pod (not a planner copy, not a goldfish game)? */
  inArena(): boolean {
    return false;
  }
  /** We found a kill without counter backup: go for it now? (a pod's policy may say wait) */
  podAllowsKill(): boolean {
    return true;
  }
  /** We cast this spell: does an opponent counter it? */
  podCounters(_cd: CardDef): boolean {
    return false;
  }
  /** We declared a win: do the others answer it (true = it was stopped)? */
  podAnswersWin(): boolean {
    return false;
  }
  /** Mana to leave untapped on our own turn for an instant-speed answer. */
  podReserve(): number {
    return 0;
  }
  /** A pod, after our second main phase: cast creatures as blockers if needed. */
  podDefence(): void {}
  /** Pod combat for a group of our creatures: choose the opponent and the attackers, attack, deal the damage. */
  arenaCombat(
    _pool: Perm[],
    _power?: (p: Perm) => number,
    _toughness?: (p: Perm) => number,
  ): void {}
  /** The steps of the kill the search found (Gale), for winAttempt(). */
  lastKillLine: string[] = [];
  /** Times we found a kill and didn't go for it (no counter backup, the deck's policy said wait). */
  podWaits = 0;
  /** Untapped mana sources. */
  openMana(): number {
    let n = 0;
    for (const p of this.bf) if (!p.tapped && this.srcKind(p)) n++;
    return n;
  }

  /** Combat damage we'll take on the opponents' turns (applied at our next upkeep). */
  pendingCrackback = 0;
  /** We attacked relying on the fog blocker: it must be used (sacrificed) before our next turn. */
  fogUsed = false;
  onToGy(_cd: CardDef): void {}
  /** Replacement effects on a draw (e.g. look at the top cards first). */
  beforeDraw(): void {}
  /** Effects of cards the engine doesn't know. */
  resolveOther(_cd: CardDef, _fromGy: boolean, _mode: string | null): void {}
  /** "Whenever you cast" triggers that resolve before the spell (e.g. Gale's recast). */
  castTriggers(
    _cd: CardDef,
    _fromGy: boolean,
    _trig: Record<string, unknown>,
  ): void {}
  /** Commander tax: {2} more for each earlier cast from the command zone. */
  commanderCost(cd: CardDef, cost: Cost): Cost {
    const n = this.commandCasts.filter((x) => x === cd.name).length;
    return n ? cost.withGeneric(cost.g + 2 * n) : cost;
  }
  onCommanderCast(cd: CardDef): void {
    this.commandCasts.push(cd.name);
  }
  commandCasts: string[] = [];
  /** [how much we want to cast c, its cost], to decide if a tapped land costs us mana now. */
  landWant(c: CardDef): [number, Cost] {
    return [30, this.effCost(c)];
  }
  landBias(_cd: CardDef): number {
    return 0;
  }

  /** Per-game numbers a deck wants to report next to the win turn (see Deck.diagMetrics); read after play(). */
  diag(): Record<string, number | null> {
    return {};
  }

  // hooks for the log analyzer
  /** How the analyzer names a line that only wins with some probability. */
  chanceName = 'chain';
  syncFromLog(_board: LogBoardView): void {}
  /** What a token in an Archidekt log is (its name as the player typed it), or null to leave it out. */
  logToken(_name: string): CardDef | null {
    return null;
  }
  lightAddMana(_st: S, _n: number): void {}
  lightAddLand(_st: S): void {}
}
