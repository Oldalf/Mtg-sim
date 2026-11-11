/**
 * The Aesi deck's AI (Simic "reverse landfall", bracket 3): the rules of its cards, what it wants to do
 * each turn, the loop solver, and the rules agreed for this deck (see PLAN.md).
 *
 * Win: all three opponents out (40 life each, or their 92-card library milled to 0; a milled-out
 * opponent counts on the turn we empty it). Second measure: first opponent out.
 * Land drops: 1 + Aesi, Azusa (2), Loot, Case of the Locked Hothouse, Druid Class level 2, plus this
 * turn's Explore / Summer Bloom / Azusa's Many Journeys. "{T}: put a land" creatures, Patron of the
 * Moon and Kodama don't use a drop.
 * Loops are shortcut (as you'd demonstrate them at the table): loops() finds them, comboSolve()
 * applies the result (draw the library, dump the lands, cast what helps, look for the win).
 * Endless flyers / snakes and 10+ Eternal Dominion copies win on the next turn (tokens are
 * summoning sick). Attacks: flyers whenever they can, ground creatures only if it kills the table
 * (half of them blocked). No crackback.
 */
import * as C from "../../engine/cards";
import { Cost, CardDef, makeToken } from "../../engine/cards";
import { Game, Cand, KillSearcher, Perm, WinAttempt, Zone, firstMax, firstMin } from "../../engine/game";
import { MulliganRule } from "../../engine/mulligan";
import { MULLIGAN } from "./mulligan";

export const AESI = "Aesi, Tyrant of Gyre Strait";
export const RETREAT = "Retreat to Coralhelm";
export const RAFT = "Elven Raft-Steerer"; // landfall: tap an opposing creature / untap a creature of ours (Retreat's untap, as a creature)
export const TATYOVA = "Tatyova, Benthic Druid"; // landfall: gain 1 life, draw a card (always)
export const LORE = "Nature's Lore"; // a Forest onto the battlefield untapped
export const THREE = "Three Visits"; // the same as Nature's Lore
export const CLAIM = "Skyshroud Claim"; // two Forests onto the battlefield untapped
export const ELVES = "Wood Elves"; // a creature: a Forest onto the battlefield untapped when it enters
export const SEARCH = "Search for Tomorrow"; // a basic untapped; suspend 2 for {G}
export const KODAMA = "Kodama of the East Tree";
export const MELOKU = "Meloku the Clouded Mirror";
export const UYO = "Uyo, Silent Prophet";
export const MINDSWEEPER = "Soratami Mindsweeper";
export const COBRA = "Lotus Cobra";
export const OMNI = "Omniscience";
export const KIRI = "Kiri-Onna";
export const HARU = "Haru-Onna";
export const BSZ = "Blue Sun's Zenith";
export const SWARM = "Endless Swarm";
export const DOMINION = "Eternal Dominion";
export const CHAMBER = "Simic Growth Chamber";
export const PATRON = "Patron of the Moon";
export const BUDOKA = "Budoka Gardener";
export const DRUID = "Druid Class";
export const CASE = "Case of the Locked Hothouse";
export const SAGA = "Azusa's Many Journeys";
export const BEANSTALK = "Beanstalk Giant";
export const KHALNI = "Khalni Heart Expedition";
// candidates for the list (Pontus, 2026-11-05)
export const REVOLT = "Nature's Revolt";
export const AFFINITY = "Natural Affinity";
export const AWAKENING = "Sylvan Awakening";
export const SCRYING = "Sylvan Scrying";
export const MAP = "Expedition Map";
export const CROP = "Crop Rotation";
export const MYRIAD = "Myriad Landscape";
export const PASSAGE = "Fabled Passage";
/** Spells worth an Uyo copy outside a loop (they fetch or draw; the two returned lands are replayed). */
const UYO_COPY = new Set(["Explosive Vegetation", "Circuitous Route", "Reach the Horizon", "Cultivate", "Grow from the Ashes",
  "Harrow", "Nissa's Pilgrimage", "Entish Restoration", "Rampant Growth", "Farseek", "Explore", "Growth Spiral", SCRYING]);
const FETCHES_TWO = new Set(["Explosive Vegetation", "Circuitous Route", "Reach the Horizon", "Cultivate", "Grow from the Ashes",
  "Harrow", "Nissa's Pilgrimage", "Entish Restoration"]);

/** "{T}: You may put a land card from your hand onto the battlefield." (Budoka flips at 10 lands.) */
export const PUTTERS = new Set(["Walking Atlas", "Sakura-Tribe Scout", "PuPu UFO", BUDOKA]);
/** Moonfolk "{c}, return n lands you control to their owner's hand: effect". */
export const RETURNERS: Record<string, [number, number, string]> = {
  [MELOKU]: [1, 1, "token"],
  Floodbringer: [2, 1, "none"],
  "Moonbow Illusionist": [2, 1, "none"],
  "Oboro Breezecaller": [2, 1, "untap"],
  [UYO]: [2, 2, "copy"],
  "Soratami Savant": [3, 1, "counter"], // needs a spell to counter: not used in loops
  "Soratami Cloudskater": [2, 1, "loot"],
  "Soratami Mirror-Guard": [2, 1, "none"],
  [MINDSWEEPER]: [2, 1, "mill"],
  "Oboro Envoy": [2, 1, "none"],
  "Soratami Rainshaper": [3, 1, "none"],
  "Soratami Mirror-Mage": [3, 3, "none"],
};
/** Activated abilities of creatures cost this much less (never below one mana). */
export const REDUCERS: Record<string, number> = { "Biomancer's Familiar": 2, "Training Grounds": 2, Heartstone: 1 };
/** Spirits (Haru-Onna and Kiri-Onna return to hand when one is cast). */
const SPIRITS = new Set([KIRI, HARU, KODAMA, PATRON, "Kira, Great Glass-Spinner"]);
/** Creatures with power 4 or more for Entish Restoration (checked on the battlefield). */

export const TOK = {
  illusion: makeToken("Illusion", 1, 1, "blue", ["flying"]),
  snake: makeToken("Snake", 1, 1, "green"),
  illusionArmy: makeToken("Illusion army", 999, 999, "blue", ["flying"]),
  snakeArmy: makeToken("Snake army", 999, 999, "green"),
};
/** A land Eternal Dominion takes from an opponent (any colour). */
export const STOLEN_LAND = new CardDef("Stolen land", { name: "Stolen land", type_line: "Land",
  oracle: "{T}: Add one mana of any color." } as never);

/** How much we want each card on the battlefield (casting order, discards, the planner's score). */
const VALUE: Record<string, number> = {
  "Sol Ring": 100, [AESI]: 96, [OMNI]: 90, "Azusa, Lost but Seeking": 86, [RETREAT]: 84, [COBRA]: 82, [RAFT]: 70, [TATYOVA]: 80, [LORE]: 80, [THREE]: 80, [CLAIM]: 74, [ELVES]: 78, [SEARCH]: 78,
  "Biomancer's Familiar": 82, [MELOKU]: 82, "Loot, Exuberant Explorer": 80, [KODAMA]: 80, "Walking Atlas": 76,
  "Training Grounds": 74, [PATRON]: 74, "Sakura-Tribe Scout": 74, "PuPu UFO": 74, [UYO]: 72, [CASE]: 72,
  [DRUID]: 70, [BUDOKA]: 70, [MINDSWEEPER]: 70, "Oboro Breezecaller": 66, "Into the Wilds": 64, Heartstone: 62,
  [SAGA]: 60, [KHALNI]: 58, "Soratami Mirror-Mage": 55, "Soratami Cloudskater": 56, [HARU]: 52, [KIRI]: 46,
  "Graceful Adept": 45, Floodbringer: 48, "Moonbow Illusionist": 48, "Soratami Mirror-Guard": 46, "Oboro Envoy": 45,
  "Soratami Rainshaper": 45, "Soratami Savant": 44, [BEANSTALK]: 60, "Sakura-Tribe Elder": 66,
  "Kira, Great Glass-Spinner": 30,
  // spells
  "Growth Spiral": 74, Explore: 68, Harrow: 80, "Rampant Growth": 78, Farseek: 78, Cultivate: 76,
  "Nissa's Pilgrimage": 74, "Explosive Vegetation": 76, "Circuitous Route": 74, "Reach the Horizon": 74,
  "Grow from the Ashes": 72, "Entish Restoration": 74, "Early Harvest": 50, "Summer Bloom": 50, "Seismic Sense": 55,
  Bushwhack: 45, [BSZ]: 60, [SWARM]: 40, [DOMINION]: 30,
  [REVOLT]: 30, [AFFINITY]: 30, [AWAKENING]: 35, [SCRYING]: 62, [MAP]: 50, [CROP]: 30,
};
/** Interaction: no targets in a goldfish game (held; the first cards to discard). */
const HOLD = new Set(["Divert Disaster", "Wash Away", "Beast Within"]);
/** Ramp: great early, much less later. */
const RAMP = new Set(["Rampant Growth", "Farseek", "Cultivate", "Nissa's Pilgrimage", "Explosive Vegetation",
  "Circuitous Route", "Reach the Horizon", "Grow from the Ashes", "Entish Restoration", "Harrow", "Sakura-Tribe Elder",
  "Sol Ring", "Khalni Heart Expedition", "Into the Wilds", LORE, THREE, CLAIM, ELVES, SEARCH]);
/** What the loop solver casts once a loop is going, best first (they make the loop bigger or win). */
const LOOP_CAST = ["Biomancer's Familiar", "Training Grounds", "Heartstone", COBRA, RETREAT, RAFT, TATYOVA, KODAMA, MELOKU, MINDSWEEPER,
  UYO, "Oboro Breezecaller", "Soratami Mirror-Mage", "Graceful Adept", OMNI, "Walking Atlas", "Sakura-Tribe Scout",
  "PuPu UFO", PATRON, "Soratami Cloudskater", "Azusa, Lost but Seeking", "Loot, Exuberant Explorer"];
const BASIC_COL: Record<string, string> = { Forest: "G", Island: "U" };

function removeOne<T>(xs: T[], x: T): void {
  const i = xs.indexOf(x);
  if (i >= 0) xs.splice(i, 1);
}

// every card this file has rules for (lands, Sol Ring are engine facts)
C.registerKnown([...Object.keys(VALUE), ...HOLD, ...PUTTERS, ...Object.keys(RETURNERS), ...Object.keys(REDUCERS),
  CHAMBER, "Demolition Field", "Terramorphic Expanse", "Guildless Commons", MYRIAD, PASSAGE]);

