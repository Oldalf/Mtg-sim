import { AFFINITY, AWAKENING, DOMINION, SWARM } from './cards';
import type { AesiGame } from './game';
import { CardDef } from '../../engine/cards/cards';

/** What Aesi's spells do that the engine's card rules (engine/card-rules/) don't have yet: the epic
 *  spells and the lands that become creatures, which hang on Aesi's own loops and combat. */
export function resolveAesiSpell(
  game: AesiGame,
  spell: CardDef,
  mode: string | null,
): boolean {
  switch (spell.name) {
    case AWAKENING:
      game.awakened = true;
      game.say('our lands are 2/2 creatures with haste');
      return true;
    case AFFINITY:
      game.affinity = true;
      game.say('all lands are 2/2 creatures this turn');
      return true;
    case SWARM:
      game.makeSnakes(game.hand.length);
      game.epic = true;
      game.swarmCopies += 1;
      game.say('epic: no more spells; a copy every upkeep');
      return true;
    case DOMINION:
      game.putStolenLand();
      game.epic = true;
      game.dominionCopies += 1;
      game.say('epic: no more spells; a copy every upkeep');
      return true;
    default:
      return false;
  }
}
