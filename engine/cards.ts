/**
 * Card definitions shared by every deck.
 *
 * Base data (mana cost, types, power, oracle text) is read from data/cards.json (fetched from
 * Scryfall). The tables below are card *facts* that hold in any deck: what a land or rock taps
 * for, which cards reduce costs, which cards are counters, tutors or draw spells. A deck's *roles*
 * (its combo pieces, engines, priorities) live in its own folder and are registered with
 * registerKnown so the engine knows it has rules for them.
 */
import * as fs from "fs";
import * as path from "path";

/** Repo root: dist/sim.js lives one folder below it. */
export const ROOT = path.resolve(__dirname, "..");
export const DATA = path.join(ROOT, "data", "cards.json");

// ------------------------------------------------------------------ costs
/** A mana cost: g generic, u blue, b black, h hybrid (either colour), w white, r red, gn green.
 *  X counts as 0. */
export class Cost {
  constructor(public g = 0, public u = 0, public b = 0, public h = 0, public w = 0, public r = 0, public gn = 0) {}

  static parse(s: string | undefined | null): Cost {
    const c = new Cost();
    for (const m of (s ?? "").matchAll(/\{([^}]+)\}/g)) {
      const sym = m[1];
      if (/^\d+$/.test(sym)) c.g += parseInt(sym, 10);
      else if (sym === "U") c.u += 1;
      else if (sym === "B") c.b += 1;
      else if (sym === "W") c.w += 1;
      else if (sym === "R") c.r += 1;
      else if (sym === "G") c.gn += 1;
      else if (sym.includes("/")) c.h += 1;
      else if (sym === "C") c.g += 1;
      else if (sym === "X") {
        /* X = 0 in the library */
      } else c.g += 1; // anything else (snow, phyrexian...): treat as generic
    }
    return c;
  }

  plus(o: Cost): Cost {
    return new Cost(this.g + o.g, this.u + o.u, this.b + o.b, this.h + o.h, this.w + o.w, this.r + o.r, this.gn + o.gn);
  }

  /** The same coloured pips with a different generic part (cost reducers, commander tax). */
  withGeneric(g: number): Cost {
    return new Cost(g, this.u, this.b, this.h, this.w, this.r, this.gn);
  }

  get mv(): number {
    return this.g + this.u + this.b + this.h + this.w + this.r + this.gn;
  }

  toString(): string {
    return `{${this.g}}` + "W".repeat(this.w) + "U".repeat(this.u) + "B".repeat(this.b) + "R".repeat(this.r) +
      "G".repeat(this.gn) + "H".repeat(this.h);
  }
}

// ------------------------------------------------------------------ lands, rocks and other facts
/**
 * mana: W / U / B / R / G (one colour) / A (either of the deck's colours) / C / F (filter: pay 1,
 *       get U+B) / UB, GU (both colours) / "" (none)
 * etb:  untapped | tapped | catacomb (needs an Island/Swamp) | hollow (needs 2 basics)
 */
export interface LandInfo {
  mana: string;
  etb?: string;
  island?: boolean;
  swamp?: boolean;
  forest?: boolean;
  plains?: boolean;
  mountain?: boolean;
  basic?: boolean;
  special?: string; // bounce | wilds
  cycling?: number;
  /** "Enters tapped unless ...", read from the card text: check:forest,island = you control a land of one of
   *  those types; fast = two or fewer other lands; slow = two or more other lands; basics2 = two or more basic
   *  lands (battle lands). Game.entersTapped checks it. */
  cond?: string;
  /** The colours that cost 1 life when this land taps for them ("{T}: Add {G} or {U}. This land deals 1 damage to
   *  you." = "GU"; a pain land's {C} ability is free). */
  pain?: string;
  /** It has a free "{T}: Add {C}." ability (pain lands, Tainted Wood). */
  colourless?: boolean;
  /** Its coloured mana needs a land with this type or subtype ("Activate only if you control a Swamp": swamp). */
  colourIf?: string;
  /** "When this land enters, scry 1." */
  scry?: boolean;
}