/** What the loops on the battlefield give right now (see loops()). */
export interface Loops {
  landfall: boolean; // endless landfall triggers
  mana: boolean; // endless mana
  draw: boolean; // endless draws (Aesi, or the Onnas with Omniscience)
  tokens: boolean; // endless Meloku Illusions
  mill: boolean; // endless Mindsweeper activations
  copy: boolean; // endless Uyo copies
  lock: boolean; // every opponent's land bounced (lands are creatures: Kiri-Onna or Mirror-Mage over and over)
  replay: boolean;
  start: number; // mana needed to keep a loop going (kept in reserve while the solver casts things)
  putter: Perm | null; // the "put a land" creature a Retreat loop uses (Retreat untaps it after every land) // a way to replay a land (Retreat + putter, or Kodama + Meloku)
  how: string[];
}

type Way = { kind: "drop" } | { kind: "putter"; p: Perm } | { kind: "patron" };

export class AesiGame extends Game<AesiGame> {
  override mulliganRule(): MulliganRule | null {
    return this.cfg.smart_mulligan ? MULLIGAN : null;
  }
  override colors = ["G", "U"];
  dropsUsed = 0; // land drops used this turn
  dropsBonus = 0; // extra drops for this turn only (Explore, Summer Bloom, the Saga)
  epic = false; // an epic spell resolved: no more spells for the rest of the game
  swarmCopies = 0; // Endless Swarm epic copies each upkeep
  dominionCopies = 0; // Eternal Dominion epic copies each upkeep
  infMana = false; // a loop gives endless mana this turn
  kodamaBusy = false; // a permanent is being put onto the battlefield by Kodama (it doesn't trigger Kodama)
  comboKey: string | null = null; // the loop solver skips a board it has already looked at
  footstepsExiled = false; // Beanstalk Giant on an adventure: castable from exile
  loopWinHow: string | null = null; // how the game was won (for the stats and the trace)
  revolt = false; // Nature's Revolt: all lands are 2/2 creatures
  affinity = false; // Natural Affinity this turn: all lands are 2/2 creatures
  awakened = false; // Sylvan Awakening until our next turn: our lands are 2/2 creatures with haste
  // ---- measures for --diag (they change nothing in the game)
  aesiOut: number | null = null; // the turn Aesi first entered the battlefield
  aesiDraw: number | null = null; // the first turn a land entered while Aesi was out (his first landfall draw)
  castsByTurn: number[] = []; // nonland spells cast in each turn
  landsEnd: number[] = []; // lands on the battlefield at the end of each turn
  locked = false; // every opponent's land bounced over and over (counts as a win with land_lock_win)

  /** Lands are creatures now (a land that entered this turn then can't tap for mana, unless it has haste). */
  landsCreatures(): boolean {
    return this.revolt || this.affinity || this.awakened;
  }
  /** A replayed land taps for mana this turn (not when it's a summoning-sick creature). */
  replayMana(): number {
    return this.landsCreatures() && !this.awakened ? 0 : 1;
  }
  override oppsBeaten(): boolean {
    return this.locked || super.oppsBeaten();
  }

  // ================================================================ the win condition
  override checkKill(): number {
    if (this.died) return 2;
    if (this.inArena() && !this.oppsBeaten()) this.podPre = [this.life.slice(), this.lib.slice(), this.poison.slice()];
    if (!this.oppsBeaten()) this.comboSolve();
    if (this.oppsBeaten()) {
      if (this.unprot === null) {
        this.unprot = this.turn;
        this.say(`WIN: opp life [${this.life.join(", ")}], libraries [${this.lib.join(", ")}]`);
      }
      return 2;
    }
    return 0;
  }
  override play(): [number | null, number | null] {
    super.play();
    this.castsByTurn[this.turn] = this.spellsCast;
    return [this.died ? null : this.unprot, this.firstOppDead];
  }
  override diag(): Record<string, number | null> {
    const upTo = (k: number) => this.castsByTurn.slice(1, k + 1).reduce((s, x) => s + (x ?? 0), 0);
    return { aesiOut: this.aesiOut, aesiDraw: this.aesiDraw, casts4: upTo(4), casts5: upTo(5), casts6: upTo(6),
      spent4: this.spentEnd[4] ?? null, spent5: this.spentEnd[5] ?? null, spent6: this.spentEnd[6] ?? null,
      lands4: this.landsEnd[4] ?? null, lands5: this.landsEnd[5] ?? null, lands6: this.landsEnd[6] ?? null };
  }
  keep(): number {
    return this.cfg.keep_library as number;
  }
  /** A pod: a loop win can be answered by countering its finisher (Blue Sun's Zenith, Endless Swarm, Eternal Dominion) or by
   *  removing a loop piece. A counterspell in hand answers one more (Kira and Soratami Rainshaper protect the creatures: Game.podShield). */
  override podWinStopped(): void {
    super.podWinStopped();
    this.loopWinHow = null;
  }
  /** How close to winning the others think we are: Retreat or a land-putter with an untapper, Aesi out, many lands. */
  override podClose(): number {
    let c = 0;
    if (this.onBf(RETREAT) || this.onBf(OMNI)) c += 0.5;
    if (this.bf.some((p) => PUTTERS.has(p.cd.name))) c += 0.2;
    if (this.onBf(AESI)) c += 0.2;
    if (this.landsBf().length >= 9) c += 0.2;
    return Math.min(1, c);
  }
  override winAttempt(): WinAttempt | null {
    const how = this.loopWinHow;
    if (!how) return null;
    const spells = [BSZ, SWARM, DOMINION].filter((n) => how.includes(n));
    const perms = [RETREAT, RAFT, OMNI, KODAMA, MELOKU, UYO, MINDSWEEPER, ...PUTTERS, KIRI, HARU, PATRON, COBRA, AESI].filter((n) => this.onBf(n));
    const backup = this.hand.some((c) => this.answer(c)?.kind === "counter") ? 1 : 0;
    return { spells, perms, backup };
  }
  /** An opponent milled out (they lose at their next draw; counted now). */
  millOut(i: number): void {
    if (this.lib[i] <= 0) return;
    this.lib[i] = 0;
    if (this.firstOppDead === null) this.firstOppDead = this.turn;
  }
  millAll(how: string): void {
    for (let i = 0; i < this.lib.length; i++) if (this.oppAlive(i)) this.millOut(i);
    this.loopWinHow = how;
    this.say("LOOP WIN: " + how);
  }

  // ---------------------------------------------------------------- kill search (only for the log analyzer)
  /** A copy of the game to run the loop solver on (nextTurn: untapped, a fresh land drop). */
  light(nextTurn = false): AesiGame {
    const g = this.clone();
    g.verbose = true;
    g.log = [];
    g.inRollout = true;
    if (nextTurn) {
      for (const p of g.bf) {
        p.tapped = false;
        p.sick = false;
      }
      g.dropsUsed = 0;
      g.dropsBonus = 0;
      g.infMana = false;
      g.turn += 1;
    }
    g.comboKey = null;
    return g;
  }
  lightKey(): string {
    return "";
  }
  override lightAddLand(st: AesiGame): void {
    st.dropsUsed = Math.max(0, st.dropsUsed - 1);
  }
  override lightAddMana(st: AesiGame, n: number): void {
    st.pool.G += n;
  }
  killSearch(): KillSearcher<AesiGame> {
    const ks: KillSearcher<AesiGame> = {
      lastLine: null, lastP: null, bestMiss: null, minChance: 1,
      search: (st: AesiGame) => {
        const lives = st.oppsBeaten();
        st.comboSolve();
        ks.lastLine = st.log.map((l) => l.replace(/^T\d+: /, ""));
        if (!lives && st.oppsBeaten()) return 1;
        if (st.bf.some((p) => p.cd === TOK.illusionArmy || p.cd === TOK.snakeArmy) ||
            st.dominionCopies >= (st.cfg.dominion_win as number)) {
          ks.lastLine.push("(wins on the next turn)");
          return 1;
        }
        return 0;
      },
    };
    return ks;
  }
  override syncFromLog(board: { landsFromHand: number; trackers: Record<string, number> }): void {
    this.dropsUsed = Math.min(board.landsFromHand, this.dropsAllowed());
    for (const p of this.bf) {
      if (p.cd.name === DRUID) p.counters = Math.max(1, p.counters);
      if (p.cd.name === SAGA) p.counters = Math.max(1, p.counters);
    }
  }
  override logToken(name: string): CardDef | null {
    const n = name.toLowerCase();
    if (n.includes("illusion")) return TOK.illusion;
    if (n.includes("snake")) return TOK.snake;
    if (n.includes("elemental")) return makeToken("Elemental", this.landsBf().length, this.landsBf().length, "green");
    return null; // Blue Sun's Zenith copies and other markers
  }

