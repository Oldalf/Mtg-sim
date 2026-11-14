import { boardAt } from '../../../../../../shared/game-log-board';
import type {
  CardMove,
  EventKind,
  GameEvent,
  GameLog,
} from '../../../../../../shared/game-log-types';
import {
  autoplayDelay,
  cardNamesOfGame,
  cardsOfEvent,
  eventIndexFromLine,
  speedFromStored,
  nextEvent,
  nextHighlight,
  nextTurn,
  previousEvent,
  previousHighlight,
  previousTurn,
  splitBattlefield,
  turnsOfGame,
} from './game-steps';

function makeEvent(
  turn: number,
  activePlayer: number,
  kind: EventKind,
  text: string,
  moves: CardMove[] = [],
  player = activePlayer,
): GameEvent {
  return {
    turn,
    player,
    activePlayer,
    kind,
    text,
    cards: moves.map((move) => move.card).slice(0, 1),
    isHighlight: kind === 'answer' || kind === 'win',
    moves,
    life: [40, 40],
  };
}

const fromLibrary = (player: number, card: string): CardMove => ({
  player,
  card,
  action: 'moved library => hand',
});
const playLand = (player: number, card: string): CardMove => ({
  player,
  card,
  action: 'moved hand => battlefield',
});

/** A pod of two: gale plays second, meren first. */
const POD_GAME: GameLog = {
  seed: 7,
  players: [
    {
      name: 'gale',
      deckName: 'gale',
      commanders: ['Gale'],
      seat: 1,
      librarySize: 99,
    },
    {
      name: 'meren',
      deckName: 'meren',
      commanders: ['Meren'],
      seat: 0,
      librarySize: 99,
    },
  ],
  events: [
    /* 0 */ makeEvent(0, 1, 'note', 'opening hand', [
      fromLibrary(1, 'Swamp'),
      fromLibrary(1, 'Swamp'),
    ]),
    /* 1 */ makeEvent(1, 1, 'turn-start', ''),
    /* 2 */ makeEvent(1, 1, 'land', 'play land Swamp', [playLand(1, 'Swamp')]),
    /* 3 */ makeEvent(1, 1, 'land', 'play land Swamp', [playLand(1, 'Swamp')]),
    /* 4 */ makeEvent(1, 1, 'answer', 'counters Opt', [], 0),
    /* 5 */ makeEvent(1, 0, 'turn-start', ''),
    /* 6 */ makeEvent(1, 0, 'land', 'play land Island', [
      fromLibrary(0, 'Island'),
      playLand(0, 'Island'),
      { player: 0, card: 'Island', action: 'tapped' },
    ]),
    /* 7 */ makeEvent(1, 0, 'win', 'wins'),
  ],
};

