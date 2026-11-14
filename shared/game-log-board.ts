/**
 * The table at any point of a logged game, rebuilt from the card moves (the board itself is never stored).
 * Cards are names only, so this works for a simulated game and for a real Archidekt log alike.
 *
 *   boardAt(gameLog, eventIndex)   every player's board after that event
 *   TableBoards                    the same, stepping through the events one by one
 */
import { CardMove, GameEvent, GameLog } from './game-log';

export interface BoardPermanent {
  name: string;
  tapped: boolean;
  /** +1/+1 counters. */
  counters: number;
  isToken: boolean;
}

/** One player's side of the table. */
export interface PlayerBoard {
  hand: string[];
  battlefield: BoardPermanent[];
  graveyard: string[];
  exile: string[];
  commandZone: string[];
  librarySize: number;
  /** Null when the log has no life totals (a real Archidekt log). */
  life: number | null;
}

/** The zones that are lists of card names. */
const NAME_LIST_ZONES = ['hand', 'graveyard', 'exile', 'commandZone'] as const;
type NameListZone = (typeof NAME_LIST_ZONES)[number];
const isNameListZone = (zone: string): zone is NameListZone =>
  (NAME_LIST_ZONES as readonly string[]).includes(zone);

const TOKEN_ZONE = 'miscCards';
const PLUS_ONE_COUNTER_ACTION = /^counter:\+1 \/ \+1=(-?\d+)$/;
const MOVE_ACTION = /^moved (\w+) => (\w+)$/;

function removeFirst<T>(items: T[], matches: (item: T) => boolean): T | null {
  const index = items.findIndex(matches);
  return index < 0 ? null : items.splice(index, 1)[0];
}

/** Takes a card out of a zone of the board. Returns the permanent if it left the battlefield. */
function takeFromZone(
  board: PlayerBoard,
  card: string,
  zone: string,
): BoardPermanent | null {
  if (zone === 'library') board.librarySize -= 1;
  else if (zone === 'battlefield')
    // an untapped one if there is one: the log untaps a permanent before it leaves (see game-log-moves.ts)
    return (
      removeFirst(
        board.battlefield,
        (permanent) => permanent.name === card && !permanent.tapped,
      ) ??
      removeFirst(board.battlefield, (permanent) => permanent.name === card)
    );
  else if (isNameListZone(zone))
    removeFirst(board[zone], (name) => name === card);
  return null;
}

function putIntoZone(
  board: PlayerBoard,
  card: string,
  zone: string,
  isToken: boolean,
): void {
  if (zone === 'library') board.librarySize += 1;
  else if (zone === 'battlefield')
    board.battlefield.push({ name: card, tapped: false, counters: 0, isToken });
  else if (isNameListZone(zone)) board[zone].push(card);
  // anything else (miscCards, opponentsCards): the card is off this player's table
}

/** Applies one line of Archidekt's simple format to a player's board. Lines it does not know change nothing. */
export function applyMove(board: PlayerBoard, move: CardMove): void {
  const { card, action } = move;
  const zoneChange = MOVE_ACTION.exec(action);
  if (zoneChange) {
    const [, fromZone, toZone] = zoneChange;
    const leftBattlefield = takeFromZone(board, card, fromZone);
    const isToken =
      fromZone === TOKEN_ZONE || leftBattlefield?.isToken === true;
    putIntoZone(board, card, toZone, isToken);
    return;
  }
  if (action === 'tapped' || action === 'untapped') {
    const isTapped = action === 'tapped';
    const permanent = board.battlefield.find(
      (other) => other.name === card && other.tapped !== isTapped,
    );
    if (permanent) permanent.tapped = isTapped;
    return;
  }
  const counterChange = PLUS_ONE_COUNTER_ACTION.exec(action);
  if (counterChange) {
    const counters = parseInt(counterChange[1], 10);
    const permanent = board.battlefield.find(
      (other) => other.name === card && other.counters !== counters,
    );
    if (permanent) permanent.counters = counters;
  }
}

/** Every player's board, kept up to date event by event. */
export class TableBoards {
  readonly boards: PlayerBoard[];

  constructor(gameLog: GameLog) {
    this.boards = gameLog.players.map((player) => ({
      hand: [],
      battlefield: [],
      graveyard: [],
      exile: [],
      commandZone: player.commanders.slice(),
      librarySize: player.librarySize,
      life: null,
    }));
  }

  apply(event: GameEvent): void {
    for (const move of event.moves) applyMove(this.boards[move.player], move);
    event.life
      .slice(0, this.boards.length)
      .forEach((life, player) => (this.boards[player].life = life));
  }
}

/** Every player's board after the event with that index (0 = the first event). */
export function boardAt(gameLog: GameLog, eventIndex: number): PlayerBoard[] {
  const table = new TableBoards(gameLog);
  for (const event of gameLog.events.slice(0, eventIndex + 1))
    table.apply(event);
  return table.boards;
}

// ================================================================ as text

/** "Swamp x3 (2 tapped)", "Insect token x2", "Grist, the Hunger Tide +2" */
function describePermanents(permanents: BoardPermanent[]): string {
  const groups = new Map<string, BoardPermanent[]>();
  for (const permanent of permanents) {
    const label =
      permanent.name +
      (permanent.isToken ? ' token' : '') +
      (permanent.counters
        ? ` ${permanent.counters > 0 ? '+' : ''}${permanent.counters}`
        : '');
    const group = groups.get(label);
    if (group) group.push(permanent);
    else groups.set(label, [permanent]);
  }
  return [...groups]
    .map(([label, group]) => {
      const tappedCount = group.filter((permanent) => permanent.tapped).length;
      const count = group.length > 1 ? ` x${group.length}` : '';
      const tapped = !tappedCount
        ? ''
        : group.length > 1
          ? ` (${tappedCount} tapped)`
          : ' (tapped)';
      return label + count + tapped;
    })
    .join(', ');
}

/** A player's board as lines of text. */
export function describeBoard(board: PlayerBoard): string[] {
  const names = (cards: string[]) => (cards.length ? cards.join(', ') : '-');
  const life = board.life === null ? '' : `life ${board.life}, `;
  return [
    `${life}library ${board.librarySize}, hand ${board.hand.length}`,
    `battlefield: ${describePermanents(board.battlefield) || '-'}`,
    `hand: ${names(board.hand)}`,
    `graveyard: ${names(board.graveyard)}`,
    ...(board.exile.length ? [`exile: ${names(board.exile)}`] : []),
    ...(board.commandZone.length
      ? [`command zone: ${names(board.commandZone)}`]
      : []),
  ];
}
