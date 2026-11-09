/**
 * Check a real game (Archidekt playtester log) for missed kills, and let the AI play the same draws.
 *
 *   npm run sim -- gale --analyze logs/game1.txt                     (uses the deck's decklist.txt)
 *   npm run sim -- gale --analyze logs/game1.txt -d lists/proposed.txt --ai 300
 *
 * The log is Archidekt's simplified playtest log, one event per line:
 *   T3; Gale, Waterdeep Prodigy; moved commandZone => battlefield
 * What it does:
 *   1. Replays the log and rebuilds your hand, battlefield, graveyard and untapped mana.
 *   2. Runs the deck's kill finder at the start of every turn (after the draw), after every event
 *      during the turn, and at the end of each turn (for "kill next turn").
 *   3. Gives the AI your opening hand and the same card order (shuffles ignored) and reports when
 *      it kills, so you can compare lines.
 * Notes: instants/sorceries on the battlefield are treated as being on the stack. Floating mana is
 * estimated from taps minus spell costs (see Board.resetPool); +1/+1 counters on Dark Ritual are
 * taken as the player's own floating-{B} record. The kill finder does not tutor in the middle of a
 * combo, so kills that need a tutor first are not found.
 */
import * as fs from "fs";
import * as C from "./cards";
import { Cost } from "./cards";
import { Config, Game, Perm, emptyPool } from "./game";
import { Rng } from "./rng";
import { Deck } from "./runner";

type Event = [number, string, string]; // turn, card, action
type BfEntry = { name: string; tapped: boolean; sick: boolean; counters: number; flipped?: boolean; token?: boolean };
type Pool = { U: number; B: number; A: number; C: number; S: number };
type AnyGame = Game<unknown> & { floatA?: number };

const front = (name: string) => name.split(" // ")[0].trim();

function parse(file: string): Event[] {
  const ev: Event[] = [];
  for (let raw of fs.readFileSync(file, "utf-8").split(/\r?\n/)) {
    raw = raw.trim();
    const m = /^T(\d+);\s*(.+?);\s*(.+)$/.exec(raw);
    if (!m) continue;
    ev.push([Math.max(1, parseInt(m[1], 10)), front(m[2]), m[3].trim()]); // T0 (before the first "next turn") is turn 1
  }
  return ev;
}

/** Zones rebuilt from the log. */
class Board {
  hand: string[] = [];
  gy: string[] = [];
  exile: string[] = [];
  stack: string[] = [];
  /** Trackers the player keeps in Archidekt's misc zone (e.g. Meren's experience as "Start Your Engines!"): value. */
  trackers: Record<string, number> = {};
  command: string[];
  bf: BfEntry[] = [];
  drawOrder: string[] = []; // cards in the order they left the library
  landPlayed = false;
  /** Lands put onto the battlefield from hand this turn (land drops and "put a land" abilities alike). */
  landsFromHand = 0;
  attacked = false;
  ht = 0;
  muck = 0;
  energy = false;
  spellsCast = 0;
  cmdCasts = new Map<string, number>(); // commander -> times cast (commander tax)
  ritualCounter: number | null = null; // Dark Ritual +1/+1 counters: the player's own floating-B record
  pool!: Pool;
  owed: Cost | null = null;

  constructor(commanders: string[], public deckCards: string[], private deck: Deck) {
    this.command = commanders.slice();
    this.resetPool();
  }

  // ------------------------------------------------------------ floating mana estimate
  // The log has taps but no mana pool. Each tap adds what the permanent makes (with High Tide / Muck
  // bonuses at that moment); each spell cast pays its cost (after reducers). A cost the pool can't
  // cover yet is owed and paid by the next taps, because the log sometimes lists a spell before the
  // taps that paid for it. The pool empties at a new turn and at combat (a creature that isn't a
  // mana source taps = it attacks). Not in the log, so not subtracted: activated abilities
  // (Guildmage, Konrad, Monument), kicker and X. The estimate can be too high after those.
  resetPool(): void {
    this.pool = { U: 0, B: 0, A: 0, C: 0, S: 0 };
    this.owed = null;
  }

  private take(keys: (keyof Pool)[], n: number): number {
    for (const k of keys) {
      const t = Math.min(this.pool[k], n);
      this.pool[k] -= t;
      n -= t;
    }
    return n;
  }

