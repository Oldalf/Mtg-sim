/**
 * Check a real game (Archidekt playtester log) for missed kills, and let the AI play the same draws.
 *
 *   npm run sim -- gale --analyze logs/game1.txt                     (uses the deck's decklist.txt)
 *   npm run sim -- gale --analyze logs/game1.txt -d lists/proposed.txt --ai 300
 *
 * The log is Archidekt's simplified playtest log, one event per line:
 *   T3; Gale, Waterdeep Prodigy; moved commandZone => battlefield
 * What it does:
 *   1. Replays the log and rebuilds your hand, battlefield, graveyard and untapped mana (log-board.ts).
 *   2. Runs the deck's kill finder at the start of every turn (after the draw), after every event
 *      during the turn, and at the end of each turn (for "kill next turn").
 *   3. Gives the AI your opening hand and the same card order (shuffles ignored) and reports when
 *      it kills, so you can compare lines.
 * Notes: instants/sorceries on the battlefield are treated as being on the stack. Floating mana is
 * estimated from taps minus spell costs (see Board.resetPool); +1/+1 counters on Dark Ritual are
 * taken as the player's own floating-{B} record. The kill finder does not tutor in the middle of a
 * combo, so kills that need a tutor first are not found.
 */
import * as C from './cards';
import { Config } from './game-types';
import { Game } from './game';
import { Board, BoardGame, LogEvent, parseLog } from './log-board';
import { Rng } from './rng';
import { formatPlainLines } from './game-log-text';
import { Deck } from './runner';

const percentText = (fraction: number) => `${Math.round(fraction * 100)}%`;

/** What the kill finder found on the board. */
interface KillCheck {
  /** 0 = no kill, 1 = a kill, 2 = a kill with counterspell backup. */
  killLevel: number;
  line: string[] | null; // the steps of the kill
  note: string; // text about lines that only win with some probability
}

function checkForKill(
  game: BoardGame,
  isNextTurn: boolean,
  budget: number,
): KillCheck {
  const snapshot = game.buildKillSearchState(isNextTurn);
  if (!isNextTurn) game.addManaToKillSearchState(snapshot, game.floatA ?? 0); // floating mana of either colour (Signet, Hollow...)
  if (
    !isNextTurn &&
    !game.landPlayed &&
    game.hand.some((card) => card.land !== null)
  )
    game.addLandToKillSearchState(snapshot); // land drop still available
  if (!game.killReachable(snapshot))
    return { killLevel: 0, line: null, note: '' };
  const search = game.killSearch();
  const killLevel = search.search(snapshot, budget);
  let note = '';
  // uncertain lines (e.g. Gale's Konrad chains) are checked against real shuffles
  if (killLevel && search.lastLineProbability !== null)
    note = ` (${game.chanceName} wins ${percentText(search.lastLineProbability)} with real shuffles)`;
  else if (!killLevel && search.bestMiss !== null)
    note = ` (a ${game.chanceName} kills on average, but only ${percentText(search.bestMiss)} with real shuffles; needs ${percentText(search.minChance)})`;
  return {
    killLevel,
    line: killLevel ? [...(search.lastLine ?? [])] : null,
    note,
  };
}

const backupText = (killLevel: number) =>
  killLevel === 2 ? ' (with counter backup)' : '';

function describeFloatingMana(board: Board): string {
  const floating = board.floating();
  const manaText = (Object.entries(floating) as [string, number][])
    .filter(([, amount]) => amount)
    .map(
      ([kind, amount]) =>
        `${amount}${kind !== 'A' ? kind : ' either'}${kind === 'S' ? ' (instants/sorceries)' : ''}`,
    )
    .join(' ');
  const owedText = board.owed
    ? `, ${board.owed.generic + board.owed.blue + board.owed.black + board.owed.hybrid} mana of a cast still unpaid in the log`
    : '';
  return `estimated floating mana: ${manaText || 'none'}${owedText}`;
}

function describeBoard(board: Board): string {
  const nonlands = board.battlefield
    .filter((boardCard) => C.get(boardCard.name).land === null)
    .map((boardCard) => boardCard.name);
  const lands = board.battlefield
    .filter((boardCard) => C.get(boardCard.name).land !== null)
    .map((boardCard) => boardCard.name);
  return (
    `    hand:        ${board.hand.join(', ') || '-'}\n` +
    `    permanents:  ${nonlands.join(', ') || '-'}\n` +
    `    lands (${lands.length}):   ${lands.join(', ')}\n` +
    `    graveyard:   ${board.graveyard.join(', ') || '-'}`
  );
}

function printKillLine(line: string[]): void {
  for (const step of line) console.log('        ' + step);
}

