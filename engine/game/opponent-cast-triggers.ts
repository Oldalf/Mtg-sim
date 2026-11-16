/**
 * Triggers on another player's spell: "Whenever an opponent casts a spell, ...".
 * The pod tells each opponent's game when a player casts a spell (GameCore.onOpponentCast). A goldfish game has no
 * opponents who cast anything, so none of this runs there.
 *   Taurean Mauler: a +1/+1 counter on it (changeling; its size matters in a pod).
 *   Ruric Thar: 6 damage to an opponent who casts a noncreature spell (its own controller's: the deck).
 *   Rhystic Study: we draw unless the caster pays {1}. Mystic Remora and Esper Sentinel are not modelled.
 */
import { Cost } from '../cards/cards';
import type { CardDef } from '../cards/cards';
import type { GameCore } from './game-core';

const TAUREAN_MAULER = 'Taurean Mauler';
const RHYSTIC_STUDY = 'Rhystic Study';
const RURIC_THAR = 'Ruric Thar, the Unbowed';

/** Runs every "whenever an opponent casts a spell" permanent of `watcher` for a spell `caster` just cast. */
export function triggerOnOpponentCast(
  watcher: GameCore<unknown>,
  caster: GameCore<unknown>,
  spell: CardDef,
): void {
  for (const permanent of watcher.battlefield.slice()) {
    if (permanent.name === TAUREAN_MAULER) {
      permanent.counters += 1;
      watcher.say(`${spell.name} was cast: +1/+1 counter on`, permanent.card);
    } else if (permanent.name === RURIC_THAR && !spell.isCreature) {
      watcher.say(
        `${spell.name} was cast: 6 damage to its caster from`,
        permanent.card,
      );
      caster.loseLife(6);
    } else if (permanent.name === RHYSTIC_STUDY) {
      if (casterPaysForRhysticStudy(caster))
        watcher.say(`${spell.name} was cast: it pays {1} for`, permanent.card);
      else {
        watcher.say(`${spell.name} was cast: we draw from`, permanent.card);
        watcher.draw(1);
      }
    }
  }
}

/** The caster pays {1} when it has a mana left over after its spell. */
function casterPaysForRhysticStudy(caster: GameCore<unknown>): boolean {
  return caster.pay(new Cost(1), false);
}