  // ================================================================ land drops and land puts
  dropsAllowed(): number {
    let n = 1 + this.dropsBonus;
    for (const p of this.bf) {
      const c = p.cd.name;
      if (c === AESI || c === "Loot, Exuberant Explorer" || c === CASE) n += 1;
      else if (c === "Azusa, Lost but Seeking") n += 2;
      else if (c === DRUID && p.counters >= 2) n += 1;
    }
    return n;
  }
  canDrop(): boolean {
    return this.dropsUsed < this.dropsAllowed();
  }
  landsInHand(): CardDef[] {
    return this.hand.filter((c) => c.land !== null);
  }
  /** Lands that come back untapped (basics, Reliquary Tower, Demolition Field): they pay for a loop. */
  untappedLand(cd: CardDef): boolean {
    // (a fast land comes back tapped once there are three lands)
    return cd.land !== null && cd.land.etb !== "tapped" && cd.land.special !== "wilds" && cd.land.special !== "chamber" &&
      cd.land.cond !== "fast";
  }
  readyPutters(): Perm[] {
    const n = this.landsBf().length;
    return this.bf.filter((p) => PUTTERS.has(p.cd.name) && !p.tapped && !p.sick && !(p.cd.name === BUDOKA && (p.transformed)) &&
      (p.cd.name !== BUDOKA || n < 30));
  }
  /** How to get a land from hand onto the battlefield now, best first: a "put" creature when Retreat
   *  will untap it, else a land drop, else a put creature, else Patron of the Moon. */
  landWay(): Way | null {
    const ps = this.readyPutters();
    // Budoka flips at 10 lands (losing the ability): use it last
    ps.sort((a, b) => +(a.cd.name === BUDOKA) - +(b.cd.name === BUDOKA));
    if (ps.length && this.hasUntapper()) return { kind: "putter", p: ps[0] };
    if (this.canDrop()) return { kind: "drop" };
    if (ps.length) return { kind: "putter", p: ps[0] };
    if (this.onBf(PATRON) && this.canPay(new Cost(1))) return { kind: "patron" };
    return null;
  }
  /** Which land from hand to play: a basic we need the colour of, fetch lands when the mana can wait. */
  chooseLand(lands: CardDef[]): CardDef {
    const want = this.wantColour();
    const needNow = this.needManaNow();
    const score = (cd: CardDef): number => {
      const i = cd.land!;
      let s = 0;
      if (i.special === "wilds") s = needNow ? 2 : 7; // two landfall triggers, but the basic is tapped
      else if (i.special === "chamber") s = this.landsBf().some((p) => p.land!.basic) ? (needNow ? 1 : 5) : -5;
      else if (i.basic) s = 6 + (BASIC_COL[cd.name] === want ? 1.5 : 0);
      else if (i.mana === "A" || (i.mana.length === 3 && i.mana[1] === "/")) s = 7.5; // a dual land makes the colour we need
      else s = 3; // colourless lands
      if (i.special !== "wilds" && i.special !== "chamber" && this.entersTapped(cd)) s += needNow ? -6 : 0.5;
      return s;
    };
    return firstMax(lands, score);
  }
  /** A spell in hand we could cast with one more mana. */
  needManaNow(): boolean {
    const avail = this.availMana();
    return [...this.hand, ...this.command].some((c) => c.land === null && !HOLD.has(c.name) && this.effCost(c).mv === avail + 1);
  }
  wantColour(): string {
    let needU = 0, needG = 0;
    for (const c of [...this.hand, ...this.command]) {
      needU += c.cost.u;
      needG += c.cost.gn;
    }
    let srcU = 0, srcG = 0;
    for (const p of this.landsBf()) {
      const k = this.srcKind(p, true) ?? "";
      if (k === "U" || k === "GU" || k === "A") srcU++;
      if (k === "G" || k === "GU" || k === "A") srcG++;
    }
    if (srcU === 0 && needU) return "U";
    if (srcG === 0 && needG) return "G";
    return (needU + 1) / (srcU + 1) >= (needG + 1) / (srcG + 1) ? "U" : "G";
  }

  /** Play one land from hand (the best way, or the given one). */
  playLandVia(way: Way | null = null, cd: CardDef | null = null): boolean {
    const lands = this.landsInHand();
    if (!lands.length) return false;
    const w = way ?? this.landWay();
    if (!w) return false;
    if (w.kind === "patron") {
      if (!this.pay(new Cost(1))) return false;
      const two = lands.slice().sort((a, b) => +(b.land!.special === "wilds") - +(a.land!.special === "wilds")).slice(0, 2);
      this.say("Patron of the Moon: two lands onto the battlefield tapped");
      for (const c of two) if (this.hand.includes(c)) this.putLand(c, "hand", "Patron", true);
      return true;
    }
    const land = cd ?? this.chooseLand(lands);
    if (w.kind === "drop") this.dropsUsed += 1;
    else {
      w.p.tapped = true;
      if (w.p.cd.name === BUDOKA && this.landsBf().length + 1 >= 10) {
        w.p.transformed = true; // flips into Dokai, Weaver of Life
        this.say("Budoka Gardener flips (10 lands)");
      }
    }
    this.putLand(land, "hand", w.kind === "drop" ? "play land" : `${w.p.cd.name.split(",")[0]} puts`);
    return true;
  }
  override playLand(): void {
    this.caseTop();
    this.playLandVia();
  }
  override develop(main2 = false): boolean {
    this.caseTop();
    return super.develop(main2);
  }
  /** Case of the Locked Hothouse solved: play lands and cast creatures / enchantments from the top of the
   *  library. (A fixed step, not a choice: the planner's copies shuffle the library, so their choices
   *  mustn't depend on the top card.) */
  caseTop(): void {
    const c = this.perm(CASE);
    if (!c || !c.transformed) return;
    for (let i = 0; i < 20 && this.library.length > this.keep(); i++) {
      const top = this.library[0];
      if (top.land !== null && this.canDrop()) {
        this.dropsUsed += 1;
        this.putLand(top, "library", "play land from the top (Case)");
      } else if (!this.epic && top.land === null && (top.isCreature || top.types.has("enchantment")) && !HOLD.has(top.name) &&
                 this.value(top) >= 50 && !(top.types.has("legendary") && this.onBf(top.name)) && this.canPay(this.effCost(top))) {
        this.castFromTop(top);
      } else return;
    }
  }

  /** A land enters from hand or library. Fetch lands crack at once (two landfall triggers, the basic
   *  enters tapped). Simic Growth Chamber returns a land. */
  putLand(cd: CardDef, from: "hand" | "library", how: string, tapped = false): Perm | null {
    removeOne(from === "hand" ? this.hand : this.library, cd);
    const info = cd.land!;
    if (info.special === "wilds") {
      this.gy.push(cd);
      this.say(`${how}: ${cd.name} (cracked)`);
      this.onLandEnter(new Perm(cd, info), true);
      this.fetchBasic({ tapped: !(cd.name === PASSAGE && this.landsBf().length >= 3) });
      return null;
    }
    const p = new Perm(cd, info, tapped || this.entersTapped(cd));
    p.sick = true; // entered this turn (matters only when lands are creatures)
    this.bf.push(p);
    this.say(`${how}: ${cd.name}${p.tapped ? " (tapped)" : ""}`);
    this.onLandEnter(p, false);
    if (info.special === "chamber") this.chamberBounce(p);
    return p;
  }
  /** Simic Growth Chamber: return a land (a tapped basic; tap an untapped one for mana first). */
  chamberBounce(self: Perm): void {
    const others = this.landsBf().filter((q) => q !== self && q.land!.special !== "chamber");
    let back: Perm | null = null;
    const loop = this.hasUntapper() && this.loopPutter() !== null; // returning itself sets up the Retreat loop
    if (others.length && !loop) {
      back = firstMax(others, (q) => (q.tapped ? 2 : 0) + (q.land!.basic ? 1 : 0));
      if (!back.tapped && this.srcKind(back)) this.tap(back, "N");
    } else back = self;
    removeOne(this.bf, back);
    this.hand.push(back.cd);
    this.say(`${self.cd.name} returns`, back.cd);
  }
  /** Search the library for a basic land (the colour we need; only = Forest or Island). */
  fetchBasic(o: { tapped?: boolean; toHand?: boolean; only?: string } = {}): boolean {
    const want = o.only ?? (this.wantColour() === "U" ? "Island" : "Forest");
    const c = this.library.find((x) => x.name === want) ?? (o.only ? undefined : this.library.find((x) => x.land?.basic));
    if (!c) return false;
    if (o.toHand) {
      removeOne(this.library, c);
      this.hand.push(c);
      this.say("basic to hand:", c);
    } else this.putLand(c, "library", "basic onto the battlefield", !!o.tapped);
    this.shuffle();
    return true;
  }

  // ================================================================ landfall and enter triggers
  override onLandEnter(p: Perm, _gone: boolean): void {
    if (this.aesiDraw === null && this.onBf(AESI)) this.aesiDraw = this.turn;
    if (p.land?.scry && !_gone) this.scry(1); // Temple of Mystery
    for (const q of this.bf.slice()) {
      const n = q.cd.name;
      if (n === AESI && this.library.length > this.keep()) this.draw(1);
      else if (n === COBRA) {
        if (this.pool.U <= this.pool.G) this.pool.U += 1;
        else this.pool.G += 1;
      } else if (n === DRUID) this.gainLife(1);
      else if (n === KHALNI) q.counters += 1;
      else if (n === RETREAT) this.retreat(true);
      else if (n === RAFT) this.retreat(false);
      else if (n === TATYOVA && this.library.length > this.keep()) this.draw(1);
    }
    if (!this.kodamaBusy) this.kodamaTrigger(p.cd.mv);
  }
  /** Retreat or Elven Raft-Steerer on a landfall: Retreat's tap/untap mode, and Retreat alone can scry. */
  hasUntapper(): boolean {
    return this.onBf(RETREAT) || this.onBf(RAFT);
  }
  /** Retreat to Coralhelm: untap a tapped "put" creature (if there's a land to put), Dokai or Loot; else scry 1
   *  (Retreat only). */
  retreat(scry: boolean): void {
    const tapped = this.bf.filter((q) => q.tapped && !q.sick && q.cd.isCreature);
    const lands = this.landsInHand().length > 0;
    const t = tapped.find((q) => PUTTERS.has(q.cd.name) && !(q.cd.name === BUDOKA && q.transformed) && lands) ??
      tapped.find((q) => q.cd.name === BUDOKA && q.transformed) ?? tapped.find((q) => q.cd.name === "Loot, Exuberant Explorer");
    if (t) t.tapped = false;
    else if (this.landsCreatures()) {
      // lands are creatures: untap a tapped land that can tap for mana again
      const l = this.landsBf().find((q) => q.tapped && (!q.sick || this.awakened) && this.srcKind(q, true));
      if (l) l.tapped = false;
      else if (scry) this.scry(1);
    } else if (scry) this.scry(1);
  }
  /** Kodama of the East Tree: another permanent entered (not put by Kodama): put a permanent card with
   *  equal or lesser mana value from hand onto the battlefield. */
  kodamaTrigger(mv: number): void {
    if (!this.onBf(KODAMA)) return;
    const perms = this.hand.filter((c) => c.mv <= mv && (c.land !== null || c.types.has("creature") ||
      c.types.has("artifact") || c.types.has("enchantment")));
    if (!perms.length) return;
    const nonland = perms.filter((c) => c.land === null);
    const cd = nonland.length ? firstMax(nonland, (c) => this.value(c)) : this.chooseLand(perms);
    this.kodamaBusy = true;
    try {
      if (cd.land !== null) this.putLand(cd, "hand", "Kodama puts");
      else {
        removeOne(this.hand, cd);
        this.say("Kodama puts", cd);
        this.enter(cd);
      }
    } finally {
      this.kodamaBusy = false;
    }
  }

  override onEnter(p: Perm, _from: Zone): void {
    const n = p.cd.name;
    if (n === AESI && this.aesiOut === null) this.aesiOut = this.turn;
    if (n === HARU && !p.token) this.draw(1);
    if (n === ELVES && !p.token) this.fetchBasic({ only: "Forest" }); // untapped
    else if (n === DRUID || n === SAGA) p.counters = 1;
    if (n === SAGA) this.dropsBonus += 1; // chapter I: an additional land this turn
    if (n === REVOLT) this.revolt = true;
    if (!this.kodamaBusy && p.land === null && n !== KODAMA) this.kodamaTrigger(p.cd.mv);
  }

