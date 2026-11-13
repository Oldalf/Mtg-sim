import {
  Component,
  computed,
  inject,
  input,
  linkedSignal,
} from '@angular/core';
import { ApiService } from '../../core/api';

/**
 * A card: its image from the server, or a plain text card when there is none (a token, a card without data, no
 * network the first time). The width comes from the parent (`width` on the element); the height follows.
 */
@Component({
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
      <div class="text-card" [title]="name()">
        <div class="title-line">
          <span class="name">{{ name() }}</span>
          @if (manaCost()) {
            <span class="mana-cost">{{ manaCost() }}</span>
          }
        </div>
        @if (typeLine()) {
          <div class="type-line">{{ typeLine() }}</div>
        }
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

  private readonly api = inject(ApiService);
  protected readonly imageUrl = computed(() =>
    this.api.cardImageUrl(this.name()),
  );
  /** Turns false when the image fails to load; tries again for another card. */
  protected readonly hasImage = linkedSignal({
    source: this.name,
    computation: () => true,
  });
}
