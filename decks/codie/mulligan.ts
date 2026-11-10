/**
 * Codie mulligan rule. Plain data: change a list below and re-run `npm run sim -- codie --hands`, or the deck with
 * `--set smart_mulligan=0` (the old "keep 2 to 5 lands"). How rules work: engine/mulligan.ts.
 */
import { MulliganRule } from "../../engine/mulligan";

const RAMP = ["Rampant Growth", "Farseek", "Nature's Lore", "Three Visits", "Cultivate", "Shared Roots", "Grow from the Ashes",
  "Explosive Vegetation", "Sylvan Scrying", "Growth Spiral", "Manamorphose", "Dark Ritual", "Elvish Spirit Guide", "Simian Spirit Guide"];
const PIECES = ["Reiterate", "Demonic Tutor", "Vampiric Tutor", "Jeska's Will", "Mana Geyser", "Brass's Bounty", "Ad Nauseam", "Exsanguinate",
  "Crackle with Power", "Torment of Hailfire"];

export const MULLIGAN: MulliganRule = {
  tags: { ramp: RAMP, pieces: PIECES, start: [...RAMP, ...PIECES] },
  keep: [
    [{ lands: [3, 4] }, { lands: [2, 2], need: ["ramp"] }, { lands: [5, 5], need: ["start"] }],
    [{ lands: [2, 5] }],
    [{ lands: [1, 6] }],
  ],
  alwaysKeep: 5,
};