  // ================================================================ mana
  reduction(): number {
    let r = 0;
    for (const p of this.bf) r += REDUCERS[p.cd.name] ?? 0;
    return r;
  }
  /** An activated ability of one of our creatures, after Familiar / Training Grounds / Heartstone. */
  abilityCost(c: Cost): Cost {
    const coloured = c.mv - c.g;
    const g = Math.max(coloured > 0 ? 0 : 1, c.g - this.reduction());
    return c.withGeneric(g);
  }
  /** Untapped mana right now (roughly: each source counts what it makes). */
  availMana(): number {
    if (this.infMana) return 99;
    let n = this.pool.U + this.pool.G + this.pool.C + this.pool.B + this.pool.W + this.pool.R;
    for (const p of this.bf) {
      if (p.tapped) continue;
      const k = this.srcKind(p);
      if (k === null) continue;
      n += k === "C2" || k === "GU" ? 2 : 1;
    }
    return n;
  }
  override srcKind(p: Perm, ignoreSick = false): string | null {
    if (p.land !== null && p.sick && !ignoreSick && (this.revolt || this.affinity) && !this.awakened) return null;
    return super.srcKind(p, ignoreSick);
  }
  override pay(cost: Cost, isIS = false, commit = true): boolean {
    if (this.infMana) return true;
    return super.pay(cost, isIS, commit);
  }
  override effCost(cd: CardDef, base: Cost | null = null, fromGy = false): Cost {
    // Omniscience: spells from hand are free (an X spell then has X = 0, so Blue Sun's Zenith is paid normally)
    if (base === null && !fromGy && this.onBf(OMNI) && this.hand.includes(cd)) return new Cost();
    return super.effCost(cd, base, fromGy);
  }
  override castPerm(cd: CardDef, fromCommand = false): boolean {
    if (this.epic) return false;
    const ok = super.castPerm(cd, fromCommand);
    if (ok && SPIRITS.has(cd.name)) this.spiritCast();
    return ok;
  }
  override castIS(cd: CardDef, fromGy = false, base: Cost | null = null, mode: string | null = null,
                  trig: Record<string, unknown> = {}): boolean {
    if (this.epic) return false;
    if (!super.castIS(cd, fromGy, base, mode, trig)) return false;
    if (cd.name === BSZ) {
      // shuffled into the library instead of the graveyard
      removeOne(this.gy, cd);
      this.library.push(cd);
      this.shuffle();
    }
    return true;
  }
  /** A Spirit was cast: Haru-Onna and Kiri-Onna may return to hand (only worth it with Omniscience). */
  spiritCast(): void {}

  // ================================================================ card values
  value(cd: CardDef): number {
    return VALUE[cd.name] ?? (cd.isCreature ? 40 : 30);
  }
  override cardValue(cd: CardDef): number {
    if (cd.land !== null) {
      // lands stay good: every one is a landfall draw; less so once the hand has more than we can play
      const spare = this.countLandsHand() - this.dropsAllowed();
      return spare <= 0 ? 70 : spare <= 2 ? 50 : 30;
    }
    if (HOLD.has(cd.name)) return 10;
    if (RAMP.has(cd.name) && this.landsBf().length >= 10) return 30;
    return this.value(cd);
  }

  // ================================================================ turn steps
  override startTurn(): void {
    if (this.turn > 0) this.castsByTurn[this.turn] = this.spellsCast; // (the base class resets it)
    super.startTurn();
    this.dropsUsed = 0;
    this.dropsBonus = 0;
    this.infMana = false;
    this.comboKey = null;
    this.affinity = false;
    this.awakened = false; // Sylvan Awakening lasts until our next turn
    this.lastLoopSay = "";
  }

  /** Search for Tomorrow, suspended: it comes out two upkeeps later (cast for free) and fetches a basic. */
  suspended: { cd: CardDef; left: number }[] = [];
  override clone(): this {
    const g = super.clone();
    g.suspended = this.suspended.map((x) => ({ ...x }));
    return g;
  }
  suspendSearch(cd: CardDef): boolean {
    if (!this.pay(Cost.parse("{G}"), true)) return false;
    removeOne(this.hand, cd);
    this.suspended.push({ cd, left: 2 });
    this.say("suspend Search for Tomorrow");
    return true;
  }
  override upkeep(): void {
    for (const x of this.suspended.slice()) {
      if (--x.left > 0) continue;
      removeOne(this.suspended, x);
      this.say("Search for Tomorrow comes out of suspend");
      this.resolve(x.cd);
      this.gy.push(x.cd);
    }
    // epic copies (Endless Swarm makes a Snake for each card in hand; Eternal Dominion takes a card)
    if (this.dominionCopies >= (this.cfg.dominion_win as number)) {
      this.say(`Eternal Dominion: ${this.dominionCopies} copies take the opponents' best cards -> win`);
      for (let i = 0; i < this.life.length; i++) if (this.oppAlive(i)) this.hurtOpp(i, this.life[i]);
      this.loopWinHow = "Eternal Dominion copies";
      return;
    }
    for (let i = 0; i < this.swarmCopies; i++) this.makeSnakes(this.hand.length);
    for (let i = 0; i < this.dominionCopies; i++) this.putStolenLand();
    // the Saga's next chapter (really after the draw step; close enough)
    for (const p of this.bf.filter((q) => q.cd.name === SAGA)) {
      p.counters += 1;
      if (p.counters === 2) this.gainLife(3);
      else if (p.counters >= 3) p.transformed = true; // Likeness of the Seeker (a 3/3 nobody minds)
    }
    // Into the Wilds: a land on top goes onto the battlefield
    for (const _ of this.bf.filter((q) => q.cd.name === "Into the Wilds")) {
      const top = this.library[0];
      if (top && top.land !== null && this.library.length > this.keep()) this.putLand(top, "library", "Into the Wilds");
    }
  }

  putStolenLand(): void {
    const p = new Perm(STOLEN_LAND, STOLEN_LAND.land);
    p.sick = false;
    this.bf.push(p);
    this.say("Eternal Dominion takes a land");
    this.onLandEnter(p, false);
  }
  makeSnakes(n: number): void {
    if (n <= 0) return;
    if (n >= 40) {
      // a horde: one ground "army" (opponents block half of it)
      const p = this.enter(TOK.snake, "token", { token: true });
      p.counters = Math.ceil(n / 2) - 1;
      this.say(`Endless Swarm: ${n} Snakes`);
      return;
    }
    for (let i = 0; i < n; i++) this.enter(TOK.snake, "token", { token: true });
    this.say(`Endless Swarm: ${n} Snakes`);
  }

  override endTurn(): void {
    this.endStep();
    if (this.turn <= 6) {
      this.landsEnd[this.turn] = this.landsBf().length;
    }
    const max = this.onBf("Reliquary Tower") || this.onBf("Graceful Adept") ? 999 : 7;
    if (this.hand.length > max) this.discard(this.hand.length - max);
  }
  override endStep(): void {
    const c = this.perm(CASE);
    if (c && !c.transformed && this.landsBf().length >= 7) {
      c.transformed = true;
      this.say("Case of the Locked Hothouse solved");
    }
  }

  // ================================================================ combat
  /** Flyers attack whenever they can; ground creatures only if attacking with everything kills the table
   *  (opponents block half of them, the biggest). No crackback. */
  override combat(): void {
    if (this.attacked) return;
    const ready = this.creatures().filter((p) => !p.tapped && (!p.sick || p.cd.haste) && this.power(p) > 0);
    const fly = ready.filter((p) => p.cd.flying);
    const ground = ready.filter((p) => !p.cd.flying).sort((a, b) => this.power(b) - this.power(a));
    let druidLand = 0;
    const druid = this.perm(DRUID);
    if (druid && druid.counters >= 3) druidLand = this.landsBf().length; // a land creature with haste
    const flyDmg = fly.reduce((s, p) => s + this.power(p), 0);
    // lands that are 2/2 creatures (Nature's Revolt, Natural Affinity, Sylvan Awakening): untapped ones that
    // aren't summoning sick (Awakening gives haste)
    const landAtt = this.landsCreatures() ? this.landsBf().filter((p) => !p.tapped && (!p.sick || this.awakened)) : [];
    if (this.inArena()) {
      // a pod: real blockers decide. Land creatures are 2/2; the Druid Class land is as big as our land count
      const dl = druidLand ? landAtt[0] ?? this.landsBf().find((p) => !p.tapped) ?? null : null;
      const pool = [...ready, ...landAtt, ...(dl && !landAtt.includes(dl) ? [dl] : [])];
      const size = (p: Perm) => (p === dl ? druidLand : 2);
      if (pool.length) this.arenaCombat(pool, (p) => (p.land !== null ? size(p) : this.power(p)), (p) => (p.land !== null ? size(p) : this.toughness(p)));
      this.checkKill();
      return;
    }
    const g = [...ground.map((p) => this.power(p)), ...(druidLand ? [druidLand] : []), ...landAtt.map(() => 2)].sort((a, b) => b - a);
    const groundDmg = g.slice(Math.floor(g.length / 2)).reduce((s, x) => s + x, 0);
    let att = fly, dmg = flyDmg;
    if (g.length && this.winsWith(flyDmg + groundDmg)) {
      att = [...fly, ...ground, ...landAtt];
      dmg = flyDmg + groundDmg;
    }
    if (dmg <= 0) return;
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
    this.say(`attack with ${att.length} creature(s)${druidLand && att.length > fly.length ? " + the Druid Class land" : ""}: ` +
      `${dmg} damage, opp life [${this.life.join(", ")}]`);
    this.checkKill();
  }

  // ================================================================ the loop solver
  /** A creature that can put a land onto the battlefield over and over (Retreat untaps it). */
  loopPutter(): Perm | null {
    const ps = this.bf.filter((p) => PUTTERS.has(p.cd.name) && !p.sick && !(p.cd.name === BUDOKA && (p.transformed || this.landsBf().length >= 9)));
    const up = ps.find((p) => !p.tapped);
    if (up) return up;
    // a tapped one: a land drop (with a land in hand) starts the loop by untapping it
    if (ps.length && this.canDrop() && this.landsInHand().length) return ps[0];
    return null;
  }
  /** The best instant or sorcery for Uyo to copy that we can cast with this much mana. */
  uyoTarget(budget: number): CardDef | null {
    const is = this.hand.filter((c) => c.isIS && !HOLD.has(c.name));
    const cost = (c: CardDef) => (c.name === BSZ ? 4 : this.effCost(c).mv);
    const ok = is.filter((c) => cost(c) <= budget);
    if (!ok.length) return null;
    const pri = (c: CardDef) => (c.name === BSZ ? 3 : c.name === SWARM ? 2 : c.name === DOMINION ? 1 : 0);
    return firstMax(ok, pri);
  }

