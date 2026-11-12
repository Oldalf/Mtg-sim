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
    public generic = 0,
    public blue = 0,
    public black = 0,
    public hybrid = 0,
    public white = 0,
    public red = 0,
    public green = 0,
  ) {}

  static parse(costText: string | undefined | null): Cost {
    const cost = new Cost();
    for (const match of (costText ?? '').matchAll(/\{([^}]+)\}/g)) {
      const sym = match[1];
      if (/^\d+$/.test(sym)) cost.generic += parseInt(sym, 10);
      else if (sym === 'U') cost.blue += 1;
      else if (sym === 'B') cost.black += 1;
      else if (sym === 'W') cost.white += 1;
      else if (sym === 'R') cost.red += 1;
      else if (sym === 'G') cost.green += 1;
      else if (sym.includes('/')) cost.hybrid += 1;
      else if (sym === 'C') cost.generic += 1;
      else if (sym === 'X') {
        /* X = 0 in the library */
      } else cost.generic += 1; // anything else (snow, phyrexian...): treat as generic
    }
    return cost;
  }

  plus(cost: Cost): Cost {
    return new Cost(
      this.generic + cost.generic,
      this.blue + cost.blue,
      this.black + cost.black,
      this.hybrid + cost.hybrid,
      this.white + cost.white,
      this.red + cost.red,
      this.green + cost.green,
    );
  }

  /** The same coloured pips with a different generic part (cost reducers, commander tax). */
  withGeneric(generic: number): Cost {
    return new Cost(
      generic,
      this.blue,
      this.black,
      this.hybrid,
      this.white,
      this.red,
      this.green,
    );
  }

  get manaValue(): number {
    return (
      this.generic +
      this.blue +
      this.black +
      this.hybrid +
      this.white +
      this.red +
      this.green
    );
  }

  toString(): string {
    return (
      `{${this.generic}}` +
      'W'.repeat(this.white) +
      'U'.repeat(this.blue) +
      'B'.repeat(this.black) +
      'R'.repeat(this.red) +
      'G'.repeat(this.green) +
      'H'.repeat(this.hybrid)
    );
  }
}

/** A deck tells the engine which extra cards it has rules for (they skip the generic model). */
export function registerKnown(names: Iterable<string>): void {
  for (const name of names) KNOWN.add(name);
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
  readonly manaValue: number;
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
  readonly isInstantOrSorcery: boolean;
  readonly isInstant: boolean;
  readonly isSorcery: boolean;
  readonly isCreature: boolean;

  constructor(
    readonly name: string,
    data: CardData | undefined,
  ) {
    const cardData = data ?? {};
    const typeLine = (cardData.type_line ?? '').toLowerCase();
    this.types = new Set(
      TYPE_WORDS.filter((typeWord) => typeLine.includes(typeWord)),
    );
    this.cost = Cost.parse(cardData.mana_cost);
    this.manaValue = this.cost.manaValue;
    const powerText = cardData.power;
    this.power =
      powerText && /^\d+$/.test(String(powerText))
        ? parseInt(String(powerText), 10)
        : 0;
    const toughnessText = cardData.toughness;
    this.toughness =
      toughnessText && /^\d+$/.test(String(toughnessText))
        ? parseInt(String(toughnessText), 10)
        : 0;
    this.keywords = new Set(
      (cardData.keywords ?? []).map((keyword) => keyword.toLowerCase()),
    );
    this.flying = this.keywords.has('flying');
    this.haste = this.keywords.has('haste');
    this.isToken = !!(cardData as { token?: boolean }).token;
    this.isBlue = this.cost.blue > 0 || this.cost.hybrid > 0;
    this.oracle = cardData.oracle ?? '';
    this.known = KNOWN.has(name);
    let land: LandInfo | null = LANDS[name] ?? null;
    if (land === null && this.types.has('land'))
      land = readLandFromText(this.oracle, typeLine); // unknown land -> generic
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
    this.isInstantOrSorcery = this.isInstant || this.isSorcery;
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
  let card = CACHE.get(key);
  if (card === undefined) {
    card = new CardDef(name, {
      name,
      type_line: `Token Creature — ${name} ${colour}`.trim(),
      power: String(power),
      toughness: String(toughness),
      keywords,
      token: true,
    } as CardData);
    CACHE.set(key, card);
  }
  return card;
}

let cardDatabaseCache: Record<string, CardData> | null = null;

export function cardDatabase(): Record<string, CardData> {
  if (cardDatabaseCache === null)
    cardDatabaseCache = JSON.parse(fs.readFileSync(DATA, 'utf-8')) as Record<
      string,
      CardData
    >;
  return cardDatabaseCache;
}

const CACHE = new Map<string, CardDef>();

/** The card definition for a name ("Front // Back" names use the front face). Fast: cached. */
export function get(name: string): CardDef {
  let card = CACHE.get(name);
  if (card !== undefined) return card;
  const key = name.split(' // ')[0].trim();
  card = CACHE.get(key);
  if (card === undefined) {
    card = new CardDef(key, cardDatabase()[key]);
    CACHE.set(key, card);
  }
  CACHE.set(name, card);
  return card;
}

/** Does a land card make this colour? Fetch lands count for every colour (they find a basic), "A" lands make all. */
export function landMakes(card: CardDef, colour: string): boolean {
  const land = card.land ?? card.mdfcLand;
  if (!land) return false;
  const mana = land.mana;
  if (mana === 'A' || mana === '') return mana === 'A' || !!land.special; // any colour / a fetch land
  if (mana === 'F') return colour === 'U' || colour === 'B';
  return mana.split(/[/]|(?=[A-Z])/).includes(colour) || mana.includes(colour);
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
    const match = /^(\d+)\s*x?\s+(.+)$/.exec(line);
    if (!match) {
      section = line.toLowerCase();
      continue;
    }
    const count = parseInt(match[1], 10);
    const name = match[2].split(' // ')[0].trim();
    const target =
      section && section.startsWith('commander') ? commanders : library;
    if (section) sections[name] = section;
    for (let i = 0; i < count; i++) target.push(name);
  }
  const all = [...commanders, ...library];
  const data = cardDatabase();
  const missing = [...new Set(all.filter((name) => !(name in data)))].sort();
  const generic = [
    ...new Set(all.filter((name) => name in data && !KNOWN.has(name))),
  ].sort();
  return { commanders, library, missing, generic, sections };
}
