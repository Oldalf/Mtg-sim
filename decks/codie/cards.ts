/** The cards of the Codie deck that have rules of their own, and the facts about them. */
import * as C from '../../engine/cards';
import { CardDef } from '../../engine/cards';

export const CODIE = 'Codie, Vociferous Codex';
export const REITERATE = 'Reiterate';
export const JESKAS_WILL = "Jeska's Will";
export const MANA_GEYSER = 'Mana Geyser';
export const BRASS_BOUNTY = "Brass's Bounty";
export const RETURN_THE_FAVOR = 'Return the Favor';
export const EXSANGUINATE = 'Exsanguinate';
export const CRACKLE_WITH_POWER = 'Crackle with Power';
export const TORMENT_OF_HAILFIRE = 'Torment of Hailfire';
export const AD_NAUSEAM = 'Ad Nauseam';
export const TEFERIS_PROTECTION = "Teferi's Protection";
export const DEMONIC_TUTOR = 'Demonic Tutor';
export const FINISHERS = [
  EXSANGUINATE,
  CRACKLE_WITH_POWER,
  TORMENT_OF_HAILFIRE,
];
export const LIM_DUL_VAULT = "Lim-Dûl's Vault";
export const FLASHBACK = 'Flashback';
export const PROFANE_TUTOR = 'Profane Tutor'; // the one mana value 0 instant or sorcery: Codie finds it for any spell of mana value 1
/** Mana value 1 spells that can be cast with no target: they trigger Codie's free spell (Profane Tutor). */
export const TRIGGER_SPELLS = [
  'Dark Ritual',
  'Silence',
  "Orim's Chant",
  'Fog',
  "Autumn's Veil",
];
/** Spells that make mana when they resolve, and can be copied by Reiterate. */
export const MANA_SPELLS = [
  JESKAS_WILL,
  MANA_GEYSER,
  BRASS_BOUNTY,
  'Seething Song',
  'Pyretic Ritual',
  'Dark Ritual',
];

/** A Treasure token: any colour, gone when tapped. */
export const TREASURE = new CardDef('Treasure', {
  name: 'Treasure',
  type_line: 'Token Artifact — Treasure',
  token: true,
} as never);

/** Counterspells and protection that make a win "backed up": [cost, needs]. needs: "commander" (Codie on the battlefield), "island" (an Island to return). */
export const BACKUP: Record<string, [string, string?]> = {
  Silence: ['{W}'],
  "Orim's Chant": ['{W}'],
  Counterspell: ['{U}{U}'],
  'Mana Drain': ['{U}{U}'],
  'Arcane Denial': ['{1}{U}'],
  "An Offer You Can't Refuse": ['{U}'],
  'Fierce Guardianship': ['{0}', 'commander'],
  Daze: ['{0}', 'island'],
  "Bilbo's Gambit": ['{1}{W}'],
  "Autumn's Veil": ['{G}'],
  "Narset's Reversal": ['{U}{U}'],
};
/** Cards the AI keeps in hand during development (interaction, protection and the pieces only the solver uses). */
export const HOLD = new Set([
  ...Object.keys(BACKUP),
  'Fog',
  'Constant Mists',
  "Teferi's Protection",
  "Avatar's Wrath",
  'Path to Exile',
  'Sundering Eruption',
  'Return the Favor',
  REITERATE,
  JESKAS_WILL,
  MANA_GEYSER,
  BRASS_BOUNTY,
  'Seething Song',
  'Pyretic Ritual',
  'Dark Ritual',
  'Elvish Spirit Guide',
  'Simian Spirit Guide',
  "Mizzix's Mastery",
  'Spelltwine',
  'Flashback',
  'Bala Ged Recovery',
  'Splendid Reclamation',
  'Mana Geyser',
  EXSANGUINATE,
  CRACKLE_WITH_POWER,
  TORMENT_OF_HAILFIRE,
  'Bring to Light',
  'Scapeshift',
  'Crop Rotation',
]);

/** Land-fetching spells: [cost, what]. what: basic = a basic land; forest = a Forest card; types = a land with a basic land type. */
export const FETCH: Record<
  string,
  {
    landCount: number;
    tapped: boolean;
    kind: 'basic' | 'forest' | 'types' | 'any';
    landsToSacrifice?: number;
    secondLandToHand?: boolean;
  }
> = {
  'Rampant Growth': { landCount: 1, tapped: true, kind: 'basic' },
  'Shared Roots': { landCount: 1, tapped: true, kind: 'basic' },
  Farseek: { landCount: 1, tapped: true, kind: 'types' },
  "Nature's Lore": { landCount: 1, tapped: false, kind: 'forest' },
  'Three Visits': { landCount: 1, tapped: false, kind: 'forest' },
  Cultivate: {
    landCount: 1,
    tapped: true,
    kind: 'basic',
    secondLandToHand: true,
  },
  'Explosive Vegetation': { landCount: 2, tapped: true, kind: 'basic' },
  'Grow from the Ashes': { landCount: 1, tapped: false, kind: 'basic' },
  'Cycle of Renewal': {
    landCount: 2,
    tapped: true,
    kind: 'basic',
    landsToSacrifice: 1,
  },
  'Planar Engineering': {
    landCount: 4,
    tapped: true,
    kind: 'basic',
    landsToSacrifice: 2,
  },
  'Hour of Promise': { landCount: 2, tapped: true, kind: 'any' },
};
/** How much we want to cast each spell during development. */
export const VALUE: Record<string, number> = {
  "Nature's Lore": 88,
  'Three Visits': 88,
  'Rampant Growth': 86,
  Farseek: 86,
  'Shared Roots': 82,
  Cultivate: 84,
  'Grow from the Ashes': 78,
  'Explosive Vegetation': 74,
  'Cycle of Renewal': 40,
  'Planar Engineering': 50,
  'Hour of Promise': 60,
  'Sylvan Scrying': 62,
  'Growth Spiral': 60,
  Manamorphose: 70,
  Brainstorm: 52,
  'Flow State': 50,
  'Stock Up': 54,
  'Frantic Search': 40,
  Windfall: 44,
  'Valakut Awakening': 30,
  'Demonic Tutor': 66,
  'Vampiric Tutor': 50,
  'Personal Tutor': 40,
  'Merchant Scroll': 40,
  "Lim-Dûl's Vault": 36,
  'Profane Tutor': 36,
  [AD_NAUSEAM]: 56,
  [CODIE]: 95,
};

C.registerKnown([
  ...Object.keys(VALUE),
  ...HOLD,
  CODIE,
  'Sylvan Scrying',
  'Valakut Awakening // Valakut Stoneforge',
  'Bala Ged Recovery // Bala Ged Sanctuary',
  'Sundering Eruption // Volcanic Fissure',
]);
