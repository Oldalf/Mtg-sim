/**
 * The Sam & Frodo deck's AI (Abzan tokens / aristocrats): the rules of its cards, what it wants to do
 * each turn, and the rules agreed for this deck (see PLAN.md).
 *
 * Win: all three opponents at 0 life (40 each). Second measure: first opponent dead.
 * Single-target drains ("target opponent loses ...") go to the opponent with the most life, so all
 * three go down together and "each opponent" drains never hit a dead player.
 * Attacks: only Frodo (for the Ring and its card draw) and Gollum (for its end-step drain), unless
 * attacking with everything kills the table. No crackback (those attacks are tiny).
 * The game itself (mana, zones, casting, turns) is the shared engine in engine/game.ts.
 */
import * as C from '../../engine/cards';
import { Cost, CardDef, makeToken } from '../../engine/cards';
import {
  Game,
  Cand,
  Evasion,
  GameWithoutKillSearch,
  Perm,
  Zone,
  firstMax,
  removeIfPresent,
} from '../../engine/game';
import { MulliganRule } from '../../engine/mulligan';
import { MULLIGAN } from './mulligan';

export const FRODO = 'Frodo, Adventurous Hobbit';
export const SAM = 'Sam, Loyal Attendant';
export const GOLLUM = 'Gollum, Obsessed Stalker';
/** Archidekt's Ring card: its counter = how many times the Ring has tempted us. */
export const RING_TRACKER = 'The Ring // The Ring Tempts You';

function artifactToken(
  name: string,
  creature = false,
  power = 0,
  toughness = 0,
): CardDef {
  return new CardDef(name, {
    name,
    type_line: `Token Artifact${creature ? ' Creature' : ''} — ${name}`,
    token: true,
    power: creature ? String(power) : null,
    toughness: creature ? String(toughness) : null,
  } as never);
}
export const FOOD = artifactToken('Food');
export const TREASURE = artifactToken('Treasure');
export const CLUE = artifactToken('Clue');
export const TOK = {
  halfling: makeToken('Halfling', 1, 1, 'white'),
  soldier: makeToken('Soldier', 1, 1, 'white', ['lifelink']),
  cat: makeToken('Cat', 1, 1, 'white'),
  goat: makeToken('Goat', 0, 1, 'white'),
  bird: makeToken('Bird', 3, 3, 'white', ['flying']),
  servo: artifactToken('Servo', true, 1, 1),
};
const ART_TOKENS = new Set([FOOD, TREASURE, CLUE]);

/** How much we want each card on the battlefield (casting order, discards, the planner's score). */
const VALUE: Record<string, number> = {
  'Sol Ring': 100,
  [SAM]: 90,
  'Sanguine Bond': 88,
  [FRODO]: 84,
  'Arcane Signet': 80,
  'Mirkwood Bats': 80,
  'Marionette Apprentice': 78,
  'Popular Egotist': 76,
  'Susurian Voidborn': 76,
  'Peregrin Took': 76,
  'Academy Manufactor': 75,
  'The Notary Hobbits': 75,
  'Prosperous Innkeeper': 74,
  'Marionette Master': 72,
  'Tireless Provisioner': 72,
  'Tippy-Toe, Terrific Partner': 72,
  'Lobelia, Defender of Bag End': 70,
  'Umbral Collar Zealot': 68,
  "Witch's Oven": 66,
  'Cauldron Familiar': 66,
  'Rosie Cotton of South Lane': 64,
  'Belladonna Took': 64,
  'Pristine Talisman': 64,
  'Birds of Paradise': 64,
  'Prize Pig': 62,
  'Cat Collector': 62,
  'Merry, Warden of Isengard': 62,
  'Gollum, Obsessed Stalker': 60,
  'Mentor of the Meek': 60,
  'Nuka-Cola Vending Machine': 58,
  'Rapacious Guest': 58,
  'Gwaihir, Greatest of the Eagles': 58,
  "Commander's Sphere": 58,
  'Chromatic Lantern': 58,
  'Gilded Goose': 56,
  'Elanor Gardner': 56,
  'Unlucky Cabbage Merchant': 54,
  'The Gaffer': 54,
  'Dawn of Hope': 54,
  'Well of Lost Dreams': 52,
  'Of Herbs and Stewed Rabbit': 52,
  'Savvy Hunter': 52,
  'Trading Post': 50,
  'Meriadoc Brandybuck': 48,
  'Pippin, Warden of Isengard': 48,
  'Farmer Cotton': 60,
  'Shire Shirriff': 40,
  Cultivate: 55,
  Farseek: 55,
  Harmonize: 58,
  "Night's Whisper": 52,
  'Second Harvest': 50,
  'Crypt Incursion': 30,
};
/** Removal: no targets in a goldfish game (held; the first cards to discard). */
const HOLD = new Set([
  'Anguished Unmaking',
  'Dusk',
  'Fell the Mighty',
  'Go for the Throat',
  'Mortify',
  'Path to Exile',
  'Swords to Plowshares',
  'Toxic Deluge',
  'Supper for Spiders',
]);
const RAMP_EARLY = new Set([
  'Arcane Signet',
  'Birds of Paradise',
  'Prize Pig',
  'Gilded Goose',
  "Commander's Sphere",
  'Chromatic Lantern',
  'Pristine Talisman',
  'Cultivate',
  'Farseek',
  'Prosperous Innkeeper',
  'Tireless Provisioner',
]);
const SAGA = 'Of Herbs and Stewed Rabbit';
/** Removal we point at our own Rapacious Guest (it drains its power when it leaves), best first:
 *  Swords gains us that much life, Path gives a basic land (landfall), Anguished Unmaking costs 3 life. */
const OWN_KILL = [
  'Swords to Plowshares',
  'Path to Exile',
  'Go for the Throat',
  'Mortify',
  'Anguished Unmaking',
];
const OWN_KILL_EXILES = new Set([
  'Swords to Plowshares',
  'Path to Exile',
  'Anguished Unmaking',
]);

const HALFLING_CACHE = new Map<CardDef, boolean>();
export function isHalfling(cd: CardDef): boolean {
  let h = HALFLING_CACHE.get(cd);
  if (h === undefined) {
    h =
      cd === TOK.halfling ||
      (C.db()[cd.name]?.type_line ?? '').includes('Halfling');
    HALFLING_CACHE.set(cd, h);
  }
  return h;
}

