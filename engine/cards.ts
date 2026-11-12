/**
 * Card definitions shared by every deck: costs, the CardDef of each card, tokens, and reading decklists.
 *
 * Base data (mana cost, types, power, oracle text) is read from data/cards.json (fetched from Scryfall).
 * The card facts that hold in any deck (lands, rocks, cost reducers, counters, tutors, draw spells) are in
 * card-facts.ts.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  ADVENTURE,
  KNOWN,
  LANDS,
  LandInfo,
  MDFC_LAND_BACK,
  ROCKS,
} from './card-facts';
import { readLandFromText } from './land-text';

/** Repo root: dist/sim.js lives one folder below it. */
export const ROOT = path.resolve(__dirname, '..');
export const DATA = path.join(ROOT, 'data', 'cards.json');

// ------------------------------------------------------------------ costs
/** A mana cost: g generic, u blue, b black, h hybrid (either colour), w white, r red, gn green.
 *  X counts as 0. */
export class Cost {
  constructor(
    public g = 0,
    public u = 0,
    public b = 0,
    public h = 0,
    public w = 0,
    public r = 0,
    public gn = 0,
  ) {}

  static parse(s: string | undefined | null): Cost {
    const c = new Cost();
    for (const m of (s ?? '').matchAll(/\{([^}]+)\}/g)) {
      const sym = m[1];
      if (/^\d+$/.test(sym)) c.g += parseInt(sym, 10);
      else if (sym === 'U') c.u += 1;
      else if (sym === 'B') c.b += 1;
      else if (sym === 'W') c.w += 1;
      else if (sym === 'R') c.r += 1;
      else if (sym === 'G') c.gn += 1;
      else if (sym.includes('/')) c.h += 1;
      else if (sym === 'C') c.g += 1;
      else if (sym === 'X') {
        /* X = 0 in the library */
      } else c.g += 1; // anything else (snow, phyrexian...): treat as generic
    }
    return c;
  }

  plus(o: Cost): Cost {
    return new Cost(
      this.g + o.g,
      this.u + o.u,
      this.b + o.b,
      this.h + o.h,
      this.w + o.w,
      this.r + o.r,
      this.gn + o.gn,
    );
  }

  /** The same coloured pips with a different generic part (cost reducers, commander tax). */
  withGeneric(g: number): Cost {
    return new Cost(g, this.u, this.b, this.h, this.w, this.r, this.gn);
  }

  get mv(): number {
    return this.g + this.u + this.b + this.h + this.w + this.r + this.gn;
  }

  toString(): string {
    return (
      `{${this.g}}` +
      'W'.repeat(this.w) +
      'U'.repeat(this.u) +
      'B'.repeat(this.b) +
      'R'.repeat(this.r) +
      'G'.repeat(this.gn) +
      'H'.repeat(this.h)
    );
  }
}

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

const TYPE_WORDS = [
  'land',
  'creature',
  'artifact',
  'enchantment',
  'instant',
  'sorcery',
  'planeswalker',
  'legendary',
];

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

  constructor(
    readonly name: string,
    data: CardData | undefined,
  ) {
    const d = data ?? {};
    const tl = (d.type_line ?? '').toLowerCase();
    this.types = new Set(TYPE_WORDS.filter((t) => tl.includes(t)));
    this.cost = Cost.parse(d.mana_cost);
    this.mv = this.cost.mv;
    const p = d.power;
    this.power = p && /^\d+$/.test(String(p)) ? parseInt(String(p), 10) : 0;
    const t = d.toughness;
    this.toughness = t && /^\d+$/.test(String(t)) ? parseInt(String(t), 10) : 0;
    this.keywords = new Set((d.keywords ?? []).map((k) => k.toLowerCase()));
    this.flying = this.keywords.has('flying');
    this.haste = this.keywords.has('haste');
    this.isToken = !!(d as { token?: boolean }).token;
    this.isBlue = this.cost.u > 0 || this.cost.h > 0;
    this.oracle = d.oracle ?? '';
    this.known = KNOWN.has(name);
    let land: LandInfo | null = LANDS[name] ?? null;
    if (land === null && this.types.has('land'))
      land = readLandFromText(this.oracle, tl); // unknown land -> generic
    this.land = land;
    this.mdfcLand = MDFC_LAND_BACK[name] ?? null;
    this.adventure = ADVENTURE[name] ?? null;
    let rock: string | null = ROCKS[name] ?? null;
    if (
      rock === null &&
      !this.known &&
      this.types.has('artifact') &&
      this.oracle.includes('{T}: Add')
    )
      rock =
        this.oracle.includes('any color') || / or \{[WUBRG]\}/.test(this.oracle)
          ? 'A'
          : 'C';
    this.rock = rock;
    this.isInstant = this.types.has('instant');
    this.isSorcery = this.types.has('sorcery');
    this.isIS = this.isInstant || this.isSorcery;
    this.isCreature = this.types.has('creature');
  }

  toString(): string {
    return this.name;
  }
}

/** A token's definition, e.g. makeToken("Zombie", 2, 2, "black"). Same name = same definition. */
export function makeToken(
  name: string,
  power: number,
  toughness: number,
  colour = '',
  keywords: string[] = [],
): CardDef {
  const key = `token:${name}:${power}/${toughness}:${keywords.join(',')}`;
  let c = CACHE.get(key);
  if (c === undefined) {
    c = new CardDef(name, {
      name,
      type_line: `Token Creature — ${name} ${colour}`.trim(),
      power: String(power),
      toughness: String(toughness),
      keywords,
      token: true,
    } as CardData);
    CACHE.set(key, c);
  }
  return c;
}

let DB: Record<string, CardData> | null = null;

export function db(): Record<string, CardData> {
  if (DB === null)
    DB = JSON.parse(fs.readFileSync(DATA, 'utf-8')) as Record<string, CardData>;
  return DB;
}

const CACHE = new Map<string, CardDef>();

/** The card definition for a name ("Front // Back" names use the front face). Fast: cached. */
export function get(name: string): CardDef {
  let c = CACHE.get(name);
  if (c !== undefined) return c;
  const key = name.split(' // ')[0].trim();
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
  if (m === 'A' || m === '') return m === 'A' || !!l.special; // any colour / a fetch land
  if (m === 'F') return colour === 'U' || colour === 'B';
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
  for (const raw of fs.readFileSync(file, 'utf-8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^(\d+)\s*x?\s+(.+)$/.exec(line);
    if (!m) {
      section = line.toLowerCase();
      continue;
    }
    const n = parseInt(m[1], 10);
    const name = m[2].split(' // ')[0].trim();
    const target =
      section && section.startsWith('commander') ? commanders : library;
    if (section) sections[name] = section;
    for (let i = 0; i < n; i++) target.push(name);
  }
  const all = [...commanders, ...library];
  const data = db();
  const missing = [...new Set(all.filter((n) => !(n in data)))].sort();
  const generic = [
    ...new Set(all.filter((n) => n in data && !KNOWN.has(n))),
  ].sort();
  return { commanders, library, missing, generic, sections };
}