  /** Which loops are on the battlefield right now. Mana per loop = lands returned x (1 if they come back
   *  untapped + 1 with Lotus Cobra) + 1 for Oboro Breezecaller's untap - the ability's cost (after
   *  reducers, never below 1). 0 or more: endless; more than 0: endless mana as well. */
  loops(): Loops {
    const L: Loops = { landfall: false, mana: false, draw: false, tokens: false, mill: false, copy: false, lock: false, replay: false, start: 99, putter: null, how: [] };
    const inHand = (n: string) => this.hand.some((c) => c.name === n);
    if (this.onBf(OMNI) && (inHand(KIRI) || inHand(HARU)) && (inHand(KIRI) || this.onBf(KIRI)) && (inHand(HARU) || this.onBf(HARU))) {
      L.draw = true;
      L.start = 0;
      L.how.push("Omniscience + Kiri-Onna + Haru-Onna (draw as many as needed, bounce their creatures)");
    }
    const cobra = this.onBf(COBRA) ? 1 : 0;
    const red = this.reduction();
    const lm = this.replayMana(); // 0 when lands are summoning-sick creatures (Nature's Revolt, Natural Affinity)
    const untapped = this.landsBf().filter((p) => this.untappedLand(p.cd)).length;
    const avail = this.availMana();
    const putter = this.hasUntapper() ? this.loopPutter() : null;
    const replayB = this.onBf(KODAMA) && this.onBf(MELOKU);
    L.replay = putter !== null || replayB;
    const found = (how: string, net: number, start = 0, viaPutter = false) => {
      L.landfall = true;
      if (viaPutter) L.putter = putter;
      L.start = Math.min(L.start, start);
      if (net > 0) L.mana = true;
      L.how.push(how);
    };
    if (putter) {
      const pn = putter.cd.name.split(",")[0];
      const ch = this.hand.find((c) => c.land?.special === "chamber");
      if (ch) found(`Retreat + ${pn} + ${ch.name}`, cobra, 0, true);
      for (const p of this.bf) {
        const r = RETURNERS[p.cd.name];
        if (!r || r[2] === "counter") continue;
        const [c, n, kind] = r;
        const cost = Math.max(1, c - red);
        if (untapped < n || avail < cost) continue;
        if (kind === "copy" && !this.uyoTarget(avail - cost)) continue;
        const net = n * (lm + cobra) + (kind === "untap" ? 1 : 0) - cost;
        if (net < 0 && !this.infMana) continue;
        found(`Retreat + ${pn} + ${p.cd.name.split(",")[0]}`, net, cost, true);
        if (kind === "token") L.tokens = true;
        else if (kind === "mill") L.mill = true;
        else if (kind === "copy") L.copy = true;
        else if (p.cd.name === "Soratami Mirror-Mage" && this.landsCreatures()) L.lock = true;
      }
    }
    // Kodama + Meloku: with lands as creatures Retreat (free in this loop) untaps an older land each time
    const kNet = lm + cobra + (this.hasUntapper() && this.landsCreatures() ? 1 : 0) - 1;
    if (replayB && untapped >= 1 && avail >= 1 && (kNet >= 0 || this.infMana)) {
      found("Kodama + Meloku", kNet, 1);
      L.tokens = true;
    }
    if (L.landfall && cobra) L.mana = true;
    if (this.infMana) L.mana = true;
    if (L.mana && L.replay) {
      // endless mana: every moonfolk can be the land returner
      L.landfall = true;
      if (putter && !L.putter) L.putter = putter;
      if (this.onBf(MINDSWEEPER)) L.mill = true;
      if (this.onBf(MELOKU)) L.tokens = true;
      if (this.onBf(UYO) && this.uyoTarget(99)) L.copy = true;
      if (this.onBf("Soratami Mirror-Mage") && this.landsCreatures()) L.lock = true;
    }
    // Omniscience + Onnas with lands as creatures: Kiri-Onna bounces a land every time
    if (L.draw && L.how[0]?.startsWith("Omniscience") && (this.revolt || this.affinity || this.hand.some((c) => c.name === AFFINITY || c.name === REVOLT)))
      L.lock = true;
    if (L.landfall && (this.onBf(AESI) || this.onBf(TATYOVA))) L.draw = true;
    return L;
  }

  /** Cheap test before the solver: is any loop conceivable? */
  loopPossible(): boolean {
    return this.infMana || this.hasUntapper() || this.onBf(OMNI) || (this.onBf(KODAMA) && this.onBf(MELOKU));
  }

  /** Shortcut the loops on the battlefield: draw (keeping some cards), put every land from hand onto the
   *  battlefield, cast what makes the loops bigger, and look for a win. Returns true if we won now. */
  comboSolve(): boolean {
    if (!this.loopPossible()) return false;
    const key = this.bf.map((p) => p.cd.name + (p.tapped ? "t" : "")).join("|") + "#" + this.hand.map((c) => c.name).join("|") +
      "#" + this.availMana() + this.dropsUsed;
    if (key === this.comboKey) return false;
    this.comboKey = key;
    let L = this.loops();
    if (!L.landfall && !L.draw) return false;
    const how = "LOOP: " + L.how.join("; ");
    if (how !== this.lastLoopSay) this.say(how);
    this.lastLoopSay = how;
    // what the loops gave at any point (casting can use up the mana a loop needs, but its tokens were made first)
    let tokens = false, copy = false;
    for (let it = 0; it < 120; it++) {
      if (L.putter) L.putter.tapped = false; // Retreat untapped it after the loop's last land
      if (L.mana && !this.infMana) {
        this.infMana = true;
        this.say("LOOP: endless mana");
      }
      tokens ||= L.tokens;
      copy ||= L.copy;
      if (this.loopWin(L)) return true;
      // draw everything first (keeping some cards), then put the lands down, then cast
      if (L.draw && this.library.length > this.keep()) {
        this.draw(this.library.length - this.keep());
        if (L.landfall && L.replay) this.dumpLands();
        L = this.loops();
        continue;
      }
      let progress = false;
      if (L.landfall && L.replay && this.dumpLands()) progress = true;
      this.loopReserve = this.infMana ? 0 : L.start === 99 ? 0 : L.start;
      if (this.loopCast()) progress = true;
      this.loopReserve = 0;
      if (!progress) break;
      L = this.loops();
    }
    this.loopNextTurn({ ...L, tokens: tokens || L.tokens, copy: copy || L.copy });
    this.comboKey = this.bf.map((p) => p.cd.name + (p.tapped ? "t" : "")).join("|") + "#" + this.hand.map((c) => c.name).join("|") +
      "#" + this.availMana() + this.dropsUsed;
    return this.oppsBeaten();
  }

  /** A win this turn from the loops: Mindsweeper, Uyo copying Blue Sun's Zenith, or endless mana +
   *  Blue Sun's Zenith (drawn again each time with endless draws). */
  loopWin(L: Loops): boolean {
    if (L.lock && this.cfg.land_lock_win) {
      const c = !this.revolt && !this.affinity ? this.hand.find((x) => x.name === AFFINITY || x.name === REVOLT) : undefined;
      if (c) {
        if (c.name === AFFINITY ? this.castIS(c) : this.castPerm(c)) this.say(`(${c.name}: lands are creatures)`);
      }
      if (this.revolt || this.affinity) {
        this.locked = true;
        for (let i = 0; i < this.lib.length; i++) if (this.firstOppDead === null) this.firstOppDead = this.turn;
        this.loopWinHow = "land lock: every opponent's land bounced";
        this.say("LOOP WIN: lands are creatures, every opponent's land is bounced over and over (land lock)");
        return true;
      }
    }
    if (L.mill) {
      this.millAll("endless Soratami Mindsweeper activations");
      return true;
    }
    const bszHand = this.hand.find((c) => c.name === BSZ);
    if (L.copy && bszHand && this.uyoTarget(this.availMana() - 1)?.name === BSZ && this.castX(bszHand, 1)) {
      this.millAll("Uyo copies Blue Sun's Zenith for every opponent");
      return true;
    }
    if (this.infMana && (bszHand || (L.draw && this.library.some((c) => c.name === BSZ)))) {
      if (L.draw) {
        this.millAll("endless mana: Blue Sun's Zenith on each opponent (shuffled back and drawn again)");
        return true;
      }
      // one huge Zenith: one opponent
      let t: number | null = null;
      for (let i = 0; i < this.lib.length; i++) if (this.oppAlive(i) && (t === null || this.lib[i] > this.lib[t])) t = i;
      if (t !== null && bszHand) {
        removeOne(this.hand, bszHand);
        this.library.push(bszHand);
        this.shuffle();
        this.millOut(t);
        this.say(`endless mana: Blue Sun's Zenith mills opponent ${t + 1}`);
      }
      return this.oppsBeaten();
    }
    return false;
  }
  /** Cast Blue Sun's Zenith with this X (at an opponent: they draw / mill X). */
  castX(cd: CardDef, x: number): boolean {
    if (this.epic || !this.pay(cd.cost.withGeneric(x), true)) return false;
    removeOne(this.hand, cd);
    this.spellsCast += 1;
    this.library.push(cd);
    this.shuffle();
    this.say(`cast Blue Sun's Zenith (X=${x})`);
    return true;
  }
  /** Loops with a way to replay lands: every land in hand goes onto the battlefield (untapped). */
  dumpLands(): boolean {
    const lands = this.landsInHand().filter((c) => c.land!.special !== "chamber");
    if (!lands.length) return false;
    let n = 0;
    for (const cd of lands) {
      removeOne(this.hand, cd);
      if (cd.land!.special === "wilds") {
        this.gy.push(cd);
        const b = this.library.find((x) => x.land?.basic);
        if (b && this.library.length > this.keep()) {
          removeOne(this.library, b);
          const q = new Perm(b, b.land, true);
          q.sick = false;
          this.bf.push(q);
        }
      } else {
        const q = new Perm(cd, cd.land, cd.land!.etb === "tapped");
        q.sick = false;
        this.bf.push(q);
      }
      n++;
    }
    for (const p of this.bf) if (p.cd.name === KHALNI) p.counters += n;
    this.say(`LOOP: ${n} land(s) from hand onto the battlefield`);
    return true;
  }
  /** Cast the most useful card for the loops that we can pay for (free with Omniscience). */
  /** Mana the solver keeps unspent so the loop that's going can keep going. */
  loopReserve = 0;
  lastLoopSay = ""; // (the trace names a loop once a turn)
  canPayKeeping(cost: Cost): boolean {
    if (this.infMana || this.loopReserve === 0) return this.canPay(cost);
    return this.availMana() - cost.mv >= this.loopReserve && this.canPay(cost);
  }
  loopCast(): boolean {
    if (this.epic) return false;
    if (this.command.length) {
      const a = this.command[0];
      if (this.canPayKeeping(this.commanderCost(a, this.effCost(a))) && this.castPerm(a, true)) return true;
    }
    for (const name of LOOP_CAST) {
      const cd = this.hand.find((c) => c.name === name);
      if (!cd) continue;
      if (name === "Graceful Adept" && this.hand.length <= 8) continue;
      if (name === OMNI && !this.canPay(this.effCost(cd))) continue;
      if (this.onBf(name) && cd.types.has("legendary")) continue;
      if (this.canPayKeeping(this.effCost(cd)) && this.castPerm(cd)) return true;
    }
    // with Omniscience everything else is free too (permanents only; spells could end the loops' value)
    if (this.onBf(OMNI)) {
      // (not the Onnas: they are the draw loop, cast and returned over and over)
      const cd = this.hand.find((c) => c.land === null && !c.isIS && !HOLD.has(c.name) && c.name !== KIRI && c.name !== HARU &&
        !(c.types.has("legendary") && this.onBf(c.name)));
      if (cd && this.castPerm(cd)) return true;
    }
    return false;
  }
  /** Wins that land on the next turn: endless Illusions (summoning sick now), Uyo copying an epic spell. */
  loopNextTurn(L: Loops): void {
    if (this.oppsBeaten()) return;
    const army = this.bf.some((p) => p.cd === TOK.illusionArmy || p.cd === TOK.snakeArmy);
    if (army || this.dominionCopies >= (this.cfg.dominion_win as number)) return;
    if (L.tokens) {
      this.enter(TOK.illusionArmy, "token", { token: true });
      this.loopWinHow = "endless Illusions (attack next turn)";
      this.say("LOOP: endless Meloku Illusions (they attack next turn)");
      return;
    }
    if (L.copy) {
      const t = this.uyoTarget(this.availMana() - 1);
      if (t && (t.name === SWARM || t.name === DOMINION) && this.castIS(t)) {
        if (t.name === SWARM) {
          this.enter(TOK.snakeArmy, "token", { token: true });
          this.swarmCopies = 99;
          this.loopWinHow = "Uyo copies Endless Swarm (attack next turn)";
        } else {
          this.dominionCopies = 99;
          this.loopWinHow = "Uyo copies Eternal Dominion (win next upkeep)";
        }
        this.say(`LOOP: Uyo copies ${t.name} over and over`);
      }
    }
  }