// every card this file has rules for (lands, rocks and plain draw spells are engine facts)
C.registerKnown([...Object.keys(VALUE), ...HOLD, FRODO, SAM, 'Dusk // Dawn']);

type Phase = 'main1' | 'combat' | 'main2' | 'end';

export class SamFrodoGame extends GameWithoutKillSearch {
  override mulliganRule(): MulliganRule | null {
    return this.cfg.smart_mulligan ? MULLIGAN : null;
  }
  override colors = ['W', 'B', 'G'];
  phase: Phase = 'main1';
  gained = 0; // life gained this turn
  firstGain = false; // Cat Collector: first life gain this turn happened
  foodSac = false; // a Food was sacrificed this turn (Elanor)
  bella = 0; // Belladonna Took: times its ability resolved this turn
  merryUsed = false; // Merry: once each turn
  ringTempts = 0; // the Ring tempted us (Frodo is always the Ring-bearer)
  gollumHit: boolean[] = new Array(this.life.length).fill(false); // opponents dealt combat damage by Gollum this game
  pigRibbons = 0; // Prize Pig's ribbon counters
  castX = 0; // X for Farmer Cotton while it enters
  allInWin = false; // the win came from an all-in attack (for the stats)

  // ================================================================ the win condition
  won(): boolean {
    return (
      this.life.filter((x) => x <= 0).length >= (this.cfg.win_dead as number)
    );
  }
  override oppsBeaten(): boolean {
    return this.won();
  }
  override checkKill(): number {
    if (this.died) return 2;
    if (this.won()) {
      if (this.unprot === null) {
        this.unprot = this.turn;
        this.say(`WIN: opp life [${this.life.join(', ')}]`);
      }
      return 2;
    }
    return 0;
  }
  override play(): [number | null, number | null] {
    super.play();
    return [this.died ? null : this.unprot, this.firstOppDead];
  }
  // ---------------------------------------------------------------- log analyzer hooks
  override syncFromLog(board: { trackers: Record<string, number> }): void {
    this.ringTempts = board.trackers[RING_TRACKER] ?? 0;
  }
  override logToken(name: string): CardDef | null {
    const n = name.toLowerCase();
    if (n.includes('food')) return FOOD;
    if (n.includes('treasure')) return TREASURE;
    if (n.includes('clue')) return CLUE;
    if (n.includes('soldier')) return TOK.soldier;
    if (n.includes('halfling')) return TOK.halfling;
    if (n.includes('cat')) return TOK.cat;
    if (n.includes('goat')) return TOK.goat;
    if (n.includes('bird')) return TOK.bird;
    if (n.includes('servo')) return TOK.servo;
    return null;
  }

  override clone(): this {
    const g = super.clone();
    g.gollumHit = this.gollumHit.slice();
    return g;
  }

  // ================================================================ drains
  /** "Target opponent": the one with the most life (keeps the three even). */
  targetOpp(): number | null {
    let best: number | null = null;
    for (let i = 0; i < this.life.length; i++)
      if (this.oppAlive(i) && (best === null || this.life[i] > this.life[best]))
        best = i;
    return best;
  }
  pingOne(n: number): void {
    const t = this.targetOpp();
    if (t !== null && n > 0) this.hurtOpp(t, n);
  }

  override gainLife(n: number): void {
    if (n <= 0) return;
    super.gainLife(n);
    this.gained += n;
    if (!this.firstGain) {
      this.firstGain = true;
      for (const p of this.bf.filter((q) => q.cd.name === 'Cat Collector'))
        if (this.bf.includes(p)) this.makeTokens([TOK.cat]);
    }
    for (const p of this.bf) if (p.cd.name === 'Sanguine Bond') this.pingOne(n);
    const pig = this.perm('Prize Pig');
    if (pig) {
      this.pigRibbons += n;
      if (this.pigRibbons >= 3) {
        this.pigRibbons = 0;
        pig.tapped = false;
      }
    }
    if (this.phase !== 'main1') {
      if (this.onBf('Dawn of Hope') && this.pay(new Cost(2))) {
        this.say('Dawn of Hope: pay 2, draw');
        this.draw(1);
      }
      if (this.onBf('Well of Lost Dreams')) {
        let x = 0;
        while (x < n && this.canPay(new Cost(x + 1))) x++;
        if (x > 0 && this.pay(new Cost(x))) {
          this.say(`Well of Lost Dreams: draw ${x}`);
          this.draw(x);
        }
      }
    }
  }

  // ================================================================ tokens
  /** Create tokens as one event: Peregrin Took and Tippy-Toe add a Food each, Academy Manufactor turns each
   *  Food / Clue / Treasure into one of each. Then each token enters (and "create" triggers fire). */
  makeTokens(cds: CardDef[], opts: { tapped?: boolean } = {}): Perm[] {
    if (!cds.length) return [];
    const list = cds.slice();
    if (this.onBf('Peregrin Took')) list.push(FOOD);
    if (this.onBf('Tippy-Toe, Terrific Partner')) list.push(FOOD);
    const all = this.onBf('Academy Manufactor')
      ? list.flatMap((c) => (ART_TOKENS.has(c) ? [FOOD, CLUE, TREASURE] : [c]))
      : list;
    const out: Perm[] = [];
    for (const c of all) {
      const p = this.enter(c, 'token', { token: true, tapped: opts.tapped });
      out.push(p);
      // "whenever you create a token"
      for (const q of this.bf.slice()) {
        if (q.cd.name === 'Mirkwood Bats') this.drainEach(1);
        else if (q.cd.name === 'Rosie Cotton of South Lane') {
          const t = this.counterTarget(q);
          if (t) t.counters += 1;
        }
      }
    }
    return out;
  }

  /** The best creature for a +1/+1 counter: Marionette Master (its power is the drain), Rapacious Guest, Frodo. */
  counterTarget(exclude: Perm | null = null): Perm | null {
    const cs = this.creatures().filter((p) => p !== exclude);
    if (!cs.length) return null;
    const pri = (p: Perm) =>
      p.cd.name === 'Marionette Master'
        ? 5
        : p.cd.name === 'Rapacious Guest'
          ? 4
          : p.cd.name === FRODO
            ? 3
            : p.cd.name === GOLLUM
              ? 2
              : p.token
                ? 0
                : 1;
    return firstMax(cs, pri);
  }

  foods(): Perm[] {
    return this.bf.filter((p) => p.cd === FOOD);
  }

  halflings(): number {
    return this.creatures().filter((p) => isHalfling(p.cd)).length;
  }

