/**
 * Mike mulligan rule. Plain data: change a list below and re-run `npm run sim -- mike --hands` or
 * the deck with `--set smart_mulligan=0` (the old "keep 2 to 5 lands") to compare. How rules work: engine/mulligan.ts.
 * The pod's first mulligan is free, so attempt 0 is the pickiest and attempt 2 (6 cards) the loosest.
 */
import { MulliganRule } from "../../engine/mulligan";

const RAMP = ["Sol Ring", "Arcane Signet", "Thought Vessel", "Commander's Sphere"];
const DRAW = ["Brainstorm", "Consider", "Tune the Narrative", "Frantic Search", "Vnwxt, Verbose Host", "Spectral Sailor", "Strix Lookout",
  "Looter il-Kor", "Shoreline Looter", "Roil Cartographer", "Emrakul's Messenger", "Mischievous Mystic", "Loyal Drake", "Ominous Seas"];

export const MULLIGAN: MulliganRule = {
  tags: {
    ramp: RAMP,
    draw: DRAW,
    start: [...RAMP, ...DRAW], // a card that does something early
  },
  keep: [
    // the first 7: 3-4 lands, or 2 / 5 lands with something to do
    [{ lands: [3, 4] }, { lands: [2, 2], need: ["start"] }, { lands: [5, 5], need: ["start"] }],
    // the free mulligan's 7
    [{ lands: [2, 5] }],
    // 6 cards
    [{ lands: [1, 6] }],
  ],
  alwaysKeep: 5,
};
