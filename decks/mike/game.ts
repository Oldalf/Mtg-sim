/**
 * The "Mike" deck's AI (Vnwxt, Verbose Host: mono-blue card draw, bracket 2-3): the rules of its cards,
 * what it wants to do each turn, and the rules agreed for this deck (see PLAN.md).
 *
 * Wins (any of them ends the game):
 *   - mill: draw from an empty library with Laboratory Maniac or Jace, Wielder of Mysteries on the battlefield;
 *   - Twenty-Toed Toad attacks with twenty or more cards in hand (or twenty counters);
 *   - all three opponents at 0 life (40 each): Psychosis Crawler pings per draw, combat, Krakens, Hand of Vecna...
 * Second measure: first opponent dead.
 * Drawing: Vnwxt at max speed and Teferi's Ageless Insight double draws; every card drawn feeds the payoffs
 * (Crawler, Ominous Seas, Skymage, Oneirophage, Messenger, Mystic, Krang...). Drawing from an empty library
 * follows the replacement effects: win (Maniac / Jace), Ormos counters, Living Conundrum skips, else we lose.
 * The AI only draws its last cards when it is safe (a win piece or Conundrum / Ormos on the battlefield).
 * Combat: flyers and unblockable creatures connect, half the ground attackers are blocked (engine rules).
 * The game itself (mana, zones, casting, turns) is the shared engine in engine/game.ts.
 */
import * as C from '../../engine/cards';
import { Cost, CardDef, makeToken } from '../../engine/cards';
import { Game, GameWithoutKillSearch } from '../../engine/game';
import { Cand, Evasion, Perm, WinAttempt, Zone } from '../../engine/game-types';
import { firstMax, firstMin, removeIfPresent } from '../../engine/lists';
import { MulliganRule } from '../../engine/mulligan';
import { MULLIGAN } from './mulligan';

export const VNWXT = 'Vnwxt, Verbose Host';
export const CRAWLER = 'Psychosis Crawler';
export const SEAS = 'Ominous Seas';
export const KRANG = 'Krang, the All-Powerful';
export const TEFERI = "Teferi's Ageless Insight";
export const MANIAC = 'Laboratory Maniac';
export const JACE = 'Jace, Wielder of Mysteries';
export const TOAD = 'Twenty-Toed Toad';
export const CONUNDRUM = 'Living Conundrum';
export const ORMOS = 'Ormos, Archive Keeper';
export const SKYMAGE = 'Clinquant Skymage';
export const ONEIRO = 'Oneirophage';
export const MESSENGER = "Emrakul's Messenger";
export const MYSTIC = 'Mischievous Mystic';
export const SHIFTER = 'Aurora Shifter';
export const CARTO = 'Roil Cartographer';
export const THIEF = 'Shielded Aether Thief';
export const WCLASS = 'Wizard Class';
export const VECNA = 'Hand of Vecna';
export const NERD = 'Nerd Rage';
export const AQUEOUS = 'Aqueous Form';
export const MICRO = 'Atomic Microsizer';
export const FOLIO = 'Folio of Fancies';
export const SPHERE = "Commander's Sphere";
export const CRYSTAL = 'The Water Crystal';
export const PROF = 'Pensive Professor';
export const FBLTHP = 'Fblthp, Impossibly Lost';
export const SAILOR = 'Spectral Sailor';
export const STRIX = 'Strix Lookout';
export const SHORELINE = 'Shoreline Looter';
export const KOR = 'Looter il-Kor';
export const TRIO = 'Harmonized Trio';
export const SANCTUARY = 'Mystic Sanctuary';
export const PASSAGE = "Rogue's Passage";
export const AVISHKAR = 'Avishkar Raceway';
export const MURAGANDA = 'Muraganda Raceway';
export const AMONKHET = 'Amonkhet Raceway';
export const IMITATOR = 'Slick Imitator';
/** Archidekt trackers (see syncFromLog). */
export const LOG_TRACKERS = [
  'Start Your Engines! // Max Speed',
  'Energy Reserve',
];

export const TOK = {
  kraken: makeToken('Kraken', 8, 8, 'blue'),
  spawn: makeToken('Eldrazi Spawn', 0, 1),
  faerie: makeToken('Faerie', 1, 1, 'blue', ['flying']),
};

/** Perm.marks bits. */
const M_AQUEOUS = 1; // enchanted with Aqueous Form (can't be blocked)
const M_VECNA = 2; // equipped with Hand of Vecna
const M_NERD = 4; // enchanted with Nerd Rage
const M_MICRO = 8; // equipped with Atomic Microsizer
const M_UNBLOCK = 16; // Rogue's Passage / Gingerbrute this turn

/** Creatures that can't be blocked (or have shadow). */
const UNBLOCKABLE = new Set([
  SHORELINE,
  KOR,
  'Invisible Stalker',
  'Slither Blade',
  'Gingerbrute',
]);

/** How much we want each card on the battlefield / to cast it (casting order, discards, the planner's score). */
const VALUE: Record<string, number> = {
  'Sol Ring': 100,
  [VNWXT]: 92,
  'Arcane Signet': 84,
  'Thought Vessel': 72,
  [TEFERI]: 78,
  [KRANG]: 70,
  [CRAWLER]: 68,
  [SEAS]: 66,
  [SKYMAGE]: 60,
  [ONEIRO]: 60,
  [MESSENGER]: 60,
  [MYSTIC]: 60,
  [WCLASS]: 64,
  [CARTO]: 54,
  [THIEF]: 40,
  [STRIX]: 48,
  [SAILOR]: 52,
  [KOR]: 50,
  [SHORELINE]: 56,
  'Loyal Drake': 56,
  'Body of Knowledge': 56,
  [PROF]: 50,
  [ORMOS]: 62,
  [CONUNDRUM]: 58,
  [JACE]: 85,
  [MANIAC]: 80,
  [TOAD]: 76,
  [FOLIO]: 54,
  [NERD]: 50,
  [VECNA]: 50,
  [AQUEOUS]: 38,
  [MICRO]: 30,
  Gingerbrute: 44,
  'Invisible Stalker': 50,
  'Slither Blade': 46,
  [SHIFTER]: 54,
  [IMITATOR]: 44,
  [TRIO]: 36,
  'Thunderclap Drake': 58,
  'Volatile Stormdrake': 44,
  'Diversion Unit': 42,
  'Siren Stormtamer': 40,
  [SPHERE]: 60,
  [CRYSTAL]: 52,
  [FBLTHP]: 46,
  // spells
  Brainstorm: 58,
  Consider: 52,
  'Tune the Narrative': 54,
  'Frantic Search': 56,
  Flux: 40,
  Windfall: 45,
  'Pull from Tomorrow': 62,
  'Treasure Cruise': 60,
};
/** Interaction: no targets in a goldfish game (held; they stay in hand, so they count for the Toad's twenty). */
const HOLD = new Set([
  'Aether Spike',
  'Negate',
  'Refute',
  'Spell Pierce',
  'Spell Syphon',
  'Aether Gale',
  'Aetherize',
  'Evacuation',
  'Pongify',
  'Rapid Hybridization',
  'Reality Shift',
  'Wash Out',
]);
/** Cards this file has rules for (lands, Sol Ring, Signet and Sphere are engine facts). */
C.registerKnown([
  ...Object.keys(VALUE),
  ...HOLD,
  VNWXT,
  SANCTUARY,
  PASSAGE,
  AVISHKAR,
  MURAGANDA,
  AMONKHET,
  'Harmonized Trio // Brainstorm',
  'Gingerbrute',
]);

