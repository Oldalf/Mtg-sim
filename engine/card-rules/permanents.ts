/**
 * Permanents: what they do when they enter, die or at our upkeep. Which card to take (a land, a card from the
 * graveyard) is the deck's choice (chooseLandToFetch, returnToHandValue).
 */
import * as C from '../cards/cards';
import type { CardDef } from '../cards/cards';
import { GOAT, LIFELINK_VAMPIRE, ZOMBIE } from '../cards/tokens';
import { SHRIEKMAW } from '../game/answers';
import type { GameCore } from '../game/game-core';
import { corpseAugurDies, CORPSE_AUGUR } from '../game/card-draw';
import { fetchLand } from '../game/land-search';
import { firstMax } from '../util/lists';
import type { CardRules } from './card-rules';

export const MASSACRE_WURM = 'Massacre Wurm';

export const PERMANENTS: CardRules[] = [
  {
    names: ['Solemn Simulacrum'],
    onEnter(game) {
      fetchLand(game, 'basic', true);
    },
    onDies(game, permanent) {
      game.draw(1, permanent.card.name);
    },
  },
  {
    names: ['Simulacrum Shaper'],
    onEnter(game) {
      fetchLand(game, 'basic', true);
    },
    onDies(game, permanent) {
      game.draw(1, permanent.card.name);
    },
  },
  {
    names: ['Scion of Halaster'],
    // Our commander creatures have: the first draw each turn looks at the top two, any number go to the graveyard.
    // CHECK WHEN ANOTHER DECK PLAYS IT: exactly one of the two goes to the graveyard (the lower discardValue).
    beforeFirstDrawEachTurn(game) {
      const hasCommanderCreatureOut = game.battlefield.some(
        (permanent) =>
          permanent.card.isCreature &&
          game.commanderNames.includes(permanent.card.name),
      );
      if (!hasCommanderCreatureOut || game.library.length < 2) return;
      const [topCard, secondCard] = game.library;
      const worse =
        game.discardValue(topCard) < game.discardValue(secondCard)
          ? topCard
          : secondCard;
      const keep = worse === topCard ? secondCard : topCard;
      game.takeTopCardsOfLibrary(2);
      game.putCardsOnTopOfLibrary([keep]);
      game.toGraveyard(worse);
      game.say(`Scion: ${worse.name} -> graveyard`);
    },
  },
  {
    names: ['Wood Elves'],
    onEnter(game) {
      fetchLand(game, 'forest', false);
    },
  },
  {
    names: ['Eternal Witness', 'Timeless Witness'],
    onEnter(game) {
      returnBestCardToHand(game);
    },
  },
  {
    names: [MASSACRE_WURM],
    onEnter(game) {
      // creatures your opponents control get -2/-2 until end of turn (its drain: engine/pod/pod-arena.ts)
      game.podShrinkCreatures(2, false, null, MASSACRE_WURM);
    },
  },
  {
    names: ['Mnemonic Wall'],
    onEnter(game) {
      returnBestCardToHand(game, (card) => card.isInstantOrSorcery);
    },
  },
  {
    // "When this creature enters, draw a card." (Baleful Strix draws in GameCore.enter)
    names: [
      'Wall of Omens',
      'Spirited Companion',
      'Helpful Hunter',
      'Elvish Visionary',
    ],
    onEnter(game, permanent) {
      game.draw(1, permanent.card.name);
    },
  },
  {
    names: [CORPSE_AUGUR],
    onDies(game, permanent) {
      corpseAugurDies(game, permanent);
    },
  },
  {
    names: ['Welcoming Vampire'],
    onAnotherOfOursEnters(game, _permanent, entered) {
      // another creature with power 2 or less enters: draw a card (once each turn)
      if (!entered.card.isCreature || game.power(entered) > 2) return;
      if (game.useOnceEachTurn('Welcoming Vampire')) game.draw(1);
    },
  },
  {
    names: ['Baron Bertram Graywater'],
    onAnotherOfOursEnters(game, _permanent, entered) {
      // tokens enter: create a 1/1 lifelink Vampire (once each turn)
      if (!entered.token) return;
      if (game.useOnceEachTurn('Baron Bertram Graywater'))
        game.createTokens(LIFELINK_VAMPIRE);
    },
  },
  {
    names: ['Haru-Onna'],
    onEnter(game) {
      game.draw(1);
    },
  },
  {
    names: ['Gas Guzzler'],
    onEnter(_game, permanent) {
      permanent.tapped = true;
    },
  },
  {
    names: ['Forerunner of the Legion'],
    onEnter(game) {
      game.doTutor(
        (card) => C.hasCreatureType(card, 'Vampire') && card.land === null,
        true,
      );
    },
  },
  {
    names: ["Garruk's Packleader"],
    onAnotherOfOursEnters(game, _permanent, entered) {
      if (entered.card.isCreature && game.power(entered) >= 3)
        game.draw(1, "Garruk's Packleader");
    },
  },
  {
    names: ['Grim Servant'],
    onEnter(game) {
      // a card with mana value up to our devotion to black to hand; we lose 3 life
      const devotion = game.devotion('B');
      game.doTutor((card) => card.manaValue <= devotion, false);
      game.loseLife(3);
    },
  },
  {
    names: ['Woe Strider'],
    onEnter(game) {
      game.createTokens(GOAT);
    },
  },
  {
    names: ['Grave Titan'],
    // CHECK WHEN ANOTHER DECK PLAYS IT: its attack trigger (two more Zombies) is not modelled
    onEnter(game) {
      game.createTokens(ZOMBIE, 2);
    },
  },
  {
    names: ['Shriekmaw'],
    // CHECK WHEN ANOTHER DECK PLAYS IT: its target is the biggest threat's best creature: nonartifact and nonblack are not checked
    onEnter(game) {
      game.podSnipe(SHRIEKMAW, 'Shriekmaw');
    },
  },
  {
    names: ['Burning-Rune Demon'],
    // CHECK WHEN ANOTHER DECK PLAYS IT: the best card to hand (the card: up to two with different names, an opponent
    // picks which one goes to the hand and the other to the graveyard).
    onEnter(game) {
      game.doTutor(() => true, false);
    },
  },
  {
    names: ['Demonlord Belzenlok'],
    onEnter(game) {
      // the next nonland card goes to our hand, again while it costs 4 or more; 1 damage to us each
      for (let i = 0; i < 10 && game.library.length; i++) {
        const nonland = game.library.find((card) => card.land === null);
        if (!nonland) return;
        const exiled = game.takeTopCardsOfLibrary(
          game.library.indexOf(nonland),
        );
        game.putCards(exiled, 'exile');
        game.takeCard(nonland, 'library');
        game.putCard(nonland, 'hand');
        game.loseLife(1);
        if (nonland.manaValue < 4) return;
      }
    },
  },
  {
    names: ['Bloodgift Demon'],
    onUpkeep(game) {
      game.draw(1);
      game.loseLife(1);
    },
  },
  {
    names: ['Phyrexian Arena'],
    onUpkeep(game) {
      game.draw(1, 'Phyrexian Arena');
      game.loseLife(1);
    },
  },
];

/** Eternal Witness: the card in our graveyard we want most goes to our hand. */
function returnBestCardToHand(
  game: GameCore,
  isAllowed: (card: CardDef) => boolean = () => true,
): void {
  const allowed = game.graveyard.filter(isAllowed);
  if (!allowed.length) return;
  const best = firstMax(allowed, (card) => game.returnToHandValue(card));
  game.takeCardIfThere(best, 'graveyard');
  game.putCard(best, 'hand');
}
