/**
 * The "Codie" deck's AI (Codie, Vociferous Codex: five-colour spells combo, bracket 4): the rules of its cards,
 * what it does each turn, and the kill / loop solver (see PLAN.md).
 *
 * Win: all three opponents dead (40 life each) with an X spell: Exsanguinate, Crackle with Power or Torment of
 * Hailfire, possibly copied (Reiterate, Return the Favor). The AI develops its mana and finds pieces; the solver
 * (solve()) looks for a line that kills this turn from the current hand, board and mana, and counts the win with
 * backup when a counterspell / protection spell is still castable afterwards.
 * Loops: Reiterate (buyback) on a spell that makes more than it costs to copy (Jeska's Will, Mana Geyser,
 * Brass's Bounty) is not played out: the solver recognises it and adds a big pile of that mana ("bottomless").
 * Codie cannot cast permanent spells; it taps for five mana for four and its free-spell trigger is not modelled.
 */
import * as C from "../../engine/cards";
import { Cost, CardDef, makeToken } from "../../engine/cards";
import { Game, Cand, KillSearcher, Perm, firstMax } from "../../engine/game";
import { MulliganRule } from "../../engine/mulligan";
import { MULLIGAN } from "./mulligan";

export const CODIE = "Codie, Vociferous Codex";
export const REITERATE = "Reiterate";
export const WILL = "Jeska's Will";
export const GEYSER = "Mana Geyser";
export const BOUNTY = "Brass's Bounty";
export const RTF = "Return the Favor";
export const EXSANG = "Exsanguinate";
export const CRACKLE = "Crackle with Power";
export const TORMENT = "Torment of Hailfire";
export const AD = "Ad Nauseam";
export const TEFERI = "Teferi's Protection";
export const DEMONIC = "Demonic Tutor";
export const FINISHERS = [EXSANG, CRACKLE, TORMENT];
export const VAULT = "Lim-Dûl's Vault";
export const FLASHBACK = "Flashback";
export const PROFANE = "Profane Tutor"; // the one mana value 0 instant or sorcery: Codie finds it for any spell of mana value 1
/** Mana value 1 spells that can be cast with no target: they trigger Codie's free spell (Profane Tutor). */
export const TRIGGER_SPELLS = ["Dark Ritual", "Silence", "Orim's Chant", "Fog", "Autumn's Veil"];
/** Spells that make mana when they resolve, and can be copied by Reiterate. */
export const MANA_SPELLS = [WILL, GEYSER, BOUNTY, "Seething Song", "Pyretic Ritual", "Dark Ritual"];

/** A Treasure token: any colour, gone when tapped. */
export const TREASURE = new CardDef("Treasure", { name: "Treasure", type_line: "Token Artifact — Treasure", token: true } as never);

/** Counterspells and protection that make a win "backed up": [cost, needs]. needs: "commander" (Codie on the battlefield), "island" (an Island to return). */
const BACKUP: Record<string, [string, string?]> = {
  Silence: ["{W}"], "Orim's Chant": ["{W}"], Counterspell: ["{U}{U}"], "Mana Drain": ["{U}{U}"], "Arcane Denial": ["{1}{U}"],
  "An Offer You Can't Refuse": ["{U}"], "Fierce Guardianship": ["{0}", "commander"], Daze: ["{0}", "island"],
  "Bilbo's Gambit": ["{1}{W}"], "Autumn's Veil": ["{G}"], "Narset's Reversal": ["{U}{U}"],
};
/** Cards the AI keeps in hand during development (interaction, protection and the pieces only the solver uses). */
const HOLD = new Set([...Object.keys(BACKUP), "Fog", "Constant Mists", "Teferi's Protection", "Avatar's Wrath", "Path to Exile",
  "Sundering Eruption", "Return the Favor", REITERATE, WILL, GEYSER, BOUNTY, "Seething Song", "Pyretic Ritual", "Dark Ritual",
  "Elvish Spirit Guide", "Simian Spirit Guide", "Mizzix's Mastery", "Spelltwine", "Flashback", "Bala Ged Recovery",
  "Splendid Reclamation", "Mana Geyser", EXSANG, CRACKLE, TORMENT, "Bring to Light", "Scapeshift", "Crop Rotation"]);

/** Land-fetching spells: [cost, what]. what: basic = a basic land; forest = a Forest card; types = a land with a basic land type. */
const FETCH: Record<string, { n: number; tapped: boolean; kind: "basic" | "forest" | "types" | "any"; sac?: number; hand?: boolean }> = {
  "Rampant Growth": { n: 1, tapped: true, kind: "basic" }, "Shared Roots": { n: 1, tapped: true, kind: "basic" },
  Farseek: { n: 1, tapped: true, kind: "types" }, "Nature's Lore": { n: 1, tapped: false, kind: "forest" },
  "Three Visits": { n: 1, tapped: false, kind: "forest" }, Cultivate: { n: 1, tapped: true, kind: "basic", hand: true },
  "Explosive Vegetation": { n: 2, tapped: true, kind: "basic" }, "Grow from the Ashes": { n: 1, tapped: false, kind: "basic" },
  "Cycle of Renewal": { n: 2, tapped: true, kind: "basic", sac: 1 }, "Planar Engineering": { n: 4, tapped: true, kind: "basic", sac: 2 },
  "Hour of Promise": { n: 2, tapped: true, kind: "any" },
};
/** How much we want to cast each spell during development. */
const VALUE: Record<string, number> = {
  "Nature's Lore": 88, "Three Visits": 88, "Rampant Growth": 86, Farseek: 86, "Shared Roots": 82, Cultivate: 84,
  "Grow from the Ashes": 78, "Explosive Vegetation": 74, "Cycle of Renewal": 40, "Planar Engineering": 50, "Hour of Promise": 60,
  "Sylvan Scrying": 62, "Growth Spiral": 60, Manamorphose: 70, Brainstorm: 52, "Flow State": 50, "Stock Up": 54,
  "Frantic Search": 40, Windfall: 44, "Valakut Awakening": 30, "Demonic Tutor": 66, "Vampiric Tutor": 50, "Personal Tutor": 40,
  "Merchant Scroll": 40, "Lim-Dûl's Vault": 36, "Profane Tutor": 36, [AD]: 56, [CODIE]: 95,
};
const NO_SEARCH: KillSearcher<null> = { search: () => 0, lastLine: null, lastP: null, bestMiss: null, minChance: 1 };

C.registerKnown([...Object.keys(VALUE), ...HOLD, CODIE, "Sylvan Scrying", "Valakut Awakening // Valakut Stoneforge",
  "Bala Ged Recovery // Bala Ged Sanctuary", "Sundering Eruption // Volcanic Fissure"]);