/** Draw spells worth a Slick Imitator copy. */
const IMITATE = new Set([
  'Pull from Tomorrow',
  'Treasure Cruise',
  'Brainstorm',
  'Windfall',
  'Flux',
]);
const COUNTERSPELLS = new Set([
  'Aether Spike',
  'Negate',
  'Refute',
  'Spell Pierce',
  'Spell Syphon',
  'Diversion Unit',
]);

export class MikeGame extends GameWithoutKillSearch {
  override mulliganRule(): MulliganRule | null {
    return this.cfg.smart_mulligan ? MULLIGAN : null;
  }
  override colors = ['U'];

  speed = 0; // 0 = no speed yet, 1-4
  speedUpTurn = false; // speed already rose this turn
  oppLostLife = false; // an opponent lost life this turn
  drawsTurn = 0; // cards drawn this turn
  drawStepOpen = false; // the first draw of the draw step hasn't happened yet
  ener = 0; // energy counters
  inCombat = false;
  vecnaX = 0; // Hand of Vecna's X, set at the beginning of combat
  nerdOn = false; // an attack with Nerd Rage's creature this turn
  shifterCopy: CardDef | null = null; // what Aurora Shifter became a copy of
  milled = false; // won by drawing from an empty library
  toadWon = false;
  winHow: string | null = null;
  emptiedTurn: number | null = null; // the turn our library first hit zero
  emptiedSafe = false; // ...with a win piece, Conundrum or Ormos out
  drakeCopies = 0; // Thunderclap Drake: copies of the next instant or sorcery this turn
  crawlerDrain = 0; // life drained by Psychosis Crawler triggers
  commanderCasts = 0;
  // ---- measures for --diag (they change nothing in the game)
  vnwxtOut: number | null = null;
  maxSpeedTurn: number | null = null;
  handEnd: number[] = [];
  libEnd: number[] = [];
  drawsByTurn: number[] = [];
  castsByTurn: number[] = [];

  override clone(): this {
    const g = super.clone();
    g.handEnd = this.handEnd.slice();
    g.libEnd = this.libEnd.slice();
    g.drawsByTurn = this.drawsByTurn.slice();
    g.castsByTurn = this.castsByTurn.slice();
    return g;
  }

  // ================================================================ helpers
  /** Permanents with this name, counting Aurora Shifter if it is a copy of it. */
  cnt(name: string): number {
    let n = 0;
    for (const p of this.bf) {
      if (p.cd.name === name) n++;
      else if (p.cd.name === SHIFTER && this.shifterCopy?.name === name) n++;
    }
    return n;
  }
  krang(): number {
    return this.cnt(KRANG) > 0 ? 2 : 1;
  }
  noMaxHand(): boolean {
    return (
      this.onBf(VNWXT) ||
      this.onBf('Thought Vessel') ||
      this.onBf('Reliquary Tower') ||
      this.onBf(WCLASS) ||
      this.onBf('Body of Knowledge') ||
      this.onBf(FOLIO)
    );
  }
  /** Effective card of a permanent (Aurora Shifter may be a copy of something). */
  eff(p: Perm): CardDef {
    return p.cd.name === SHIFTER && this.shifterCopy ? this.shifterCopy : p.cd;
  }

