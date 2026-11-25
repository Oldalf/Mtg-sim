/**
 * Creatures that fill our graveyard or use it: mills, graveyard tutors, the graveyard count, copies of creatures that
 * came back from it. Which card a graveyard tutor takes is the deck's choice (cardToPutInGraveyard); which creatures
 * Protean Hulk fetches too (battlefieldValue).
 */
import { firstMax } from '../util/lists';
import type { CardRules } from './card-rules';

export const GRAVEYARD_CREATURES: CardRules[] = [
  {
    names: ['Liliana the Repentant'],
    onAnotherOfOursEnters(game, _permanent, entered) {
      // another creature or planeswalker of ours enters: mill two
      if (entered.card.isCreature || entered.card.types.has('planeswalker'))
        game.millOurselves(2);
    },
  },
  {
    names: ['Twilight Diviner'],
    onEnter(game) {
      game.scry(2, true); // surveil 2
    },
    onAnotherOfOursEnters(game, permanent, entered, from) {
      // a creature of ours entered from a graveyard: a token copy of it (once each turn)
      if (from !== 'graveyard' || !entered.card.isCreature) return;
      if (!game.useOnceEachTurn('Twilight Diviner')) return;
      game.say('  Twilight Diviner copies', entered.card);
      game.enter(entered.card, 'token', { token: true });
    },
    // CHECK WHEN ANOTHER DECK PLAYS IT: a creature cast from a graveyard (not put onto the battlefield from it) does not count
  },
  {
    names: ["Stitcher's Supplier"],
    onEnter(game) {
      game.millOurselves(3);
    },
    onDies(game) {
      game.millOurselves(3);
    },
  },
  {
    names: ['Satyr Wayfinder'],
    onEnter(game) {
      // the top four: a land to hand, the rest to the graveyard
      const top = game.takeTopCardsOfLibrary(4);
      const land = top.find((card) => card.land !== null);
      for (const card of top)
        if (card === land) game.putCard(card, 'hand');
        else game.toGraveyard(card, true);
    },
  },
  {
    names: ['Vile Entomber'],
    onEnter(game) {
      game.tutorToGraveyard(() => true);
    },
  },
  {
    names: ['Lotleth Giant'],
    onEnter(game) {
      // 1 damage to target opponent for each creature card in our graveyard
      const target = game.chooseTargetOpponent();
      if (target !== null)
        game.damageOpponent(target, game.creaturesInGraveyard());
      game.say(
        `  Lotleth Giant deals ${game.creaturesInGraveyard()}, ${game.describeOpponentLife()}`,
      );
    },
  },
  {
    names: ['Protean Hulk'],
    onDies(game) {
      // creatures with total mana value 6 or less onto the battlefield
      let budget = 6;
      for (;;) {
        const choices = game.library.filter(
          (card) => card.isCreature && card.manaValue <= budget,
        );
        if (!choices.length) break;
        const best = firstMax(choices, (card) => game.battlefieldValue(card));
        game.takeCardIfThere(best, 'library');
        budget -= best.manaValue;
        game.enter(best, 'library');
      }
      game.shuffle();
    },
  },
];
