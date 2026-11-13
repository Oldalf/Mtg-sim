/**
 * The deck calls of the API (PLAN.md task 3): the decks, their list files and one decklist read as sections.
 */
import * as fs from 'fs';
import * as path from 'path';
import { DECKS } from '../../decks/index';
import * as C from '../../engine/cards';
import type { Deck } from '../../engine/runner';
import type {
  DecklistAnswer,
  DecklistCard,
  DecklistSection,
  DeckSummary,
  DecksAnswer,
} from '../api-types';

/** Text files in a deck's folder that are not decklists. */
const NOT_DECKLISTS = new Set(['primer.txt', 'swaps.txt']);
/** Folders under lists/ that hold old lists and cut tests: shown only when asked for (`?all=1`). */
const ARCHIVE_FOLDERS = new Set(['old', 'cuts']);

/** A request the caller got wrong (the route turns it into a 4xx answer). */
export class RequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function findDeck(deckName: string): Deck {
  const deck = Object.hasOwn(DECKS, deckName) ? DECKS[deckName] : undefined;
  if (!deck) throw new RequestError(404, `no deck ${deckName}`);
  return deck;
}

/** The decklist files of a deck, relative to its folder with forward slashes, sorted. */
export function listFilesOfDeck(deck: Deck, includeArchive: boolean): string[] {
  const isDecklist = (fileName: string) =>
    fileName.endsWith('.txt') && !NOT_DECKLISTS.has(fileName.toLowerCase());
  const listFiles: string[] = [];
  for (const entry of fs.readdirSync(deck.dir, { withFileTypes: true }))
    if (entry.isFile() && isDecklist(entry.name)) listFiles.push(entry.name);
  const listsFolder = path.join(deck.dir, 'lists');
  if (fs.existsSync(listsFolder)) {
    for (const entry of fs.readdirSync(listsFolder, { withFileTypes: true })) {
      if (entry.isFile() && isDecklist(entry.name))
        listFiles.push(`lists/${entry.name}`);
      else if (
        entry.isDirectory() &&
        includeArchive &&
        ARCHIVE_FOLDERS.has(entry.name)
      )
        for (const archived of fs.readdirSync(
          path.join(listsFolder, entry.name),
        ))
          if (isDecklist(archived))
            listFiles.push(`lists/${entry.name}/${archived}`);
    }
  }
  return listFiles.sort();
}

/** A card with what the card data says about it. */
function describeCard(name: string, count: number): DecklistCard {
  const data = C.cardDatabase()[name];
  if (!data) return { name, count };
  return {
    name,
    count,
    typeLine: data.type_line,
    manaCost: data.mana_cost,
    manaValue: C.Cost.parse(data.mana_cost).manaValue,
    scryfallId: data.scryfall_id,
  };
}

/** The cards of a list of names, each name once with its count, in order of first appearance. */
function countCards(names: string[]): DecklistCard[] {
  const countOfName = new Map<string, number>();
  for (const name of names)
    countOfName.set(name, (countOfName.get(name) ?? 0) + 1);
  return [...countOfName].map(([name, count]) => describeCard(name, count));
}

export function summarizeDeck(
  deck: Deck,
  includeArchive: boolean,
): DeckSummary {
  const defaultList = C.loadDecklist(path.join(deck.dir, deck.defaultList));
  return {
    name: deck.name,
    commanders: [...new Set(defaultList.commanders)],
    defaultList: deck.defaultList,
    lists: listFilesOfDeck(deck, includeArchive),
    settings: Object.entries(deck.config).map(([name, defaultValue]) => ({
      name,
      defaultValue,
    })),
    resultNames: deck.metrics
      ? [deck.metrics[0][0], deck.metrics[1][0]]
      : ['Win possible (any)', 'Win possible (with counter backup)'],
    hasDiag: (deck.diagMetrics ?? []).length > 0,
  };
}

export function answerDecks(includeArchive: boolean): DecksAnswer {
  return Object.values(DECKS).map((deck) =>
    summarizeDeck(deck, includeArchive),
  );
}

/** The file of a list of a deck; a name that leaves the deck's folder is refused (400). */
export function resolveListFile(deck: Deck, listName: string): string {
  const deckFolder = path.resolve(deck.dir);
  const file = path.resolve(deckFolder, listName);
  const isInsideDeckFolder = file.startsWith(deckFolder + path.sep);
  if (!isInsideDeckFolder || path.extname(file).toLowerCase() !== '.txt')
    throw new RequestError(400, `not a list of ${deck.name}: ${listName}`);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile())
    throw new RequestError(404, `no list ${listName} in ${deck.name}`);
  return file;
}

export function answerDecklist(
  deckName: string,
  listName: string,
): DecklistAnswer {
  const deck = findDeck(deckName);
  const decklist = C.loadDecklist(resolveListFile(deck, listName));
  const namesOfSection = new Map<string, string[]>();
  for (const name of decklist.library) {
    const sectionName = decklist.sections[name] ?? 'cards';
    namesOfSection.set(sectionName, [
      ...(namesOfSection.get(sectionName) ?? []),
      name,
    ]);
  }
  const sections: DecklistSection[] = [...namesOfSection].map(
    ([name, names]) => ({ name, cards: countCards(names) }),
  );
  return {
    deck: deck.name,
    list: listName,
    commanders: countCards(decklist.commanders),
    sections,
    cardCount: decklist.commanders.length + decklist.library.length,
    missing: decklist.missing,
    generic: decklist.generic,
  };
}
