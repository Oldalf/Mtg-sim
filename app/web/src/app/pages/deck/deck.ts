import { Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButton } from '@angular/material/button';
import { MatProgressBar } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import type { DecklistCard } from '../../../../../api-types';
import { ApiService } from '../../core/api';
import { CardImage } from '../../shared/card-image/card-image';
import { ErrorBox } from '../../shared/error-box/error-box';

/**
 * One deck: its lists, and the chosen list by section. The card under the pointer (or the one tapped or focused)
 * is shown large next to the list. The list is chosen with `?list=`; without it the deck's default list opens.
 */
@Component({
  imports: [MatButton, MatProgressBar, RouterLink, CardImage, ErrorBox],
  selector: 'app-deck',
  templateUrl: './deck.html',
  styleUrl: './deck.scss',
})
export class Deck {
  /** From the route. */
  readonly deck = input.required<string>();
  /** From the query string (`?list=lists/proposed.txt`). */
  readonly list = input<string>();

  private readonly api = inject(ApiService);
  protected readonly decks = rxResource({ stream: () => this.api.decks() });

  protected readonly summary = computed(() =>
    this.decks.value()?.find((deck) => deck.name === this.deck()),
  );
  protected readonly chosenList = computed(
    () => this.list() ?? this.summary()?.defaultList,
  );
  protected readonly decklist = rxResource({
    params: () => {
      const list = this.chosenList();
      return list ? { deck: this.deck(), list } : undefined;
    },
    stream: ({ params }) => this.api.decklist(params.deck, params.list),
  });

  /** The card shown large; the first commander until another is pointed at. */
  private readonly pointedAtCard = signal<DecklistCard | undefined>(undefined);
  protected readonly shownCard = computed(
    () => this.pointedAtCard() ?? this.decklist.value()?.commanders[0],
  );
  /** A Commander deck has 100 cards. */
  protected readonly hasWrongCardCount = computed(() => {
    const decklist = this.decklist.value();
    return decklist !== undefined && decklist.cardCount !== 100;
  });

  protected showCard(card: DecklistCard): void {
    this.pointedAtCard.set(card);
  }

  protected listLabel(listFile: string): string {
    return listFile.replace(/\.txt$/, '');
  }
}
