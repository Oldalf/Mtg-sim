/** The cards of the Aesi deck that have rules of their own, and the facts about them. */
import * as C from '../../engine/cards';
import { CardDef, makeToken } from '../../engine/cards';

export const AESI = 'Aesi, Tyrant of Gyre Strait';
export const RETREAT = 'Retreat to Coralhelm';
export const RAFT = 'Elven Raft-Steerer'; // landfall: tap an opposing creature / untap a creature of ours (Retreat's untap, as a creature)
export const TATYOVA = 'Tatyova, Benthic Druid'; // landfall: gain 1 life, draw a card (always)
export const LORE = "Nature's Lore"; // a Forest onto the battlefield untapped
export const THREE = 'Three Visits'; // the same as Nature's Lore
export const CLAIM = 'Skyshroud Claim'; // two Forests onto the battlefield untapped
export const ELVES = 'Wood Elves'; // a creature: a Forest onto the battlefield untapped when it enters
export const SEARCH = 'Search for Tomorrow'; // a basic untapped; suspend 2 for {G}
export const KODAMA = 'Kodama of the East Tree';
export const MELOKU = 'Meloku the Clouded Mirror';
export const UYO = 'Uyo, Silent Prophet';
export const MINDSWEEPER = 'Soratami Mindsweeper';
export const COBRA = 'Lotus Cobra';
export const OMNI = 'Omniscience';
export const KIRI = 'Kiri-Onna';
export const HARU = 'Haru-Onna';
export const BSZ = "Blue Sun's Zenith";
export const SWARM = 'Endless Swarm';
export const DOMINION = 'Eternal Dominion';
export const CHAMBER = 'Simic Growth Chamber';
export const PATRON = 'Patron of the Moon';
export const BUDOKA = 'Budoka Gardener';
export const DRUID = 'Druid Class';
export const CASE = 'Case of the Locked Hothouse';
export const SAGA = "Azusa's Many Journeys";
export const BEANSTALK = 'Beanstalk Giant';
export const KHALNI = 'Khalni Heart Expedition';
// candidates for the list (Pontus, 2026-11-05)
export const REVOLT = "Nature's Revolt";
export const AFFINITY = 'Natural Affinity';
export const AWAKENING = 'Sylvan Awakening';
export const SCRYING = 'Sylvan Scrying';
export const MAP = 'Expedition Map';
export const CROP = 'Crop Rotation';
export const MYRIAD = 'Myriad Landscape';
export const PASSAGE = 'Fabled Passage';
/** Spells worth an Uyo copy outside a loop (they fetch or draw; the two returned lands are replayed). */
export const UYO_COPY = new Set([
  'Explosive Vegetation',
  'Circuitous Route',
  'Reach the Horizon',
  'Cultivate',
  'Grow from the Ashes',
  'Harrow',
  "Nissa's Pilgrimage",
  'Entish Restoration',
  'Rampant Growth',
  'Farseek',
  'Explore',
  'Growth Spiral',
  SCRYING,
]);
export const FETCHES_TWO = new Set([
  'Explosive Vegetation',
  'Circuitous Route',
  'Reach the Horizon',
  'Cultivate',
  'Grow from the Ashes',
  'Harrow',
  "Nissa's Pilgrimage",
  'Entish Restoration',
]);

/** "{T}: You may put a land card from your hand onto the battlefield." (Budoka flips at 10 lands.) */
export const PUTTERS = new Set([
  'Walking Atlas',
  'Sakura-Tribe Scout',
  'PuPu UFO',
  BUDOKA,
]);
/** Moonfolk "{c}, return n lands you control to their owner's hand: effect". */
export const RETURNERS: Record<string, [number, number, string]> = {
  [MELOKU]: [1, 1, 'token'],
  Floodbringer: [2, 1, 'none'],
  'Moonbow Illusionist': [2, 1, 'none'],
  'Oboro Breezecaller': [2, 1, 'untap'],
  [UYO]: [2, 2, 'copy'],
  'Soratami Savant': [3, 1, 'counter'], // needs a spell to counter: not used in loops
  'Soratami Cloudskater': [2, 1, 'loot'],
  'Soratami Mirror-Guard': [2, 1, 'none'],
  [MINDSWEEPER]: [2, 1, 'mill'],
  'Oboro Envoy': [2, 1, 'none'],
  'Soratami Rainshaper': [3, 1, 'none'],
  'Soratami Mirror-Mage': [3, 3, 'none'],
};
/** Activated abilities of creatures cost this much less (never below one mana). */
export const REDUCERS: Record<string, number> = {
  "Biomancer's Familiar": 2,
  'Training Grounds': 2,
  Heartstone: 1,
};
/** Spirits (Haru-Onna and Kiri-Onna return to hand when one is cast). */
export const SPIRITS = new Set([
  KIRI,
  HARU,
  KODAMA,
  PATRON,
  'Kira, Great Glass-Spinner',
]);
export const TOK = {
  illusion: makeToken('Illusion', 1, 1, 'blue', ['flying']),
  snake: makeToken('Snake', 1, 1, 'green'),
  illusionArmy: makeToken('Illusion army', 999, 999, 'blue', ['flying']),
  snakeArmy: makeToken('Snake army', 999, 999, 'green'),
};
/** A land Eternal Dominion takes from an opponent (any colour). */
export const STOLEN_LAND = new CardDef('Stolen land', {
  name: 'Stolen land',
  type_line: 'Land',
  oracle: '{T}: Add one mana of any color.',
} as never);

