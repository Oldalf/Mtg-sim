import { Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButton } from '@angular/material/button';
import {
  MatCard,
  MatCardContent,
  MatCardHeader,
  MatCardTitle,
} from '@angular/material/card';
import { catchError, of } from 'rxjs';
import type { RunState } from '../../../../../api-types';
import { ApiService } from '../../core/api';
import { CardImage } from '../../shared/card-image/card-image';
import { ErrorBox } from '../../shared/error-box/error-box';
import type {
  ResultColumn,
  ResultRow,
} from '../../shared/results-table/results-table';
import { ResultsTable } from '../../shared/results-table/results-table';
import { RunProgress } from '../../shared/run-progress/run-progress';
import { TagChip } from '../../shared/tag-chip/tag-chip';

/** Made-up results, shaped like a comparison of two lists. */
const SAMPLE_COLUMNS: ResultColumn[] = [
  { label: 'Win by T6', unit: '%' },
  { label: 'Win by T7', unit: '%' },
  { label: 'Average win turn', unit: 'turn' },
];
const SAMPLE_ROWS: ResultRow[] = [
  { label: 'decklist.txt', values: [41.2, 63.5, 6.84] },
  { label: 'proposed.txt', values: [44.9, 64.1, 6.71] },
  { label: 'old.txt', values: [35.0, null, 7.12] },
];

const SAMPLE_RUN: RunState = {
  runId: 'sample',
  request: {
    mode: 'goldfish',
    deck: 'gale',
    lists: ['decklist.txt'],
    games: 2000,
    settings: {},
    diag: false,
    powerSave: false,
  },
  status: 'running',
  gamesPlayed: 1240,
  gamesTotal: 2000,
  secondsSoFar: 12.4,
  runFolders: [],
};

/**
 * Every shared piece on one page (route /pieces): to see the look, and as an example of how the pages use them.
 * Not in the toolbar.
 */
@Component({
  selector: 'app-pieces',
  imports: [
    CardImage,
    ErrorBox,
    MatButton,
    MatCard,
    MatCardContent,
    MatCardHeader,
    MatCardTitle,
    ResultsTable,
    RunProgress,
    TagChip,
  ],
  templateUrl: './pieces.html',
  styleUrl: './pieces.scss',
})
export class Pieces {
  private readonly api = inject(ApiService);

  protected readonly health = toSignal(
    this.api.health().pipe(catchError(() => of(null))),
  );
  protected readonly sampleColumns = SAMPLE_COLUMNS;
  protected readonly sampleRows = SAMPLE_ROWS;
  protected readonly sampleRun = signal(SAMPLE_RUN);
  protected readonly failedRun: RunState = {
    ...SAMPLE_RUN,
    status: 'failed',
    error: 'gale: a card in the list has no data: Some Card',
  };

  protected stopSampleRun(): void {
    this.sampleRun.update((run) => ({ ...run, status: 'stopped' }));
  }

  /** Asks for a deck that does not exist, to show how an error answer becomes a message. */
  protected askForMissingDeck(): void {
    this.api
      .decklist('no-such-deck', 'decklist.txt')
      .subscribe({ error: () => {} });
  }
}
