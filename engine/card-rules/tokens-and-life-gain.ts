/**
 * Tokens, Food and life gain: the cards that add to or replace the tokens we create, trigger on creating, sacrificing
 * (a Food above all) and gaining life, and the creatures that make Food, Treasure or Servos as they enter. Which
 * creature gets a counter, which token to sacrifice or create and whether to pay to draw are the deck's choices
 * (GameCore.creatureForCounter, tokenToSacrificeFor, chooseTokenToCreate, paysToDraw).
 */
import { Cost } from '../cards/cards';
import type { CardDef } from '../cards/cards';
import {
  CAT,
  CLUE,
  FOOD,
  GREAT_BIRD,
  HALFLING,
  LIFELINK_SOLDIER,
  SERVO,
  TREASURE,
} from '../cards/tokens';
import type { Answer } from '../game/answers';
import type { GameCore } from '../game/game-core';
import type { Permanent } from '../game/game-types';
import { fetchLand } from '../game/land-search';
import type { CardRules } from './card-rules';

/** Shire Shirriff's "exile target creature an opponent controls", as the pod's removal. */
const EXILE_CREATURE: Answer = {
  kind: 'removal',
  instant: false,
  hits: ['creature'],
  how: 'exile',
};

/** The tokens Academy Manufactor turns into one of each. */
const FOOD_CLUE_AND_TREASURE = [FOOD, CLUE, TREASURE];

/** Of Herbs and Stewed Rabbit's chapters (its lore counters are its counters). */
const SAGA_LAST_CHAPTER = 3;

