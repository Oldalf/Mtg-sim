import { Component, input } from '@angular/core';
import type { CardFactsAnswer } from '../../../../../api-types';
import { CardImage } from '../../shared/card-image/card-image';

/**
 * What just happened, like subtitles under the table: the turn, the chosen line (with its player when the log names
 * one) and the line's cards. A highlight is tinted; a goldfish game adds the opponents' life.
 */
@Component({
  selector: 'app-game-caption',
  imports: [CardImage],
  template: `
    <div class="text" aria-live="polite">
      <span class="turn">{{ turnTitle() }}</span>
      <span class="line" [title]="text()">
        @if (playerName()) {
          <span class="player">{{ playerName() }}:</span>
        }
        {{ text() || 'start of the turn' }}
      </span>
      @if (opponentLives().length) {
        <span class="opponent-lives">
          opponents
          @for (life of opponentLives(); track $index) {
            <strong [class.is-dead]="life <= 0">{{ life }}</strong>
          }
        </span>
      }
    </div>
    <div class="cards">
      @for (card of cards(); track card) {
        <app-card-image
          [name]="card"
          [typeLine]="cardFacts()[card]?.typeLine"
          [manaCost]="cardFacts()[card]?.manaCost"
        />
      }
    </div>
  `,
  styles: `
    :host {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 8px 14px;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 10px;
      background: var(--mat-sys-surface-container);
    }
    :host(.is-highlight) {
      border-color: var(--mat-sys-primary);
      background: color-mix(
        in srgb,
        var(--mat-sys-primary) 14%,
        var(--mat-sys-surface-container)
      );
    }
    .text {
      display: flex;
      flex: 1;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .turn {
      color: var(--mat-sys-primary);
      font: var(--mat-sys-label-large);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    // at most two lines, so a long text cannot make the bar taller than its cards
    .line {
      display: -webkit-box;
      overflow: hidden;
      font: var(--mat-sys-title-large);
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }
    .player {
      color: var(--mat-sys-tertiary);
    }
    .opponent-lives {
      display: flex;
      gap: 8px;
      color: var(--mat-sys-on-surface-variant);
      strong {
        color: var(--mat-sys-on-surface);
        font-size: 18px;
      }
      .is-dead {
        color: #ff8a80;
        text-decoration: line-through;
      }
    }
    // the bar keeps the height of one card row even with no cards, so it does not jump while autoplay runs
    .cards {
      display: flex;
      flex: none;
      gap: 8px;
      min-height: calc(96px * 88 / 63);
      app-card-image {
        width: 96px;
      }
    }
    @media (max-width: 700px) {
      :host {
        flex-wrap: wrap;
      }
      .line {
        font: var(--mat-sys-title-small);
      }
      // a line can carry many cards: on a phone they scroll inside the caption, not the page
      .cards {
        flex: 1 1 100%;
        min-width: 0;
        min-height: calc(56px * 88 / 63);
        overflow-x: auto;
      }
      .cards app-card-image {
        width: 56px;
      }
    }
  `,
  host: { '[class.is-highlight]': 'isHighlight()' },
})
export class GameCaption {
  readonly turnTitle = input('');
  /** The acting player's name when the log names it, else empty. */
  readonly playerName = input('');
  readonly text = input('');
  readonly isHighlight = input(false);
  readonly cards = input<string[]>([]);
  readonly cardFacts = input<CardFactsAnswer>({});
  /** A goldfish game's made-up opponents; empty in a pod. */
  readonly opponentLives = input<number[]>([]);
}
