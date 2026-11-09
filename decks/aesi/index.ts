/** Aesi, Tyrant of Gyre Strait (Simic "reverse landfall", bracket 3). Wins with loops: mill, endless flyers, epic copies. */
import * as path from "path";
import { ROOT } from "../../engine/cards";
import { CFG } from "./config";
import { AesiGame } from "./game";
import { DiagRow, landMakes } from "../../engine/runner";
import { CardDef } from "../../engine/cards";

const anyOf = (names: string[]) => {
  const set = new Set(names);
  return (hand: CardDef[]) => hand.some((c) => set.has(c.name));
};
const lands = (hand: CardDef[]) => hand.filter((c) => c.land !== null || c.mdfcLand !== null).length;

const pct = (rows: DiagRow[], f: (r: DiagRow) => boolean) => (100 * rows.filter(f).length) / rows.length;
const turnOf = (r: DiagRow, key: string, none = 15) => (r[key] ?? none) as number;
const meanOf = (rows: DiagRow[], f: (r: DiagRow) => number) => rows.reduce((s, r) => s + f(r), 0) / rows.length;
/** A turn number the game never reached counts as turn 15. */
const win = (r: DiagRow) => turnOf(r, "win");

export const deck = {
  name: "aesi",
  dir: path.join(ROOT, "decks", "aesi"),
  defaultList: "decklist.txt",
  cfg: CFG,
  Game: AesiGame,
  metrics: [["Win (all 3 out)", "win"], ["First opponent out", "1st out"]] as [[string, string], [string, string]],
  compareTurns: [8, 10, 12],
  // interaction is dead against goldfish opponents; the moonfolk among it still return lands (judged)
  rankProtect: { sections: ["removal", "counters", "protection", "bounce", "evasion"],
    except: ["Soratami Mirror-Mage", "Soratami Savant", "Oboro Envoy", "Soratami Rainshaper", "Floodbringer",
      "Moonbow Illusionist", "Oboro Breezecaller", "Soratami Mirror-Guard"] },
  rankTurn: 10,
  // --hands: what to look for in an opening hand
  handFeatures: [
    { label: "a green source (Forest, dual, fetch, Chamber)", f: (h: CardDef[]) => h.some((c) => landMakes(c, "G")) },
    { label: "a blue source", f: (h: CardDef[]) => h.some((c) => landMakes(c, "U")) },
    { label: "a green and a blue source", f: (h: CardDef[]) => h.some((c) => landMakes(c, "G")) && h.some((c) => landMakes(c, "U")) },
    { label: "a ramp spell or creature", f: anyOf(["Rampant Growth","Farseek","Cultivate","Nissa's Pilgrimage","Explosive Vegetation","Circuitous Route","Reach the Horizon","Grow from the Ashes","Entish Restoration","Harrow","Sakura-Tribe Elder","Search for Tomorrow","Skyshroud Claim","Wood Elves","Lotus Cobra","Sol Ring","Khalni Heart Expedition","Nature's Lore","Three Visits","Beanstalk Giant"]) },
    { label: "a ramp piece costing 1-2 (Rampant Growth, Elder, Search, Cobra, Sol Ring...)", f: anyOf(["Rampant Growth","Farseek","Sakura-Tribe Elder","Search for Tomorrow","Lotus Cobra","Sol Ring","Nature's Lore","Three Visits","Khalni Heart Expedition"]) },
    { label: "an untapper or a land putter (Retreat, Raft-Steerer, Atlas, Scout, PuPu)", f: anyOf(["Retreat to Coralhelm","Elven Raft-Steerer","Walking Atlas","Sakura-Tribe Scout","PuPu UFO","Budoka Gardener"]) },
    { label: "an extra-land-drop card (Azusa, Loot, Case, Druid Class...)", f: anyOf(["Azusa, Lost but Seeking","Loot, Exuberant Explorer","Case of the Locked Hothouse","Druid Class","Summer Bloom","Azusa's Many Journeys"]) },
    { label: "2 lands and a cheap ramp piece", f: (h: CardDef[]) => lands(h) === 2 && anyOf(["Rampant Growth","Farseek","Sakura-Tribe Elder","Search for Tomorrow","Lotus Cobra","Sol Ring","Nature's Lore","Three Visits","Khalni Heart Expedition"])(h) },
    { label: "2 lands, a green source and a cheap ramp piece", f: (h: CardDef[]) => lands(h) === 2 && h.some((c) => landMakes(c, "G")) && anyOf(["Rampant Growth","Farseek","Sakura-Tribe Elder","Search for Tomorrow","Lotus Cobra","Sol Ring","Nature's Lore","Three Visits","Khalni Heart Expedition"])(h) },
  ],
  // --diag: consistency measures (Pontus, 2026-11-05). A game with no win by turn 14 counts as turn 15.
  diagMetrics: [
    { label: "Win by turn 10 (%)", unit: "%" as const, f: (rows: DiagRow[]) => pct(rows, (r) => win(r) <= 10) },
    { label: "Win by turn 12 (%)", unit: "%" as const, f: (rows: DiagRow[]) => pct(rows, (r) => win(r) <= 12) },
    { label: "No win by turn 14 (%)", unit: "%" as const, f: (rows: DiagRow[]) => pct(rows, (r) => win(r) > 14) },
    { label: "Slow tail: turn the 90th-percentile game wins", unit: "turn" as const,
      f: (rows: DiagRow[]) => rows.map(win).sort((a, b) => a - b)[Math.floor(rows.length * 0.9)] },
    // Aesi measures: a game that is already won doesn't need him (counted separately)
    { label: "Won without ever casting Aesi (%)", unit: "%" as const,
      f: (rows: DiagRow[]) => pct(rows, (r) => win(r) <= 14 && turnOf(r, "aesiOut") > win(r)) },
    { label: "Average turn Aesi comes down (games where he does)", unit: "turn" as const,
      f: (rows: DiagRow[]) => meanOf(rows.filter((r) => r.aesiOut !== null && (r.aesiOut as number) <= win(r)), (r) => turnOf(r, "aesiOut")) },
    { label: "No Aesi by end of turn 5, game still going (%)", unit: "%" as const,
      f: (rows: DiagRow[]) => pct(rows, (r) => turnOf(r, "aesiOut") > 5 && win(r) > 5) },
    { label: "No Aesi by end of turn 6, game still going (%)", unit: "%" as const,
      f: (rows: DiagRow[]) => pct(rows, (r) => turnOf(r, "aesiOut") > 6 && win(r) > 6) },
    { label: "No Aesi by end of turn 7, game still going (%)", unit: "%" as const,
      f: (rows: DiagRow[]) => pct(rows, (r) => turnOf(r, "aesiOut") > 7 && win(r) > 7) },
    { label: "Average turn of Aesi's first landfall draw (games where it happens)", unit: "turn" as const,
      f: (rows: DiagRow[]) => meanOf(rows.filter((r) => r.aesiDraw !== null), (r) => turnOf(r, "aesiDraw")) },
    { label: "No landfall draw by end of turn 7, game still going (%)", unit: "%" as const,
      f: (rows: DiagRow[]) => pct(rows, (r) => turnOf(r, "aesiDraw") > 7 && win(r) > 7) },
    // "Not doing much" (Pontus): less than 60% of the mana of one land per turn (15 by turn 5, 21 by turn 6)
    // is spent. A game already won by then doesn't count.
    { label: "Slow start: under 9 mana spent by turn 5 (%)", unit: "%" as const,
      f: (rows: DiagRow[]) => pct(rows, (r) => win(r) > 5 && (r.spent5 ?? 0) < 9) },
    { label: "Slow start: under 13 mana spent by turn 6 (%)", unit: "%" as const,
      f: (rows: DiagRow[]) => pct(rows, (r) => win(r) > 6 && (r.spent6 ?? 0) < 13) },
    { label: "Slow start either way (%)", unit: "%" as const,
      f: (rows: DiagRow[]) => pct(rows, (r) => (win(r) > 5 && (r.spent5 ?? 0) < 9) || (win(r) > 6 && (r.spent6 ?? 0) < 13)) },
    { label: "Average mana spent by turn 5 (of 15)", unit: "n" as const, f: (rows: DiagRow[]) => meanOf(rows.filter((r) => win(r) > 5), (r) => r.spent5 ?? 0) },
    { label: "Average mana spent by turn 6 (of 21)", unit: "n" as const, f: (rows: DiagRow[]) => meanOf(rows.filter((r) => win(r) > 6), (r) => r.spent6 ?? 0) },
    { label: "Lands on turn 5 (average)", unit: "n" as const, f: (rows: DiagRow[]) => meanOf(rows, (r) => r.lands5 ?? 0) },
    { label: "5 lands or fewer after turn 6 (%)", unit: "%" as const, f: (rows: DiagRow[]) => pct(rows, (r) => (r.lands6 ?? 0) <= 5) },
  ],
};
