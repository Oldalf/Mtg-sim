/**
 * Gale mulligan rule. Plain data: change a list below and re-run `npm run sim -- gale --hands` or
 * the deck with `--set smart_mulligan=0` (the old "keep 2 to 5 lands") to compare. How rules work: engine/mulligan.ts.
 * The pod's first mulligan is free, so attempt 0 is the pickiest and attempt 2 (6 cards) the loosest.
 */
import { MulliganRule } from "../../engine/mulligan";

export const MULLIGAN: MulliganRule = {
  tags: {
    // cards that make the hand do something before the big turn
    develop: ["Sol Ring", "Arcane Signet", "Dimir Signet", "Fellwar Stone", "Talisman of Dominance", "Bender's Waterskin", "Baral, Chief of Compliance", "Mocking Sprite", "Thunderclap Drake", "Geist of Saint Thalia", "Nightscape Familiar", "Wizards of Thay", "Curious Homunculus", "Brainstorm", "Consider", "Opt", "Ponder", "Preordain", "Frantic Search", "See the Truth", "Diabolic Tutor", "Gifts Ungiven", "Insatiable Avarice", "Personal Tutor", "Solve the Equation", "Waterlogged Teachings", "Wishclaw Talisman"],
  },
  keep: [
    // the first 7: 3-4 lands, or 2 / 5 lands when the hand develops
    [{ lands: [3, 4] }, { lands: [2, 2], need: ["develop"] }, { lands: [5, 5], need: ["develop"] }],
    // the free mulligan's 7: only 0 lands or 6+ go back; a one-lander needs something to do
    [{ lands: [2, 5] }, { lands: [1, 1], need: ["develop"] }],
    // 6 cards
    [{ lands: [1, 6] }],
  ],
  alwaysKeep: 5,
};
