/**
 * The table at any point of a logged game, rebuilt from the card moves (the board itself is never stored).
 * Cards are names only, so this works for a simulated game and for a real Archidekt log alike. A simulated game
 * also gives a creature token's face (CardMove.token), so tokens with the same name and other stats stay apart.
 *
 *   boardAt(gameLog, eventIndex)   every player's board after that event
 *   TableBoards                    the same, stepping through the events one by one
 */
import {
  PLAYER_COUNTER_KINDS,
  type CardMove,
  type GameEvent,
  type GameLog,
  type PlayerCounters,
  type TokenFace,
} from './game-log-types';

export interface BoardPermanent {
  name: string;
  tapped: boolean;
  /** +1/+1 counters. */
  counters: number;
  isToken: boolean;
  /** A creature token's face, when the log gives one (see CardMove.token). */
  token?: TokenFace;
}

/** "2/2 black flying", "1/1 blue flying x999". */
export function describeTokenFace(face: TokenFace): string {
  return [
    `${face.power}/${face.toughness}`,
    ...face.colours,
    ...face.keywords,
    ...(face.copies ? [`x${face.copies}`] : []),
  ].join(' ');
}

/** A card as the log knows it: "Swamp", or a token with its face, "Vampire (2/2 black flying)". */
export function describeLoggedCard(name: string, face?: TokenFace): string {
  return face ? `${name} (${describeTokenFace(face)})` : name;
}

/** Is this permanent the one a line is about? A line with a face wants the same face; a line without one (a real
 *  log, an older log) goes by the name only. */
function isPermanentOfMove(permanent: BoardPermanent, move: CardMove): boolean {
  if (permanent.name !== move.card) return false;
  if (!move.token) return true;
  return (
    !!permanent.token &&
    describeTokenFace(permanent.token) === describeTokenFace(move.token)
  );
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
  /** Energy, experience and poison: only the kinds above 0 (a real Archidekt log has none). */
  playerCounters: PlayerCounters;
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
  move: CardMove,
  zone: string,
): BoardPermanent | null {
  if (zone === 'library') board.librarySize -= 1;
  else if (zone === 'battlefield')
    // an untapped one if there is one: the log untaps a permanent before it leaves (see game-log-moves.ts)
    return (
      removeFirst(
        board.battlefield,
        (permanent) => isPermanentOfMove(permanent, move) && !permanent.tapped,
      ) ??
      removeFirst(board.battlefield, (permanent) =>
        isPermanentOfMove(permanent, move),
      )
    );
  else if (isNameListZone(zone))
    removeFirst(board[zone], (name) => name === move.card);
  return null;
}

function putIntoZone(
  board: PlayerBoard,
  move: CardMove,
  zone: string,
  isToken: boolean,
): void {
  if (zone === 'library') board.librarySize += 1;
  else if (zone === 'battlefield')
    board.battlefield.push({
      name: move.card,
      tapped: false,
      counters: 0,
      isToken,
      ...(move.token ? { token: move.token } : {}),
    });
  else if (isNameListZone(zone)) board[zone].push(move.card);
  // anything else (miscCards, opponentsCards): the card is off this player's table
}

/** Applies one line of Archidekt's simple format to a player's board. Lines it does not know change nothing. */
export function applyMove(board: PlayerBoard, move: CardMove): void {
  const { action } = move;
  const zoneChange = MOVE_ACTION.exec(action);
  if (zoneChange) {
    const [, fromZone, toZone] = zoneChange;
    const leftBattlefield = takeFromZone(board, move, fromZone);
    const isToken =
      fromZone === TOKEN_ZONE || leftBattlefield?.isToken === true;
    putIntoZone(board, move, toZone, isToken);
    return;
  }
  if (action === 'tapped' || action === 'untapped') {
    const isTapped = action === 'tapped';
    const permanent = board.battlefield.find(
      (other) => isPermanentOfMove(other, move) && other.tapped !== isTapped,
    );
    if (permanent) permanent.tapped = isTapped;
    return;
  }
  const counterChange = PLUS_ONE_COUNTER_ACTION.exec(action);
  if (counterChange) {
    const counters = parseInt(counterChange[1], 10);
    const permanent = board.battlefield.find(
      (other) => isPermanentOfMove(other, move) && other.counters !== counters,
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
      playerCounters: {},
    }));
  }

  apply(event: GameEvent): void {
    for (const move of event.moves) applyMove(this.boards[move.player], move);
    event.life
      .slice(0, this.boards.length)
      .forEach((life, player) => (this.boards[player].life = life));
    // every event carries all the counters, and none when they are all 0
    this.boards.forEach(
      (board, player) =>
        (board.playerCounters = { ...event.playerCounters?.[player] }),
    );
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

/** "Swamp x3 (2 tapped)", "Insect token x2", "Vampire 2/2 black flying token", "Grist, the Hunger Tide +2" */
function describePermanents(permanents: BoardPermanent[]): string {
  const groups = new Map<string, BoardPermanent[]>();
  for (const permanent of permanents) {
    const label =
      permanent.name +
      (permanent.token ? ` ${describeTokenFace(permanent.token)}` : '') +
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

/** "energy 4, poison 2": the kinds above 0, empty when there are none. */
export function describePlayerCounters(counters: PlayerCounters): string {
  return PLAYER_COUNTER_KINDS.filter((kind) => counters[kind])
    .map((kind) => `${kind} ${counters[kind]}`)
    .join(', ');
}

/** A player's board as lines of text. */
export function describeBoard(board: PlayerBoard): string[] {
  const names = (cards: string[]) => (cards.length ? cards.join(', ') : '-');
  const life = board.life === null ? '' : `life ${board.life}, `;
  const counters = describePlayerCounters(board.playerCounters);
  return [
    `${life}${counters ? counters + ', ' : ''}library ${board.librarySize}, hand ${board.hand.length}`,
    `battlefield: ${describePermanents(board.battlefield) || '-'}`,
    `hand: ${names(board.hand)}`,
    `graveyard: ${names(board.graveyard)}`,
    ...(board.exile.length ? [`exile: ${names(board.exile)}`] : []),
    ...(board.commandZone.length
      ? [`command zone: ${names(board.commandZone)}`]
      : []),
  ];
}