export const LANDS: Record<string, LandInfo> = {
  Island: { mana: "U", island: true, basic: true },
  Swamp: { mana: "B", swamp: true, basic: true },
  Forest: { mana: "G", forest: true, basic: true },
  Plains: { mana: "W", plains: true, basic: true },
  Mountain: { mana: "R", mountain: true, basic: true },
  "Command Tower": { mana: "A" },
  "Darkwater Catacombs": { mana: "F" },
  "Dimir Aqueduct": { mana: "UB", etb: "tapped", special: "bounce" },
  "Drowned Catacomb": { mana: "A", etb: "catacomb" },
  "Evolving Wilds": { mana: "", special: "wilds" },
  "Terramorphic Expanse": { mana: "", special: "wilds" },
  "Simic Growth Chamber": { mana: "GU", etb: "tapped", special: "chamber" }, // returns a land to hand as it enters
  "Guildless Commons": { mana: "C2", etb: "tapped", special: "chamber" },
  "Fabled Passage": { mana: "", special: "wilds" }, // (the basic enters untapped with four or more lands)
  "Myriad Landscape": { mana: "C", etb: "tapped", special: "myriad" }, // {2}, T, sac: two basics of one type, tapped
  "Exotic Orchard": { mana: "A" },
  "Fetid Pools": { mana: "A", etb: "tapped", island: true, swamp: true, cycling: 2 },
  "Reliquary Tower": { mana: "C" },
  "Sunken Hollow": { mana: "A", etb: "hollow", island: true, swamp: true },
  "Thespian's Stage": { mana: "C" },
  "Underground River": { mana: "A", pain: "UB", colourless: true },
  "Jidoor, Aristocratic Capital": { mana: "U", etb: "tapped" }, // front face; Overture is the adventure
};
/** Modal double-faced spells that may be played as a land instead. */
export const MDFC_LAND_BACK: Record<string, LandInfo> = {
  "Waterlogged Teachings": { mana: "A", etb: "tapped" },
};
/** card name: [spell name, cost, effect key] */
export const ADVENTURE: Record<string, [string, string, string]> = {
  "Jidoor, Aristocratic Capital": ["Overture", "{4}{U}{U}", "mill_half_one"],
};
/** Mana rocks: C2 / C / A / F */
export const ROCKS: Record<string, string> = {
  "Sol Ring": "C2",
  "Arcane Signet": "A",
  "Dimir Signet": "F",
  "Fellwar Stone": "A",
  "Talisman of Dominance": "A",
  "Bender's Waterskin": "A",
  "Commander's Sphere": "A",
  "Chromatic Lantern": "A",
  "Pristine Talisman": "C",
};

// cost reducers (+ Voracious Reader, the transformed Curious Homunculus)
export const REDUCE_IS = new Set(["Baral, Chief of Compliance", "Case of the Ransacked Lab", "Mocking Sprite",
  "Thunderclap Drake", "Wizards of Thay", "Archmage of Runes"]);
export const REDUCE_NONCREATURE = new Set(["Geist of Saint Thalia"]);
export const REDUCE_BLUE = new Set(["Nightscape Familiar", "Sapphire Medallion"]);
export const REDUCE_FROM_GY2 = new Set(["Emet-Selch of the Third Seat"]);

export const COUNTERS = new Set(["An Offer You Can't Refuse", "Arcane Denial", "Archmage's Charm", "Counterspell",
  "Dispel", "Mana Sculpt", "Unwind", "Muddle the Mixture", "Spell Pierce", "Rewind"]);