/** Replays the whole log turn by turn. Returns the final board and the first turn with a kill (null = none). */
function analyzeLog(
  deck: Deck,
  events: LogEvent[],
  commanders: string[],
  cards: string[],
  config: Config,
  budget: number,
): [Board, number | null] {
  const board = new Board(commanders, cards, deck);
  const turns = [...new Set(events.map((event) => event[0]))].sort(
    (first, second) => first - second,
  );
  let firstKillTurn: number | null = null;
  for (const turn of turns) {
    if (turn > 1) board.newTurn();
    console.log(`\n=== Turn ${turn}`);
    const turnEvents = events.filter((event) => event[0] === turn);
    const foundKill = analyzeTurn(
      board,
      deck,
      turn,
      turnEvents,
      config,
      budget,
    );
    if (foundKill) firstKillTurn = firstKillTurn || turn;
  }
  return [board, firstKillTurn];
}

/** One turn of the log. Returns true if a kill was available at the start of the turn or in the middle of it. */
function analyzeTurn(
  board: Board,
  deck: Deck,
  turn: number,
  turnEvents: LogEvent[],
  config: Config,
  budget: number,
): boolean {
  let startChecked = false;
  let foundKill = false;
  for (const [, card, action] of turnEvents) {
    const move = /^moved (\w+) => (\w+)/.exec(action);
    const isDraw = move && move[1] === 'library';
    const isUntap = action === 'untapped';
    if (!startChecked && !(isDraw || isUntap)) {
      startChecked = true;
      console.log('  Start of turn (after your draw):');
      console.log(describeBoard(board));
      const check = checkForKill(board.toGame(turn, config), turn > 1, budget);
      if (check.killLevel) {
        console.log(
          `  >>> KILL AVAILABLE at the start of turn ${turn}${backupText(check.killLevel)}${check.note}:`,
        );
        printKillLine(check.line!);
        foundKill = true;
      } else console.log('    no kill with these cards' + check.note);
    }
    if (!applyEvent(board, deck, turn, card, action, move, config)) continue;
    // mid-turn check after casts / resolutions (not after every tap)
    if (
      startChecked &&
      !foundKill &&
      move &&
      ['battlefield', 'graveyard', 'exile', 'hand'].includes(move[2])
    ) {
      const check = checkForKill(board.toGame(turn, config), false, budget);
      if (check.killLevel) {
        foundKill = true;
        console.log(
          `  >>> KILL AVAILABLE mid-turn ${turn}, right after: ${card} ${action}${backupText(check.killLevel)}${check.note}`,
        );
        console.log(describeBoard(board));
        console.log(
          '      ' +
            describeFloatingMana(board) +
            ' + your untapped permanents:',
        );
        printKillLine(check.line!);
      } else if (check.note)
        console.log(`  (after ${card} ${action}: no kill${check.note})`);
    }
  }
  if (!startChecked) console.log('  (only draws this turn)');
  console.log('  End of turn:');
  console.log(describeBoard(board));
  if (!foundKill) {
    const check = checkForKill(board.toGame(turn, config), true, budget);
    if (check.killLevel) {
      console.log(
        `  >>> with these cards you have a kill next turn even before drawing${backupText(check.killLevel)}${check.note}:`,
      );
      printKillLine(check.line!);
    } else console.log('    no kill next turn without new cards' + check.note);
  }
  return foundKill;
}

/** Applies one log event to the board. Returns false for events that need no mid-turn check (opponent's cards, trackers). */
function applyEvent(
  board: Board,
  deck: Deck,
  turn: number,
  card: string,
  action: string,
  move: RegExpExecArray | null,
  config: Config,
): boolean {
  if (move) {
    const [, from, destination] = move;
    if (destination === 'opponentsCards') {
      console.log(`  (opponent: ${card})`);
      return false;
    }
    if (from === 'miscCards') {
      // not a card from the deck: a tracker the player keeps (an emblem / counter) or one of our tokens
      if ((deck.logTrackers ?? []).includes(card))
        board.trackers[card] = board.trackers[card] ?? 0;
      else if (destination === 'battlefield') {
        board.battlefield.push({
          name: card,
          tapped: false,
          sick: true,
          counters: 0,
          token: true,
        });
        console.log(`  (token: ${card})`);
      }
      return false;
    }
    if (board.isCast(card, from, destination))
      board.payCast(card, from, turn, config);
    board.moveCard(card, from, destination);
  } else if (action === 'tapped' || action === 'untapped') {
    board.setTapped(card, action === 'tapped');
    if (card === 'The Mindskinner' && action === 'tapped')
      console.log('  attack with The Mindskinner');
  } else if (action.startsWith('counter')) {
    const counters = /=(-?\d+)/.exec(action);
    if (counters) {
      const count = parseInt(counters[1], 10);
      for (const permanent of board.battlefield)
        if (permanent.name === card) permanent.counters = count;
      if (card in board.trackers) board.trackers[card] = count;
      if (card === 'Dark Ritual') board.ritualCounter = count;
    }
  } else if (action.startsWith('flipped') || action.startsWith('upsideDown')) {
    // "upsideDown:true": a flip card turned over (Budoka Gardener -> Dokai)
    for (const permanent of board.battlefield)
      if (permanent.name === card) permanent.flipped = action.endsWith('true');
  }
  return true;
}

