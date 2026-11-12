/**
 * The Gale deck's AI: what it wants to do each turn, and the rules of the cards only it uses.
 * The game itself (mana, zones, casting, turns, planner) is the shared engine in engine/game.ts.
 */
import * as C from '../../engine/cards';
import { Cost, CardDef } from '../../engine/cards';
import { Game } from '../../engine/game';
import { Cand, KillSearcher, Perm, WinAttempt } from '../../engine/game-types';
import {
  firstMax,
  firstMin,
  sortDesc,
  removeOrThrow,
} from '../../engine/lists';
import { MulliganRule } from '../../engine/mulligan';
import { MULLIGAN } from './mulligan';
import {
  GALE,
  SCION,
  COMBO_PERMS,
  COMBO_SPELLS,
  ENGINES,
  COMBO_SORC,
} from './roles';
import { Light, search, finisherReachable, FODDER_EXCLUDE, EV } from './kills';

const PACKAGES: Set<string>[][] = [
  [
    new Set(['Duskmantle Guildmage']),
    new Set(['Mindcrank']),
    new Set([
      'Maddening Cacophony',
      'Windfall',
      'Riverchurn Monument',
      'Syr Konrad, the Grim',
      'Extended Absence',
      'Singularity Rupture',
    ]),
  ],
  [
    new Set(['Duskmantle Guildmage']),
    new Set(['Maddening Cacophony', 'Singularity Rupture']),
  ],
  [new Set(['Maddening Cacophony']), new Set(['Riverchurn Monument'])],
  [new Set(['The Mindskinner']), new Set(['Syr Konrad, the Grim'])],
  [new Set(['Expansion Algorithm']), new Set(['Prologue to Phyresis'])],
];
const RAMP_PREFS = [
  'Sol Ring',
  'Arcane Signet',
  'Fellwar Stone',
  'Talisman of Dominance',
  'Dimir Signet',
  "Bender's Waterskin",
  'Baral, Chief of Compliance',
  'Mocking Sprite',
  'Thunderclap Drake',
];
export const PERM_SCORE: Record<string, number> = {
  'Sol Ring': 100,
  'Arcane Signet': 88,
  'Dimir Signet': 86,
  'Fellwar Stone': 88,
  'Talisman of Dominance': 88,
  "Bender's Waterskin": 80,
  'Baral, Chief of Compliance': 77,
  'Mocking Sprite': 75,
  'Thunderclap Drake': 76,
  'Geist of Saint Thalia': 74,
  'Nightscape Familiar': 72,
  'Wizards of Thay': 73,
  'Case of the Ransacked Lab': 74,
  'Curious Homunculus': 71,
  'Emet-Selch of the Third Seat': 69,
  'Archmage Emeritus': 73,
  'Baleful Strix': 66,
  'Academy Wall': 60,
  'Secrets of the Dead': 52,
  'The Mindskinner': 69,
  'Duskmantle Guildmage': 64,
  Mindcrank: 62,
  'Riverchurn Monument': 61,
  'Syr Konrad, the Grim': 58,
  'Sapphire Medallion': 76,
  'Archmage of Runes': 75,
  'Peregrine Drake': 62,
  'Cloud of Faeries': 64,
};
const permScore = (n: string, d: number) => PERM_SCORE[n] ?? d;
const SELF_COUNTER_DEV = ["An Offer You Can't Refuse", 'Unwind', 'Rewind'];

function* combinations<T>(
  xs: T[],
  k: number,
  start = 0,
  acc: T[] = [],
): Generator<T[]> {
  if (acc.length === k) {
    yield acc.slice();
    return;
  }
  for (let i = start; i < xs.length; i++) {
    acc.push(xs[i]);
    yield* combinations(xs, k, i + 1, acc);
    acc.pop();
  }
}

export class GaleGame extends Game<Light> {
  override mulliganRule(): MulliganRule | null {
    return this.cfg.smart_mulligan ? MULLIGAN : null;
  }
  // (subclass fields are set after the engine's constructor has run, so they can use this.cfg)
  giftsNote = false;
  galeCasts = 0;
  cacc: number[] = new Array(this.cfg.opponents as number).fill(0);
  gmAct = 0;
  konradActs = 0;
  emetUsed = false;
  override chanceName = 'Konrad chain';

  killSearch(): KillSearcher<Light> {
    return search;
  }
  override killReachable(st: Light): boolean {
    return finisherReachable(st);
  }
  lightKey(st: Light): string {
    return st.key();
  }
  override lightPool(st: Light): Record<string, number> {
    return { ...st.pool };
  }

  // ---------------------------------------------------------------- log analyzer hooks
  override syncFromLog(board: { bf: { name: string }[] }): void {
    this.galeCasts = board.bf.some((p) => p.name === GALE) ? 1 : 0;
  }
  override lightAddMana(L: Light, n: number): void {
    L.pool.A += n;
    L.free += n;
  }
  override lightAddLand(L: Light): void {
    L.pool.A += 1;
    L.lands += 1;
    L.mix = [L.mix[0], L.mix[1], L.mix[2], L.mix[3] + 1];
  }

  // ---------------------------------------------------------------- card rules only Gale uses
  override onToGy(cd: CardDef): void {
    if (cd.isCreature && this.onBf('Syr Konrad, the Grim'))
      this.oppEvents([EV.KONRAD, -1, 1]);
  }

