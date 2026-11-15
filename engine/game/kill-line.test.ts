/**
 * Kill lines are played for real (kill-line.ts). A line the search found that the real game cannot play is a kill
 * miss: the search counted something wrong. Every deck's --test plays 300 seeds and fails on any miss. Chance fails
 * (a line that only wins on average and fell short with the real cards) are expected and only reported.
 */
import * as C from '../cards/cards';
import { Rng } from '../util/rng';
import { Deck, resolveList } from '../run/runner';

const KILL_LINE_SEEDS = 300;
const SEEDS_SHOWN = Number(process.env.KILL_MISS_SEEDS_SHOWN ?? 5);

export function runKillMissTests(deck: Deck): boolean {
  const seedsWithMisses: number[] = [];
  let chanceFails = 0;
  for (let seed = 1; seed <= KILL_LINE_SEEDS; seed++) {
    const game = playSeed(deck, seed, false);
    if (game.killMisses > 0) seedsWithMisses.push(seed);
    chanceFails += game.killChanceFails;
  }
  const isGood = seedsWithMisses.length === 0;
  console.log(
    `${isGood ? 'OK ' : 'BAD'} kill lines played for real: ${KILL_LINE_SEEDS} seeds, ` +
      `${seedsWithMisses.length} with a kill miss, ${chanceFails} chance fail(s)`,
  );
  // the log says where each line failed
  for (const seed of seedsWithMisses.slice(0, SEEDS_SHOWN))
    for (const event of playSeed(deck, seed, true).log)
      if (event.text.startsWith('KILL MISS'))
        console.log(`      seed ${seed}, turn ${event.turn}: ${event.text}`);
  return isGood;
}

function playSeed(deck: Deck, seed: number, isLogOn: boolean) {
  const decklist = C.loadDecklist(resolveList(deck, deck.defaultList));
  const game = new deck.Game(
    decklist.commanders,
    decklist.library,
    new Rng(seed),
    { ...deck.config },
    isLogOn,
    'protected',
  );
  game.play();
  return game;
}