  /** The turn planner may pick any of its best few plays, but with aesi_first it never passes up casting Aesi. */
  override plan(options: number[], main2: boolean): number {
    if (this.cfg.aesi_first && this.command.length) {
      const cands = this.orderedCands(main2);
      const i = options.find((k) => cands[k]?.score === 96); // (the commander's score; nothing else uses 96)
      if (i !== undefined) return i;
    }
    return super.plan(options, main2);
  }

  // ================================================================ what to do
  candidates(main2: boolean): Cand[] {
    const out: Cand[] = [];
    const add = (score: number, cost: Cost, isIS: boolean, act: () => boolean, rock?: CardDef) =>
      out.push({ score, cost, isIS, act, rock });
    const nLands = this.landsBf().length;
    const early = nLands < 8;
    const lands = this.landsInHand();
    // lands: every one is a landfall trigger (a card with Aesi)
    if (lands.length) {
      const w = this.landWay();
      if (w && w.kind !== "patron") add(92, new Cost(), false, () => this.playLandVia(w));
      else if (w) add(70, new Cost(1), false, () => this.playLandVia(w));
    }
    if (this.epic) {
      this.abilityCands(add, main2);
      return out;
    }
    // commander
    for (const cd of this.command.slice()) add(96, this.commanderCost(cd, this.effCost(cd)), false, () => this.castPerm(cd, true));
    const seen = new Set<string>();
    const omni = this.onBf(OMNI);
    for (const cd of this.hand.slice()) {
      if (seen.has(cd.name) || cd.land !== null || HOLD.has(cd.name)) continue;
      seen.add(cd.name);
      const n = cd.name;
      if (cd.types.has("legendary") && this.onBf(n)) continue;
      let sc = this.value(cd);
      if (RAMP.has(n)) sc = early ? 86 : 40;
      if (n === "Sol Ring") { add(100, this.effCost(cd), false, () => this.castPerm(cd), cd); continue; }
      if (cd.isIS) {
        this.spellCand(cd, add, main2, early);
        continue;
      }
      if (n === BEANSTALK) {
        // the adventure first: Fertile Footsteps (a basic onto the battlefield, untapped)
        const ff = Cost.parse("{2}{G}");
        if (!this.footstepsExiled) add(early ? 84 : 50, ff, true, () => this.fertileFootsteps(cd));
        continue;
      }
      if (n === COBRA && lands.length) sc = 93;
      if ((n === RETREAT || n === RAFT) && this.bf.some((p) => PUTTERS.has(p.cd.name))) sc = 94;
      if ((n === "Training Grounds" || n === "Heartstone") && !this.bf.some((p) => RETURNERS[p.cd.name])) sc = 35;
      if (n === OMNI && !(this.hand.some((c) => c.name === KIRI) && this.hand.some((c) => c.name === HARU))) sc = 70;
      if (omni) sc = Math.max(sc, 60);
      if (n === "Graceful Adept" && this.hand.length < 7) sc = 25;
      if (n === "Kira, Great Glass-Spinner" && !main2) continue;
      if (n === REVOLT) {
        // it makes replayed lands summoning sick (no mana): only for a lethal attack with our lands now
        if (!main2 && this.landAttackLethal(this.effCost(cd).mv, false)) add(98, this.effCost(cd), false, () => this.castPerm(cd));
        continue;
      }
      if (n === MAP && this.comboLandWanted()) sc = 90;
      if (n === PATRON) {
        const m = this.offeringFodder();
        if (m) {
          const oc = new Cost(Math.max(0, 5 - m.cd.cost.g), Math.max(0, 2 - m.cd.cost.u));
          add(sc + 2, oc, false, () => this.patronOffering(cd, m, oc));
        }
      }
      add(sc, this.effCost(cd), false, () => this.castPerm(cd));
    }
    if (this.footstepsExiled) {
      const g = C.get(BEANSTALK);
      add(early ? 30 : 45, g.cost, false, () => this.castGiant(g));
    }
    this.abilityCands(add, main2);
    return out;
  }

  /** Instants and sorceries. */
  spellCand(cd: CardDef, add: (s: number, c: Cost, isIS: boolean, a: () => boolean) => void, main2: boolean, early: boolean): void {
    const n = cd.name;
    const cost = this.effCost(cd);
    const basics = this.library.filter((c) => c.land?.basic).length;
    const lands = this.landsInHand().length;
    const ramp = early ? 86 : 42;
    switch (n) {
      case LORE: case THREE:
        if (this.library.some((c) => c.name === "Forest")) add(ramp + 2, cost, true, () => this.castIS(cd));
        return;
      case CLAIM:
        if (this.library.filter((c) => c.name === "Forest").length >= 2) add(ramp + 1, cost, true, () => this.castIS(cd));
        return;
      case SEARCH:
        // suspend for {G} (the land comes at our upkeep two turns later), or cast it for {2}{G} when we need it now
        if (basics) add(ramp + 3, Cost.parse("{G}"), true, () => this.suspendSearch(cd));
        if (basics) add(ramp - 6, cost, true, () => this.castIS(cd));
        return;
      case "Rampant Growth": case "Farseek": case "Cultivate": case "Explosive Vegetation": case "Circuitous Route":
      case "Reach the Horizon": case "Nissa's Pilgrimage": case "Entish Restoration":
        if (basics >= 2) add(ramp + (n === "Explosive Vegetation" || n === "Circuitous Route" || n === "Reach the Horizon" ? 1 : 0), cost, true, () => this.castIS(cd));
        return;
      case "Harrow":
        if (basics >= 2) add(early ? 88 : 60, cost, true, () => this.castIS(cd));
        return;
      case "Grow from the Ashes": {
        const kick = cost.plus(new Cost(2));
        if (basics >= 2 && this.canPay(kick)) add(ramp + 2, kick, true, () => this.castIS(cd, false, kick, "kicked"));
        else if (basics) add(ramp - 2, cost, true, () => this.castIS(cd));
        return;
      }
      case "Growth Spiral":
        add(76, cost, true, () => this.castIS(cd));
        return;
      case "Explore":
        add(lands >= 1 || this.onBf(AESI) ? 70 : 55, cost, true, () => this.castIS(cd));
        return;
      case "Summer Bloom": {
        const extra = Math.min(3, lands - (this.dropsAllowed() - this.dropsUsed));
        if (extra >= 1) add(45 + 12 * extra, cost, true, () => this.castIS(cd));
        return;
      }
      case "Seismic Sense":
        add(56, cost, true, () => this.castIS(cd));
        return;
      case "Bushwhack":
        if (basics && lands === 0 && this.canDrop()) add(50, cost, true, () => this.castIS(cd, false, null, "basic"));
        return;
      case "Early Harvest": {
        // untap the basics: worth it when it pays for something big we couldn't cast otherwise
        const tappedBasics = this.landsBf().filter((p) => p.tapped && p.land!.basic).length;
        const avail = this.availMana() - 3;
        const big = [...this.hand, ...this.command].some((c) => c !== cd && c.land === null && !HOLD.has(c.name) && !c.isIS &&
          this.effCost(c).mv > this.availMana() && this.effCost(c).mv <= avail + tappedBasics);
        if (tappedBasics >= 4 && big) add(80, cost, true, () => this.castIS(cd));
        return;
      }
      case BSZ: {
        // draw for ourselves with what's left in the second main phase
        const x = this.availMana() - 3;
        if (main2 && x >= 2 && this.library.length > this.keep() + x) add(38 + 5 * x, cd.cost.withGeneric(x), true, () => this.zenithSelf(cd, x));
        return;
      }
      case SWARM:
        if (this.swarmLethal()) add(97, cost, true, () => this.castIS(cd));
        return;
      case AWAKENING:
        if (!main2 && this.landAttackLethal(cost.mv, true)) add(98, cost, true, () => this.castIS(cd));
        return;
      case AFFINITY:
        if (!main2 && this.landAttackLethal(cost.mv, false)) add(98, cost, true, () => this.castIS(cd));
        return;
      case SCRYING:
        if (this.library.some((c) => c.land !== null)) add(this.comboLandWanted() ? 95 : early ? 64 : 48, cost, true, () => this.castIS(cd));
        return;
      case CROP:
        // sacrifice a land, put a land onto the battlefield: only for the Retreat loop's Simic Growth Chamber
        if (this.comboLandWanted() && this.landsBf().length >= 2) add(95, cost, true, () => this.castIS(cd));
        return;
      case DOMINION:
        // only when nothing else is left to cast (it stops our spells for the rest of the game)
        if (this.turn >= 12 && !this.hand.some((c) => c !== cd && c.land === null && !HOLD.has(c.name)))
          add(20, cost, true, () => this.castIS(cd));
        return;
      default:
        add(this.value(cd), cost, true, () => this.castIS(cd));
    }
  }