  override beforeDraw(): void {
    // Scion of Halaster: the first draw each turn looks at the top two, one goes to the graveyard
    if (
      !this.firstDrawDone &&
      this.onBf(GALE) &&
      this.onBf(SCION) &&
      this.library.length >= 2
    ) {
      this.firstDrawDone = true;
      const [a, b] = this.library;
      const worse = this.discardValue(a) < this.discardValue(b) ? a : b;
      const keep = worse === a ? b : a;
      this.library.splice(0, 2, keep);
      this.toGy(worse);
      this.say(`Scion: ${worse.name} -> graveyard`);
    }
  }

  override castTriggers(
    cd: CardDef,
    fromGy: boolean,
    trig: Record<string, unknown>,
  ): void {
    // Gale: casting an instant/sorcery from hand lets you cast one of the other type from the graveyard
    const target = trig.galeTarget as CardDef | null | undefined;
    if (target && !fromGy && this.onBf(GALE)) {
      const gcost = this.effCost(
        target,
        (trig.galeBase as Cost | undefined) ?? null,
        true,
      );
      if (this.pay(gcost, true)) {
        removeOrThrow(this.gy, target);
        this.say('  Gale recasts', target);
        this.spellsCast += 1;
        this.onCastIS(true);
        this.resolve(target, true, null);
        this.exile.push(target);
      }
    }
  }

  /** A pod: what the others can answer in our kill line. The spells it casts (the most expensive first: the finisher),
   *  and the permanents it names (Guildmage, Mindskinner, the Monument, Gale for a cast from the graveyard). */
  override winAttempt(): WinAttempt | null {
    const text = this.lastKillLine.join(' | ');
    if (!text) return null;
    const have = new Set(
      [...this.hand, ...this.gy, ...this.library].map((c) => c.name),
    );
    const spells: string[] = [];
    for (const m of text.matchAll(
      /cast (.+?)(?: \[unk\])? from (?:hand|graveyard)/g,
    ))
      if (have.has(m[1]) && !spells.includes(m[1])) spells.push(m[1]);
    spells.sort((a, b) => C.get(b).mv - C.get(a).mv);
    const perms: string[] = [];
    for (const p of this.bf) {
      if (p.land !== null || p.cd.rock || perms.includes(p.cd.name)) continue;
      const words = [
        p.cd.name,
        p.cd.name.split(',')[0],
        ...p.cd.name.split(/[ ,]+/).filter((x) => x.length >= 7),
      ];
      if (words.some((x) => text.includes(x))) perms.push(p.cd.name);
    }
    return { spells, perms, backup: this.prot === this.turn ? 1 : 0 };
  }

  /** A pod: with The Mindskinner out, damage our creatures would deal to an opponent is prevented and each opponent mills that many. */
  override combatHit(slot: number, n: number): void {
    if (this.onBf('The Mindskinner')) this.oppEvents([EV.DMG, slot, n]);
    else super.combatHit(slot, n);
  }
  /** How close to winning the others think we are: Gale out, the kill engines, a big graveyard of instants and sorceries. */
  override podClose(): number {
    let c = 0;
    if (this.onBf(GALE)) c += 0.3;
    if (
      this.onBf('Duskmantle Guildmage') ||
      this.onBf('The Mindskinner') ||
      this.onBf('Riverchurn Monument')
    )
      c += 0.3;
    if (this.gy.filter((x) => x.isIS).length >= 8) c += 0.2;
    if (this.landsBf().length + this.bf.filter((p) => p.cd.rock).length >= 8)
      c += 0.2;
    return Math.min(1, c);
  }

  override commanderCost(cd: CardDef, cost: Cost): Cost {
    return cd.name === GALE
      ? cost.withGeneric(cost.g + 2 * this.galeCasts)
      : cost;
  }
  override onCommanderCast(cd: CardDef): void {
    if (cd.name === GALE) this.galeCasts += 1;
  }

  override landWant(c: CardDef): [number, Cost] {
    let sc = c.isIS ? this.devValueIS(c) : permScore(c.name, 30);
    let cost = this.effCost(c);
    if (c.name === GALE) {
      cost = new Cost(cost.g + 2 * this.galeCasts, cost.u);
      sc = 95;
    }
    return [sc, cost];
  }
  override landBias(cd: CardDef): number {
    return cd.name === 'Jidoor, Aristocratic Capital' ? -1 : 0;
  }

  override startTurn(): void {
    super.startTurn();
    this.gmAct = 0;
    this.emetUsed = false;
    this.konradActs = 0;
  }

