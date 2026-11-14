import { DecimalPipe } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import type { PodReport, RunState } from '../../../../../api-types';
import { ResultsTable } from '../../shared/results-table/results-table';
import { GamesWorthALook } from '../simulate/games-worth-a-look';
import {
  interactionTable,
  wentOutTable,
  winsByRoundTable,
  winsTable,
} from './pod-tables';

/** The tables of a finished pod run. */
interface PodTables {
  report: PodReport;
  wins: ReturnType<typeof winsTable>;
  winsByRound: ReturnType<typeof winsByRoundTable>;
  interaction: ReturnType<typeof interactionTable>;
  wentOut: ReturnType<typeof wentOutTable>;
}

/** The result of a pod run: wins, wins by round, interaction, how the decks went out, and games worth a look. */
@Component({
  selector: 'app-pod-result',
  imports: [DecimalPipe, GamesWorthALook, ResultsTable],
  template: `
    @if (tables(); as shown) {
      <p class="note">
        {{ shown.report.gameCount | number }} pod games,
        {{ shown.report.playerCount }} players, at most
        {{ shown.report.roundsCap }} rounds. An even pod would give each deck
        {{ shown.report.evenSharePercent | number: '1.0-0' }}%. Noise: about ±{{
          shown.report.noisePoints | number: '1.0-0'
        }}
        points on a win rate.
      </p>
      <app-results-table
        labelHeading="Deck"
        [columns]="shown.wins.columns"
        [rows]="shown.wins.rows"
      />
      <p class="note">
        No winner by round {{ shown.report.roundsCap }}:
        {{ shown.report.noWinnerPercent | number: '1.1-1' }}%. Average game
        length:
        {{
          shown.report.averageGameLength === null
            ? '-'
            : (shown.report.averageGameLength | number: '1.2-2')
        }}
        rounds.
      </p>

      <h2>Won by the end of round (share of all games)</h2>
      <app-results-table
        labelHeading="Deck"
        [columns]="shown.winsByRound.columns"
        [rows]="shown.winsByRound.rows"
      />

      @if (shown.report.hadInteraction) {
        <h2>Interaction, per game</h2>
        <app-results-table
          labelHeading="Deck"
          [columns]="shown.interaction.columns"
          [rows]="shown.interaction.rows"
        />
      }

      @if (shown.wentOut.columns.length > 0) {
        <h2>How the decks went out (share of all games)</h2>
        <app-results-table
          labelHeading="Deck"
          [columns]="shown.wentOut.columns"
          [rows]="shown.wentOut.rows"
        />
      }
    }

    @if (runFolder(); as folder) {
      <h2>Games worth a look</h2>
      <app-games-worth-a-look [runFolder]="folder" label="The pod" />
    }
  `,
  styles: `
    h2 {
      font: var(--mat-sys-title-medium);
      margin: 24px 0 4px;
    }
    .note {
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class PodResult {
  /** A pod run that is done or stopped. */
  readonly run = input.required<RunState>();

  /** Undefined for a stopped run: it has no report. */
  protected readonly tables = computed<PodTables | undefined>(() => {
    const report = this.run().report;
    if (report?.kind !== 'pod') return undefined;
    return {
      report,
      wins: winsTable(report),
      winsByRound: winsByRoundTable(report),
      interaction: interactionTable(report),
      wentOut: wentOutTable(report),
    };
  });

  /** The report knows its folder; a stopped run has no report, but its folder is finished. */
  protected readonly runFolder = computed(() => {
    const report = this.run().report;
    const folderOfReport =
      report?.kind === 'pod' ? report.runFolder : undefined;
    return folderOfReport ?? this.run().runFolders[0];
  });
}
