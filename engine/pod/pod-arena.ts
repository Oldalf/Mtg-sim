/**
 * Builds the Arena: the object that every deck's Game uses to reach the other players of a pod (attack them, ask
 * whether they counter a spell, make them sacrifice...). Each method hands the question to the pod rules.
 */
import { Arena } from '../game/game-types';
import { coloursOf } from '../cards/cards';
import { MASSACRE_WURM } from '../game/common-permanents';
import { Game } from '../game/game';
import { fightOpponent } from './pod-combat';
import {
  answerWin,
  attackPreference,
  bounceEveryOpponentsCreatures,
  bounceEveryPermanentOfColour,
  counterSpell,
  creatureCardsInGraveyard,
  creatureCardsOfGraveyard,
  exileCreaturesFromGraveyard,
  takeCreatureCardFromGraveyard,
  fightBestCreature,
  makeOneOpponentDiscard,
  makeOneOpponentSacrifice,
  exchangeForStormdrake,
  goadBestCreature,
  makeDefenderSacrifice,
  makeOpponentsSacrifice,
  creaturesShrinkWouldKill,
  shrinkCreatures,
  shouldGoForKill,
  snipeBestTarget,
  stopBestCreatureAttackingUs,
  weakenBestCreature,
} from './pod-interaction';
import { PodTable } from './pod-table';

export function buildArena(table: PodTable): Arena {
  // Everything that happens outside the player's own turn goes through runOffTurn, so the other decks' triggers count.
  return {
    real: (game) => table.games.includes(game),
    board: (game, slot) => {
      const opponent =
        table.games[table.opponentsOf[table.playerOrCopyOf(game)][slot]];
      return opponent.creatures().map((creature) => opponent.power(creature));
    },
    handSize: (game, slot) =>
      table.games[table.opponentsOf[table.playerOrCopyOf(game)][slot]].hand
        .length,
    tappedLands: (game, slot) =>
      table.games[table.opponentsOf[table.playerOrCopyOf(game)][slot]]
        .landsOnBattlefield()
        .filter((land) => land.tapped).length,
    fight: (game, slot, attackers, apply) => {
      const fight = () => fightOpponent(table, game, slot, attackers, apply);
      return apply ? table.runOffTurn(fight) : fight();
    },
    edict: (game, nontokenOnly) =>
      table.runOffTurn(() => makeOpponentsSacrifice(table, game, nontokenOnly)),
    annihilate: (game, slot, count, sourceName) =>
      table.runOffTurn(() =>
        makeDefenderSacrifice(table, game, slot, count, sourceName),
      ),
    snipe: (game, answer, sourceName, minimumValue = 0) =>
      table.runOffTurn(() =>
        snipeBestTarget(table, game, answer, sourceName, minimumValue),
      ),
    bounceAllCreatures: (game, sourceName) =>
      table.runOffTurn(() =>
        bounceEveryOpponentsCreatures(table, game, sourceName),
      ),
    answerWin: (game) => table.runOffTurn(() => answerWin(table, game)),
    counter: (game, spell) =>
      table.runOffTurn(() => counterSpell(table, game, spell)),
    takeInitiative: (game) => table.takeInitiative(table.playerOf(game)),
    announceCast: (game, spell) =>
      table.runOffTurn(() => {
        for (const opponent of table.livingOpponents(table.playerOf(game)))
          table.games[opponent].onOpponentCast(spell, game);
      }),
    announceDeath: (game, permanent) =>
      table.runOffTurn(() => {
        const dyingPlayer = table.playerOf(game);
        for (const opponent of table.livingOpponents(dyingPlayer)) {
          table.games[opponent].onOtherPlayersCreatureDies(permanent);
          loseLifeToMassacreWurms(table, opponent, dyingPlayer);
        }
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
    goadBestCreature: (game) =>
      table.runOffTurn(() => goadBestCreature(table, game)),
    shrinkCreatures: (game, amount, includeOwn, except, sourceName) =>
      table.runOffTurn(() =>
        shrinkCreatures(table, game, amount, includeOwn, except, sourceName),
      ),
    creaturesShrinkWouldKill: (game, amount) =>
      creaturesShrinkWouldKill(table, game, amount),
    weakenBestCreature: (game, powerLoss) =>
      table.runOffTurn(() => weakenBestCreature(table, game, powerLoss)),
    stopBestCreatureAttackingUs: (game) =>
      table.runOffTurn(() => stopBestCreatureAttackingUs(table, game)),
    forbiddenAttackSlots: (game, creature) =>
      table.forbiddenAttackSlots(table.playerOf(game), creature),
    go: (game) => shouldGoForKill(table, game),
    wheel: (game, cardsInOwnHand) =>
      table.runOffTurn(() =>
        everyOpponentDiscardsAndDraws(table, game, cardsInOwnHand),
      ),
    sacrificeOneOpponentsCreature: (game, slot, sourceName) =>
      table.runOffTurn(() =>
        makeOneOpponentSacrifice(table, game, slot, sourceName),
      ),
    discardOneOpponentsCards: (game, slot, count, sourceName) =>
      table.runOffTurn(() =>
        makeOneOpponentDiscard(table, game, slot, count, sourceName),
      ),
    fightBestCreature: (game, fighter, sourceName) =>
      table.runOffTurn(() =>
        fightBestCreature(table, game, fighter, sourceName),
      ),
    creatureCardsInGraveyard: (game, slot) =>
      creatureCardsInGraveyard(table, game, slot),
    creatureCardsOfGraveyard: (game, slot) =>
      creatureCardsOfGraveyard(table, game, slot),
    takeCreatureCardFromGraveyard: (game, slot, card) =>
      table.runOffTurn(() =>
        takeCreatureCardFromGraveyard(table, game, slot, card),
      ),
    exileCreaturesFromGraveyard: (game, slot, sourceName) =>
      table.runOffTurn(() =>
        exileCreaturesFromGraveyard(table, game, slot, sourceName),
      ),
    countPermanentsOfColour: (game, slot, colour) =>
      table.games[
        table.opponentsOf[table.playerOrCopyOf(game)][slot]
      ].battlefield.filter((permanent) =>
        coloursOf(permanent.card).includes(colour),
      ).length,
    bounceColour: (game, colour, sourceName) =>
      table.runOffTurn(() =>
        bounceEveryPermanentOfColour(table, game, colour, sourceName),
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

/** Massacre Wurm: "Whenever a creature an opponent controls dies, that player loses 2 life." */
function loseLifeToMassacreWurms(
  table: PodTable,
  wurmPlayer: number,
  dyingPlayer: number,
): void {
  const wurmGame = table.games[wurmPlayer];
  const wurms = wurmGame.countOnBattlefield(MASSACRE_WURM);
  if (!wurms) return;
  const slot = table.opponentsOf[wurmPlayer].indexOf(dyingPlayer);
  wurmGame.damageOpponent(slot, 2 * wurms);
  table.sayAs(
    wurmPlayer,
    `Massacre Wurm: ${table.playerName(dyingPlayer)} loses ${2 * wurms}`,
    'note',
    [MASSACRE_WURM],
  );
}
