/**
 * Checks of the game log. The log must only read the game: a game played with the log on ends exactly like the
 * same game played with the log off.
 *   npm run sim -- <deck> --test     (the goldfish check, before the deck's own tests)
 *   npm run pod -- --test            (the pod check, after the blocking tests)
 */
import * as C from './cards';
import { Game } from './game';
import { playPod, podSpec } from './pod';
import { Rng } from './rng';
import { Deck, resolveList } from './runner';

const GOLDFISH_SEEDS = 50;
const POD_SEEDS = 50;
const POD_DECKS = ['gale', 'meren', 'samfrodo', 'aesi'];
const POD_ROUNDS_CAP = 17;

/** Everything that tells two finished games apart: the result and where every card ended up. */
function describeFinishedGame(
  game: Game<unknown>,
  killTurns: [number | null, number | null],
): string {
  const names = (cards: C.CardDef[]) => cards.map((card) => card.name);
  return JSON.stringify({
    killTurns,
    turn: game.turn,
    myLife: game.myLife,
    opponentLife: game.life,
    hand: names(game.hand),
    library: names(game.library),
    graveyard: names(game.graveyard),
    exile: names(game.exile),
    command: names(game.command),
    battlefield: game.battlefield.map((permanent) => [
      permanent.card.name,
      permanent.tapped,
      permanent.counters,
    ]),
  });
}

function playGoldfishGame(deck: Deck, seed: number, isLogOn: boolean): string {
  const decklist = C.loadDecklist(resolveList(deck, deck.defaultList));
  const game = new deck.Game(
    decklist.commanders,
    decklist.library,
    new Rng(seed),
    { ...deck.config },
    isLogOn,
    'protected',
  );
  return describeFinishedGame(game, game.play());
}

function report(label: string, differingSeeds: number[], seedCount: number) {
  const isGood = differingSeeds.length === 0;
  console.log(
    `${isGood ? 'OK ' : 'BAD'} ${label}: ${seedCount} seeds` +
      (isGood ? '' : `, different for seeds ${differingSeeds.join(', ')}`),
  );
  return isGood;
}

/** A deck's goldfish games end the same with the log on and off. */
export function runGoldfishLogTests(deck: Deck): boolean {
  const differingSeeds: number[] = [];
  for (let seed = 1; seed <= GOLDFISH_SEEDS; seed++)
    if (
      playGoldfishGame(deck, seed, true) !== playGoldfishGame(deck, seed, false)
    )
      differingSeeds.push(seed);
  return report(
    'the log does not change a game',
    differingSeeds,
    GOLDFISH_SEEDS,
  );
}

/** Pod games end the same with the log on and off. */
export function runPodLogTests(allDecks: Record<string, Deck>): boolean {
  const spec = podSpec(allDecks, POD_DECKS, POD_ROUNDS_CAP, {});
  const differingSeeds: number[] = [];
  for (let seed = 1; seed <= POD_SEEDS; seed++) {
    const withLog = { ...playPod(allDecks, spec, seed, true), log: undefined };
    const withoutLog = playPod(allDecks, spec, seed, false);
    if (JSON.stringify(withLog) !== JSON.stringify(withoutLog))
      differingSeeds.push(seed);
  }
  return report(
    'the log does not change a pod game',
    differingSeeds,
    POD_SEEDS,
  );
}