  // ================================================================ the win conditions
  override oppsBeaten(): boolean {
    return this.milled || this.toadWon || super.oppsBeaten();
  }
  toadReady(): boolean {
    return this.bf.some(
      (p) =>
        p.cd.name === TOAD &&
        !p.sick &&
        !p.tapped &&
        (this.hand.length >= 20 || p.counters >= 20),
    );
  }
  /** Our counterspells: Negate, Refute, Spell Pierce, Spell Syphon and Aether Spike (the engine only knows a few). */
  override hasCounterInHand(): boolean {
    return this.hand.some((c) => COUNTERSPELLS.has(c.name));
  }
  /** A pod: a mill win needs Laboratory Maniac or Jace on the battlefield, the Toad win needs the Toad: removing it in
   *  response stops the win. A counterspell with two mana open answers one removal spell (Siren Stormtamer: Game.podShield). */
  override winAttempt(): WinAttempt | null {
    const perms =
      this.winHow === 'mill'
        ? [MANIAC, JACE].filter((n) => this.onBf(n))
        : this.winHow === 'Toad'
          ? [TOAD]
          : [];
    if (!perms.length) return null;
    const backup = this.hasCounterInHand() && this.availMana() >= 2 ? 1 : 0;
    return { spells: [], perms, backup };
  }
  /** A pod: the win was stopped (the Maniac / Jace / Toad removed in response). A mill win: the draw from the empty
   *  library still happens, now without the win piece (Living Conundrum or Ormos may save us). */
  override podWinStopped(): void {
    super.podWinStopped();
    const mill = this.milled;
    this.milled = this.toadWon = false;
    this.winHow = null;
    if (mill && !this.library.length) this.drawOne();
  }
  /** How close to winning the others think we are: a win piece out and a small library, or a Toad near twenty. */
  override podClose(): number {
    const piece = this.onBf(MANIAC) || this.onBf(JACE);
    const lib = this.library.length;
    let c = piece
      ? lib <= 15
        ? 1
        : lib <= 35
          ? 0.6
          : 0.3
      : lib <= 15
        ? 0.3
        : 0;
    const toad = this.perm(TOAD);
    if (toad)
      c = Math.max(
        c,
        Math.min(1, Math.max(toad.counters, this.hand.length) / 20),
      );
    return c;
  }
  override checkKill(): number {
    if (this.died) return 2;
    if (!this.milled && !this.toadWon && this.toadReady()) {
      this.toadWon = true;
      this.winHow = 'Toad';
    }
    if (this.oppsBeaten()) {
      if (this.winHow === null)
        this.winHow =
          this.crawlerDrain * 2 >= this.damageDealt ? 'Crawler' : 'combat';
      if (this.unprot === null) {
        this.unprot = this.turn;
        this.prot =
          this.hasCounterInHand() && this.availMana() >= 2 ? this.turn : null;
        this.say(
          `WIN (${this.winHow ?? 'damage'}): opp life [${this.life.join(', ')}], hand ${this.hand.length}, library ${this.library.length}`,
        );
      }
      return 2;
    }
    return 0;
  }
  override play(): [number | null, number | null] {
    super.play();
    this.noteTurnEnd();
    return [this.died ? null : this.unprot, this.firstOppDead];
  }
  // ---------------------------------------------------------------- log analyzer hooks
  /** Pontus keeps two trackers in Archidekt's misc zone: "Start Your Engines! // Max Speed" (its +1/+1 counters = speed) and
   *  "Energy Reserve" (its Charge counters = energy). Lore counters on Vnwxt and Hand of Vecna mean the Hand is equipped to Vnwxt. */
  override syncFromLog(board: { trackers: Record<string, number> }): void {
    this.speed = board.trackers['Start Your Engines! // Max Speed'] ?? 0;
    this.ener = board.trackers['Energy Reserve'] ?? 0;
    const hand = this.perm(VECNA),
      vn = this.perm(VNWXT);
    if (hand && vn && hand.counters > 0) vn.marks |= M_VECNA;
    if (hand) hand.counters = 0;
    if (vn) vn.counters = 0;
  }
  override logToken(name: string): CardDef | null {
    const n = name.toLowerCase();
    if (n.includes('kraken')) return TOK.kraken;
    if (n.includes('spawn')) return TOK.spawn;
    if (n.includes('faerie')) return TOK.faerie;
    // a marker named after a card (Aurora Shifter's copy of Psychosis Crawler): a token copy of that creature
    const d = C.db()[name];
    return d && (d.type_line ?? '').includes('Creature') ? C.get(name) : null;
  }

  override diag(): Record<string, number | null> {
    const upTo = (k: number) =>
      this.castsByTurn.slice(1, k + 1).reduce((s, x) => s + (x ?? 0), 0);
    const dr = (k: number) =>
      this.drawsByTurn.slice(1, k + 1).reduce((s, x) => s + (x ?? 0), 0);
    return {
      vnwxtOut: this.vnwxtOut,
      maxSpeed: this.maxSpeedTurn,
      spent5: this.spentEnd[5] ?? null,
      spent6: this.spentEnd[6] ?? null,
      hand6: this.handEnd[6] ?? null,
      hand8: this.handEnd[8] ?? null,
      draws6: dr(6),
      draws8: dr(8),
      casts5: upTo(5),
      lib8: this.libEnd[8] ?? null,
      died: this.died ? 1 : 0,
      emptied: this.emptiedTurn !== null ? 1 : 0,
      emptiedSafe: this.emptiedTurn !== null && this.emptiedSafe ? 1 : 0,
      backup: this.prot !== null ? 1 : 0,
      how:
        this.winHow === 'mill'
          ? 1
          : this.winHow === 'Toad'
            ? 2
            : this.winHow === 'Crawler'
              ? 3
              : this.winHow
                ? 4
                : null,
    };
  }
  noteTurnEnd(): void {
    this.handEnd[this.turn] = this.hand.length;
    this.libEnd[this.turn] = this.library.length;
    this.drawsByTurn[this.turn] = this.drawsTurn;
    this.castsByTurn[this.turn] = this.spellsCast;
  }

  // ================================================================ speed
  override hurtOpp(i: number, n: number): number {
    const lost = super.hurtOpp(i, n);
    if (lost > 0) this.oppLost();
    return lost;
  }
  oppLost(): void {
    this.oppLostLife = true;
    if (this.speed >= 1 && this.speed < 4 && !this.speedUpTurn) {
      this.speedUpTurn = true;
      this.speed += 1;
      if (this.speed === 4 && this.maxSpeedTurn === null)
        this.maxSpeedTurn = this.turn;
    }
  }
  startEngines(): void {
    if (this.speed === 0) this.speed = 1;
  }
  /** Speed pods: opponents lose life on our turn from the table itself (config speed_free). */
  tableLife(): void {
    if (this.cfg.speed_free && !this.oppLostLife) this.oppLost();
  }

