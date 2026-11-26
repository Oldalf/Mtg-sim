/**
 * Rituals, untap spells and tutors. Which card a tutor fetches is the deck's choice (tutorTarget, through doTutor);
 * which lands an untap spell untaps is the engine's (GameCore.untapLands).
 */
import * as Facts from '../cards/card-facts';
import * as C from '../cards/cards';
import type { GameCore } from '../game/game-core';
import type { Permanent } from '../game/game-types';
import { TREASURE } from '../cards/tokens';
import type { CardRules } from './card-rules';

export const MANA_SPELLS_AND_TUTORS: CardRules[] = [
  {
    names: ['Mana Geyser'],
    resolve(game) {
      game.pool.R += game.opponentsTappedLands();
    },
  },
  {
    names: ["Jeska's Will"],
    // the target is the opponent with the most cards; with a commander out both modes
    resolve(game) {
      game.pool.R += game.mostCardsInAnOpponentsHand();
      if (!game.controlsCommander()) return;
      for (const card of game.takeTopCardsOfLibrary(3)) {
        game.putCard(card, 'hand');
        game.cardsPlayableThisTurnOnly.push(card);
      }
    },
  },
  {
    names: ['Seething Song'],
    resolve(game) {
      game.pool.R += 5;
    },
  },
  {
    names: ['Snap'],
    resolve(game) {
      game.untapLands(2);
    },
  },
  {
    names: ['Turnabout'],
    // CHECK WHEN ANOTHER DECK PLAYS IT: only the "untap all lands you control" mode is modelled.
    resolve(game) {
      game.untapLands(game.landsOnBattlefield().length);
    },
  },
  {
    names: ['Songs of the Damned'],
    resolve(game) {
      game.pool.B += game.graveyard.filter(
        (graveyardCard) => graveyardCard.isCreature,
      ).length;
    },
  },
  {
    names: ['Dark Ritual'],
    resolve(game) {
      game.pool.B += 3;
    },
  },
  {
    names: ['Pyretic Ritual'],
    resolve(game) {
      game.pool.R += 3;
    },
  },
  {
    names: ["Brass's Bounty"],
    resolve(game) {
      game.createTokens(TREASURE, game.landsOnBattlefield().length);
    },
  },
  {
    names: ['Manamorphose'],
    resolve(game) {
      // two mana in any combination of colours (manaColoursToAdd), then draw
      const pool = game.pool as unknown as Record<string, number>;
      for (const colour of game.manaColoursToAdd(2)) pool[colour] += 1;
      game.draw(1);
    },
  },
  {
    names: ['Cabal Ritual'],
    resolve(game) {
      game.pool.B += game.cabalMana();
    },
  },
  {
    names: ['Drain Power'],
    resolve(game) {
      game.pool.C += game.drainPowerMana();
    },
  },
  {
    names: ['Energy Tap'],
    resolve(game) {
      const target = game.energyTapTarget();
      if (target) {
        target.tapped = true;
        game.pool.C += target.card.manaValue;
      }
    },
  },
  {
    names: ['Rain of Filth'],
    resolve(game) {
      sacrificeAllLandsForMana(game);
    },
  },
  {
    names: ['High Tide'],
    resolve(game) {
      game.highTidesThisTurn += 1;
    },
  },
  {
    names: ['Bubbling Muck'],
    resolve(game) {
      game.muck += 1;
    },
  },
  {
    names: ['Diabolic Tutor', 'Demonic Tutor', 'Profane Tutor'],
    resolve(game) {
      game.doTutor(() => true, false);
    },
  },
  {
    names: ['Vampiric Tutor'],
    resolve(game) {
      game.doTutor(() => true, true);
      game.loseLife(2);
    },
  },
  {
    names: ['Demonic Counsel'],
    resolve(game) {
      game.doTutor((otherCard) => C.hasCreatureType(otherCard, 'Demon'), false);
    },
  },
  {
    names: ['Solve the Equation'],
    resolve(game) {
      game.doTutor((otherCard) => otherCard.isInstantOrSorcery, false);
    },
  },
  {
    names: ['Personal Tutor'],
    resolve(game) {
      game.doTutor((otherCard) => otherCard.isSorcery, true);
    },
  },
  {
    names: ['Waterlogged Teachings'],
    resolve(game) {
      game.doTutor((otherCard) => otherCard.isInstant, false);
    },
  },
  {
    names: ['Merchant Scroll'],
    resolve(game) {
      game.doTutor(
        (otherCard) => otherCard.isInstant && otherCard.isBlue,
        false,
      );
    },
  },
  {
    names: ['Gifts Ungiven'],
    resolve(game) {
      // which cards, and which two the opponent bins, are choices (giftsUngivenPile)
      const { searched, toGraveyard } = game.giftsUngivenPile();
      game.shuffle();
      for (const card of toGraveyard) game.toGraveyard(card);
      game.putCards(
        searched.filter((card) => !toGraveyard.includes(card)),
        'hand',
      );
    },
  },
  {
    names: ["Lim-Dûl's Vault"],
    resolve(game) {
      // look at the top five; pay 1 life to put them on the bottom and look at the next five, as often as we like
      // (limDulsVaultWindow); then shuffle and put the five on top in any order
      const windowIndex = game.limDulsVaultWindow();
      const passed = game.takeTopCardsOfLibrary(5 * windowIndex);
      const kept = game.orderForTopOfLibrary(game.takeTopCardsOfLibrary(5));
      game.putCards(passed, 'library');
      game.shuffle();
      game.putCardsOnTopOfLibrary(kept);
      game.loseLife(windowIndex);
    },
  },
  {
    names: ['Insatiable Avarice'],
    resolve(game, _spell, { mode }) {
      if (mode === 'tutor' || mode === 'both') game.doTutor(() => true, true);
      if (mode === 'draw' || mode === 'both') {
        game.draw(3);
        game.myLife -= 3;
      }
    },
  },
];

/** Rain of Filth: tap each untapped land for its mana, then sacrifice every land for {B}. */
function sacrificeAllLandsForMana(game: GameCore): void {
  const lands = game.landsOnBattlefield();
  const filterKindOf = (land: Permanent): string | null => {
    const kind = game.manaSourceKind(land);
    return Facts.isFilterKind(kind) ? kind : null;
  };
  for (const land of lands)
    if (!land.tapped && filterKindOf(land) === null) game.tap(land, 'B');
  // a filter land last, fed a mana the others made (colourless, then its second colour, as the kill search counts)
  for (const land of lands) {
    const filterKind = filterKindOf(land);
    if (land.tapped || filterKind === null) continue;
    const [firstColour, secondColour] = Facts.FILTER_COLOURS[filterKind];
    const pool = game.pool as unknown as Record<string, number>;
    if (pool.C + pool[firstColour] + pool[secondColour] > 0)
      game.tap(land, firstColour);
  }
  for (const land of lands) {
    game.sacrifice(land);
    game.pool.B += 1;
  }
}
