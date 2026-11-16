/** Thantis, the Warweaver's deck: card names and values. The rules are in game.ts. */
import * as C from '../../engine/cards/cards';

export const THANTIS = 'Thantis, the Warweaver';
export const RURIC_THAR = 'Ruric Thar, the Unbowed';
export const LAVALEAPER = 'Lavaleaper';
export const ANGER = 'Anger';
export const BRAWN = 'Brawn';
export const SYR_KONRAD = 'Syr Konrad, the Grim';
export const SANGROMANCER = 'Sangromancer';
export const GRAVE_VENERATIONS = 'Grave Venerations';
export const DICTATE_OF_EREBOS = 'Dictate of Erebos';
export const MEREN = 'Meren of Clan Nel Toth';
export const AVACYN = 'Avacyn, Angel of Horror';
export const ALESHA = 'Alesha, Who Laughs at Fate';
export const ARCHON_OF_CRUELTY = 'Archon of Cruelty';
export const RAPH_AND_MIKEY = 'Raph & Mikey, Troublemakers';
export const GLISSA = 'Glissa Sunslayer';
export const SPINNER_OF_SOULS = 'Spinner of Souls';
export const MORBID_OPPORTUNIST = 'Morbid Opportunist';
export const PYREWOOD_GEARHULK = 'Pyrewood Gearhulk';
export const ZOPANDREL = 'Zopandrel, Hunger Dominus';
export const KARDUR = 'Kardur, Doomscourge';
export const GEODE_RAGER = 'Geode Rager';
export const GARRUKS_UPRISING = "Garruk's Uprising";
export const LURKING_PREDATORS = 'Lurking Predators';
export const RHYTHM_OF_THE_WILD = 'Rhythm of the Wild';
export const WHIP_OF_EREBOS = 'Whip of Erebos';
export const SELVALA = 'Selvala, Heart of the Wilds';
export const DELLIAN_FEL = 'Professor Dellian Fel';

/** How much the AI wants each card on the battlefield (the rest: 40 for a creature, 30 otherwise). */
export const VALUE: Record<string, number> = {
  [THANTIS]: 95,
  'Sol Ring': 90,
  'Arcane Signet': 75,
  'Chromatic Lantern': 70,
  'Talisman of Resilience': 70,
  'Sakura-Tribe Elder': 62,
  [SELVALA]: 74,
  [ZOPANDREL]: 82,
  'Yavimaya Elder': 55,
  'Icetill Explorer': 58,
  [RURIC_THAR]: 84,
  [LAVALEAPER]: 74,
  [ANGER]: 52,
  [BRAWN]: 50,
  'Taurean Mauler': 76,
  [SYR_KONRAD]: 80,
  [SANGROMANCER]: 74,
  'Titan Hunter': 58,
  [KARDUR]: 80,
  [GEODE_RAGER]: 76,
  [ALESHA]: 72,
  'Ares, God of War': 70,
  [AVACYN]: 84,
  'Chainer, Nightmare Adept': 64,
  Graveshifter: 62,
  [MEREN]: 76,
  'Eternal Witness': 64,
  'Archfiend of Depravity': 74,
  'Indulgent Tormentor': 72,
  [MORBID_OPPORTUNIST]: 64,
  [GLISSA]: 78,
  'Neyith of the Dire Hunt': 72,
  [SPINNER_OF_SOULS]: 66,
  [ARCHON_OF_CRUELTY]: 88,
  [RAPH_AND_MIKEY]: 86,
  [PYREWOOD_GEARHULK]: 84,
  'Shredder, Shadow Master': 76,
  [DELLIAN_FEL]: 66,
  [GRAVE_VENERATIONS]: 70,
  [DICTATE_OF_EREBOS]: 62,
  [GARRUKS_UPRISING]: 60,
  [LURKING_PREDATORS]: 66,
  [RHYTHM_OF_THE_WILD]: 56,
  [WHIP_OF_EREBOS]: 62,
  'Phyrexian Arena': 70,
  'Black Market': 45,
};

/** Cards never cast in a goldfish game: removal (the pod uses it as answers), and cards with no use alone. */
export const HOLD = new Set([
  "Assassin's Trophy",
  'Beast Within',
  'Blasphemous Edict',
  'Chaos Warp',
  'Deadly Rollick',
  'Tortured Existence',
]);

// (not the rocks: the engine finds a rock by its text only when no deck claims the card)
const ROCKS_BY_TEXT = new Set(['Talisman of Resilience']);
C.registerKnown([
  ...Object.keys(VALUE).filter((name) => !ROCKS_BY_TEXT.has(name)),
  ...HOLD,
  'Buried Alive',
]);