/** How much we want each card on the battlefield (casting order, discards, the planner's score). */
export const VALUE: Record<string, number> = {
  'Sol Ring': 100,
  [AESI]: 96,
  [OMNI]: 90,
  'Azusa, Lost but Seeking': 86,
  [RETREAT]: 84,
  [COBRA]: 82,
  [RAFT]: 70,
  [TATYOVA]: 80,
  [LORE]: 80,
  [THREE]: 80,
  [CLAIM]: 74,
  [ELVES]: 78,
  [SEARCH]: 78,
  "Biomancer's Familiar": 82,
  [MELOKU]: 82,
  'Loot, Exuberant Explorer': 80,
  [KODAMA]: 80,
  'Walking Atlas': 76,
  'Training Grounds': 74,
  [PATRON]: 74,
  'Sakura-Tribe Scout': 74,
  'PuPu UFO': 74,
  [UYO]: 72,
  [CASE]: 72,
  [DRUID]: 70,
  [BUDOKA]: 70,
  [MINDSWEEPER]: 70,
  'Oboro Breezecaller': 66,
  'Into the Wilds': 64,
  Heartstone: 62,
  [SAGA]: 60,
  [KHALNI]: 58,
  'Soratami Mirror-Mage': 55,
  'Soratami Cloudskater': 56,
  [HARU]: 52,
  [KIRI]: 46,
  'Graceful Adept': 45,
  Floodbringer: 48,
  'Moonbow Illusionist': 48,
  'Soratami Mirror-Guard': 46,
  'Oboro Envoy': 45,
  'Soratami Rainshaper': 45,
  'Soratami Savant': 44,
  [BEANSTALK]: 60,
  'Sakura-Tribe Elder': 66,
  'Kira, Great Glass-Spinner': 30,
  // spells
  'Growth Spiral': 74,
  Explore: 68,
  Harrow: 80,
  'Rampant Growth': 78,
  Farseek: 78,
  Cultivate: 76,
  "Nissa's Pilgrimage": 74,
  'Explosive Vegetation': 76,
  'Circuitous Route': 74,
  'Reach the Horizon': 74,
  'Grow from the Ashes': 72,
  'Entish Restoration': 74,
  'Early Harvest': 50,
  'Summer Bloom': 50,
  'Seismic Sense': 55,
  Bushwhack: 45,
  [BSZ]: 60,
  [SWARM]: 40,
  [DOMINION]: 30,
  [REVOLT]: 30,
  [AFFINITY]: 30,
  [AWAKENING]: 35,
  [SCRYING]: 62,
  [MAP]: 50,
  [CROP]: 30,
};
/** Interaction: no targets in a goldfish game (held; the first cards to discard). */
export const HOLD = new Set(['Divert Disaster', 'Wash Away', 'Beast Within']);
/** Ramp: great early, much less later. */
export const RAMP = new Set([
  'Rampant Growth',
  'Farseek',
  'Cultivate',
  "Nissa's Pilgrimage",
  'Explosive Vegetation',
  'Circuitous Route',
  'Reach the Horizon',
  'Grow from the Ashes',
  'Entish Restoration',
  'Harrow',
  'Sakura-Tribe Elder',
  'Sol Ring',
  'Khalni Heart Expedition',
  'Into the Wilds',
  LORE,
  THREE,
  CLAIM,
  ELVES,
  SEARCH,
]);
/** What the loop solver casts once a loop is going, best first (they make the loop bigger or win). */
export const LOOP_CAST = [
  "Biomancer's Familiar",
  'Training Grounds',
  'Heartstone',
  COBRA,
  RETREAT,
  RAFT,
  TATYOVA,
  KODAMA,
  MELOKU,
  MINDSWEEPER,
  UYO,
  'Oboro Breezecaller',
  'Soratami Mirror-Mage',
  'Graceful Adept',
  OMNI,
  'Walking Atlas',
  'Sakura-Tribe Scout',
  'PuPu UFO',
  PATRON,
  'Soratami Cloudskater',
  'Azusa, Lost but Seeking',
  'Loot, Exuberant Explorer',
];
export const BASIC_COL: Record<string, string> = { Forest: 'G', Island: 'U' };

// every card this file has rules for (lands, Sol Ring are engine facts)
C.registerKnown([
  ...Object.keys(VALUE),
  ...HOLD,
  ...PUTTERS,
  ...Object.keys(RETURNERS),
  ...Object.keys(REDUCERS),
  CHAMBER,
  'Demolition Field',
  'Terramorphic Expanse',
  'Guildless Commons',
  MYRIAD,
  PASSAGE,
]);
