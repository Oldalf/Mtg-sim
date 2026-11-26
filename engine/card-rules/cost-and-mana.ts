/**
 * Cost reducers and the permanents that add mana when a land is tapped (or give haste: Lavaleaper) or pump creatures
 * of a colour. The colour and the
 * creature type a card names as it enters are the deck's choice (chosenColour, chosenCreatureType).
 */
import * as C from '../cards/cards';
import type { CardDef } from '../cards/cards';
import type { GameCore } from '../game/game-core';
import type { Permanent } from '../game/game-types';
import type { CardRules } from './card-rules';

export const COST_AND_MANA: CardRules[] = [
  {
    names: ['Mindsplice Apparatus'],
    // its oil counters (Permanent.otherCounters); a counter doubler doesn't double them
    onUpkeep(_game, permanent) {
      permanent.otherCounters = (permanent.otherCounters ?? 0) + 1;
    },
    costReduction(_game, permanent, spell) {
      return spell.isInstantOrSorcery ? (permanent.otherCounters ?? 0) : 0;
    },
  },
  {
    names: ['Goreclaw, Terror of Qal Sisma'],
    // CHECK WHEN ANOTHER DECK PLAYS IT: its attack trigger (+1/+1 and trample for our big creatures) is not modelled.
    costReduction(_game, _permanent, spell) {
      return spell.isCreature && spell.power >= 4 ? 2 : 0;
    },
  },
  {
    names: ['Radagast of Rhosgobel'],
    // CHECK WHEN ANOTHER DECK PLAYS IT: the flash for that spell is not modelled.
    costReduction(game, _permanent, spell) {
      return spell.isCreature && game.creatureSpellsCastThisTurn === 0 ? 2 : 0;
    },
  },
  {
    names: ['Lavaleaper'],
    // CHECK WHEN ANOTHER DECK PLAYS IT: only our creatures have haste and only our basic lands add more (the card: every
    // player's).
    givesOurCreaturesKeywords() {
      return ['haste'];
    },
    onLandTappedForMana(game, _permanent, land) {
      if (land.land?.basic) addMana(game, land.land.mana);
    },
  },
  {
    names: ['Jet Medallion'],
    // CHECK WHEN ANOTHER DECK PLAYS IT: only spells with a {B} pip count (the card: every black spell, also {B/P} and
    // hybrid ones such as K'rrik).
    costReduction(_game, _permanent, spell) {
      return spell.cost.black > 0 ? 1 : 0;
    },
  },
  {
    names: ['Ancient Cellarspawn'],
    // CHECK WHEN ANOTHER DECK PLAYS IT: it reduces only Demons (the card: Demons, Horrors and Nightmares); its trigger
    // counts only permanent spells (instants and sorceries don't).
    costReduction(_game, _permanent, spell) {
      return C.hasCreatureType(spell, 'Demon') ? 1 : 0;
    },
    onWeCast(game, _permanent, spell, manaSpent) {
      // less mana spent than its mana value: target opponent loses the difference
      const manaSaved = spell.manaValue - manaSpent;
      if (manaSaved > 0) game.targetOpponentLosesLife(manaSaved);
    },
  },
  {
    names: ['Heartless Summoning'],
    costReduction(_game, _permanent, spell) {
      return spell.isCreature ? 2 : 0;
    },
    powerAndToughnessBonus() {
      return -1;
    },
  },
  {
    names: ["Urza's Incubator"],
    // the type is the deck's choice (chosenCreatureType); with none named it reduces nothing
    costReduction(game, permanent, spell) {
      const chosenType = game.chosenCreatureType(permanent.card);
      return spell.isCreature &&
        chosenType !== null &&
        C.hasCreatureType(spell, chosenType)
        ? 2
        : 0;
    },
  },
  {
    names: ['Crypt Ghast', 'Nirkana Revenant'],
    onLandTappedForMana(game, _permanent, land) {
      if (land.land?.swamp) game.pool.B += 1;
    },
  },
  {
    names: ['Caged Sun'],
    // CHECK WHEN ANOTHER DECK PLAYS IT: the extra mana comes from lands of the colour's basic type (the card: any land
    // that made mana of that colour).
    onLandTappedForMana(game, permanent, land) {
      const colour = game.chosenColour(permanent.card);
      if (hasBasicTypeOf(land, colour)) addMana(game, colour);
    },
    powerAndToughnessBonus(game, permanent, creature) {
      return isOfChosenColour(game, permanent, creature.card) ? 1 : 0;
    },
  },
  {
    names: ['Gauntlet of Power'],
    // CHECK WHEN ANOTHER DECK PLAYS IT: its +1/+1 is for our creatures only (the card: every creature of that colour).
    onLandTappedForMana(game, permanent, land) {
      const colour = game.chosenColour(permanent.card);
      if (land.land?.basic && hasBasicTypeOf(land, colour))
        addMana(game, colour);
    },
    powerAndToughnessBonus(game, permanent, creature) {
      return isOfChosenColour(game, permanent, creature.card) ? 1 : 0;
    },
  },
];

const BASIC_TYPE_OF_COLOUR: Record<string, string> = {
  W: 'plains',
  U: 'island',
  B: 'swamp',
  R: 'mountain',
  G: 'forest',
};

/** Is this land of the basic land type that makes this colour (a Swamp for black)? */
function hasBasicTypeOf(land: Permanent, colour: string): boolean {
  const basicType = BASIC_TYPE_OF_COLOUR[colour];
  return (
    land.land !== null &&
    !!(land.land as unknown as Record<string, boolean>)[basicType]
  );
}

function addMana(game: GameCore, colour: string): void {
  game.pool[colour as keyof typeof game.pool] += 1;
}

function isOfChosenColour(
  game: GameCore,
  permanent: Permanent,
  card: CardDef,
): boolean {
  const colour = game.chosenColour(permanent.card);
  return (C.coloursOf(card) as string[]).includes(colour);
}
