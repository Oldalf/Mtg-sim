/**
 * The turn: the opening hand with its mulligans, and one full turn of ours (upkeep, draw, land, the first main phase,
 * combat, the second main phase, the end step). GameCore's setup and takeTurn call these; every step calls the
 * game's own methods, so a deck's hooks (upkeep, combat, endStep, ...) run as before.
 */
import type { GameCore } from './game-core';
import { DEFAULT_MULLIGAN, keepsHand } from './mulligan';
import { formatList } from './log-format';
import { playOpponentsEndStep } from './instant-speed';
import { firstMin } from '../util/lists';

/** Draws the opening hand: one free mulligan (a new 7), then London (draw 7, put cards back), kept by the deck's
 *  mulligan rule (engine/game/mulligan.ts). */
export function drawOpeningHand(game: GameCore): void {
  const rule = game.mulliganRule() ?? DEFAULT_MULLIGAN;
  const sizes = [7, 7, 6, 5];
  for (let attempt = 0; attempt < sizes.length; attempt++) {
    const size = sizes[attempt];
    for (const card of game.hand.slice())
      game.moveCard(card, 'hand', 'library');
    game.shuffle();
    for (const card of game.takeTopCardsOfLibrary(7))
      game.putCard(card, 'hand');
    if (size <= (rule.alwaysKeep ?? 5) || keepsHand(rule, attempt, game.hand)) {
      for (let i = 0; i < 7 - size; i++) {
        const card = firstMin(game.hand, (otherCard) =>
          game.cardValue(otherCard),
        );
        game.moveCard(card, 'hand', 'library');
      }
      return;
    }
  }
}

/** The goldfish opponents' turns between two of ours: each living opponent's upkeep and end step, for a deck's hooks
 *  (Ophiomancer's Snake, sacrifices at instant speed). The opponents do nothing else. A pod plays the real turns. */
export function playGoldfishOpponentsTurns(game: GameCore): void {
  game.isInOpponentsTurn = true;
  const opponentsAlive = game.countOpponentsAlive();
  for (let i = 0; i < opponentsAlive && !game.died; i++) {
    game.opponentUpkeep();
    game.opponentEndStep();
  }
  game.isInOpponentsTurn = false;
}

/** One full turn of ours (see GameCore.takeTurn). Returns true when the game ended in it (a win, or we lost). */
export function playTurn(game: GameCore): boolean {
  game.startTurn();
  game.sayEvent('turn-start');
  game.enterStep('upkeep');
  game.upkeep();
  game.upkeepTriggersOfTheGame();
  game.enterStep('draw');
  if (!(game.turn === 1 && game.onPlay)) game.draw(1);
  game.logCardMovesSoFar();
  game.enterStep('main1');
  game.playLand();
  if (game.developWin()) return true;
  game.logCardMovesSoFar();
  game.enterStep('combat');
  game.combat();
  game.attackWithForcedCreatures();
  game.logCardMovesSoFar();
  if (game.areOpponentsBeaten()) {
    if (game.unprotectedKillTurn === null) game.unprotectedKillTurn = game.turn;
    game.protectedKillTurn = game.turn;
    game.sayEvent('win', 'Opponents beaten in combat');
    return true;
  }
  game.lastKey = null;
  game.enterStep('main2');
  if (game.developWin(true)) return true;
  game.enterStep('end');
  if (game.inArena() && game.config.pod_defence !== false) game.podDefence();
  game.logCardMovesSoFar();
  game.endTurn();
  if (!game.inArena()) playOpponentsEndStep(game);
  if (
    !game.inArena() &&
    game.turn < (game.config.max_turn as number) &&
    !game.areOpponentsBeaten()
  )
    playGoldfishOpponentsTurns(game);
  if (game.turn === 4) {
    // for the card ranking: every card seen by the end of turn 4
    game.seen4 = new Set(
      [...game.hand, ...game.graveyard, ...game.exile].map((card) => card.name),
    );
    for (const permanent of game.battlefield)
      game.seen4.add(permanent.card.name);
  }
  game.sayEvent(
    'turn-end',
    'end: hand',
    formatList(game.hand.map((card) => card.name)),
  );
  return false;
}