  override resolveOther(
    cd: CardDef,
    _fromGy: boolean,
    _mode: string | null,
  ): void {
    const n = cd.name;
    if (n === 'Mission Briefing') {
      this.scry(2, true);
      const opts = this.gy.filter(
        (g) =>
          g.isIS &&
          g !== cd &&
          this.devValueIS(g, true) > 0 &&
          this.canPay(this.effCost(g, null, true), true),
      );
      if (opts.length) {
        const g = firstMax(opts, (x) => this.devValueIS(x, true));
        this.say('  Mission Briefing recasts', g);
        this.castIS(g, true);
      }
    } else if (n === 'Prologue to Phyresis') {
      for (let i = 0; i < this.life.length; i++)
        if (this.life[i] > 0 && this.lib[i] > 0) this.poison[i] += 1;
      this.draw(1);
    } else if (n === 'Windfall') {
      const k = this.hand.length;
      for (const c of this.hand.slice()) {
        removeOrThrow(this.hand, c);
        this.toGy(c);
      }
      const ev: number[] = [];
      for (let i = 0; i < this.life.length; i++)
        ev.push(EV.PUTGY, i, this.cfg.opp_hand_size as number);
      this.oppEvents(ev);
      this.draw(
        this.inArena()
          ? this.arena!.wheel(this, k)
          : Math.max(k, this.cfg.opp_hand_size as number),
      );
    } else if (n === 'Unearth') {
      const opts = this.gy.filter((c) => c.isCreature && c.mv <= 3);
      if (opts.length) {
        const c = firstMax(opts, (x) => permScore(x.name, 30));
        removeOrThrow(this.gy, c);
        this.enter(c);
        if (this.onBf('Syr Konrad, the Grim'))
          this.oppEvents([EV.KONRAD, -1, 1]);
      }
    } else if (n === 'Gifts Ungiven') {
      const pile = this.inRollout ? null : this.giftsPile();
      if (pile !== null) {
        const [picks, binned] = pile;
        for (const c of picks) removeOrThrow(this.library, c);
        this.shuffle();
        for (const c of binned) this.toGy(c);
        this.hand.push(...picks.filter((c) => !binned.includes(c)));
        this.say(
          'Gifts ->',
          picks,
          '| opponent bins',
          binned,
          this.giftsNote ? '(every split wins next turn)' : '',
        );
        return;
      }
      const picks: CardDef[] = [];
      const gale = this.onBf(GALE);
      for (let i = 0; i < 4; i++) {
        // with Gale out, build the pile mostly from instants/sorceries (binned ones stay castable)
        const onlyIS = gale && i >= 1;
        const names = new Set(picks.map((p) => p.name));
        const t = this.tutorTarget(
          (c) => !names.has(c.name) && (c.isIS || !onlyIS),
          false,
        );
        if (t === null) break;
        picks.push(t);
        removeOrThrow(this.library, t);
      }
      this.shuffle();
      // opponent bins the two cards that hurt us most to lose from hand
      sortDesc(picks, (c) => this.cardValue(c) * (c.isIS && gale ? 0.3 : 1.0));
      for (const c of picks.slice(0, 2)) this.toGy(c);
      this.hand.push(...picks.slice(2));
      this.say('Gifts ->', picks);
    }
  }

