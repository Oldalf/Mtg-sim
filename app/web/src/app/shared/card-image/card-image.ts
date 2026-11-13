import {
  Component,
  computed,
  inject,
  input,
  linkedSignal,
} from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { ApiService } from '../../core/api';
import { colourOfCard } from './card-colour';

/**
 * A card: its image from the server, or a placeholder of the same size when there is none (a token, a card without
 * data, no network the first time): the name, cost and type on the card's colour. The width comes from the parent
 * (`width` on the element); the height follows.
 */
@Component({
  imports: [MatIcon],
  selector: 'app-card-image',
  template: `
    @if (hasImage()) {
      <img
        [src]="imageUrl()"
        [alt]="name()"
        [title]="name()"
        loading="lazy"
        (error)="hasImage.set(false)"
      />
    } @else {
      <div class="text-card" [attr.data-colour]="colour()" [title]="name()">
        <div class="title-line">
          <span class="name">{{ name() }}</span>
          @if (manaCost()) {
            <span class="mana-cost">{{ manaCost() }}</span>
          }
        </div>
        @if (typeLine()) {
          <div class="type-line">{{ typeLine() }}</div>
        }
        <mat-icon class="placeholder-icon" aria-hidden="true">image</mat-icon>
      </div>
    }
  `,
  styleUrl: './card-image.scss',
  host: { '[class.is-tapped]': 'isTapped()' },
})
export class CardImage {
  readonly name = input.required<string>();
  /** Shown on the text card. */
  readonly typeLine = input<string>();
  readonly manaCost = input<string>();
  readonly isTapped = input(false);
  /** The Scryfall id of a specific print to show; without it the server's print. */
  readonly print = input<string>();

  private readonly api = inject(ApiService);
  protected readonly imageUrl = computed(() =>
    this.api.cardImageUrl(this.name(), this.print()),
  );
  protected readonly colour = computed(() =>
    colourOfCard(this.manaCost(), this.typeLine()),
  );
  /** Turns false when the image fails to load; tries again for another card. */
  protected readonly hasImage = linkedSignal({
    source: () => [this.name(), this.print()],
    computation: () => true,
  });
}
