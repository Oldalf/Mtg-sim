import {
  afterRenderEffect,
  Component,
  ElementRef,
  inject,
  input,
  output,
} from '@angular/core';
import type { LogTurn } from './game-steps';

/**
 * The log of a game, grouped by turn: highlights marked, a pod line on another player's turn named, the card moves
 * under each line when asked. Clicking a line (or a turn's title) chooses it; the chosen line is kept in view.
 */
@Component({
  selector: 'app-game-log-view',
  template: `
    @for (turn of turns(); track turn.firstEvent) {
      <section>
        <button
          class="turn-title"
          [class.is-chosen]="turn.firstEvent === chosenEvent()"
          [attr.data-event]="turn.firstEvent"
          (click)="choose.emit(turn.firstEvent)"
        >
          {{ turn.title }}
        </button>
        @for (line of turn.lines; track line.eventIndex) {
          <button
            class="line"
            [class.is-chosen]="line.eventIndex === chosenEvent()"
            [class.is-highlight]="line.isHighlight"
            [attr.data-event]="line.eventIndex"
            (click)="choose.emit(line.eventIndex)"
          >
            @if (line.playerName) {
              <span class="player">{{ line.playerName }}:</span>
            }
            {{ line.text }}
            @if (showMoves()) {
              @for (move of line.moves; track $index) {
                <span class="move">{{ move }}</span>
              }
            }
          </button>
        }
      </section>
    }
  `,
  styles: `
    :host {
      display: block;
      font: var(--mat-sys-body-small);
    }
    button {
      display: block;
      width: 100%;
      padding: 2px 8px;
      border: 0;
      border-left: 3px solid transparent;
      background: none;
      color: inherit;
      font: inherit;
      text-align: left;
      cursor: pointer;
      &:hover,
      &:focus-visible {
        background: var(--mat-sys-surface-container-high);
      }
      &.is-chosen {
        background: var(--mat-sys-secondary-container);
        color: var(--mat-sys-on-secondary-container);
      }
    }
    .turn-title {
      margin-top: 8px;
      color: var(--mat-sys-primary);
      font: var(--mat-sys-title-small);
    }
    .line.is-highlight {
      border-left-color: var(--mat-sys-primary);
      font-weight: 500;
    }
    .player {
      color: var(--mat-sys-tertiary);
    }
    .move {
      display: block;
      padding-left: 16px;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class GameLogView {
  readonly turns = input.required<LogTurn[]>();
  readonly chosenEvent = input.required<number>();
  readonly showMoves = input(false);
  readonly choose = output<number>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    // keep the chosen line in view while stepping with the keys
    afterRenderEffect(() => {
      const chosen = this.host.nativeElement.querySelector(
        `[data-event="${this.chosenEvent()}"]`,
      );
      chosen?.scrollIntoView({ block: 'nearest' });
    });
  }
}
