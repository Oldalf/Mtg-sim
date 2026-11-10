/** Mike: Vnwxt, Verbose Host (mono-blue card draw, bracket 2-3). Wins by milling itself out with Laboratory Maniac / Jace,
 *  Twenty-Toed Toad with twenty cards in hand, or draining all three opponents. */
import * as path from "path";
import { ROOT } from "../../engine/cards";
import { CFG } from "./config";
import { MikeGame, LOG_TRACKERS } from "./game";
import { DiagRow } from "../../engine/runner";

const pct = (rows: DiagRow[], f: (r: DiagRow) => boolean) => (100 * rows.filter(f).length) / rows.length;
const meanOf = (rows: DiagRow[], f: (r: DiagRow) => number) => rows.reduce((s, r) => s + f(r), 0) / rows.length;
/** A game with no win by turn 14 counts as turn 15. */
const win = (r: DiagRow) => (r.win ?? 15) as number;

export const deck = {
  name: "mike",
  dir: path.join(ROOT, "decks", "mike"),
  defaultList: "decklist.txt",
  cfg: CFG,
  Game: MikeGame,
  metrics: [["Win", "win"], ["First opponent dead", "1st dead"]] as [[string, string], [string, string]],
  compareTurns: [9, 10, 11, 12],
  logTrackers: LOG_TRACKERS,
  // removal and counterspells do nothing against goldfish opponents
  rankProtect: { sections: ["removal", "counterspell"], except: [] as string[] },
  rankTurn: 11,
  diagMetrics: [
    { label: "Win by turn 9 (%)", unit: "%" as const, f: (rows: DiagRow[]) => pct(rows, (r) => win(r) <= 9) },
    { label: "Win by turn 10 (%)", unit: "%" as const, f: (rows: DiagRow[]) => pct(rows, (r) => win(r) <= 10) },
    { label: "Win by turn 11 (%)", unit: "%" as const, f: (rows: DiagRow[]) => pct(rows, (r) => win(r) <= 11) },
    { label: "Win by turn 12 (%)", unit: "%" as const, f: (rows: DiagRow[]) => pct(rows, (r) => win(r) <= 12) },
    { label: "Win by turn 14 (%)", unit: "%" as const, f: (rows: DiagRow[]) => pct(rows, (r) => win(r) <= 14) },
    { label: "Slow tail: turn the 90th-percentile game wins", unit: "turn" as const,
      f: (rows: DiagRow[]) => rows.map(win).sort((a, b) => a - b)[Math.floor(rows.length * 0.9)] },
    { label: "Won by milling out (%)", unit: "%" as const, f: (rows: DiagRow[]) => pct(rows, (r) => r.how === 1) },
    { label: "Won with the Toad (%)", unit: "%" as const, f: (rows: DiagRow[]) => pct(rows, (r) => r.how === 2) },
    { label: "Won by life loss (%)", unit: "%" as const, f: (rows: DiagRow[]) => pct(rows, (r) => r.how === 3 || r.how === 4) },
    { label: "Win with a counterspell in hand and 2 mana untapped (%)", unit: "%" as const, f: (rows: DiagRow[]) => pct(rows, (r) => r.backup === 1) },
    { label: "Library emptied (%)", unit: "%" as const, f: (rows: DiagRow[]) => pct(rows, (r) => r.emptied === 1) },
    { label: "Library emptied with a win piece / Conundrum / Ormos out (%)", unit: "%" as const, f: (rows: DiagRow[]) => pct(rows, (r) => r.emptiedSafe === 1) },
    { label: "Decked ourselves (%)", unit: "%" as const, f: (rows: DiagRow[]) => pct(rows, (r) => r.died === 1) },
    { label: "Average turn Vnwxt comes down", unit: "n" as const, f: (rows: DiagRow[]) => meanOf(rows.filter((r) => r.vnwxtOut != null), (r) => r.vnwxtOut as number) },
    { label: "Reaches max speed by turn 8 (%)", unit: "%" as const, f: (rows: DiagRow[]) => pct(rows, (r) => r.maxSpeed != null && (r.maxSpeed as number) <= 8) },
    { label: "Average cards drawn by turn 6", unit: "n" as const, f: (rows: DiagRow[]) => meanOf(rows.filter((r) => win(r) > 6), (r) => r.draws6 ?? 0) },
    { label: "Average cards in hand at end of turn 8", unit: "n" as const, f: (rows: DiagRow[]) => meanOf(rows.filter((r) => win(r) > 8), (r) => r.hand8 ?? 0) },
    { label: "Slow start: under 9 mana spent by turn 5 (%)", unit: "%" as const, f: (rows: DiagRow[]) => pct(rows, (r) => win(r) > 5 && (r.spent5 ?? 0) < 9) },
  ],
};