/** Creatures that tap for mana (they can't tap the turn they arrive). */
export const MANA_CREATURES: Record<string, string> = { "Llanowar Elves": "G", "Elvish Mystic": "G", "Fyndhorn Elves": "G", "Sylvan Caryatid": "A", "Skull Prophet": "A", "Birds of Paradise": "A", "Prize Pig": "A" };
/** Creatures that untap lands when they enter (Peregrine Drake 5, Cloud of Faeries 2). */
export const UNTAP_ON_ETB: Record<string, number> = { "Peregrine Drake": 5, "Cloud of Faeries": 2 };
export const TUTORS = new Set(["Diabolic Tutor", "Gifts Ungiven", "Insatiable Avarice", "Personal Tutor",
  "Solve the Equation", "Waterlogged Teachings", "Wishclaw Talisman"]);
export const RITUALS = new Set(["Dark Ritual", "High Tide", "Bubbling Muck", "Cabal Ritual", "Energy Tap", "Drain Power"]);

/** Instant / sorcery draw and selection: value = rough "cards gained". */
export const DRAW_SPELLS: Record<string, number> = {
  Brainstorm: 1.2, Consider: 1.0, Opt: 1.0, Ponder: 1.2, Preordain: 1.2,
  "Deep Analysis": 2.0, Diresight: 2.3, "Night's Whisper": 2.0, "Stock Up": 2.4,
  "See the Truth": 1.5, Energybending: 1.0, "Focus the Mind": 2.2, "Frantic Search": 1.0,
  Windfall: 2.0, "Insatiable Avarice": 2.5,
  "Prologue to Phyresis": 1.0, // cantrip; its poison counter stays, so casting it early sets up Expansion Algorithm
  "Chart a Course": 1.6, "Read the Bones": 2.0, "Pieces of the Puzzle": 2.0, "Fact or Fiction": 2.3,
  "Mission Briefing": 1.5, // surveil 2, then recast an instant/sorcery from the graveyard
};

export const KNOWN = new Set<string>([
  ...Object.keys(LANDS), ...Object.keys(MDFC_LAND_BACK), ...Object.keys(ROCKS),
  ...REDUCE_IS, ...REDUCE_NONCREATURE, ...REDUCE_BLUE, ...REDUCE_FROM_GY2,
  ...COUNTERS, ...TUTORS, ...Object.keys(DRAW_SPELLS), ...Object.keys(UNTAP_ON_ETB), ...Object.keys(MANA_CREATURES),
]);

/** A deck tells the engine which extra cards it has rules for (they skip the generic model). */
export function registerKnown(names: Iterable<string>): void {
  for (const n of names) KNOWN.add(n);
  CACHE.clear();
}

// ------------------------------------------------------------------ card definitions
interface CardData {
  name?: string;
  mana_cost?: string;
  type_line?: string;
  oracle?: string;
  power?: string | null;
  toughness?: string | null;
  keywords?: string[];
}

const TYPE_WORDS = ["land", "creature", "artifact", "enchantment", "instant", "sorcery", "planeswalker", "legendary"];

export class CardDef {
  readonly types: Set<string>;
  readonly cost: Cost;
  readonly mv: number;
  readonly power: number;
  readonly toughness: number;
  /** Scryfall keywords, lower case (flying, menace, deathtouch, haste, ...). */
  readonly keywords: Set<string>;
  readonly flying: boolean;
  readonly haste: boolean;
  /** A token's definition (made by makeToken), not a real card. */
  readonly isToken: boolean;
  readonly isBlue: boolean;
  readonly oracle: string;
  readonly known: boolean;
  readonly land: LandInfo | null;
  readonly mdfcLand: LandInfo | null;
  readonly adventure: [string, string, string] | null;
  readonly rock: string | null;
  readonly isIS: boolean;
  readonly isInstant: boolean;
  readonly isSorcery: boolean;
  readonly isCreature: boolean;