  /** Pay cost from the pool; whatever can't be paid yet is owed. */
  spend(cost: Cost, isIS = false): void {
    const p = this.pool;
    const u = this.take(["U", "A"], cost.u);
    const b = this.take(["B", "A"], cost.b);
    let h = 0;
    for (let i = 0; i < cost.h; i++) h += this.take(p.U >= p.B ? ["U", "B", "A"] : ["B", "U", "A"], 1);
    const [big, small]: (keyof Pool)[] = p.U >= p.B ? ["U", "B"] : ["B", "U"];
    const g = this.take([...(isIS ? ["S" as const] : []), "C", big, small, "A"], cost.g);
    if (u || b || h || g) {
      const o = this.owed ?? new Cost();
      this.owed = new Cost(o.g + g, o.u + u, o.b + b, o.h + h);
    }
  }

  addMana(card: string, entry: BfEntry): void {
    const cd = C.get(card);
    const info = cd.land ?? (cd.mdfcLand && !cd.isIS ? cd.mdfcLand : null);
    let k: string | null = info !== null ? info.mana : cd.rock;
    if (k === null && card === "Curious Homunculus" && !entry.flipped) k = "S";
    const p = this.pool;
    if (k === null) {
      if (card === "Wishclaw Talisman") this.spend(new Cost(1));
      else if (cd.isCreature) this.resetPool(); // attacking: combat, mana from main phase 1 is gone
      return;
    }
    if (k === "F") {
      // filter (Dimir Signet, Darkwater Catacombs): pay 1, get UB
      this.spend(new Cost(1));
      p.U += 1;
      p.B += 1;
    } else if (k === "UB") {
      p.U += 1;
      p.B += 1;
    } else if (k === "C2") p.C += 2;
    else if (k in p) p[k as keyof Pool] += 1;
    if (info !== null) {
      if (info.island || this.energy) p.U += this.ht;
      if (info.swamp || this.energy) p.B += this.muck;
    }
    if (this.owed !== null) {
      const o = this.owed;
      this.owed = null;
      this.spend(o);
    }
  }

  /** Estimated floating mana right now (nothing while a cost is still owed). */
  floating(): Pool {
    if (this.owed !== null) return { U: 0, B: 0, A: 0, C: 0, S: 0 };
    const f = { ...this.pool };
    if (this.ritualCounter !== null) f.B = this.ritualCounter;
    return f;
  }

  move(card: string, src: string, dst: string): void {
    const cd = C.get(card);
    // remove from source
    if (src === "battlefield" && this.stack.includes(card) && (dst === "graveyard" || dst === "exile")) {
      // an instant/sorcery leaving the "stack" has resolved (or was countered: rare for these)
      if (card === "High Tide") this.ht += 1;
      else if (card === "Bubbling Muck") this.muck += 1;
      else if (card === "Energybending") this.energy = true;
      else if (card === "Dark Ritual") this.pool.B += 3;
    }
    const drop = (xs: string[]) => xs.splice(xs.indexOf(card), 1);
    if (src === "hand" && this.hand.includes(card)) drop(this.hand);
    else if (src === "graveyard" && this.gy.includes(card)) drop(this.gy);
    else if (src === "exile" && this.exile.includes(card)) drop(this.exile);
    else if (src === "commandZone" && this.command.includes(card)) drop(this.command);
    else if (src === "battlefield") {
      if (this.stack.includes(card)) drop(this.stack);
      else {
        const i = this.bf.findIndex((p) => p.name === card);
        if (i >= 0) {
          const [e] = this.bf.splice(i, 1);
          if (e.token) return; // a token that leaves the battlefield is gone
        }
      }
    } else if (src === "library") this.drawOrder.push(card);
    // add to destination
    if (dst === "hand") this.hand.push(card);
    else if (dst === "graveyard") this.gy.push(card);
    else if (dst === "exile") this.exile.push(card);
    else if (dst === "commandZone") this.command.push(card);
    else if (dst === "library") {
      // put back on top: it will be "drawn" again, so forget the earlier draw
      const i = this.drawOrder.lastIndexOf(card);
      if (i >= 0) this.drawOrder.splice(i, 1);
    } else if (dst === "battlefield") {
      if (cd.isIS) this.stack.push(card);
      else {
        if ((cd.land !== null || (cd.mdfcLand && src === "hand")) && src === "hand") {
          this.landPlayed = true;
          this.landsFromHand += 1;
        }
        this.bf.push({ name: card, tapped: false, sick: cd.isCreature, counters: 0 });
      }
    }
  }

