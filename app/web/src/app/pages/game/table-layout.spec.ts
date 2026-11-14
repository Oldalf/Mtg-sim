import type {
  CardMove,
  GameEvent,
  GameLog,
  LogPlayer,
} from '../../../../../../shared/game-log-types';
import { turnsOfGame, type PermanentStack } from './game-steps';
import {
  changedCardsByPlayer,
  countLands,
  goldfishOpponents,
  lifeChanges,
  permanentGrid,
  scrubMarks,
  seatRows,
} from './table-layout';

function makePlayer(name: string, seat: number): LogPlayer {
  return { name, deckName: name, commanders: [], seat, librarySize: 99 };
}

function makeEvent(
  turn: number,
  activePlayer: number,
  life: number[],
  moves: CardMove[] = [],
  isHighlight = false,
): GameEvent {
  return {
    turn,
    player: activePlayer,
    activePlayer,
    kind: 'note',
    text: 'a line',
    cards: [],
    isHighlight,
    moves,
    life,
  };
}

/** A game whose players are listed in this seat order (index i plays at seat seats[i]). */
function makeGame(seats: number[], events: GameEvent[] = []): GameLog {
  return {
    seed: 1,
    players: seats.map((seat, index) => makePlayer(`deck${index}`, seat)),
    events,
  };
}

describe('table layout', () => {
  it('seats the players clockwise: the top row left to right, the bottom right to left', () => {
    expect(seatRows(makeGame([0]))).toEqual({ top: [0], bottom: [] });
    expect(seatRows(makeGame([0, 1, 2]))).toEqual({ top: [0, 1], bottom: [2] });
    expect(seatRows(makeGame([0, 1, 2, 3]))).toEqual({
      top: [0, 1],
      bottom: [3, 2],
    });
    expect(seatRows(makeGame([0, 1, 2, 3, 4]))).toEqual({
      top: [0, 1, 2],
      bottom: [4, 3],
    });
    expect(seatRows(makeGame([0, 1, 2, 3, 4, 5]))).toEqual({
      top: [0, 1, 2],
      bottom: [5, 4, 3],
    });
  });

  it('places the players by their seat, not by their place in the log', () => {
    // player 2 plays first, player 0 last
    expect(seatRows(makeGame([2, 0, 1]))).toEqual({ top: [1, 2], bottom: [0] });
  });

  it('lists the cards a line changed for each player, each once', () => {
    const game = makeGame([0, 1]);
    const event = makeEvent(
      1,
      0,
      [40, 40],
      [
        { player: 0, card: 'Forest', action: 'moved hand => battlefield' },
        { player: 0, card: 'Forest', action: 'tapped' },
        { player: 1, card: 'Opt', action: 'moved hand => graveyard' },
      ],
    );
    expect(changedCardsByPlayer(game, event)).toEqual([['Forest'], ['Opt']]);
  });

  it('gives the life change of the line, nothing on the first line', () => {
    const game = makeGame(
      [0, 1],
      [
        makeEvent(1, 0, [40, 40]),
        makeEvent(1, 0, [40, 33]),
        makeEvent(1, 0, [42, 33]),
      ],
    );
    expect(lifeChanges(game, 0)).toEqual([0, 0]);
    expect(lifeChanges(game, 1)).toEqual([0, -7]);
    expect(lifeChanges(game, 2)).toEqual([2, 0]);
  });

  it("shows the goldfish opponents' life and poison, not in a pod", () => {
    const event = makeEvent(3, 0, [40, 31, 31, 31]);
    expect(goldfishOpponents(makeGame([0]), event)).toEqual([
      { life: 31, poison: 0 },
      { life: 31, poison: 0 },
      { life: 31, poison: 0 },
    ]);
    expect(goldfishOpponents(makeGame([0, 1, 2, 3]), event)).toEqual([]);
    event.playerCounters = [{ energy: 2 }, {}, { poison: 4 }, {}];
    expect(
      goldfishOpponents(makeGame([0]), event).map(
        (opponent) => opponent.poison,
      ),
    ).toEqual([0, 4, 0]);
  });

  it('marks each turn and highlight on the scrub bar, taller at a new round', () => {
    // seat order: player 1 first, then player 0
    const game = makeGame(
      [1, 0],
      [
        makeEvent(1, 1, [40, 40]),
        makeEvent(1, 0, [40, 40], [], true),
        makeEvent(2, 1, [40, 40]),
        makeEvent(2, 1, [40, 40]),
        makeEvent(2, 0, [40, 40], [], true),
      ],
    );
    const marks = scrubMarks(game, turnsOfGame(game));
    expect(
      marks.turns.map((tick) => [
        tick.eventIndex,
        tick.percent,
        tick.startsRound,
      ]),
    ).toEqual([
      [0, 0, true],
      [1, 25, false],
      [2, 50, true],
      [4, 100, false],
    ]);
    expect(marks.highlights).toEqual([
      { eventIndex: 1, percent: 25 },
      { eventIndex: 4, percent: 100 },
    ]);
  });

  it('puts more permanents on more rows, at most three', () => {
    expect(permanentGrid(0)).toEqual({ rows: 1, perRow: 1 });
    expect(permanentGrid(6)).toEqual({ rows: 1, perRow: 6 });
    expect(permanentGrid(7)).toEqual({ rows: 2, perRow: 4 });
    expect(permanentGrid(16)).toEqual({ rows: 2, perRow: 8 });
    expect(permanentGrid(30)).toEqual({ rows: 3, perRow: 10 });
  });

  it('counts the lands and the untapped ones', () => {
    const land = (tapped: boolean, count: number): PermanentStack => ({
      permanent: { name: 'Forest', tapped, counters: 0, isToken: false },
      count,
    });
    expect(countLands([land(false, 3), land(true, 2)])).toEqual({
      total: 5,
      untapped: 3,
    });
    expect(countLands([])).toEqual({ total: 0, untapped: 0 });
  });
});
