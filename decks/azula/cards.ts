/** Fire Lord Azula's deck: card names and values. The rules are in game.ts, spells.ts and combos.ts. */
import * as C from '../../engine/cards/cards';
import {
  ARCHMAGE_EMERITUS,
  ARCHMAGE_OF_RUNES,
  STORM_KILN_ARTIST,
  TWINNING_STAFF,
  VEYRAN,
} from '../../engine/game/spell-copies';

export {
  ARCHMAGE_EMERITUS,
  ARCHMAGE_OF_RUNES,
  STORM_KILN_ARTIST,
  TWINNING_STAFF,
  VEYRAN,
};

export const AZULA = 'Fire Lord Azula';
// combo pieces
export const REITERATE = 'Reiterate';
export const REVERBERATE = 'Reverberate';
export const NARSETS_REVERSAL = "Narset's Reversal";
export const JESKAS_WILL = "Jeska's Will";
export const MANA_GEYSER = 'Mana Geyser';
export const SEETHING_SONG = 'Seething Song';
export const FRANTIC_SEARCH = 'Frantic Search';
export const PRISMARI = 'Prismari, the Inspiration';
// finishers
export const LIGHTNING_BOLT = 'Lightning Bolt';
export const KILL_MAIM_BURN = 'Kill! Maim! Burn!';
export const BREATH_OF_MALFEGOR = 'Breath of Malfegor';
export const ELECTRODOMINANCE = 'Electrodominance';
export const TORMENT_OF_HAILFIRE = 'Torment of Hailfire';
export const SCARRING_MEMORIES = 'Scarring Memories';
export const VIVI = 'Vivi Ornitier';
// spells during combat and free casts
export const ARCANE_BOMBARDMENT = 'Arcane Bombardment';
export const STORM_OF_SARUMAN = 'Storm of Saruman';
export const MYSTERIOUS_STRANGER = 'Mysterious Stranger';
export const TORRENTIAL_GEARHULK = 'Torrential Gearhulk';
export const SOZINS_COMET = "Sozin's Comet";
export const FIREBENDER_ASCENSION = 'Firebender Ascension';
export const OZAI = 'Ozai, the Phoenix King';
export const FATED_FIREPOWER = 'Fated Firepower';
/** "You may cast spells as though they had flash" (Wizards of Thay: sorceries only). */
export const FLASH_FOR_ALL = new Set([
  'Leyline of Anticipation',
  'High Fae Trickster',
  'Valley Floodcaller', // (noncreature spells)
]);
export const WIZARDS_OF_THAY = 'Wizards of Thay';
export const VALLEY_FLOODCALLER = 'Valley Floodcaller';
// draw
export const BIG_SCORE = 'Big Score';
export const UNEXPECTED_WINDFALL = 'Unexpected Windfall';
export const DEMAND_ANSWERS = 'Demand Answers';
export const SEA_GATE_RESTORATION = 'Sea Gate Restoration';
// equipment for Azula
export const LIGHTNING_GREAVES = 'Lightning Greaves';
export const SWIFTFOOT_BOOTS = 'Swiftfoot Boots';
export const WHISPERSILK_CLOAK = 'Whispersilk Cloak';
export const MINDSPLICE_APPARATUS = 'Mindsplice Apparatus';

/** Permanent.marks on Azula: the equipment attached to her. */
export const WEARS_GREAVES = 1;
export const WEARS_BOOTS = 2;
export const WEARS_CLOAK = 4;
/** Equip costs and the mark each one gives. */
export const EQUIPMENT: Record<string, { cost: number; mark: number }> = {
  [LIGHTNING_GREAVES]: { cost: 0, mark: WEARS_GREAVES },
  [SWIFTFOOT_BOOTS]: { cost: 1, mark: WEARS_BOOTS },
  [WHISPERSILK_CLOAK]: { cost: 2, mark: WEARS_CLOAK },
};

/** The spells that finish the opponents once a loop gives endless mana: copied again and again, or with a huge X. */
export const FINISHERS = new Set([
  LIGHTNING_BOLT,
  KILL_MAIM_BURN,
  BREATH_OF_MALFEGOR,
  ELECTRODOMINANCE,
  TORMENT_OF_HAILFIRE,
  SCARRING_MEMORIES,
]);