  // ---------------------------------------------------------------- the kill search's snapshot
  light(nextTurn = false, add: string[] = [], remove: string[] = []): Light {
    const L = new Light();
    const pool = { U: 0, B: 0, A: 0, C: 0, S: 0 };
    if (!nextTurn) {
      pool.U += this.pool.U;
      pool.B += this.pool.B;
      pool.C += this.pool.C;
      pool.S += this.pool.S;
    }
    const ht = nextTurn ? 0 : this.ht;
    const muck = nextTurn ? 0 : this.muck;
    const energy = this.energy && !nextTurn;
    let htc = 0,
      swc = 0,
      lands = 0;
    let free = nextTurn ? 0 : this.pool.U + this.pool.B;
    let freeC = nextTurn ? 0 : this.pool.C;
    const mix = [0, 0, 0, 0]; // dual, island-only, swamp-only, other: all lands, tapped or not
    for (const p of this.bf) {
      if (p.land !== null) {
        const i_ = !!p.land.island || energy,
          s_ = !!p.land.swamp || energy;
        mix[i_ && s_ ? 0 : i_ ? 1 : s_ ? 2 : 3] += 1;
      }
      const k = this.srcKind(p, nextTurn);
      if (k === null || (p.tapped && !nextTurn)) continue;
      if (k === 'U' || k === 'B' || k === 'C' || k === 'S') pool[k] += 1;
      else if (k === 'A' || k === 'F') pool.A += 1;
      else if (k === 'UB') {
        pool.U += 1;
        pool.B += 1;
      } else if (k === 'C2') pool.C += 2;
      if (p.land === null && ['U', 'B', 'A', 'F', 'UB'].includes(k))
        free += k === 'UB' ? 2 : 1;
      else if (p.land === null && (k === 'C' || k === 'C2'))
        freeC += k === 'C2' ? 2 : 1;
      if (p.land !== null) {
        lands += 1;
        if (p.land.island || energy) {
          htc += 1;
          pool.U += ht;
        }
        if (p.land.swamp || energy) {
          swc += 1;
          pool.B += muck;
        }
      }
    }
    const hand = this.hand.map((c) => c.name);
    for (const r of remove) {
      const i = hand.indexOf(r);
      if (i >= 0) hand.splice(i, 1);
    }
    hand.push(...add);
    if (nextTurn && hand.some((h) => C.get(h).land !== null)) {
      pool.A += 1;
      lands += 1;
      mix[3] += 1;
    }
    L.pool = pool;
    L.htCount = htc;
    L.swCount = swc;
    L.ht = ht;
    L.muck = muck;
    L.lands = lands;
    L.mix = mix;
    L.free = free;
    L.freeC = freeC;
    L.hand = hand.sort();
    L.gy = this.gy
      .filter((c) => c.isIS)
      .map((c) => c.name)
      .sort();
    L.gyCr = this.gy
      .filter((c) => c.isCreature)
      .map((c) => c.name)
      .sort();
    L.gale = this.onBf(GALE);
    L.gm = this.onBf('Duskmantle Guildmage');
    L.gmAct = nextTurn ? 0 : this.gmAct;
    L.crank = this.onBf('Mindcrank');
    L.konrad = this.onBf('Syr Konrad, the Grim');
    const sk = this.perm('The Mindskinner');
    L.skinner = sk !== null;
    L.skinnerAtk = sk !== null && (nextTurn || (!sk.sick && !this.attacked));
    const mon = this.perm('Riverchurn Monument');
    L.mon = mon !== null && (nextTurn || !mon.tapped);
    L.monEx = mon !== null && !mon.exhausted;
    L.emet = this.onBf('Emet-Selch of the Third Seat');
    L.emetUsed = nextTurn ? false : this.emetUsed;
    L.lost = false;
    const cre = this.bf.filter((p) => p.cd.isCreature);
    L.nCre = cre.length;
    L.fodder = cre.filter(
      (p) => p.cd.power >= 2 && !FODDER_EXCLUDE.has(p.cd.name),
    ).length;
    L.redIs = this.redIS();
    L.redNc = this.bf.filter((p) => C.REDUCE_NONCREATURE.has(p.cd.name)).length;
    L.redBlue = this.bf.filter((p) => C.REDUCE_BLUE.has(p.cd.name)).length;
    L.redGy =
      2 * this.bf.filter((p) => C.REDUCE_FROM_GY2.has(p.cd.name)).length;
    L.life = this.life.slice();
    L.lib = this.lib.map((x) => Math.max(0, x - (nextTurn && x > 0 ? 1 : 0)));
    L.ogy = this.ogy.slice();
    L.poison = this.poison.slice();
    L.cacc = this.cacc.slice();
    L.myLib = this.library.length;
    L.myCacc = 0;
    L.myDens = this.library.length
      ? this.library.filter((c) => c.isCreature).length / this.library.length
      : 0;
    L.pCre = this.cfg.opp_creature_density as number;
    L.oppHand = this.cfg.opp_hand_size as number;
    L.oppCre = this.cfg.opp_creatures_on_board as number;
    // Energy Tap targets: untapped creatures that aren't mana sources (Mindskinner only if it can't attack anyway)
    L.tapMvs = this.bf
      .filter(
        (p) =>
          p.cd.isCreature &&
          (nextTurn || !p.tapped) &&
          !this.srcKind(p, true) &&
          !(p.cd.name === 'The Mindskinner' && L.skinnerAtk),
      )
      .map((p) => p.cd.mv)
      .sort((a, b) => b - a);
    L.oppLands = Math.floor(
      (this.turn + (nextTurn ? 1 : 0)) *
        ((this.cfg.opp_lands_per_turn as number) ?? 1) *
        ((this.cfg.opp_lands_untapped as number) ?? 1),
    );
    L.gyOther = this.gy.filter((c) => !c.isIS).length;
    return L;
  }

  /** Apply opponent events (Konrad triggers, Windfall, combat damage) to the real game. */
  oppEvents(events: number[]): void {
    const L = this.light();
    L.run(events);
    this.life = L.life;
    this.lib = L.lib;
    this.ogy = L.ogy;
    this.cacc = L.cacc;
  }

  // ---------------------------------------------------------------- what the AI wants
  override cardValue(cd: CardDef): number {
    const n = cd.name;
    if (cd.land !== null) {
      const m = this.manaSources() + this.countLandsHand();
      return m <= 3 ? 80 : m <= 6 ? 60 : m <= 8 ? 42 : 12;
    }
    if (COMBO_PERMS.has(n) || COMBO_SORC.has(n)) {
      if (this.onBf(n)) return 10;
      return this.hand.some((c) => c.name === n) ? 30 : 70;
    }
    if (C.COUNTERS.has(n)) return this.hasCounterInHand() ? 38 : 58;
    if (C.TUTORS.has(n)) return 66;
    if (n === 'Sol Ring') return 85;
    if (cd.rock) return this.manaSources() < 6 ? 60 : 20;
    if (
      C.REDUCE_IS.has(n) ||
      C.REDUCE_NONCREATURE.has(n) ||
      C.REDUCE_BLUE.has(n) ||
      ENGINES.has(n)
    )
      return this.onBf(n) ? 15 : 55;
    if (C.RITUALS.has(n)) return 42;
    if (n in C.DRAW_SPELLS) return 30 + 6 * C.DRAW_SPELLS[n];
    if (cd.mdfcLand) return 50;
    return 25;
  }

  override discardValue(cd: CardDef): number {
    let v = this.cardValue(cd);
    if (cd.isIS && this.onBf(GALE)) v -= 15;
    return v;
  }