  constructor(readonly name: string, data: CardData | undefined) {
    const d = data ?? {};
    const tl = (d.type_line ?? "").toLowerCase();
    this.types = new Set(TYPE_WORDS.filter((t) => tl.includes(t)));
    this.cost = Cost.parse(d.mana_cost);
    this.mv = this.cost.mv;
    const p = d.power;
    this.power = p && /^\d+$/.test(String(p)) ? parseInt(String(p), 10) : 0;
    const t = d.toughness;
    this.toughness = t && /^\d+$/.test(String(t)) ? parseInt(String(t), 10) : 0;
    this.keywords = new Set((d.keywords ?? []).map((k) => k.toLowerCase()));
    this.flying = this.keywords.has("flying");
    this.haste = this.keywords.has("haste");
    this.isToken = !!(d as { token?: boolean }).token;
    this.isBlue = this.cost.u > 0 || this.cost.h > 0;
    this.oracle = d.oracle ?? "";
    this.known = KNOWN.has(name);
    let land: LandInfo | null = LANDS[name] ?? null;
    if (land === null && this.types.has("land")) land = genericLand(this.oracle, tl); // unknown land -> generic
    this.land = land;
    this.mdfcLand = MDFC_LAND_BACK[name] ?? null;
    this.adventure = ADVENTURE[name] ?? null;
    let rock: string | null = ROCKS[name] ?? null;
    if (rock === null && !this.known && this.types.has("artifact") && this.oracle.includes("{T}: Add"))
      rock = this.oracle.includes("any color") || / or \{[WUBRG]\}/.test(this.oracle) ? "A" : "C";
    this.rock = rock;
    this.isInstant = this.types.has("instant");
    this.isSorcery = this.types.has("sorcery");
    this.isIS = this.isInstant || this.isSorcery;
    this.isCreature = this.types.has("creature");
  }

  toString(): string {
    return this.name;
  }
}

/** A token's definition, e.g. makeToken("Zombie", 2, 2, "black"). Same name = same definition. */
export function makeToken(name: string, power: number, toughness: number, colour = "", keywords: string[] = []): CardDef {
  const key = `token:${name}:${power}/${toughness}:${keywords.join(",")}`;
  let c = CACHE.get(key);
  if (c === undefined) {
    c = new CardDef(name, { name, type_line: `Token Creature — ${name} ${colour}`.trim(), power: String(power),
      toughness: String(toughness), keywords, token: true } as CardData);
    CACHE.set(key, c);
  }
  return c;
}

