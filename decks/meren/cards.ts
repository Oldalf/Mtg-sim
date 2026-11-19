/** The cards of the Meren deck that have rules of their own, and the facts about them. */
import * as C from '../../engine/cards/cards';
import { makeToken } from '../../engine/cards/cards';
import {
  AYARA,
  CORPSE_AUGUR,
  GREATER_GOOD,
  MIDNIGHT_REAPER,
  MOLDERVINE_RECLAMATION,
  SACRIFICE_DRAW_SPELLS,
  SKULLCLAMP,
  TIRELESS_TRACKER,
} from '../../engine/game/card-draw';

export const MEREN = 'Meren of Clan Nel Toth';
export const DGHOR_BLOODLETTER = "D'Ghor Bloodletter";
export const DGHOR_BLOODLETTER_MANA_VALUE = 3;
/** D'Ghor Bloodletter shrinks (all other creatures -1/-1) instead of the edict when it kills this many opposing creatures. */
export const SHRINK_KILLS_AT_LEAST = 2;
/** Permanent.marks: a creature taken from a graveyard, or a 5/5 copy of one (Breach the Multiverse). */
export const STOLEN_MARK = 1;
export const GRAY_MERCHANT = 'Gray Merchant of Asphodel';

export const TOKENS = {
  goat: makeToken('Goat', 0, 1, 'white'),
  zombie: makeToken('Zombie', 2, 2, 'black'),
  insect: makeToken('Insect', 1, 1, 'black green'),
  warrior: makeToken('Warrior', 1, 1, 'red'),
  beast: makeToken('Beast', 3, 3, 'green'),
  snake: makeToken('Snake', 1, 1, 'black', ['deathtouch']),
  // a creature taken from an opponent's graveyard (Breach, Puppeteer Clique, Sepulchral Primordial)
  stolen: makeToken('Stolen creature', 5, 5),
};

/** How much we want a creature on the battlefield (Meren's target, tutors, reanimation). */
export const VALUE: Record<string, number> = {
  [GRAY_MERCHANT]: 100,
  'Sepulchral Primordial': 95,
  'Grave Titan': 90,
  'Twilight Diviner': 88,
  'Rune-Scarred Demon': 85,
  'Junji, the Midnight Sky': 80,
  'Puppeteer Clique': 78,
  'Morbid Opportunist': 72,
  'Protean Hulk': 70,
  'Viscera Seer': 70,
  'Vindictive Lich': 68,
  'Solemn Simulacrum': 66,
  'Priest of Forgotten Gods': 66,
  'Grim Haruspex': 65,
  'Eternal Witness': 64,
  'Avenger of the Fallen': 64,
  'Umbral Collar Zealot': 62,
  'Timeless Witness': 62,
  'Woe Strider': 60,
  'Simulacrum Shaper': 60,
  'Grim Servant': 60,
  'Fauna Shaman': 60,
  'Liliana the Repentant': 60,
  'Grist, the Hunger Tide': 60,
  'Vile Entomber': 58,
  'Butcher of Malakir': 55,
  'Wight of the Reliquary': 55,
  'Disciple of Bolas': 50,
  'Satyr Wayfinder': 50,
  "Garruk's Packleader": 50,
  Shriekmaw: 50,
  'Spore Frog': 50,
  'Grave Researcher': 50,
  Plaguecrafter: 45,
  "Demon's Disciple": 45,
  'Accursed Marauder': 45,
  'Sakura-Tribe Elder': 45,
  'Llanowar Elves': 40,
  'Studious First-Year': 35,
  'Insidious Fungus': 35,
  'Elvish Mystic': 40,
  'Fyndhorn Elves': 40,
  'Carrion Feeder': 40,
  "Stitcher's Supplier": 40,
  'Zulaport Cutthroat': 45,
  'Wood Elves': 42,
  'Sylvan Caryatid': 40,
  'Skull Prophet': 42,
  Ophiomancer: 45,
  'Reassembling Skeleton': 35,
  Gravedigger: 48,
  'Fleshbag Marauder': 40,
  [DGHOR_BLOODLETTER]: 45,
  'Massacre Wurm': 60,
  // card draw (Pontus, 2026-11-18: the draw swap round)
  [MIDNIGHT_REAPER]: 60,
  [TIRELESS_TRACKER]: 58,
  [AYARA]: 62,
  [CORPSE_AUGUR]: 42,
  'Elvish Visionary': 45,
  [SKULLCLAMP]: 55,
  [GREATER_GOOD]: 50,
  [MOLDERVINE_RECLAMATION]: 50,
};
export const MANA_ELVES = new Set([
  'Llanowar Elves',
  'Elvish Mystic',
  'Fyndhorn Elves',
  'Sylvan Caryatid',
  'Skull Prophet',
]);
/** Creatures whose death is worth something (we like sacrificing them; Meren brings them back). */
export const DEATH_VALUE = new Set([
  'Solemn Simulacrum',
  'Simulacrum Shaper',
  'Vindictive Lich',
  'Junji, the Midnight Sky',
  'Protean Hulk',
  'Puppeteer Clique',
  'Sakura-Tribe Elder',
  'Spore Frog',
  'Reassembling Skeleton',
  CORPSE_AUGUR, // draws a card for each creature card in our graveyard
]);
/** Creatures whose enter trigger is worth getting again (Meren returns them). */
export const ENTER_AGAIN = new Set([
  GRAY_MERCHANT,
  'Lotleth Giant',
  'Satyr Wayfinder',
  'Simulacrum Shaper',
  'Solemn Simulacrum',
  'Wood Elves',
  'Gravedigger',
  'Eternal Witness',
  'Timeless Witness',
  'Rune-Scarred Demon',
  'Vile Entomber',
  'Grim Servant',
  'Grave Titan',
  'Shriekmaw',
  'Plaguecrafter',
  "Demon's Disciple",
  'Accursed Marauder',
  'Fleshbag Marauder',
  DGHOR_BLOODLETTER,
  'Massacre Wurm',
  'Puppeteer Clique',
  'Sepulchral Primordial',
  'Elvish Visionary',
]);
/** Rise of the Dark Realms is cast with at least this many creature cards in our graveyard (the others' come too in a pod). */
export const RISE_MIN_CREATURES = 4;
/** Greater Good: sacrifice a creature with at least this much power (3 cards back for the 3 discarded: a rummage; Pontus,
 *  2026-11-19, it also fills the graveyard and feeds Meren). */
