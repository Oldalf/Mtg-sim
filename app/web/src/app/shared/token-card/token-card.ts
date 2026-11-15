import {
  Component,
  computed,
  inject,
  input,
  linkedSignal,
} from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { ApiService } from '../../core/api';
import type { TokenFace } from '../../../../../../shared/game-log-types';

/**
 * A creature token as the game has it: Scryfall's art for that kind of token in our own frame, with the token's name,
 * power/toughness (its +1/+1 counters added), keywords, and x999 for an army. The game owns the stats, Scryfall only
 * gives the picture, so any size shows right. With no art (a made-up token, no network) the frame shows a placeholder.
 * The width comes from the parent; the height follows.
 */
@Component({
  imports: [MatIcon],
  selector: 'app-token-card',
  template: `
    <div class="frame" [attr.data-colour]="colour()" [title]="description()">
      <!-- power/toughness at the top: the seat's badges cover the bottom right -->
      <div class="name-line">
        <span class="name">{{ name() }}</span>
        <span class="power-toughness">{{ powerToughness() }}</span>
      </div>
      <div class="art">
        @if (hasArt()) {
          <img
            [src]="artUrl()"
            [alt]="name()"
            loading="lazy"
            (error)="hasArt.set(false)"
          />
        } @else {
          <mat-icon class="placeholder-icon" aria-hidden="true">image</mat-icon>
        }
      </div>
      <div class="bottom-line">
        @if (face().copies) {
          <span class="copies">x{{ face().copies }}</span>
        }
        <span class="keywords">{{ face().keywords.join(', ') }}</span>
      </div>
    </div>
  `,
  styleUrl: './token-card.scss',
  host: { '[class.is-tapped]': 'isTapped()' },
})
export class TokenCard {
  readonly name = input.required<string>();
  readonly face = input.required<TokenFace>();
  /** +1/+1 counters: added to the power and toughness shown. */
  readonly counters = input(0);
  readonly isTapped = input(false);

  private readonly api = inject(ApiService);
  protected readonly artUrl = computed(() =>
    this.api.tokenArtUrl(this.name(), this.face()),
  );
  protected readonly powerToughness = computed(
    () =>
      `${this.face().power + this.counters()}/${this.face().toughness + this.counters()}`,
  );
  /** One colour as itself, more than one gold, none colourless (as a text card). */
  protected readonly colour = computed(() => {
    const colours = this.face().colours;
    if (colours.length > 1) return 'gold';
    return colours[0] ?? 'colorless';
  });
  protected readonly description = computed(() =>
    [
      `${this.name()} token ${this.powerToughness()}`,
      ...this.face().colours,
      ...this.face().keywords,
    ].join(' '),
  );
  /** Turns false when the art fails to load; tries again for another token. */
  protected readonly hasArt = linkedSignal({
    source: () => this.artUrl(),
    computation: () => true,
  });
}
