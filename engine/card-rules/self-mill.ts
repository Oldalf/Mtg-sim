/**
 * Self-mill and the graveyard as a resource: cards that mill us, trigger on creature cards milled or on cards leaving
 * our graveyard, bring lands back from it, and the Zombie makers. Which card comes back is the deck's choice
 * (battlefieldValue, reanimationValue through bestCreatureInGraveyard).
 */
import type { CardDef } from '../cards/cards';
import * as C from '../cards/cards';
import { ZOMBIE, ZOMBIE_DRUID } from '../cards/tokens';
import type { GameCore } from '../game/game-core';
import type { Permanent } from '../game/game-types';
import type { CardRules } from './card-rules';

export const SELF_MILL: CardRules[] = [
  {
    names: ['Sidisi, Brood Tyrant'],
    onEnter(game) {
      game.millOurselves(3);
    },
    onAttacks(game) {
      game.millOurselves(3);
    },
    onCreatureCardsMilled(game) {
      game.createTokens(ZOMBIE);
    },
  },
  {
    names: ['Colossal Grave-Reaver'],
    onEnter(game) {
      game.millOurselves(3);
    },
    onAttacks(game) {
      game.millOurselves(3);
    },
    onCreatureCardsMilled(game, _permanent, creatureCards) {
      // one of them (still in the graveyard) to the battlefield: the one we want there most
      const best = creatureCards
        .filter((card) => game.graveyard.includes(card))
        .sort(
          (first, second) =>
            game.battlefieldValue(second) - game.battlefieldValue(first),
        )[0];
      if (best) game.reanimate(best);
    },
  },
  {
    names: ['Lumra, Bellow of the Woods'],
    onEnter(game) {
      game.millOurselves(4);
      game.returnLandsFromGraveyard();
    },
    powerAndToughnessBonus(game, permanent, creature) {
      return creature === permanent ? game.landsOnBattlefield().length : 0;
    },
  },
  {
    names: ["Multani, Yavimaya's Avatar"],
    powerAndToughnessBonus(game, permanent, creature) {
      if (creature !== permanent) return 0;
      return (
        game.landsOnBattlefield().length +
        game.graveyard.filter((card) => card.land !== null).length
      );
    },
  },
  {
    names: ['Teval, the Balanced Scale'],
    onAttacks(game) {
      // mill three, then a land card from the graveyard to the battlefield tapped
      game.millOurselves(3);
      game.returnLandsFromGraveyard(1);
    },
    onCardsLeaveOurGraveyard(game) {
      game.createTokens(ZOMBIE_DRUID);
    },
  },
  {
    names: ['Tormod, the Desecrator'],
    onCardsLeaveOurGraveyard(game) {
      game.createTokens(ZOMBIE, 1, { tapped: true });
    },
  },
  {
    names: ["Teval's Judgment"],
    // CHECK WHEN ANOTHER DECK PLAYS IT: two of its modes, always draw first, then the Zombie Druid.
    onCardsLeaveOurGraveyard(game) {
      if (game.useOnceEachTurn("Teval's Judgment: draw")) game.draw(1);
      else if (game.useOnceEachTurn("Teval's Judgment: zombie"))
        game.createTokens(ZOMBIE_DRUID);
    },
  },
  {
    names: ['Six'],
    // CHECK WHEN ANOTHER DECK PLAYS IT: the land comes from anywhere in the graveyard (the card: one of the three
    // milled).
    onAttacks(game) {
      game.millOurselves(3);
      const land = game.graveyard.find((card) => card.land !== null);
      if (land) {
        game.takeCard(land, 'graveyard');
        game.putCard(land, 'hand');
      }
    },
  },
  {
    names: ['Will of the Sultai'],
    resolve(game) {
      // mill three and all land cards back; with a commander out (both modes) also +1/+1 counters equal to our
      // lands on our creature with the most power
      game.millOurselves(3);
      game.returnLandsFromGraveyard();
      if (!controlsACommander(game)) return;
      const creatures = game.creatures();
      if (!creatures.length) return;
      const best = creatures.reduce((first, second) =>
        game.power(second) > game.power(first) ? second : first,
      );
      game.addCounters(best, game.landsOnBattlefield().length);
    },
  },
  {
    names: ['Will of the Abzan'],
    // CHECK WHEN ANOTHER DECK PLAYS IT: the opponents don't sacrifice a creature; without a commander out, only the
    // creature comes back.
    resolve(game) {
      // with a commander out (both modes) each opponent loses 3 life; a creature card from our graveyard comes back
      if (controlsACommander(game)) game.drainEach(3);
      const creature = game.bestCreatureInGraveyard();
      if (creature) game.reanimate(creature);
    },
  },
  {
    names: ['Endless Ranks of the Dead'],
    onUpkeep(game) {
      const newZombies = Math.floor(zombiesOf(game).length / 2);
      if (newZombies > 0) game.createTokens(ZOMBIE, newZombies);
    },
  },
  {
    names: ['The Scarab God'],
    // CHECK WHEN ANOTHER DECK PLAYS IT: its scry and its activated ability are not modelled.
    onUpkeep(game) {
      game.drainEach(zombiesOf(game).length);
    },
  },
  {
    names: ['Oversold Cemetery'],
    onUpkeep(game) {
      if (game.creaturesInGraveyard() >= 4) returnBestCreatureCardToHand(game);
    },
  },
  {
    names: ['Ripples of Undeath'],
    // CHECK WHEN ANOTHER DECK PLAYS IT: at upkeep (the card: the first main phase); the creature card comes from the
    // whole graveyard, for 3 life above 15 (the card: one of the milled cards, for {1} and 3 life).
    onUpkeep(game) {
      game.millOurselves(3);
      if (game.myLife > 15) returnBestCreatureCardToHand(game, 3);
    },
  },
  {
    names: ['Anger'],
    givesOurCreaturesKeywordsFromGraveyard(game) {
      return game.battlefield.some((permanent) => permanent.land?.mountain)
        ? ['haste']
        : [];
    },
  },
  {
    names: ['Brawn'],
    givesOurCreaturesKeywordsFromGraveyard(game) {
      return game.battlefield.some((permanent) => permanent.land?.forest)
        ? ['trample']
        : [];
    },
  },
  {
    names: ['Wonder'],
    givesOurCreaturesKeywordsFromGraveyard(game) {
      return game.landsOnBattlefield().some((land) => game.islandTyped(land))
        ? ['flying']
        : [];
    },
  },
];

function zombiesOf(game: GameCore): Permanent[] {
  return game
    .creatures()
    .filter((permanent) => C.hasCreatureType(permanent.card, 'Zombie'));
}

function controlsACommander(game: GameCore): boolean {
  return game.battlefield.some((permanent) =>
    game.commanderNames.includes(permanent.card.name),
  );
}

/** The best creature card in our graveyard to our hand (paying life if lifeCost is set). */
export function returnBestCreatureCardToHand(
  game: GameCore,
  lifeCost = 0,
): boolean {
  const creature: CardDef | null = game.bestCreatureInGraveyard();
  if (!creature) return false;
  if (lifeCost) game.loseLife(lifeCost);
  game.takeCard(creature, 'graveyard');
  game.putCard(creature, 'hand');
  return true;
}
