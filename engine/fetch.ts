/** Download card data from Scryfall for any card in a decklist that isn't in data/cards.json yet. */
import * as fs from 'fs';
import * as C from './cards';

const HEADERS = { 'User-Agent': 'GaleDeckSim/1.0', Accept: 'application/json' };

interface ScryFace {
  name: string;
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
  power?: string;
  toughness?: string;
}
interface ScryCard extends ScryFace {
  keywords?: string[];
  layout: string;
  card_faces?: ScryFace[];
}

async function fetchCard(name: string): Promise<ScryCard> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(
      'https://api.scryfall.com/cards/named?exact=' + encodeURIComponent(name),
      { headers: HEADERS },
    );
    if (response.status === 429 && attempt < 5) {
      // rate limited: wait and try again
      await new Promise((res) => setTimeout(res, 2000 * (attempt + 1)));
      continue;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) as ScryCard;
  }
}

function entry(scryCard: ScryCard): Record<string, unknown> {
  const faces = scryCard.card_faces;
  const frontFace = faces ? faces[0] : scryCard;
  const cardEntry: Record<string, unknown> = {
    name: frontFace.name,
    full_name: scryCard.name,
    mana_cost: frontFace.mana_cost ?? scryCard.mana_cost ?? '',
    type_line: frontFace.type_line ?? scryCard.type_line ?? '',
    oracle: frontFace.oracle_text ?? scryCard.oracle_text ?? '',
    power: frontFace.power ?? null,
    toughness: frontFace.toughness ?? null,
    keywords: scryCard.keywords ?? [],
    layout: scryCard.layout,
  };
  if (faces) {
    const backFace = faces[1];
    cardEntry.back = {
      name: backFace.name,
      mana_cost: backFace.mana_cost ?? '',
      type_line: backFace.type_line ?? '',
      oracle: backFace.oracle_text ?? '',
    };
  }
  return cardEntry;
}

export async function fetchMissing(lists: string[]): Promise<void> {
  const cardDatabase = C.cardDatabase() as Record<string, unknown>;
  const added: string[] = [];
  for (const listPath of lists) {
    for (const name of C.loadDecklist(listPath).missing) {
      if (name in cardDatabase) continue;
      try {
        const cardEntry = entry(await fetchCard(name));
        cardDatabase[cardEntry.name as string] = cardEntry;
        if (cardEntry.name !== name) cardDatabase[name] = cardEntry;
        added.push(name);
        console.log(
          `  + ${name}: ${cardEntry.mana_cost} ${cardEntry.type_line}`,
        );
        await new Promise((resolve) => setTimeout(resolve, 300)); // Scryfall asks for no more than ~10 requests a second
      } catch (error) {
        console.log(
          `  could not fetch '${name}': ${error}  (check the spelling)`,
        );
      }
    }
  }
  fs.writeFileSync(C.DATA, JSON.stringify(cardDatabase, null, 1), 'utf-8');
  console.log(
    added.length ? `Added ${added.length} card(s).` : 'Nothing to add.',
  );
  if (added.length)
    console.log(
      'New cards are played generically (by type) until rules for them are added ' +
        "(engine/cards.ts for card facts, the deck's folder for its own cards).",
    );
}
