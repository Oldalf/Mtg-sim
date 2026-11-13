import {
  AFFINITY,
  AWAKENING,
  CLAIM,
  CROP,
  DOMINION,
  LORE,
  SCRYING,
  SEARCH,
  SWARM,
  THREE,
} from './cards';
import { tutorLand } from './candidates';
import type { AesiGame } from './game';
import { CardDef } from '../../engine/cards';
import { Permanent } from '../../engine/game-types';
import { firstMax, removeIfPresent } from '../../engine/lists';

/** What Aesi's ramp and utility spells do when they resolve (the engine handles the draw spells and the rest). */
export function resolveAesiSpell(
  game: AesiGame,
  spell: CardDef,
  mode: string | null,
): boolean {
  return (
    resolveBasicLandFetcher(game, spell, mode) ||
    resolveLandMover(game, spell, mode) ||
    resolveOtherSpell(game, spell)
  );
}

/** Spells that search for basic lands. Returns false if this is not one of them. */
function resolveBasicLandFetcher(
  game: AesiGame,
  spell: CardDef,
  mode: string | null,
): boolean {
  switch (spell.name) {
    case 'Rampant Growth':
      game.fetchBasic({ tapped: true });
      return true;
    case LORE:
    case THREE:
      game.fetchBasic({ only: 'Forest' });
      return true;
    case CLAIM:
      game.fetchBasic({ only: 'Forest' });
      game.fetchBasic({ only: 'Forest' });
      return true;
    case SEARCH:
      game.fetchBasic();
      return true;
    case 'Farseek':
      game.fetchBasic({ tapped: true, only: 'Island' });
      return true;
    case 'Cultivate':
      game.fetchBasic({ tapped: true });
      game.fetchBasic({ toHand: true });
      return true;
    case 'Explosive Vegetation':
    case 'Circuitous Route':
    case 'Reach the Horizon':
      game.fetchBasic({ tapped: true });
      game.fetchBasic({ tapped: true });
      return true;
    case "Nissa's Pilgrimage": {
      const spellMastery =
        game.graveyard.filter((card) => card.isInstantOrSorcery).length >= 2;
      game.fetchBasic({ tapped: true, only: 'Forest' });
      game.fetchBasic({ toHand: true, only: 'Forest' });
      if (spellMastery) game.fetchBasic({ toHand: true, only: 'Forest' });
      return true;
    }
    case 'Grow from the Ashes':
      game.fetchBasic();
      if (mode === 'kicked') game.fetchBasic();
      return true;
    case 'Bushwhack':
      game.fetchBasic({ toHand: true });
      return true;
    default:
      return false;
  }
}

/** Spells that sacrifice a land or put lands onto the battlefield. Returns false if this is not one of them. */
function resolveLandMover(
  game: AesiGame,
  spell: CardDef,
  mode: string | null,
): boolean {
  switch (spell.name) {
    case 'Harrow':
    case 'Entish Restoration': {
      // sacrifice a land (a tapped one), then two basics (Harrow: untapped; Entish: tapped, three with a 4-power creature)
      const isHarrow = spell.name === 'Harrow';
      const landToSacrifice =
        isHarrow && mode === 'copy'
          ? undefined // Harrow's sacrifice is a cost (not copied)
          : chooseLandToSacrifice(game);
      if (landToSacrifice) sacrificeLand(game, landToSacrifice);
      const hasBigCreature = game
        .creatures()
        .some((creature) => game.power(creature) >= 4);
      const basicCount = !isHarrow && hasBigCreature ? 3 : 2;
      for (let i = 0; i < basicCount; i++)
        game.fetchBasic({ tapped: !isHarrow });
      return true;
    }
    case 'Growth Spiral': {
      game.draw(1);
      const landsInHand = game.landsInHand();
      if (landsInHand.length)
        game.putLand(
          game.chooseLand(landsInHand),
          'hand',
          'Growth Spiral puts',
        );
      return true;
    }
    case SCRYING:
      tutorLand(game, false);
      return true;
    case CROP:
      sacrificeLand(game, chooseLandToSacrifice(game));
      tutorLand(game, true);
      return true;
    default:
      return false;
  }
}

/** The land to sacrifice: a tapped basic, else any tapped land, else any land. */
function chooseLandToSacrifice(game: AesiGame): Permanent | undefined {
  const lands = game.landsOnBattlefield();
  return (
    lands.find((permanent) => permanent.tapped && permanent.land!.basic) ??
    lands.find((permanent) => permanent.tapped) ??
    lands[0]
  );
}

function sacrificeLand(game: AesiGame, land: Permanent | undefined): void {
  if (!land) return;
  removeIfPresent(game.battlefield, land);
  game.graveyard.push(land.card);
}

/** Spells that do something else: extra land drops, untapping, digging, lands as creatures and the epic spells. */
function resolveOtherSpell(game: AesiGame, spell: CardDef): boolean {
  switch (spell.name) {
    case 'Explore':
      game.dropsBonus += 1;
      game.draw(1);
      return true;
    case 'Summer Bloom':
      game.dropsBonus += 3;
      return true;
    case 'Early Harvest':
      for (const land of game.landsOnBattlefield())
        if (land.land!.basic) land.tapped = false;
      return true;
    case 'Seismic Sense': {
      const lookCount = Math.min(
        game.landsOnBattlefield().length,
        Math.max(0, game.library.length - game.libraryCardsToKeep()),
      );
      const top = game.library.splice(0, lookCount);
      const choices = top.filter(
        (card) => card.isCreature || card.land !== null,
      );
      const pick = choices.length
        ? firstMax(
            choices,
            (card) => game.cardValue(card) + (card.isCreature ? 5 : 0),
          )
        : null;
      if (pick) {
        removeIfPresent(top, pick);
        game.hand.push(pick);
      }
      game.library.push(...top);
      game.say('Seismic Sense:', pick ?? 'nothing');
      return true;
    }
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
