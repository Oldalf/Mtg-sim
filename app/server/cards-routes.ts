/**
 * The card calls (PLAN.md task 7): one card's image, served from data/scryfall/images/ and fetched from Scryfall
 * the first time, the update of all the images the decklists need (the app's refresh button), and the facts of the
 * cards of a game (task 13: a game log has card names only).
 */
import type {
  CardFactsAnswer,
  CardFactsRequest,
  ImageUpdateState,
} from '../api-types';
import * as C from '../../engine/cards/cards';
import {
  downloadImage,
  hasImage,
  imageFileOf,
  isScryfallId,
  scryfallIdOf,
  updateImages,
} from '../../engine/cards/card-images';
import { RequestError } from './decks-routes';

/** An image that failed to fetch is not asked for again for a while (a page asks once per card it shows). */
const RETRY_AFTER_FAILURE_MS = 5 * 60 * 1000;
const failedAt = new Map<string, number>();
/** One fetch per image at a time, however many requests ask for it. */
const fetchesInProgress = new Map<string, Promise<void>>();

/**
 * The image file of a card. `print` is the Scryfall id of a specific print; without it the print in data/cards.json.
 * Throws a 404 for a token, a card without data or a failed fetch (the page then shows its text card).
 */
export async function findCardImageFile(
  cardName: string,
  print: string | null,
): Promise<string> {
  const scryfallId = print ?? scryfallIdOf(cardName);
  if (!scryfallId || !isScryfallId(scryfallId))
    throw new RequestError(404, `no image for ${cardName}`);
  if (!hasImage(scryfallId)) await fetchImageOnce(scryfallId, cardName);
  return imageFileOf(scryfallId);
}

async function fetchImageOnce(
  scryfallId: string,
  cardName: string,
): Promise<void> {
  const lastFailure = failedAt.get(scryfallId);
  if (lastFailure && Date.now() - lastFailure < RETRY_AFTER_FAILURE_MS)
    throw new RequestError(404, `no image for ${cardName} (fetch failed)`);
  let fetchInProgress = fetchesInProgress.get(scryfallId);
  if (!fetchInProgress) {
    fetchInProgress = downloadImage(scryfallId).finally(() =>
      fetchesInProgress.delete(scryfallId),
    );
    fetchesInProgress.set(scryfallId, fetchInProgress);
  }
  try {
    await fetchInProgress;
    failedAt.delete(scryfallId);
  } catch {
    failedAt.set(scryfallId, Date.now());
    throw new RequestError(404, `no image for ${cardName} (fetch failed)`);
  }
}

// ------------------------------------------------------------------ card facts
/** More names than any game has; a bigger request is a mistake. */
const MAX_NAMES_PER_REQUEST = 2000;

/** POST /api/cards/facts: the type line and mana cost of each named card that has card data. */
export function answerCardFacts(body: unknown): CardFactsAnswer {
  const names = (body as Partial<CardFactsRequest> | null)?.names;
  if (
    !Array.isArray(names) ||
    names.length > MAX_NAMES_PER_REQUEST ||
    !names.every((name) => typeof name === 'string')
  )
    throw new RequestError(
      400,
      `the body must be { names: [...] } with at most ${MAX_NAMES_PER_REQUEST} card names`,
    );
  const cardData = C.cardDatabase();
  const facts: CardFactsAnswer = {};
  for (const name of names) {
    const data = cardData[name];
    if (data)
      facts[name] = {
        typeLine: data.type_line ?? '',
        manaCost: data.mana_cost ?? '',
      };
  }
  return facts;
}

// ------------------------------------------------------------------ the update of all images
let updateState: ImageUpdateState = {
  isRunning: false,
  imagesDone: 0,
  imagesTotal: 0,
  failedCards: [],
};

export function answerImageUpdate(): ImageUpdateState {
  return { ...updateState, failedCards: [...updateState.failedCards] };
}

/** Starts downloading every missing image in the background. Does nothing when an update is already going. */
export function startImageUpdate(): ImageUpdateState {
  if (updateState.isRunning) return answerImageUpdate();
  failedAt.clear();
  updateState = {
    isRunning: true,
    imagesDone: 0,
    imagesTotal: 0,
    failedCards: [],
  };
  updateImages((progress) => {
    updateState = {
      ...updateState,
      ...progress,
      failedCards: [...progress.failedCards],
    };
  })
    .catch((error: unknown) => console.error('image update failed:', error))
    .finally(() => {
      updateState = { ...updateState, isRunning: false };
    });
  return answerImageUpdate();
}
