/**
 * Card definitions shared by every deck: costs, the CardDef of each card, tokens, and reading decklists.
 *
 * Base data (mana cost, types, power, oracle text) is read from data/cards.json: only the cards the lists use,
 * taken from Scryfall's bulk data by scryfall.ts.
 * The card facts that hold in any deck (lands, rocks, cost reducers, counters, tutors, draw spells) are in
 * card-facts.ts.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  ADVENTURE,
  FILTER_COLOURS,
  KNOWN,
  LANDS,
  LandInfo,
  MDFC_LAND_BACK,
  ROCKS,
} from './card-facts';
import { readLandFromText } from './land-text';
import type { TokenFace } from '../../shared/game-log-types';

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
/** One entry of data/cards.json (written by scryfall.ts). The engine only reads the first group of fields. */
export interface CardData {
  name?: string;
  mana_cost?: string;
  type_line?: string;
  oracle?: string;
  power?: string | null;
  toughness?: string | null;
  keywords?: string[];
  /** The rest is kept for the tools: the full name and the Scryfall ids (for images later). */
  full_name?: string;
  layout?: string;
  oracle_id?: string;
  scryfall_id?: string;
  back?: {
    name: string;
    mana_cost: string;
    type_line: string;
    oracle: string;
  };
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
  /** The name the game log uses: the card's name, or what a marker token stands for ("Illusion" for Aesi's
   *  "Illusion army"). */
  readonly logName: string;
  /** A creature token's face for the game log; null for cards and tokens that are not creatures. */
  readonly tokenFace: TokenFace | null;
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
    loggedAs: TokenLogging | null = null,
  ) {
    this.logName = loggedAs?.name ?? name;
    this.tokenFace = loggedAs?.face ?? null;
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

  /** A black mana symbol in its cost (a getter, so it stays out of dumps of the card). */
  get isBlack(): boolean {
    return this.cost.black > 0;
  }
  toString(): string {
    return this.name;
  }
}

/** The devotion a Theros god needs to be a creature: to these colours together, at least this much. */
export interface DevotionNeeded {
  colours: ('W' | 'U' | 'B' | 'R' | 'G')[];
  atLeast: number;
}

const COLOUR_LETTER: Record<string, 'W' | 'U' | 'B' | 'R' | 'G'> = {
  white: 'W',
  blue: 'U',
  black: 'B',
  red: 'R',
  green: 'G',
};
const NUMBER_WORDS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
];

// (kept apart from CardDef, read once per card: a CardDef's fields show in tests that print one)
const DEVOTION_NEEDED = new Map<CardDef, DevotionNeeded | null>();

/** A Theros god: the devotion it needs to be a creature (null for every other card). */
export function devotionToBeCreature(card: CardDef): DevotionNeeded | null {
  let needed = DEVOTION_NEEDED.get(card);
  if (needed === undefined) {
    needed = readDevotionToBeCreature(card.oracle);
    DEVOTION_NEEDED.set(card, needed);
  }
  return needed;
}

/** "As long as your devotion to white and blue is less than seven, Ephara isn't a creature." */
function readDevotionToBeCreature(oracle: string): DevotionNeeded | null {
  const match =
    /As long as your devotion to ([a-z ]+?) is less than (\w+), [^.]* isn't a creature/.exec(
      oracle,
    );
  if (!match) return null;
  const colours = match[1]
    .split(' and ')
    .map((colourWord) => COLOUR_LETTER[colourWord.trim()]);
  const atLeast = NUMBER_WORDS.indexOf(match[2]);
  if (colours.some((colour) => colour === undefined) || atLeast < 0)
    return null;
  return { colours, atLeast };
}

/** How a token is written in the game log: its name there and its face. */
interface TokenLogging {
  name: string;
  face: TokenFace | null;
}

/** A marker token logged as what it stands for: Aesi's "Illusion army" (999/999, so the sim knows a win is coming)
 *  is logged as an Illusion 1/1 with 999 copies. Its colours and keywords are the marker's. */