function removeOne<T>(xs: T[], x: T): void {
  const i = xs.indexOf(x);
  if (i >= 0) xs.splice(i, 1);
}

/** What the solver found. */
export interface Line {
  steps: string[];
  backup: boolean;
  nextTurn?: boolean; // the kill is on the next turn (Ad Nauseam + Teferi's Protection put the library in hand, the mana is spent)
}

export class CodieGame extends Game<CodieGame> {
  override mulliganRule(): MulliganRule | null {
    return this.cfg.smart_mulligan ? MULLIGAN : null;
  }
  override colors = ["W", "U", "B", "R", "G"];
  commanderCasts = 0;
  loopUsed: string | null = null; // the loop the solver used on the way to the kill
  winLine: string[] = []; // the kill line (for the trace)
  lines = 0; // solver calls (for the stats)
  digAll = false; // a Jeska's Will loop with Codie out: every copy also exiles three cards we may play, so the whole library is within reach
  suspended: number[] = []; // Profane Tutor suspended: turns left
  knownTop = 0; // cards on top of the library the player knows (a tutor to the top, Lim-Dul's Vault): a draw spell may then be used in the kill search
  libraryInHand = false; // Ad Nauseam + Teferi's Protection drew the library
  nextTurn = false; // this copy is the next turn of a solver line
  nextTurnKillFound = false; // the kill the solver found is on the next turn
  codieArmed = 0; // Codie activations whose free-spell trigger is waiting for the next spell this turn
  seenBy7 = new Set<string>(); // cards that were in hand at some point up to turn 7 (for --diag)
  mana7 = 0;
  lands7 = 0;

  override clone(): this {
    const g = super.clone();
    g.suspended = this.suspended.slice();
    return g;
  }
  /** Suspended Profane Tutor arrives: a free tutor. Mana Drain (flat option): 2 to 5 colourless from an opponent's spell. */
  override upkeep(): void {
    if (this.suspended.length) {
      this.suspended = this.suspended.map((x) => x - 1);
      const due = this.suspended.filter((x) => x <= 0).length;
      this.suspended = this.suspended.filter((x) => x > 0);
      for (let i = 0; i < due; i++) { this.say("Profane Tutor arrives"); this.fetchCard(this.tutorWant(), false); }
    }
    if (this.cfg.mana_drain_flat && this.turn >= 2) {
      const md = this.card("Mana Drain");
      if (md) { removeOne(this.hand, md); this.gy.push(md); this.pool.C += 2 + Math.floor(this.rng.random() * 4); }
    }
  }
  override startTurn(): void {
    super.startTurn();
    const d = this.cfg.opp_decay as number;
    if (d > 0) for (let i = 0; i < this.life.length; i++) this.life[i] = Math.min(this.life[i], Math.max(10, (this.cfg.opp_life as number) - d * (this.turn - 1)));
  }
  /** Torment of Hailfire: how many times each opponent pays (sacrifice / discard) before losing life. */
  payments(): number {
    return this.cfg.opp_payments_decay ? Math.max(1, 7 - (this.turn - 1)) : (this.cfg.opp_payments as number);
  }
  override diag(): Record<string, number | null> {
    const had = (names: string[]) => (names.some((n) => this.seenBy7.has(n)) ? 1 : 0);
    return { loop: this.loopUsed ? 1 : 0, died: this.died ? 1 : 0, reit7: had([REITERATE]), loopPiece7: had([WILL, GEYSER, BOUNTY]),
      fin7: had(FINISHERS), tutor7: had([DEMONIC, "Vampiric Tutor", "Personal Tutor"]), mana7: this.mana7, lands7: this.lands7,
      all3: had([REITERATE]) && had([WILL, GEYSER, BOUNTY]) && had(FINISHERS) ? 1 : 0 };
  }

  // ================================================================ rules of the cards
  oppHand(): number {
    return this.cfg.opp_hand as number;
  }
  oppTapped(): number {
    const fixed = this.cfg.opp_tapped_lands as number;
    return fixed > 0 ? fixed : Math.round((this.cfg.opp_tapped_per_turn as number) * this.turn);
  }
  inHand(name: string): boolean {
    return this.hand.some((c) => c.name === name);
  }
  card(name: string): CardDef | undefined {
    return this.hand.find((c) => c.name === name);
  }
  override commanderCost(_cd: CardDef, cost: Cost): Cost {
    return cost.withGeneric(cost.g + 2 * this.commanderCasts);
  }
  override onCommanderCast(_cd: CardDef): void {
    this.commanderCasts += 1;
  }
  /** Generic costs: tap colourless, then green and white lands first; keep red (Reiterate), black (the finishers) and blue (counters). */
  override rankAdjust(short: string, kind: string, rank: number): number {
    if (short !== "N") return rank;
    const order: Record<string, number> = { C: 2, G: 3, W: 3.2, U: 3.4, R: 4.2, B: 4.4 };
    const base = order[kind];
    if (base === undefined) return rank;
    if (!this.keepColours().has(kind)) return base;
    // a colour we still need: tap the one we have the most sources of first (keep the single Plains, spend the Mountains)
    const n = this.bf.filter((p) => !p.tapped && p.land !== null && this.srcKind(p) === kind).length;
    return 6 + 1 / Math.max(1, n);
  }
  /** Colours the cards in hand still need (so generic costs are paid with the other colours). */
  keepColours(): Set<string> {
    const s = new Set<string>(["R"]);
    for (const c of this.hand) {
      const n = c.name;
      if (n === EXSANG || n === TORMENT || n === DEMONIC || n === "Vampiric Tutor" || n === "Dark Ritual" || n === AD) s.add("B");
      if (n === AD) s.add("W"); // Ad Nauseam comes with Teferi's Protection ({2}{W})
      const b = BACKUP[n];
      if (b) for (const col of b[0].match(/[WUBRG]/g) ?? []) s.add(col);
      if (n === TEFERI) s.add("W");
    }
    return s;
  }
  override srcKind(p: Perm, ignoreSick = false): string | null {
    if (p.cd === TREASURE) return "A";
    return super.srcKind(p, ignoreSick);
  }
  /** A Treasure that was tapped for mana is gone (done outside pay(): the engine pays speculatively). */
  purgeTreasures(): void {
    for (const p of this.bf.slice()) if (p.cd === TREASURE && p.tapped) this.bf.splice(this.bf.indexOf(p), 1);
  }
  override ritualCandidates(_cands: Cand[]): Cand[] {
    return [];
  }

