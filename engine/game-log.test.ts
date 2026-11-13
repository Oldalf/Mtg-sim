/**
 * Checks of the game log. The log must only read the game: a game played with the log on ends exactly like the
 * same game played with the log off.
 *   npm run sim -- <deck> --test     (the goldfish check, before the deck's own tests)
 *   npm run pod -- --test            (the pod check, after the blocking tests)
 */
import * as C from './cards';
import { Game } from './game';
import { playPod, playRounds, podSpec, seatPlayers } from './pod';
import { Rng } from './rng';
import { Deck, resolveList } from './runner';

const GOLDFISH_SEEDS = 50;
const POD_SEEDS = 50;
const POD_EXACT_MOVE_SEEDS = 20;
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

const CHANGES_SHOWN = 8;

/** Reports the zone changes that went around the engine's functions. They fail the test if every deck that
 *  played says it uses those functions (Deck.recordsExactMoves); otherwise they are the list of what is left to do. */
function reportUnrecordedMoves(
  label: string,
  unrecordedMoves: string[],
  mustBeNone: boolean,
): boolean {
  const isGood = unrecordedMoves.length === 0 || !mustBeNone;
  const status =
    unrecordedMoves.length === 0 ? 'OK ' : mustBeNone ? 'BAD' : '-- ';
  console.log(
    `${status} ${label}: ${unrecordedMoves.length} zone changes went around takeCard / putCard` +
      (mustBeNone || !unrecordedMoves.length
        ? ''
        : ' (deck not converted yet)'),
  );
  for (const move of unrecordedMoves.slice(0, CHANGES_SHOWN))
    console.log(`      ${move}`);
  return isGood;
}

/** Every zone change of a deck's goldfish games is recorded at the moment it happens. */
export function runExactMoveTests(deck: Deck): boolean {
  const decklist = C.loadDecklist(resolveList(deck, deck.defaultList));
  const unrecordedMoves: string[] = [];
  for (let seed = 1; seed <= GOLDFISH_SEEDS; seed++) {
    const game = new deck.Game(
      decklist.commanders,
      decklist.library,
      new Rng(seed),
      { ...deck.config },
      true,
      'protected',
    );
    game.play();
    unrecordedMoves.push(
      ...game.unrecordedCardMoves.map((move) => `seed ${seed} ${move}`),
    );
  }
  return reportUnrecordedMoves(
    'card moves are recorded when they happen',
    unrecordedMoves,
    deck.recordsExactMoves === true,
  );
}

/** The same for pod games: every player's game. */
export function runPodExactMoveTests(allDecks: Record<string, Deck>): boolean {
  const spec = podSpec(allDecks, POD_DECKS, POD_ROUNDS_CAP, {});
  const unrecordedMoves: string[] = [];
  for (let seed = 1; seed <= POD_EXACT_MOVE_SEEDS; seed++) {
    const table = seatPlayers(allDecks, spec, seed, true);
    playRounds(table, spec);
    table.games.forEach((game, player) =>
      unrecordedMoves.push(
        ...game.unrecordedCardMoves.map(
          (move) => `seed ${seed} ${table.playerName(player)} ${move}`,
        ),
      ),
    );
  }
  return reportUnrecordedMoves(
    'card moves in a pod are recorded when they happen',
    unrecordedMoves,
    POD_DECKS.every((name) => allDecks[name].recordsExactMoves === true),
  );
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