  // ================================================================ entering
  override onEnter(p: Perm, _from: Zone): void {
    const cd = p.cd;
    const n = cd.name;
    // triggers of other permanents
    if (
      cd.types.has('artifact') &&
      !this.merryUsed &&
      this.bf.some((q) => q !== p && q.cd.name === 'Merry, Warden of Isengard')
    ) {
      this.merryUsed = true;
      this.makeTokens([TOK.soldier]);
    }
    if (p.token && this.onBf('Belladonna Took') && this.bella < 3) {
      this.bella++;
      if (this.bella === 1) this.gainLife(1);
      else if (this.bella === 2) this.draw(1);
      else for (const q of this.creatures()) q.counters += 1;
    }
    if (cd.isCreature) {
      for (const q of this.bf)
        if (q !== p && q.cd.name === 'Prosperous Innkeeper') this.gainLife(1);
      if (this.power(p) <= 2 && this.phase !== 'main1')
        for (const q of this.bf)
          if (
            q !== p &&
            q.cd.name === 'Mentor of the Meek' &&
            this.pay(new Cost(1))
          )
            this.draw(1);
    }
    // its own enter triggers
    // Partner with: Merry fetches Pippin from the library and the other way round
    const partner =
      n === 'Merry, Warden of Isengard'
        ? 'Pippin, Warden of Isengard'
        : n === 'Pippin, Warden of Isengard'
          ? 'Merry, Warden of Isengard'
          : null;
    if (partner && !p.token) {
      const c = this.library.find((x) => x.name === partner);
      if (c) {
        removeIfPresent(this.library, c);
        this.shuffle();
        this.hand.push(c);
        this.say('partner: tutor', c);
      }
    }
    if (n === 'Cauldron Familiar') {
      this.drainEach(1);
      this.gainLife(1);
    } else if (n === 'Marionette Apprentice')
      this.makeTokens([TOK.servo]); // fabricate 1: a Servo (more fodder)
    else if (n === 'Marionette Master')
      p.counters += 3; // fabricate 3: counters (each artifact going away drains 4)
    else if (n === 'The Notary Hobbits' && !p.token) this.makeTokens([cd, cd]);
    else if (n === 'Prosperous Innkeeper') this.makeTokens([TREASURE]);
    else if (
      [
        'Gilded Goose',
        'Elanor Gardner',
        'Unlucky Cabbage Merchant',
        'Cat Collector',
        'Rosie Cotton of South Lane',
      ].includes(n)
    )
      this.makeTokens([FOOD]);
    else if (n === 'Farmer Cotton') {
      const x = this.castX;
      this.makeTokens([
        ...new Array(x).fill(TOK.halfling),
        ...new Array(x).fill(FOOD),
      ]);
    } else if (n === 'Shire Shirriff') {
      const t = this.spareFodder().find(
        (q) => q.token && this.sacValue(q) >= 3,
      );
      if (t) this.sacrifice(t);
    } else if (n === SAGA) {
      p.counters = 1;
      const t = this.counterTarget();
      if (t) t.counters += 1;
      this.makeTokens([FOOD]);
    }
  }

  // ================================================================ leaving
  override sacrifice(p: Perm): void {
    if (!this.bf.includes(p)) return;
    const food = p.cd === FOOD;
    super.sacrifice(p); // -> dies -> onDies
    for (const q of this.bf) {
      if (q.cd.name === 'Popular Egotist') {
        this.pingOne(1);
        this.gainLife(1);
      } else if (q.cd.name === 'Mirkwood Bats' && p.token) this.drainEach(1);
    }
    if (food) this.foodSacrificed();
  }

  /** Put into the graveyard from the battlefield (sacrificed, destroyed; tokens too). */
  override onDies(p: Perm): void {
    const art = p.cd.types.has('artifact'),
      cre = p.cd.isCreature;
    if (!art && !cre) return;
    for (const q of this.bf.slice()) {
      const n = q.cd.name;
      if (n === 'Marionette Apprentice') this.drainEach(1);
      else if (n === 'Marionette Master' && art) this.pingOne(this.power(q));
      else if (n === 'Susurian Voidborn') {
        this.pingOne(1);
        this.gainLife(1);
      }
    }
    if (p.cd.name === 'Susurian Voidborn') {
      this.pingOne(1);
      this.gainLife(1);
    }
    if (p.cd.name === 'Rapacious Guest') this.pingOne(this.power(p));
  }

  foodSacrificed(): void {
    this.foodSac = true;
    for (const q of this.bf.slice()) {
      const n = q.cd.name;
      if (n === 'Nuka-Cola Vending Machine')
        this.makeTokens([TREASURE], { tapped: true });
      else if (n === 'Rapacious Guest') q.counters += 1;
      else if (
        n === 'Unlucky Cabbage Merchant' &&
        this.landsBf().length < 7 &&
        this.bf.includes(q)
      ) {
        if (this.putBasic()) {
          removeIfPresent(this.bf, q);
          this.library.push(q.cd);
        }
      }
    }
  }

  /** Opponents' total life loss if this permanent were sacrificed now (the payoffs on the battlefield). */
  sacValue(p: Perm): number {
    const key = p.token
      ? p.cd === FOOD
        ? 'F'
        : p.cd === TREASURE
          ? 'T'
          : p.cd === CLUE
            ? 'L'
            : 't' + +p.isCreature + +p.cd.types.has('artifact')
      : null;
    if (key !== null && this.sacMemo) {
      const m = this.sacMemo.get(key);
      if (m !== undefined) return m;
    }
    const v = this.sacValueRaw(p);
    if (key !== null && this.sacMemo) this.sacMemo.set(key, v);
    return v;
  }
  sacMemo: Map<string, number> | null = null;
  msMemo: number | null = null;
  override manaSources(): number {
    return this.msMemo ?? super.manaSources();
  }

  sacValueRaw(p: Perm): number {
    const alive = this.oppsAlive();
    const art = p.cd.types.has('artifact'),
      cre = p.cd.isCreature;
    const bond = this.bf.filter((q) => q.cd.name === 'Sanguine Bond').length;
    let v = 0;
    for (const q of this.bf) {
      if (q === p) continue;
      const n = q.cd.name;
      if (n === 'Popular Egotist') v += 1 + bond;
      else if (n === 'Mirkwood Bats' && p.token) v += alive;
      else if (n === 'Marionette Apprentice' && (art || cre)) v += alive;
      else if (n === 'Marionette Master' && art) v += this.power(q);
      else if (n === 'Susurian Voidborn' && (art || cre)) v += 1 + bond;
    }
    return v;
  }

