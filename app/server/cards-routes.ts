/**
 * The card calls (PLAN.md task 7): one card's image, served from data/scryfall/images/ and fetched from Scryfall
 * the first time, the update of all the images the decklists need (the app's refresh button), and the facts of the
 * cards of a game (task 13: a game log has card names only). A token has no card data: its picture comes from
 * data/token-art.json (step 6, D4): the whole token card for a name, the art crop for a creature token's face.
 */
import type {
  CardFactsAnswer,
  CardFactsRequest,
  ImageUpdateState,
} from '../api-types';
import * as C from '../../engine/cards/cards';
import {
  ImageVersion,
  downloadImage,
  hasImage,
  imageFileOf,
  isScryfallId,
  scryfallIdOf,
  updateImages,
} from '../../engine/cards/card-images';
import { pickTokenArt } from '../../engine/cards/token-art';
import type { TokenFace } from '../../shared/game-log-types';
import { RequestError } from './decks-routes';

/** An image that failed to fetch is not asked for again for a while (a page asks once per card it shows). */
const RETRY_AFTER_FAILURE_MS = 5 * 60 * 1000;
const failedAt = new Map<string, number>();
/** One fetch per image at a time, however many requests ask for it. */
const fetchesInProgress = new Map<string, Promise<void>>();

/**
 * The image file of a card. `print` is the Scryfall id of a specific print; without it the print in data/cards.json,
 * or for a token (no card data) the whole token card of that name. Throws a 404 for an unknown name or a failed
 * fetch (the page then shows its text card).
 */
export async function findCardImageFile(
  cardName: string,
  print: string | null,
): Promise<string> {
  const scryfallId =
    print ?? scryfallIdOf(cardName) ?? pickTokenArt(cardName)?.scryfallId;
  return findImageFile(scryfallId, 'normal', cardName);
}

/**
 * The art of a creature token as the game has it (its name and face): the art crop, which the page puts in its own
 * frame. Throws a 404 when Scryfall has no token of that name (the page then shows its text card).
 */
export async function findTokenArtFile(
  tokenName: string,
  face: TokenFace,
): Promise<string> {
  const scryfallId = pickTokenArt(tokenName, face)?.scryfallId;
  return findImageFile(scryfallId, 'art_crop', tokenName);
}

async function findImageFile(
  scryfallId: string | undefined,
  version: ImageVersion,
  cardName: string,
): Promise<string> {
  if (!scryfallId || !isScryfallId(scryfallId))
    throw new RequestError(404, `no image for ${cardName}`);
  if (!hasImage(scryfallId, version))
    await fetchImageOnce(scryfallId, version, cardName);
  return imageFileOf(scryfallId, version);
}

async function fetchImageOnce(
  scryfallId: string,
  version: ImageVersion,
  cardName: string,
): Promise<void> {
  const imageKey = `${scryfallId} ${version}`;
  const lastFailure = failedAt.get(imageKey);
  if (lastFailure && Date.now() - lastFailure < RETRY_AFTER_FAILURE_MS)
    throw new RequestError(404, `no image for ${cardName} (fetch failed)`);
  let fetchInProgress = fetchesInProgress.get(imageKey);
  if (!fetchInProgress) {
    fetchInProgress = downloadImage(scryfallId, version).finally(() =>
      fetchesInProgress.delete(imageKey),
    );
    fetchesInProgress.set(imageKey, fetchInProgress);
  }
  try {
    await fetchInProgress;
    failedAt.delete(imageKey);
  } catch {
    failedAt.set(imageKey, Date.now());
    throw new RequestError(404, `no image for ${cardName} (fetch failed)`);
  }
}

/** A token's face from the query of a token art call: ?power=2&toughness=2&colours=black&keywords=flying,lifelink
 *  (lists comma-separated, left out for none). A power or toughness that is not a whole number is a 400. */
export function readTokenFace(query: URLSearchParams): TokenFace {
  const power = Number(query.get('power') ?? 'missing');
  const toughness = Number(query.get('toughness') ?? 'missing');
  if (!Number.isInteger(power) || !Number.isInteger(toughness))
    throw new RequestError(400, 'a token face needs a power and a toughness');
  const listOf = (key: string) =>
    (query.get(key) ?? '').split(',').filter((word) => word !== '');
  return {
    power,
    toughness,
    colours: listOf('colours'),
    keywords: listOf('keywords'),
  };
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
