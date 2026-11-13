import { Component, computed, input } from '@angular/core';
import { MatChip } from '@angular/material/chips';

/**
 * A tag of a game (engine/game-log-tags.ts: fastest, slowest, win-stopped, error...), with how many games carry it
 * when that is given. For choosing tags as a filter, put Material's own `mat-chip-listbox` around plain options.
 */
@Component({
  selector: 'app-tag-chip',
  imports: [MatChip],
  template: `
    <mat-chip [class.is-error]="tag() === 'error'" [disableRipple]="true">
      {{ tagInWords() }}
      @if (count() !== undefined) {
        <span class="count">{{ count() }}</span>
      }
    </mat-chip>
  `,
  styles: `
    .count {
      margin-left: 4px;
      color: var(--mat-sys-on-surface-variant);
    }
    .is-error {
      --mat-chip-label-text-color: var(--mat-sys-error);
      --mat-chip-outline-color: var(--mat-sys-error);
    }
  `,
})
export class TagChip {
  readonly tag = input.required<string>();
  readonly count = input<number>();
  protected readonly tagInWords = computed(() => this.tag().replace(/-/g, ' '));
}
