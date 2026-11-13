/**
 * A game log as text for reading. Used by --trace, the files of tagged games and the log viewer.
 *
 *   == Round 3, meren ==   life: aesi 39, samfrodo 38, meren 40, gale 36
 *      play land Exotic Orchard
 *      attack samfrodo with 1 creature: 1 damage (samfrodo 37)
 *   >> gale: counters Victimize with Counterspell
 *
 * A line by another player than the one whose turn it is starts with that player's name. A highlight starts
 * with ">>". A goldfish game looks the same with "== Turn 3 ==" headers.
 */
import { GameEvent, GameLog } from './game-log';
import { TableBoards, describeBoard } from './game-log-board';

export interface GameLogTextOptions {
  /** The first line: what the game was and how it ended. */
  title?: string;
  tags?: string[];
  /** Show the card moves under each line. */
  showMoves?: boolean;
  /** Show the board of the player whose turn it was at the end of each turn. */
  showBoard?: boolean;
}

const PLAIN_LINE_START = '   ';
const HIGHLIGHT_LINE_START = '>> ';
const MOVE_LINE_START = '        ';
const BOARD_FIRST_LINE_START = '   [board] ';
const BOARD_LINE_START = '           ';
const LINES_AROUND_A_HIGHLIGHT = 2;

function isPodGame(gameLog: GameLog): boolean {
  return gameLog.players.length > 1;
}

/** "aesi 39, samfrodo 38" for a pod; "40, opponents 37 40 40" for a goldfish game. */
function describeLife(gameLog: GameLog, life: number[]): string {
  if (isPodGame(gameLog))
    return bySeat(gameLog)
      .map((player) => `${gameLog.players[player].name} ${life[player]}`)
      .join(', ');
  const [ourLife, ...opponentLife] = life;
  return `${ourLife}, opponents ${opponentLife.join(' ')}`;
}

/** The players in the order they play. */
function bySeat(gameLog: GameLog): number[] {
  return gameLog.players
    .map((_, player) => player)
    .sort(
      (first, second) =>
        gameLog.players[first].seat - gameLog.players[second].seat,
    );
}

function turnHeader(gameLog: GameLog, event: GameEvent): string {
  const turnName = isPodGame(gameLog)
    ? `Round ${event.turn}, ${gameLog.players[event.activePlayer].name}`
    : `Turn ${event.turn}`;
  // a real Archidekt log has no life totals
  const life = event.life.length
    ? `   life: ${describeLife(gameLog, event.life)}`
    : '';
  return `== ${turnName} ==${life}`;
}

function eventLine(gameLog: GameLog, event: GameEvent): string {
  const lineStart = event.isHighlight ? HIGHLIGHT_LINE_START : PLAIN_LINE_START;
  // a pod line names its player when it is not that player's turn, and always when a player goes out or wins
  const isNamed =
    isPodGame(gameLog) &&
    (event.player !== event.activePlayer ||
      event.kind === 'out' ||
      event.kind === 'win');
  const actingPlayer = isNamed ? `${gameLog.players[event.player].name}: ` : '';
  return lineStart + actingPlayer + event.text.trimEnd();
}

function moveLines(gameLog: GameLog, event: GameEvent): string[] {
  return event.moves.map((move) => {
    const owner = isPodGame(gameLog)
      ? `${gameLog.players[move.player].name}; `
      : '';
    return `${MOVE_LINE_START}${owner}${move.card}; ${move.action}`;
  });
}

/** The whole game as lines of text. */
export function formatGameLog(
  gameLog: GameLog,
  options: GameLogTextOptions = {},
): string {
  const lines: string[] = [];
  if (options.title) lines.push(options.title);
  if (isPodGame(gameLog))
    lines.push(
      'Seats: ' +
        bySeat(gameLog)
          .map((player, seat) => `${seat + 1} ${gameLog.players[player].name}`)
          .join(', '),
    );
  if (options.tags?.length) lines.push('Tags: ' + options.tags.join(', '));

  const table = new TableBoards(gameLog);
  const boardLines = (player: number) =>
    describeBoard(table.boards[player]).map(
      (line, index) =>
        (index === 0 ? BOARD_FIRST_LINE_START : BOARD_LINE_START) + line,
    );
  let shownTurn = -1;
  let shownActivePlayer = -1;
  for (const event of gameLog.events) {
    if (event.turn !== shownTurn || event.activePlayer !== shownActivePlayer) {
      if (options.showBoard && shownActivePlayer >= 0)
        lines.push(...boardLines(shownActivePlayer));
      lines.push('', turnHeader(gameLog, event));
      shownTurn = event.turn;
      shownActivePlayer = event.activePlayer;
    }
    if (event.text !== '') lines.push(eventLine(gameLog, event));
    if (options.showMoves) lines.push(...moveLines(gameLog, event));
    table.apply(event);
  }
  if (options.showBoard && shownActivePlayer >= 0)
    lines.push(...boardLines(shownActivePlayer));
  return lines.join('\n');
}

/** The highlights of a game with the lines around them: the same game with the other events left out. */
export function highlightsOf(gameLog: GameLog): GameLog {
  const events = gameLog.events.filter((event) => event.text !== '');
  const isKept = events.map(() => false);
  events.forEach((event, index) => {
    if (!event.isHighlight) return;
    const firstKept = Math.max(0, index - LINES_AROUND_A_HIGHLIGHT);
    const lastKept = Math.min(
      events.length - 1,
      index + LINES_AROUND_A_HIGHLIGHT,
    );
    for (let kept = firstKept; kept <= lastKept; kept++) isKept[kept] = true;
  });
  return { ...gameLog, events: events.filter((_, index) => isKept[index]) };
}

/** The events of one player's own game as plain "T3: cast Opt" lines (the log analyzer's replay). */
export function formatPlainLines(events: GameEvent[]): string[] {
  return events
    .filter((event) => event.text !== '' && event.turn > 0)
    .map((event) => `T${event.turn}: ${event.text}`);
}
