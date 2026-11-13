/** The cards of the Mike deck that have rules of their own, and the facts about them. */
import * as C from '../../engine/cards';
import { makeToken } from '../../engine/cards';

export const VNWXT = 'Vnwxt, Verbose Host';
export const PSYCHOSIS_CRAWLER = 'Psychosis Crawler';
export const OMINOUS_SEAS = 'Ominous Seas';
export const KRANG = 'Krang, the All-Powerful';
export const TEFERIS_AGELESS_INSIGHT = "Teferi's Ageless Insight";
export const LABORATORY_MANIAC = 'Laboratory Maniac';
export const JACE = 'Jace, Wielder of Mysteries';
export const TWENTY_TOED_TOAD = 'Twenty-Toed Toad';
export const LIVING_CONUNDRUM = 'Living Conundrum';
export const ORMOS_ARCHIVE_KEEPER = 'Ormos, Archive Keeper';
export const CLINQUANT_SKYMAGE = 'Clinquant Skymage';
export const ONEIROPHAGE = 'Oneirophage';
export const EMRAKULS_MESSENGER = "Emrakul's Messenger";
export const MISCHIEVOUS_MYSTIC = 'Mischievous Mystic';
export const AURORA_SHIFTER = 'Aurora Shifter';
export const ROIL_CARTOGRAPHER = 'Roil Cartographer';
export const SHIELDED_AETHER_THIEF = 'Shielded Aether Thief';
export const WIZARD_CLASS = 'Wizard Class';
export const HAND_OF_VECNA = 'Hand of Vecna';
export const NERD_RAGE = 'Nerd Rage';
export const AQUEOUS_FORM = 'Aqueous Form';
export const ATOMIC_MICROSIZER = 'Atomic Microsizer';
export const FOLIO_OF_FANCIES = 'Folio of Fancies';
export const COMMANDERS_SPHERE = "Commander's Sphere";
export const WATER_CRYSTAL = 'The Water Crystal';
export const PENSIVE_PROFESSOR = 'Pensive Professor';
export const FBLTHP = 'Fblthp, Impossibly Lost';
export const SPECTRAL_SAILOR = 'Spectral Sailor';
export const STRIX_LOOKOUT = 'Strix Lookout';
export const SHORELINE_LOOTER = 'Shoreline Looter';
export const LOOTER_IL_KOR = 'Looter il-Kor';
export const HARMONIZED_TRIO = 'Harmonized Trio';
export const MYSTIC_SANCTUARY = 'Mystic Sanctuary';
export const ROGUES_PASSAGE = "Rogue's Passage";
export const AVISHKAR_RACEWAY = 'Avishkar Raceway';
export const MURAGANDA_RACEWAY = 'Muraganda Raceway';
export const AMONKHET_RACEWAY = 'Amonkhet Raceway';
export const SLICK_IMITATOR = 'Slick Imitator';
/** Archidekt trackers (see syncFromLog). */
export const LOG_TRACKERS = [
  'Start Your Engines! // Max Speed',
  'Energy Reserve',
];

export const TOK = {
  kraken: makeToken('Kraken', 8, 8, 'blue'),
  spawn: makeToken('Eldrazi Spawn', 0, 1),
  faerie: makeToken('Faerie', 1, 1, 'blue', ['flying']),
};

/** Permanent.marks bits. */
export const MARK_AQUEOUS_FORM = 1; // enchanted with Aqueous Form (can't be blocked)
export const MARK_HAND_OF_VECNA = 2; // equipped with Hand of Vecna
export const MARK_NERD_RAGE = 4; // enchanted with Nerd Rage
export const MARK_ATOMIC_MICROSIZER = 8; // equipped with Atomic Microsizer
export const MARK_UNBLOCKABLE_THIS_TURN = 16; // Rogue's Passage / Gingerbrute this turn

/** Creatures that can't be blocked (or have shadow). */
export const UNBLOCKABLE = new Set([
  SHORELINE_LOOTER,
  LOOTER_IL_KOR,
  'Invisible Stalker',
  'Slither Blade',
  'Gingerbrute',
]);

