/**
 * Card data from Scryfall's bulk files.
 *
 * `npm run cards -- update` downloads two gzipped JSONL files (one card or ruling per line) into data/scryfall/
 * (not in git) and writes bulk-info.json next to them: the date of the download and the latest set in it, so
 * you can see when it is time to run it again. The files are never unzipped on disk: they are streamed through
 * gunzip line by line, and only the lines of cards we want are parsed.
 *
 * The simulator itself only reads data/cards.json, which holds just the cards the decklists use. Cards missing
 * from it are filled in from the bulk files before a run (addMissingCards). Rulings stay in the bulk file only
 * (rulingsFor reads them): they would double the size of cards.json and nothing in the engine uses them.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import type { ReadableStream as WebReadableStream } from 'stream/web';
import * as zlib from 'zlib';
import * as C from './cards';

const BULK_FOLDER = path.join(C.ROOT, 'data', 'scryfall');
const CARDS_FILE = path.join(BULK_FOLDER, 'oracle-cards.jsonl.gz');
const RULINGS_FILE = path.join(BULK_FOLDER, 'rulings.jsonl.gz');
const INFO_FILE = path.join(BULK_FOLDER, 'bulk-info.json');
const BULK_LISTING_URL = 'https://api.scryfall.com/bulk-data';
const REQUEST_HEADERS = {
  'User-Agent': 'MtgGoldfishSim/1.0',
  Accept: 'application/json',
};

/** Layouts that are not cards you can put in a deck: skipped when looking a card up by name. */
const IGNORED_LAYOUTS = new Set([
  'token',
  'double_faced_token',
  'art_series',
  'emblem',
]);

// ------------------------------------------------------------------ the info file
interface SetInfo {
  name: string;
  code: string;
  releasedAt: string;
}
export interface BulkInfo {
  downloadedOn: string;
  scryfallUpdatedAt: string;
  cardCount: number;
  /** The newest set in the data. It can be a set that is still being spoiled (releasedAt in the future). */
  latestSet: SetInfo;
  /** The newest set that is already out. */
  latestReleasedSet: SetInfo;
}

export function readBulkInfo(): BulkInfo | null {
  if (!fs.existsSync(INFO_FILE)) return null;
  return JSON.parse(fs.readFileSync(INFO_FILE, 'utf-8')) as BulkInfo;
}

export function hasBulkData(): boolean {
  return fs.existsSync(CARDS_FILE) && fs.existsSync(RULINGS_FILE);
}

// ------------------------------------------------------------------ reading a bulk file
/** The lines of a .jsonl.gz file, unzipped on the fly. */
async function* readBulkLines(file: string): AsyncGenerator<string> {
  const fileStream = fs.createReadStream(file);
  const unzipped = fileStream.pipe(zlib.createGunzip());
  try {
    const lines = readline.createInterface({
      input: unzipped,
      crlfDelay: Infinity,
    });
    for await (const line of lines) if (line) yield line;
  } finally {
    fileStream.destroy(); // also when the caller stops early
    unzipped.destroy();
  }
}

const NAME_PATTERN = /"name":"((?:[^"\\]|\\.)*)"/;
const SET_CODE_PATTERN = /"set":"([^"]*)"/;
const SET_NAME_PATTERN = /"set_name":"((?:[^"\\]|\\.)*)"/;
const SET_TYPE_PATTERN = /"set_type":"([^"]*)"/;
const RELEASED_AT_PATTERN = /"released_at":"([^"]*)"/;
const LAYOUT_PATTERN = /"layout":"([^"]*)"/;
const ORACLE_ID_PATTERN = /"oracle_id":"([^"]*)"/;

/** Text of a JSON string as it is written in the file (only unescapes when it has to). */
function unescapeJsonText(text: string): string {
  return text.includes('\\') ? (JSON.parse(`"${text}"`) as string) : text;
}

function frontFaceName(name: string): string {
  return name.split(' // ')[0].trim();
}

// ------------------------------------------------------------------ Scryfall's card format
interface ScryfallFace {
  name: string;
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
  power?: string;
  toughness?: string;
  oracle_id?: string;
}
interface ScryfallCard extends ScryfallFace {
  id: string;
  layout: string;
  keywords?: string[];
  card_faces?: ScryfallFace[];
}

