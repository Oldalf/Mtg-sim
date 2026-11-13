/**
 * Checks of the card image calls (PLAN.md task 7) through a real server on a free port: a known card's image is
 * fetched from Scryfall the first time and served from disk the second time (with the network switched off), a
 * token and an unknown card are 404, and a failed fetch is 404 and is not tried again at once. Needs the network
 * once, for the one image (it is kept on disk like every other).
 */
import * as fs from 'fs';
import type { AddressInfo } from 'net';
import { imageFileOf, scryfallIdOf } from '../../engine/card-images';
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

    const token = await getImage(port, 'Treasure');
    allPassed &&= check('a token is 404', token.status === 404);
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
  } finally {
    globalThis.fetch = realFetch;
    server.close();
  }
  return allPassed;
}
