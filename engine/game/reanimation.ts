/**
 * Reanimation spells (Unearth, Victimize, Reanimate, Animate Dead...): what they do is a card fact
 * (REANIMATION_SPELLS in card-facts.ts), which creature comes back is the deck's choice (GameCore.reanimationValue).
 */
import { CardDef } from '../cards/cards';
import { REANIMATION_SPELLS, ReanimationSpell } from '../cards/card-facts';
import type { GameCore } from './game-core';

/** Plays a reanimation instant or sorcery. Returns false if the spell isn't one (an Aura reanimates as it enters). */
export function resolveReanimationSpell(
  game: GameCore,
  spell: CardDef,
): boolean {
  const spellInfo = REANIMATION_SPELLS[spell.name];
  if (!spellInfo || spellInfo.isAura) return false;
  reanimateFromGraveyard(game, spellInfo);
  return true;
}

/** Animate Dead, Necromancy: the Aura reanimates as it enters (it stays on the battlefield; its falling off when
 *  the creature leaves is not modelled). */
export function reanimateAsAuraEnters(game: GameCore, aura: CardDef): void {
  const spellInfo = REANIMATION_SPELLS[aura.name];
  if (spellInfo?.isAura) reanimateFromGraveyard(game, spellInfo);
}

function reanimateFromGraveyard(
  game: GameCore,
  spellInfo: ReanimationSpell,
): void {
  const isAllowed = (card: CardDef) =>
    (spellInfo.maxManaValue === undefined ||
      card.manaValue <= spellInfo.maxManaValue) &&
    !(spellInfo.nonlegendary && card.types.has('legendary'));
  const options = {
    tapped: spellInfo.tapped,
    counters: spellInfo.minusOneCounter ? -1 : 0,
  };
  if (spellInfo.count === 'all') {
    const creatures = game.graveyard.filter(
      (card) => card.isCreature && isAllowed(card),
    );
    for (const creature of creatures) game.reanimate(creature, options);
    return;
  }
  for (let i = 0; i < spellInfo.count; i++) {
    const creature = game.bestCreatureInGraveyard(isAllowed);
    if (!creature) continue;
    game.reanimate(creature, options);
    if (spellInfo.loseLifeEqualToManaValue) game.loseLife(creature.manaValue);
  }
}
