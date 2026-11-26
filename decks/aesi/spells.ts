import { AFFINITY, AWAKENING, CROP, DOMINION, SCRYING, SWARM } from './cards';
import { tutorLand } from './candidates';
import type { AesiGame } from './game';
import { CardDef } from '../../engine/cards/cards';
import { Permanent } from '../../engine/game/game-types';

/** What Aesi's spells do that the engine's card rules (engine/card-rules/) don't have yet. Explore, Growth Spiral,
 *  Grow from the Ashes, Sylvan Scrying and Crop Rotation: other decks play them, so moving them changes those decks
 *  (U1b steps 3 and 4). The epic spells and the lands that become creatures hang on Aesi's own loops and combat. */
export function resolveAesiSpell(
  game: AesiGame,
  spell: CardDef,
  mode: string | null,
): boolean {
  switch (spell.name) {
    case 'Grow from the Ashes':
      game.fetchBasic();
      if (mode === 'kicked') game.fetchBasic();
      return true;
    case SCRYING:
      tutorLand(game, false);
      return true;
    case CROP:
      sacrificeLand(game, game.chooseLandToSacrifice());
      tutorLand(game, true);
      return true;
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

function sacrificeLand(game: AesiGame, land: Permanent | undefined): void {
  if (!land) return;
  game.takeFromBattlefieldIfThere(land);
  game.putCard(land.card, 'graveyard');
}