  /** Things we can sacrifice without losing anything we care about: tokens (Foods and Treasures kept as
   *  needed), worst first. */
  spareFodder(): Perm[] {
    const foods = this.foods();
    const keepFood =
      (this.onBf(SAM) ? 0 : 1) +
      (this.gy.some((c) => c.name === 'Cauldron Familiar') ? 1 : 0);
    const keepTreasure = this.turn >= 7 ? 0 : 2;
    let foodLeft = foods.length - keepFood;
    let treasureLeft =
      this.bf.filter((p) => p.cd === TREASURE).length - keepTreasure;
    const out: Perm[] = [];
    for (const p of this.bf) {
      if (!p.token) continue;
      if (p.cd === FOOD) {
        if (foodLeft-- <= 0) continue;
      } else if (p.cd === TREASURE) {
        if (treasureLeft-- <= 0) continue;
      } else if (p.cd.name === 'The Notary Hobbits') continue;
      else if (p.cd === TOK.bird) continue;
      out.push(p);
    }
    const rank = (p: Perm) =>
      p.cd === CLUE
        ? 0
        : p.cd === TOK.goat
          ? 1
          : p.isCreature
            ? 2 + this.power(p)
            : p.cd === FOOD
              ? 3
              : 4;
    return out.sort((a, b) => rank(a) - rank(b));
  }

  // ================================================================ lands
  override onLandEnter(p: Perm, _gone: boolean): void {
    for (const q of this.bf.slice())
      if (q.cd.name === 'Tireless Provisioner')
        this.makeTokens([this.manaSources() < 6 ? TREASURE : FOOD]);
    if (p.cd.name === 'Graypelt Refuge' || p.cd.name === 'Scoured Barrens')
      this.gainLife(1);
  }

  /** Put a basic land from the library onto the battlefield tapped (the colour we have least of). */
  putBasic(
    toHand = false,
    only: string[] = ['Plains', 'Swamp', 'Forest'],
  ): boolean {
    const src = (col: string) =>
      this.landsBf().filter((p) => {
        const k = this.srcKind(p, true) ?? '';
        return k === col || k === 'A' || (k.length === 3 && k.includes(col));
      }).length;
    const order = only
      .slice()
      .sort((a, b) => src(BASIC_COL[a]) - src(BASIC_COL[b]));
    for (const name of order) {
      const c = this.library.find((x) => x.name === name);
      if (!c) continue;
      removeIfPresent(this.library, c);
      this.shuffle();
      if (toHand) this.hand.push(c);
      else {
        const q = new Perm(c, c.land, true);
        q.sick = false;
        this.bf.push(q);
        this.say('basic land onto the battlefield:', c);
        this.onLandEnter(q, false);
      }
      return true;
    }
    return false;
  }

  // ================================================================ mana
  override srcKind(p: Perm, ignoreSick = false): string | null {
    if (p.cd === TREASURE) return 'A';
    const n = p.cd.name;
    if (n === 'Gilded Goose')
      return (ignoreSick || !p.sick) && this.foods().length ? 'A' : null;
    if (n === 'The Notary Hobbits') {
      if (!ignoreSick && p.sick) return null;
      if (ignoreSick) return 'C1'; // (counting sources: any count will do)
      const h = this.halflings();
      return h > 0 ? `C${h}` : null;
    }
    if (p.land !== null && this.onBf('Chromatic Lantern')) return 'A';
    return super.srcKind(p, ignoreSick);
  }

  /** Sources with a side effect when tapped for mana: Treasures are sacrificed, Gilded Goose eats a Food,
   *  Pristine Talisman gains 1 life. */
  override pay(cost: Cost, isIS = false, commit = true): boolean {
    if (!commit) return super.pay(cost, isIS, false);
    const before = this.bf.filter((p) => !p.tapped);
    if (!super.pay(cost, isIS, true)) return false;
    for (const p of before) {
      if (!p.tapped) continue;
      if (p.cd === TREASURE) this.sacrifice(p);
      else if (p.cd.name === 'Gilded Goose') {
        const f = this.foods()[0];
        if (f) this.sacrifice(f);
      } else if (p.cd.name === 'Pristine Talisman') this.gainLife(1);
    }
    return true;
  }

  // ================================================================ card values
  value(cd: CardDef): number {
    return VALUE[cd.name] ?? (cd.isCreature ? 40 : 30);
  }
  override cardValue(cd: CardDef): number {
    if (cd.land !== null) {
      const m = this.manaSources() + this.countLandsHand();
      return m <= 3 ? 80 : m <= 6 ? 60 : m <= 8 ? 35 : 12;
    }
    if (HOLD.has(cd.name)) return 10;
    if (RAMP_EARLY.has(cd.name) && this.manaSources() >= 7) return 25;
    return this.value(cd);
  }
  override discardValue(cd: CardDef): number {
    return this.cardValue(cd);
  }
  override discard(n: number): void {
    this.msMemo = super.manaSources();
    try {
      super.discard(n);
    } finally {
      this.msMemo = null;
    }
  }

  // ================================================================ turn steps
  // ---- measures for --diag (they change nothing in the game)
  permsEnd: number[] = []; // nonland permanents (tokens too) at the end of turns 4-6
  override diag(): Record<string, number | null> {
    return {
      spent5: this.spentEnd[5] ?? null,
      spent6: this.spentEnd[6] ?? null,
      perms5: this.permsEnd[5] ?? null,
      perms6: this.permsEnd[6] ?? null,
    };
  }

  override startTurn(): void {
    if (this.turn >= 4 && this.turn <= 6)
      this.permsEnd[this.turn] = this.bf.filter((p) => p.land === null).length;
    super.startTurn();
    this.phase = 'main1';
    this.gained = 0;
    this.firstGain = this.foodSac = this.merryUsed = false;
    this.bella = 0;
  }

  override upkeep(): void {
    // the saga's next chapter (really after the draw step; close enough)
    for (const p of this.bf.filter((q) => q.cd.name === SAGA)) {
      p.counters += 1;
      if (p.counters === 2) {
        this.draw(1);
        this.makeTokens([FOOD]);
      } else if (p.counters >= 3) {
        this.makeTokens(new Array(this.foods().length).fill(TOK.halfling));
        this.sacrifice(p);
      }
    }
  }

  override develop(main2 = false): boolean {
    this.phase = main2 ? 'main2' : 'main1';
    return super.develop(main2);
  }