  override tutorTarget(
    allowed: (c: CardDef) => boolean,
    toTop: boolean,
    spent: string | null = null,
    rampOk = false,
  ): CardDef | null {
    const cands = new Map<string, CardDef>();
    for (const c of this.library)
      if (allowed(c) && !cands.has(c.name)) cands.set(c.name, c);
    if (!cands.size) return null;
    const rem = spent ? [spent] : [];
    let best: CardDef | null = null,
      bs = -1;
    const budget = Math.floor((this.cfg.search_budget as number) / 3);
    if (!this.inRollout) {
      // rollouts: quick rule below
      for (const [name, cd] of cands) {
        if (!(
          COMBO_PERMS.has(name) ||
          COMBO_SPELLS.has(name) ||
          C.COUNTERS.has(name) ||
          COMBO_SORC.has(name) ||
          name === 'Jidoor, Aristocratic Capital'
        ))
          continue;
        let s = 0;
        if (!toTop) {
          const st = this.light(false, [name], rem);
          if (this.killReachable(st)) {
            const r = search.search(st, budget);
            s = r === 2 ? 1000 : r === 1 ? 800 : 0;
          }
        }
        if (s < 800) {
          const st = this.light(true, [name], rem);
          if (this.killReachable(st)) {
            const r = search.search(st, budget);
            s = Math.max(s, r === 2 ? 600 : r === 1 ? 400 : 0);
          }
        }
        if (s > bs) {
          best = cd;
          bs = s;
        }
      }
    }
    if (bs > 0) return best;
    // "tutor for ramp, recast the tutor later with Gale for the combo"
    if (
      rampOk &&
      this.cfg.ramp_tutor &&
      this.turn <= ((this.cfg.ramp_tutor_until as number) ?? 4) &&
      this.manaSources() < ((this.cfg.ramp_tutor_below as number) ?? 5)
    ) {
      for (const n of RAMP_PREFS)
        if (
          cands.has(n) &&
          !this.onBf(n) &&
          !this.hand.some((c) => c.name === n)
        )
          return cands.get(n)!;
    }
    // fallback: complete the package that is closest to done
    const have = new Set([
      ...this.hand.map((c) => c.name),
      ...this.bf.map((p) => p.cd.name),
    ]);
    if (this.onBf(GALE) || this.command.length)
      for (const c of this.gy) if (c.isIS) have.add(c.name);
    let bestPkg: Set<string>[] | null = null,
      bestMissing = 99;
    let complete = false;
    for (const pkg of PACKAGES) {
      const missing = pkg.filter((req) => ![...req].some((n) => have.has(n)));
      if (!missing.length) {
        complete = true;
        continue;
      }
      const avail = missing.filter((req) => [...req].some((n) => cands.has(n)));
      // prefer packages that are closer to done, and fully fetchable ones on ties
      const k = missing.length + (avail.length === missing.length ? 0 : 0.5);
      if (avail.length && k < bestMissing) {
        bestPkg = avail;
        bestMissing = k;
      }
    }
    if (complete && !this.hasCounterInHand()) bestPkg = null;
    if (bestPkg === null) {
      // a full package is already assembled: protection, then mana, then cards
      const prefs = this.hasCounterInHand()
        ? []
        : [
            'Counterspell',
            'Arcane Denial',
            'Mana Sculpt',
            "Archmage's Charm",
            'Unwind',
            "An Offer You Can't Refuse",
            'Dispel',
          ];
      prefs.push(
        'Sol Ring',
        'High Tide',
        'Dark Ritual',
        'Stock Up',
        'See the Truth',
        "Night's Whisper",
      );
      for (const n of prefs) if (cands.has(n)) return cands.get(n)!;
      return firstMax([...cands.values()], (c) => this.cardValue(c));
    }
    const req = bestPkg[0];
    const opts = [...req].filter((n) => cands.has(n)).map((n) => cands.get(n)!);
    return firstMin(opts, (c) => c.mv);
  }

  /** Kill-next-turn score if toHand goes to hand and toGy to the graveyard. */
  giftsSplitValue(toHand: CardDef[], toGy: CardDef[], budget: number): number {
    const L = this.light(
      true,
      toHand.map((c) => c.name),
    );
    L.gy = [...L.gy, ...toGy.filter((c) => c.isIS).map((c) => c.name)].sort();
    L.gyCr = [
      ...L.gyCr,
      ...toGy.filter((c) => c.isCreature).map((c) => c.name),
    ].sort();
    if (!this.killReachable(L)) return 0;
    return search.search(L, budget);
  }

