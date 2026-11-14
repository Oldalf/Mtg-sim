import { Component, computed, input } from '@angular/core';
import type { CardFactsAnswer } from '../../../../../api-types';
import type { PlayerBoard as Board } from '../../../../../../shared/game-log-board';
import type { LogPlayer } from '../../../../../../shared/game-log-types';
import { CardImage } from '../../shared/card-image/card-image';
import { splitBattlefield, type PermanentStack } from './game-steps';

/**
 * One player's side of the table: life and library, the battlefield (lands apart from the rest, tapped ones turned,
 * counters and tokens marked, alike permanents stacked), the hand and the command zone as cards, the graveyard and
 * exile as names.
 */
@Component({
  selector: 'app-player-board',
  imports: [CardImage],
  template: `
    <header>
      <span class="name">{{ player().name }}</span>
      @if (isActive()) {
        <span class="whose-turn">their turn</span>
      }
      <span class="counts">
        @if (board().life !== null) {
          life <strong>{{ board().life }}</strong> ·
        }
        library {{ board().librarySize }} · hand {{ board().hand.length }}
      </span>
    </header>

    <div class="zone">
      <div class="zone-name">Battlefield</div>
      @for (row of battlefieldRows(); track $index) {
        <div class="cards">
          @for (stack of row; track $index) {
            <div class="card-box" [class.is-tapped]="stack.permanent.tapped">
              <app-card-image
                [name]="stack.permanent.name"
                [typeLine]="cardFacts()[stack.permanent.name]?.typeLine"
                [manaCost]="cardFacts()[stack.permanent.name]?.manaCost"
                [isTapped]="stack.permanent.tapped"
              />
              <span class="badges">
                @if (stack.count > 1) {
                  <span class="badge">x{{ stack.count }}</span>
                }
                @if (stack.permanent.counters !== 0) {
                  <span class="badge is-counters">
                    {{ describeCounters(stack.permanent.counters) }}
                  </span>
                }
                @if (stack.permanent.isToken) {
                  <span class="badge is-token">token</span>
                }
              </span>
            </div>
          } @empty {
            <span class="empty">{{
              $index === 0 ? 'no permanents' : 'no lands'
            }}</span>
          }
        </div>
      }
    </div>

    <div class="zone-row">
      <div class="zone">
        <div class="zone-name">Hand</div>
        <div class="cards">
          @for (card of board().hand; track $index) {
            <div class="card-box">
              <app-card-image
                [name]="card"
                [typeLine]="cardFacts()[card]?.typeLine"
                [manaCost]="cardFacts()[card]?.manaCost"
              />
            </div>
          } @empty {
            <span class="empty">-</span>
          }
        </div>
      </div>
      @if (board().commandZone.length > 0) {
        <div class="zone">
          <div class="zone-name">Command zone</div>
          <div class="cards">
            @for (card of board().commandZone; track $index) {
              <div class="card-box">
                <app-card-image
                  [name]="card"
                  [typeLine]="cardFacts()[card]?.typeLine"
                  [manaCost]="cardFacts()[card]?.manaCost"
                />
              </div>
            }
          </div>
        </div>
      }
    </div>

    <div class="names">
      <span class="zone-name">Graveyard ({{ board().graveyard.length }})</span>
      {{ board().graveyard.join(', ') || '-' }}
    </div>
    @if (board().exile.length > 0) {
      <div class="names">
        <span class="zone-name">Exile ({{ board().exile.length }})</span>
        {{ board().exile.join(', ') }}
      </div>
    }
  `,
  styleUrl: './player-board.scss',
  host: { '[class.is-active]': 'isActive()' },
})
export class PlayerBoard {
  readonly player = input.required<LogPlayer>();
  readonly board = input.required<Board>();
  readonly isActive = input(false);
  readonly cardFacts = input<CardFactsAnswer>({});

  /** The other permanents on the first row, the lands on the second. */
  protected readonly battlefieldRows = computed((): PermanentStack[][] => {
    const { lands, others } = splitBattlefield(this.board(), (cardName) =>
      /\bLand\b/.test(this.cardFacts()[cardName]?.typeLine ?? ''),
    );
    return [others, lands];
  });

  /** +1/+1 counters as the change they make: "+2/+2", "-1/-1". */
  protected describeCounters(counters: number): string {
    const change = `${counters > 0 ? '+' : ''}${counters}`;
    return `${change}/${change}`;
  }
}
