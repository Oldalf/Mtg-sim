/**
 * The art for tokens. The game owns a token's stats; Scryfall only gives it a picture.
 *
 * `npm run cards` writes data/token-art.json from every token in the bulk data (layout "token"), so the app needs no
 * bulk file: each entry is a token's name, colours, keywords, power/toughness and Scryfall id. pickTokenArt chooses
 * the entry for a token as the game has it (its name and face), or none when no token of Scryfall has that name.
 */
import * as fs from 'fs';
import * as path from 'path';
import { ROOT } from './cards';
import { readBulkCardLines } from './scryfall';
import type { TokenFace } from '../../shared/game-log-types';

export const TOKEN_ART_FILE = path.join(ROOT, 'data', 'token-art.json');

export interface TokenArtEntry {
  name: string;
  /** Colour words, lower case, as in TokenFace. */
  colours: string[];
  /** Lower case. */
  keywords: string[];
  /** As Scryfall writes it ("2", "*"); null for a token that is not a creature. */
  power: string | null;
  toughness: string | null;
  scryfallId: string;
}

const COLOUR_WORDS: Record<string, string> = {
  W: 'white',
  U: 'blue',
  B: 'black',
  R: 'red',
  G: 'green',
};

const TOKEN_LAYOUT = '"layout":"token"';

interface ScryfallToken {
  id: string;
  name: string;
  layout: string;
  colors?: string[];
  keywords?: string[];
  power?: string;
  toughness?: string;
}

function tokenArtEntry(token: ScryfallToken): TokenArtEntry {
  return {
    name: token.name,
    colours: (token.colors ?? []).map((letter) => COLOUR_WORDS[letter]),
    keywords: (token.keywords ?? []).map((keyword) => keyword.toLowerCase()),
    power: token.power ?? null,
    toughness: token.toughness ?? null,
    scryfallId: token.id,
  };
}

/** Writes data/token-art.json from the bulk data: one entry per line, so a change shows well in git. */
export async function writeTokenArt(): Promise<number> {
  const entries: TokenArtEntry[] = [];
  for await (const line of readBulkCardLines()) {
    if (!line.includes(TOKEN_LAYOUT)) continue;
    const card = JSON.parse(line) as ScryfallToken;
    if (card.layout === 'token') entries.push(tokenArtEntry(card));
  }
  const lines = entries.map((entry) => JSON.stringify(entry));
  fs.writeFileSync(TOKEN_ART_FILE, `[\n${lines.join(',\n')}\n]\n`, 'utf-8');
  tokenArtByName = null;
  return entries.length;
}

export function hasTokenArt(): boolean {
  return fs.existsSync(TOKEN_ART_FILE);
}

let tokenArtByName: Map<string, TokenArtEntry[]> | null = null;

function readTokenArt(): Map<string, TokenArtEntry[]> {
  if (tokenArtByName === null) {
    tokenArtByName = new Map();
    const entries = hasTokenArt()
      ? (JSON.parse(
          fs.readFileSync(TOKEN_ART_FILE, 'utf-8'),
        ) as TokenArtEntry[])
      : [];
    for (const entry of entries) {
      const sameName = tokenArtByName.get(entry.name);
      if (sameName) sameName.push(entry);
      else tokenArtByName.set(entry.name, [entry]);
    }
  }
  return tokenArtByName;
}

const sameWords = (first: string[], second: string[]) =>
  first.length === second.length &&
  first.every((word) => second.includes(word));

/** How well an entry fits a face, compared in this order: the same colours, the most keywords in common, the
 *  fewest keywords the face does not have, the same power/toughness. Higher is better at each place. */
function fitOf(entry: TokenArtEntry, face: TokenFace): number[] {
  const keywordsInCommon = entry.keywords.filter((keyword) =>
    face.keywords.includes(keyword),
  ).length;
  return [
    sameWords(entry.colours, face.colours) ? 1 : 0,
    keywordsInCommon,
    -(entry.keywords.length - keywordsInCommon),
    entry.power === String(face.power) &&
    entry.toughness === String(face.toughness)
      ? 1
      : 0,
  ];
}

function isBetterFit(fit: number[], bestFit: number[]): boolean {
  for (let i = 0; i < fit.length; i++)
    if (fit[i] !== bestFit[i]) return fit[i] > bestFit[i];
  return false;
}

/** The art for a token as the game has it. Without a face (Treasure, a real log's token) the first entry of that
 *  name; null when Scryfall has no token of that name ("Stolen creature"). */
export function pickTokenArt(
  name: string,
  face?: TokenFace,
): TokenArtEntry | null {
  const sameName = readTokenArt().get(name);
  if (!sameName) return null;
  if (!face) return sameName[0];
  let best = sameName[0];
  let bestFit = fitOf(best, face);
  for (const entry of sameName.slice(1)) {
    const fit = fitOf(entry, face);
    if (isBetterFit(fit, bestFit)) {
      best = entry;
      bestFit = fit;
    }
  }
  return best;
}