  /** Put a land from the library onto the battlefield (or into the hand). Returns the land or null. */
  fetchLand(kind: "basic" | "forest" | "types" | "any", tapped: boolean, toHand = false): CardDef | null {
    const ok = (c: CardDef) => {
      const l = c.land;
      if (!l) return false;
      if (kind === "basic") return !!l.basic;
      if (kind === "forest") return !!l.forest;
      if (kind === "types") return !!(l.plains || l.island || l.swamp || l.mountain);
      return true;
    };
    const have = new Set(this.landsBf().map((p) => p.cd.name));
    const need = this.wantColours();
    const score = (c: CardDef) => {
      let s = 0;
      for (const col of need) if (C.landMakes(c, col)) s += 4;
      if (!c.land!.basic) s += 1; // nonbasics are better (more colours, or utility)
      if (have.has(c.name) && c.land!.basic) s += 0.5;
      if (c.name === "Glacial Chasm" || c.name === "Maze of Ith" || c.name === "Volatile Fault") s -= 20;
      if (c.name === "Field of the Dead" && !toHand) s -= 3;
      return s;
    };
    const cands = this.library.filter(ok);
    if (!cands.length) return null;
    const pick = firstMax(cands, score);
    removeOne(this.library, pick);
    this.shuffle();
    if (toHand) this.hand.push(pick);
    else {
      const t = tapped || this.entersTapped(pick) || pick.land!.etb === "tapped";
      const p = new Perm(pick, pick.land, t);
      p.sick = false;
      this.bf.push(p);
      this.onLandEnter(p, false);
    }
    return pick;
  }
  /** Colours we are short of for the cards in hand (red for Reiterate, black for the finishers, ...). */
  wantColours(): string[] {
    const want: string[] = [];
    const have = (col: string) => this.landsBf().filter((p) => C.landMakes(p.cd, col)).length;
    for (const [col, n] of [["R", 2], ["B", 2], ["U", 2], ["W", 1], ["G", 1]] as [string, number][])
      if (have(col) < n) want.push(col);
    return want;
  }

  // ================================================================ spells
  override resolve(cd: CardDef, fromGy = false, mode: string | null = null): void {
    const n = cd.name;
    const f = FETCH[n];
    if (f) {
      for (let i = 0; i < (f.sac ?? 0); i++) this.sacLand();
      for (let i = 0; i < f.n; i++) {
        if (f.hand && i === 1) this.fetchLand(f.kind, true, true);
        else this.fetchLand(f.kind, f.tapped);
      }
    } else if (n === "Sylvan Scrying") this.fetchLand("any", false, true);
    else if (n === "Growth Spiral") {
      this.draw(1);
      const l = this.hand.find((c) => c.land !== null && !this.entersTapped(c));
      if (l && !this.landPlayed) { /* the land drop is played by the AI */ }
    } else if (n === "Seething Song") this.pool.R += 5;
    else if (n === "Pyretic Ritual") this.pool.R += 3;
    else if (n === "Dark Ritual") this.pool.B += 3;
    else if (n === WILL) this.pool.R += this.oppHand();
    else if (n === GEYSER) this.pool.R += this.oppTapped();
    else if (n === BOUNTY) for (let i = 0; i < this.landsBf().length; i++) this.bf.push(new Perm(TREASURE));
    else if (n === "Manamorphose") {
      const w = this.wantColours();
      const a = w[0] ?? "R", b = w[1] ?? w[0] ?? "B";
      this.pool[a as "R"] += 1;
      this.pool[b as "R"] += 1;
      this.draw(1);
    } else if (n === "Brainstorm") { this.draw(3); this.putBack(2); }
    else if (n === "Flow State") this.lookPick(3, 1);
    else if (n === "Stock Up") this.lookPick(5, 2);
    else if (n === "Valakut Awakening") {
      const bad = this.hand.filter((c) => c !== cd && (HOLD.has(c.name) ? false : c.land !== null || this.value(c) < 45));
      for (const c of bad) { removeOne(this.hand, c); this.library.push(c); }
      this.draw(bad.length + 1);
    } else if (n === AD) this.adNauseam();
    else if (n === DEMONIC || n === PROFANE) this.fetchCard(this.tutorWant(), false);
    else if (n === VAULT) this.vaultStack();
    else if (n === "Windfall") {
      const k = this.hand.length;
      for (const c of this.hand.splice(0)) this.toGy(c);
      this.draw(Math.max(k, 7));
    }
    else if (n === "Vampiric Tutor") { this.fetchCard(this.tutorWant(), true); this.loseLife(2); }
    else if (n === "Personal Tutor") this.fetchCard(this.tutorWant((c) => c.isSorcery), true);
    else if (n === "Merchant Scroll") this.fetchCard(this.tutorWant((c) => c.isInstant && c.isBlue), false);
    else super.resolve(cd, fromGy, mode);
  }
  sacLand(): void {
    const l = this.landsBf().filter((p) => p.land?.basic).sort((a, b) => +b.tapped - +a.tapped)[0] ?? this.landsBf()[0];
    if (l) removeOne(this.bf, l);
  }
  putBack(k: number): void {
    for (let i = 0; i < Math.min(k, this.hand.length); i++) {
      const c = this.hand.reduce((best, x) => (this.cardValue(x) < this.cardValue(best) ? x : best));
      removeOne(this.hand, c);
      this.library.unshift(c);
    }
  }
  lookPick(n: number, k: number): void {
    const top = this.library.splice(0, n);
    top.sort((a, b) => this.cardValue(b) - this.cardValue(a));
    this.hand.push(...top.slice(0, k));
    this.library.push(...top.slice(k));
  }
  /** The card the AI wants most from the library (the missing piece of a kill; see wantList). */
  tutorWant(ok: (c: CardDef) => boolean = () => true): CardDef | null {
    const cands = this.library.filter(ok);
    if (!cands.length) return null;
    // 1. a card that completes a kill line (tried on a copy of the game)
    if (!this.inRollout || this.cfg.rollout_solver) {
      for (const name of this.wantList()) {
        const c = cands.find((x) => x.name === name);
        if (!c) continue;
        const g = this.light();
        g.hand.push(c);
        if (g.solve() !== null) return c;
      }
    }
    // 2. the best missing piece
    for (const name of this.wantList()) {
      const c = cands.find((x) => x.name === name);
      if (c) return c;
    }
    return firstMax(cands, (c) => this.cardValue(c));
  }
  wantList(): string[] {
    const have = (n: string) => this.inHand(n);
    const out: string[] = [];
    if (!have(REITERATE)) out.push(REITERATE);
    if (!FINISHERS.some(have)) out.push(TORMENT, CRACKLE, EXSANG);
    if (![WILL, GEYSER, BOUNTY].some(have)) out.push(WILL, BOUNTY, GEYSER);
    if (!have(AD) || !have(TEFERI)) out.push(AD, TEFERI);
    out.push(...MANA_SPELLS.filter((n) => !have(n)), ...FINISHERS, RTF);
    return out;
  }
  fetchCard(c: CardDef | null, toTop: boolean): void {
    if (!c) return;
    removeOne(this.library, c);
    this.shuffle();
    if (toTop) this.library.unshift(c);
    else this.hand.push(c);
    this.say("tutor ->", c, toTop ? "(top)" : "");
  }
  /** Ad Nauseam: reveal cards until a limit on life (always the whole library with Teferi's Protection). */
  adNauseam(): void {
    const floor = this.cfg.ad_floor as number;
    while (this.library.length && this.life_ok()) {
      const c = this.library[0];
      if (this.myLife - c.mv < floor) break;
      this.library.shift();
      this.hand.push(c);
      this.loseLife(c.mv);
    }
    this.say("Ad Nauseam: hand", this.hand.length, "life", this.myLife);
  }
  life_ok(): boolean {
    return !this.died;
  }
  override castPerm(cd: CardDef, fromCommand = false): boolean {
    if (!fromCommand && cd.name !== CODIE) return false; // Codie: no permanent spells (the Spirit Guides are only ever exiled)
    return super.castPerm(cd, fromCommand);
  }
  override loseLife(n: number): void {
    this.myLife -= n;
    if (this.myLife <= 0 && !this.died) {
      this.died = true;
      this.say("we die");
    }
  }

