import { Component, computed, input, linkedSignal } from '@angular/core';
import type { CardFactsAnswer } from '../../../../../api-types';
import type { PlayerBoard } from '../../../../../../shared/game-log-board';
import type { LogPlayer } from '../../../../../../shared/game-log-types';
import { CardImage } from '../../shared/card-image/card-image';
import { splitBattlefield } from './game-steps';
import { countLands, permanentGrid } from './table-layout';

/** A zone shown as a count that opens its cards on click. */
interface CountedZone {
  key: string;
  label: string;
  cards: string[];
}

/**
 * One seat of the table: name, commanders and life (big, with the change of the chosen line), the permanents as cards
 * sized to fit the seat (alike ones stacked, tapped ones turned, counters and tokens marked), the lands fanned in a
 * thin row, and the hidden zones as counts that open on click. On a phone a seat that is not the active one folds to
 * its header.
 */
@Component({
  selector: 'app-player-seat',
  imports: [CardImage],
  templateUrl: './player-seat.html',
  styleUrl: './player-seat.scss',
  host: {
    '[class.is-active]': 'isActive()',
    '[class.is-out]': 'isOut()',
    '[class.is-folded]': '!isUnfolded()',
    '[style.--permanent-rows]': 'grid().rows',
    '[style.--permanents-per-row]': 'grid().perRow',
  },
})
export class PlayerSeat {
  readonly player = input.required<LogPlayer>();
  /** Index into GameLog.players: keeps the popover ids of the seats apart. */
  readonly playerIndex = input.required<number>();
  readonly board = input.required<PlayerBoard>();
  readonly isActive = input(false);
  /** A one-player game has no active seat, but its board still opens on a phone. */
  readonly isOnlySeat = input(false);
  readonly cardFacts = input<CardFactsAnswer>({});
  /** The cards the chosen line moved or changed on this seat: they glow. */
  readonly changedCards = input<string[]>([]);
  /** Life gained or lost on the chosen line. */
  readonly lifeChange = input(0);

  /** Phone only: the active seat is open, the others folded (a tap on the name opens one). */
  protected readonly isUnfolded = linkedSignal(
    () => this.isActive() || this.isOnlySeat(),
  );

  protected readonly isOut = computed(() => {
    const life = this.board().life;
    return life !== null && life <= 0;
  });
  protected readonly battlefield = computed(() =>
    splitBattlefield(this.board(), (cardName) =>
      /\bLand\b/.test(this.cardFacts()[cardName]?.typeLine ?? ''),
    ),
  );
  protected readonly grid = computed(() =>
    permanentGrid(this.battlefield().others.length),
  );
  protected readonly lands = computed(() =>
    countLands(this.battlefield().lands),
  );
  /** Every land on its own (five Forests are five cards), fanned. */
  protected readonly landCards = computed(() =>
    this.battlefield().lands.flatMap((stack) =>
      Array.from({ length: stack.count }, () => stack.permanent),
    ),
  );
  /** Hand and graveyard always; exile and the command zone only when something is there. */
  protected readonly countedZones = computed((): CountedZone[] => {
    const board = this.board();
    return [
      { key: 'hand', label: 'hand', cards: board.hand },
      { key: 'graveyard', label: 'graveyard', cards: board.graveyard },
      { key: 'exile', label: 'exile', cards: board.exile },
      { key: 'command', label: 'command zone', cards: board.commandZone },
    ].filter(
      (zone) =>
        zone.key === 'hand' ||
        zone.key === 'graveyard' ||
        zone.cards.length > 0,
    );
  });

  protected popoverId(zoneKey: string): string {
    return `seat-${this.playerIndex()}-${zoneKey}`;
  }

  /** +1/+1 counters as the change they make: "+2/+2", "-1/-1". */
  protected describeCounters(counters: number): string {
    const change = `${counters > 0 ? '+' : ''}${counters}`;
    return `${change}/${change}`;
  }
}