/** Looks cards up by front face name. A name that is not in the data is missing from the result. */
async function findCardsInBulk(
  names: Set<string>,
): Promise<Map<string, ScryfallCard>> {
  const found = new Map<string, ScryfallCard>();
  for await (const line of readBulkLines(CARDS_FILE)) {
    const nameMatch = NAME_PATTERN.exec(line);
    if (!nameMatch) continue;
    const name = frontFaceName(unescapeJsonText(nameMatch[1]));
    if (!names.has(name) || found.has(name)) continue;
    const card = JSON.parse(line) as ScryfallCard;
    if (IGNORED_LAYOUTS.has(card.layout)) continue;
    found.set(name, card);
    if (found.size === names.size) break;
  }
  return found;
}

/** The rulings of each card (by oracle id), oldest first. */
async function findRulings(
  oracleIds: Set<string>,
): Promise<Map<string, string[]>> {
  const rulingsByCard = new Map<
    string,
    { publishedAt: string; comment: string }[]
  >();
  for await (const line of readBulkLines(RULINGS_FILE)) {
    const idMatch = ORACLE_ID_PATTERN.exec(line);
    if (!idMatch || !oracleIds.has(idMatch[1])) continue;
    const ruling = JSON.parse(line) as {
      published_at: string;
      comment: string;
    };
    const rulings = rulingsByCard.get(idMatch[1]) ?? [];
    rulings.push({ publishedAt: ruling.published_at, comment: ruling.comment });
    rulingsByCard.set(idMatch[1], rulings);
  }
  const commentsByCard = new Map<string, string[]>();
  for (const [oracleId, rulings] of rulingsByCard)
    commentsByCard.set(
      oracleId,
      rulings
        .sort((first, second) =>
          first.publishedAt.localeCompare(second.publishedAt),
        )
        .map((ruling) => ruling.comment),
    );
  return commentsByCard;
}

function oracleIdOf(card: ScryfallCard): string | undefined {
  return card.oracle_id ?? card.card_faces?.[0]?.oracle_id;
}

/** The entry for data/cards.json: the front face is the card (as the engine plays it), the back face is kept. */
function cardEntry(card: ScryfallCard): C.CardData {
  const faces = card.card_faces;
  const frontFace = faces ? faces[0] : card;
  const entry: C.CardData = {
    name: frontFace.name,
    full_name: card.name,
    mana_cost: frontFace.mana_cost ?? card.mana_cost ?? '',
    type_line: frontFace.type_line ?? card.type_line ?? '',
    oracle: frontFace.oracle_text ?? card.oracle_text ?? '',
    power: frontFace.power ?? null,
    toughness: frontFace.toughness ?? null,
    keywords: card.keywords ?? [],
    layout: card.layout,
    oracle_id: oracleIdOf(card),
    scryfall_id: card.id,
  };
  if (faces) {
    const backFace = faces[1];
    entry.back = {
      name: backFace.name,
      mana_cost: backFace.mana_cost ?? '',
      type_line: backFace.type_line ?? '',
      oracle: backFace.oracle_text ?? '',
    };
  }
  return entry;
}

/** Builds the entries for these (front face) names. Names the bulk data does not have are returned in notFound. */
async function buildEntries(names: Set<string>): Promise<{
  entries: Map<string, C.CardData>;
  notFound: string[];
}> {
  const cards = await findCardsInBulk(names);
  const entries = new Map<string, C.CardData>();
  for (const [name, card] of cards) entries.set(name, cardEntry(card));
  const notFound = [...names].filter((name) => !entries.has(name)).sort();
  return { entries, notFound };
}

/** The rulings of one card, oldest first (for when you write the rules for a card). Not stored in cards.json. */
export async function rulingsFor(cardName: string): Promise<string[]> {
  requireBulkData();
  const name = frontFaceName(cardName);
  const card = (await findCardsInBulk(new Set([name]))).get(name);
  if (!card) throw new Error(describeNotFound(name).trim());
  const rulings = await findRulings(new Set([oracleIdOf(card) ?? '']));
  return [...rulings.values()].flat();
}

