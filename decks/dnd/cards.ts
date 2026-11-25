/** The DnD deck (Hama Pashar, Ruin Seeker): card names and values. The rules are in game.ts. */
import * as C from '../../engine/cards/cards';
import {
  CATHARS_CRUSADE,
  RADIANT_SOLAR,
} from '../../engine/game/creature-enter-triggers';

export const HAMA_PASHAR = 'Hama Pashar, Ruin Seeker';
// blink
export const AIRBENDER_ASCENSION = 'Airbender Ascension';
export const BRAGO = 'Brago, King Eternal';
export const DAYDREAM = 'Daydream';
export const GENKU = 'Genku, Future Shaper';
export const KYKAR = 'Kykar, Zephyr Awakener';
export const MOMO = 'Momo, Playful Pet';
export const NIKO = 'Niko, Light of Hope';
export const OJI = 'Oji, the Exquisite Blade';
export const SKYCOACH_CONDUCTOR = 'Skycoach Conductor';
export const THASSA = 'Thassa, Deep-Dwelling';
// draw
export const AETHER_CHANNELER = 'Aether Channeler';
export const DJINNI_WINDSEER = 'Djinni Windseer';
export const EMERITUS_OF_IDEATION = 'Emeritus of Ideation';
export const EPHARA = 'Ephara, God of the Polis';
export const PENSIVE_PROFESSOR = 'Pensive Professor';
export const WINDFALL = 'Windfall';
// dungeon
export const CLOISTER_GARGOYLE = 'Cloister Gargoyle';
export const DELVERS_TORCH = "Delver's Torch";
export const DUNGEON_DESCENT = 'Dungeon Descent';
export const DUNGEON_MAP = 'Dungeon Map';
export const MIDNIGHT_PATHLIGHTER = 'Midnight Pathlighter';
export const NADAAR = 'Nadaar, Selfless Paladin';
export const TOMB_OF_HORRORS_ADVENTURER = 'Tomb of Horrors Adventurer';
export const UNDERCELLAR_SWEEP = 'Undercellar Sweep';
export const WHITE_PLUME_ADVENTURER = 'White Plume Adventurer';
export const YUAN_TI_MALISON = 'Yuan-Ti Malison';
// ramp
export const ARCHAEOMANCERS_MAP = "Archaeomancer's Map";
export const KNIGHT_OF_THE_WHITE_ORCHID = 'Knight of the White Orchid';
export const LAND_TAX = 'Land Tax';
export const RASPUTIN = 'Rasputin, the Oneiromancer';
export const STARFIELD_SHEPHERD = 'Starfield Shepherd';
// removal and control (the primer: "bounce permanents back to your opponents' hands")
export const AGENT_OF_TREACHERY = 'Agent of Treachery';
export const AVATARS_WRATH = "Avatar's Wrath";
export const HULLBREAKER_HORROR = 'Hullbreaker Horror';

/** Permanent.marks: Skycoach Conductor and Emeritus of Ideation are prepared (they may cast a copy of their spell). */
export const PREPARED = 1;
/** Permanent.marks: Delver's Torch is attached to this creature. */
export const EQUIPPED_WITH_TORCH = 2;

/** The prepared creatures' spells (their copies are cast from the creature, not from a zone). */
export const ALL_ABOARD = new C.CardDef('All Aboard', {
  name: 'All Aboard',
  mana_cost: '{U}',
  type_line: 'Instant',
  oracle:
    'Exile target non-Pilot creature you control, then return that card to the battlefield under its owner’s control.',
});
export const ANCESTRAL_RECALL = new C.CardDef('Ancestral Recall', {
  name: 'Ancestral Recall',
  mana_cost: '{U}',
  type_line: 'Instant',
  oracle: 'Target player draws three cards.',
});

// tokens
export const KNIGHT = C.makeToken('Knight', 2, 2, 'white');
export const SPIRIT = C.makeToken('Spirit', 1, 1, 'white', ['flying']);