  override endStep(): void {
    this.phase = 'end';
    const g = () => this.gained;
    for (const p of this.bf.slice())
      if (p.cd.name === 'Gwaihir, Greatest of the Eagles' && g() >= 3)
        this.makeTokens([TOK.bird]);
    if (this.onBf(GOLLUM) && g() > 0)
      for (let i = 0; i < this.life.length; i++)
        if (this.gollumHit[i] && this.oppAlive(i)) this.hurtOpp(i, g());
    for (const p of this.bf.slice()) {
      const n = p.cd.name;
      if (n === 'The Gaffer' && g() >= 3) this.draw(1);
      else if (n === 'Tippy-Toe, Terrific Partner' && g() > 0) this.draw(1);
      else if (n === 'Elanor Gardner' && this.foodSac) this.putBasic();
    }
    this.checkKill();
  }

  // ================================================================ combat
  override combat(): void {
    this.phase = 'combat';
    if (this.onBf(SAM)) this.makeTokens([FOOD]); // Sam: at the beginning of combat on your turn
    if (this.checkKill() === 2) return;
    if (this.inArena()) {
      this.podCombat();
      return;
    }
    if (this.allIn()) return;
    const frodo = this.perm(FRODO),
      gollum = this.perm(GOLLUM);
    const ready = (p: Perm | null) => p !== null && !p.sick && !p.tapped;
    // Frodo wants 3 life gained this turn before attacking: crack a Food (cheaper with Sam)
    if (ready(frodo) && this.gained < 3) this.eatFoodsFor(3 - this.gained);
    const att: Perm[] = [];
    if (ready(frodo) && (this.gained >= 3 || this.ringTempts >= 1))
      att.push(frodo!);
    if (ready(gollum)) att.push(gollum!);
    if (!att.length) return;
    this.attacked = true;
    for (const p of att) if (p !== frodo) p.tapped = true; // Frodo has vigilance
    if (att.some((p) => isHalfling(p.cd)))
      for (const _ of this.bf.filter(
        (q) => q.cd.name === 'Meriadoc Brandybuck',
      ))
        this.makeTokens([FOOD]);
    let damaged = false;
    if (att.includes(frodo!)) {
      // the Ring's second ability (draw, then discard) only if it was already there when Frodo attacked
      const loot = this.ringTempts >= 2;
      if (this.gained >= 3) {
        this.ringTempts++;
        this.say(`the Ring tempts you (${this.ringTempts})`);
        if (this.ringTempts >= 2) this.draw(1); // Frodo: then if the Ring has tempted you twice, draw
      }
      if (loot) {
        this.draw(1);
        this.discard(1);
      }
      const t = this.targetOpp();
      if (t !== null) {
        this.hurtOpp(t, this.power(frodo!));
        damaged = true;
        if (this.ringTempts >= 4) this.drainEach(3);
      }
    }
    if (att.includes(gollum!)) {
      // skulk: it connects. Hit an opponent Gollum hasn't hit yet
      let t: number | null = null;
      for (let i = 0; i < this.life.length; i++)
        if (
          this.oppAlive(i) &&
          !this.gollumHit[i] &&
          (t === null || this.life[i] > this.life[t])
        )
          t = i;
      if (t === null) t = this.targetOpp();
      if (t !== null) {
        this.hurtOpp(t, this.power(gollum!));
        this.gollumHit[t] = true;
        damaged = true;
      }
    }
    if (damaged)
      for (const _ of this.bf.filter((q) => q.cd.name === 'Rapacious Guest'))
        this.makeTokens([FOOD]);
    this.say(
      `attack with ${att.map((p) => p.cd.name.split(',')[0]).join(' + ')}: opp life [${this.life.join(', ')}]`,
    );
    this.checkKill();
  }

  /** How close to winning the others think we are: the Ring's tempts, Sam and Frodo out, a pile of Food. */
  override podClose(): number {
    let c = Math.min(0.5, this.ringTempts * 0.15);
    if (this.onBf(SAM)) c += 0.2;
    if (this.onBf(FRODO)) c += 0.2;
    if (this.foods().length >= 4) c += 0.1;
    return Math.min(1, c);
  }
  /** Skulk (Gollum) and the Ring-bearer (Frodo, once the Ring has tempted us): creatures with greater power can't block them. */
  override evasion(p: Perm): Evasion {
    if (p.cd.name === GOLLUM || (p.cd.name === FRODO && this.ringTempts >= 1))
      return 'skulk';
    return super.evasion(p);
  }

  /** Combat in a pod: Frodo and Gollum each pick an opponent whose blockers can't stop them; the rest of the team
   *  attacks by the shared rule (engine arenaCombat). Pippin's all-in pump isn't used in a pod yet. */
  podCombat(): void {
    const frodo = this.perm(FRODO),
      gollum = this.perm(GOLLUM);
    const ready = (p: Perm | null) => p !== null && !p.sick && !p.tapped;
    if (ready(frodo) && this.gained < 3) this.eatFoodsFor(3 - this.gained);
    const fs =
      ready(frodo) && (this.gained >= 3 || this.ringTempts >= 1)
        ? this.pickDefender([frodo!])
        : null;
    let damaged = false;
    const who: string[] = [];
    if (fs) {
      this.attacked = true;
      who.push('Frodo');
      for (const _ of this.bf.filter(
        (q) => q.cd.name === 'Meriadoc Brandybuck',
      ))
        this.makeTokens([FOOD]);
      const loot = this.ringTempts >= 2;
      if (this.gained >= 3) {
        this.ringTempts++;
        this.say(`the Ring tempts you (${this.ringTempts})`);
        if (this.ringTempts >= 2) this.draw(1);
      }
      if (loot) {
        this.draw(1);
        this.discard(1);
      }
      if (this.strike(fs.slot, [frodo!]).dmg > 0) {
        damaged = true;
        if (this.ringTempts >= 4) this.drainEach(3);
      }
    }
    // Gollum: an opponent it hasn't hit yet first
    const gs =
      ready(gollum) && this.bf.includes(gollum!)
        ? this.pickDefender([gollum!], (s) => (this.gollumHit[s] ? 0 : 50))
        : null;
    if (gs) {
      this.attacked = true;
      who.push('Gollum');
      gollum!.tapped = true;
      if (!fs && isHalfling(gollum!.cd))
        for (const _ of this.bf.filter(
          (q) => q.cd.name === 'Meriadoc Brandybuck',
        ))
          this.makeTokens([FOOD]);
      if (this.strike(gs.slot, [gollum!]).dmg > 0) {
        this.gollumHit[gs.slot] = true;
        damaged = true;
      }
    }
    if (damaged)
      for (const _ of this.bf.filter((q) => q.cd.name === 'Rapacious Guest'))
        this.makeTokens([FOOD]);
    if (who.length)
      this.say(
        `attack with ${who.join(' + ')}: opp life [${this.life.join(', ')}]`,
      );
    // Pippin: sacrifice four Foods, the other creatures get +3/+3 and haste: only for an attack that kills a player
    const pip = this.perm('Pippin, Warden of Isengard');
    if (pip && !pip.tapped && !pip.sick && this.foods().length >= 4) {
      const went = new Set<Perm>([
        ...(fs ? [frodo!] : []),
        ...(gs ? [gollum!] : []),
      ]);
      const team = this.creatures().filter(
        (p) => !p.tapped && p !== pip && !went.has(p),
      );
      const pw = (p: Perm) => this.power(p) + 3,
        tg = (p: Perm) => this.toughness(p) + 3;
      for (let i = 0; i < this.life.length && team.length; i++) {
        if (!this.oppAlive(i)) continue;
        const pl = this.planAttack(i, team, pw, tg);
        if (pl.score < 1000) continue;
        pip.tapped = true;
        for (const f of this.foods().slice(0, 4)) this.sacrifice(f);
        for (const p of pl.att) p.tapped = true;
        this.attacked = true;
        const r = this.strike(i, pl.att, pw, tg);
        this.say(
          `Pippin: +3/+3 and haste, attack opponent ${i + 1} with ${pl.att.length} creature(s): ${r.dmg} damage`,
        );
        break;
      }
    }
    const rest = this.creatures().filter(
      (p) => this.canAttack(p) && p !== frodo && p !== gollum,
    );
    if (rest.length) this.arenaCombat(rest);
    this.checkKill();
  }