  /** Endless Swarm now kills the table at the next attack: its Snakes (summoning sick now) plus the next
   *  upkeep's copy, half of the ground blocked, plus the flyers. */
  swarmLethal(): boolean {
    const h = this.hand.length - 1;
    const ground = this.creatures().filter((p) => !p.cd.flying && this.power(p) > 0).length;
    const fly = this.creatures().filter((p) => p.cd.flying).reduce((s, p) => s + this.power(p), 0);
    const n = ground + 2 * h;
    const dmg = n - Math.floor(n / 2) + fly;
    return this.winsWith(dmg);
  }

  abilityCands(add: (s: number, c: Cost, isIS: boolean, a: () => boolean) => void, main2: boolean): void {
    const lands = this.landsInHand().length;
    // return a land with a moonfolk and play it again: a landfall trigger (a card with Aesi) for the mana
    if (lands === 0 && this.landsBf().length >= 3) {
      const way = this.landWay();
      if (way && way.kind !== "patron") {
        const opts = this.bf.filter((p) => {
          const r = RETURNERS[p.cd.name];
          return r && r[1] === 1 && r[2] !== "counter";
        });
        if (opts.length) {
          const cost = (p: Perm) => this.abilityCost(new Cost(RETURNERS[p.cd.name][0])).mv;
          const kindBonus: Record<string, number> = { token: 6, loot: 3, untap: 4, mill: 0, none: 0 };
          const best = firstMax(opts, (p) => -10 * cost(p) + kindBonus[RETURNERS[p.cd.name][2]]);
          const c = cost(best);
          const aesi = this.onBf(AESI) || this.onBf(COBRA) || this.onBf(KHALNI) || this.onBf(KODAMA);
          if (aesi && (c <= 1 || main2)) add(c <= 1 ? 66 : 34, new Cost(c), false, () => this.bounceReplay(best));
        }
      }
    }
    // Meloku in the second main phase: tapped lands become Illusions, replayed next turn with spare drops
    const mel = this.perm(MELOKU);
    if (mel && main2 && lands + 1 < this.dropsAllowed() && this.landsBf().some((p) => p.tapped && p.land!.basic) &&
        this.landsBf().length >= 6)
      add(30, this.abilityCost(new Cost(1)), false, () => this.melokuEnd());
    for (const p of this.bf) {
      const n = p.cd.name;
      const ready = !p.tapped && !(p.isCreature && p.sick);
      if (n === "Sakura-Tribe Elder" && this.library.some((c) => c.land?.basic))
        add(72, new Cost(), false, () => { this.sacrifice(p); return this.fetchBasic({ tapped: true }); });
      else if (n === KHALNI && p.counters >= 3 && this.library.some((c) => c.land?.basic))
        add(74, new Cost(), false, () => this.khalni(p));
      else if (n === MAP && !p.tapped && this.library.some((c) => c.land !== null) &&
               (this.comboLandWanted() || (main2 && lands === 0 && this.canDrop())))
        add(this.comboLandWanted() ? 93 : 45, new Cost(2), false, () => this.expeditionMap(p));
      else if (n === MYRIAD && !p.tapped && this.library.filter((c) => c.land?.basic).length >= 2)
        add(68, new Cost(2), false, () => this.myriad(p));
      else if (n === "Demolition Field" && !p.tapped && this.library.some((c) => c.land?.basic) && this.availMana() >= 3)
        add(main2 ? 46 : 40, new Cost(2), false, () => this.demolition(p));
      else if (n === DRUID && p.counters === 1) add(72, Cost.parse("{2}{G}"), false, () => this.levelUp(p, Cost.parse("{2}{G}")));
      else if (n === DRUID && p.counters === 2 && this.landsBf().length >= 8 && !main2)
        add(48, Cost.parse("{4}{G}"), false, () => this.levelUp(p, Cost.parse("{4}{G}")));
      else if (n === "Loot, Exuberant Explorer" && ready && main2) {
        const cost = this.abilityCost(Cost.parse("{4}{G}{G}"));
        add(44, cost, false, () => this.lootDig(p, cost));
      } else if (n === BUDOKA && p.transformed && ready && main2) {
        const cost = this.abilityCost(Cost.parse("{4}{G}{G}"));
        add(30, cost, false, () => this.dokai(p, cost));
      }
    }
  }

  /** Our lands as 2/2 creatures would kill the table this turn (after paying this much, sick lands first;
   *  with haste every untapped land attacks). Half of the ground attackers are blocked. */
  landAttackLethal(costMv: number, haste: boolean): boolean {
    const lands = this.landsBf().filter((p) => !p.tapped);
    const landMana = lands.reduce((s, p) => s + (this.srcKind(p) === "GU" || this.srcKind(p) === "C2" ? 2 : 1), 0);
    const pay = Math.max(0, costMv - Math.max(0, this.availMana() - landMana));
    let att = haste ? lands.length : lands.filter((p) => !p.sick).length;
    const sickSpare = haste ? 0 : lands.length - att;
    att -= Math.max(0, pay - sickSpare);
    if (att <= 0) return false;
    const fly = this.creatures().filter((p) => p.cd.flying && !p.tapped && !p.sick).reduce((s, p) => s + this.power(p), 0);
    const g = [...this.creatures().filter((p) => !p.cd.flying && !p.tapped && !p.sick && this.power(p) > 0).map((p) => this.power(p)),
      ...new Array(att).fill(2)].sort((a, b) => b - a);
    return this.winsWith(fly + g.slice(Math.floor(g.length / 2)).reduce((s, x) => s + x, 0));
  }
  /** The Retreat loop is one Simic Growth Chamber / Guildless Commons away (a land tutor gets it). */
  comboLandWanted(): boolean {
    return this.hasUntapper() && this.bf.some((p) => PUTTERS.has(p.cd.name) && !p.sick) &&
      !this.hand.some((c) => c.land?.special === "chamber") && this.library.some((c) => c.land?.special === "chamber");
  }
  /** What a land tutor gets: the Retreat loop's Chamber, else the land with the most landfall. */
  landTutorTarget(): CardDef | null {
    const lib = this.library.filter((c) => c.land !== null);
    if (!lib.length) return null;
    if (this.comboLandWanted()) return lib.find((c) => c.land!.special === "chamber")!;
    for (const n of [MYRIAD, PASSAGE, "Evolving Wilds", "Terramorphic Expanse", CHAMBER, "Guildless Commons"]) {
      const c = lib.find((x) => x.name === n);
      if (c) return c;
    }
    const want = this.wantColour() === "U" ? "Island" : "Forest";
    return lib.find((c) => c.name === want) ?? lib[0];
  }
  landTutor(toBattlefield: boolean): void {
    const t = this.landTutorTarget();
    if (!t) return;
    if (toBattlefield) this.putLand(t, "library", "tutor onto the battlefield");
    else {
      removeOne(this.library, t);
      this.hand.push(t);
      this.say("land tutor ->", t);
    }
    this.shuffle();
  }
  expeditionMap(p: Perm): boolean {
    if (!this.pay(new Cost(2))) return false;
    this.sacrifice(p);
    this.landTutor(false);
    return true;
  }
  myriad(p: Perm): boolean {
    if (!this.pay(new Cost(2))) return false;
    removeOne(this.bf, p);
    this.gy.push(p.cd);
    const want = this.wantColour() === "U" ? "Island" : "Forest";
    const type = this.library.filter((c) => c.name === want).length >= 2 ? want : want === "Island" ? "Forest" : "Island";
    this.say("Myriad Landscape: two basics");
    this.fetchBasic({ tapped: true, only: type });
    this.fetchBasic({ tapped: true, only: type });
    return true;
  }
  /** Uyo outside a loop: copy a ramp / draw spell (returning two lands we replay with spare drops). */
  override castTriggers(cd: CardDef, _fromGy: boolean, _trig: Record<string, unknown>): void {
    if (!UYO_COPY.has(cd.name) || !this.onBf(UYO) || this.epic) return;
    const basics = this.landsBf().filter((p) => this.untappedLand(p.cd));
    const replays = this.dropsAllowed() - this.dropsUsed + this.readyPutters().length;
    if (basics.length < 8 || !(FETCHES_TWO.has(cd.name) || replays >= 2)) return;
    const cost = this.abilityCost(new Cost(2));
    if (!this.pay(cost)) return;
    const back = basics.sort((a, b) => +b.tapped - +a.tapped).slice(0, 2);
    for (const q of back) {
      if (!q.tapped && this.srcKind(q)) this.tap(q, "N"); // float its mana first
      removeOne(this.bf, q);
      this.hand.push(q.cd);
    }
    this.say(`Uyo copies ${cd.name} (returning ${back.map((q) => q.cd.name).join(", ")})`);
    this.resolve(cd, false, "copy");
  }

