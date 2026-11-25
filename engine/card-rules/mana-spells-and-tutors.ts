/**
 * Rituals, untap spells and tutors. Which card a tutor fetches is the deck's choice (tutorTarget, through doTutor);
 * which lands an untap spell untaps is the engine's (GameCore.untapLands).
 */
import * as Facts from '../cards/card-facts';
import * as C from '../cards/cards';
import type { GameCore } from '../game/game-core';
import type { Permanent } from '../game/game-types';
import type { CardRules } from './card-rules';

export const MANA_SPELLS_AND_TUTORS: CardRules[] = [
  {
    names: ['Snap'],
    resolve(game) {
      game.untapLands(2);
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
    names: ['Diabolic Tutor', 'Demonic Tutor'],
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