  // ================================================================ drawing
  /** How many cards one "draw a card" event gives, with Vnwxt at max speed and Teferi's Ageless Insight. */
  drawsFor(exempt: boolean): number {
    const vn = this.speed >= 4 && this.onBf(VNWXT);
    const te = this.onBf(TEFERI);
    if (vn) return (exempt ? 1 : te ? 2 : 1) + (te ? 2 : 1);
    return te && !exempt ? 2 : 1;
  }
  override draw(n = 1): void {
    for (let i = 0; i < n && !this.milled && !this.died; i++) {
      const exempt = this.drawStepOpen;
      this.drawStepOpen = false;
      const k = this.drawsFor(exempt);
      for (let j = 0; j < k && !this.milled && !this.died; j++) this.drawOne();
    }
  }
  /** One card actually drawn (or the empty-library replacement). */
  drawOne(): void {
    if (!this.library.length) {
      if (this.cnt(MANIAC) > 0 || this.onBf(JACE)) {
        this.milled = true;
        this.winHow = 'mill';
        this.say('draw from an empty library: WIN');
      } else if (this.cnt(ORMOS) > 0) {
        const o = this.bf.find((p) => p.cd.name === ORMOS)!;
        o.counters += 5;
      } else if (this.onBf(CONUNDRUM)) {
        // the draw is skipped
      } else {
        this.died = true;
        this.say('draw from an empty library: we lose');
      }
      return;
    }
    this.firstDrawDone = true;
    this.hand.push(this.library.shift()!);
    if (!this.library.length && this.emptiedTurn === null) {
      this.emptiedTurn = this.turn;
      this.emptiedSafe = this.safe();
    }
    this.drawsTurn += 1;
    this.drawTriggers();
  }
  drawTriggers(): void {
    const k = this.krang();
    const second = this.drawsTurn === 2;
    for (let t = 0; t < k; t++) {
      const crawlers = this.cnt(CRAWLER);
      if (crawlers) this.crawlerDrain += this.drainEach(crawlers);
      for (const p of this.bf) {
        const n = this.eff(p).name;
        if (n === SKYMAGE || n === ONEIRO) p.counters += 1;
      }
      const seas = this.perm(SEAS);
      if (seas) {
        seas.counters += 1;
        while (seas.counters >= 8) {
          seas.counters -= 8;
          this.createTokens(TOK.kraken, 1);
          this.say('Ominous Seas: an 8/8 Kraken');
        }
      }
      if (this.perm(WCLASS)?.counters === 3) {
        const t2 = this.counterTarget();
        if (t2) t2.counters += 1;
      }
      if (second) {
        for (const p of this.bf.slice()) {
          const n = this.eff(p).name;
          if (n === MESSENGER) this.createTokens(TOK.spawn, 1);
          else if (n === MYSTIC) this.createTokens(TOK.faerie, 1);
        }
      }
    }
    if (second) {
      for (const p of this.bf) if (p.cd.name === KRANG) p.counters += k;
    }
  }
  /** The creature to put a +1/+1 counter on: an evasive attacker. */
  counterTarget(): Perm | null {
    const cs = this.creatures();
    if (!cs.length) return null;
    return firstMax(cs, (p) => (this.evasive(p) ? 100 : 0) + this.power(p));
  }
  /** Cards one effect would draw, counting the doublers (a rough count; each event is not the first of the draw step). */
  draws(n: number): number {
    return n * this.drawsFor(false);
  }
  /** Cards drawn by a Windfall / Flux that discards k cards, with the Slick Imitator copy (it discards what was just drawn). */
  refillDraws(k: number, flux: boolean): number {
    const first = this.draws(flux ? k + 1 : Math.max(k, 7));
    if (!this.imitatorReady() || this.availMana() < 1) return first;
    return first + this.draws(flux ? first + 1 : first);
  }
  /** Is it safe to empty the library? A win piece, or Conundrum / Ormos, is on the battlefield. */
  safe(): boolean {
    return (
      this.cnt(MANIAC) > 0 ||
      this.onBf(JACE) ||
      this.onBf(CONUNDRUM) ||
      this.cnt(ORMOS) > 0
    );
  }
  winPiece(): boolean {
    return this.cnt(MANIAC) > 0 || this.onBf(JACE);
  }
  /** May the AI start an effect that draws k cards (events: k)? */
  drawOk(events: number): boolean {
    if (this.safe()) return true;
    return (
      this.library.length - this.draws(events) >=
      (this.cfg.keep_library as number)
    );
  }
  /** The biggest number of draw events an effect may have (X spells). */
  drawRoom(): number {
    if (this.safe()) return 99;
    const per = this.drawsFor(false);
    return Math.max(
      0,
      Math.floor(
        (this.library.length - (this.cfg.keep_library as number)) / per,
      ),
    );
  }

  // ================================================================ evasion and power
  override evasive(p: Perm): boolean {
    const d = this.eff(p);
    return (
      d.flying ||
      UNBLOCKABLE.has(d.name) ||
      (p.marks & (M_AQUEOUS | M_UNBLOCK)) !== 0
    );
  }
  override evasion(p: Perm): Evasion {
    const d = this.eff(p);
    if (UNBLOCKABLE.has(d.name) || (p.marks & (M_AQUEOUS | M_UNBLOCK)) !== 0)
      return 'unblockable';
    return d.flying ? 'flying' : 'none';
  }
  override powerBonus(p: Perm): number {
    const d = this.eff(p);
    let b = d.power - p.cd.power;
    if (d.name === CRAWLER || d.name === 'Body of Knowledge')
      b += this.hand.length;
    if (p.cd.name === CONUNDRUM && !this.library.length) b += 8;
    if (p.marks & M_VECNA && this.inCombat) b += this.vecnaX;
    if (p.marks & M_NERD && this.nerdOn) b += 10;
    if (p.marks & M_MICRO) b += 1;
    return b;
  }
  override toughnessBonus(p: Perm): number {
    const d = this.eff(p);
    let b = d.toughness - p.cd.toughness;
    if (d.name === CRAWLER || d.name === 'Body of Knowledge')
      b += this.hand.length;
    if (p.cd.name === CONUNDRUM && !this.library.length) b += 5;
    if (p.marks & M_VECNA && this.inCombat) b += this.vecnaX;
    return b;
  }
  override canAttack(p: Perm): boolean {
    if (p.cd.name === VNWXT && !(p.marks & M_VECNA)) return false;
    return super.canAttack(p);
  }

  // ================================================================ entering
  override onEnter(p: Perm, _from: Zone): void {
    const n = p.cd.name;
    if (n === VNWXT) {
      this.startEngines();
      if (this.vnwxtOut === null) this.vnwxtOut = this.turn;
    } else if (n === IMITATOR) this.startEngines();
    else if (n === WCLASS) p.counters = 1;
    else if (n === NERD && !p.token) {
      this.draw(2);
      this.attach(M_NERD);
    } else if (n === AQUEOUS) this.attach(M_AQUEOUS);
    else if (n === JACE) p.counters = 4;
  }
  /** Put an Aura on our best attacker. */
  attach(mark: number): void {
    const t = this.counterTarget();
    if (t) t.marks |= mark;
  }
  override entersTapped(cd: CardDef): boolean {
    if (cd.name === SANCTUARY)
      return this.landsBf().filter((p) => p.land?.island).length < 3;
    return super.entersTapped(cd);
  }
  override onLandEnter(p: Perm, gone: boolean): void {
    const n = p.cd.name;
    if (n === AVISHKAR || n === MURAGANDA || n === AMONKHET)
      this.startEngines();
    if (this.onBf(CARTO) && !gone) this.ener += this.cnt(CARTO);
    if (n === SANCTUARY && !p.tapped) {
      const order = [
        'Pull from Tomorrow',
        'Treasure Cruise',
        'Brainstorm',
        'Windfall',
        'Frantic Search',
        'Consider',
      ];
      const t = order
        .map((x) => this.gy.find((c) => c.name === x))
        .find((c) => c !== undefined);
      if (t) {
        removeIfPresent(this.gy, t);
        this.library.unshift(t);
        this.say('Mystic Sanctuary: put', t, 'on top');
      }
    }
  }
  override onDies(p: Perm): void {
    if (p.cd.name === SHIFTER) this.shifterCopy = null;
  }