describe('game steps', () => {
  it('groups the lines by turn, naming a line by another player', () => {
    const turns = turnsOfGame(POD_GAME);
    expect(turns.map((turn) => turn.title)).toEqual([
      'Round 0, meren',
      'Round 1, meren',
      'Round 1, gale',
    ]);
    expect(turns.map((turn) => [turn.firstEvent, turn.lastEvent])).toEqual([
      [0, 0],
      [1, 4],
      [5, 7],
    ]);
    // the turn start has no text, so it is only the turn's title
    expect(turns[1].lines.map((line) => line.eventIndex)).toEqual([2, 3, 4]);
    expect(turns[1].lines[2].playerName).toBe('gale');
    expect(turns[1].lines[0].playerName).toBe('');
    expect(turns[1].lines[0].moves).toEqual([
      'meren; Swamp; moved hand => battlefield',
    ]);
    // a win always names its player
    expect(turns[2].lines[1].playerName).toBe('gale');
  });

  it('steps by line within the game', () => {
    expect(nextEvent(POD_GAME, 2)).toBe(3);
    expect(nextEvent(POD_GAME, 7)).toBe(7);
    expect(previousEvent(0)).toBe(0);
  });

  it('steps by highlight, staying put when there is none', () => {
    expect(nextHighlight(POD_GAME, 0)).toBe(4);
    expect(nextHighlight(POD_GAME, 4)).toBe(7);
    expect(nextHighlight(POD_GAME, 7)).toBe(7);
    expect(previousHighlight(POD_GAME, 7)).toBe(4);
    expect(previousHighlight(POD_GAME, 4)).toBe(4);
  });

  it('steps by turn: previous goes to the turn start first', () => {
    const turns = turnsOfGame(POD_GAME);
    expect(nextTurn(turns, 0)).toBe(1);
    expect(nextTurn(turns, 3)).toBe(5);
    expect(nextTurn(turns, 6)).toBe(7);
    expect(previousTurn(turns, 3)).toBe(1);
    expect(previousTurn(turns, 1)).toBe(0);
    expect(previousTurn(turns, 0)).toBe(0);
  });

  it('lists the cards of a line and of the game once each', () => {
    expect(cardsOfEvent(POD_GAME.events[0])).toEqual(['Swamp']);
    expect(cardNamesOfGame(POD_GAME)).toEqual([
      'Gale',
      'Island',
      'Meren',
      'Swamp',
    ]);
  });

  it('leaves out the cards of a line that end where they started (a mulligan)', () => {
    const backToLibrary = (card: string): CardMove => ({
      player: 0,
      card,
      action: 'moved hand => library',
    });
    const mulligan: GameEvent = {
      ...makeEvent(0, 0, 'note', 'opening hand', [
        fromLibrary(0, 'Opt'),
        fromLibrary(0, 'Swamp'),
        backToLibrary('Opt'),
        backToLibrary('Swamp'),
        fromLibrary(0, 'Swamp'),
        fromLibrary(0, 'Island'),
      ]),
      cards: [], // as the engine logs an opening hand: no card named
    };
    expect(cardsOfEvent(mulligan)).toEqual(['Swamp', 'Island']);
    // the land of POD_GAME's line 6 is drawn, played and tapped: shown once
    expect(cardsOfEvent(POD_GAME.events[6])).toEqual(['Island']);
  });

  it('builds the board after a line, lands apart and alike ones stacked', () => {
    const [galeBoard, merenBoard] = boardAt(POD_GAME, 6);
    expect(merenBoard.hand).toEqual([]);
    expect(merenBoard.librarySize).toBe(97);
    expect(merenBoard.commandZone).toEqual(['Meren']);
    const isLand = (cardName: string) => ['Swamp', 'Island'].includes(cardName);
    const merenField = splitBattlefield(merenBoard, isLand);
    expect(merenField.others).toEqual([]);
    expect(merenField.lands).toEqual([
      {
        permanent: {
          name: 'Swamp',
          tapped: false,
          counters: 0,
          isToken: false,
        },
        count: 2,
      },
    ]);
    const galeField = splitBattlefield(galeBoard, isLand);
    expect(galeField.lands[0].permanent.tapped).toBe(true);
    expect(galeBoard.librarySize).toBe(98);
  });
});

describe('autoplayDelay', () => {
  const plainLine = makeEvent(1, 0, 'land', 'play a land');
  const highlightLine = makeEvent(1, 0, 'win', 'wins the game');

  it('stays 1.2 seconds on a plain line at normal speed', () => {
    expect(autoplayDelay(plainLine, false, 'normal')).toBe(1200);
  });

  it('stays longer on the first line of a turn', () => {
    expect(autoplayDelay(plainLine, true, 'normal')).toBe(2000);
  });

  it('stays longest on a highlight, even at the start of a turn', () => {
    expect(autoplayDelay(highlightLine, false, 'normal')).toBe(2500);
    expect(autoplayDelay(highlightLine, true, 'normal')).toBe(2500);
  });

  it('is longer when slow and shorter when fast', () => {
    const slow = autoplayDelay(plainLine, false, 'slow');
    const fast = autoplayDelay(plainLine, false, 'fast');
    expect(slow).toBeGreaterThan(1200);
    expect(fast).toBeLessThan(1200);
  });
});

describe('speedFromStored', () => {
  it('keeps a known speed', () => {
    expect(speedFromStored('fast')).toBe('fast');
  });

  it('falls back to normal when nothing or something unknown is kept', () => {
    expect(speedFromStored(null)).toBe('normal');
    expect(speedFromStored('warp')).toBe('normal');
  });
});

describe('eventIndexFromLine', () => {
  it('counts the line from 1 and gives the event index', () => {
    expect(eventIndexFromLine('120', 500)).toBe(119);
    expect(eventIndexFromLine('1', 500)).toBe(0);
  });

  it('is the first line when the line is missing or not a line of the game', () => {
    expect(eventIndexFromLine(null, 500)).toBe(0);
    expect(eventIndexFromLine('0', 500)).toBe(0);
    expect(eventIndexFromLine('501', 500)).toBe(0);
    expect(eventIndexFromLine('abc', 500)).toBe(0);
    expect(eventIndexFromLine('2.5', 500)).toBe(0);
  });
});
