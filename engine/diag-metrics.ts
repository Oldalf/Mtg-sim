/** Building blocks for a deck's --diag measures (see Deck.diagMetrics in runner.ts). */
import { DiagRow } from './runner';

/** Share of the games (0-100) where the condition holds. */
export const percentOf = (
  rows: DiagRow[],
  matches: (row: DiagRow) => boolean,
) => (100 * rows.filter(matches).length) / rows.length;

/** Average of a number taken from each game. */
export const averageOf = (rows: DiagRow[], valueOf: (row: DiagRow) => number) =>
  rows.reduce((sum, row) => sum + valueOf(row), 0) / rows.length;

/** The "Win by turn N (%)" rows every deck reports in --diag. */
export function winByTurnMetrics(
  turns: number[],
  winTurnOf: (row: DiagRow) => number,
) {
  return turns.map((turn) => ({
    label: `Win by turn ${turn} (%)`,
    unit: '%' as const,
    f: (rows: DiagRow[]) => percentOf(rows, (row) => winTurnOf(row) <= turn),
  }));
}
