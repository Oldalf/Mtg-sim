/**
 * Sam & Frodo mulligan rule. Plain data: change a list below and re-run `npm run sim -- sam & frodo --hands` or
 * the deck with `--set smart_mulligan=0` (the old "keep 2 to 5 lands") to compare. How rules work: engine/mulligan.ts.
 * The pod's first mulligan is free, so attempt 0 is the pickiest and attempt 2 (6 cards) the loosest.
 */
import { MulliganRule } from "../../engine/mulligan";

const RAMP = ["Sol Ring", "Arcane Signet", "Birds of Paradise", "Gilded Goose", "Commander's Sphere", "Cultivate", "Farseek", "Prosperous Innkeeper", "Tireless Provisioner", "Prize Pig", "Unlucky Cabbage Merchant", "The Notary Hobbits", "Elanor Gardner", "Pristine Talisman", "Chromatic Lantern"];
const TOKENS = ["Academy Manufactor", "Peregrin Took", "Tippy-Toe, Terrific Partner", "Rosie Cotton of South Lane", "Cat Collector", "Farmer Cotton", "Merry, Warden of Isengard", "Pippin, Warden of Isengard", "Meriadoc Brandybuck", "Nuka-Cola Vending Machine", "Rapacious Guest", "Second Harvest"];
const DRAIN = ["Mirkwood Bats", "Marionette Apprentice", "Marionette Master", "Popular Egotist", "Susurian Voidborn", "Sanguine Bond", "Gollum, Obsessed Stalker", "Cauldron Familiar"];

export const MULLIGAN: MulliganRule = {
  tags: {
    ramp: RAMP,
    tokens: TOKENS, // token and Food makers
    drain: DRAIN,
    start: [...RAMP, ...TOKENS, ...DRAIN], // a card that does something early
  },
  keep: [
    // the first 7: 3-4 lands, or 2 / 5-6 lands with something to do
    [{ lands: [3, 4] }, { lands: [2, 2], need: ["start"] }, { lands: [5, 6], need: ["start"] }],
    // the free mulligan's 7
    [{ lands: [2, 6] }],
    // 6 cards
    [{ lands: [1, 6] }],
  ],
  alwaysKeep: 5,
};
