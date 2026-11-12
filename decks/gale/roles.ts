/** What each card is *for* in the Gale deck (the engine's card facts are in engine/cards.ts). */
import * as C from '../../engine/cards';

export const GALE = 'Gale, Waterdeep Prodigy';
export const SCION = 'Scion of Halaster';

/** Combo permanents */
export const COMBO_PERMS = new Set([
  'Duskmantle Guildmage',
  'Mindcrank',
  'Syr Konrad, the Grim',
  'The Mindskinner',
  'Riverchurn Monument',
]);
/** Spells the kill search knows how to use */
export const COMBO_SPELLS = new Set([
  'Maddening Cacophony',
  'Traumatize',
  'Cut Your Losses',
  'Singularity Rupture',
  'Windfall',
  'Extended Absence',
  'Dark Ritual',
  'High Tide',
  'Bubbling Muck',
  'Frantic Search',
  'Snap',
  'Unearth',
  'Energybending',
  'Prologue to Phyresis',
  'Expansion Algorithm', // poison: 1 counter, then proliferate X times
  'Turnabout', // untap all your lands (kill turn only)
  'Cabal Ritual',
  'Energy Tap',
  'Drain Power',
]); // rituals
export const ENGINES = new Set([
  'Archmage Emeritus',
  'Archmage of Runes',
  'Academy Wall',
  'Secrets of the Dead',
  'Baleful Strix',
  'Curious Homunculus',
  'Emet-Selch of the Third Seat',
]);
/** Never cast these outside a kill */
export const COMBO_SORC = new Set([
  'Maddening Cacophony',
  'Traumatize',
  'Cut Your Losses',
  'Singularity Rupture',
  'Extended Absence',
  'Expansion Algorithm',
  'Turnabout',
]);

C.registerKnown([...COMBO_PERMS, ...COMBO_SPELLS, ...ENGINES, GALE, SCION]);

export const PACKAGES: Set<string>[][] = [
  [
    new Set(['Duskmantle Guildmage']),
    new Set(['Mindcrank']),
    new Set([
      'Maddening Cacophony',
      'Windfall',
      'Riverchurn Monument',
      'Syr Konrad, the Grim',
      'Extended Absence',
      'Singularity Rupture',
    ]),
  ],
  [
    new Set(['Duskmantle Guildmage']),
    new Set(['Maddening Cacophony', 'Singularity Rupture']),
  ],
  [new Set(['Maddening Cacophony']), new Set(['Riverchurn Monument'])],
  [new Set(['The Mindskinner']), new Set(['Syr Konrad, the Grim'])],
  [new Set(['Expansion Algorithm']), new Set(['Prologue to Phyresis'])],
];
export const RAMP_PREFS = [
  'Sol Ring',
  'Arcane Signet',
  'Fellwar Stone',
  'Talisman of Dominance',
  'Dimir Signet',
  "Bender's Waterskin",
  'Baral, Chief of Compliance',
  'Mocking Sprite',
  'Thunderclap Drake',
];
export const PERM_SCORE: Record<string, number> = {
  'Sol Ring': 100,
  'Arcane Signet': 88,
  'Dimir Signet': 86,
  'Fellwar Stone': 88,
  'Talisman of Dominance': 88,
  "Bender's Waterskin": 80,
  'Baral, Chief of Compliance': 77,
  'Mocking Sprite': 75,
  'Thunderclap Drake': 76,
  'Geist of Saint Thalia': 74,
  'Nightscape Familiar': 72,
  'Wizards of Thay': 73,
  'Case of the Ransacked Lab': 74,
  'Curious Homunculus': 71,
  'Emet-Selch of the Third Seat': 69,
  'Archmage Emeritus': 73,
  'Baleful Strix': 66,
  'Academy Wall': 60,
  'Secrets of the Dead': 52,
  'The Mindskinner': 69,
  'Duskmantle Guildmage': 64,
  Mindcrank: 62,
  'Riverchurn Monument': 61,
  'Syr Konrad, the Grim': 58,
  'Sapphire Medallion': 76,
  'Archmage of Runes': 75,
  'Peregrine Drake': 62,
  'Cloud of Faeries': 64,
};
export const permScore = (name: string, defaultScore: number) =>
  PERM_SCORE[name] ?? defaultScore;
export const SELF_COUNTER_DEV = [
  "An Offer You Can't Refuse",
  'Unwind',
  'Rewind',
];