  tap(card: string, tapped: boolean): void {
    const c = this.bf.find((p) => p.name === card && p.tapped !== tapped);
    if (!c) return;
    c.tapped = tapped;
    if (tapped) this.addMana(card, c);
    if (tapped && card === "The Mindskinner" && !c.sick) this.attacked = true;
    // tokens whose only tap ability sacrifices them (Food, Treasure): Archidekt doesn't log them leaving
    if (tapped && c.token && (this.deck.logSacOnTap ?? []).includes(card)) this.bf.splice(this.bf.indexOf(c), 1);
  }

  newTurn(): void {
    for (const p of this.bf) p.sick = false;
    this.landPlayed = false;
    this.landsFromHand = 0;
    this.attacked = false;
    this.ht = this.muck = 0;
    this.energy = false;
    this.spellsCast = 0;
    this.ritualCounter = null;
    this.resetPool();
  }

  /** A spell cast (costs mana): onto the battlefield/stack from hand, graveyard (Gale), command zone
   *  or exile. Lands and cards put onto the battlefield from the library aren't casts. */
  isCast(card: string, src: string, dst: string): boolean {
    if (dst !== "battlefield" || !["hand", "graveyard", "commandZone", "exile"].includes(src)) return false;
    const cd = C.get(card);
    return cd.isIS || !(cd.land !== null || (cd.mdfcLand && src === "hand"));
  }

  payCast(card: string, src: string, turn: number, cfg: Config): void {
    const cd = C.get(card);
    const g = this.game(turn, cfg); // board before the spell: cost reducers in play
    g.spellsCast = this.spellsCast;
    let cost = g.effCost(cd, null, src === "graveyard");
    if (src === "commandZone") {
      const n = this.cmdCasts.get(card) ?? 0;
      cost = cost.withGeneric(cost.g + 2 * n);
      this.cmdCasts.set(card, n + 1);
    }
    this.spend(cost, cd.isIS);
    this.spellsCast += 1;
  }

  game(turn: number, cfg: Config): AnyGame {
    const g = new this.deck.Game(this.command.slice(), this.deckCards, new Rng(0), cfg) as AnyGame;
    g.turn = turn;
    g.command = this.command.map((n) => C.get(n));
    g.hand = this.hand.map((n) => C.get(n));
    g.gy = this.gy.map((n) => C.get(n));
    g.exile = this.exile.map((n) => C.get(n));
    g.bf = [];
    for (const p of this.bf) {
      // tokens: the deck says what they are (e.g. Meren's "Demon" = a stolen 5/5); unknown ones are left out
      const cd = p.token ? g.logToken(p.name) : C.get(p.name);
      if (!cd) continue;
      const info = cd.land ?? (cd.mdfcLand && !cd.isIS ? cd.mdfcLand : null);
      const q = new Perm(cd, info, p.tapped);
      q.sick = p.sick;
      q.transformed = !!p.flipped;
      q.token = !!p.token;
      q.counters = p.counters;
      g.bf.push(q);
    }
    const known = [...this.hand, ...this.gy, ...this.exile, ...this.command, ...this.stack,
      ...this.bf.filter((p) => !p.token).map((p) => p.name)];
    const lib = this.deckCards.slice();
    for (const n of known) {
      const i = lib.indexOf(n);
      if (i >= 0) lib.splice(i, 1);
    }
    g.library = lib.map((n) => C.get(n));
    g.lib = new Array(cfg.opponents as number).fill((cfg.opp_library as number) - (turn - 1));
    g.landPlayed = this.landPlayed;
    g.ht = this.ht;
    g.muck = this.muck;
    g.energy = this.energy;
    g.attacked = this.attacked;
    const f = this.floating();
    g.pool = { ...emptyPool(), U: f.U, B: f.B, C: f.C, S: f.S };
    g.floatA = f.A;
    g.syncFromLog(this);
    return g;
  }
}

const pct = (p: number) => `${Math.round(p * 100)}%`;

function check(g: AnyGame, nextTurn: boolean, budget: number): [number, string[] | null, string] {
  const L = g.light(nextTurn);
  if (!nextTurn) g.lightAddMana(L, g.floatA ?? 0); // floating mana of either colour (Signet, Hollow...)
  if (!nextTurn && !g.landPlayed && g.hand.some((c) => c.land !== null)) g.lightAddLand(L); // land drop still available
  if (!g.killReachable(L)) return [0, null, ""];
  const search = g.killSearch();
  const r = search.search(L, budget);
  let note = "";
  // uncertain lines (e.g. Gale's Konrad chains) are checked against real shuffles
  if (r && search.lastP !== null) note = ` (${g.chanceName} wins ${pct(search.lastP)} with real shuffles)`;
  else if (!r && search.bestMiss !== null)
    note = ` (a ${g.chanceName} kills on average, but only ${pct(search.bestMiss)} with real shuffles; needs ${pct(search.minChance)})`;
  return [r, r ? [...(search.lastLine ?? [])] : null, note];
}