  /** Pick the pile whose WORST split (the opponent chooses) is best for us. Also considers finding
   *  only two instants/sorceries: then both go to the graveyard, where Gale can cast them.
   *  Returns [picks, binned] or null to use the simple rule. */
  giftsPile(): [CardDef[], CardDef[]] | null {
    this.giftsNote = false;
    const pool = new Map<string, CardDef>();
    for (const c of this.library) {
      if (pool.has(c.name)) continue;
      if (
        COMBO_PERMS.has(c.name) ||
        COMBO_SPELLS.has(c.name) ||
        C.COUNTERS.has(c.name) ||
        COMBO_SORC.has(c.name)
      )
        pool.set(c.name, c);
    }
    if (pool.size < 2) return null;
    const budget = (this.cfg.gifts_budget as number) ?? 250;
    // shortlist: cards that make a kill next turn on their own (in hand or binned) come first
    const single = (c: CardDef) =>
      Math.max(
        this.giftsSplitValue([c], [], budget),
        this.giftsSplitValue([], [c], budget),
      );
    const scored = [...pool.values()].map((c) => ({
      c,
      a: single(c),
      b: this.cardValue(c),
    }));
    scored.sort((x, y) => y.a - x.a || y.b - x.b);
    const short = scored
      .slice(0, (this.cfg.gifts_shortlist as number) ?? 6)
      .map((x) => x.c);
    let best: [CardDef[], CardDef[]] | null = null;
    let bv: [number, number] = [-1, -1];
    const gt = (a: [number, number], b: [number, number]) =>
      a[0] > b[0] || (a[0] === b[0] && a[1] > b[1]);
    const gale = this.onBf(GALE);
    const cache = new Map<string, number>();
    const splitVal = (handPart: CardDef[], gyPart: CardDef[]): number => {
      const k =
        handPart
          .map((c) => c.name)
          .sort()
          .join('|') +
        '#' +
        gyPart
          .map((c) => c.name)
          .sort()
          .join('|');
      let v = cache.get(k);
      if (v === undefined) {
        v = this.giftsSplitValue(handPart, gyPart, budget);
        cache.set(k, v);
      }
      return v;
    };
    for (const pile of combinations(short, 4)) {
      let worst = 9,
        tot = 0;
      let worstGy: CardDef[] | null = null;
      for (const gyPart of combinations(pile, 2)) {
        const handPart = pile.filter((c) => !gyPart.includes(c));
        const v = splitVal(handPart, gyPart);
        tot += v;
        if (v < worst) {
          worst = v;
          worstGy = gyPart;
        }
        if (worst < bv[0]) break; // this pile can no longer beat the best one: skip the rest
      }
      if (gt([worst, tot], bv)) {
        best = [pile, worstGy!];
        bv = [worst, tot];
      }
    }
    if (gale) {
      for (const pile of combinations(
        short.filter((c) => c.isIS),
        2,
      )) {
        const v = splitVal([], pile);
        if (gt([v, v * 6], bv)) {
          best = [pile, pile];
          bv = [v, v * 6];
        }
      }
    }
    if (best === null || bv[0] === 0)
      return best === null || bv[1] === 0 ? null : best;
    this.giftsNote = true;
    return best;
  }

  /** Best graveyard card of the other type for Gale, given we just paid for cd. */
  galeOption(cd: CardDef): CardDef | null {
    if (!this.onBf(GALE)) return null;
    const wantSorc = cd.isInstant;
    let best: CardDef | null = null,
      bs = 0;
    for (const g of this.gy) {
      if (g === cd || !(wantSorc ? g.isSorcery : g.isInstant)) continue;
      const s = this.devValueIS(g, true);
      if (s > bs && this.canPay(this.effCost(g, null, true), true)) {
        best = g;
        bs = s;
      }
    }
    return best;
  }

  override devValueIS(cd: CardDef, fromGy = false): number {
    const n = cd.name;
    if (COMBO_SORC.has(n) || C.COUNTERS.has(n) || C.RITUALS.has(n)) return 0;
    if (n === 'See the Truth') return fromGy ? 62 : 42;
    if (n in C.DRAW_SPELLS) {
      const v = 38 + 8 * C.DRAW_SPELLS[n];
      if (n === 'Windfall' && this.hand.length > 3) {
        if (!this.onBf(GALE)) return 0;
        // with Gale out, discarded instants/sorceries stay castable from the graveyard,
        // so Windfall only really loses the permanents in hand
        const lost = this.hand.filter(
          (c) =>
            c !== cd && !c.isIS && c.land === null && this.cardValue(c) >= 55,
        ).length;
        const binned = this.hand.filter((c) => c !== cd && c.isIS).length;
        return lost === 0 ? Math.min(80, 60 + 4 * binned) : lost === 1 ? 45 : 0;
      }
      if (n === 'Insatiable Avarice') return 0;
      return v;
    }
    if (C.TUTORS.has(n)) return 72;
    if (n === 'Unearth')
      return this.gy.some(
        (c) => c.isCreature && c.mv <= 3 && c.name in PERM_SCORE,
      )
        ? 60
        : 0;
    if (n === 'Snap') return 20;
    if (!cd.known) return 15;
    return 0;
  }

