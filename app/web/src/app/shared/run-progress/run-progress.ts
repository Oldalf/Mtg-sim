import { DecimalPipe } from '@angular/common';
import { Component, computed, input, output } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatProgressBar } from '@angular/material/progress-bar';
import type { RunState, RunStatus } from '../../../../../api-types';
import { ErrorBox } from '../error-box/error-box';

const STATUS_IN_WORDS: Record<RunStatus, string> = {
  running: 'Running',
  done: 'Done',
  stopped: 'Stopped',
  failed: 'Failed',
};

/** A run's progress: the bar, games played of the total, seconds so far, and a stop button while it runs. */
@Component({
  selector: 'app-run-progress',
  imports: [DecimalPipe, ErrorBox, MatButton, MatIcon, MatProgressBar],
  template: `
    <div class="numbers">
      <span class="status">{{ statusInWords() }}</span>
      <span>
        {{ run().gamesPlayed | number }} of {{ run().gamesTotal | number }}
        games
      </span>
      <span>{{ run().secondsSoFar | number: '1.1-1' }} s</span>
      @if (isRunning()) {
        <button mat-stroked-button type="button" (click)="stop.emit()">
          <mat-icon>stop</mat-icon>
          Stop
        </button>
      }
    </div>
    <mat-progress-bar
      mode="determinate"
      [value]="percentPlayed()"
      [attr.aria-label]="'Games played: ' + percentPlayed() + '%'"
    />
    @if (run().error; as error) {
      <app-error-box title="The run failed" [message]="error" />
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .numbers {
      display: flex;
      align-items: center;
      gap: 24px;
      min-height: 36px;
    }
    .status {
      font: var(--mat-sys-title-small);
      color: var(--mat-sys-primary);
    }
  `,
})
export class RunProgress {
  readonly run = input.required<RunState>();
  readonly stop = output<void>();

  protected readonly isRunning = computed(
    () => this.run().status === 'running',
  );
  protected readonly statusInWords = computed(
    () => STATUS_IN_WORDS[this.run().status],
  );
  protected readonly percentPlayed = computed(() => {
    const { gamesPlayed, gamesTotal } = this.run();
    return gamesTotal ? Math.round((100 * gamesPlayed) / gamesTotal) : 0;
  });
}