/** How much the AI wants each card on the battlefield (the rest: 40 for a creature, 30 otherwise). */
export const VALUE: Record<string, number> = {
  [HAMA_PASHAR]: 95,
  'Sol Ring': 90,
  'Arcane Signet': 75,
  'Fellwar Stone': 68,
  'Fieldmist Borderpost': 62,
  'Midnight Clock': 60,
  [DUNGEON_MAP]: 66,
  "Sarevok's Tome": 76,
  [ARCHAEOMANCERS_MAP]: 58,
  [LAND_TAX]: 56,
  [KNIGHT_OF_THE_WHITE_ORCHID]: 54,
  [RASPUTIN]: 60,
  'Solemn Simulacrum': 64,
  [STARFIELD_SHEPHERD]: 58,
  'Peregrine Drake': 66,
  // blink
  Panharmonicon: 74,
  'Starfield Vocalist': 74,
  [AIRBENDER_ASCENSION]: 58,
  [BRAGO]: 78,
  'Displacer Beast': 62,
  [GENKU]: 70,
  [KYKAR]: 74,
  [MOMO]: 46,
  [NIKO]: 70,
  [OJI]: 72,
  [SKYCOACH_CONDUCTOR]: 60,
  [THASSA]: 74,
  // draw
  [AETHER_CHANNELER]: 60,
  [DJINNI_WINDSEER]: 52,
  [EMERITUS_OF_IDEATION]: 70,
  [EPHARA]: 66,
  'Helpful Hunter': 50,
  [PENSIVE_PROFESSOR]: 64,
  'Spirited Companion': 52,
  'Wall of Omens': 52,
  // dungeon
  [CLOISTER_GARGOYLE]: 56,
  [DELVERS_TORCH]: 50,
  'Dungeon Delver': 66,
  'Eccentric Apprentice': 60,
  [MIDNIGHT_PATHLIGHTER]: 76,
  [NADAAR]: 74,
  [RADIANT_SOLAR]: 72,
  [CATHARS_CRUSADE]: 72,
  [TOMB_OF_HORRORS_ADVENTURER]: 78,
  [UNDERCELLAR_SWEEP]: 72,
  'Veteran Dungeoneer': 62,
  [WHITE_PLUME_ADVENTURER]: 74,
  [YUAN_TI_MALISON]: 52,
  [AGENT_OF_TREACHERY]: 50,
  [HULLBREAKER_HORROR]: 62,
  // in hand: the pod's answers are kept over spare lands at the discard to seven
  [AVATARS_WRATH]: 55,
  'Path to Exile': 50,
  'Swords to Plowshares': 50,
  'Day of Judgment': 50,
};

/** How much a second run of each permanent's enter trigger is worth (a blink; Brago, Thassa and the spells take the
 *  best). A permanent not named here has no enter trigger worth it. */
export const BLINK_VALUE: Record<string, number> = {
  'Peregrine Drake': 9,
  [TOMB_OF_HORRORS_ADVENTURER]: 8,
  [WHITE_PLUME_ADVENTURER]: 8,
  [UNDERCELLAR_SWEEP]: 8,
  "Sarevok's Tome": 8,
  [AGENT_OF_TREACHERY]: 8,
  'Veteran Dungeoneer': 7,
  'Displacer Beast': 7,
  'Eccentric Apprentice': 7,
  [CLOISTER_GARGOYLE]: 7,
  [NADAAR]: 7,
  [RADIANT_SOLAR]: 7,
  [AETHER_CHANNELER]: 6,
  'Solemn Simulacrum': 6,
  [NIKO]: 5,
  [STARFIELD_SHEPHERD]: 5,
  'Wall of Omens': 5,
  'Spirited Companion': 5,
  'Helpful Hunter': 5,
  [DJINNI_WINDSEER]: 4,
  [OJI]: 4,
  [RASPUTIN]: 4,
  [ARCHAEOMANCERS_MAP]: 3,
  [MOMO]: 3, // its leave trigger
  [KNIGHT_OF_THE_WHITE_ORCHID]: 3,
};

/** A blink is worth it only if what it brings back is worth at least this much (BLINK_VALUE). */
export const SMALLEST_BLINK_WORTH_IT = 4;

/** Cards the AI never casts from its candidates: removal (the pod uses Path, Swords and Day of Judgment as answers,
 *  and DndGame casts Avatar's Wrath in a pod when behind on board), and cards with no use here (not modelled:
 *  Mirrorweave, Reconnaissance, Component Pouch). */
export const HOLD = new Set([
  'Path to Exile',
  'Swords to Plowshares',
  'Day of Judgment',
  AVATARS_WRATH,
  'Mirrorweave',
  'Reconnaissance',
  'Component Pouch',
]);

/** The blink spells, the engine's (BLINK_SPELLS). */
export const EPHEMERATE = 'Ephemerate';
export const GHOSTLY_FLICKER = 'Ghostly Flicker';
export const MORNINGTIDES_LIGHT = "Morningtide's Light";
export const LAEZELS_ACROBATICS = "Lae'zel's Acrobatics";

// (not the rocks read from their text: the engine finds a rock by its text only when no deck claims the card)
const ROCKS_BY_TEXT = new Set(['Fieldmist Borderpost']);
C.registerKnown([
  ...Object.keys(VALUE).filter((name) => !ROCKS_BY_TEXT.has(name)),
  ...HOLD,
  DAYDREAM,
  EPHEMERATE,
  GHOSTLY_FLICKER,
  MORNINGTIDES_LIGHT,
  LAEZELS_ACROBATICS,
  WINDFALL,
  DUNGEON_DESCENT,
]);
