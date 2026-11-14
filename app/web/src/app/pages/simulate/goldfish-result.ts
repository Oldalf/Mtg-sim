import { DecimalPipe } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import type { GoldfishRunRequest, RunState } from '../../../../../api-types';
import { ResultsTable } from '../../shared/results-table/results-table';
import { GamesWorthALook } from './games-worth-a-look';
import {
  comparisonTable,
  diagTable,
  turnByTurnTable,
  type ShownTable,
} from './report-tables';

/** A run folder and what it holds. */
interface LabelledRunFolder {
  label: string;
  runFolder: string;
}

/**
 * The result of a goldfish run: the kill-turn table of one list, the comparison of several, or the deck's own
 * measures (--diag); under it the games worth a look of each list.
 */
@Component({
  selector: 'app-goldfish-result',
  imports: [DecimalPipe, GamesWorthALook, ResultsTable],
  template: `
    @if (shownTable(); as shown) {
      <p class="summary">{{ summary() }}</p>
      <app-results-table
        [labelHeading]="labelHeading()"
        [columns]="shown.columns"
        [rows]="shown.rows"
        [compareToFirst]="isComparison()"
        [noisePoints]="noisePoints()"
      />
      @if (singleListTotals(); as totals) {
        <p class="totals">
          Average turn of the games won:
          {{ totals.averageAnyTurn | number: '1.2-2' }} ({{ totals.anyName }}),
          {{ totals.averageProtectedTurn | number: '1.2-2' }}
          ({{ totals.protectedName }}). No win by turn {{ totals.maxTurn }}:
          {{ totals.noAnyPercent | number: '1.1-1' }}%,
          {{ totals.noProtectedPercent | number: '1.1-1' }}%.
        </p>
      }
    }

    @if (runFolders().length > 0) {
      <h2>Games worth a look</h2>
      @for (folder of runFolders(); track folder.runFolder) {
        <app-games-worth-a-look
          [runFolder]="folder.runFolder"
          [label]="folder.label"
        />
      }
    }
  `,
  styles: `
    h2 {
      font: var(--mat-sys-title-medium);
      margin: 24px 0 4px;
    }
    .summary,
    .totals {
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class GoldfishResult {
  /** A goldfish run that is done or stopped. */
  readonly run = input.required<RunState>();

  private readonly report = computed(() => this.run().report);

  protected readonly isComparison = computed(() => {
    const report = this.report();
    return report !== undefined && report.kind !== 'pod'
      ? report.rows.length > 1
      : false;
  });

  protected readonly shownTable = computed<ShownTable | undefined>(() => {
    const report = this.report();
    if (report?.kind === 'diag') return diagTable(report);
    if (report?.kind !== 'kill-turns') return undefined;
    return report.rows.length > 1
      ? comparisonTable(report)
      : turnByTurnTable(report);
  });

  protected readonly labelHeading = computed(() =>
    this.isComparison() ? 'List' : '',
  );

  protected readonly noisePoints = computed(() => {
    const report = this.report();
    return report?.kind === 'kill-turns' ? report.noisePoints : 0;
  });

  protected readonly summary = computed(() => {
    const report = this.report();
    if (!report || report.kind === 'pod') return '';
    const deck = (this.run().request as GoldfishRunRequest).deck;
    const games = `${report.gameCount.toLocaleString('en')} games`;
    if (report.kind === 'diag')
      return `${deck}: the deck's own measures, ${games} each, same seeds.`;
    const opponents = `${report.opponents} goldfish opponents at ${report.opponentLife} life`;
    if (!this.isComparison()) return `${deck}: ${games}, ${opponents}.`;
    return (
      `${deck}: ${games} each, same seeds, ${opponents}. Differences to ${report.rows[0].label}; ` +
      `about ±${report.noisePoints.toFixed(1)} points is noise (muted).`
    );
  });

  /** One list: the averages and the games without a win, under the turn table (as the command line prints them). */
  protected readonly singleListTotals = computed(() => {
    const report = this.report();
    if (report?.kind !== 'kill-turns' || report.rows.length > 1)
      return undefined;
    const { table } = report.rows[0];
    return {
      anyName: report.resultNames[0][0],
      protectedName: report.resultNames[1][0],
      maxTurn: report.maxTurn,
      averageAnyTurn: table.averageTurn.any,
      averageProtectedTurn: table.averageTurn.protected,
      noAnyPercent: 100 - table.percentKilled.any,
      noProtectedPercent: 100 - table.percentKilled.protected,
    };
  });

  /** The report's rows know their folders; a stopped run has no report, so its folders are named after themselves. */
  protected readonly runFolders = computed<LabelledRunFolder[]>(() => {
    const report = this.report();
    const reportRows = report && report.kind !== 'pod' ? report.rows : [];
    const labelled = reportRows.flatMap((row) =>
      row.runFolder ? [{ label: row.label, runFolder: row.runFolder }] : [],
    );
    if (labelled.length > 0) return labelled;
    return this.run().runFolders.map((runFolder) => ({
      label: runFolder,
      runFolder,
    }));
  });
}