// ------------------------------------------------------------------ filling in missing cards
function writeCardDatabase(database: Record<string, C.CardData>): void {
  fs.writeFileSync(C.DATA, JSON.stringify(database, null, 1), 'utf-8');
  C.reloadCardDatabase();
}

function describeNotFound(name: string): string {
  const info = readBulkInfo();
  const bulkAge = info
    ? `the bulk data from ${info.downloadedOn} (latest set: ${info.latestSet.name})`
    : 'the bulk data';
  return (
    `  not in ${bulkAge}: '${name}'. Check the spelling, ` +
    'or run npm run cards -- update if the card is newer.'
  );
}

/** Adds the cards that these lists use and data/cards.json does not have, from the local bulk data (no network). */
export async function addMissingCards(listFiles: string[]): Promise<void> {
  const missing = new Set<string>();
  for (const listFile of listFiles)
    for (const name of C.loadDecklist(listFile).missing) missing.add(name);
  if (!missing.size) return;
  if (!hasBulkData()) {
    console.log(
      `Cards without data: ${[...missing].join(', ')}.\n` +
        'The Scryfall bulk data is not downloaded yet: run npm run cards -- update',
    );
    return;
  }
  const { entries, notFound } = await buildEntries(missing);
  const database = C.cardDatabase();
  for (const [name, entry] of entries) {
    database[name] = entry;
    console.log(`  + ${name}: ${entry.mana_cost} ${entry.type_line}`);
  }
  for (const name of notFound) console.log(describeNotFound(name));
  if (!entries.size) return;
  writeCardDatabase(database);
  console.log(
    `Added ${entries.size} card(s). They are played generically (by type) until rules for them are added ` +
      "(engine/card-facts.ts for card facts, the deck's folder for its own cards).",
  );
}

// ------------------------------------------------------------------ refreshing the cards we have
/** The fields the engine plays by: if one of them changes, results can change. */
const PLAYED_FIELDS = [
  'mana_cost',
  'type_line',
  'oracle',
  'power',
  'toughness',
  'keywords',
  'layout',
] as const;

interface CardChange {
  name: string;
  changedFields: string[];
}

/** Rebuilds every entry in data/cards.json from the bulk data. Nothing is written here. */
async function rebuildKnownCards(): Promise<{
  database: Record<string, C.CardData>;
  changes: CardChange[];
  notFound: string[];
}> {
  const oldDatabase = C.cardDatabase();
  const names = new Set(Object.keys(oldDatabase).map(frontFaceName));
  const { entries, notFound } = await buildEntries(names);
  const database: Record<string, C.CardData> = {};
  const changes: CardChange[] = [];
  for (const [key, oldEntry] of Object.entries(oldDatabase)) {
    const newEntry = entries.get(frontFaceName(key));
    database[key] = newEntry ?? oldEntry;
    if (!newEntry) continue;
    const changedFields = PLAYED_FIELDS.filter(
      (field) =>
        JSON.stringify(oldEntry[field]) !== JSON.stringify(newEntry[field]),
    );
    if (changedFields.length) changes.push({ name: key, changedFields });
  }
  return { database, changes, notFound };
}

function printChanges(changes: CardChange[], notFound: string[]): void {
  for (const { name, changedFields } of changes)
    console.log(`  changed: ${name} (${changedFields.join(', ')})`);
  for (const name of notFound) console.log(describeNotFound(name));
}

/** Updates every card in data/cards.json from the bulk data (new rules text, ids, rulings). */
export async function refreshCards(): Promise<void> {
  requireBulkData();
  const { database, changes, notFound } = await rebuildKnownCards();
  printChanges(changes, notFound);
  writeCardDatabase(database);
  console.log(
    `Refreshed ${Object.keys(database).length - notFound.length} card(s): ` +
      `${changes.length} changed in a way that can affect play, ${notFound.length} not found (kept as they were).`,
  );
}

function requireBulkData(): void {
  if (!hasBulkData())
    throw new Error(
      'The Scryfall bulk data is not downloaded yet: run npm run cards -- update',
    );
}

// ------------------------------------------------------------------ downloading
interface BulkListingEntry {
  type: string;
  updated_at: string;
  jsonl_download_uri: string;
  compressed_size: number;
}

