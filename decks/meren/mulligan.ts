/**
 * Meren mulligan rule. Plain data: change a list below and re-run `npm run sim -- meren --hands` or
 * the deck with `--set smart_mulligan=0` (the old "keep 2 to 5 lands") to compare. How rules work: engine/mulligan.ts.
 * The pod's first mulligan is free, so attempt 0 is the pickiest and attempt 2 (6 cards) the loosest.
 */
import { MulliganRule } from "../../engine/mulligan";

const RAMP = ["Llanowar Elves", "Elvish Mystic", "Fyndhorn Elves", "Sylvan Caryatid", "Skull Prophet", "Sakura-Tribe Elder", "Sol Ring", "Dark Ritual", "Solemn Simulacrum", "Studious First-Year", "Simulacrum Shaper"];
const FILL = ["Buried Alive", "Fauna Shaman", "Grim Servant", "Dina's Guidance", "Eldritch Evolution", "Vile Entomber", "Liliana the Repentant", "Satyr Wayfinder", "Grisly Salvage", "Grist, the Hunger Tide"];

export const MULLIGAN: MulliganRule = {
  tags: {
    ramp: RAMP,
    fill: FILL, // graveyard fillers and tutors
    start: [...RAMP, ...FILL], // something to do with the mana
  },
  keep: [
    // the first 7: green is the colour of the ramp (a green source is worth about 0.7 turns)
    [{ lands: [3, 5], need: ["G"] }, { lands: [2, 2], need: ["G", "start"] }],
    // the free mulligan's 7: 6 lands are fine now
    [{ lands: [2, 6], need: ["G"] }],
    // 6 cards
    [{ lands: [2, 6] }],
  ],
  alwaysKeep: 5,
};