  // ================================================================ what to do
  value(cd: CardDef): number {
    return VALUE[cd.name] ?? 20;
  }
  override cardValue(cd: CardDef): number {
    if (cd.land !== null) {
      const m = this.manaSources() + this.countLandsHand();
      return m <= 4 ? 90 : m <= 7 ? 70 : m <= 10 ? 45 : 20;
    }
    if (cd.name === REITERATE) return 95;
    if (FINISHERS.includes(cd.name)) return 80;
    if ([WILL, GEYSER, BOUNTY].includes(cd.name)) return 75;
    if (MANA_SPELLS.includes(cd.name) || cd.name === "Silence" || cd.name === "Orim's Chant") return 60;
    if (HOLD.has(cd.name)) return 50;
    return this.value(cd);
  }
  /** Ad Nauseam is an instant: the AI casts it at the end of the turn (really the opponents' end step) with the mana it did not use,
   *  while life is high and the library big. No hand-size discard follows, so the whole pile is ours next turn. */
  override endTurn(): void {
    super.endTurn();
    const ad = this.card(AD);
    if (ad && this.cfg.ad_end_step && this.myLife >= 33 && this.library.length > 30 && this.canPay(this.effCost(ad), true)) this.castIS(ad);
  }
  override playLand(): void {
    // Glacial Chasm and Maze of Ith are never played (no mana, and Chasm sacrifices a land)
    const parked = this.hand.filter((c) => c.name === "Glacial Chasm" || c.name === "Maze of Ith");
    for (const c of parked) removeOne(this.hand, c);
    super.playLand();
    this.hand.push(...parked);
  }
  override landBias(cd: CardDef): number {
    if (cd.name === "Vesuva") return -2;
    if (cd.name === "Volatile Fault") return -3;
    return 0;
  }

  candidates(_main2: boolean): Cand[] {
    this.purgeTreasures();
    const out: Cand[] = [];
    const add = (score: number, cost: Cost, isIS: boolean, act: () => boolean) => out.push({ score, cost, isIS, act });
    // Codie: {4}, T: WUBRG (net +1 mana, all five colours) and the next spell makes a free cheaper instant or sorcery
    const cp = this.perm(CODIE);
    const trig = TRIGGER_SPELLS.map((s) => this.card(s)).find((c) => c !== undefined);
    const profane = this.library.some((c) => c.name === PROFANE);
    if (cp && !cp.tapped && !cp.sick && this.cfg.codie_dev) add(trig && profane && this.availMana() >= 5 ? 82 : 58, new Cost(4), false, () => this.codie());
    // with Codie armed, a spell of mana value 1 makes the free Profane Tutor: any card
    if (this.codieArmed > 0 && profane) for (const s of TRIGGER_SPELLS) { const c = this.card(s); if (c) add(92, this.effCost(c), true, () => this.castIS(c)); }
    // Spirit Guides: exile one for mana when that lets us cast a spell we could not cast otherwise this turn
    if (this.cfg.guides_dev) {
      for (const [g, col] of [["Elvish Spirit Guide", "G"], ["Simian Spirit Guide", "R"]] as const) {
        const c = this.card(g);
        if (!c) continue;
        const avail = this.availMana();
        const need = this.hand.some((x) => x.land === null && !HOLD.has(x.name) && x !== c && (FETCH[x.name] || x.name === "Manamorphose" || x.name === DEMONIC)
          && x.mv === avail + 1);
        if (need) add(72, new Cost(), false, () => { this.exileFromHand(g); this.pool[col] += 1; return true; });
      }
    }
    const vault = this.card(VAULT);
    if (vault && this.hand.some((c) => ["Brainstorm", "Stock Up", "Manamorphose", "Flow State", "Frantic Search"].includes(c.name)) && this.myLife >= 25 && this.library.length >= 30)
      add(64, this.effCost(vault), true, () => this.castIS(vault));
    for (const cd of this.command.slice()) add(this.cfg.codie_early ? 95 : 45, this.commanderCost(cd, this.effCost(cd)), false, () => this.castPerm(cd, true));
    const seen = new Set<string>();
    for (const cd of this.hand.slice()) {
      if (seen.has(cd.name) || cd.land !== null) continue;
      seen.add(cd.name);
      const n = cd.name;
      if (HOLD.has(n)) continue;
      const cost = this.effCost(cd);
      let sc = this.value(cd);
      const f = FETCH[n];
      if (f) {
        const lands = this.landsBf().length;
        if (!this.library.some((c) => c.land !== null)) continue;
        if (f.sac && lands < 3) continue;
        if (n === "Hour of Promise" && lands < 5) continue;
        if (lands >= 9) sc -= 40;
        add(sc, cost, true, () => this.castIS(cd));
        continue;
      }
      if (n === "Frantic Search") {
        if (this.landsBf().filter((p) => p.tapped).length < 3) continue;
        add(sc + 20, cost, true, () => this.castIS(cd));
        continue;
      }
      if (n === "Windfall") {
        // a mid-game mulligan: only when no combo piece or tutor is in hand (discarding a good hand is a loss)
        const pieces = this.hand.some((c) => [REITERATE, WILL, GEYSER, BOUNTY, DEMONIC, PROFANE, AD, TEFERI, VAULT, ...FINISHERS].includes(c.name));
        if (!pieces || this.hand.length <= 2) add(sc + 20, cost, true, () => this.castIS(cd));
        continue;
      }
      if (n === PROFANE) { add(60, Cost.parse("{1}{B}"), false, () => this.suspendProfane(cd)); continue; } // suspend 2: a free tutor two turns later
      if (n === "Valakut Awakening") {
        const bad = this.hand.filter((c) => c !== cd && !HOLD.has(c.name) && (c.land !== null ? this.countLandsHand() > 2 : this.value(c) < 45));
        if (bad.length >= 2) add(sc, cost, true, () => this.castIS(cd));
        continue;
      }
      if (n === AD) continue; // cast at the end of the turn (endTurn)
      if (n === "Demonic Tutor" || n === "Vampiric Tutor" || n === "Personal Tutor" || n === "Merchant Scroll") {
        if (n === "Vampiric Tutor" || n === "Personal Tutor") continue; // the top of the library: needs a draw; only the solver uses them
        add(sc, cost, false, () => this.castIS(cd));
        continue;
      }
      if (n === "Manamorphose" || n === "Brainstorm" || n === "Flow State" || n === "Stock Up" || n === "Growth Spiral" || n === "Sylvan Scrying") {
        add(sc, cost, true, () => this.castIS(cd, false, n === "Manamorphose" ? this.manamorphoseCost() : null));
        continue;
      }
    }
    return out;
  }
  manamorphoseCost(): Cost {
    return Cost.parse(this.canPay(Cost.parse("{1}{R}")) ? "{1}{R}" : "{1}{G}");
  }