  candidates(main2: boolean): Cand[] {
    const out: Cand[] = [];
    // commanders
    for (const cd of this.command.slice()) {
      if (cd.name === GALE) {
        const c0 = this.effCost(cd);
        out.push({
          score: 95,
          cost: c0.withGeneric(c0.g + 2 * this.galeCasts),
          isIS: false,
          act: () => this.castPerm(cd, true),
        });
      } else if (cd.name === SCION) {
        out.push({
          score: this.onBf(GALE) ? 91 : 18,
          cost: this.effCost(cd),
          isIS: false,
          act: () => this.castPerm(cd, true),
        });
      } else
        out.push({
          score: 40,
          cost: this.effCost(cd),
          isIS: false,
          act: () => this.castPerm(cd, true),
        });
    }
    const seen = new Set<string>();
    for (const cd of this.hand.slice()) {
      if (seen.has(cd.name) || cd.land !== null) continue;
      seen.add(cd.name);
      const n = cd.name;
      if (!cd.isIS) {
        if (n === 'Wishclaw Talisman') {
          out.push({
            score: 73,
            cost: this.effCost(cd).plus(new Cost(1)),
            isIS: false,
            act: () => this.wishclaw(cd),
          });
          continue;
        }
        let sc = permScore(n, 30);
        if (COMBO_PERMS.has(n) && !this.onBf(n)) {
          const miss = this.pkgMissing(n);
          sc = miss === 0 ? 88 : miss === 1 && this.turn >= 4 ? 78 : sc;
        }
        if (cd.rock && n !== 'Sol Ring' && this.manaSources() >= 7) sc = 30;
        if (this.onBf(n) && n in PERM_SCORE) sc = 5; // legendary / redundant
        out.push({
          score: sc,
          cost: this.effCost(cd),
          isIS: false,
          act: () => this.castPerm(cd),
          rock: cd.rock ? cd : undefined,
        });
        continue;
      }
      // instants & sorceries
      if (n === 'Insatiable Avarice') {
        for (const [mode, extra, sc] of [
          ['both', new Cost(2, 0, 2), 78],
          ['tutor', new Cost(2), 70],
          ['draw', new Cost(0, 0, 2), 50],
        ] as [string, Cost, number][]) {
          const base = cd.cost.plus(extra);
          out.push({
            score: sc,
            cost: this.effCost(cd, base),
            isIS: true,
            act: () => this.castWithGale(cd, base, mode),
          });
        }
        continue;
      }
      if (n === 'Muddle the Mixture') {
        // transmute {1}{U}{U}: discard it, find a card with mana value 2 (Guildmage, Mindcrank,
        // Cacophony, Prologue, Expansion Algorithm, ...). Keeps it as a counter when it's the only one.
        const sc =
          this.hand.filter((c) => C.COUNTERS.has(c.name)).length >= 2 ? 72 : 60;
        out.push({
          score: sc,
          cost: new Cost(1, 2),
          isIS: false,
          act: () => this.transmute(cd),
        });
        continue;
      }
      if (n === "Archmage's Charm") {
        if (this.hand.filter((c) => C.COUNTERS.has(c.name)).length >= 2)
          out.push({
            score: 36,
            cost: this.effCost(cd),
            isIS: true,
            act: () => this.castWithGale(cd),
          });
        continue;
      }
      if (C.RITUALS.has(n)) continue;
      const sc = this.devValueIS(cd);
      if (sc <= 0 && !this.onBf(GALE)) continue;
      out.push({
        score: sc,
        cost: this.effCost(cd),
        isIS: true,
        act: () => this.castWithGale(cd),
      });
    }
    // flashback Deep Analysis
    const da = this.gy.find((c) => c.name === 'Deep Analysis');
    if (da)
      out.push({
        score: 44,
        cost: this.effCost(da, new Cost(1, 1), true),
        isIS: true,
        act: () => this.flashback(da),
      });
    if (this.cfg.self_counter_dev ?? true) out.push(...this.selfCounterDev());
    if (main2) out.push(...this.sinks());
    return out;
  }

  /** Development play: cast a cheap spell, counter it with your own Offer (+2 Treasures) or Unwind
   *  (untap 3 lands). The counter is an instant, so Gale recasts a sorcery from the graveyard.
   *  Only when another counter stays in hand for protection. */
  selfCounterDev(): Cand[] {
    if (!this.onBf(GALE)) return [];
    const out: Cand[] = [];
    for (const kname of SELF_COUNTER_DEV) {
      const k = this.hand.find((c) => c.name === kname);
      if (!k || !this.hand.some((c) => C.COUNTERS.has(c.name) && c !== k))
        continue;
      const sorc = this.gy.filter(
        (g) => g.isSorcery && this.devValueIS(g, true) > 0,
      );
      if (!sorc.length) continue;
      const targets = this.hand.filter(
        (c) =>
          c !== k &&
          c.isIS && // not a rock or other permanent
          !C.COUNTERS.has(c.name) &&
          !COMBO_SORC.has(c.name) &&
          !COMBO_PERMS.has(c.name) &&
          !COMBO_SPELLS.has(c.name) &&
          !C.TUTORS.has(c.name) &&
          c.name !== 'Jidoor, Aristocratic Capital',
      );
      if (!targets.length) continue;
      const t = firstMin(
        targets,
        (c) => this.effCost(c).mv * 1000 + this.cardValue(c),
      );
      const gain = Math.max(...sorc.map((g) => this.devValueIS(g, true)));
      const sc = gain - 4 - Math.floor(this.cardValue(t) / 10);
      out.push({
        score: sc,
        cost: this.effCost(t).plus(this.effCost(k)),
        isIS: true,
        act: () => this.selfCounter(k, t),
      });
    }
    return out;
  }

  selfCounter(k: CardDef, t: CardDef): boolean {
    const s = this.snap();
    if (!(
      this.pay(this.effCost(t), t.isIS) && this.pay(this.effCost(k), true)
    )) {
      this.restore(s);
      return false;
    }
    this.restore(s);
    this.pay(this.effCost(t), t.isIS);
    removeOrThrow(this.hand, t);
    this.say('cast', t, 'to counter it with your own', k);
    if (t.isIS) {
      this.spellsCast += 1;
      this.onCastIS(false);
      const g1 = this.galeOption(t);
      if (g1 !== null) {
        const s1 = this.snap();
        if (
          this.pay(this.effCost(g1, null, true), true) &&
          this.canPay(this.effCost(k), true)
        ) {
          removeOrThrow(this.gy, g1);
          this.say('  Gale recasts', g1);
          this.spellsCast += 1;
          this.onCastIS(true);
          this.resolve(g1, true);
          this.exile.push(g1);
        } else this.restore(s1);
      }
    }
    if (!this.hand.includes(k) || !this.pay(this.effCost(k), true)) {
      // e.g. discarded by the recast
      this.gy.push(t);
      return true;
    }
    removeOrThrow(this.hand, k);
    this.spellsCast += 1;
    this.onCastIS(false);
    const g2 = this.galeOption(k);
    if (g2 !== null && this.pay(this.effCost(g2, null, true), true)) {
      removeOrThrow(this.gy, g2);
      this.say('  Gale recasts', g2);
      this.spellsCast += 1;
      this.onCastIS(true);
      this.resolve(g2, true);
      this.exile.push(g2);
    }
    this.gy.push(t, k);
    if (k.name === "An Offer You Can't Refuse") {
      this.pool.U += 1; // 2 Treasures (used this turn)
      this.pool.B += 1;
    } else this.untapLands(k.name === 'Rewind' ? 4 : 3);
    return true;
  }

