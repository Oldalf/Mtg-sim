/** Helga, Skittish Seer's deck: card names, values and tokens. The rules are in game.ts. */
import * as C from '../../engine/cards/cards';
import { makeToken } from '../../engine/cards/cards';

export const HELGA = 'Helga, Skittish Seer';
export const GORECLAW = 'Goreclaw, Terror of Qal Sisma';
export const RADAGAST = 'Radagast of Rhosgobel';
export const CRATERHOOF = 'Craterhoof Behemoth';
export const AKROMAS_MEMORIAL = "Akroma's Memorial";
export const LIGHTNING_GREAVES = 'Lightning Greaves';
export const OB_NIXILIS = 'Ob Nixilis, the Ascended';
export const KOMA = 'Koma, World-Eater';
export const REGAL_BEHEMOTH = 'Regal Behemoth';

export const ULAMOG_THE_DEFILER = 'Ulamog, the Defiler';

/** Annihilator N of each card that has a fixed N (Ulamog, the Defiler's X is its +1/+1 counters). */
export const ANNIHILATOR: Record<string, number> = {
  'Kozilek, Butcher of Truth': 4,
  "Ulamog's Crusher": 2,
  'It That Betrays': 2,
};

/** Ulamog, the Defiler enters with counters equal to the greatest mana value in exile, after an opponent exiles the
 *  top half of their library. We do not look at that library: with about 50 cards exiled it is nearly always a
 *  6-drop or bigger. */
export const DEFILER_COUNTERS_IN_A_POD = 6;

/** Terastodon only blows up a permanent worth this much: the owner gets a 3/3 for it. */
export const TERASTODON_MINIMUM_TARGET_VALUE = 45;

export const TOKENS = {
  eldrazi: makeToken('Eldrazi', 10, 10),
  angel: makeToken('Angel', 4, 4, 'white', ['flying']),
  serpent: makeToken("Koma's Coil", 3, 3, 'blue'),
};

/** How much the AI wants each card on the battlefield (the rest: 40 for a creature, 30 otherwise). */
export const VALUE: Record<string, number> = {
  [HELGA]: 95,
  'Sol Ring': 90,
  'Arcane Signet': 75,
  'Fellwar Stone': 70,
  'Thought Vessel': 65,
  'Chromatic Lantern': 65,
  'Llanowar Elves': 70,
  'Sakura-Tribe Elder': 65,
  [GORECLAW]: 75,
  [RADAGAST]: 72,
  "Garruk's Uprising": 70,
  'Elemental Bond': 66,
  'Guardian Project': 66,
  'Colossal Majesty': 64,
  [LIGHTNING_GREAVES]: 55,
  [AKROMAS_MEMORIAL]: 80,
  [CRATERHOOF]: 92,
  'Kozilek, Butcher of Truth': 90,
  'Ulamog, the Ceaseless Hunger': 88,
  [ULAMOG_THE_DEFILER]: 86,
  'Desolation Twin': 88,
  'Apex Devastator': 88,
  [KOMA]: 88,
  'It That Betrays': 80,
  "Ulamog's Crusher": 75,
  'Breaker of Armies': 76,
  'Kozilek, the Broken Reality': 80,
  'Aggressive Mammoth': 82,
  'Myojin of Towering Might': 82,
  'Demolisher Spawn': 78,
  'Moldgraf Monstrosity': 72,
  Terastodon: 74,
  [OB_NIXILIS]: 78,
  "Serra's Emissary": 80,
  'Angel of the Ruins': 70,
  'Stormsurge Kraken': 72,
  [REGAL_BEHEMOTH]: 74,
  "Verdant Sun's Avatar": 68,
  'Ohran Frostfang': 70,
  'Selvala, Heart of the Wilds': 62,
  'Solemn Simulacrum': 66,
  'Seedborn Muse': 40,
  'Wilderness Reclamation': 30,
  'Omnath, Locus of the Void': 60,
  'Ruin Processor': 62,
  'Wandering Archaic': 55,
};

/** Cards never cast in a goldfish game: removal and counterspells have no target (the pod uses them as answers). */
export const HOLD = new Set([
  'Path to Exile',
  'Swords to Plowshares',
  'Beast Within',
  'Return to Nature',
  'Cancel',
  'Counterspell',
  'Negate',
  "An Offer You Can't Refuse",
  "Akroma's Will",
  'Aura Shards',
]);

/** Land-search spells and other cheap ramp, cast early. */
export const RAMP_SPELLS = new Set([
  'Rampant Growth',
  'Farseek',
  'Cultivate',
  'Explore',
]);

// (not Thought Vessel: the engine finds a rock by its text only when no deck claims the card)
C.registerKnown([
  ...Object.keys(VALUE).filter((name) => name !== 'Thought Vessel'),
  ...HOLD,
  'Become the Avalanche',
  "Rishkar's Expertise",
]);
