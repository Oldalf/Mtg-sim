/**
 * How the lines of a game log are read: who is in it, in what order, and which lines name their player. The text log
 * (engine/game-log-text.ts) and the app's game viewer both follow these rules, so they read the same.
 */
import type { GameEvent, GameLog } from './game-log-types';

/** A pod game has more than one player; a goldfish game and a real Archidekt log have one. */
export function isPodGame(gameLog: GameLog): boolean {
  return gameLog.players.length > 1;
}

/** The players (indexes into GameLog.players) in the order they play. */
export function playersBySeat(gameLog: GameLog): number[] {
  return gameLog.players
    .map((_, player) => player)
    .sort(
      (first, second) =>
        gameLog.players[first].seat - gameLog.players[second].seat,
    );
}

/** A pod line names its player when it is not that player's turn, and always when a player goes out or wins. */
export function namesItsPlayer(gameLog: GameLog, event: GameEvent): boolean {
  return (
    isPodGame(gameLog) &&
    (event.player !== event.activePlayer ||
      event.kind === 'out' ||
      event.kind === 'win')
  );
}

/** Does this event start a new turn (in a pod: a new player's turn) after the event before it? */
export function startsNewTurn(
  event: GameEvent,
  eventBefore: GameEvent | undefined,
): boolean {
  return (
    eventBefore === undefined ||
    event.turn !== eventBefore.turn ||
    event.activePlayer !== eventBefore.activePlayer
  );
}
