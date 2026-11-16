/**
 * Casting and copying instant and sorcery spells: the triggers on them (magecraft: "whenever you cast or copy an
 * instant or sorcery spell") and the copies themselves.
 *
 * - Cast triggers: Archmage Emeritus and Archmage of Runes draw, Storm-Kiln Artist makes a Treasure.
 * - Copy triggers (magecraft only): Archmage Emeritus draws, Storm-Kiln Artist makes a Treasure.
 * - Veyran, Voice of Duality: each of these triggers triggers an additional time.
 * - copySpell: a copy of an instant or sorcery resolves (it is not cast: no cast triggers, rule 707.10); a copy of a
 *   permanent spell becomes a token (a legendary one is skipped: the legend rule would put one away at once).
 *   Twinning Staff adds one copy each time we copy a spell.
 */
import { CardDef } from '../cards/cards';
import { TREASURE } from '../cards/tokens';
import type { GameCore } from './game-core';

export const ARCHMAGE_EMERITUS = 'Archmage Emeritus';
export const ARCHMAGE_OF_RUNES = 'Archmage of Runes';
export const STORM_KILN_ARTIST = 'Storm-Kiln Artist';
export const TWINNING_STAFF = 'Twinning Staff';
export const VEYRAN = 'Veyran, Voice of Duality';

/** How many times a trigger caused by casting or copying an instant or sorcery triggers (Veyran: once more each). */
export function spellTriggerCount(game: GameCore<unknown>): number {
  return 1 + game.countOnBattlefield(VEYRAN);
}

/** We cast an instant or sorcery: Archmage Emeritus and Archmage of Runes draw, Storm-Kiln Artist makes a Treasure. */
export function castInstantOrSorceryTriggers(game: GameCore<unknown>): void {
  const triggerCount = spellTriggerCount(game);
  for (const permanent of game.battlefield.slice()) {
    const name = permanent.card.name;
    for (let i = 0; i < triggerCount; i++) {
      if (name === ARCHMAGE_EMERITUS || name === ARCHMAGE_OF_RUNES)
        game.draw(1);
      else if (name === STORM_KILN_ARTIST) game.createTokens(TREASURE);
    }
  }
}

/** We copied an instant or sorcery (magecraft): Archmage Emeritus draws, Storm-Kiln Artist makes a Treasure. */
export function copyInstantOrSorceryTriggers(game: GameCore<unknown>): void {
  const triggerCount = spellTriggerCount(game);
  for (const permanent of game.battlefield.slice()) {
    const name = permanent.card.name;
    for (let i = 0; i < triggerCount; i++) {
      if (name === ARCHMAGE_EMERITUS) game.draw(1);
      else if (name === STORM_KILN_ARTIST) game.createTokens(TREASURE);
    }
  }
}

/** How many copies we make when an effect copies a spell `count` times (Twinning Staff: one more each). */
export function copiesMade(game: GameCore<unknown>, count: number): number {
  return count + game.countOnBattlefield(TWINNING_STAFF);
}

/** Copies a spell we control `count` times (plus Twinning Staff's). Each copy of an instant or sorcery triggers
 *  magecraft and resolves; each copy of a nonlegendary permanent spell enters as a token. */
export function copySpell(
  game: GameCore<unknown>,
  card: CardDef,
  count = 1,
): void {
  // counted once: a token copy of Twinning Staff doesn't add to the copies being made
  const copies = copiesMade(game, count);
  for (let i = 0; i < copies; i++) {
    if (card.isInstantOrSorcery) {
      game.say('  copy of', card);
      copyInstantOrSorceryTriggers(game);
      game.resolve(card);
    } else if (!card.types.has('legendary')) {
      game.say('  token copy of', card);
      game.enter(card, 'token', { token: true });
    }
  }
}