function genericLand(oracle: string, tl: string): LandInfo {
  const island = tl.includes("island"), swamp = tl.includes("swamp"), forest = tl.includes("forest");
  const plains = tl.includes("plains"), mountain = tl.includes("mountain");
  const anyc = oracle.includes("any color");
  const has: Record<string, boolean> = {
    W: oracle.includes("{W}") || plains, U: oracle.includes("{U}") || island, B: oracle.includes("{B}") || swamp,
    R: oracle.includes("{R}") || mountain, G: oracle.includes("{G}") || forest,
  };
  const colours = ["W", "U", "B", "R", "G"].filter((k) => has[k]);
  // two colours: a pair kind such as "G/W" (a 2-colour deck treats it as "either colour", A); three or more: any (A)
  const mana = anyc || colours.length >= 3 ? "A" : colours.length === 2 ? colours.join("/") : colours.length === 1 ? colours[0] : "C";
  let etb = oracle.includes("enters tapped") && !oracle.includes("unless") ? "tapped" : "untapped";
  // "As this land enters, you may reveal a Forest or Plains card from your hand. If you don't, ... tapped" (snarls)
  const rev = /you may reveal an? (\w+) or (\w+) card from your hand/i.exec(oracle);
  if (rev && ["plains", "island", "swamp", "mountain", "forest"].includes(rev[1].toLowerCase()) &&
      ["plains", "island", "swamp", "mountain", "forest"].includes(rev[2].toLowerCase()))
    etb = `reveal:${rev[1].toLowerCase()},${rev[2].toLowerCase()}`;
  const info: LandInfo = { mana, etb, island, swamp, forest, plains, mountain, basic: tl.includes("basic") };
  const TYPES = ["plains", "island", "swamp", "mountain", "forest"];
  const chk = /enters tapped unless you control an? (\w+)(?: or an? (\w+))?/i.exec(oracle);
  if (chk && TYPES.includes(chk[1].toLowerCase()))
    info.cond = "check:" + [chk[1], chk[2]].filter((x) => x).map((x) => x.toLowerCase()).join(",");
  else if (/enters tapped unless you control two or fewer other lands/i.test(oracle)) info.cond = "fast";
  else if (/enters tapped unless you control two or more other lands/i.test(oracle)) info.cond = "slow";
  else if (/enters tapped unless you control two or more basic lands/i.test(oracle)) info.cond = "basics2";
  const pain = /\{T\}: Add ((?:\{[WUBRG]\}(?:,? or |, )?)+)\.[^.{]*deals 1 damage to you/i.exec(oracle);
  if (pain) info.pain = (pain[1].match(/[WUBRG]/g) ?? []).join("");
  if (/\{T\}: Add \{C\}\./.test(oracle)) info.colourless = true;
  const need = /Activate only if you control an? (\w+)/i.exec(oracle);
  if (need) info.colourIf = need[1].toLowerCase();
  if (/When this land enters, scry 1/i.test(oracle)) info.scry = true;
  return info;
}

let DB: Record<string, CardData> | null = null;

export function db(): Record<string, CardData> {
  if (DB === null) DB = JSON.parse(fs.readFileSync(DATA, "utf-8")) as Record<string, CardData>;
  return DB;
}

const CACHE = new Map<string, CardDef>();

/** The card definition for a name ("Front // Back" names use the front face). Fast: cached. */
export function get(name: string): CardDef {
  let c = CACHE.get(name);
  if (c !== undefined) return c;
  const key = name.split(" // ")[0].trim();
  c = CACHE.get(key);
  if (c === undefined) {
    c = new CardDef(key, db()[key]);
    CACHE.set(key, c);
  }
  CACHE.set(name, c);
  return c;
}

/** Does a land card make this colour? Fetch lands count for every colour (they find a basic), "A" lands make all. */
export function landMakes(cd: CardDef, colour: string): boolean {
  const l = cd.land ?? cd.mdfcLand;
  if (!l) return false;
  const m = l.mana;
  if (m === "A" || m === "") return m === "A" || !!l.special; // any colour / a fetch land
  if (m === "F") return colour === "U" || colour === "B";
  return m.split(/[/]|(?=[A-Z])/).includes(colour) || m.includes(colour);
}

export interface Decklist {
  commanders: string[];
  library: string[];
  missing: string[]; // no card data
  generic: string[]; // no special rules: played by type
  /** card name -> the decklist section it's listed under (lower case, e.g. "removal") */
  sections: Record<string, string>;
}

export function loadDecklist(file: string): Decklist {
  const commanders: string[] = [];
  const library: string[] = [];
  const sections: Record<string, string> = {};
  let section: string | null = null;
  for (const raw of fs.readFileSync(file, "utf-8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = /^(\d+)\s*x?\s+(.+)$/.exec(line);
    if (!m) {
      section = line.toLowerCase();
      continue;
    }
    const n = parseInt(m[1], 10);
    const name = m[2].split(" // ")[0].trim();
    const target = section && section.startsWith("commander") ? commanders : library;
    if (section) sections[name] = section;
    for (let i = 0; i < n; i++) target.push(name);
  }
  const all = [...commanders, ...library];
  const data = db();
  const missing = [...new Set(all.filter((n) => !(n in data)))].sort();
  const generic = [...new Set(all.filter((n) => n in data && !KNOWN.has(n)))].sort();
  return { commanders, library, missing, generic, sections };
}
