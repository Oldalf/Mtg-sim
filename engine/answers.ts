/**
 * Interaction cards, as a pod uses them (see POD_PLAN.md, step 3). A card is a card in every deck, so this is one shared table.
 *
 * - counter: an instant that counters a spell on the stack (`spells` says which spells it may target).
 * - removal: takes one permanent (or `count` of them) off the battlefield. `instant` ones can answer a win attempt.
 * - wipe: all creatures ("all"), those with power 3 or more ("power3"), those bigger than our smallest ("bigger"),
 *   all creatures back to their owners' hands ("bounce"), or the attacking creatures back to hand ("attackers", cast
 *   when we are attacked).
 * `cost` replaces the printed mana cost (Wash Away: the cleave cost, the mode that counters any spell).
 */
export type Hit = "creature" | "artifact" | "enchantment" | "planeswalker";
export interface Answer {
  kind: "counter" | "removal" | "wipe";
  instant: boolean;
  spells?: "any" | "noncreature" | "instant" | "instant-sorcery";
  hits?: Hit[];
  how?: "destroy" | "exile" | "bounce";
  count?: number;
  wipe?: "all" | "power3" | "bigger" | "bounce" | "attackers";
  cost?: string;
  /** Targets it can't take: "artifact" (nonartifact), "black" (nonblack), "counters" (a creature with counters on it). */
  not?: ("artifact" | "black" | "counters")[];
  /** What the target's owner gets: a 3/3 token, a basic land (tapped), life equal to its power, a 2/2 (manifest). */
  gives?: "token3" | "land" | "life" | "manifest";
  /** Life the caster pays. */
  pay?: number;
}

const counter = (spells: Answer["spells"] = "any", cost?: string): Answer => ({ kind: "counter", instant: true, spells, cost });
const kill = (hits: Hit[], how: Answer["how"] = "destroy", instant = true, count = 1, more: Partial<Answer> = {}): Answer => ({ kind: "removal", instant, hits, how, count, ...more });
const wipe = (w: Answer["wipe"], instant = false): Answer => ({ kind: "wipe", instant, wipe: w });
const NONLAND: Hit[] = ["creature", "artifact", "enchantment", "planeswalker"];

export const ANSWERS: Record<string, Answer> = {
  // ---- counterspells ("unless its controller pays" ones count as hard counters: a deck going for the win is tapped out)
  "Counterspell": counter(), "Arcane Denial": counter(), "Archmage's Charm": counter(), "Mana Sculpt": counter(), "Rewind": counter(),
  "Refute": counter(), "Aether Spike": counter(), "Divert Disaster": counter(), "Spell Syphon": counter(),
  "Wash Away": counter("any", "{1}{U}{U}"),
  "An Offer You Can't Refuse": counter("noncreature"), "Unwind": counter("noncreature"), "Negate": counter("noncreature"),
  "Spell Pierce": counter("noncreature"), "Dispel": counter("instant"), "Muddle the Mixture": counter("instant-sorcery"),
  // ---- instant-speed removal
  "Heartless Act": kill(["creature"], "destroy", true, 1, { not: ["counters"] }), "Infernal Grasp": kill(["creature"], "destroy", true, 1, { pay: 2 }),
  "Go for the Throat": kill(["creature"], "destroy", true, 1, { not: ["artifact"] }),
  "Pongify": kill(["creature"], "destroy", true, 1, { gives: "token3" }), "Rapid Hybridization": kill(["creature"], "destroy", true, 1, { gives: "token3" }),
  "Path to Exile": kill(["creature"], "exile", true, 1, { gives: "land" }), "Swords to Plowshares": kill(["creature"], "exile", true, 1, { gives: "life" }),
  "Reality Shift": kill(["creature"], "exile", true, 1, { gives: "manifest" }),
  "Extended Absence": kill(["creature", "planeswalker"], "exile"),
  "Mortify": kill(["creature", "enchantment"]), "Beast Within": kill(NONLAND, "destroy", true, 1, { gives: "token3" }),
  "Anguished Unmaking": kill(NONLAND, "exile", true, 1, { pay: 3 }),
  "Snap": kill(["creature"], "bounce"),
  // ---- sorcery-speed removal
  "Aether Gale": kill(NONLAND, "bounce", false, 6),
  // ---- wipes
  "Toxic Deluge": wipe("all"), "Singularity Rupture": wipe("all"), "Dusk": wipe("power3"), "Fell the Mighty": wipe("bigger"),
  "Evacuation": wipe("bounce", true), "Aetherize": wipe("attackers", true),
};
/** Shriekmaw's enters-the-battlefield trigger (Meren). */
export const SHRIEKMAW: Answer = { kind: "removal", instant: false, hits: ["creature"], how: "destroy", not: ["artifact", "black"] };

/** Spells that matter more than their mana value says (added to 10 x mana value when an opponent decides whether to counter).
 *  Anyone counters a spell at 85 or more (counter_any); from 60 (counter_at) a player counters it if it holds two counterspells
 *  and the caster is its biggest threat. */
export const KEY_SPELLS: Record<string, number> = {
  // Meren
  "Gray Merchant of Asphodel": 40, "Grave Titan": 15, "Sepulchral Primordial": 10, "Lotleth Giant": 30, "Protean Hulk": 15, "Junji, the Midnight Sky": 15,
  // Mike
  "Laboratory Maniac": 55, "Jace, Wielder of Mysteries": 35, "Psychosis Crawler": 35, "Twenty-Toed Toad": 40, "Teferi's Ageless Insight": 30,
  // Aesi
  "Retreat to Coralhelm": 55, "Blue Sun's Zenith": 20, "Lotus Cobra": 30, "Eternal Dominion": 10,
  // Gale
  "Traumatize": 35, "Duskmantle Guildmage": 50, "The Mindskinner": 25, "Syr Konrad, the Grim": 15, "Riverchurn Monument": 30,
  // Sam & Frodo
  "Pippin, Warden of Isengard": 20, "Toxic Deluge": 30,
};
