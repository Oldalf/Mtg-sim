/**
 * The Meren of Clan Nel Toth deck's AI (Golgari reanimator): the rules of its cards, what it wants to
 * do each turn, Meren's end-step loop, and the goldfish combat rules agreed for this deck (see PLAN.md).
 *
 * Win: 2 opponents dead, or cfg.win_damage damage dealt in total. Second measure: first opponent dead.
 * The game itself (mana, zones, casting, turns, combat) is the shared engine in engine/game.ts.
 */
import * as C from '../../engine/cards';
import { Cost, CardDef, makeToken } from '../../engine/cards';
import { Game, GameWithoutKillSearch } from '../../engine/game';
import { Cand, Perm, Zone } from '../../engine/game-types';
import {
  firstMax,
  firstMin,
  sortDesc,
  removeIfPresent,
} from '../../engine/lists';
import { MulliganRule } from '../../engine/mulligan';
import { MULLIGAN } from './mulligan';
import { SHRIEKMAW } from '../../engine/answers';

export const MEREN = 'Meren of Clan Nel Toth';
export const GRAY_MERCHANT = 'Gray Merchant of Asphodel';

const TOKENS = {
  goat: makeToken('Goat', 0, 1, 'white'),
  zombie: makeToken('Zombie', 2, 2, 'black'),
  insect: makeToken('Insect', 1, 1, 'black green'),
  warrior: makeToken('Warrior', 1, 1, 'red'),
  beast: makeToken('Beast', 3, 3, 'green'),
  snake: makeToken('Snake', 1, 1, 'black'),
  // a creature taken from an opponent's graveyard (Breach, Puppeteer Clique, Sepulchral Primordial)
  stolen: makeToken('Stolen creature', 5, 5),
};

/** How much we want a creature on the battlefield (Meren's target, tutors, reanimation). */
const VALUE: Record<string, number> = {
  [GRAY_MERCHANT]: 100,
  'Sepulchral Primordial': 95,
  'Grave Titan': 90,
  'Twilight Diviner': 88,
  'Rune-Scarred Demon': 85,
  'Junji, the Midnight Sky': 80,
  'Puppeteer Clique': 78,
  'Morbid Opportunist': 72,
  'Protean Hulk': 70,
  'Viscera Seer': 70,
  'Vindictive Lich': 68,
  'Solemn Simulacrum': 66,
  'Priest of Forgotten Gods': 66,
  'Grim Haruspex': 65,
  'Eternal Witness': 64,
  'Avenger of the Fallen': 64,
  'Umbral Collar Zealot': 62,
  'Timeless Witness': 62,
  'Woe Strider': 60,
  'Simulacrum Shaper': 60,
  'Grim Servant': 60,
  'Fauna Shaman': 60,
  'Liliana the Repentant': 60,
  'Grist, the Hunger Tide': 60,
  'Vile Entomber': 58,
  'Butcher of Malakir': 55,
  'Wight of the Reliquary': 55,
  'Disciple of Bolas': 50,
  'Satyr Wayfinder': 50,
  "Garruk's Packleader": 50,
  Shriekmaw: 50,
  'Spore Frog': 50,
  'Grave Researcher': 50,
  Plaguecrafter: 45,
  "Demon's Disciple": 45,
  'Accursed Marauder': 45,
  'Sakura-Tribe Elder': 45,
  'Llanowar Elves': 40,
  'Studious First-Year': 35,
  'Insidious Fungus': 35,
  'Elvish Mystic': 40,
  'Fyndhorn Elves': 40,
  'Carrion Feeder': 40,
  "Stitcher's Supplier": 40,
  'Zulaport Cutthroat': 45,
  'Wood Elves': 42,
  'Sylvan Caryatid': 40,
  'Skull Prophet': 42,
  Ophiomancer: 45,
  'Reassembling Skeleton': 35,
  Gravedigger: 48,
  'Fleshbag Marauder': 40,
};
const MANA_ELVES = new Set([
  'Llanowar Elves',
  'Elvish Mystic',
  'Fyndhorn Elves',
  'Sylvan Caryatid',
  'Skull Prophet',
]);
/** Creatures whose death is worth something (we like sacrificing them; Meren brings them back). */
const DEATH_VALUE = new Set([
  'Solemn Simulacrum',
  'Simulacrum Shaper',
  'Vindictive Lich',
  'Junji, the Midnight Sky',
  'Protean Hulk',
  'Puppeteer Clique',
  'Sakura-Tribe Elder',
  'Spore Frog',
  'Reassembling Skeleton',
]);
/** Sacrifice a creature for free (Viscera Seer: any creature; the others: another creature). */
const FREE_OUTLETS = [
  'Viscera Seer',
  'Umbral Collar Zealot',
  'Woe Strider',
  'Carrion Feeder',
];
/** Edicts: each player sacrifices a creature; we lose our worst one (opponents have none in a goldfish). */
const EDICT_ETB = new Set([
  'Plaguecrafter',
  "Demon's Disciple",
  'Accursed Marauder',
  'Fleshbag Marauder',
]);
const LAND_ETB = new Set([
  'Simulacrum Shaper',
  'Solemn Simulacrum',
  'Wood Elves',
]);
const DRAW_ON_DEATH = new Set(['Simulacrum Shaper', 'Solemn Simulacrum']);
const HOLD = new Set(['Heartless Act', 'Infernal Grasp']); // removal: no targets in a goldfish game

// every card this file has rules for (the rest of the list is lands and engine card facts)
C.registerKnown([
  ...Object.keys(VALUE),
  'Wood Elves',
  'Elvish Mystic',
  'Fyndhorn Elves',
  MEREN,
  'Lotleth Giant',
  'Accursed Marauder',
  'Avenger of the Fallen',
  'Beast Within',
  'Breach the Multiverse',
  'Buried Alive',
  'Deadly Brew',
  'Decode Transmissions',
  "Dina's Guidance",
  'Eldritch Evolution',
  'Grisly Salvage',
  'Heartless Act',
  'Infernal Grasp',
  'Persist',
  'Phyrexian Arena',
  'Saw in Half',
  'Songs of the Damned',
  'Unearth',
  'Vampiric Rites',
  'Victimize',
  'Village Rites',
]);

