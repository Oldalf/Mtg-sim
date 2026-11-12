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
    const r = await fetch(
      'https://api.scryfall.com/cards/named?exact=' + encodeURIComponent(name),
      { headers: HEADERS },
    );
    if (r.status === 429 && attempt < 5) {
      // rate limited: wait and try again
      await new Promise((res) => setTimeout(res, 2000 * (attempt + 1)));
      continue;
    }
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.json()) as ScryCard;
  }
}

function entry(c: ScryCard): Record<string, unknown> {
  const faces = c.card_faces;
  const f0 = faces ? faces[0] : c;
  const e: Record<string, unknown> = {
    name: f0.name,
    full_name: c.name,
    mana_cost: f0.mana_cost ?? c.mana_cost ?? '',
    type_line: f0.type_line ?? c.type_line ?? '',
    oracle: f0.oracle_text ?? c.oracle_text ?? '',
    power: f0.power ?? null,
    toughness: f0.toughness ?? null,
    keywords: c.keywords ?? [],
    layout: c.layout,
  };
  if (faces) {
    const f1 = faces[1];
    e.back = {
      name: f1.name,
      mana_cost: f1.mana_cost ?? '',
      type_line: f1.type_line ?? '',
      oracle: f1.oracle_text ?? '',
    };
  }
  return e;
}

export async function fetchMissing(lists: string[]): Promise<void> {
  const db = C.db() as Record<string, unknown>;
  const added: string[] = [];
  for (const p of lists) {
    for (const name of C.loadDecklist(p).missing) {
      if (name in db) continue;
      try {
        const e = entry(await fetchCard(name));
        db[e.name as string] = e;
        if (e.name !== name) db[name] = e;
        added.push(name);
        console.log(`  + ${name}: ${e.mana_cost} ${e.type_line}`);
        await new Promise((r) => setTimeout(r, 300)); // Scryfall asks for no more than ~10 requests a second
      } catch (ex) {
        console.log(`  could not fetch '${name}': ${ex}  (check the spelling)`);
      }
    }
  }
  fs.writeFileSync(C.DATA, JSON.stringify(db, null, 1), 'utf-8');
  console.log(
    added.length ? `Added ${added.length} card(s).` : 'Nothing to add.',
  );
  if (added.length)
    console.log(
      'New cards are played generically (by type) until rules for them are added ' +
        "(engine/cards.ts for card facts, the deck's folder for its own cards).",
    );
}
