/**
 * Checks of the game log. The log must only read the game: a game played with the log on ends exactly like the
 * same game played with the log off.
 *   npm run sim -- <deck> --test     (the goldfish check, before the deck's own tests)
 *   npm run pod -- --test            (the pod check, after the blocking tests)
 */
import * as C from '../cards/cards';
import { Game } from '../game/game';
import { goldfishGameLog } from './game-log';
import { GameIndexRow } from './game-log-files';
import { tagGoldfishGames } from './game-log-tags';
import {
  PlayerBoard,
  TableBoards,
  boardAt,
  describeBoard,
  describeEventText,
} from '../../shared/game-log-board';
import { Permanent } from '../game/game-types';
import { playPod, playRounds, podSpec, seatPlayers } from '../pod/pod';
import { Rng } from '../util/rng';
import { Deck, resolveList } from '../run/runner';

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

/** Reports the zone changes that went around the engine's functions (takeCard, putCard, moveCard...). Each one
 *  names the seed, the turn and the log line it was found at, which leads to the code that made it. */
function reportUnrecordedMoves(
  label: string,
  unrecordedMoves: string[],
): boolean {
  return reportDifferences(
    label,
    'zone changes went around takeCard / putCard',
    unrecordedMoves,
  );
}

/** Prints a count of things that should not be there, and the first few. Any of them fails the test. */
export function reportDifferences(
  label: string,
  whatTheyAre: string,
  differences: string[],
): boolean {
  const isGood = differences.length === 0;
  console.log(
    `${isGood ? 'OK ' : 'BAD'} ${label}: ${differences.length} ${whatTheyAre}`,
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

/** Energy, experience and poison set on the players are on the next log line and on the board rebuilt from the
 *  log, in a goldfish game and in a pod; a line where every count is 0 has no counters at all. */
export function runPlayerCounterTests(allDecks: Record<string, Deck>): boolean {
  const goldfishGame = newLoggedGame(allDecks.gale, 1);
  goldfishGame.say('nothing yet');
  goldfishGame.gainEnergy(5);
  goldfishGame.payEnergy(1);
  goldfishGame.gainExperience(2);
  goldfishGame.poison[1] = 3;
  goldfishGame.say('counters set');
  const [lineWithoutCounters, goldfishLine] = goldfishGame.log.slice(-2);
  const goldfishLog = goldfishGameLog(
    1,
    'gale',
    goldfishGame.commanderNames,
    0,
    goldfishGame.log,
  );
  const goldfishBoard = boardAt(goldfishLog, goldfishLog.events.length - 1)[0];

  const spec = podSpec(allDecks, POD_DECKS, POD_ROUNDS_CAP, {});
  const table = seatPlayers(allDecks, spec, 1, true);
  table.games[0].gainEnergy(4);
  table.poison[1] = 3;
  table.sayAs(0, 'counters set');
  const podLine = table.gameLog().events.at(-1)!;
  // a line of a player's own game: its own experience, the others' counters as the table has them
  table.startTurnLog(2);
  table.refreshView(2);
  table.games[2].gainExperience(2);
  table.games[2].say('experience gained');
  table.flushCurrentPlayerLog();
  const podLog = table.gameLog();
  const ownGameLine = podLog.events.at(-1)!;
  const podBoards = boardAt(podLog, podLog.events.length - 1);

  const checks: [string, unknown, unknown][] = [
    [
      'goldfish line without counters',
      lineWithoutCounters.playerCounters,
      undefined,
    ],
    [
      'goldfish line',
      goldfishLine.playerCounters,
      [{ energy: 4, experience: 2 }, {}, { poison: 3 }, {}],
    ],
    [
      'goldfish board',
      goldfishBoard.playerCounters,
      { energy: 4, experience: 2 },
    ],
    [
      'goldfish board as text',
      describeBoard(goldfishBoard)[0].startsWith(
        'life 40, energy 4, experience 2,',
      ),
      true,
    ],
    [
      'pod line',
      podLine.playerCounters,
      [{ energy: 4 }, { poison: 3 }, {}, {}],
    ],
    [
      "pod line of a player's own game",
      ownGameLine.playerCounters,
      [{ energy: 4 }, { poison: 3 }, { experience: 2 }, {}],
    ],
    [
      'pod boards',
      podBoards.map((board) => board.playerCounters),
      [{ energy: 4 }, { poison: 3 }, { experience: 2 }, {}],
    ],
  ].map(([label, actual, expected]) => [
    label as string,
    JSON.stringify(actual),
    JSON.stringify(expected),
  ]);
  const wrong = checks
    .filter(([, actual, expected]) => actual !== expected)
    .map(
      ([label, actual, expected]) =>
        `${label}: ${actual}, expected ${expected}`,
    );
  return reportDifferences(
    'player counters in the log and on the board',
    'counters wrong',
    wrong,
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
        name: permanent.card.logName, // a marker token is logged as what it stands for
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
  );
}

/** Goldfish index rows that were won on the given turns (null: not won), seeds 1, 2, 3... */
function rowsWonOnTurns(winTurns: (number | null)[]): GameIndexRow[] {
  return winTurns.map((winTurn, index) => ({
    seed: index + 1,
    file: 'games.jsonl',
    line: index,
    tags: [],
    killTurns: [winTurn, null],
  }));
}

/** The seeds that carry a tag, as text. */
const seedsWithTag = (rows: GameIndexRow[], tag: string) =>
  rows
    .filter((row) => row.tags.includes(tag))
    .map((row) => row.seed)
    .join(',');

/** Fastest and slowest are the earliest and the latest win turn, never both on a game, never given when all
 *  games won on the same turn. */
export function runTagTests(): boolean {
  const spread = rowsWonOnTurns([4, 5, 5, 5, 6, 6, 7, 9]);
  tagGoldfishGames(spread);
  const sameTurn = rowsWonOnTurns([5, 5, 5, 5]);
  tagGoldfishGames(sameTurn);
  const ties = rowsWonOnTurns([4, 4, 4, 4, 4, 4, 4, 9, 9, 9, 9, 9, 9, 9]);
  tagGoldfishGames(ties);
  const withoutWin = rowsWonOnTurns([4, null, 8]);
  tagGoldfishGames(withoutWin);
  const bothTags = spread.filter(
    (row) => row.tags.includes('fastest') && row.tags.includes('slowest'),
  );
  const checks: [string, string, string][] = [
    ['fastest', seedsWithTag(spread, 'fastest'), '1'],
    ['slowest', seedsWithTag(spread, 'slowest'), '8'],
    ['average (median turn 5)', seedsWithTag(spread, 'average'), '2,3,4'],
    ['no fastest on one turn', seedsWithTag(sameTurn, 'fastest'), ''],
    ['no slowest on one turn', seedsWithTag(sameTurn, 'slowest'), ''],
    ['average on one turn', seedsWithTag(sameTurn, 'average'), '1,2,3,4'],
    ['fastest tied, capped', seedsWithTag(ties, 'fastest'), '1,2,3,4,5'],
    ['slowest tied, capped', seedsWithTag(ties, 'slowest'), '8,9,10,11,12'],
    ['no-win', seedsWithTag(withoutWin, 'no-win'), '2'],
    ['fastest with a no-win', seedsWithTag(withoutWin, 'fastest'), '1'],
    ['both tags on one game', String(bothTags.length), '0'],
  ];
  const wrong = checks
    .filter(([, actual, expected]) => actual !== expected)
    .map(
      ([label, actual, expected]) =>
        `${label}: seeds [${actual}], expected [${expected}]`,
    );
  return reportDifferences('game tags mean something', 'tags wrong', wrong);
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

/** A payment's sources are on the next log line (and only on that one), the floating mana is on every line while it
 *  floats, and the board and the line's text show both. */
export function runPaymentLogTests(allDecks: Record<string, Deck>): boolean {
  const game = newLoggedGame(allDecks.gale, 1);
  for (const cardName of ['Island', 'Swamp']) {
    const card = C.get(cardName);
    game.battlefield.push(new Permanent(card, card.land));
  }
  game.say('lands out');
  game.pay(C.Cost.parse('{U}{B}'));
  game.pool.B += 2; // as a Dark Ritual would leave it
  game.say('cast a test spell');
  game.say('nothing paid');
  const [paidLine, laterLine] = game.log.slice(-2);
  const gameLog = goldfishGameLog(1, 'gale', game.commanderNames, 0, game.log);
  const board = boardAt(gameLog, gameLog.events.length - 1)[0];

  const checks: [string, unknown, unknown][] = [
    [
      'paid line',
      paidLine.paidWith,
      [
        { card: 'Island', made: 'U' },
        { card: 'Swamp', made: 'B' },
      ],
    ],
    ['paid line pool', paidLine.pool, 'BB'],
    [
      'paid line text',
      describeEventText(paidLine),
      'cast a test spell — paid with Island (U), Swamp (B)',
    ],
    ['later line', laterLine.paidWith, undefined],
    ['later line pool', laterLine.pool, 'BB'],
    ['board pool', board.pool, 'BB'],
    ['board as text', describeBoard(board)[0].includes('pool B2,'), true],
  ].map(([label, actual, expected]) => [
    label as string,
    JSON.stringify(actual),
    JSON.stringify(expected),
  ]);
  const wrong = checks
    .filter(([, actual, expected]) => actual !== expected)
    .map(
      ([label, actual, expected]) =>
        `${label}: ${actual}, expected ${expected}`,
    );
  return reportDifferences(
    'payments and the pool in the log and on the board',
    'payment lines wrong',
    wrong,
  );
}