  // ================================================================ mana
  override srcKind(p: Perm, ignoreSick = false): string | null {
    if (p.cd === TOK.spawn) return 'C';
    if (p.cd.name === MURAGANDA && this.speed >= 4) return 'C2';
    return super.srcKind(p, ignoreSick);
  }
  /** A Spawn that was tapped for mana is gone (sacrificed). Done later, not inside pay(): the engine pays
   *  speculatively and restores the tapped flags afterwards, which can not bring a sacrificed token back. */
  purgeSpawns(): void {
    for (const p of this.bf.slice())
      if (p.cd === TOK.spawn && p.tapped) this.dies(p);
  }
  override effCost(
    cd: CardDef,
    base: Cost | null = null,
    fromGy = false,
  ): Cost {
    const c = super.effCost(cd, base, fromGy);
    if (cd.isBlue && this.onBf(CRYSTAL) && c.g > 0)
      return c.withGeneric(c.g - 1);
    return c;
  }
  override onCommanderCast(_cd: CardDef): void {
    this.commanderCasts += 1;
  }
  override commanderCost(_cd: CardDef, cost: Cost): Cost {
    return cost.withGeneric(cost.g + 2 * this.commanderCasts);
  }
  /** Mana we could pay now (without the pool). */
  availMana(): number {
    let n = this.pool.U + this.pool.C + this.pool.S;
    for (const p of this.bf) {
      if (p.tapped) continue;
      const k = this.srcKind(p);
      if (k === null) continue;
      n += k === 'C2' ? 2 : 1;
    }
    return n;
  }
  maxX(extra: number, per = 1): number {
    let x = 0;
    while (x < 30 && this.canPay(new Cost(per * (x + 1) + extra))) x++;
    return x;
  }

  // ================================================================ card values
  value(cd: CardDef): number {
    return VALUE[cd.name] ?? (cd.isCreature ? 40 : 30);
  }
  override cardValue(cd: CardDef): number {
    if (cd.land !== null) {
      const m = this.manaSources() + this.countLandsHand();
      return m <= 4 ? 80 : m <= 7 ? 55 : m <= 9 ? 35 : 18;
    }
    if (HOLD.has(cd.name)) return 28;
    return this.value(cd);
  }

  // ================================================================ turn steps
  override startTurn(): void {
    if (this.turn > 0) this.noteTurnEnd();
    this.purgeSpawns();
    super.startTurn();
    this.speedUpTurn = false;
    this.drakeCopies = 0;
    this.oppLostLife = false;
    this.drawsTurn = 0;
    this.drawStepOpen = true;
    this.inCombat = false;
    this.nerdOn = false;
    this.vecnaX = 0;
    for (const p of this.bf) {
      p.marks &= ~M_UNBLOCK;
      p.exhausted = false;
    }
  }
  override playLand(): void {
    this.drawStepOpen = false;
    this.tableLife();
    super.playLand();
  }
  override develop(main2 = false): boolean {
    this.drawStepOpen = false;
    return super.develop(main2);
  }
  override endTurn(): void {
    this.endStep();
    const max = this.noMaxHand() ? 999 : this.onBf(TOAD) ? 20 : 7;
    if (this.hand.length > max) this.discard(this.hand.length - max);
  }

  // ================================================================ combat
  override combat(): void {
    this.purgeSpawns();
    this.inCombat = true;
    this.vecnaX = this.hand.length;
    // beginning of combat
    for (const p of this.bf.slice()) {
      if (p.cd.name === 'Loyal Drake' && this.onBf(VNWXT)) this.draw(1);
    }
    this.shifterCopyNow();
    if (this.checkKill() === 2) return;
    this.creatureCombat();
    this.checkKill();
  }
  /** Aurora Shifter: pay {E}{E} to become a copy of another creature (not legendary). */
  shifterCopyNow(): void {
    const s = this.perm(SHIFTER);
    if (!s || this.shifterCopy || this.ener < 2) return;
    const want = [
      CRAWLER,
      MANIAC,
      ONEIRO,
      SKYMAGE,
      'Kraken',
      MESSENGER,
      MYSTIC,
    ];
    const pickable = this.bf.filter(
      (p) =>
        p !== s &&
        p.isCreature &&
        !p.cd.types.has('legendary') &&
        want.includes(p.cd.name),
    );
    if (!pickable.length) return;
    const t = firstMin(pickable, (p) => want.indexOf(p.cd.name));
    this.ener -= 2;
    this.shifterCopy = t.cd;
    this.say('Aurora Shifter becomes a copy of', t.cd);
  }
  override onAttack(attackers: Perm[]): Perm[] {
    const toad = attackers.find((p) => p.cd.name === TOAD);
    if (attackers.some((p) => p.marks & M_NERD) && this.hand.length >= 10)
      this.nerdOn = true;
    if (toad) {
      if (attackers.length >= 2) {
        toad.counters += 1;
        this.draw(1);
      }
      if (toad.counters >= 20 || this.hand.length >= 20) {
        this.toadWon = true;
        this.winHow = 'Toad';
      }
    }
    return [];
  }
  override onCombatDamage(connected: Perm[], _damage: number): void {
    for (const p of connected) {
      const n = this.eff(p).name;
      if (n === SHORELINE) {
        this.draw(1);
        if (this.gy.length < 7) this.discard(1);
      } else if (n === KOR) {
        this.draw(1);
        this.discard(1);
      } else if (n === SHIFTER) this.ener += this.power(p);
    }
    const f = this.perm(FBLTHP);
    if (f && connected.length) {
      this.draw(2);
      if (!this.library.length && !this.died) {
        this.milled = true;
        this.winHow = 'mill';
      }
      removeIfPresent(this.bf, f);
      this.library.push(f.cd);
      this.shuffle();
      this.say('Fblthp shuffles into the library');
    }
  }
  /** Our best creature to carry equipment and auras. */
  carrier(): Perm | null {
    const cs = this.creatures().filter(
      (p) => this.evasive(p) || this.eff(p).name === 'Kraken',
    );
    return cs.length
      ? firstMax(
          cs,
          (p) => (this.evasive(p) ? 100 : 0) + p.cd.mv + this.power(p),
        )
      : null;
  }