export class MerenGame extends GameWithoutKillSearch {
  override mulliganRule(): MulliganRule | null {
    return this.cfg.smart_mulligan ? MULLIGAN : null;
  }
  override colors = ['B', 'G'];
  exp = 0; // Meren's experience counters
  merenCasts = 0;
  // ---- measures for --diag (they change nothing in the game)
  merenOut: number | null = null; // the turn Meren first entered the battlefield
  permsEnd: number[] = []; // nonland permanents (tokens too) at the end of turns 4-6
  reanimated = 0; // creature cards that came back from a graveyard to the battlefield (Meren, Unearth, Reanimate...)
  reanimEnd: number[] = []; // ... at the end of turns 4-6
  expEnd: number[] = []; // Meren's experience at the end of turns 4-6
  override diag(): Record<string, number | null> {
    return {
      merenOut: this.merenOut,
      spent5: this.spentEnd[5] ?? null,
      spent6: this.spentEnd[6] ?? null,
      perms5: this.permsEnd[5] ?? null,
      perms6: this.permsEnd[6] ?? null,
      reanim5: this.reanimEnd[5] ?? null,
      reanim6: this.reanimEnd[6] ?? null,
      exp5: this.expEnd[5] ?? null,
      exp6: this.expEnd[6] ?? null,
    };
  }
  morbidUsed = false; // Morbid Opportunist: once each turn
  divinerUsed = false; // Twilight Diviner: once each turn
  leftThisTurn = false; // a nonland permanent left the battlefield this turn (Decode Transmissions' void)
  prepared = new Set<Perm>(); // Studious First-Year / Grave Researcher can cast their spell copy
  liliExhausted = false;
  gristUsed = false; // Grist: one loyalty ability per turn
  exileAtEnd: Perm[] = []; // Puppeteer Clique's stolen creature
  sacAtEnd: Perm[] = []; // Mobilize warriors

  // ================================================================ the win condition
  won(): boolean {
    let dead = 0;
    for (let i = 0; i < this.life.length; i++) if (this.life[i] <= 0) dead++;
    return (
      dead >= (this.cfg.win_dead as number) ||
      this.damageDealt >= (this.cfg.win_damage as number)
    );
  }

  override oppsBeaten(): boolean {
    return this.won();
  }

  override winsWith(dmg: number): boolean {
    const life = this.life.slice();
    let left = dmg,
      dealt = this.damageDealt;
    while (left > 0) {
      let t = -1;
      for (let i = 0; i < life.length; i++)
        if (life[i] > 0 && (t < 0 || life[i] < life[t])) t = i;
      if (t < 0) break;
      const hit = Math.min(left, life[t]);
      life[t] -= hit;
      dealt += hit;
      left -= hit;
    }
    return (
      life.filter((x) => x <= 0).length >= (this.cfg.win_dead as number) ||
      dealt >= (this.cfg.win_damage as number)
    );
  }

