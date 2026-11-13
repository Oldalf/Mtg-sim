/**
 * Archidekt's simple log format and the game log:
 *   readArchidektLog   a real game (decks/<name>/logs/*.txt) as a GameLog, so the viewer can show it like a simulated one
 *   archidektLines     the card moves of one player of a logged game as Archidekt lines ("T3; Swamp; tapped"),
 *                      which `--analyze` can read
 */
import * as path from 'path';
import { GameEvent, GameLog, buildEvent } from './game-log';
import { parseLog } from './log-board';

const CARDS_IN_A_DECK = 100;
const FROM_COMMAND_ZONE = /^moved commandZone => /;

/** "moved hand => battlefield" reads better as "hand => battlefield". */
const describeAction = (action: string) => action.replace(/^moved /, '');

/** A real Archidekt log as a game log with one player: one event per line of the file. It has no life totals. */
export function readArchidektLog(file: string): GameLog {
  const lines = parseLog(file);
  const commanders = [
    ...new Set(
      lines
        .filter(([, , action]) => FROM_COMMAND_ZONE.test(action))
        .map(([, card]) => card),
    ),
  ];
  const events: GameEvent[] = lines.map(([turn, card, action]) => {
    const event = buildEvent(
      'note',
      turn,
      `${card}: ${describeAction(action)}`,
      [card],
      [],
    );
    event.moves = [{ player: 0, card, action }];
    return event;
  });
  const name = path.basename(file, path.extname(file));
  return {
    seed: 0,
    players: [
      {
        name,
        deckName: '',
        commanders,
        seat: 0,
        librarySize: CARDS_IN_A_DECK - commanders.length,
      },
    ],
    events,
  };
}

/** The card moves of one player as lines of an Archidekt log. What happened before the first turn (the opening
 *  hand and mulligans) is turn 0, as in a real log. */
export function archidektLines(gameLog: GameLog, player: number): string[] {
  const lines: string[] = [];
  let isBeforeFirstTurn = true;
  for (const event of gameLog.events) {
    const turn = isBeforeFirstTurn ? 0 : event.turn;
    for (const move of event.moves)
      if (move.player === player)
        lines.push(`T${turn}; ${move.card}; ${move.action}`);
    // the first event of a player's game is the start of its first turn: it carries the opening hand
    if (event.player === player) isBeforeFirstTurn = false;
  }
  return lines;
}