  // ---------------------------------------------------------------- actions
  bounceReplay(m: Perm): boolean {
    const [c, , kind] = RETURNERS[m.cd.name];
    const cost = this.abilityCost(new Cost(c));
    const basics = this.landsBf().filter((p) => this.untappedLand(p.cd));
    if (!basics.length) return false;
    let land = basics.find((p) => p.tapped) ?? null;
    if (!land) {
      land = basics[0];
      if (this.srcKind(land)) this.tap(land, "N"); // float its mana first
    }
    if (!this.pay(cost)) return false;
    removeOne(this.bf, land);
    this.hand.push(land.cd);
    this.say(`${m.cd.name.split(",")[0]}: return ${land.cd.name}`);
    this.moonfolkEffect(kind);
    return this.playLandVia(null, land.cd);
  }
  moonfolkEffect(kind: string): void {
    if (kind === "token") this.enter(TOK.illusion, "token", { token: true });
    else if (kind === "loot") {
      this.draw(1);
      this.discard(1);
    } else if (kind === "untap") {
      const t = this.landsBf().find((p) => p.tapped && this.srcKind(p));
      if (t) t.tapped = false;
    } else if (kind === "mill") {
      let t: number | null = null;
      for (let i = 0; i < this.lib.length; i++) if (this.oppAlive(i) && (t === null || this.lib[i] > this.lib[t])) t = i;
      if (t !== null) {
        this.lib[t] = Math.max(0, this.lib[t] - 2);
        if (this.lib[t] === 0 && this.firstOppDead === null) this.firstOppDead = this.turn;
      }
    }
  }
  melokuEnd(): boolean {
    const t = this.landsBf().find((p) => p.tapped && p.land!.basic);
    if (!t || !this.pay(this.abilityCost(new Cost(1)))) return false;
    removeOne(this.bf, t);
    this.hand.push(t.cd);
    this.say(`Meloku: return ${t.cd.name} -> Illusion`);
    this.enter(TOK.illusion, "token", { token: true });
    return true;
  }
  /** Moonfolk offering: the least useful moonfolk (not a loop piece). */
  offeringFodder(): Perm | null {
    const keepers = new Set([MELOKU, UYO, MINDSWEEPER, "Oboro Breezecaller"]);
    const ms = this.bf.filter((p) => RETURNERS[p.cd.name] && !keepers.has(p.cd.name));
    return ms.length ? firstMin(ms, (p) => this.value(p.cd)) : null;
  }
  patronOffering(cd: CardDef, m: Perm, cost: Cost): boolean {
    if (!this.bf.includes(m) || !this.pay(cost)) return false;
    this.say(`moonfolk offering: sacrifice ${m.cd.name} for Patron of the Moon`);
    this.sacrifice(m);
    removeOne(this.hand, cd);
    this.spellsCast += 1;
    this.enter(cd);
    this.spiritCast();
    return true;
  }
  fertileFootsteps(cd: CardDef): boolean {
    if (!this.pay(Cost.parse("{2}{G}"), true)) return false;
    removeOne(this.hand, cd);
    this.exile.push(cd);
    this.footstepsExiled = true;
    this.spellsCast += 1;
    this.say("cast Fertile Footsteps");
    this.fetchBasic();
    return true;
  }
  castGiant(cd: CardDef): boolean {
    if (!this.pay(cd.cost)) return false;
    removeOne(this.exile, cd);
    this.footstepsExiled = false;
    this.spellsCast += 1;
    this.say("cast Beanstalk Giant from exile");
    this.enter(cd);
    return true;
  }
  castFromTop(cd: CardDef): boolean {
    if (this.library[0] !== cd || !this.pay(this.effCost(cd))) return false;
    this.library.shift();
    this.spellsCast += 1;
    this.say("cast from the top (Case):", cd);
    this.enter(cd);
    return true;
  }
  khalni(p: Perm): boolean {
    this.sacrifice(p);
    this.say("Khalni Heart Expedition: two basics");
    this.fetchBasic({ tapped: true });
    this.fetchBasic({ tapped: true });
    return true;
  }
  demolition(p: Perm): boolean {
    if (!this.pay(new Cost(2))) return false;
    p.tapped = true;
    removeOne(this.bf, p);
    this.gy.push(p.cd);
    this.say("Demolition Field: destroy an opponent's nonbasic land, fetch a basic");
    return this.fetchBasic();
  }
  levelUp(p: Perm, cost: Cost): boolean {
    if (!this.pay(cost)) return false;
    p.counters += 1;
    this.say(`Druid Class: level ${p.counters}`);
    return true;
  }
  lootDig(p: Perm, cost: Cost): boolean {
    if (!this.pay(cost)) return false;
    p.tapped = true;
    const top = this.library.splice(0, 6);
    const n = this.landsBf().length;
    const ok = top.filter((c) => c.isCreature && c.mv <= n && !(c.types.has("legendary") && this.onBf(c.name)));
    const pick = ok.length ? firstMax(ok, (c) => this.value(c)) : null;
    if (pick) removeOne(top, pick);
    this.library.push(...top);
    this.say("Loot digs:", pick ?? "nothing");
    if (pick) this.enter(pick, "library");
    return true;
  }
  dokai(p: Perm, cost: Cost): boolean {
    if (!this.pay(cost)) return false;
    p.tapped = true;
    const x = this.landsBf().length;
    this.enter(makeToken("Elemental", x, x, "green"), "token", { token: true });
    this.say(`Dokai: a ${x}/${x} Elemental`);
    return true;
  }
  zenithSelf(cd: CardDef, x: number): boolean {
    if (!this.pay(cd.cost.withGeneric(x), true)) return false;
    removeOne(this.hand, cd);
    this.spellsCast += 1;
    this.say(`cast Blue Sun's Zenith (X=${x}) for us`);
    this.draw(x);
    this.library.push(cd);
    this.shuffle();
    return true;
  }

  // ================================================================ spells
  override resolve(cd: CardDef, fromGy = false, mode: string | null = null): void {
    const n = cd.name;
    const ent = () => this.creatures().some((p) => this.power(p) >= 4);
    switch (n) {
      case "Rampant Growth": this.fetchBasic({ tapped: true }); break;
      case LORE: case THREE: this.fetchBasic({ only: "Forest" }); break;
      case CLAIM: this.fetchBasic({ only: "Forest" }); this.fetchBasic({ only: "Forest" }); break;
      case SEARCH: this.fetchBasic(); break;
      case "Farseek": this.fetchBasic({ tapped: true, only: "Island" }); break;
      case "Cultivate": this.fetchBasic({ tapped: true }); this.fetchBasic({ toHand: true }); break;
      case "Explosive Vegetation": case "Circuitous Route": case "Reach the Horizon":
        this.fetchBasic({ tapped: true }); this.fetchBasic({ tapped: true }); break;
      case "Nissa's Pilgrimage": {
        const mastery = this.gy.filter((c) => c.isIS).length >= 2;
        this.fetchBasic({ tapped: true, only: "Forest" });
        this.fetchBasic({ toHand: true, only: "Forest" });
        if (mastery) this.fetchBasic({ toHand: true, only: "Forest" });
        break;
      }
      case "Grow from the Ashes":
        this.fetchBasic();
        if (mode === "kicked") this.fetchBasic();
        break;
      case "Harrow": case "Entish Restoration": {
        // sacrifice a land (a tapped one), then two basics (Harrow: untapped; Entish: tapped, three with a 4-power creature)
        const lands = this.landsBf();
        const sac = n === "Harrow" && mode === "copy" ? undefined : // Harrow's sacrifice is a cost (not copied)
          lands.find((p) => p.tapped && p.land!.basic) ?? lands.find((p) => p.tapped) ?? lands[0];
        if (sac) {
          removeOne(this.bf, sac);
          this.gy.push(sac.cd);
        }
        const k = n === "Entish Restoration" && ent() ? 3 : 2;
        for (let i = 0; i < k; i++) this.fetchBasic({ tapped: n !== "Harrow" });
        break;
      }
      case "Growth Spiral": {
        this.draw(1);
        const l = this.landsInHand();
        if (l.length) this.putLand(this.chooseLand(l), "hand", "Growth Spiral puts");
        break;
      }
      case "Explore": this.dropsBonus += 1; this.draw(1); break;
      case "Summer Bloom": this.dropsBonus += 3; break;
      case "Early Harvest": for (const p of this.landsBf()) if (p.land!.basic) p.tapped = false; break;
      case "Seismic Sense": {
        const x = Math.min(this.landsBf().length, Math.max(0, this.library.length - this.keep()));
        const top = this.library.splice(0, x);
        const ok = top.filter((c) => c.isCreature || c.land !== null);
        const pick = ok.length ? firstMax(ok, (c) => this.cardValue(c) + (c.isCreature ? 5 : 0)) : null;
        if (pick) {
          removeOne(top, pick);
          this.hand.push(pick);
        }
        this.library.push(...top);
        this.say("Seismic Sense:", pick ?? "nothing");
        break;
      }
      case "Bushwhack": this.fetchBasic({ toHand: true }); break;
      case AWAKENING: this.awakened = true; this.say("our lands are 2/2 creatures with haste"); break;
      case AFFINITY: this.affinity = true; this.say("all lands are 2/2 creatures this turn"); break;
      case SCRYING: this.landTutor(false); break;
      case CROP: {
        const lands = this.landsBf();
        const sac = lands.find((p) => p.tapped && p.land!.basic) ?? lands.find((p) => p.tapped) ?? lands[0];
        if (sac) {
          removeOne(this.bf, sac);
          this.gy.push(sac.cd);
        }
        this.landTutor(true);
        break;
      }
      case SWARM:
        this.makeSnakes(this.hand.length);
        this.epic = true;
        this.swarmCopies += 1;
        this.say("epic: no more spells; a copy every upkeep");
        break;
      case DOMINION:
        this.putStolenLand();
        this.epic = true;
        this.dominionCopies += 1;
        this.say("epic: no more spells; a copy every upkeep");
        break;
      default: super.resolve(cd, fromGy, mode);
    }
  }

  // ================================================================ the planner's score
  override positionValue(): number {
    if (this.died) return -5000;
    let v = 0;
    const start = this.cfg.opp_life as number, lib0 = this.cfg.opp_library as number;
    for (let i = 0; i < this.life.length; i++) {
      v += 2 * (start - Math.max(0, this.life[i])) + 0.5 * (lib0 - this.lib[i]);
      if (!this.oppAlive(i)) v += 60;
    }
    if (this.bf.some((p) => p.cd === TOK.illusionArmy || p.cd === TOK.snakeArmy)) v += 3000;
    const nl = this.landsBf().length;
    v += 24 * Math.min(nl, 12) + 6 * Math.max(0, nl - 12);
    for (const p of this.bf) {
      if (p.land !== null) continue;
      if (p.token) v += 4 + this.power(p);
      else v += 0.8 * this.value(p.cd);
    }
    v += 10 * (this.dropsAllowed() - 1);
    v += 0.4 * this.hand.reduce((s, c) => s + this.cardValue(c), 0);
    if (this.command.length === 0) v += 20; // Aesi out
    return v;
  }
}
