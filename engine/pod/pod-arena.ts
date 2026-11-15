/**
 * Builds the Arena: the object that every deck's Game uses to reach the other players of a pod (attack them, ask
 * whether they counter a spell, make them sacrifice...). Each method hands the question to the pod rules.
 */
import { Arena } from '../game/game-types';
import { Game } from '../game/game';
import { fightOpponent } from './pod-combat';
import {
  answerWin,
  attackPreference,
  counterSpell,
  exchangeForStormdrake,
  makeOpponentsSacrifice,
  shouldGoForKill,
  snipeBestTarget,
} from './pod-interaction';
import { PodTable } from './pod-table';

export function buildArena(table: PodTable): Arena {
  // Everything that happens outside the player's own turn goes through runOffTurn, so the other decks' triggers count.
  return {
    real: (game) => table.games.includes(game),
    board: (game, slot) => {
      const opponent =
        table.games[table.opponentsOf[table.playerOf(game)][slot]];
      return opponent.creatures().map((creature) => opponent.power(creature));
    },
    fight: (game, slot, attackers, apply) => {
      const fight = () => fightOpponent(table, game, slot, attackers, apply);
      return apply ? table.runOffTurn(fight) : fight();
    },
    edict: (game, nontokenOnly) =>
      table.runOffTurn(() => makeOpponentsSacrifice(table, game, nontokenOnly)),
    snipe: (game, answer) =>
      table.runOffTurn(() => snipeBestTarget(table, game, answer)),
    answerWin: (game) => table.runOffTurn(() => answerWin(table, game)),
    counter: (game, spell) =>
      table.runOffTurn(() => counterSpell(table, game, spell)),
    announceCast: (game, spell) =>
      table.runOffTurn(() => {
        for (const opponent of table.livingOpponents(table.playerOf(game)))
          table.games[opponent].onOpponentCast(spell, game);
      }),
    prefer: (game, slot) => attackPreference(table, game, slot),
    mustAttack: (_game, creature) => table.mustAttack(creature),
    goaderSlots: (game, creature) =>
      table.goaderSlots(table.playerOf(game), creature),
    goadCreatures: (game, slot) => {
      const goader = table.playerOf(game);
      const opponent = table.opponentsOf[goader][slot];
      for (const creature of table.games[opponent].creatures())
        table.goad(goader, creature);
      table.sayAs(
        goader,
        `goads ${table.playerName(opponent)}'s creatures`,
        'note',
      );
    },
    go: (game) => shouldGoForKill(table, game),
    wheel: (game, cardsInOwnHand) =>
      table.runOffTurn(() =>
        everyOpponentDiscardsAndDraws(table, game, cardsInOwnHand),
      ),
    stormdrakeExchange: (game, stormdrake) =>
      table.runOffTurn(() => exchangeForStormdrake(table, game, stormdrake)),
    eachDraws: (game, cardCount) =>
      table.runOffTurn(() => {
        for (const opponent of table.livingOpponents(table.playerOf(game)))
          table.games[opponent].draw(cardCount);
      }),
  };
}

/** Windfall: each opponent discards its hand and draws as many cards as the biggest hand had (at least ours). */
function everyOpponentDiscardsAndDraws(
  table: PodTable,
  game: Game<unknown>,
  cardsInOwnHand: number,
): number {
  const opponents = table.livingOpponents(table.playerOf(game));
  const cardsToDraw = Math.max(
    cardsInOwnHand,
    ...opponents.map((opponent) => table.games[opponent].hand.length),
  );
  for (const opponent of opponents) {
    const opponentGame = table.games[opponent];
    for (const card of opponentGame.hand.slice()) {
      opponentGame.takeCard(card, 'hand');
      opponentGame.toGraveyard(card);
    }
    opponentGame.draw(cardsToDraw);
  }
  table.sayAs(
    table.playerOf(game),
    `every other player discards its hand and draws ${cardsToDraw}`,
  );
  return cardsToDraw;
}