function fmtFloat(b: Board): string {
  const f = b.floating();
  const s = (Object.entries(f) as [string, number][]).filter(([, v]) => v)
    .map(([k, v]) => `${v}${k !== "A" ? k : " either"}${k === "S" ? " (instants/sorceries)" : ""}`).join(" ");
  const owed = b.owed ? `, ${b.owed.g + b.owed.u + b.owed.b + b.owed.h} mana of a cast still unpaid in the log` : "";
  return `estimated floating mana: ${s || "none"}${owed}`;
}

function fmtState(b: Board): string {
  const perms = b.bf.filter((p) => C.get(p.name).land === null).map((p) => p.name);
  const lands = b.bf.filter((p) => C.get(p.name).land !== null).map((p) => p.name);
  return `    hand:        ${b.hand.join(", ") || "-"}\n` +
    `    permanents:  ${perms.join(", ") || "-"}\n` +
    `    lands (${lands.length}):   ${lands.join(", ")}\n` +
    `    graveyard:   ${b.gy.join(", ") || "-"}`;
}

function analyze(deck: Deck, events: Event[], commanders: string[], cards: string[], cfg: Config,
                 budget: number): [Board, number | null] {
  const b = new Board(commanders, cards, deck);
  const turns = [...new Set(events.map((e) => e[0]))].sort((x, y) => x - y);
  let firstKill: number | null = null;
  for (const T of turns) {
    const tev = events.filter((e) => e[0] === T);
    if (T > 1) b.newTurn();
    let startChecked = false;
    let midFound = false;
    console.log(`\n=== Turn ${T}`);
    for (const [, card, act] of tev) {
      const m = /^moved (\w+) => (\w+)/.exec(act);
      const isDraw = m && m[1] === "library";
      const isUntap = act === "untapped";
      if (!startChecked && !(isDraw || isUntap)) {
        startChecked = true;
        console.log("  Start of turn (after your draw):");
        console.log(fmtState(b));
        const [r, line, note] = check(b.game(T, cfg), T > 1, budget);
        if (r) {
          console.log(`  >>> KILL AVAILABLE at the start of turn ${T}${r === 2 ? " (with counter backup)" : ""}${note}:`);
          for (const s of line!) console.log("        " + s);
          firstKill = firstKill || T;
          midFound = true;
        } else console.log("    no kill with these cards" + note);
      }
      // apply the event
      if (m) {
        const [, src, dst] = m;
        if (dst === "opponentsCards") {
          console.log(`  (opponent: ${card})`);
          continue;
        }
        if (src === "miscCards") {
          // not a card from the deck: a tracker the player keeps (an emblem / counter) or one of our tokens
          if ((deck.logTrackers ?? []).includes(card)) b.trackers[card] = b.trackers[card] ?? 0;
          else if (dst === "battlefield") {
            b.bf.push({ name: card, tapped: false, sick: true, counters: 0, token: true });
            console.log(`  (token: ${card})`);
          }
          continue;
        }
        if (b.isCast(card, src, dst)) b.payCast(card, src, T, cfg);
        b.move(card, src, dst);
      } else if (act === "tapped" || act === "untapped") {
        b.tap(card, act === "tapped");
        if (card === "The Mindskinner" && act === "tapped") console.log("  attack with The Mindskinner");
      } else if (act.startsWith("counter")) {
        const mm = /=(-?\d+)/.exec(act);
        if (mm) {
          for (const p of b.bf) if (p.name === card) p.counters = parseInt(mm[1], 10);
          if (card in b.trackers) b.trackers[card] = parseInt(mm[1], 10);
          if (card === "Dark Ritual") b.ritualCounter = parseInt(mm[1], 10);
        }
      } else if (act.startsWith("flipped") || act.startsWith("upsideDown")) {
        // "upsideDown:true": a flip card turned over (Budoka Gardener -> Dokai)
        for (const p of b.bf) if (p.name === card) p.flipped = act.endsWith("true");
      }
      // mid-turn check after casts / resolutions (not after every tap)
      if (startChecked && !midFound && m && ["battlefield", "graveyard", "exile", "hand"].includes(m[2])) {
        const [r, line, note] = check(b.game(T, cfg), false, budget);
        if (r) {
          midFound = true;
          firstKill = firstKill || T;
          console.log(`  >>> KILL AVAILABLE mid-turn ${T}, right after: ${card} ${act}${r === 2 ? " (with counter backup)" : ""}${note}`);
          console.log(fmtState(b));
          console.log("      " + fmtFloat(b) + " + your untapped permanents:");
          for (const s of line!) console.log("        " + s);
        } else if (note) console.log(`  (after ${card} ${act}: no kill${note})`);
      }
    }
    if (!startChecked) console.log("  (only draws this turn)");
    console.log("  End of turn:");
    console.log(fmtState(b));
    if (!midFound) {
      const [r, line, note] = check(b.game(T, cfg), true, budget);
      if (r) {
        console.log(`  >>> with these cards you have a kill next turn even before drawing${r === 2 ? " (with counter backup)" : ""}${note}:`);
        for (const s of line!) console.log("        " + s);
      } else console.log("    no kill next turn without new cards" + note);
    }
  }
  return [b, firstKill];
}