  // ================================================================ what to do
  candidates(main2: boolean): Cand[] {
    this.purgeSpawns();
    const out: Cand[] = [];
    const add = (
      score: number,
      cost: Cost,
      isIS: boolean,
      act: () => boolean,
      rock?: CardDef,
    ) => out.push({ score, cost, isIS, act, rock });
    const early = this.manaSources() < 6;
    const room = this.drawRoom();
    const winP = this.winPiece();
    const libLow = this.library.length <= (this.cfg.maniac_at as number);
    // commander
    for (const cd of this.command.slice())
      add(92, this.commanderCost(cd, this.effCost(cd)), false, () =>
        this.castPerm(cd, true),
      );
    const seen = new Set<string>();
    for (const cd of this.hand.slice()) {
      if (seen.has(cd.name) || cd.land !== null || HOLD.has(cd.name)) continue;
      seen.add(cd.name);
      const n = cd.name;
      let sc = this.value(cd);
      const cost = this.effCost(cd);
      if (n === 'Sol Ring') {
        add(100, cost, false, () => this.castPerm(cd), cd);
        continue;
      }
      if (n === 'Arcane Signet') {
        add(early ? 88 : 30, cost, false, () => this.castPerm(cd), cd);
        continue;
      }
      if (n === 'Thought Vessel') {
        add(early ? 74 : 35, cost, false, () => this.castPerm(cd), cd);
        continue;
      }
      if (n === SPHERE) {
        add(early ? 62 : 25, cost, false, () => this.castPerm(cd), cd);
        continue;
      }
      if (n === MANIAC || n === JACE) {
        // win pieces: cast them when the mill is near (or early, if config says so)
        const near = libLow || this.safe();
        sc = near ? 97 : this.cfg.maniac_early ? sc - 10 : 0;
        if (sc > 0) add(sc, cost, false, () => this.castPerm(cd));
        continue;
      }
      if (n === CONUNDRUM || n === ORMOS) {
        sc = this.library.length <= 30 ? sc + 10 : sc - 20;
        if (
          n === CONUNDRUM &&
          this.cnt(MANIAC) + this.cnt(JACE) === 0 &&
          this.library.length <= 12
        )
          sc = 90;
        add(sc, cost, false, () => this.castPerm(cd));
        continue;
      }
      if (n === NERD || n === AQUEOUS) {
        if (this.carrier())
          add(
            n === NERD ? 56 : this.hand.length >= 6 ? 46 : 30,
            cost,
            false,
            () => this.castPerm(cd),
          );
        continue;
      }
      if (n === VECNA) {
        if (this.carrier() && this.hand.length >= 5)
          add(this.hand.length >= 10 ? 62 : 48, cost, false, () =>
            this.castPerm(cd),
          );
        continue;
      }
      if (n === MICRO) {
        if (this.carrier()) add(26, cost, false, () => this.castPerm(cd));
        continue;
      }
      if (n === CRAWLER) {
        add(this.draws(3) >= 3 ? 74 : 66, cost, false, () => this.castPerm(cd));
        continue;
      }
      if (n === TOAD) {
        add(this.hand.length >= 10 ? 90 : 76, cost, false, () =>
          this.castPerm(cd),
        );
        continue;
      }
      if (n === CRYSTAL) {
        add(this.hand.length >= 3 ? 50 : 36, cost, false, () =>
          this.castPerm(cd),
        );
        continue;
      }
      if (
        n === 'Brainstorm' ||
        n === 'Consider' ||
        n === 'Tune the Narrative'
      ) {
        if (!this.drawOk(1)) continue;
        sc += winP ? 40 : 0;
        add(sc - (n === 'Brainstorm' ? 0 : 0), cost, true, () =>
          this.castIS(cd),
        );
        continue;
      }
      if (n === 'Frantic Search') {
        if (!this.drawOk(2)) continue;
        add(sc + (winP ? 40 : 0), cost, true, () => this.castIS(cd));
        continue;
      }
      if (n === 'Flux' || n === 'Windfall') {
        const k = this.hand.length - 1; // cards that get discarded (Flux: all of them when the mill is safe)
        const total = this.refillDraws(k, n === 'Flux');
        const keepers = this.hand.some(
          (c) =>
            c !== cd && [MANIAC, JACE, TOAD, CRAWLER, KRANG].includes(c.name),
        );
        if (this.safe()) {
          // a protector is out: a refill that draws the library out is the plan
          const empties = total >= this.library.length;
          if (empties && !(keepers && !winP && this.cnt(CRAWLER) === 0))
            add(winP ? 99 : 70, cost, true, () => this.castIS(cd));
          else if (
            n === 'Flux' &&
            this.drawOk(2) &&
            this.hand.some((c) => c.land !== null || HOLD.has(c.name))
          )
            add(sc, cost, true, () => this.castIS(cd));
          else if (
            n === 'Windfall' &&
            k >= 4 &&
            !keepers &&
            this.cnt(CRAWLER) > 0
          )
            add(85, cost, true, () => this.castIS(cd));
        } else if (n === 'Flux') {
          if (
            this.drawOk(2) &&
            this.hand.some((c) => c.land !== null || HOLD.has(c.name))
          )
            add(sc, cost, true, () => this.castIS(cd));
        } else if (
          k >= 4 &&
          total <= this.library.length - (this.cfg.keep_library as number) &&
          (!keepers || this.cnt(CRAWLER) > 0)
        )
          add(this.cnt(CRAWLER) ? 85 : 40, cost, true, () => this.castIS(cd));
        continue;
      }
      if (n === 'Pull from Tomorrow') {
        let x = Math.min(this.maxX(this.imitatorReady() ? 3 : 2), room);
        if (!this.safe()) x = Math.min(x, 6);
        if (x >= 2)
          add(
            Math.min(98, (winP ? 70 : 30) + 4 * x),
            Cost.parse('{U}{U}').withGeneric(x),
            true,
            () =>
              this.castIS(
                cd,
                false,
                Cost.parse('{U}{U}').withGeneric(x),
                `x=${x}`,
              ),
          );
        continue;
      }
      if (n === 'Treasure Cruise') {
        const base = this.effCost(cd);
        const d = Math.min(this.gy.length, base.g);
        const c = base.withGeneric(base.g - d);
        if (this.drawOk(1))
          add(sc + (winP ? 30 : 0) - (d < 3 ? 25 : 0), c, true, () =>
            this.cruise(cd, d),
          );
        continue;
      }
      if (n === FOLIO) {
        add(sc, cost, false, () => this.castPerm(cd));
        continue;
      }
      if (n === TRIO) {
        add(sc, cost, false, () => this.castPerm(cd));
        continue;
      }
      if (n === 'Volatile Stormdrake' || n === 'Thunderclap Drake')
        sc +=
          n === 'Thunderclap Drake' &&
          this.hand.filter((c) => c.isIS).length >= 2
            ? 10
            : 0;
      if (
        cd.isCreature ||
        cd.types.has('artifact') ||
        cd.types.has('enchantment') ||
        cd.types.has('planeswalker')
      ) {
        if (n === TEFERI && !this.drawOk(2)) sc = Math.min(sc, 30);
        add(sc, cost, false, () => this.castPerm(cd));
      }
    }
    this.abilities(out, main2, room, winP);
    return out;
  }

