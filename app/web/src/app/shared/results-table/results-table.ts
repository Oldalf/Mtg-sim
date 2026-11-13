import { Component, computed, input } from '@angular/core';
import { MatTableModule } from '@angular/material/table';

/** A column of numbers: its heading and its unit (the same shape as a measure of DiagReport). */
export interface ResultColumn {
  label: string;
  unit: '%' | 'turn' | 'n';
}

/** A row: its label and one value per column (null = none, shown as a dash). */
export interface ResultRow {
  label: string;
  values: (number | null)[];
}

/** A cell as it is shown: the value, and its difference to the first row when that is asked for. */
interface ShownCell {
  value: string;
  difference: string | null;
  isBeyondNoise: boolean;
}

interface ShownRow {
  label: string;
  cells: ShownCell[];
}

/**
 * A table of results: a row per list (or deck), a column per number. With `compareToFirst`, the rows after the first
 * also show their difference to it, muted when it is within the noise (as the command line's comparison does).
 */
@Component({
  selector: 'app-results-table',
  imports: [MatTableModule],
  templateUrl: './results-table.html',
  styleUrl: './results-table.scss',
})
export class ResultsTable {
  readonly columns = input.required<ResultColumn[]>();
  readonly rows = input.required<ResultRow[]>();
  /** The heading of the label column. */
  readonly labelHeading = input('');
  readonly compareToFirst = input(false);
  /** Differences up to this many points (of a % column) count as noise. */
  readonly noisePoints = input(0);

  protected readonly columnIds = computed(() => [
    'label',
    ...this.columns().map((_column, index) => `value${index}`),
  ]);

  protected readonly shownRows = computed<ShownRow[]>(() => {
    const columns = this.columns();
    const [baseRow] = this.rows();
    return this.rows().map((row, rowIndex) => ({
      label: row.label,
      cells: columns.map((column, columnIndex) => {
        const value = row.values[columnIndex];
        const baseValue = baseRow.values[columnIndex];
        const hasDifference =
          this.compareToFirst() &&
          rowIndex > 0 &&
          value !== null &&
          baseValue !== null;
        const difference = hasDifference ? value - baseValue : 0;
        return {
          value: formatResult(value, column.unit),
          difference: hasDifference
            ? formatDifference(difference, column.unit)
            : null,
          isBeyondNoise:
            column.unit !== '%' || Math.abs(difference) > this.noisePoints(),
        };
      }),
    }));
  });
}

/** Percentages with one decimal, turns and counts with two (as the command line prints them). */
export function formatResult(
  value: number | null,
  unit: ResultColumn['unit'],
): string {
  if (value === null || Number.isNaN(value)) return '–';
  return unit === '%' ? `${value.toFixed(1)}%` : value.toFixed(2);
}

function formatDifference(
  difference: number,
  unit: ResultColumn['unit'],
): string {
  const decimals = unit === '%' ? 1 : 2;
  return (difference >= 0 ? '+' : '') + difference.toFixed(decimals);
}