async function fetchBulkListing(): Promise<BulkListingEntry[]> {
  const response = await fetch(BULK_LISTING_URL, { headers: REQUEST_HEADERS });
  if (!response.ok) throw new Error(`Scryfall: HTTP ${response.status}`);
  return ((await response.json()) as { data: BulkListingEntry[] }).data;
}

/** Streams a download into a .part file and renames it when complete, so a failed download leaves no broken file. */
async function downloadFile(url: string, file: string): Promise<void> {
  const response = await fetch(url, { headers: REQUEST_HEADERS });
  if (!response.ok || !response.body)
    throw new Error(`Download failed: HTTP ${response.status} for ${url}`);
  const partialFile = file + '.part';
  await pipeline(
    Readable.fromWeb(response.body as unknown as WebReadableStream),
    fs.createWriteStream(partialFile),
  );
  fs.renameSync(partialFile, file);
}

/** One pass over the cards file: how many cards, and the newest sets. */
async function findLatestSets(): Promise<
  Pick<BulkInfo, 'cardCount' | 'latestSet' | 'latestReleasedSet'>
> {
  const today = new Date().toISOString().slice(0, 10);
  let cardCount = 0;
  let latestSet: SetInfo | null = null;
  let latestReleasedSet: SetInfo | null = null;
  for await (const line of readBulkLines(CARDS_FILE)) {
    cardCount++;
    const layout = LAYOUT_PATTERN.exec(line)?.[1] ?? '';
    const setType = SET_TYPE_PATTERN.exec(line)?.[1] ?? '';
    if (IGNORED_LAYOUTS.has(layout) || setType === 'memorabilia') continue;
    const releasedAt = RELEASED_AT_PATTERN.exec(line)?.[1];
    const code = SET_CODE_PATTERN.exec(line)?.[1];
    const setName = SET_NAME_PATTERN.exec(line)?.[1];
    if (!releasedAt || !code || !setName) continue;
    const set = { name: unescapeJsonText(setName), code, releasedAt };
    if (!latestSet || releasedAt > latestSet.releasedAt) latestSet = set;
    if (
      releasedAt <= today &&
      (!latestReleasedSet || releasedAt > latestReleasedSet.releasedAt)
    )
      latestReleasedSet = set;
  }
  if (!latestSet || !latestReleasedSet)
    throw new Error('No cards found in the downloaded Scryfall data');
  return { cardCount, latestSet, latestReleasedSet };
}

function megabytes(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(0) + ' MB';
}

/** Downloads the bulk files and writes bulk-info.json. This is the only thing that uses the network. */
export async function downloadBulkData(): Promise<BulkInfo> {
  const listing = await fetchBulkListing();
  fs.mkdirSync(BULK_FOLDER, { recursive: true });
  const wantedFiles = [
    { type: 'oracle_cards', file: CARDS_FILE },
    { type: 'rulings', file: RULINGS_FILE },
  ];
  let cardsUpdatedAt = '';
  for (const { type, file } of wantedFiles) {
    const bulkEntry = listing.find((entry) => entry.type === type);
    if (!bulkEntry) throw new Error(`Scryfall has no bulk data '${type}'`);
    console.log(
      `Downloading ${type} (${megabytes(bulkEntry.compressed_size)}) ...`,
    );
    await downloadFile(bulkEntry.jsonl_download_uri, file);
    if (type === 'oracle_cards') cardsUpdatedAt = bulkEntry.updated_at;
  }
  const info: BulkInfo = {
    downloadedOn: new Date().toISOString().slice(0, 10),
    scryfallUpdatedAt: cardsUpdatedAt,
    ...(await findLatestSets()),
  };
  fs.writeFileSync(INFO_FILE, JSON.stringify(info, null, 2) + '\n', 'utf-8');
  return info;
}

/** After an update: how many cards in data/cards.json would change. Nothing is written. */
export async function reportOutdatedCards(): Promise<void> {
  const { changes, notFound } = await rebuildKnownCards();
  printChanges(changes, notFound);
  console.log(
    changes.length
      ? `${changes.length} card(s) in data/cards.json differ from the new data. ` +
          'Run npm run cards -- refresh to update them (then check --regress for every deck).'
      : 'All cards in data/cards.json match the new data.',
  );
}