  cruise(cd: CardDef, d: number): boolean {
    const base = this.effCost(cd);
    const cost = base.withGeneric(base.g - d);
    if (!this.pay(cost, true)) return false;
    for (let i = 0; i < d; i++) this.exile.push(this.gy.pop()!);
    removeIfPresent(this.hand, cd);
    this.say('cast Treasure Cruise (delve', d + ')');
    this.spellsCast += 1;
    this.onCastIS(false);
    this.draw(3);
    this.exile.push(cd);
    this.imitate(cd, null);
    return true;
  }

  /** Activated abilities. */
  abilities(out: Cand[], main2: boolean, room: number, winP: boolean): void {
    const add = (score: number, cost: Cost, act: () => boolean) =>
      out.push({ score, cost, isIS: false, act });
    const boost = winP ? 40 : 0;
    const ready = (p: Perm) => !p.tapped && !(p.isCreature && p.sick);
    for (const p of this.bf) {
      const n = p.cd.name;
      if (n === SAILOR && this.drawOk(1))
        add(
          40 + boost,
          Cost.parse('{3}{U}'),
          () => this.pay(Cost.parse('{3}{U}')) && (this.draw(1), true),
        );
      else if (
        n === 'Thunderclap Drake' &&
        this.commanderCasts > 0 &&
        this.hand.some((c) =>
          [
            'Windfall',
            'Flux',
            'Pull from Tomorrow',
            'Treasure Cruise',
          ].includes(c.name),
        ) &&
        (this.winPiece() || this.safe())
      )
        add(88, Cost.parse('{2}{U}'), () => {
          if (!this.pay(Cost.parse('{2}{U}'))) return false;
          this.dies(p);
          this.drakeCopies = this.commanderCasts;
          return true;
        });
      else if (n === STRIX && ready(p))
        add(34, Cost.parse('{1}{U}'), () =>
          this.tapPay(p, '{1}{U}', () => {
            this.draw(1);
            this.discard(1);
          }),
        );
      else if (n === THIEF && ready(p) && this.ener >= 3 && this.drawOk(1))
        add(44 + boost, new Cost(), () => {
          p.tapped = true;
          this.ener -= 3;
          this.draw(1);
          return true;
        });
      else if (n === CARTO && ready(p) && this.ener >= 6 && this.drawOk(3))
        add(60 + boost, new Cost(), () => {
          p.tapped = true;
          this.ener -= 6;
          this.draw(3);
          return true;
        });
      else if (n === SPHERE && this.drawOk(1) && main2)
        add(30 + boost, new Cost(), () => {
          this.dies(p);
          this.draw(1);
          return true;
        });
      else if (n === FOLIO && ready(p)) {
        const x = Math.min(this.maxX(0, 2), room);
        if (x >= 1)
          add(Math.min(96, 30 + 6 * x + boost), new Cost(2 * x), () =>
            this.tapPay(p, '{' + 2 * x + '}', () => {
              this.draw(x);
              if (this.inArena()) this.arena!.eachDraws(this, x);
            }),
          );
      } else if (n === ORMOS) {
        const names = new Set<string>();
        const picks: CardDef[] = [];
        for (const c of this.hand
          .slice()
          .sort((a, b) => this.cardValue(a) - this.cardValue(b))) {
          if (names.has(c.name) || this.cardValue(c) > 50) continue;
          names.add(c.name);
          picks.push(c);
          if (picks.length === 3) break;
        }
        if (picks.length === 3 && this.drawOk(5))
          add(50 + boost, Cost.parse('{1}{U}{U}'), () => {
            if (!this.pay(Cost.parse('{1}{U}{U}'))) return false;
            for (const c of picks) {
              removeIfPresent(this.hand, c);
              this.toGy(c);
            }
            this.draw(5);
            return true;
          });
      } else if (n === WCLASS) {
        if (p.counters === 1)
          add(62, Cost.parse('{2}{U}'), () =>
            this.levelUp(p, '{2}{U}', () => this.draw(2)),
          );
        else if (p.counters === 2 && this.draws(1) >= 1)
          add(48, Cost.parse('{4}{U}'), () =>
            this.levelUp(p, '{4}{U}', () => {}),
          );
      } else if (n === JACE) {
        if (p.counters < 90 && !p.exhausted)
          add(winP || this.safe() ? 99 : 70, new Cost(), () => this.jace(p));
      } else if (
        n === AVISHKAR &&
        this.speed >= 4 &&
        ready(p) &&
        this.hand.some((c) => this.cardValue(c) < 30)
      )
        add(30, Cost.parse('{3}'), () =>
          this.tapPay(p, '{3}', () => {
            this.discard(1);
            this.draw(1);
          }),
        );
      else if (n === PASSAGE && ready(p) && main2 === false) {
        const big = this.creatures().filter(
          (q) => !this.evasive(q) && !q.sick && !q.tapped && this.power(q) >= 6,
        );
        if (big.length)
          add(20 + 4 * this.power(big[0]), Cost.parse('{4}'), () =>
            this.passage(p, big[0]),
          );
      } else if (n === TRIO && ready(p)) {
        const others = this.creatures().filter((q) => q !== p && !q.tapped);
        if (others.length >= 2 && this.drawOk(3))
          add(50 + boost, Cost.parse('{U}'), () => this.trio(p, others));
      } else if (n === VECNA) {
        const t = this.carrier();
        if (t && !(t.marks & M_VECNA) && this.hand.length >= 4)
          add(40, new Cost(2), () => this.equip(p, t, M_VECNA));
      } else if (n === MICRO) {
        const t = this.carrier();
        if (t && !(t.marks & M_MICRO))
          add(15, new Cost(2), () => this.equip(p, t, M_MICRO));
      }
    }
  }
  tapPay(p: Perm, cost: string, f: () => void): boolean {
    if (!this.pay(Cost.parse(cost))) return false;
    p.tapped = true;
    f();
    return true;
  }
  levelUp(p: Perm, cost: string, f: () => void): boolean {
    if (!this.pay(Cost.parse(cost))) return false;
    p.counters += 1;
    f();
    return true;
  }
  equip(eq: Perm, t: Perm, mark: number): boolean {
    if (!this.pay(new Cost(2))) return false;
    for (const q of this.bf) q.marks &= ~mark;
    t.marks |= mark;
    this.say('equip', eq.cd, 'to', t.cd);
    return true;
  }
  passage(p: Perm, t: Perm): boolean {
    if (!this.pay(Cost.parse('{4}'))) return false;
    p.tapped = true;
    t.marks |= M_UNBLOCK;
    return true;
  }
  trio(p: Perm, others: Perm[]): boolean {
    if (!this.pay(Cost.parse('{U}'))) return false;
    p.tapped = true;
    others[0].tapped = true;
    others[1].tapped = true;
    this.say('Harmonized Trio: a copy of Brainstorm');
    this.spellsCast += 1;
    this.onCastIS(false);
    this.resolve(C.get('Brainstorm'));
    return true;
  }
  /** Jace +1: mill ourselves two (when the mill is the plan) and draw. */
  jace(p: Perm): boolean {
    p.exhausted = true;
    p.counters += 1;
    const mill = this.library.length > 3 && this.winPiece();
    if (mill) {
      for (let i = 0; i < 2 && this.library.length; i++)
        this.toGy(this.library.shift()!);
    }
    this.say('Jace +1' + (mill ? ' (mills us two)' : ''));
    this.draw(1);
    return true;
  }

