/** The cards of the Meren deck that have rules of their own, and the facts about them. */
import * as C from '../../engine/cards';
import { makeToken } from '../../engine/cards';

export const MEREN = 'Meren of Clan Nel Toth';
export const GRAY_MERCHANT = 'Gray Merchant of Asphodel';

export const TOKENS = {
  goat: makeToken('Goat', 0, 1, 'white'),
  zombie: makeToken('Zombie', 2, 2, 'black'),
  insect: makeToken('Insect', 1, 1, 'black green'),
  warrior: makeToken('Warrior', 1, 1, 'red'),
  beast: makeToken('Beast', 3, 3, 'green'),
  snake: makeToken('Snake', 1, 1, 'black'),
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
]);
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
]);
export const LAND_ETB = new Set([
  'Simulacrum Shaper',
  'Solemn Simulacrum',
  'Wood Elves',
]);
export const DRAW_ON_DEATH = new Set([
  'Simulacrum Shaper',
  'Solemn Simulacrum',
]);
export const HOLD = new Set(['Heartless Act', 'Infernal Grasp']); // removal: no targets in a goldfish game

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
]);