  /** Eat Foods (gain 3 each) until we've gained `need` more life, if we can pay. */
  eatFoodsFor(need: number): void {
    while (need > 0) {
      const f = this.foods()[0];
      if (!f || !this.eatFood(f)) return;
      need -= 3;
    }
  }
  eatFood(f: Perm): boolean {
    if (!this.pay(new Cost(this.onBf(SAM) ? 1 : 2))) return false;
    this.say('eat a Food');
    this.sacrifice(f);
    this.gainLife(3);
    return true;
  }

  /** Attack with everything if that kills the whole table (Pippin's +3/+3 and haste if needed).
   *  Opponents block half the ground attackers (rounded down), the biggest; flyers connect. */
  allIn(): boolean {
    if (!this.cfg.all_in) return false;
    const deal = (pump: boolean): [Perm[], number] => {
      const pip = this.perm('Pippin, Warden of Isengard');
      const att = this.creatures().filter(
        (p) =>
          !p.tapped &&
          p !== (pump ? pip : null) &&
          (pump || !p.sick || p.cd.haste) &&
          this.power(p) + (pump ? 3 : 0) > 0,
      );
      const pw = (p: Perm) => this.power(p) + (pump ? 3 : 0);
      const fly = att.filter((p) => p.cd.flying),
        ground = att.filter((p) => !p.cd.flying).sort((a, b) => pw(b) - pw(a));
      const g = ground.slice(Math.floor(ground.length / 2));
      return [att, [...fly, ...g].reduce((s, p) => s + pw(p), 0)];
    };
    let [att, dmg] = deal(false);
    let pump = false;
    if (!this.winsWith(dmg)) {
      const pip = this.perm('Pippin, Warden of Isengard');
      if (!pip || pip.tapped || pip.sick || this.foods().length < 4)
        return false;
      [att, dmg] = deal(true);
      if (!this.winsWith(dmg)) return false;
      pump = true;
      pip.tapped = true;
      for (const f of this.foods().slice(0, 4)) this.sacrifice(f);
      this.say('Pippin: other creatures get +3/+3 and haste');
    }
    this.attacked = true;
    for (const p of att) p.tapped = true;
    let left = dmg;
    while (left > 0) {
      const t = this.focusOpp();
      if (t === null) break;
      const hit = Math.min(left, this.life[t]);
      this.hurtOpp(t, hit);
      left -= hit;
    }
    this.allInWin = this.won();
    this.say(
      `all-in attack${pump ? ' (Pippin)' : ''}: ${dmg} damage, opp life [${this.life.join(', ')}]`,
    );
    this.checkKill();
    return true;
  }

  // ================================================================ what to do
  candidates(main2: boolean): Cand[] {
    this.sacMemo = new Map();
    this.msMemo = super.manaSources();
    try {
      return this.candidatesRaw(main2);
    } finally {
      this.sacMemo = null;
      this.msMemo = null;
    }
  }