  // ================================================================ the planner's score
  override positionValue(): number {
    if (this.died) return -5000;
    this.purgeTreasures();
    let v = 0;
    v += 22 * Math.min(14, this.manaSources());
    v += 0.5 * this.hand.reduce((s, c) => s + this.cardValue(c), 0);
    if (this.onBf(CODIE)) v += 40;
    if (this.inHand(REITERATE)) v += 30;
    for (const n of [WILL, GEYSER, BOUNTY]) if (this.inHand(n)) v += 15;
    if (FINISHERS.some((n) => this.inHand(n))) v += 20;
    v += 3 * this.landsBf().filter((p) => !p.tapped).length;
    return v;
  }

  // ================================================================ the kill solver
  override checkKill(): number {
    if (this.turn <= 7) {
      for (const c of this.hand) this.seenBy7.add(c.name);
      if (this.turn === 7) { this.mana7 = this.manaSources(); this.lands7 = this.landsBf().length; }
    }
    if (this.died) return 2;
    const was = this.unprot;
    const r = super.checkKill();
    if (was === null && this.unprot !== null && this.nextTurnKillFound) {
      this.unprot = this.turn + 1;
      if (this.prot !== null) this.prot = this.turn + 1;
    }
    return r;
  }
  override play(): [number | null, number | null] {
    const [u, p] = super.play();
    return [this.died ? null : u, this.died ? null : p];
  }
  light(): CodieGame {
    const g = this.clone();
    g.verbose = false;
    g.inRollout = true;
    g.log = [];
    return g;
  }
  lightKey(): string {
    const hand = this.hand.map((c) => c.name).sort().join(",");
    const open = this.bf.filter((p) => !p.tapped && this.srcKind(p)).length;
    return `${hand}|${open}|${this.landsBf().length}|${JSON.stringify(this.pool)}|${this.bf.filter((p) => p.cd === TREASURE).length}`;
  }
  /** A kill is conceivable at all: a finisher, a tutor or Ad Nauseam is in hand. */
  override killReachable(_st: CodieGame): boolean {
    const h = (n: string) => this.inHand(n);
    return FINISHERS.some(h) || h(DEMONIC) || h(AD) || h("Vampiric Tutor") || h("Personal Tutor") || h("Bring to Light");
  }
  killSearch(): KillSearcher<CodieGame> {
    const ks: KillSearcher<CodieGame> = {
      lastLine: null, lastP: null, bestMiss: null, minChance: 1,
      search: (st: CodieGame) => {
        this.lines += 1;
        const r = st.solve();
        if (!r) return 0;
        ks.lastLine = r.steps;
        this.winLine = r.steps;
        this.nextTurnKillFound = !!r.nextTurn;
        if (r.steps.some((s) => s.startsWith("loop"))) this.loopUsed = "loop";
        return r.backup ? 2 : 1;
      },
    };
    return ks;
  }

  /** Solve for a kill this turn. Returns the line, with whether a counterspell / protection spell is still castable after it. */
  solve(): Line | null {
    const any = this.dfs(false);
    if (!any) return null;
    const prot = this.dfs(true);
    return prot ?? { ...any, backup: false };
  }
  private memo = new Set<string>();
  private nodes = 0;
  private maxNodes = 0;
  dfs(needBackup: boolean, maxNodes = this.cfg.solver_nodes as number): Line | null {
    this.memo = new Set<string>();
    this.nodes = 0;
    this.maxNodes = maxNodes;
    return this.step(this, [], 0, needBackup);
  }
  private step(g: CodieGame, steps: string[], depth: number, needBackup: boolean): Line | null {
    const key = g.lightKey() + (g.loopUsed ?? "");
    if (this.memo.has(key)) return null;
    this.memo.add(key);
    if (++this.nodes > this.maxNodes) return null; // a search budget: a rich hand can have a huge tree
    const fin = g.finish(needBackup);
    if (fin) return { steps: [...steps, ...fin], backup: needBackup, nextTurn: g.nextTurn };
    if (g.libraryInHand && !g.nextTurn) {
      const r = g.nextTurnLine(needBackup);
      if (r) return { steps: [...steps, ...r.steps], backup: r.backup, nextTurn: true };
    }
    if (depth >= 9) return null;
    for (const [name, apply] of g.moves()) {
      const g2 = g.clone();
      if (!apply(g2)) continue;
      const r = this.step(g2, [...steps, name], depth + 1, needBackup);
      if (r) return r;
    }
    return null;
  }