export const GREATER_GOOD_MIN_POWER = 3;
/** Greater Good is left alone (it would mill us out) with fewer cards than this in the library. */
export const GREATER_GOOD_MIN_LIBRARY = 15;
/** Discarding: a land beyond this many on the battlefield is surplus. */
export const SURPLUS_LANDS = 7;
/** Plumb the Forbidden: sacrifice at most this many creatures, and keep our life at this or more afterwards. */
export const PLUMB_MOST = 3;
export const PLUMB_LIFE_FLOOR = 15;
/** Disciple of Bolas: what one card (and one life) from its sacrifice is worth, in sacrifice-cost points. */
export const DISCIPLE_CARD_WORTH = 12;
/** Sacrifice a creature for free (Viscera Seer: any creature; the others: another creature). */
export const FREE_OUTLETS = [
  'Viscera Seer',
  'Umbral Collar Zealot',
  'Woe Strider',
  'Carrion Feeder',
];
/** Edicts: each player sacrifices a creature; we lose our worst one (opponents have none in a goldfish). */
export const EDICT_ETB = new Set([
  'Plaguecrafter',
  "Demon's Disciple",
  'Accursed Marauder',
  'Fleshbag Marauder',
  DGHOR_BLOODLETTER, // its other mode, -1/-1 to all other creatures, only in a pod (triggers.ts)
]);
// Solemn Simulacrum, Wood Elves and the Witnesses are engine cards (engine/game/common-permanents.ts)
// removal: no targets in a goldfish game, and only ever for an opponent's permanent in a pod (engine/game/answers.ts)
export const HOLD = new Set([
  'Heartless Act',
  'Infernal Grasp',
  'Beast Within',
]);

// every card this file has rules for (the rest of the list is lands and engine card facts)
C.registerKnown([
  ...Object.keys(VALUE),
  'Wood Elves',
  'Elvish Mystic',
  'Fyndhorn Elves',
  MEREN,
  'Lotleth Giant',
  'Accursed Marauder',
  'Avenger of the Fallen',
  'Beast Within',
  'Breach the Multiverse',
  'Buried Alive',
  'Deadly Brew',
  'Decode Transmissions',
  "Dina's Guidance",
  'Eldritch Evolution',
  'Grisly Salvage',
  'Heartless Act',
  'Infernal Grasp',
  'Persist',
  'Phyrexian Arena',
  'Saw in Half',
  'Songs of the Damned',
  'Unearth',
  'Vampiric Rites',
  'Victimize',
  'Village Rites',
  "Night's Whisper",
  'Grim Backwoods',
  ...Object.keys(SACRIFICE_DRAW_SPELLS),
]);

/** Every card of the deck that draws cards (and the rituals): --diag says in how many games each was played and how many
 *  cards it drew then. */
export const DRAW_CARDS = [
  'Dark Ritual',
  'Rise of the Dark Realms',
  'Songs of the Damned',
  'Decode Transmissions',
  'Diresight',
  "Night's Whisper",
  'Disciple of Bolas',
  "Garruk's Packleader",
  'Grim Haruspex',
  'Morbid Opportunist',
  'Phyrexian Arena',
  'Priest of Forgotten Gods',
  'Vampiric Rites',
  'Village Rites',
  'Simulacrum Shaper',
  'Insidious Fungus',
  'Deadly Dispute',
  'Plumb the Forbidden',
  SKULLCLAMP,
  MIDNIGHT_REAPER,
  CORPSE_AUGUR,
  GREATER_GOOD,
];
/** Cards that make us discard: --diag reports their net cards (drawn minus discarded). */
export const DISCARD_CARDS = [GREATER_GOOD];
/** Draws that count for another card: Clues are Tireless Tracker's. */
export const DRAW_SOURCE_COUNTS_FOR: Record<string, string> = {
  Clue: TIRELESS_TRACKER,
};