  candidatesRaw(main2: boolean): Cand[] {
    const out: Cand[] = [];
    const add = (
      score: number,
      cost: Cost,
      isIS: boolean,
      act: () => boolean,
      rock?: CardDef,
    ) => out.push({ score, cost, isIS, act, rock });
    const early = this.manaSources() < 6;
    const bond = this.onBf('Sanguine Bond');
    // commanders
    for (const cd of this.command.slice())
      add(
        cd.name === SAM ? 90 : 86,
        this.commanderCost(cd, this.effCost(cd)),
        false,
        () => this.castPerm(cd, true),
      );
    const guest = this.perm('Rapacious Guest');
    if (
      guest &&
      main2 &&
      this.cfg.own_removal &&
      this.power(guest) >= (this.cfg.own_removal_power as number)
    ) {
      const rm = OWN_KILL.map((n) => this.hand.find((c) => c.name === n)).find(
        (c) => c !== undefined,
      );
      if (rm)
        add(
          Math.min(97, 50 + 4 * this.power(guest)),
          this.effCost(rm),
          true,
          () => this.castIS(rm),
        );
    }
    const seen = new Set<string>();
    for (const cd of this.hand.slice()) {
      if (seen.has(cd.name) || cd.land !== null || HOLD.has(cd.name)) continue;
      seen.add(cd.name);
      const n = cd.name;
      let sc = this.value(cd);
      if (RAMP_EARLY.has(n)) sc = early ? 85 : 25;
      if (n === 'Sol Ring') {
        add(100, this.effCost(cd), false, () => this.castPerm(cd), cd);
        continue;
      }
      if (n === 'Arcane Signet' && early) {
        add(88, this.effCost(cd), false, () => this.castPerm(cd), cd);
        continue;
      }
      if (n === 'Cultivate' || n === 'Farseek') {
        if (this.library.some((c) => c.land?.basic))
          add(sc, this.effCost(cd), false, () => this.castIS(cd));
        continue;
      }
      if (n === "Night's Whisper") {
        if (this.myLife > 8)
          add(52, this.effCost(cd), false, () => this.castIS(cd));
        continue;
      }
      if (n === 'Harmonize') {
        add(58, this.effCost(cd), false, () => this.castIS(cd));
        continue;
      }
      if (n === 'Farmer Cotton') {
        const base = cd.cost;
        let x = 0;
        while (x < 12 && this.canPay(base.withGeneric(x + 1))) x++;
        if (x >= (this.cfg.cotton_min_x as number))
          add(Math.min(95, 35 + 9 * x), base.withGeneric(x), false, () =>
            this.farmerCotton(cd, x),
          );
        continue;
      }
      if (n === 'Second Harvest') {
        const toks = this.bf.filter((p) => p.token).length;
        if (toks >= 4)
          add(Math.min(96, 30 + 6 * toks), this.effCost(cd), true, () =>
            this.castIS(cd),
          );
        continue;
      }
      if (n === 'Crypt Incursion') {
        const k = this.gy.filter((c) => c.isCreature).length;
        const familiarLoop =
          this.gy.some((c) => c.name === 'Cauldron Familiar') &&
          this.onBf("Witch's Oven");
        if (k >= 2 && !familiarLoop)
          add(bond ? 30 + 8 * k : 10 + 3 * k, this.effCost(cd), true, () =>
            this.castIS(cd),
          );
        continue;
      }
      if (n === 'Sanguine Bond') sc = 88;
      if (n === 'Cauldron Familiar' && this.onBf("Witch's Oven")) sc = 80;
      if (
        n === "Witch's Oven" &&
        (this.hand.some((c) => c.name === 'Cauldron Familiar') ||
          this.onBf('Cauldron Familiar'))
      )
        sc = Math.max(sc, 75);
      add(sc, this.effCost(cd), false, () => this.castPerm(cd));
    }
    // abilities
    const spare = this.spareFodder();
    const foodCost = new Cost(this.onBf(SAM) ? 1 : 2);
    const familiar = this.gy.find((c) => c.name === 'Cauldron Familiar');
    if (familiar && this.foods().length)
      add(74, new Cost(), false, () => this.returnFamiliar(familiar));
    for (const p of this.bf) {
      const n = p.cd.name;
      const ready = !p.tapped && !(p.isCreature && p.sick);
      if (n === "Witch's Oven" && !p.tapped) {
        const fam = this.perm('Cauldron Familiar');
        const victim = fam ?? spare.find((q) => q.isCreature) ?? null;
        if (victim)
          add(
            fam ? 76 : 40 + 4 * this.sacValue(victim),
            new Cost(),
            false,
            () => this.oven(p, victim),
          );
      } else if (n === 'Umbral Collar Zealot' && main2) {
        const f = spare.find((q) => q !== p && this.sacValue(q) >= 3);
        if (f)
          add(45 + 3 * this.sacValue(f), new Cost(), false, () => {
            this.sacrifice(f);
            this.scry(1, true);
            return true;
          });
      } else if (n === 'Lobelia, Defender of Bag End' && ready) {
        const a = this.artifactFodder();
        if (a) add(82, new Cost(), false, () => this.lobelia(p, a));
      } else if (n === 'Trading Post' && ready) {
        const a = this.artifactFodder();
        const dead = this.hand.find((c) => HOLD.has(c.name));
        if (a && main2)
          add(48, new Cost(1), false, () =>
            this.tradingPost(p, () => {
              this.sacrifice(a);
              this.draw(1);
            }),
          );
        else if (dead && (bond || this.onBf(GOLLUM)))
          add(46, new Cost(1), false, () =>
            this.tradingPost(p, () => {
              removeIfPresent(this.hand, dead);
              this.gy.push(dead);
              this.gainLife(4);
            }),
          );
        else if (main2 && this.myLife > 15)
          add(26, new Cost(1), false, () =>
            this.tradingPost(p, () => {
              this.loseLife(1);
              this.makeTokens([TOK.goat]);
            }),
          );
      } else if (
        n === 'Savvy Hunter' &&
        main2 &&
        spare.filter((q) => q.cd === FOOD).length >= 2
      )
        add(36, new Cost(), false, () => this.sacFoodsDraw(2));
      else if (
        n === 'Peregrin Took' &&
        main2 &&
        spare.filter((q) => q.cd === FOOD).length >= 3
      )
        add(32, new Cost(), false, () => this.sacFoodsDraw(3));
      else if (n === 'Pippin, Warden of Isengard' && ready && main2)
        add(30, new Cost(1), false, () =>
          this.tapFor(p, new Cost(1), () => this.makeTokens([FOOD])),
        );
      else if (n === 'Nuka-Cola Vending Machine' && !p.tapped && main2)
        add(33, new Cost(1), false, () =>
          this.tapFor(p, new Cost(1), () => this.makeTokens([FOOD])),
        );
      else if (n === 'Gilded Goose' && ready && main2)
        add(20, Cost.parse('{1}{G}'), false, () =>
          this.tapFor(p, Cost.parse('{1}{G}'), () => this.makeTokens([FOOD])),
        );
      else if (n === 'Dawn of Hope' && main2)
        add(28, Cost.parse('{3}{W}'), false, () =>
          this.activate(Cost.parse('{3}{W}'), () =>
            this.makeTokens([TOK.soldier]),
          ),
        );
      else if (
        n === 'Shire Terrace' &&
        !p.tapped &&
        this.library.some((c) => c.land?.basic)
      )
        add(40, new Cost(1), false, () => this.shireTerrace(p));
    }
    // crack a Clue (one candidate, whichever Clue)
    const clue = this.bf.find((q) => q.cd === CLUE);
    if (clue && main2)
      add(38, new Cost(2), false, () =>
        this.activate(new Cost(2), () => {
          this.sacrifice(clue);
          this.draw(1);
        }),
      );
    // eat a Food: 3 life (drains with Sanguine Bond, feeds Gollum / Frodo / The Gaffer / Gwaihir)
    const food = spare.find((q) => q.cd === FOOD);
    if (food && main2) {
      const v = this.lifeGainValue(3);
      if (v > 0)
        add(Math.min(70, 20 + v), foodCost, false, () => this.eatFood(food));
    }
    return out;
  }