  /** Moves of the solver: things that make mana or find cards. Each is applied to a copy of the game. */
  moves(): [string, (g: CodieGame) => boolean][] {
    const out: [string, (g: CodieGame) => boolean][] = [];
    const has = (n: string) => this.inHand(n);
    // free mana: the Spirit Guides
    if (has("Elvish Spirit Guide")) out.push(["exile Elvish Spirit Guide: G", (g) => { g.exileFromHand("Elvish Spirit Guide"); g.pool.G += 1; return true; }]);
    if (has("Simian Spirit Guide")) out.push(["exile Simian Spirit Guide: R", (g) => { g.exileFromHand("Simian Spirit Guide"); g.pool.R += 1; return true; }]);
    // the loops: Reiterate with buyback on a spell that makes more than the copy costs
    if (has(REITERATE)) for (const s of [WILL, GEYSER, BOUNTY]) if (has(s)) out.push([`loop: ${s} + Reiterate`, (g) => g.loop(s)]);
    // Flashback: a tutor or a mana spell from the graveyard again (the loop piece too)
    if (has(FLASHBACK)) {
      for (const s of [DEMONIC]) if (this.gy.some((c) => c.name === s)) for (const t of this.targets()) out.push([`Flashback ${s} -> ${t.name}`, (g) => g.fbTutor(s, t.name)]);
      for (const s of MANA_SPELLS) if (this.gy.some((c) => c.name === s)) out.push([`Flashback ${s}`, (g) => g.fbCast(s)]);
      if (has(REITERATE)) for (const s of [WILL, GEYSER, BOUNTY]) if (this.gy.some((c) => c.name === s)) out.push([`loop: Flashback ${s} + Reiterate`, (g) => g.loop(s, true)]);
    }
    // rituals and mana spells, alone or with one Reiterate copy
    for (const s of MANA_SPELLS) {
      if (!has(s)) continue;
      out.push([`cast ${s}`, (g) => g.castMana(s, 0)]);
      if (has(REITERATE)) {
        out.push([`cast ${s} + Reiterate copy`, (g) => g.castMana(s, 1)]);
        out.push([`cast ${s} + Reiterate copy (buyback)`, (g) => g.castMana(s, 2)]);
      }
    }
    if (has("Manamorphose")) out.push(["Manamorphose", (g) => { const c = g.card("Manamorphose")!; return g.castIS(c, false, g.manamorphoseCost()); }]);
    if (has("Frantic Search")) out.push(["Frantic Search (untap 3 lands)", (g) => g.untapOnly("Frantic Search")]);
    if (this.onBf(CODIE)) out.push(["Codie: {4}, T: WUBRG", (g) => g.codie()]);
    // finding pieces
    if (has(DEMONIC)) for (const t of this.targets()) out.push([`Demonic Tutor -> ${t.name}`, (g) => g.tutor(DEMONIC, t.name, false)]);
    for (const tut of ["Vampiric Tutor", "Personal Tutor"]) {
      if (!has(tut)) continue;
      const draws = ["Manamorphose", "Brainstorm"].find((n) => has(n));
      if (!draws) continue;
      for (const t of this.targets()) {
        if (tut === "Personal Tutor" && !t.isSorcery) continue;
        out.push([`${tut} -> ${t.name}, then ${draws}`, (g) => g.tutor(tut, t.name, true) && g.drawCantrip(draws)]);
      }
    }
    // Codie + a spell of mana value 1: the free spell is always Profane Tutor (the only mana value 0 one): any card to hand
    if (this.onBf(CODIE) && this.library.some((c) => c.name === PROFANE)) {
      for (const s of TRIGGER_SPELLS) {
        if (!has(s)) continue;
        for (const t of this.targets()) out.push([`Codie + ${s} -> Profane Tutor -> ${t.name}`, (g) => g.codieTutor(s, t.name)]);
      }
    }
    if (has(VAULT)) out.push(["Lim-Dûl's Vault: the best five on top", (g) => g.vault()]);
    // draw spells are only used when every card they draw is known (a stacked top)
    for (const [n, k] of [["Manamorphose", 1], ["Brainstorm", 3], ["Frantic Search", 2], ["Stock Up", 5], ["Flow State", 3]] as [string, number][])
      if (has(n) && this.knownTop >= k) out.push([`${n} (known top)`, (g) => g.knownDraw(n)]);
    if (has(AD) && has(TEFERI)) out.push(["Teferi's Protection + Ad Nauseam: the whole library", (g) => g.adTeferi()]);
    return out;
  }
  /** Cards in the library the solver may want. */
  targets(): CardDef[] {
    const names = [REITERATE, CRACKLE, TORMENT, EXSANG, WILL, BOUNTY, GEYSER, AD, TEFERI, "Seething Song", "Pyretic Ritual", "Dark Ritual", RTF];
    return names.map((n) => this.library.find((c) => c.name === n)).filter((c): c is CardDef => !!c && !this.inHand(c.name));
  }
  /** Mana we could pay right now (the pool and every untapped source). */
  availMana(): number {
    let n = this.pool.U + this.pool.B + this.pool.C + this.pool.W + this.pool.R + this.pool.G;
    for (const p of this.bf) {
      if (p.tapped) continue;
      if (this.srcKind(p)) n += 1;
    }
    return n;
  }
  exileFromHand(name: string): void {
    const c = this.card(name)!;
    removeOne(this.hand, c);
    this.exile.push(c);
  }
  /** Cast a mana spell (and maybe copy it with a Reiterate that does not buy back). */
  castMana(name: string, copy: 0 | 1 | 2): boolean {
    const c = this.card(name)!;
    const rc = Cost.parse("{1}{R}{R}").plus(new Cost(copy === 2 ? 3 : 0));
    const total = copy ? c.cost.plus(rc) : c.cost;
    if (!this.canPay(total, true)) return false;
    if (!this.castIS(c)) return false;
    if (copy) {
      const r = this.card(REITERATE);
      if (!r || !this.pay(rc, true)) return false;
      if (copy === 1) { removeOne(this.hand, r); this.gy.push(r); } // (with buyback it stays in hand)
      this.spellsCast += 1;
      this.resolve(c);
    }
    return true;
  }
  /** What a Reiterate loop on this spell makes per copy: [yield, colour] (the copy costs 6: {1}{R}{R}{3} with buyback). */
  loopYield(s: string): [number, "R" | "any"] {
    if (s === WILL) return [this.oppHand(), "R"];
    if (s === GEYSER) return [this.oppTapped(), "R"];
    return [this.landsBf().length, "any"]; // Brass's Bounty: a Treasure for each land
  }
  /** The loop: cast s, then Reiterate (with buyback) copies it again and again. It grows when a copy makes more than the 6 it costs. */
  loop(s: string, viaFlashback = false): boolean {
    const c = viaFlashback ? this.gy.find((x) => x.name === s) : this.card(s);
    if (!c) return false;
    const [y] = this.loopYield(s);
    if (y < 7) return false;
    // both must be paid before the first copy resolves: s (with Flashback: {R} more), then Reiterate with buyback
    let first = c.cost.plus(Cost.parse("{1}{R}{R}").plus(new Cost(3)));
    if (viaFlashback) first = first.plus(Cost.parse("{R}"));
    if (!this.canPay(first, true)) return false;
    this.say(`LOOP: ${s}${viaFlashback ? " (Flashback)" : ""} + Reiterate (buyback): each copy makes ${y}, costs 6 -> bottomless`);
    this.loopUsed = s;
    this.startLoop(s, c, viaFlashback, first);
    return true;
  }
  /** Pay for the loop's first spell and add the bottomless mana. */
  startLoop(s: string, c: CardDef, viaFlashback: boolean, first: Cost): void {
    if (viaFlashback) {
      removeOne(this.gy, c);
      this.exile.push(c);
      const fb = this.card(FLASHBACK);
      if (fb) { removeOne(this.hand, fb); this.gy.push(fb); }
    } else {
      removeOne(this.hand, c);
      this.gy.push(c);
    }
    this.pay(first, true);
    if (this.loopYield(s)[1] === "R") this.pool.R += 99;
    else { this.pool.W += 99; this.pool.U += 99; this.pool.B += 99; this.pool.R += 99; this.pool.G += 99; }
    // Jeska's Will with a commander out: each copy also exiles the top three cards, which may be played this turn: the whole library
    if (s === WILL && this.onBf(CODIE)) this.digAll = true;
  }
  /** Flashback (R) on a spell in the graveyard: it may be cast again for its mana cost. */
  fbCast(name: string): boolean {
    const c = this.gy.find((x) => x.name === name);
    if (!c || !this.spend(FLASHBACK)) return false;
    return this.castIS(c, true);
  }
  fbTutor(name: string, target: string): boolean {
    const c = this.gy.find((x) => x.name === name);
    const t = this.library.find((x) => x.name === target);
    if (!c || !t || !this.spend(FLASHBACK)) return false;
    if (!this.pay(this.effCost(c, null, true), true)) return false;
    removeOne(this.gy, c);
    this.exile.push(c);
    removeOne(this.library, t);
    this.hand.push(t);
    return true;
  }
  suspendProfane(cd: CardDef): boolean {
    if (!this.pay(Cost.parse("{1}{B}"), true)) return false;
    removeOne(this.hand, cd);
    this.exile.push(cd);
    this.suspended.push(2);
    this.say("suspend Profane Tutor");
    return true;
  }
  /** Cast a spell for its cost without resolving it (the solver applies the effect itself). */
  spend(name: string, base: Cost | null = null): CardDef | null {
    const c = this.card(name);
    if (!c) return null;
    const cost = this.effCost(c, base);
    if (!this.pay(cost, true)) return null;
    removeOne(this.hand, c);
    this.gy.push(c);
    this.spellsCast += 1;
    return c;
  }
  untapOnly(name: string): boolean {
    if (!this.spend(name)) return false;
    this.untapLands(3);
    return true;
  }
  codie(): boolean {
    const p = this.perm(CODIE);
    if (!p || p.tapped || p.sick || !this.pay(new Cost(4))) return false;
    p.tapped = true;
    for (const k of ["W", "U", "B", "R", "G"] as const) this.pool[k] += 1;
    this.codieArmed += 1;
    return true;
  }
  /** Codie's trigger: when we next cast a spell, exile cards from the top until an instant or sorcery with lesser mana value, cast it
   *  free; the other cards go to the bottom in a random order. The effects are the AI's own (rituals add mana, tutors fetch, ...). */
  override castTriggers(cd: CardDef, _fromGy: boolean, _trig: Record<string, unknown>): void {
    while (this.codieArmed > 0) {
      this.codieArmed -= 1;
      const skipped: CardDef[] = [];
      let found: CardDef | null = null;
      while (this.library.length) {
        const c = this.library.shift()!;
        if (c.isIS && c.mv < cd.mv) { found = c; break; }
        skipped.push(c);
      }
      this.rng.shuffle(skipped);
      this.library.push(...skipped);
      if (found) {
        this.say("Codie: free", found);
        const first = Cost.parse("{1}{R}{R}").plus(new Cost(3));
        if ([WILL, GEYSER, BOUNTY].includes(found.name) && this.inHand(REITERATE) && this.loopYield(found.name)[0] >= 7 && this.canPay(first, true)) {
          this.say(`LOOP: free ${found.name} + Reiterate (buyback) -> bottomless`);
          this.loopUsed = found.name;
          this.startLoop(found.name, found, false, first);
          this.gy = this.gy.filter((x) => x !== found);
          this.gy.push(found);
          continue;
        }
        this.resolve(found);
        this.gy.push(found);
      }
    }
  }
  tutor(spell: string, target: string, top: boolean): boolean {
    const t = this.library.find((x) => x.name === target);
    if (!t || !this.spend(spell)) return false;
    removeOne(this.library, t);
    if (top) { this.library.unshift(t); this.knownTop = 1; }
    else this.hand.push(t);
    return true;
  }
  /** A draw spell on a stacked top: the cards it draws are known. */
  knownDraw(name: string): boolean {
    const c = this.spend(name, name === "Manamorphose" ? this.manamorphoseCost() : null);
    if (!c) return false;
    if (name === "Manamorphose") { this.draw(1); this.pool.R += 1; this.pool.B += 1; this.knownTop -= 1; }
    else if (name === "Brainstorm") { this.draw(3); this.putBack(2); this.knownTop = Math.max(0, this.knownTop - 1); }
    else if (name === "Frantic Search") { this.draw(2); this.discard(2); this.untapLands(3); this.knownTop -= 2; }
    else if (name === "Stock Up") { this.lookPick(5, 2); this.knownTop = 0; }
    else if (name === "Flow State") { this.lookPick(3, 1); this.knownTop = Math.max(0, this.knownTop - 3); }
    return true;
  }
  /** A cantrip that draws the card on top of the library (the solver puts a tutored card there first). */
  drawCantrip(name: string): boolean {
    const c = this.spend(name, name === "Manamorphose" ? this.manamorphoseCost() : null);
    if (!c) return false;
    const top = this.library.shift();
    if (top) this.hand.push(top);
    if (name === "Manamorphose") { this.pool.R += 1; this.pool.B += 1; } // two mana of the colours we need
    return true;
  }
  /** How much a card is worth in a stacked window (what completes a kill, tutors, Ad Nauseam + Teferi's Protection). */
  windowWeight(c: CardDef): number {
    const n = c.name;
    if (this.inHand(n)) return 0;
    if (n === TEFERI || n === AD) return 10;
    if (n === REITERATE) return 9;
    if (n === PROFANE) return this.onBf(CODIE) ? 8 : 3;
    if (n === WILL || n === GEYSER || n === BOUNTY || FINISHERS.includes(n)) return 7;
    if (n === DEMONIC || n === "Vampiric Tutor") return 6;
    if (n === "Seething Song" || n === "Dark Ritual" || n === "Pyretic Ritual") return 3;
    if (n === RTF || n === "Manamorphose") return 2;
    return 0;
  }
  /** Lim-Dul's Vault: look at the top five, pay 1 life to put them on the bottom and look at the next five, as often as we like; the
   *  last five go on top in the order we want. We take the best of the first twelve windows (1 life each, never below 15 life). Under
   *  Teferi's Protection no life can be paid, so this must be cast before it. */
  vaultStack(): void {
    const maxLooks = Math.min(12, Math.floor(this.library.length / 5), Math.max(1, this.myLife - 15));
    let best = 0, bestScore = -1;
    for (let w = 0; w < maxLooks; w++) {
      const s = this.library.slice(5 * w, 5 * w + 5).reduce((t, c) => t + this.windowWeight(c), 0) - 0.4 * w;
      if (s > bestScore) { best = w; bestScore = s; }
    }
    const skipped = this.library.splice(0, 5 * best);
    const win = this.library.splice(0, 5).sort((a, b) => this.windowWeight(b) - this.windowWeight(a));
    this.library.push(...skipped);
    this.shuffle();
    this.library.unshift(...win);
    this.loseLife(best);
    this.knownTop = win.length;
    this.say("Lim-Dul's Vault: window", best + 1, "on top, life", this.myLife);
  }
  vault(): boolean {
    if (!this.spend(VAULT)) return false;
    this.vaultStack();
    return true;
  }
  /** Codie activates (WUBRG for 4), the spell of mana value 1 is cast: the free Profane Tutor fetches the target. */
  codieTutor(spell: string, target: string): boolean {
    const t = this.library.find((x) => x.name === target);
    const pt = this.library.find((x) => x.name === PROFANE);
    if (!t || !pt || !this.codie()) return false;
    this.codieArmed -= 1; // used right away
    if (!this.spend(spell)) return false;
    if (spell === "Dark Ritual") this.pool.B += 3;
    removeOne(this.library, pt);
    removeOne(this.library, t);
    this.hand.push(t);
    this.gy.push(pt);
    return true;
  }
  adTeferi(): boolean {
    const total = Cost.parse("{3}{B}{B}").plus(Cost.parse("{2}{W}"));
    if (!this.canPay(total, true) || !this.card(TEFERI) || !this.card(AD)) return false;
    this.spend(TEFERI);
    this.spend(AD);
    const keep = Math.min(this.library.length, this.cfg.ad_keep as number); // the bottom cards stay in the library (Pontus: all but the last 5)
    this.hand.push(...this.library.splice(0, this.library.length - keep));
    this.libraryInHand = true;
    return true;
  }

