/**
 * Cards that care about our creatures dying: drains, counters, Treasures and Spawn. Which opponent a drain or a ping
 * targets is the game's choice (chooseTargetOpponent); which card Carmen returns is the deck's (battlefieldValue).
 */
import * as C from '../cards/cards';
import { ELDRAZI_SPAWN, LIFELINK_VAMPIRE, TREASURE } from '../cards/tokens';
import type { GameCore } from '../game/game-core';
import type { Permanent } from '../game/game-types';
import { firstMax } from '../util/lists';
import type { CardRules } from './card-rules';

export const ARISTOCRATS: CardRules[] = [
  {
    names: ['Morbid Opportunist'],
    onOurPermanentDies(game, permanent, dead) {
      if (dead !== permanent && dead.card.isCreature)
        drawOnceEachTurn(game, permanent);
    },
    onOtherPlayersCreatureDies(game, permanent) {
      drawOnceEachTurn(game, permanent);
    },
  },
  {
    names: ['Syr Konrad, the Grim'],
    // CHECK WHEN ANOTHER DECK PLAYS IT: creature cards put into another player's graveyard from anywhere but the
    // battlefield (their mills and discards) are not seen.
    onOurPermanentDies(game, permanent, dead) {
      if (dead !== permanent && dead.card.isCreature)
        game.dealDamageToEachOpponent(1);
    },
    onOtherPlayersCreatureDies(game) {
      game.dealDamageToEachOpponent(1);
    },
    onCreatureCardToOurGraveyard(game) {
      game.dealDamageToEachOpponent(1);
    },
    onCreatureCardLeavesOurGraveyard(game) {
      game.dealDamageToEachOpponent(1);
    },
  },
  {
    names: ['Spinner of Souls'],
    onOurPermanentDies(game, permanent, dead) {
      // another nontoken creature of ours died: the first creature card from the top to our hand
      if (!isAnotherCreature(permanent, dead) || dead.token) return;
      const creature = game.revealUntilCreature();
      if (creature) game.putCard(creature, 'hand');
    },
  },
  {
    names: ['Dictate of Erebos'],
    onOurPermanentDies(game, permanent, dead) {
      if (isAnotherCreature(permanent, dead)) game.podEdict(false);
    },
  },
  {
    names: ['Sangromancer'],
    // CHECK WHEN ANOTHER DECK PLAYS IT: its life for an opponent's discard is not modelled.
    onOtherPlayersCreatureDies(game) {
      game.gainLife(3);
    },
  },
  {
    names: ['Harvester of Souls'],
    // CHECK WHEN ANOTHER DECK PLAYS IT: only our creatures dying count (the card: any player's).
    onOurPermanentDies(game, permanent, dead) {
      if (isAnotherCreature(permanent, dead) && !dead.token) game.draw(1);
    },
  },
  {
    names: ['Ob Nixilis, Unshackled', 'Venomcrawler'],
    // CHECK WHEN ANOTHER DECK PLAYS IT: only our creatures dying count (the cards: any player's); Ob Nixilis's
    // punishment for an opponent's search is not modelled.
    onOurPermanentDies(game, permanent, dead) {
      if (isAnotherCreature(permanent, dead)) game.addCounters(permanent, 1);
    },
  },
  {
    names: ["Taborax, Hope's Demise"],
    // CHECK WHEN ANOTHER DECK PLAYS IT: its lifelink at five counters and the draw for a Cleric are not modelled.
    onOurPermanentDies(game, permanent, dead) {
      if (isAnotherCreature(permanent, dead) && !dead.token)
        game.addCounters(permanent, 1);
    },
  },
  {
    names: ['Blood Artist'],
    // CHECK WHEN ANOTHER DECK PLAYS IT: its drain counts only our creatures dying, not other players' (a pod)
    onOurPermanentDies(game, _permanent, dead) {
      if (dead.card.isCreature) game.drainOne(1);
    },
  },
  {
    names: ['Vengeful Bloodwitch'],
    onOurPermanentDies(game, _permanent, dead) {
      if (dead.card.isCreature) game.drainOne(1);
    },
  },
  {
    // "Whenever this or another creature or artifact you control dies, target opponent loses 1 life and you gain 1."
    names: ['Susurian Voidborn'],
    onOurPermanentDies(game, _permanent, dead) {
      if (dead.card.isCreature || dead.card.types.has('artifact'))
        game.drainOne(1);
    },
  },
  {
    names: ['Cruel Celebrant'],
    // CHECK WHEN ANOTHER DECK PLAYS IT: our planeswalkers dying don't count
    onOurPermanentDies(game, _permanent, dead) {
      if (dead.card.isCreature) game.drainAllOpponents(1);
    },
  },
  {
    names: ['Cordial Vampire'],
    // CHECK WHEN ANOTHER DECK PLAYS IT: counts only our creatures dying, not other players' (a pod)
    onOurPermanentDies(game, _permanent, dead) {
      if (dead.card.isCreature) addCounterToEachVampire(game);
    },
  },
  {
    names: ['Elenda, the Dusk Rose'],
    // CHECK WHEN ANOTHER DECK PLAYS IT: her counters count only our creatures dying, not other players' (a pod)
    onOurPermanentDies(_game, permanent, dead) {
      if (permanent !== dead && dead.card.isCreature) permanent.counters += 1;
    },
    onDies(game, permanent) {
      game.createTokens(LIFELINK_VAMPIRE, game.power(permanent));
    },
  },
  {
    names: ['Pitiless Plunderer'],
    onOurPermanentDies(game, permanent, dead) {
      if (permanent !== dead && dead.card.isCreature)
        game.createTokens(TREASURE);
    },
  },
  {
    names: ['Pawn of Ulamog'],
    onOurPermanentDies(game, _permanent, dead) {
      if (dead.card.isCreature && !dead.token) game.createTokens(ELDRAZI_SPAWN);
    },
  },
  {
    names: ['Carmen, Cruel Skymarcher'],
    // CHECK WHEN ANOTHER DECK PLAYS IT: counts only our sacrifices, not other players' (a pod); her attack picks by battlefieldValue
    onOurPermanentDies(game, permanent, dead) {
      if (game.isSacrificing && permanent !== dead) {
        permanent.counters += 1;
        game.gainLife(1);
      }
    },
    onAttacks(game, permanent) {
      // return a permanent card with mana value up to her power from the graveyard to the battlefield
      const power = game.power(permanent);
      const options = game.graveyard.filter(
        (card) =>
          card.land === null &&
          !card.isInstantOrSorcery &&
          card.manaValue <= power,
      );
      if (!options.length) return;
      const best = firstMax(options, (card) => game.battlefieldValue(card));
      game.takeCardIfThere(best, 'graveyard');
      game.enter(best, 'graveyard');
      game.say('  Carmen returns', best);
    },
  },
  {
    names: ['Butcher of Malakir'],
    onOurPermanentDies(game, _permanent, dead) {
      // each opponent sacrifices a creature (a pod: a goldfish opponent has none)
      if (dead.card.isCreature) game.podEdict(false);
    },
  },
  {
    names: ['Meren of Clan Nel Toth'],
    onOurPermanentDies(game, permanent, dead) {
      if (permanent !== dead && dead.card.isCreature) game.gainExperience();
    },
    // which card is the deck's choice (creatureCardForMerenToReturn)
    onEndStep(game) {
      const creature = game.creatureCardForMerenToReturn();
      if (!creature) return;
      if (creature.manaValue <= game.experienceCounters) {
        game.say(
          `Meren (${game.experienceCounters} experience) returns`,
          creature,
        );
        game.reanimate(creature);
      } else {
        game.say(
          `Meren (${game.experienceCounters} experience) returns to hand`,
          creature,
        );
        game.takeCard(creature, 'graveyard');
        game.putCard(creature, 'hand');
      }
    },
  },
  {
    names: ['Grim Haruspex'],
    onOurPermanentDies(game, permanent, dead) {
      if (permanent !== dead && dead.card.isCreature && !dead.token)
        game.draw(1, 'Grim Haruspex');
    },
  },
  {
    names: ['Zulaport Cutthroat'],
    onOurPermanentDies(game, _permanent, dead) {
      if (dead.card.isCreature) game.drainAllOpponents(1);
    },
  },
  {
    names: ['Mayhem Devil'],
    // CHECK WHEN ANOTHER DECK PLAYS IT: counts only our sacrifices, not other players'; it always pings the opponent closest to dead
    onOurPermanentDies(game) {
      // "whenever a player sacrifices a permanent": 1 damage to the opponent closest to dead
      if (!game.isSacrificing) return;
      const target = game.chooseTargetOpponent();
      if (target !== null) game.damageOpponent(target, 1);
    },
  },
];

/** Put a +1/+1 counter on each Vampire we control. */
export function addCounterToEachVampire(game: GameCore): void {
  for (const vampire of vampiresOf(game)) vampire.counters += 1;
}

function vampiresOf(game: GameCore): Permanent[] {
  return game
    .creatures()
    .filter((permanent) => C.hasCreatureType(permanent.card, 'Vampire'));
}

/** "Whenever another creature dies": the dead one is a creature and not this permanent. */
function isAnotherCreature(permanent: Permanent, dead: Permanent): boolean {
  return dead !== permanent && dead.card.isCreature;
}

/** "Draw a card; this ability triggers only once each turn" (Morbid Opportunist). */
function drawOnceEachTurn(game: GameCore, permanent: Permanent): void {
  if (game.useOnceEachTurn(permanent.card.name))
    game.draw(1, permanent.card.name);
}