  // ================================================================ spells
  override resolve(
    cd: CardDef,
    fromGy = false,
    mode: string | null = null,
  ): void {
    const n = cd.name;
    if (n === 'Tune the Narrative') {
      this.draw(1);
      this.ener += 2;
    } else if (n === 'Flux') {
      const all =
        this.safe() &&
        this.refillDraws(this.hand.length, true) >= this.library.length;
      const bad = all
        ? this.hand.slice()
        : this.hand
            .filter((c) => c !== cd && (c.land !== null || HOLD.has(c.name)))
            .sort((a, b) => this.cardValue(a) - this.cardValue(b))
            .slice(0, 4);
      for (const c of bad) {
        removeIfPresent(this.hand, c);
        this.toGy(c);
      }
      this.draw(bad.length + 1);
    } else if (n === 'Windfall') {
      const k = this.hand.length;
      for (const c of this.hand.splice(0)) this.toGy(c);
      this.draw(this.inArena() ? this.arena!.wheel(this, k) : Math.max(k, 7));
    } else if (n === 'Pull from Tomorrow') {
      const x = parseInt((mode ?? 'x=0').slice(2), 10);
      this.draw(x);
      this.discard(1);
    } else if (n === 'Frantic Search') {
      this.draw(2);
      this.discard(2);
      this.untapLands(3);
    } else super.resolve(cd, fromGy, mode);
  }
  /** Slick Imitator at max speed: {1}, sacrifice it: copy a spell we cast (a copy of a draw spell draws again). */
  imitatorReady(): boolean {
    return this.speed >= 4 && this.onBf(IMITATOR);
  }
  imitate(cd: CardDef, mode: string | null): void {
    const im = this.perm(IMITATOR);
    if (!im || this.speed < 4 || !this.pay(new Cost(1), true)) return;
    this.dies(im);
    this.say('Slick Imitator copies', cd);
    this.resolve(cd, false, mode);
  }
  override castIS(
    cd: CardDef,
    fromGy = false,
    base: Cost | null = null,
    mode: string | null = null,
    trig: Record<string, unknown> = {},
  ): boolean {
    if (!super.castIS(cd, fromGy, base, mode, trig)) return false;
    if (IMITATE.has(cd.name)) {
      for (let i = 0; i < this.drakeCopies; i++) this.resolve(cd, false, mode);
      if (this.drakeCopies)
        this.say(
          'Thunderclap Drake: ' +
            this.drakeCopies +
            ' cop' +
            (this.drakeCopies > 1 ? 'ies' : 'y') +
            ' of',
          cd,
        );
      this.drakeCopies = 0;
      this.imitate(cd, mode);
    }
    return true;
  }
  override castPerm(cd: CardDef, fromCommand = false): boolean {
    const ok = super.castPerm(cd, fromCommand);
    if (ok) {
      // Pensive Professor: Increment (not modelled); Thunderclap Drake etc. are plain creatures here
    }
    return ok;
  }

  // ================================================================ the planner's score
  override positionValue(): number {
    if (this.died) return -5000;
    this.purgeSpawns();
    let v = 0;
    const start = this.cfg.opp_life as number;
    for (const l of this.life)
      v += 3 * (start - Math.max(0, l)) + (l <= 0 ? 40 : 0);
    v += 12 * this.speed;
    v += 18 * Math.min(10, this.manaSources());
    v +=
      3 * this.hand.length +
      0.3 * this.hand.reduce((s, c) => s + this.cardValue(c), 0);
    for (const p of this.bf) {
      if (p.land !== null) continue;
      if (p.token) {
        v += p.cd === TOK.spawn ? 3 : 4 + 2 * this.power(p);
        continue;
      }
      v += 0.8 * this.value(p.cd) + 2 * p.counters;
      if (this.evasive(p)) v += 2 * this.power(p);
    }
    const seas = this.perm(SEAS);
    if (seas) v += 3 * seas.counters;
    // the mill: progress is good only when it is safe (a win piece on the battlefield)
    const lib = this.library.length;
    if (this.winPiece()) v += 120 + 2 * (60 - lib);
    else if (this.safe()) v += 2 * Math.max(0, 40 - lib) * 0.5;
    else if (lib < (this.cfg.keep_library as number) + 2) v -= 150;
    if (this.onBf(TOAD)) v += 6 * Math.max(0, this.hand.length - 8);
    if (this.cnt(CRAWLER) && this.draws(1) > 1) v += 25;
    return v;
  }
}