  /** After Ad Nauseam + Teferi's Protection the whole library is in the hand and life can't change: the kill next turn, with all
   *  lands untapped, Codie ready and one more land drop. */
  nextTurnLine(needBackup: boolean): Line | null {
    const g = this.clone();
    g.nextTurn = true;
    g.turn += 1;
    g.pool = { U: 0, B: 0, C: 0, S: 0, W: 0, R: 0, G: 0 };
    g.bf = g.bf.filter((p) => p.cd !== TREASURE || !p.tapped);
    for (const p of g.bf) { p.tapped = false; p.sick = false; }
    const land = g.hand.find((c) => c.land !== null && c.land.mana !== "" && !g.entersTapped(c) && c.land.etb !== "tapped" && c.name !== "Glacial Chasm");
    if (land) {
      removeOne(g.hand, land);
      const p = new Perm(land, land.land, false);
      p.sick = false;
      g.bf.push(p);
    }
    const r = g.dfs(needBackup, 1500);
    return r ? { steps: ["(next turn, the library in hand)", ...r.steps], backup: r.backup, nextTurn: true } : null;
  }

  // ---------------------------------------------------------------- the finishers
  /** Does a counterspell / protection spell stay castable after this state? */
  backupReady(): boolean {
    for (const c of this.hand) {
      const b = BACKUP[c.name];
      if (!b) continue;
      if (b[1] === "commander" && !this.onBf(CODIE)) continue;
      if (b[1] === "island" && !this.landsBf().some((p) => p.land?.island)) continue;
      if (this.canPay(Cost.parse(b[0]), true)) return true;
    }
    return false;
  }
  /** Copies of a spell: the cost of n resolutions (the original and n-1 copies): k Reiterate casts (each {1}{R}{R}, buyback {3} on all
   *  but the last) and maybe one Return the Favor ({R}{R} + {1} for the copy mode). Null if the cards in hand can't do it. */
  copyCost(n: number): Cost | null {
    if (n <= 1) return new Cost();
    const hasR = this.inHand(REITERATE), hasF = this.inHand(RTF);
    let best: Cost | null = null;
    for (const f of hasF ? [0, 1] : [0]) {
      const k = n - 1 - f;
      if (k < 0 || (k > 0 && !hasR)) continue;
      const g = k + 3 * Math.max(0, k - 1) + f;
      const c = new Cost(g, 0, 0, 0, 0, 2 * k + 2 * f);
      if (best === null || c.mv < best.mv) best = c;
    }
    return best;
  }
  /** The kill: the cheapest X spell (with the cheapest copies) that kills every opponent, payable now. */
  finish(needBackup: boolean): string[] | null {
    const life = Math.max(...this.life.filter((l) => l > 0), 1);
    const opps = this.life.filter((l) => l > 0).length;
    for (const f of FINISHERS) {
      if (!this.inHand(f) && !(this.digAll && this.library.some((c) => c.name === f))) continue;
      for (let n = 1; n <= 6; n++) {
        const cc = this.copyCost(n);
        if (cc === null) continue;
        for (let x = 1; x <= 80; x++) {
          if (!this.kills(f, x, n, life, opps)) continue;
          const cost = (f === CRACKLE ? new Cost(3 * x, 0, 0, 0, 0, 2) : new Cost(x, 0, 2)).plus(cc);
          if (this.canPay(cost, true)) {
            if (needBackup) {
              const g = this.clone();
              g.pay(cost, true);
              if (!g.backupReady()) break;
            }
            return [`cast ${f} X=${x}${n > 1 ? ` with ${n - 1} cop${n > 2 ? "ies" : "y"}` : ""} (${cost.mv} mana)`];
          }
          break; // a bigger X for this n costs more: not payable
        }
      }
    }
    return null;
  }
  /** Does this finisher with X and n resolutions kill every opponent? */
  kills(f: string, x: number, n: number, life: number, opps: number): boolean {
    if (f === EXSANG) return n * x >= life;
    if (f === TORMENT) return 3 * Math.max(0, n * x - this.payments()) >= life;
    // Crackle: five times X to each of up to X targets, n times
    const hits = Math.ceil(life / (5 * x));
    return hits * opps <= n * Math.min(x, opps);
  }
}
