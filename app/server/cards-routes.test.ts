/**
 * Checks of the card image calls (PLAN.md task 7) through a real server on a free port: a known card's image is
 * fetched from Scryfall the first time and served from disk the second time (with the network switched off), a
 * token gets its Scryfall token card or art crop, an unknown card is 404, and a failed fetch is 404 and is not tried
 * again at once. Needs the network once, for the one image (it is kept on disk like every other).
 */
import * as fs from 'fs';
import type { AddressInfo } from 'net';
import type { CardFactsAnswer } from '../api-types';
import {
  IMAGES_FOLDER,
  imageFileOf,
  scryfallIdOf,
} from '../../engine/cards/card-images';
import { pickTokenArt } from '../../engine/cards/token-art';
import { startServer } from './server';

const KNOWN_CARD = 'Sol Ring';
/** The test's own requests use this, so they still work while the server's network is switched off. */
const realFetch = globalThis.fetch;
const JPEG_START = [0xff, 0xd8];

function check(label: string, isGood: boolean): boolean {
  console.log(`${isGood ? 'OK ' : 'BAD'} ${label}`);
  return isGood;
}

async function getImage(port: number, cardName: string, query = '') {
  const response = await realFetch(
    `http://127.0.0.1:${port}/api/cards/${encodeURIComponent(cardName)}/image${query}`,
  );
  return {
    status: response.status,
    bytes: Buffer.from(await response.arrayBuffer()),
    response,
  };
}

function postCardFacts(port: number, body: unknown): Promise<Response> {
  return realFetch(`http://127.0.0.1:${port}/api/cards/facts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Runs a check with a made-up image on disk for each file that is not there yet, so no network is needed; the
 *  made-up files are removed afterwards and real ones are left alone. */
async function withImagesOnDisk(
  files: string[],
  runCheck: () => Promise<boolean>,
): Promise<boolean> {
  const madeUpFiles = files.filter((file) => !fs.existsSync(file));
  fs.mkdirSync(IMAGES_FOLDER, { recursive: true });
  for (const file of madeUpFiles)
    fs.writeFileSync(file, Buffer.from([...JPEG_START, 0]));
  try {
    return await runCheck();
  } finally {
    for (const file of madeUpFiles) fs.rmSync(file, { force: true });
  }
}

/** A token has no card data: its name gives the whole token card, its face the art crop of the fitting token. */
async function checkTokenImages(port: number): Promise<boolean> {
  const treasureId = pickTokenArt('Treasure')?.scryfallId ?? '';
  const flyingVampire = {
    power: 2,
    toughness: 2,
    colours: ['black'],
    keywords: ['flying'],
  };
  const flyingVampireId =
    pickTokenArt('Vampire', flyingVampire)?.scryfallId ?? '';
  const treasureFile = imageFileOf(treasureId);
  const vampireArtFile = imageFileOf(flyingVampireId, 'art_crop');
  return withImagesOnDisk([treasureFile, vampireArtFile], async () => {
    const treasure = await getImage(port, 'Treasure');
    let allPassed = check(
      'a token by name is its whole token card',
      treasure.status === 200 &&
        treasure.bytes.equals(fs.readFileSync(treasureFile)),
    );
    const vampireArt = await getTokenArt(
      port,
      'Vampire',
      '?power=2&toughness=2&colours=black&keywords=flying',
    );
    allPassed &&= check(
      'a creature token with a face is the art crop of the fitting token',
      vampireArt.status === 200 &&
        vampireArt.bytes.equals(fs.readFileSync(vampireArtFile)),
    );
    const noArt = await getTokenArt(
      port,
      'Stolen creature',
      '?power=5&toughness=5',
    );
    allPassed &&= check(
      'a token Scryfall does not have is 404',
      noArt.status === 404,
    );
    const noFace = await getTokenArt(port, 'Vampire', '?power=two');
    allPassed &&= check(
      'token art without a face is 400',
      noFace.status === 400,
    );
    return allPassed;
  });
}

async function getTokenArt(port: number, tokenName: string, query: string) {
  const response = await realFetch(
    `http://127.0.0.1:${port}/api/tokens/${encodeURIComponent(tokenName)}/art${query}`,
  );
  return {
    status: response.status,
    bytes: Buffer.from(await response.arrayBuffer()),
  };
}

export async function runCardsRoutesTests(): Promise<boolean> {
  const server = await startServer(0);
  const port = (server.address() as AddressInfo).port;
  const scryfallId = scryfallIdOf(KNOWN_CARD);
  if (!scryfallId) return check(`${KNOWN_CARD} has data in cards.json`, false);
  let allPassed = true;
  try {
    fs.rmSync(imageFileOf(scryfallId), { force: true });
    const first = await getImage(port, KNOWN_CARD);
    allPassed &&= check(
      `${KNOWN_CARD}: first ask fetches the image (200, a JPEG, saved on disk)`,
      first.status === 200 &&
        first.bytes[0] === JPEG_START[0] &&
        first.bytes[1] === JPEG_START[1] &&
        fs.existsSync(imageFileOf(scryfallId)),
    );

    // the server runs in this process, so switching fetch off is switching the network off for it
    // (the test's own requests to 127.0.0.1 use the saved real fetch)
    let networkCalls = 0;
    globalThis.fetch = (async () => {
      networkCalls++;
      throw new Error('network is off');
    }) as typeof fetch;
    const secondResponse = await realFetch(
      `http://127.0.0.1:${port}/api/cards/${encodeURIComponent(KNOWN_CARD)}/image`,
    );
    const secondBytes = Buffer.from(await secondResponse.arrayBuffer());
    allPassed &&= check(
      `${KNOWN_CARD}: second ask comes from disk (same bytes, no network)`,
      secondResponse.status === 200 &&
        networkCalls === 0 &&
        secondBytes.equals(first.bytes),
    );

    allPassed &&= await checkTokenImages(port);
    const unknown = await getImage(port, 'No Such Card Anywhere');
    allPassed &&= check('an unknown card is 404', unknown.status === 404);

    const notFetched = await getImage(
      port,
      KNOWN_CARD,
      '?print=00000000-0000-4000-8000-000000000000',
    );
    allPassed &&= check(
      'a print that cannot be fetched is 404',
      notFetched.status === 404 && networkCalls === 1,
    );
    const notAnId = await getImage(port, KNOWN_CARD, '?print=../../x');
    allPassed &&= check(
      'a print that is not an id is 404',
      notAnId.status === 404,
    );

    const facts = await postCardFacts(port, {
      names: [KNOWN_CARD, 'Treasure', 'No Such Card Anywhere'],
    });
    const factsAnswer = (await facts.json()) as CardFactsAnswer;
    allPassed &&= check(
      'card facts: a known card has its type and cost, a token and an unknown card are left out',
      facts.status === 200 &&
        Object.keys(factsAnswer).join() === KNOWN_CARD &&
        factsAnswer[KNOWN_CARD].typeLine === 'Artifact' &&
        factsAnswer[KNOWN_CARD].manaCost === '{1}',
    );
    const badFacts = await postCardFacts(port, { names: 'Sol Ring' });
    allPassed &&= check(
      'card facts: a body without a list of names is 400',
      badFacts.status === 400,
    );
  } finally {
    globalThis.fetch = realFetch;
    server.close();
  }
  return allPassed;
}
