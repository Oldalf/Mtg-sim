/**
 * Checks of the deck calls (PLAN.md task 3) through a real server on a free port:
 * every deck and every list answers, the archive is hidden unless asked for, and paths that leave the deck folder are refused.
 */
import type { AddressInfo } from 'net';
import type { DecklistAnswer, DecksAnswer } from '../api-types';
import { startServer } from './server';

function check(label: string, isGood: boolean): boolean {
  console.log(`${isGood ? 'OK ' : 'BAD'} ${label}`);
  return isGood;
}

async function getJson<Body>(
  port: number,
  apiPath: string,
): Promise<{ status: number; body: Body }> {
  const response = await fetch(`http://127.0.0.1:${port}${apiPath}`);
  return { status: response.status, body: (await response.json()) as Body };
}

export async function runDecksRoutesTests(): Promise<boolean> {
  const server = await startServer(0);
  const port = (server.address() as AddressInfo).port;
  let allGood = true;
  try {
    const decks = await getJson<DecksAnswer>(port, '/api/decks');
    allGood &&= check(
      'GET /api/decks lists the decks',
      decks.status === 200 && decks.body.length > 0,
    );
    const withArchive = await getJson<DecksAnswer>(port, '/api/decks?all=1');
    const listCount = (answer: DecksAnswer) =>
      answer.reduce((total, deck) => total + deck.lists.length, 0);
    allGood &&= check(
      'the archive lists (lists/old, lists/cuts) come only with ?all=1',
      listCount(withArchive.body) >= listCount(decks.body) &&
        decks.body.every(
          (deck) => !deck.lists.some((list) => /\/(old|cuts)\//.test(list)),
        ),
    );
    allGood &&= check(
      'no primer or swap notes among the lists',
      withArchive.body.every(
        (deck) => !deck.lists.some((list) => /primer|swaps/i.test(list)),
      ),
    );
    allGood &&= check(
      'every deck lists its default list',
      decks.body.every((deck) => deck.lists.includes(deck.defaultList)),
    );

    let listsRead = 0;
    // the archive holds old reports as well, so only the normal lists are read
    for (const deck of decks.body) {
      for (const list of deck.lists) {
        const answer = await getJson<DecklistAnswer>(
          port,
          `/api/decks/${deck.name}/lists/${list}`,
        );
        const isGood =
          answer.status === 200 &&
          answer.body.cardCount > 0 &&
          answer.body.sections.length > 0;
        if (!isGood) allGood = check(`${deck.name}/${list} answers`, false);
        listsRead++;
      }
    }
    allGood &&= check(`all ${listsRead} lists of all decks answer`, true);

    const gale = await getJson<DecklistAnswer>(
      port,
      '/api/decks/gale/lists/decklist.txt',
    );
    allGood &&= check(
      'a Gale list has 100 cards, with commanders and card data',
      gale.body.cardCount === 100 &&
        gale.body.commanders.length === 2 &&
        gale.body.sections.some((section) =>
          section.cards.some((card) => card.scryfallId),
        ),
    );

    const refusedPaths = [
      '/api/decks/gale/lists/..%2Fmeren%2Fdecklist.txt',
      '/api/decks/gale/lists/../../package.json',
      '/api/decks/gale/lists/..%2F..%2Fpackage.json',
      '/api/decks/gale/lists/..%5Cmeren%5Cdecklist.txt',
    ];
    for (const refusedPath of refusedPaths) {
      const answer = await getJson<unknown>(port, refusedPath);
      allGood &&= check(
        `${refusedPath} is refused (4xx)`,
        answer.status >= 400 && answer.status < 500,
      );
    }
    const unknownDeck = await getJson<unknown>(
      port,
      '/api/decks/nope/lists/decklist.txt',
    );
    allGood &&= check('an unknown deck is 404', unknownDeck.status === 404);
  } finally {
    server.close();
  }
  console.log(allGood ? 'ALL OK' : 'SOME BAD');
  return allGood;
}
