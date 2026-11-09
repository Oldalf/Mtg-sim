/** What each card is *for* in the Gale deck (the engine's card facts are in engine/cards.ts). */
import * as C from "../../engine/cards";

export const GALE = "Gale, Waterdeep Prodigy";
export const SCION = "Scion of Halaster";

/** Combo permanents */
export const COMBO_PERMS = new Set(["Duskmantle Guildmage", "Mindcrank", "Syr Konrad, the Grim", "The Mindskinner",
  "Riverchurn Monument"]);
/** Spells the kill search knows how to use */
export const COMBO_SPELLS = new Set(["Maddening Cacophony", "Traumatize", "Cut Your Losses", "Singularity Rupture",
  "Windfall", "Extended Absence", "Dark Ritual", "High Tide", "Bubbling Muck",
  "Frantic Search", "Snap", "Unearth", "Energybending",
  "Prologue to Phyresis", "Expansion Algorithm", // poison: 1 counter, then proliferate X times
  "Turnabout", // untap all your lands (kill turn only)
  "Cabal Ritual", "Energy Tap", "Drain Power"]); // rituals
export const ENGINES = new Set(["Archmage Emeritus", "Archmage of Runes", "Academy Wall", "Secrets of the Dead",
  "Baleful Strix", "Curious Homunculus", "Emet-Selch of the Third Seat"]);
/** Never cast these outside a kill */
export const COMBO_SORC = new Set(["Maddening Cacophony", "Traumatize", "Cut Your Losses", "Singularity Rupture",
  "Extended Absence", "Expansion Algorithm", "Turnabout"]);

C.registerKnown([...COMBO_PERMS, ...COMBO_SPELLS, ...ENGINES, GALE, SCION]);