  override checkKill(): number {
    if (this.died) return 2; // the game is over (lost)
    if (this.won()) {
      if (this.unprot === null) {
        this.unprot = this.turn;
        this.say(
          `WIN: opp life [${this.life.join(', ')}], ${this.damageDealt} damage dealt`,
        );
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
    this.exp = board.trackers['Start Your Engines!'] ?? 0;
  }

  override logToken(name: string): CardDef | null {
    const n = name.toLowerCase();
    if (n.includes('demon') || n.includes('stolen')) return TOKENS.stolen; // Pontus plays stolen creatures as 5/5 Demons
    if (n.includes('insect')) return TOKENS.insect;
    if (n.includes('zombie')) return TOKENS.zombie;
    if (n.includes('goat')) return TOKENS.goat;
    if (n.includes('warrior')) return TOKENS.warrior;
    if (n.includes('beast')) return TOKENS.beast;
    return null;
  }

  /** Copies also need Meren's own references to permanents pointing at the copied permanents. */
  override clone(): this {
    const g = super.clone();
    const map = new Map(this.bf.map((p, i) => [p, g.bf[i]] as [Perm, Perm]));
    const m = (p: Perm) => map.get(p) ?? p;
    g.prepared = new Set([...this.prepared].map(m));
    g.exileAtEnd = this.exileAtEnd.map(m);
    g.sacAtEnd = this.sacAtEnd.map(m);
    return g;
  }

  /** The planner's score for a position with no win yet (higher is better). */
  override positionValue(): number {
    if (this.died) return -5000;
    let v = 0;
    // progress to the win: total damage, and the two opponents closest to dead
    v += 5 * Math.min(this.cfg.win_damage as number, this.damageDealt);
    const lives = this.life.slice().sort((a, b) => a - b);
    const start = this.cfg.opp_life as number;
    for (let i = 0; i < (this.cfg.win_dead as number); i++)
      v += 3 * (start - Math.max(0, lives[i]));
    // the board: attackers, Gray Merchant's devotion, Meren and her experience
    for (const p of this.creatures()) {
      if (p.cd.name === 'Spore Frog') v += 25;
      else
        v +=
          7 * this.power(p) * (p.cd.flying ? 1.5 : 1) + 0.25 * this.value(p.cd);
    }
    v += 10 * Math.min(12, this.devotion('B'));
    if (this.onBf(MEREN)) v += 90 + 12 * Math.min(8, this.exp);
    else v += 6 * Math.min(8, this.exp);
    for (const p of this.bf)
      if (p.land === null && !p.isCreature) v += 0.4 * this.value(p.cd);
    // resources: creature cards to bring back, mana, cards in hand
    v += 6 * Math.min(10, this.gyCreatures());
    v += 25 * Math.min(10, this.manaSources());
    v += 0.4 * this.hand.reduce((s, c) => s + this.cardValue(c), 0);
    // our life after the crackback that's coming
    const life = this.myLife - (this.fogUsed ? 0 : this.pendingCrackback);
    v +=
      life <= 0
        ? -3000
        : life < 20
          ? -10 * (20 - life)
          : 0.5 * Math.min(60, life - 20);
    return v;
  }

  // ================================================================ card values
  value(cd: CardDef): number {
    if (cd.name === 'Lotleth Giant')
      return Math.min(95, 10 * this.gyCreatures());
    return VALUE[cd.name] ?? (cd.isCreature ? 40 : 30);
  }

  override cardValue(cd: CardDef): number {
    if (cd.land !== null) {
      const m = this.manaSources() + this.countLandsHand();
      return m <= 3 ? 80 : m <= 6 ? 60 : m <= 8 ? 40 : 15;
    }
    if (cd.isCreature) return this.value(cd);
    if (HOLD.has(cd.name)) return 20;
    return 45;
  }

  override discardValue(cd: CardDef): number {
    // creature cards in the graveyard are fine: Meren and reanimation get them back
    return this.cardValue(cd) - (cd.isCreature ? 25 : 0);
  }

  gyCreatures(): number {
    return this.gy.filter((c) => c.isCreature).length;
  }

  override srcKind(p: Perm, ignoreSick = false): string | null {
    return super.srcKind(p, ignoreSick);
  }

  override commanderCost(cd: CardDef, cost: Cost): Cost {
    return cd.name === MEREN
      ? cost.withGeneric(cost.g + 2 * this.merenCasts)
      : cost;
  }
  override onCommanderCast(cd: CardDef): void {
    if (cd.name === MEREN) this.merenCasts++;
  }

  // ================================================================ zones
  millSelf(n: number): void {
    for (let i = 0; i < n && this.library.length; i++)
      this.toGy(this.library.shift()!, true);
  }

  /** A basic land from the library onto the battlefield tapped. */
  fetchBasic(): void {
    const want =
      this.landsBf().filter((p) => p.land!.mana === 'G').length <=
      this.landsBf().filter((p) => p.land!.mana === 'B').length
        ? 'Forest'
        : 'Swamp';
    const c =
      this.library.find((x) => x.name === want) ??
      this.library.find((x) => x.land?.basic) ??
      null;
    if (!c) return;
    removeIfPresent(this.library, c);
    this.shuffle();
    const p = new Perm(c, c.land, true);
    p.sick = false;
    this.bf.push(p);
  }

  /** The best creature card in the graveyard for some purpose. */
  bestGyCreature(ok: (c: CardDef) => boolean = () => true): CardDef | null {
    const cs = this.gy.filter((c) => c.isCreature && ok(c));
    return cs.length ? firstMax(cs, (c) => this.value(c)) : null;
  }

  /** Put a creature card from our graveyard onto the battlefield. */
  reanimate(
    cd: CardDef,
    opts: { tapped?: boolean; counters?: number } = {},
  ): Perm {
    removeIfPresent(this.gy, cd);
    const p = this.enter(cd, 'graveyard', { tapped: opts.tapped });
    if (opts.counters) p.counters += opts.counters;
    this.say('  reanimate', cd);
    return p;
  }

  /** Our creatures in the order we'd sacrifice them (cheapest loss first). */
  fodder(exclude: Perm[] = []): Perm[] {
    const sacValue = (p: Perm): number => {
      if (p.cd === TOKENS.stolen) return 80;
      if (p.token) return 5 + this.power(p);
      if (DEATH_VALUE.has(p.cd.name) && this.onBf(MEREN)) return 10;
      if (MANA_ELVES.has(p.cd.name) && this.turn >= 5) return 15;
      if (
        EDICT_ETB.has(p.cd.name) ||
        p.cd.name === 'Satyr Wayfinder' ||
        p.cd.name === 'Studious First-Year'
      )
        return 20;
      return this.value(p.cd);
    };
    return sortDesc(
      this.creatures().filter(
        (p) =>
          !exclude.includes(p) &&
          p.cd.name !== MEREN &&
          p.cd.name !== 'Spore Frog' &&
          p.cd.name !== 'Twilight Diviner',
      ),
      (p) => -sacValue(p),
    );
  }

  freeOutlet(): Perm | null {
    for (const n of FREE_OUTLETS) {
      const p = this.perm(n);
      if (p) return p;
    }
    return null;
  }

  // ================================================================ triggers
  override onEnter(p: Perm, from: Zone): void {
    const n = p.cd.name;
    if (n === MEREN && this.merenOut === null) this.merenOut = this.turn;
    if (from === 'graveyard' && !p.token) this.reanimated++;
    if (p.cd.isCreature || n === 'Grist, the Hunger Tide') {
      // Liliana the Repentant: another creature or planeswalker enters -> mill two
      if (n !== 'Liliana the Repentant' && this.onBf('Liliana the Repentant'))
        this.millSelf(2);
      // Garruk's Packleader: another creature with power 3+ enters -> draw
      if (
        p.cd.isCreature &&
        n !== "Garruk's Packleader" &&
        this.onBf("Garruk's Packleader") &&
        this.power(p) >= 3
      )
        this.draw(1);
    }
    // Twilight Diviner: creatures entering from a graveyard -> a token copy of one of them (once a turn)
    if (
      from === 'graveyard' &&
      p.cd.isCreature &&
      n !== 'Twilight Diviner' &&
      !this.divinerUsed &&
      this.onBf('Twilight Diviner')
    ) {
      this.divinerUsed = true;
      this.say('  Twilight Diviner copies', p.cd);
      this.enter(p.cd, 'token', { token: true });
    }
    // enters-the-battlefield effects (token copies have them too)
    if (n === GRAY_MERCHANT) {
      const x = this.devotion('B');
      const t = this.drainEach(x);
      this.gainLife(t);
      this.say(
        `  Gray Merchant drains ${x} each (devotion ${x}), opp life [${this.life.join(', ')}]`,
      );
    } else if (n === 'Lotleth Giant') {
      const t = this.focusOpp();
      if (t !== null) this.hurtOpp(t, this.gyCreatures());
      this.say(
        `  Lotleth Giant deals ${this.gyCreatures()}, opp life [${this.life.join(', ')}]`,
      );
    } else if (n === 'Twilight Diviner') this.scry(2, true);
    else if (n === 'Disciple of Bolas') {
      const f = this.fodder([p])[0];
      if (f) {
        const x = this.power(f);
        this.sacrifice(f);
        this.gainLife(x);
        this.draw(x);
      }
    } else if (n === 'Satyr Wayfinder') {
      const top = this.library.splice(0, 4);
      const land = top.find((c) => c.land !== null);
      for (const c of top)
        if (c === land) this.hand.push(c);
        else this.toGy(c, true);
    } else if (LAND_ETB.has(n)) this.fetchBasic();
    else if (n === 'Eternal Witness' || n === 'Timeless Witness') {
      if (this.gy.length) {
        const c = firstMax(
          this.gy,
          (x) => this.cardValue(x) + (x.isCreature ? 0 : 10),
        );
        removeIfPresent(this.gy, c);
        this.hand.push(c);
      }
    } else if (n === 'Puppeteer Clique') {
      const s = this.enter(TOKENS.stolen, 'graveyard', { token: true });
      s.sick = false; // it gains haste
      this.exileAtEnd.push(s);
    } else if (n === 'Sepulchral Primordial') {
      for (let i = 0; i < this.oppsAlive(); i++)
        this.enter(TOKENS.stolen, 'graveyard', { token: true });
    } else if (n === 'Shriekmaw') {
      // a pod: destroy the biggest threat's best creature (nonartifact, nonblack isn't checked)
      if (this.inArena()) this.arena!.snipe(this, SHRIEKMAW);
    } else if (EDICT_ETB.has(n)) {
      if (this.inArena()) this.arena!.edict(this, n === 'Accursed Marauder'); // a pod: the opponents sacrifice too
      // each player sacrifices: we lose our worst creature (Accursed Marauder: a nontoken one)
      const pool = this.fodder().filter(
        (q) => n !== 'Accursed Marauder' || !q.token,
      );
      const f =
        pool[0] ??
        (n === 'Accursed Marauder' || n === 'Fleshbag Marauder' ? p : null);
      if (f) this.sacrifice(f);
    } else if (n === 'Gravedigger') {
      const c = this.bestGyCreature(() => true);
      if (c) {
        removeIfPresent(this.gy, c);
        this.hand.push(c);
      }
    } else if (n === "Stitcher's Supplier") this.millSelf(3);
    else if (n === 'Woe Strider') this.createTokens(TOKENS.goat);
    else if (n === 'Grave Titan') this.createTokens(TOKENS.zombie, 2);
    else if (n === 'Rune-Scarred Demon') this.doTutor(() => true, false);
    else if (n === 'Vile Entomber') this.tutorToGy(() => true);
    else if (n === 'Grim Servant') {
      const d = this.devotion('B');
      this.doTutor((c) => c.mv <= d, false);
      this.loseLife(3);
    } else if (n === 'Studious First-Year') this.prepared.add(p);
  }

  override onDies(p: Perm): void {
    const n = p.cd.name;
    if (!p.cd.land) this.leftThisTurn = true;
    if (p.cd.isCreature) {
      // a pod: Butcher of Malakir (it or another creature of ours dies: each opponent sacrifices a creature)
      if (
        this.inArena() &&
        (n === 'Butcher of Malakir' || this.onBf('Butcher of Malakir'))
      )
        this.arena!.edict(this, false);
      if (n !== MEREN && this.onBf(MEREN)) this.exp++;
      if (this.onBf('Morbid Opportunist') && !this.morbidUsed) {
        this.morbidUsed = true;
        this.draw(1);
      }
      if (!p.token && n !== 'Grim Haruspex' && this.onBf('Grim Haruspex'))
        this.draw(1);
    }
    this.prepared.delete(p);
    if (n === 'Zulaport Cutthroat' || this.onBf('Zulaport Cutthroat'))
      this.drainEach(1);
    if (n === "Stitcher's Supplier") this.millSelf(3);
    if (DRAW_ON_DEATH.has(n)) this.draw(1);
    else if (n === 'Vindictive Lich') {
      const t = this.focusOpp();
      if (t !== null) this.hurtOpp(t, 5);
    } else if (n === 'Junji, the Midnight Sky') {
      const c = this.bestGyCreature((x) => x.name !== n && this.value(x) >= 60);
      if (c) {
        this.reanimate(c);
        this.loseLife(2);
      } else this.drainEach(2);
    } else if (n === 'Protean Hulk') {
      // creatures with total mana value 6 or less onto the battlefield
      let budget = 6;
      for (;;) {
        const cs = this.library.filter((c) => c.isCreature && c.mv <= budget);
        if (!cs.length) break;
        const c = firstMax(cs, (x) => this.value(x));
        removeIfPresent(this.library, c);
        budget -= c.mv;
        this.enter(c, 'library');
      }
      this.shuffle();
    }
    // persist: comes back with a -1/-1 counter if it had none
    if (
      !p.token &&
      p.cd.keywords.has('persist') &&
      p.counters >= 0 &&
      this.gy.includes(p.cd)
    ) {
      const q = this.reanimate(p.cd);
      q.counters -= 1;
    }
  }

  override powerBonus(p: Perm): number {
    return p.cd.name === 'Wight of the Reliquary' ? this.gyCreatures() : 0;
  }
  override toughnessBonus(p: Perm): number {
    return p.cd.name === 'Wight of the Reliquary' ? this.gyCreatures() : 0;
  }

  // ================================================================ turn steps
  override startTurn(): void {
    if (this.turn >= 4 && this.turn <= 6) {
      this.permsEnd[this.turn] = this.bf.filter((p) => p.land === null).length;
      this.reanimEnd[this.turn] = this.reanimated;
      this.expEnd[this.turn] = this.exp;
    }
    super.startTurn();
    this.morbidUsed =
      this.divinerUsed =
      this.leftThisTurn =
      this.gristUsed =
        false;
  }

  override upkeep(): void {
    // the opponents' turns happened: crackback, unless Spore Frog prevents it (then it's sacrificed)
    const frog = this.perm('Spore Frog');
    if (frog && this.fogUsed) {
      this.say('Spore Frog prevents the crackback');
      this.sacrifice(frog);
    } else if (this.pendingCrackback > 0) {
      this.loseLife(this.pendingCrackback);
      this.say(
        `crackback: we take ${this.pendingCrackback}, life ${this.myLife}`,
      );
    }
    this.pendingCrackback = 0;
    this.fogUsed = false;
    if (this.onBf('Phyrexian Arena')) {
      this.draw(1);
      this.loseLife(1);
    }
    // Ophiomancer: a deathtouch Snake at each of our upkeeps if we have none
    if (this.onBf('Ophiomancer') && !this.bf.some((q) => q.cd === TOKENS.snake))
      this.createTokens(TOKENS.snake);
    for (const p of this.bf.filter((q) => q.cd.name === 'Grave Researcher')) {
      this.scry(1, true);
      if (this.gyCreatures() >= 3) this.prepared.add(p);
    }
  }

  override endStep(): void {
    for (const p of this.sacAtEnd) if (this.bf.includes(p)) this.sacrifice(p);
    this.sacAtEnd = [];
    for (const p of this.exileAtEnd) {
      const i = this.bf.indexOf(p);
      if (i >= 0) {
        this.bf.splice(i, 1);
        this.leftThisTurn = true;
      }
    }
    this.exileAtEnd = [];
    if (this.onBf(MEREN)) this.merenEndStep();
    this.checkKill();
  }

  /** Feed Meren with a free sacrifice outlet, then return the best creature card from the graveyard. */
  merenEndStep(): void {
    const outlet = this.freeOutlet();
    if (outlet) {
      // sacrifice tokens and creatures whose death is worth something: each one is an experience counter
      for (const f of this.fodder()) {
        if (f === outlet && outlet.cd.name !== 'Viscera Seer') continue;
        if (f.cd === TOKENS.stolen || FREE_OUTLETS.includes(f.cd.name))
          continue;
        if (f.token || DEATH_VALUE.has(f.cd.name)) this.sacrifice(f);
      }
      // the Gray Merchant loop: sacrifice it and let Meren bring it back (drain again)
      const gm = this.perm(GRAY_MERCHANT);
      if (gm && !gm.token && this.exp + 1 >= 5) this.sacrifice(gm);
    }
    const cands = this.gy.filter((c) => c.isCreature);
    if (!cands.length) return;
    const score = (c: CardDef) =>
      c.mv <= this.exp ? this.value(c) : this.value(c) * 0.4;
    const c = firstMax(cands, score);
    if (c.mv <= this.exp) {
      this.say(`Meren (${this.exp} experience) returns`, c);
      this.reanimate(c);
    } else {
      removeIfPresent(this.gy, c);
      this.hand.push(c);
      this.say(`Meren (${this.exp} experience) returns to hand`, c);
    }
  }

  // ================================================================ combat
  override canAttack(p: Perm): boolean {
    return super.canAttack(p) && p.cd.name !== 'Spore Frog';
  }
  override fogBlocker(): Perm | null {
    return this.perm('Spore Frog');
  }
  override onAttack(att: Perm[]): Perm[] {
    const extra: Perm[] = [];
    for (const p of att) {
      if (p.cd.name === 'Grave Titan') this.createTokens(TOKENS.zombie, 2);
      if (p.cd.name === 'Avenger of the Fallen') {
        // Mobilize X: tapped and attacking 1/1s, sacrificed at the end step
        for (const w of this.createTokens(TOKENS.warrior, this.gyCreatures(), {
          tapped: true,
        })) {
          extra.push(w);
          this.sacAtEnd.push(w);
        }
      }
    }
    return extra;
  }
  override combat(): void {
    this.creatureCombat();
  }
  /** How close to winning the others think we are: Meren out, black devotion for Gray Merchant, a big graveyard. */
  override podClose(): number {
    let c = 0;
    if (this.onBf(MEREN)) c += 0.3;
    if (this.devotion('B') >= 8) c += 0.3;
    if (this.gyCreatures() >= 8) c += 0.2;
    if (
      this.onBf('Priest of Forgotten Gods') ||
      this.onBf('Zulaport Cutthroat')
    )
      c += 0.2;
    return Math.min(1, c);
  }
  /** A pod: Spore Frog is the fog, not a blocker. */
  override blockValue(p: Perm): number {
    return p.cd.name === 'Spore Frog' ? 500 : super.blockValue(p);
  }
  /** A pod: sacrifice Spore Frog to prevent all combat damage this turn, when the hit is lethal or big (cfg.fog_at). */
  override fogPrevent(dmg: number, lethal: boolean): boolean {
    const frog = this.perm('Spore Frog');
    if (!frog || (!lethal && dmg < ((this.cfg.fog_at as number) ?? 6)))
      return false;
    this.sacrifice(frog);
    return true;
  }

  // ================================================================ tutors
  wanted(): string[] {
    const w: string[] = [];
    if (!this.freeOutlet())
      w.push('Viscera Seer', 'Umbral Collar Zealot', 'Woe Strider');
    w.push(
      GRAY_MERCHANT,
      'Twilight Diviner',
      'Sepulchral Primordial',
      'Grave Titan',
      'Morbid Opportunist',
    );
    if (this.gyCreatures() >= 8) w.unshift('Lotleth Giant');
    return w;
  }

  override tutorTarget(
    allowed: (c: CardDef) => boolean,
    _toTop: boolean,
    _spent: string | null = null,
  ): CardDef | null {
    const cands = this.library.filter(allowed);
    if (!cands.length) return null;
    for (const n of this.wanted()) {
      const c = cands.find(
        (x) =>
          x.name === n && !this.onBf(n) && !this.hand.some((h) => h.name === n),
      );
      if (c) return c;
    }
    return firstMax(cands, (c) => this.cardValue(c));
  }

  /** A card from the library into the graveyard (Vile Entomber, Buried Alive). */
  tutorToGy(allowed: (c: CardDef) => boolean): void {
    const cands = this.library.filter(
      (c) => allowed(c) && !this.gy.includes(c),
    );
    if (!cands.length) return;
    const order = [
      GRAY_MERCHANT,
      'Sepulchral Primordial',
      'Lotleth Giant',
      'Grave Titan',
      'Protean Hulk',
      'Rune-Scarred Demon',
    ];
    const c =
      order.map((n) => cands.find((x) => x.name === n)).find((x) => x) ??
      firstMax(cands, (x) => this.value(x));
    removeIfPresent(this.library, c);
    this.toGy(c, true);
    this.shuffle();
  }

  // ================================================================ spells
  override resolveOther(
    cd: CardDef,
    _fromGy: boolean,
    mode: string | null,
  ): void {
    const n = cd.name;
    if (n === 'Decode Transmissions') {
      this.draw(2);
      if (this.leftThisTurn) this.drainEach(2);
      else this.loseLife(2);
    } else if (n === 'Village Rites') this.draw(2);
    else if (n === 'Breach the Multiverse') {
      this.millSelf(10);
      for (let i = 0; i < this.lib.length; i++)
        this.lib[i] = Math.max(0, this.lib[i] - 10);
      const c = this.bestGyCreature();
      if (c) this.reanimate(c);
      for (let i = 0; i < this.oppsAlive(); i++)
        this.enter(TOKENS.stolen, 'graveyard', { token: true });
    } else if (n === 'Grisly Salvage') {
      const top = this.library.splice(0, 5);
      const keep = top.filter((c) => c.isCreature || c.land !== null);
      const k = keep.length ? firstMax(keep, (c) => this.cardValue(c)) : null;
      for (const c of top)
        if (c === k) this.hand.push(c);
        else this.toGy(c, true);
    } else if (n === 'Persist') {
      const c = this.bestGyCreature((x) => !x.types.has('legendary'));
      if (c) this.reanimate(c, { counters: -1 });
    } else if (n === 'Unearth') {
      const c = this.bestGyCreature((x) => x.mv <= 3);
      if (c) this.reanimate(c);
    } else if (n === 'Victimize') {
      // (the sacrifice was paid when casting)
      for (let k = 0; k < 2; k++) {
        const c = this.bestGyCreature();
        if (c) this.reanimate(c, { tapped: true });
      }
    } else if (n === 'Songs of the Damned') this.pool.B += this.gyCreatures();
    else if (n === 'Deadly Brew') {
      if (this.inArena()) this.arena!.edict(this, false);
      const f = this.fodder()[0];
      if (f) {
        this.sacrifice(f);
        const back = this.gy.filter((c) => c !== f.cd && c.land === null);
        if (back.length) {
          const c = firstMax(back, (x) => this.cardValue(x));
          removeIfPresent(this.gy, c);
          this.hand.push(c);
        }
      }
    } else if (n === 'Buried Alive') {
      for (let k = 0; k < 3; k++) this.tutorToGy((c) => c.isCreature);
    } else if (n === "Dina's Guidance") {
      if (mode === 'gy') this.tutorToGy((c) => c.isCreature);
      else this.doTutor((c) => c.isCreature, false);
    }
  }

  // ================================================================ what to do now
  candidates(main2: boolean): Cand[] {
    const out: Cand[] = [];
    const add = (
      score: number,
      cost: Cost,
      isIS: boolean,
      act: () => boolean,
      rock?: CardDef,
    ) => out.push({ score, cost, isIS, act, rock });
    const meren = this.onBf(MEREN);
    const fod = this.fodder();
    // the commander
    for (const cd of this.command.slice())
      add(95, this.commanderCost(cd, this.effCost(cd)), false, () =>
        this.castPerm(cd, true),
      );
    const seen = new Set<string>();
    for (const cd of this.hand.slice()) {
      if (seen.has(cd.name) || cd.land !== null) continue;
      seen.add(cd.name);
      const n = cd.name;
      if (cd.isCreature) {
        let sc = this.value(cd);
        if (
          MANA_ELVES.has(n) ||
          n === 'Sakura-Tribe Elder' ||
          n === 'Simulacrum Shaper' ||
          n === 'Solemn Simulacrum'
        )
          sc = this.turn <= 4 ? 85 : 40;
        if (n === GRAY_MERCHANT)
          sc = Math.min(99, 8 * (this.devotion('B') + 2));
        if (n === 'Lotleth Giant') sc = Math.min(99, 6 * this.gyCreatures());
        if (n === 'Disciple of Bolas' && !fod.some((p) => this.power(p) >= 2))
          sc = 10;
        if (
          EDICT_ETB.has(n) &&
          !(meren && fod.some((p) => p.token || DEATH_VALUE.has(p.cd.name)))
        )
          sc = 30;
        if (n === 'Shriekmaw') {
          // evoke for {1}{B}: it dies right away (a cheap Meren target and an experience counter)
          if (meren)
            add(48, this.effCost(cd, Cost.parse('{1}{B}')), false, () =>
              this.evoke(cd),
            );
          sc = 20;
        }
        if (n === 'Twilight Diviner' || FREE_OUTLETS.includes(n))
          sc = Math.max(sc, 80);
        add(sc, this.effCost(cd), false, () => this.castPerm(cd));
        continue;
      }
      if (HOLD.has(n)) continue;
      if (n === 'Sol Ring')
        add(100, this.effCost(cd), false, () => this.castPerm(cd), cd);
      else if (n === 'Phyrexian Arena')
        add(this.myLife > 20 ? 66 : 10, this.effCost(cd), false, () =>
          this.castPerm(cd),
        );
      else if (n === 'Vampiric Rites')
        add(55, this.effCost(cd), false, () => this.castPerm(cd));
      else if (n === 'Grist, the Hunger Tide')
        add(70, this.effCost(cd), false, () => this.castGrist(cd));
      else if (n === 'Dark Ritual' || n === 'Songs of the Damned') {
        if (n === 'Songs of the Damned' && this.gyCreatures() >= 4)
          add(50, this.effCost(cd), true, () => this.castIS(cd)); // only worth it as a ritual (see ritualCandidates)
      } else if (n === 'Decode Transmissions' || n === 'Diresight')
        add(this.myLife > 12 ? 55 : 25, this.effCost(cd), true, () =>
          this.castIS(cd),
        );
      else if (n === 'Village Rites') {
        const f = fod.find((p) => p.token || DEATH_VALUE.has(p.cd.name));
        if (f) add(52, this.effCost(cd), true, () => this.sacThenCast(cd, f));
      } else if (n === 'Breach the Multiverse')
        add(88, this.effCost(cd), false, () => this.castIS(cd));
      else if (n === 'Grisly Salvage')
        add(45, this.effCost(cd), true, () => this.castIS(cd));
      else if (n === 'Buried Alive')
        add(
          meren ||
            this.hand.some((c) => /Persist|Unearth|Victimize/.test(c.name))
            ? 62
            : 40,
          this.effCost(cd),
          false,
          () => this.castIS(cd),
        );
      else if (n === "Dina's Guidance")
        add(60, this.effCost(cd), true, () =>
          this.castIS(cd, false, null, meren && this.exp >= 5 ? 'gy' : 'hand'),
        );
      else if (n === 'Persist' || n === 'Unearth') {
        const c = this.bestGyCreature((x) => n === 'Persist' || x.mv <= 3);
        if (c)
          add(Math.min(90, this.value(c)), this.effCost(cd), false, () =>
            this.castIS(cd),
          );
      } else if (n === 'Victimize') {
        const cs = this.gy.filter((c) => c.isCreature).length;
        const f = fod[0];
        if (cs >= 2 && f)
          add(75, this.effCost(cd), false, () => this.sacThenCast(cd, f));
      } else if (n === 'Eldritch Evolution') {
        const f = fod[0];
        if (f) add(60, this.effCost(cd), false, () => this.evolve(cd, f));
      } else if (n === 'Saw in Half') {
        const t = this.perm(GRAY_MERCHANT) ?? this.perm('Grave Titan');
        if (t)
          add(
            t.cd.name === GRAY_MERCHANT ? 92 : 60,
            this.effCost(cd),
            true,
            () => this.sawInHalf(cd, t),
          );
      } else if (n === 'Deadly Brew') {
        if (fod.some((p) => p.token))
          add(45, this.effCost(cd), false, () => this.castIS(cd));
      } else if (n === 'Beast Within') {
        const t = fod.find((p) => p.token && this.power(p) < 3);
        if (t) add(35, this.effCost(cd), true, () => this.beastWithin(cd, t));
      } else if (cd.isIS)
        add(30, this.effCost(cd), true, () => this.castIS(cd));
      else if (cd.types.has('artifact') || cd.types.has('enchantment'))
        add(40, this.effCost(cd), false, () => this.castPerm(cd));
    }
    // abilities of permanents
    for (const p of this.bf) {
      const n = p.cd.name;
      if (n === 'Priest of Forgotten Gods' && !p.tapped && !p.sick) {
        const fs = this.fodder([p]).filter(
          (q) => q.token || DEATH_VALUE.has(q.cd.name) || this.value(q.cd) < 50,
        );
        if (fs.length >= 2)
          add(78, new Cost(), false, () => this.priest(p, fs[0], fs[1]));
      } else if (n === 'Fauna Shaman' && !p.tapped && !p.sick) {
        const d = this.hand.filter((c) => c.isCreature);
        if (d.length)
          add(58, new Cost(0, 0, 0, 0, 0, 0, 1), false, () => this.fauna(p));
      } else if (n === 'Liliana the Repentant' && !this.liliExhausted) {
        const c = this.bestGyCreature();
        if (c && this.value(c) >= 60)
          add(70, Cost.parse('{5}{B}'), false, () => this.liliana(p));
      } else if (n === 'Grist, the Hunger Tide' && !this.gristUsed)
        add(64, new Cost(), false, () => this.gristAct(p));
      else if (n === 'Studious First-Year' && this.prepared.has(p))
        add(72, Cost.parse('{1}{G}'), false, () => this.prep(p));
      else if (n === 'Grave Researcher' && this.prepared.has(p)) {
        const c = this.bestGyCreature();
        if (c && this.value(c) >= 60 && c.mv < this.myLife - 10)
          add(74, Cost.parse('{B}'), false, () => this.prep(p));
      } else if (main2 && n === 'Sakura-Tribe Elder')
        add(50, new Cost(), false, () => {
          this.sacrifice(p);
          this.fetchBasic();
          return true;
        });
      else if (main2 && n === 'Insidious Fungus')
        add(35, new Cost(2), false, () => this.fungus(p));
      else if (main2 && n === 'Vampiric Rites') {
        const f = fod.find((q) => q.token && q.cd !== TOKENS.stolen);
        if (f) add(30, Cost.parse('{1}{B}'), false, () => this.rites(f));
      }
    }
    // Skull Prophet: {T}: mill two cards (its mana, B or G, is "any colour" here: the deck only uses those two)
    const sp = this.bf.find(
      (q) => q.cd.name === 'Skull Prophet' && !q.tapped && !q.sick,
    );
    if (sp && this.library.length > 6)
      add(20, Cost.parse('{0}'), false, () => {
        sp.tapped = true;
        this.millSelf(2);
        return true;
      });
    // Reassembling Skeleton: {1}{B} returns it from the graveyard tapped (only worth it with mana to spare)
    const rs = this.gy.find((c) => c.name === 'Reassembling Skeleton');
    if (rs)
      add(25, this.effCost(rs, Cost.parse('{1}{B}')), false, () => {
        if (!this.pay(this.effCost(rs, Cost.parse('{1}{B}')), false))
          return false;
        this.reanimate(rs, { tapped: true });
        return true;
      });
    // Woe Strider: escape from the graveyard
    const ws = this.gy.find((c) => c.name === 'Woe Strider');
    if (ws && this.gy.filter((c) => c !== ws && !c.isCreature).length >= 4)
      add(40, this.effCost(ws, Cost.parse('{3}{B}{B}')), false, () =>
        this.escape(ws),
      );
    return out;
  }

  // ---------------------------------------------------------------- actions
  evoke(cd: CardDef): boolean {
    if (!this.pay(this.effCost(cd, Cost.parse('{1}{B}')), false)) return false;
    removeIfPresent(this.hand, cd);
    this.say('evoke', cd);
    const p = this.enter(cd, 'hand');
    this.sacrifice(p);
    return true;
  }

  sacThenCast(cd: CardDef, f: Perm): boolean {
    if (!this.canPay(this.effCost(cd), cd.isIS) || !this.bf.includes(f))
      return false;
    this.sacrifice(f);
    return this.castIS(cd);
  }

  evolve(cd: CardDef, f: Perm): boolean {
    if (!this.pay(this.effCost(cd), true)) return false;
    removeIfPresent(this.hand, cd);
    const x = f.cd.mv + 2;
    this.sacrifice(f);
    this.say(
      'cast',
      cd,
      `(sacrifice ${f.cd.name}: find mana value ${x} or less)`,
    );
    const cs = this.library.filter((c) => c.isCreature && c.mv <= x);
    if (cs.length) {
      const c = this.tutorTarget((y) => cs.includes(y), false) ?? cs[0];
      removeIfPresent(this.library, c);
      this.shuffle();
      this.enter(c, 'library');
    }
    this.exile.push(cd);
    return true;
  }

  sawInHalf(cd: CardDef, t: Perm): boolean {
    if (!this.pay(this.effCost(cd), true)) return false;
    removeIfPresent(this.hand, cd);
    this.say('cast', cd, 'on our', t.cd);
    this.onCastIS(false);
    const half = Math.ceil(this.power(t) / 2) - (t.cd.power + t.counters);
    this.dies(t);
    for (const q of this.createTokens(t.cd, 2)) q.powerMod = half;
    this.gy.push(cd);
    return true;
  }

  beastWithin(cd: CardDef, t: Perm): boolean {
    if (!this.pay(this.effCost(cd), true)) return false;
    removeIfPresent(this.hand, cd);
    this.dies(t);
    this.createTokens(TOKENS.beast);
    this.gy.push(cd);
    return true;
  }

  priest(p: Perm, a: Perm, b: Perm): boolean {
    p.tapped = true;
    this.sacrifice(a);
    this.sacrifice(b);
    this.drainEach(2);
    this.pool.B += 2;
    this.draw(1);
    this.say('Priest of Forgotten Gods: each opponent loses 2');
    return true;
  }

  fauna(p: Perm): boolean {
    const d = this.hand.filter((c) => c.isCreature);
    if (!d.length || !this.pay(new Cost(0, 0, 0, 0, 0, 0, 1), false))
      return false;
    p.tapped = true;
    const c = firstMin(d, (x) => this.discardValue(x));
    removeIfPresent(this.hand, c);
    this.toGy(c);
    this.doTutor((x) => x.isCreature, false);
    return true;
  }

  liliana(p: Perm): boolean {
    if (!this.pay(Cost.parse('{5}{B}'), false)) return false;
    const c = this.bestGyCreature();
    if (!c) return false;
    this.liliExhausted = true;
    this.reanimate(c);
    p.counters += 1;
    return true;
  }

  castGrist(cd: CardDef): boolean {
    if (!this.castPerm(cd)) return false;
    const g = this.perm(cd.name);
    if (g) g.counters = 3; // loyalty
    return true;
  }

  gristAct(p: Perm): boolean {
    this.gristUsed = true;
    if (p.counters >= 5 && this.gyCreatures() >= 6) {
      p.counters -= 5;
      this.drainEach(this.gyCreatures());
      this.say(
        `Grist -5: each opponent loses ${this.gyCreatures()}, opp life [${this.life.join(', ')}]`,
      );
      if (p.counters <= 0) {
        removeIfPresent(this.bf, p);
        this.gy.push(p.cd);
      }
    } else {
      p.counters += 1;
      this.createTokens(TOKENS.insect);
      this.millSelf(1);
    }
    return true;
  }

  prep(p: Perm): boolean {
    if (p.cd.name === 'Studious First-Year') {
      if (!this.pay(Cost.parse('{1}{G}'), true)) return false;
      this.prepared.delete(p);
      this.say('Rampant Growth (Studious First-Year)');
      this.fetchBasic();
      return true;
    }
    if (!this.pay(Cost.parse('{B}'), true)) return false;
    const c = this.bestGyCreature();
    if (!c) return false;
    this.prepared.delete(p);
    this.say('Reanimate (Grave Researcher)');
    this.reanimate(c);
    this.loseLife(c.mv);
    return true;
  }

  fungus(p: Perm): boolean {
    if (!this.pay(new Cost(2), false)) return false;
    this.sacrifice(p);
    this.draw(1);
    const land = this.hand.find((c) => c.land !== null);
    if (land) {
      removeIfPresent(this.hand, land);
      const q = new Perm(land, land.land, true);
      q.sick = false;
      this.bf.push(q);
    }
    return true;
  }

  rites(f: Perm): boolean {
    if (!this.pay(Cost.parse('{1}{B}'), false)) return false;
    this.sacrifice(f);
    this.gainLife(1);
    this.draw(1);
    return true;
  }

  escape(cd: CardDef): boolean {
    if (!this.pay(this.effCost(cd, Cost.parse('{3}{B}{B}')), false))
      return false;
    const others = sortDesc(
      this.gy.filter((c) => c !== cd && !c.isCreature),
      (c) => -this.cardValue(c),
    ).slice(0, 4);
    for (const c of others) {
      removeIfPresent(this.gy, c);
      this.exile.push(c);
    }
    const p = this.reanimate(cd);
    p.counters += 2;
    return true;
  }
}