export const TOKENS_AND_LIFE_GAIN: CardRules[] = [
  // ---------------------------------------------------------------- creating tokens
  {
    names: ['Peregrin Took'],
    extraTokensWhenWeCreate() {
      return [FOOD];
    },
  },
  {
    names: ['Tippy-Toe, Terrific Partner'],
    // (as Peregrin Took: one more Food each time we create tokens)
    extraTokensWhenWeCreate() {
      return [FOOD];
    },
    onEndStep(game) {
      if (game.lifeGainedThisTurn > 0) game.draw(1);
    },
  },
  {
    names: ['Academy Manufactor'],
    replacesTokenWeCreate(_game, _permanent, token) {
      return FOOD_CLUE_AND_TREASURE.includes(token)
        ? FOOD_CLUE_AND_TREASURE
        : null;
    },
  },
  {
    names: ['Mirkwood Bats'],
    onWeCreateToken(game) {
      game.drainEach(1);
    },
    onWeSacrifice(game, _permanent, sacrificed) {
      if (sacrificed.token) game.drainEach(1);
    },
  },
  {
    names: ['Rosie Cotton of South Lane'],
    onEnter(game) {
      game.createTokens(FOOD);
    },
    onWeCreateToken(game, permanent) {
      const creature = game.creatureForCounter(permanent);
      if (creature) game.addCounters(creature, 1);
    },
  },
  {
    names: ['Second Harvest'],
    resolve(game) {
      game.createTokenGroup(
        game.battlefield
          .filter((permanent) => permanent.token)
          .map((permanent) => permanent.card),
      );
    },
  },
  // ---------------------------------------------------------------- gaining life
  {
    names: ['Cat Collector'],
    // CHECK WHEN ANOTHER DECK PLAYS IT: "the first time during each of your turns": also the first time since our
    // turn began, on another player's turn.
    onEnter(game) {
      game.createTokens(FOOD);
    },
    onWeGainLife(game, permanent, amount) {
      if (
        game.lifeGainedThisTurn === amount &&
        game.battlefield.includes(permanent)
      )
        game.createTokens(CAT);
    },
  },
  {
    names: ['Sanguine Bond'],
    onWeGainLife(game, _permanent, amount) {
      game.targetOpponentLosesLife(amount);
    },
  },
  {
    names: ['Prize Pig'],
    // its ribbon counters (Permanent.otherCounters)
    onWeGainLife(_game, permanent, amount) {
      permanent.otherCounters = (permanent.otherCounters ?? 0) + amount;
      if (permanent.otherCounters >= 3) {
        permanent.otherCounters = 0;
        permanent.tapped = false;
      }
    },
  },
  {
    names: ['Dawn of Hope'],
    onWeGainLife(game, permanent) {
      if (game.paysToDraw(permanent.card.name) && game.pay(new Cost(2))) {
        game.say('Dawn of Hope: pay 2, draw');
        game.draw(1);
      }
    },
  },
  {
    names: ['Well of Lost Dreams'],
    onWeGainLife(game, permanent, amount) {
      if (!game.paysToDraw(permanent.card.name)) return;
      let payableAmount = 0;
      while (payableAmount < amount && game.canPay(new Cost(payableAmount + 1)))
        payableAmount++;
      if (payableAmount > 0 && game.pay(new Cost(payableAmount))) {
        game.say(`Well of Lost Dreams: draw ${payableAmount}`);
        game.draw(payableAmount);
      }
    },
  },
  {
    names: ['Cauldron Familiar'],
    // (its return from the graveyard, sacrificing a Food, is the deck's)
    onEnter(game) {
      game.drainEach(1);
      game.gainLife(1);
    },
  },
  {
    names: ['Prosperous Innkeeper'],
    onEnter(game) {
      game.createTokens(TREASURE);
    },
    onAnotherOfOursEnters(game, _permanent, entered) {
      if (entered.card.isCreature) game.gainLife(1);
    },
  },
  {
    names: ['The Gaffer'],
    onEndStep(game) {
      if (game.lifeGainedThisTurn >= 3) game.draw(1);
    },
  },
  {
    names: ['Gwaihir, Greatest of the Eagles'],
    onEndStep(game) {
      if (game.lifeGainedThisTurn >= 3) game.createTokens(GREAT_BIRD);
    },
  },
  // ---------------------------------------------------------------- sacrificing, Food
  {
    names: ['Popular Egotist'],
    onWeSacrifice(game) {
      game.targetOpponentLosesLife(1);
      game.gainLife(1);
    },
  },
  {
    names: ['Nuka-Cola Vending Machine'],
    onWeSacrificeFood(game) {
      game.createTokens(TREASURE, 1, { tapped: true });
    },
  },
  {
    names: ['Rapacious Guest'],
    onWeSacrificeFood(game, permanent) {
      game.addCounters(permanent, 1);
    },
    onDies(game, permanent) {
      game.targetOpponentLosesLife(game.power(permanent));
    },
  },
  {
    names: ['Unlucky Cabbage Merchant'],
    onEnter(game) {
      game.createTokens(FOOD);
    },
    onWeSacrificeFood(game, permanent) {
      if (
        !game.wantsLandFor(permanent.card.name) ||
        !game.battlefield.includes(permanent)
      )
        return;
      if (fetchLand(game, 'basic', true)) {
        game.takeFromBattlefieldIfThere(permanent);
        game.putCard(permanent.card, 'library');
      }
    },
  },
  {
    names: ['Elanor Gardner'],
    onEnter(game) {
      game.createTokens(FOOD);
    },
    onEndStep(game) {
      if (game.foodsSacrificedThisTurn > 0) fetchLand(game, 'basic', true);
    },
  },
  {
    names: ['Gilded Goose'],
    // (its mana, eating a Food, is the deck's)
    onEnter(game) {
      game.createTokens(FOOD);
    },
  },
  {
    names: ['Of Herbs and Stewed Rabbit'],
    // CHECK WHEN ANOTHER DECK PLAYS IT: its next chapter comes at our upkeep (the card: after the draw step).
    onEnter(game, permanent) {
      permanent.counters = 1;
      const creature = game.creatureForCounter();
      if (creature) game.addCounters(creature, 1);
      game.createTokens(FOOD);
    },
    onUpkeep(game, permanent) {
      permanent.counters += 1;
      if (permanent.counters === 2) {
        game.draw(1);
        game.createTokens(FOOD);
      } else if (permanent.counters >= SAGA_LAST_CHAPTER) {
        const foods = game.battlefield.filter(
          (other) => other.card === FOOD,
        ).length;
        game.createTokenGroup(new Array(foods).fill(HALFLING));
        game.sacrifice(permanent);
      }
    },
  },
  // ---------------------------------------------------------------- creatures entering
  {
    names: ['Merry, Warden of Isengard'],
    onEnter(game, permanent) {
      tutorPartner(game, permanent, 'Pippin, Warden of Isengard');
    },
    onAnotherOfOursEnters(game, permanent, entered) {
      if (
        entered.card.types.has('artifact') &&
        game.useOnceEachTurn(permanent.card.name)
      )
        game.createTokens(LIFELINK_SOLDIER);
    },
  },
  {
    names: ['Pippin, Warden of Isengard'],
    onEnter(game, permanent) {
      tutorPartner(game, permanent, 'Merry, Warden of Isengard');
    },
  },
  {
    names: ['Belladonna Took'],
    // CHECK WHEN ANOTHER DECK PLAYS IT: the modes come in a fixed order (life, a card, counters), one each turn.
    onAnotherOfOursEnters(game, _permanent, entered) {
      if (!entered.token) return;
      if (game.useOnceEachTurn('Belladonna Took: life')) game.gainLife(1);
      else if (game.useOnceEachTurn('Belladonna Took: draw')) game.draw(1);
      else if (game.useOnceEachTurn('Belladonna Took: counters'))
        for (const creature of game.creatures()) game.addCounters(creature, 1);
    },
  },
  {
    names: ['Mentor of the Meek'],
    onAnotherOfOursEnters(game, permanent, entered) {
      if (
        entered.card.isCreature &&
        game.power(entered) <= 2 &&
        game.paysToDraw(permanent.card.name) &&
        game.pay(new Cost(1))
      )
        game.draw(1);
    },
  },
  {
    names: ['Marionette Apprentice'],
    // CHECK WHEN ANOTHER DECK PLAYS IT: fabricate 1 is always a Servo (the deck doesn't choose).
    onEnter(game) {
      game.createTokens(SERVO);
    },
    onOurPermanentDies(game, permanent, dead) {
      if (dead !== permanent && isArtifactOrCreature(dead.card))
        game.drainEach(1);
    },
  },
  {
    names: ['Marionette Master'],
    // CHECK WHEN ANOTHER DECK PLAYS IT: fabricate 3 is always the counters (the deck doesn't choose).
    onEnter(game, permanent) {
      game.addCounters(permanent, 3);
    },
    onOurPermanentDies(game, permanent, dead) {
      if (dead.card.types.has('artifact'))
        game.targetOpponentLosesLife(game.power(permanent));
    },
  },
  {
    names: ['Agent of the Iron Throne'],
    // each of our commanders on the battlefield has the drain
    onOurPermanentDies(game, _permanent, dead) {
      if (!isArtifactOrCreature(dead.card)) return;
      const commanders = game.battlefield.filter((permanent) =>
        game.commanderNames.includes(permanent.card.name),
      ).length;
      if (commanders > 0) game.drainEach(commanders);
    },
  },
  {
    names: ['The Notary Hobbits'],
    onEnter(game, permanent) {
      if (!permanent.token)
        game.createTokenGroup([permanent.card, permanent.card]);
    },
  },
  {
    names: ['Shire Shirriff'],
    // (the exiled creature stays exiled when it leaves)
    onEnter(game, permanent) {
      const token = game.tokenToSacrificeFor(permanent.card.name);
      if (!token) return;
      game.sacrifice(token);
      game.podSnipe(EXILE_CREATURE, permanent.card.name);
    },
  },
];

function isArtifactOrCreature(card: CardDef): boolean {
  return card.isCreature || card.types.has('artifact');
}

/** Partner with: the partner comes from the library to hand (a token doesn't fetch it). */
function tutorPartner(
  game: GameCore,
  permanent: Permanent,
  partnerName: string,
): void {
  if (permanent.token) return;
  const card = game.library.find((candidate) => candidate.name === partnerName);
  if (!card) return;
  game.takeCardIfThere(card, 'library');
  game.shuffle();
  game.putCard(card, 'hand');
  game.say('partner: tutor', card);
}
