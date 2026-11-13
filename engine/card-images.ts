/**
 * Card images from Scryfall, stored on disk in data/scryfall/images/<scryfall id>.jpg (not in git, like the bulk
 * data). `npm run cards -- images` and the app's refresh button download the ones that are missing; the app also
 * fetches a single missing image when a page asks for it.
 *
 * Scryfall's rules for automated use: a pause of 50-100 ms between requests, a plain client name and an Accept
 * header. Nothing about the user or the project goes into a request.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as C from './cards';

export const IMAGES_FOLDER = path.join(C.ROOT, 'data', 'scryfall', 'images');
const PAUSE_BETWEEN_REQUESTS_MS = 100;
const REQUEST_HEADERS = {
  'User-Agent': 'MtgGoldfishSim/1.0',
  Accept: 'image/jpeg,image/*;q=0.8',
};
const SCRYFALL_ID_PATTERN = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

export function isScryfallId(text: string): boolean {
  return SCRYFALL_ID_PATTERN.test(text);
}

export function imageFileOf(scryfallId: string): string {
  return path.join(IMAGES_FOLDER, `${scryfallId}.jpg`);
}

export function hasImage(scryfallId: string): boolean {
  return fs.existsSync(imageFileOf(scryfallId));
}

/** The Scryfall id of the print this card is shown with; undefined for a token or a card without data. */
export function scryfallIdOf(cardName: string): string | undefined {
  const frontFaceName = cardName.split(' // ')[0].trim();
  return C.cardDatabase()[frontFaceName]?.scryfall_id;
}

let lastRequestAt = 0;

/** Waits so that two requests are at least the pause apart, even when several callers ask at once. */
async function waitForTurn(): Promise<void> {
  const startsAt = Math.max(
    Date.now(),
    lastRequestAt + PAUSE_BETWEEN_REQUESTS_MS,
  );
  lastRequestAt = startsAt;
  const waitMs = startsAt - Date.now();
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
}

/** Downloads one image and saves it. Throws when Scryfall or the network fails. */
export async function downloadImage(scryfallId: string): Promise<void> {
  if (!isScryfallId(scryfallId))
    throw new Error(`not a Scryfall id: ${scryfallId}`);
  await waitForTurn();
  const response = await fetch(
    `https://api.scryfall.com/cards/${scryfallId}?format=image&version=normal`,
    { headers: REQUEST_HEADERS },
  );
  if (!response.ok)
    throw new Error(`Scryfall answered ${response.status} for ${scryfallId}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  fs.mkdirSync(IMAGES_FOLDER, { recursive: true });
  // written under another name first, so a half-written file is never served
  const temporaryFile = imageFileOf(scryfallId) + '.part';
  fs.writeFileSync(temporaryFile, bytes);
  fs.renameSync(temporaryFile, imageFileOf(scryfallId));
}

export interface ImageUpdateProgress {
  imagesDone: number;
  imagesTotal: number;
  failedCards: string[];
}

/** Every card of data/cards.json that has a Scryfall id (the cards the decklists use) and no image yet. */
export function cardsWithoutImage(): { name: string; scryfallId: string }[] {
  const missing: { name: string; scryfallId: string }[] = [];
  for (const [name, data] of Object.entries(C.cardDatabase()))
    if (data.scryfall_id && !hasImage(data.scryfall_id))
      missing.push({ name, scryfallId: data.scryfall_id });
  return missing;
}

/** Downloads the missing images, one after the other. A card that fails is listed and the rest go on. */
export async function updateImages(
  onProgress: (progress: ImageUpdateProgress) => void = () => {},
): Promise<ImageUpdateProgress> {
  const missing = cardsWithoutImage();
  const progress: ImageUpdateProgress = {
    imagesDone: 0,
    imagesTotal: missing.length,
    failedCards: [],
  };
  onProgress(progress);
  for (const card of missing) {
    try {
      await downloadImage(card.scryfallId);
    } catch {
      progress.failedCards.push(card.name);
    }
    progress.imagesDone++;
    onProgress(progress);
  }
  return progress;
}