  /** What gaining n more life this turn is worth (0 = nothing on the battlefield cares). */
  lifeGainValue(n: number): number {
    let v = 0;
    const after = this.gained + n;
    for (const p of this.bf) {
      const c = p.cd.name;
      if (c === 'Sanguine Bond') v += 10 * n;
      else if (c === GOLLUM)
        v +=
          10 *
          n *
          this.gollumHit.filter((x, i) => x && this.oppAlive(i)).length;
      else if (
        (c === 'The Gaffer' || c === 'Gwaihir, Greatest of the Eagles') &&
        this.gained < 3 &&
        after >= 3
      )
        v += 25;
      else if (c === 'Tippy-Toe, Terrific Partner' && this.gained === 0)
        v += 20;
      else if (c === 'Cat Collector' && !this.firstGain) v += 12;
      else if (c === 'Dawn of Hope' || c === 'Well of Lost Dreams') v += 10;
    }
    return v;
  }

  activate(cost: Cost, f: () => void): boolean {
    if (!this.pay(cost)) return false;
    f();
    return true;
  }
  tapFor(p: Perm, cost: Cost, f: () => void): boolean {
    if (!this.pay(cost)) return false;
    p.tapped = true;
    f();
    return true;
  }

  /** An artifact to sacrifice for value: a Clue, a spare Food or Treasure. */
  artifactFodder(): Perm | null {
    return this.spareFodder().find((q) => q.cd.types.has('artifact')) ?? null;
  }

  farmerCotton(cd: CardDef, x: number): boolean {
    if (!this.pay(cd.cost.withGeneric(x))) return false;
    removeIfPresent(this.hand, cd);
    this.spellsCast += 1;
    this.say(`cast Farmer Cotton (X=${x})`);
    this.castX = x;
    this.enter(cd);
    this.castX = 0;
    return true;
  }
  returnFamiliar(cd: CardDef): boolean {
    const f = this.foods()[0];
    if (!f || !this.gy.includes(cd)) return false;
    this.sacrifice(f);
    removeIfPresent(this.gy, cd);
    this.say('Cauldron Familiar returns');
    this.enter(cd, 'graveyard');
    return true;
  }
  oven(p: Perm, victim: Perm): boolean {
    if (!this.bf.includes(victim)) return false;
    p.tapped = true;
    const big = this.toughness(victim) >= 4;
    this.say("Witch's Oven eats", victim.cd);
    this.sacrifice(victim);
    this.makeTokens(big ? [FOOD, FOOD] : [FOOD]);
    return true;
  }
  lobelia(p: Perm, a: Perm): boolean {
    p.tapped = true;
    this.say('Lobelia: sacrifice', a.cd, '-> drain 2');
    this.sacrifice(a);
    this.drainEach(2);
    this.gainLife(2);
    return true;
  }
  tradingPost(p: Perm, f: () => void): boolean {
    if (!this.pay(new Cost(1))) return false;
    p.tapped = true;
    f();
    return true;
  }
  sacFoodsDraw(k: number): boolean {
    const fs = this.spareFodder()
      .filter((q) => q.cd === FOOD)
      .slice(0, k);
    if (fs.length < k) return false;
    for (const f of fs) this.sacrifice(f);
    this.draw(1);
    return true;
  }
  shireTerrace(p: Perm): boolean {
    if (!this.pay(new Cost(1))) return false;
    this.sacrifice(p);
    return this.putBasic();
  }

  // ================================================================ spells
  override resolve(
    cd: CardDef,
    fromGy = false,
    mode: string | null = null,
  ): void {
    const n = cd.name;
    if (n === "Night's Whisper") {
      this.draw(2);
      this.loseLife(2);
    } else if (n === 'Harmonize') this.draw(3);
    else if (n === 'Cultivate') {
      this.putBasic();
      this.putBasic(true);
    } else if (n === 'Farseek') this.putBasic(false, ['Plains', 'Swamp']);
    else if (n === 'Second Harvest')
      this.makeTokens(this.bf.filter((p) => p.token).map((p) => p.cd));
    else if (n === 'Crypt Incursion') {
      const cs = this.gy.filter((c) => c.isCreature);
      this.gy = this.gy.filter((c) => !c.isCreature);
      this.exile.push(...cs);
      this.gainLife(3 * cs.length);
    } else if (OWN_KILL.includes(n)) {
      const t = this.perm('Rapacious Guest');
      if (!t) return;
      const pw = this.power(t);
      this.say(`${n} on our own Rapacious Guest (power ${pw})`);
      if (OWN_KILL_EXILES.has(n)) {
        removeIfPresent(this.bf, t);
        this.exile.push(t.cd);
        this.pingOne(pw); // leaves the battlefield: target opponent loses its power
        if (n === 'Swords to Plowshares') this.gainLife(pw);
        else if (n === 'Path to Exile') this.putBasic();
        else this.loseLife(3);
      } else this.dies(t); // destroyed: onDies drains its power (and the death triggers)
    } else super.resolve(cd, fromGy, mode);
  }

  // ================================================================ the planner's score
  override positionValue(): number {
    if (this.died) return -5000;
    this.msMemo = super.manaSources();
    try {
      return this.positionValueRaw();
    } finally {
      this.msMemo = null;
    }
  }

  positionValueRaw(): number {
    let v = 0;
    const start = this.cfg.opp_life as number;
    for (const l of this.life)
      v += 4 * (start - Math.max(0, l)) + (l <= 0 ? 40 : 0);
    for (const p of this.bf) {
      if (p.land !== null) continue;
      if (p.cd === FOOD) v += 9;
      else if (p.cd === TREASURE) v += 8;
      else if (p.cd === CLUE) v += 7;
      else if (p.token) v += 6 + 2 * this.power(p);
      else v += 0.8 * this.value(p.cd) + 2 * p.counters;
    }
    v += 22 * Math.min(10, this.manaSources());
    v += 0.4 * this.hand.reduce((s, c) => s + this.cardValue(c), 0);
    v +=
      12 * Math.min(4, this.ringTempts) +
      8 * this.gollumHit.filter((x) => x).length;
    v += this.myLife < 15 ? -10 * (15 - this.myLife) : 0;
    return v;
  }
}

const BASIC_COL: Record<string, string> = {
  Plains: 'W',
  Swamp: 'B',
  Forest: 'G',
  Island: 'U',
  Mountain: 'R',
};