/** Same opening hand and the same card order as the real game (every card that left your library, in
 *  log order, tutored cards included); the rest of the library is random and shuffles are ignored. */
function fixedGame(deck: Deck, commanders: string[], cards: string[], order: string[], rng: Rng, cfg: Config,
                   verbose = false): Game<unknown> {
  const g = new deck.Game(commanders, cards, rng, cfg, verbose, "any");
  const rest = cards.slice();
  for (const n of order) rest.splice(rest.indexOf(n), 1);
  rng.shuffle(rest);
  g.library = [...order, ...rest].map((n) => C.get(n));
  g.onPlay = false;
  g.mulligan = function (this: Game<unknown>) {
    this.hand = this.library.splice(0, 7);
  };
  g.shuffle = () => {}; // keep the real game's card order so both players see the same cards
  return g;
}

export function run(deck: Deck, logPath: string, listPath: string, aiRuns = 200, budget = 20000): void {
  const d = C.loadDecklist(listPath);
  if (d.missing.length) throw new Error("missing card data: " + d.missing.join(", "));
  const cfg: Config = { ...deck.cfg, max_turn: 10 };
  const events = parse(logPath);
  const inList = new Set([...d.library, ...d.commanders]);
  const misc = new Set(events.filter(([, , a]) => a.includes("miscCards")).map(([, c]) => c)); // tokens, trackers
  const unknown = [...new Set(events.filter(([, c, a]) => !misc.has(c) && !a.includes("opponentsCards"))
    .map(([, c]) => c))].filter((c) => !inList.has(c)).sort();
  if (unknown.length) console.log("Note: cards in the log that are not in the decklist (ignored if opponents'): " + unknown.join(", "));
  const [b, fk] = analyze(deck, events, d.commanders, d.library, cfg, budget);
  const last = Math.max(...events.map((e) => e[0]));
  console.log(fk ? `\nYour game: the log ends on turn ${last}. The kill finder first found a kill on turn ${fk}.`
    : `\nYour game: the log ends on turn ${last}. The kill finder found no kill in it.`);

  const order = b.drawOrder;
  const rest = d.library.slice();
  const extra: string[] = [];
  for (const n of order) {
    const i = rest.indexOf(n);
    if (i >= 0) rest.splice(i, 1);
    else extra.push(n);
  }
  if (extra.length) {
    console.log(`\n=== No AI replay: you drew cards that are not in this decklist (${[...new Set(extra)].sort().join(", ")}).\n` +
      "    Pick the list the game was played with: -d <list>");
    return;
  }
  console.log(`\n=== AI with your opening hand and your draws (${order.length} cards in your order, rest random, no shuffles), ${aiRuns} runs`);
  const res: (number | null)[] = [];
  for (let s = 0; s < aiRuns; s++) res.push(fixedGame(deck, d.commanders, d.library, order, new Rng(1000 + s), cfg).play()[0]);
  for (let T = 4; T <= 10; T++)
    console.log(`  kill by turn ${String(T).padStart(2)}: ${((res.filter((x) => x && x <= T).length / res.length) * 100).toFixed(1).padStart(5)}%`);
  const g = fixedGame(deck, d.commanders, d.library, order, new Rng(1000), cfg, true);
  const [u] = g.play();
  console.log(`\n  One AI replay (kill turn ${u}):`);
  console.log(g.log.map((l) => "    " + l).join("\n"));
}
