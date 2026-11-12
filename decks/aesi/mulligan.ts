/**
 * Aesi mulligan rule. Plain data: change a list below and re-run `npm run sim -- aesi --hands` or
 * the deck with `--set smart_mulligan=0` (the old "keep 2 to 5 lands") to compare. How rules work: engine/mulligan.ts.
 * The pod's first mulligan is free, so attempt 0 is the pickiest and attempt 2 (6 cards) the loosest.
 */
import { MulliganRule } from '../../engine/mulligan';

export const MULLIGAN: MulliganRule = {
  tags: {
    // ramp that costs one or two mana
    cheapRamp: [
      'Rampant Growth',
      'Farseek',
      'Sakura-Tribe Elder',
      'Search for Tomorrow',
      'Lotus Cobra',
      'Sol Ring',
      "Nature's Lore",
      'Three Visits',
      'Khalni Heart Expedition',
    ],
  },
  keep: [
    // the first 7: a green source is worth about a full turn (nearly all the ramp costs G); lands are cards with Aesi
    [
      { lands: [3, 6], need: ['G'] },
      { lands: [2, 2], need: ['G', 'cheapRamp'] },
    ],
    // the free mulligan's 7
    [{ lands: [2, 6], need: ['G'] }],
    // 6 cards
    [{ lands: [2, 6] }],
  ],
  alwaysKeep: 5,
};
