/**
 * Checks of the game log. The log must only read the game: a game played with the log on ends exactly like the
 * same game played with the log off.
 *   npm run sim -- <deck> --test     (the goldfish check, before the deck's own tests)
 *   npm run pod -- --test            (the pod check, after the blocking tests)
 */
import * as C from './cards';
import { Game } from './game';
import { goldfishGameLog } from './game-log';
import { PlayerBoard, TableBoards } from './game-log-board';
import { playPod, playRounds, podSpec, seatPlayers } from './pod';
import { Rng } from './rng';
import { Deck, resolveList } from './runner';

const GOLDFISH_SEEDS = 50;
const POD_SEEDS = 50;
const POD_EXACT_MOVE_SEEDS = 20;
const REPLAY_SEEDS = 20;
const BOARD_SEEDS = 20;
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
  return reportDifferences(
    label,
    'zone changes went around takeCard / putCard',
    unrecordedMoves,
    mustBeNone,
  );
}

/** Prints a count of things that should not be there, and the first few. They fail the test only if mustBeNone. */
function reportDifferences(
  label: string,
  whatTheyAre: string,
  differences: string[],
  mustBeNone: boolean,
): boolean {
  const isGood = differences.length === 0 || !mustBeNone;
  const status = differences.length === 0 ? 'OK ' : mustBeNone ? 'BAD' : '-- ';
  console.log(
    `${status} ${label}: ${differences.length} ${whatTheyAre}` +
      (mustBeNone || !differences.length ? '' : ' (deck not converted yet)'),
  );
  for (const difference of differences.slice(0, CHANGES_SHOWN))
    console.log(`      ${difference}`);
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

function newLoggedGame(deck: Deck, seed: number): Game<unknown> {
  const decklist = C.loadDecklist(resolveList(deck, deck.defaultList));
  return new deck.Game(
    decklist.commanders,
    decklist.library,
    new Rng(seed),
    { ...deck.config },
    true,
    'protected',
  );
}

/** A game played again gives the same log (what replayGame in game-log-replay.ts relies on). */
export function runReplayTests(deck: Deck): boolean {
  const logOfGame = (seed: number) => {
    const game = newLoggedGame(deck, seed);
    game.play();
    return JSON.stringify(game.log);
  };
  const differingSeeds: number[] = [];
  for (let seed = 1; seed <= REPLAY_SEEDS; seed++)
    if (logOfGame(seed) !== logOfGame(seed)) differingSeeds.push(seed);
  return report(
    'a game played again gives the same log',
    differingSeeds,
    REPLAY_SEEDS,
  );
}

/** The zones of a board or a game as text that is equal when the same cards are in the same zones. */
function describeZones(zones: {
  hand: string[];
  graveyard: string[];
  exile: string[];
  commandZone: string[];
  battlefield: string[];
  librarySize: number;
}): Record<string, string> {
  const sorted = (names: string[]) => names.slice().sort().join(' | ');
  return {
    hand: sorted(zones.hand),
    graveyard: sorted(zones.graveyard),
    exile: sorted(zones.exile),
    'command zone': sorted(zones.commandZone),
    battlefield: sorted(zones.battlefield),
    library: String(zones.librarySize),
  };
}

/** The items of the first "a | b | c" list that the second one does not have. */
function itemsOnlyInFirst(first: string, second: string): string[] {
  const unmatched = second.split(' | ');
  return first
    .split(' | ')
    .filter((item) => item !== '')
    .filter((item) => {
      const index = unmatched.indexOf(item);
      if (index < 0) return true;
      unmatched.splice(index, 1);
      return false;
    });
}

/** What two "a | b | c" lists do not share. */
function describeDifference(fromLog: string, fromGame: string): string {
  return `only in the log [${itemsOnlyInFirst(fromLog, fromGame).join(', ')}], only in the game [${itemsOnlyInFirst(fromGame, fromLog).join(', ')}]`;
}

/** The battlefield as a log can know it. A log tells cards apart by name only, so of two Cats it cannot say which
 *  one was tapped or got a counter: what must match per name is how many there are and how many are tapped, and
 *  the counters when there is only one. */
function describeBattlefield(
  permanents: { name: string; isTapped: boolean; counters: number }[],
): string[] {
  const totals = new Map<string, [number, number, number]>();
  for (const permanent of permanents) {
    const total = totals.get(permanent.name) ?? [0, 0, 0];
    total[0] += 1;
    total[1] += permanent.isTapped ? 1 : 0;
    total[2] += permanent.counters;
    totals.set(permanent.name, total);
  }
  return [...totals].map(
    ([name, [count, tappedCount, counters]]) =>
      `${name} x${count}, ${tappedCount} tapped` +
      (count === 1 ? `, ${counters} counters` : ''),
  );
}

const zonesOfBoard = (board: PlayerBoard) =>
  describeZones({
    ...board,
    battlefield: describeBattlefield(
      board.battlefield.map((permanent) => ({
        name: permanent.name,
        isTapped: permanent.tapped,
        counters: permanent.counters,
      })),
    ),
  });

const zonesOfGame = (game: Game<unknown>) => {
  const names = (cards: C.CardDef[]) => cards.map((card) => card.name);
  return describeZones({
    hand: names(game.hand),
    graveyard: names(game.graveyard),
    exile: names(game.exile),
    commandZone: names(game.command),
    battlefield: describeBattlefield(
      game.battlefield.map((permanent) => ({
        name: permanent.card.name,
        isTapped: permanent.tapped,
        counters: permanent.counters,
      })),
    ),
    librarySize: game.library.length,
  });
};

/** The board rebuilt from the card moves of the log equals the game's real zones at the end of every turn. */
export function runBoardTests(deck: Deck): boolean {
  const differences: string[] = [];
  for (let seed = 1; seed <= BOARD_SEEDS; seed++) {
    const game = newLoggedGame(deck, seed);
    const gameLog = goldfishGameLog(
      seed,
      deck.name,
      game.commanderNames,
      game.library.length,
      game.log,
    );
    const table = new TableBoards(gameLog);
    let eventsApplied = 0;
    game.setup();
    for (;;) {
      const isGameOver =
        game.turn >= (game.config.max_turn as number) || game.takeTurn();
      game.logCardMovesSoFar();
      for (const event of game.log.slice(eventsApplied)) table.apply(event);
      eventsApplied = game.log.length;
      const rebuilt = zonesOfBoard(table.boards[0]);
      const real = zonesOfGame(game);
      // a deck that logs nothing (the goldfish) has no log to rebuild from
      if (!game.log.length) break;
      // the log's exile also holds cards that left the game (a Wishclaw Talisman given away)
      if (!itemsOnlyInFirst(real.exile, rebuilt.exile).length)
        rebuilt.exile = real.exile;
      for (const zone of Object.keys(real))
        if (rebuilt[zone] !== real[zone])
          differences.push(
            `seed ${seed} T${game.turn} ${zone}: ${describeDifference(rebuilt[zone], real[zone])}`,
          );
      if (isGameOver || differences.length > 200) break;
    }
  }
  return reportDifferences(
    `the board rebuilt from the log matches the game (${BOARD_SEEDS} seeds)`,
    'turn ends differ',
    differences,
    deck.recordsExactMoves === true,
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