/** Firebender Ascension's 2/2 red Soldier with firebending 1. */
export const FIREBENDING_SOLDIER = new C.CardDef(
  'Soldier',
  {
    name: 'Soldier',
    type_line: 'Token Creature — Soldier',
    power: '2',
    toughness: '2',
    keywords: ['Firebending'],
    oracle: 'Firebending 1',
    token: true,
  } as C.CardData,
  {
    name: 'Soldier',
    face: {
      power: 2,
      toughness: 2,
      colours: ['red'],
      keywords: ['firebending'],
    },
  },
);

/** How much the AI wants each card on the battlefield (the rest: 40 for a creature, 30 otherwise). Spells have a
 *  value too: it is how much we want them in hand (discards, tutors). */
export const VALUE: Record<string, number> = {
  [AZULA]: 95,
  'Sol Ring': 90,
  'Arcane Signet': 75,
  'Fellwar Stone': 70,
  'Thought Vessel': 66,
  'Decanter of Endless Water': 62,
  [MINDSPLICE_APPARATUS]: 64,
  [LIGHTNING_GREAVES]: 56,
  [SWIFTFOOT_BOOTS]: 54,
  [WHISPERSILK_CLOAK]: 50,
  [TWINNING_STAFF]: 66,
  [STORM_KILN_ARTIST]: 86,
  [ARCHMAGE_EMERITUS]: 74,
  [ARCHMAGE_OF_RUNES]: 80,
  [VEYRAN]: 70,
  [VIVI]: 82,
  [PRISMARI]: 76,
  [OZAI]: 74,
  [WIZARDS_OF_THAY]: 68,
  [VALLEY_FLOODCALLER]: 58,
  'High Fae Trickster': 60,
  'Faerie Mastermind': 50,
  [MYSTERIOUS_STRANGER]: 62,
  [TORRENTIAL_GEARHULK]: 64,
  'Necron Deathmark': 56,
  'Callidus Assassin': 50,
  [ARCANE_BOMBARDMENT]: 74,
  [FATED_FIREPOWER]: 50,
  [FIREBENDER_ASCENSION]: 60,
  'Leyline of Anticipation': 56,
  'Phyrexian Arena': 70,
  'Rhystic Study': 72,
  [STORM_OF_SARUMAN]: 76,
  // in hand
  [REITERATE]: 88,
  [NARSETS_REVERSAL]: 86,
  [REVERBERATE]: 80,
  [JESKAS_WILL]: 78,
  [MANA_GEYSER]: 74,
  [SEETHING_SONG]: 72,
  [FRANTIC_SEARCH]: 70,
  [LIGHTNING_BOLT]: 66,
  [BREATH_OF_MALFEGOR]: 70,
  [ELECTRODOMINANCE]: 64,
  [TORMENT_OF_HAILFIRE]: 72,
  [SCARRING_MEMORIES]: 58,
  [KILL_MAIM_BURN]: 66,
  [BIG_SCORE]: 62,
  [UNEXPECTED_WINDFALL]: 62,
  [DEMAND_ANSWERS]: 56,
  [SEA_GATE_RESTORATION]: 64,
  [SOZINS_COMET]: 60,
  'Waterlogged Teachings': 70,
  'Force of Will': 64,
  'Fierce Guardianship': 66,
  'Mana Drain': 62,
  Counterspell: 60,
  'Void Shatter': 58,
  'Sink into Stupor': 56,
};

/** Cards the AI never casts on its own: interaction (the pod casts it as answers), the combo pieces (combos.ts casts
 *  them), the finishers (cast in combat while Azula attacks, or by a combo), and cards with no use alone. */
export const HOLD = new Set([
  'Counterspell',
  'Force of Will',
  'Fierce Guardianship',
  'Mana Drain',
  'Void Shatter',
  'Sink into Stupor',
  'Deadly Rollick',
  "Isildur's Fateful Strike",
  'Untimely Malfunction',
  'Deflecting Swat',
  'Redirect Lightning',
  'Vandalblast',
  'Snap',
  KILL_MAIM_BURN,
  TORMENT_OF_HAILFIRE,
  REITERATE,
  REVERBERATE,
  NARSETS_REVERSAL,
  MANA_GEYSER,
  SEETHING_SONG,
  'Mirror Room',
]);

C.registerKnown([
  ...Object.keys(VALUE).filter(
    (name) =>
      ![
        'Sol Ring',
        'Arcane Signet',
        'Fellwar Stone',
        'Thought Vessel',
        'Decanter of Endless Water',
      ].includes(name),
  ),
  ...HOLD,
]);