/** How much we want each card on the battlefield / to cast it (casting order, discards, the planner's score). */
export const VALUE: Record<string, number> = {
  'Sol Ring': 100,
  [VNWXT]: 92,
  'Arcane Signet': 84,
  'Thought Vessel': 72,
  [TEFERIS_AGELESS_INSIGHT]: 78,
  [KRANG]: 70,
  [PSYCHOSIS_CRAWLER]: 68,
  [OMINOUS_SEAS]: 66,
  [CLINQUANT_SKYMAGE]: 60,
  [ONEIROPHAGE]: 60,
  [EMRAKULS_MESSENGER]: 60,
  [MISCHIEVOUS_MYSTIC]: 60,
  [WIZARD_CLASS]: 64,
  [ROIL_CARTOGRAPHER]: 54,
  [SHIELDED_AETHER_THIEF]: 40,
  [STRIX_LOOKOUT]: 48,
  [SPECTRAL_SAILOR]: 52,
  [LOOTER_IL_KOR]: 50,
  [SHORELINE_LOOTER]: 56,
  'Loyal Drake': 56,
  'Body of Knowledge': 56,
  [PENSIVE_PROFESSOR]: 50,
  [ORMOS_ARCHIVE_KEEPER]: 62,
  [LIVING_CONUNDRUM]: 58,
  [JACE]: 85,
  [LABORATORY_MANIAC]: 80,
  [TWENTY_TOED_TOAD]: 76,
  [FOLIO_OF_FANCIES]: 54,
  [NERD_RAGE]: 50,
  [HAND_OF_VECNA]: 50,
  [AQUEOUS_FORM]: 38,
  [ATOMIC_MICROSIZER]: 30,
  Gingerbrute: 44,
  'Invisible Stalker': 50,
  'Slither Blade': 46,
  [AURORA_SHIFTER]: 54,
  [SLICK_IMITATOR]: 44,
  [HARMONIZED_TRIO]: 36,
  'Thunderclap Drake': 58,
  'Volatile Stormdrake': 44,
  'Diversion Unit': 42,
  'Siren Stormtamer': 40,
  [COMMANDERS_SPHERE]: 60,
  [WATER_CRYSTAL]: 52,
  [FBLTHP]: 46,
  // spells
  Brainstorm: 58,
  Consider: 52,
  'Tune the Narrative': 54,
  'Frantic Search': 56,
  Flux: 40,
  Windfall: 45,
  'Pull from Tomorrow': 62,
  'Treasure Cruise': 60,
};
/** Interaction: no targets in a goldfish game (held; they stay in hand, so they count for the Toad's twenty). */
export const HOLD = new Set([
  'Aether Spike',
  'Negate',
  'Refute',
  'Spell Pierce',
  'Spell Syphon',
  'Aether Gale',
  'Aetherize',
  'Evacuation',
  'Pongify',
  'Rapid Hybridization',
  'Reality Shift',
  'Wash Out',
]);
/** Cards this file has rules for (lands, Sol Ring, Signet and Sphere are engine facts). */
C.registerKnown([
  ...Object.keys(VALUE),
  ...HOLD,
  VNWXT,
  MYSTIC_SANCTUARY,
  ROGUES_PASSAGE,
  AVISHKAR_RACEWAY,
  MURAGANDA_RACEWAY,
  AMONKHET_RACEWAY,
  'Harmonized Trio // Brainstorm',
  'Gingerbrute',
]);

/** Draw spells worth a Slick Imitator copy. */
export const DRAW_SPELLS_WORTH_COPYING = new Set([
  'Pull from Tomorrow',
  'Treasure Cruise',
  'Brainstorm',
  'Windfall',
  'Flux',
]);
export const COUNTERSPELLS = new Set([
  'Aether Spike',
  'Negate',
  'Refute',
  'Spell Pierce',
  'Spell Syphon',
  'Diversion Unit',
]);
