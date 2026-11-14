/**
 * Edgar mulligan rule. Plain data: change a list below and re-run `npm run sim -- edgar --hands` or
 * the deck with `--set smart_mulligan=0` (the old "keep 2 to 5 lands") to compare. How rules work: engine/game/mulligan.ts.
 * The pod's first mulligan is free, so attempt 0 is the pickiest and attempt 2 (6 cards) the loosest.
 */
import { MulliganRule } from '../../engine/game/mulligan';

export const RAMP_PIECES = [
  'Sol Ring',
  'Arcane Signet',
  'Fellwar Stone',
  "Commander's Sphere",
  'Dark Ritual',
  'Master of Dark Rites',
  'Sceptre of Eternal Glory',
];
export const DRAIN_ENGINES = [
  'Blood Artist',
  'Cruel Celebrant',
  'Vengeful Bloodwitch',
  'Susurian Voidborn',
  'Marionette Apprentice',
  'Arnyn, Deathbloom Botanist',
];
export const OUTLETS = [
  'Evereth, Viceroy of Plunder',
  'Viscera Seer',
  "Ashnod's Altar",
  'Phyrexian Altar',
  'Indulgent Aristocrat',
  'Pitiless Pontiff',
];
export const TOKEN_MAKERS = [
  "Legion's Landing",
  'Bloodline Keeper',
  'Preacher of the Schism',
  'Baron Bertram Graywater',
  'Elenda, the Dusk Rose',
  'Skullclamp',
];
/** Cheap Vampires and lords: something to do with the mana. */
const CHEAP_PLAYS = [
  'Legion Lieutenant',
  'Stromkirk Captain',
  'Markov Baron',
  'Cordial Vampire',
  'Vampire Nighthawk',
  'Welcoming Vampire',
  'Captivating Vampire',
  'Emeritus of Woe',
];

export const MULLIGAN: MulliganRule = {
  tags: {
    ramp: RAMP_PIECES,
    drain: DRAIN_ENGINES,
    outlet: OUTLETS,
    tokens: TOKEN_MAKERS,
    start: [
      ...RAMP_PIECES,
      ...DRAIN_ENGINES,
      ...OUTLETS,
      ...TOKEN_MAKERS,
      ...CHEAP_PLAYS,
    ],
  },
  keep: [
    // the first 7: black is the colour of nearly every spell
    [
      { lands: [3, 4], need: ['B'] },
      { lands: [2, 2], need: ['B', 'start'] },
      { lands: [5, 5], need: ['B', 'start'] },
    ],
    // the free mulligan's 7
    [{ lands: [2, 6], need: ['B'] }],
    // 6 cards
    [{ lands: [2, 6] }],
  ],
  alwaysKeep: 5,
};