  pkgMissing(extra: string): number {
    const have = new Set([
      ...this.hand.map((c) => c.name),
      ...this.bf.map((p) => p.cd.name),
      extra,
    ]);
    if (this.onBf(GALE)) for (const c of this.gy) if (c.isIS) have.add(c.name);
    let m = Infinity;
    for (const pkg of PACKAGES) {
      if (!pkg.some((r) => r.has(extra))) continue;
      m = Math.min(
        m,
        pkg.filter((req) => ![...req].some((n) => have.has(n))).length,
      );
    }
    return m;
  }

  castWithGale(
    cd: CardDef,
    base: Cost | null = null,
    mode: string | null = null,
  ): boolean {
    const s = this.snap();
    if (!this.pay(this.effCost(cd, base), true)) return false;
    const tgt = this.galeOption(cd);
    this.restore(s);
    return this.castIS(cd, false, base, mode, { galeTarget: tgt });
  }

  override canTapForEnergy(p: Perm): boolean {
    return !(p.cd.name === 'The Mindskinner' && !p.sick && !this.attacked); // it would rather attack (Gale never does)
  }

  override castRitual(cd: CardDef): boolean {
    return this.castWithGale(cd);
  }

  sinks(): Cand[] {
    const out: Cand[] = [];
    const lands = this.landsBf().length;
    const cyc = this.hand.find(
      (cd) =>
        (cd.name === 'Fetid Pools' || cd.name === 'Unearth') && lands >= 5,
    );
    if (cyc)
      out.push({
        score: 8,
        cost: new Cost(2),
        isIS: false,
        act: () => this.cycle(cyc),
      });
    if (this.perm('Syr Konrad, the Grim') && this.onBf(GALE))
      out.push({
        score: 6,
        cost: new Cost(1, 0, 1),
        isIS: false,
        act: () => this.konradMill(),
      });
    return out;
  }

  konradMill(): boolean {
    if (this.konradActs >= 3 || !this.pay(new Cost(1, 0, 1))) return false;
    this.konradActs += 1;
    const ev: number[] = [];
    for (let i = 0; i < this.life.length; i++) ev.push(EV.MILL, i, 1);
    this.oppEvents(ev);
    if (this.library.length) this.toGy(this.library.shift()!);
    return true;
  }

  /** Rough value of a position when no kill is in sight (higher is better). */
  override positionValue(): number {
    const st = this.light(true);
    let v = 0;
    const p = st.pool;
    v += 35 * Math.min(10, p.U + p.B + p.A + p.C + p.S);
    v += 25 * (st.redIs + st.redNc + st.redBlue) + 12 * st.redGy;
    if (st.gale) {
      v += 150;
      v +=
        6 *
        this.gy.filter((c) => c.isIS && this.devValueIS(c, true) > 0).length;
    }
    const have = new Set([
      ...this.hand.map((c) => c.name),
      ...this.bf.map((q) => q.cd.name),
    ]);
    if (st.gale || this.command.length)
      for (const c of this.gy) if (c.isIS) have.add(c.name);
    const miss = Math.min(
      ...PACKAGES.map(
        (pkg) => pkg.filter((req) => ![...req].some((n) => have.has(n))).length,
      ),
    );
    v += miss === 0 ? 450 : miss === 1 ? 220 : miss === 2 ? 70 : 0;
    // engines / creatures on the battlefield are worth at least as much as in hand
    v +=
      0.6 *
      this.bf
        .filter((q) => q.land === null && !q.cd.rock)
        .reduce((s, q) => s + permScore(q.cd.name, 0), 0);
    v += 0.4 * this.hand.reduce((s, c) => s + this.cardValue(c), 0);
    if (this.hasCounterInHand()) v += 40;
    return v;
  }

  override combat(): void {
    const sk = this.perm('The Mindskinner');
    if (sk && !sk.sick && !this.attacked) {
      this.attacked = true;
      const t = this.light().target();
      if (t !== null) {
        this.oppEvents([EV.DMG, t, 10]);
        this.say(
          'Mindskinner attacks: opp libraries',
          `[${this.lib.join(', ')}]`,
        );
      }
    }
    if (this.inArena()) {
      // a pod: the other creatures attack when no blocker can stop or kill them (in a goldfish game Gale never attacks)
      const pool = this.creatures().filter(
        (p) =>
          p.cd.name !== 'The Mindskinner' &&
          !p.tapped &&
          !p.sick &&
          this.power(p) > 0 &&
          !this.srcKind(p, true),
      );
      if (pool.length) this.arenaCombat(pool);
    }
  }
}