/** Same opening hand and the same card order as the real game (every card that left your library, in
 *  log order, tutored cards included); the rest of the library is random and shuffles are ignored. */
function gameWithLoggedDraws(
  deck: Deck,
  commanders: string[],
  cards: string[],
  drawOrder: string[],
  rng: Rng,
  config: Config,
  verbose = false,
): Game<unknown> {
  const game = new deck.Game(commanders, cards, rng, config, verbose, 'any');
  const rest = cards.slice();
  for (const name of drawOrder) rest.splice(rest.indexOf(name), 1);
  rng.shuffle(rest);
  game.library = [...drawOrder, ...rest].map((name) => C.get(name));
  game.onPlay = false;
  game.mulligan = function (this: Game<unknown>) {
    this.hand = this.library.splice(0, 7);
  };
  game.shuffle = () => {}; // keep the real game's card order so both players see the same cards
  return game;
}

/** The log may mention cards that are not in the decklist (an opponent's, or a list that was changed). */
function printCardsMissingFromList(
  events: LogEvent[],
  decklist: C.Decklist,
): void {
  const inList = new Set([...decklist.library, ...decklist.commanders]);
  const miscCards = new Set(
    events
      .filter(([, , action]) => action.includes('miscCards'))
      .map(([, card]) => card),
  ); // tokens, trackers
  const unknown = [
    ...new Set(
      events
        .filter(
          ([, card, action]) =>
            !miscCards.has(card) && !action.includes('opponentsCards'),
        )
        .map(([, card]) => card),
    ),
  ]
    .filter((card) => !inList.has(card))
    .sort();
  if (unknown.length)
    console.log(
      "Note: cards in the log that are not in the decklist (ignored if opponents'): " +
        unknown.join(', '),
    );
}

export function run(
  deck: Deck,
  logFile: string,
  listFile: string,
  aiRuns = 200,
  budget = 20000,
): void {
  const decklist = C.loadDecklist(listFile);
  if (decklist.missing.length)
    throw new Error('missing card data: ' + decklist.missing.join(', '));
  const config: Config = { ...deck.config, max_turn: 10 };
  const events = parseLog(logFile);
  printCardsMissingFromList(events, decklist);
  const [board, firstKillTurn] = analyzeLog(
    deck,
    events,
    decklist.commanders,
    decklist.library,
    config,
    budget,
  );
  const lastTurn = Math.max(...events.map((event) => event[0]));
  console.log(
    firstKillTurn
      ? `\nYour game: the log ends on turn ${lastTurn}. The kill finder first found a kill on turn ${firstKillTurn}.`
      : `\nYour game: the log ends on turn ${lastTurn}. The kill finder found no kill in it.`,
  );
  replayWithAi(deck, decklist, board.drawOrder, config, aiRuns);
}

/** Lets the AI play the same opening hand and draws as the real game, many times, and prints its kill turns. */
function replayWithAi(
  deck: Deck,
  decklist: C.Decklist,
  drawOrder: string[],
  config: Config,
  aiRuns: number,
): void {
  const notInList: string[] = [];
  const rest = decklist.library.slice();
  for (const name of drawOrder) {
    const index = rest.indexOf(name);
    if (index >= 0) rest.splice(index, 1);
    else notInList.push(name);
  }
  if (notInList.length) {
    console.log(
      `\n=== No AI replay: you drew cards that are not in this decklist (${[...new Set(notInList)].sort().join(', ')}).\n` +
        '    Pick the list the game was played with: -d <list>',
    );
    return;
  }
  console.log(
    `\n=== AI with your opening hand and your draws (${drawOrder.length} cards in your order, rest random, no shuffles), ${aiRuns} runs`,
  );
  const killTurns: (number | null)[] = [];
  for (let run = 0; run < aiRuns; run++)
    killTurns.push(
      gameWithLoggedDraws(
        deck,
        decklist.commanders,
        decklist.library,
        drawOrder,
        new Rng(1000 + run),
        config,
      ).play()[0],
    );
  for (let turn = 4; turn <= 10; turn++)
    console.log(
      `  kill by turn ${String(turn).padStart(2)}: ${((killTurns.filter((killTurn) => killTurn && killTurn <= turn).length / killTurns.length) * 100).toFixed(1).padStart(5)}%`,
    );
  const shownGame = gameWithLoggedDraws(
    deck,
    decklist.commanders,
    decklist.library,
    drawOrder,
    new Rng(1000),
    config,
    true,
  );
  const [killTurn] = shownGame.play();
  console.log(`\n  One AI replay (kill turn ${killTurn}):`);
  console.log(
    formatPlainLines(shownGame.log)
      .map((line) => '    ' + line)
      .join('\n'),
  );
}