export interface MarkerLogging {
  name: string;
  power: number;
  toughness: number;
  copies: number;
}

/** "black green" -> ["black", "green"]. */
const colourWords = (colour: string): string[] =>
  colour.toLowerCase().split(/\s+/).filter(Boolean);

/** A token's definition, e.g. makeToken("Zombie", 2, 2, "black"). Same name and stats = same definition. */
export function makeToken(
  name: string,
  power: number,
  toughness: number,
  colour = '',
  keywords: string[] = [],
  options: { loggedAs?: MarkerLogging } = {},
): CardDef {
  const key = `token:${name}:${power}/${toughness}:${keywords.join(',')}`;
  let card = CACHE.get(key);
  if (card === undefined) {
    const marker = options.loggedAs;
    const face: TokenFace = {
      power: marker?.power ?? power,
      toughness: marker?.toughness ?? toughness,
      colours: colourWords(colour),
      keywords: keywords.map((keyword) => keyword.toLowerCase()),
      ...(marker ? { copies: marker.copies } : {}),
    };
    card = new CardDef(
      name,
      {
        name,
        type_line: `Token Creature — ${name} ${colour}`.trim(),
        power: String(power),
        toughness: String(toughness),
        keywords,
        token: true,
      } as CardData,
      { name: marker?.name ?? name, face },
    );
    CACHE.set(key, card);
  }
  return card;
}

/** An artifact token: Treasure, Food, Clue, or with power and toughness an artifact creature (a Servo).
 *  Colourless. Same name and stats = same definition. */
export function makeArtifactToken(
  name: string,
  power: number | null = null,
  toughness = 0,
): CardDef {
  const key = `artifact token:${name}:${power}/${toughness}`;
  let card = CACHE.get(key);
  if (card === undefined) {
    const isCreature = power !== null;
    const face: TokenFace | null = isCreature
      ? { power, toughness, colours: [], keywords: [] }
      : null;
    card = new CardDef(
      name,
      {
        name,
        type_line: `Token Artifact${isCreature ? ' Creature' : ''} — ${name}`,
        token: true,
        power: isCreature ? String(power) : null,
        toughness: isCreature ? String(toughness) : null,
      } as CardData,
      { name, face },
    );
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

/** Read data/cards.json again (after cards were added to it). */
export function reloadCardDatabase(): void {
  cardDatabaseCache = null;
  CACHE.clear();
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

/** Is the card a creature of this type ("Demon", "Vampire")? A token has the types in its name ("Zombie Druid");
 *  a card reads its type line. (Edgar's isVampire predates this and does the same.) */
export function hasCreatureType(card: CardDef, creatureType: string): boolean {
  if (card.isToken) return card.name.split(' ').includes(creatureType);
  const typeLine = cardDatabase()[card.name]?.type_line ?? '';
  return typeLine.includes(creatureType);
}

/** Does the card say it attacks each combat if able ("This creature attacks...", "Ruric Thar attacks...")? */
export function attacksEachCombat(card: CardDef): boolean {
  return card.oracle.split('\n').some((line) => {
    const match = /^(.+) attacks each combat if able\.$/.exec(line);
    return (
      match !== null &&
      (match[1] === 'This creature' || card.name.startsWith(match[1]))
    );
  });
}

/** Does the card make every creature attack each combat if able (Thantis, the Warweaver)? */
export function makesAllCreaturesAttack(card: CardDef): boolean {
  return /^All creatures (?:[^.\n]* and )?attack each combat if able\./m.test(
    card.oracle,
  );
}

/** Does a land card make this colour? Fetch lands count for every colour (they find a basic), "A" lands make all. */
export function landMakes(card: CardDef, colour: string): boolean {
  const land = card.land ?? card.mdfcLand;
  if (!land) return false;
  const mana = land.mana;
  if (mana === 'A' || mana === '') return mana === 'A' || !!land.special; // any colour / a fetch land
  if (mana in FILTER_COLOURS) return FILTER_COLOURS[mana].includes(colour);
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
