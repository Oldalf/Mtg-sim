import { Component, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatProgressBar } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import { forkJoin, map, of, switchMap } from 'rxjs';
import type { GameListRow } from '../../../../../api-types';
import { ApiService } from '../../core/api';
import { TagChip } from '../../shared/tag-chip/tag-chip';

/** The games of one tag (a tag has a few games only: GAMES_PER_TAG in engine/game-log-tags.ts). */
interface TaggedGames {
  tag: string;
  games: GameListRow[];
}

/** Enough to get every game of a tag in one call. */
const MOST_GAMES_OF_A_TAG = 20;

/**
 * The tagged games of one run folder (fastest, slowest, average, win stopped...), each a link into the game viewer,
 * and a link to all the games of the run.
 */
@Component({
  selector: 'app-games-worth-a-look',
  imports: [MatProgressBar, RouterLink, TagChip],
  template: `
    <h3>
      {{ label() }}
      <a class="all-games" [routerLink]="['/games', runFolder()]">
        all games
      </a>
    </h3>
    @if (taggedGames.isLoading()) {
      <mat-progress-bar mode="indeterminate" />
    }
    @for (tagged of taggedGames.value(); track tagged.tag) {
      <div class="tag-row">
        <app-tag-chip [tag]="tagged.tag" />
        <span class="games">
          @for (game of tagged.games; track game.seed) {
            <a [routerLink]="['/games', runFolder(), game.seed]">
              {{ game.seed }}: {{ game.result }}
            </a>
          }
        </span>
      </div>
    } @empty {
      @if (taggedGames.hasValue()) {
        <p class="note">No tagged games.</p>
      }
    }
  `,
  styles: `
    h3 {
      font: var(--mat-sys-title-small);
      margin: 12px 0 4px;
    }
    .all-games {
      margin-left: 12px;
      font: var(--mat-sys-body-medium);
    }
    .tag-row {
      display: flex;
      align-items: baseline;
      gap: 12px;
      margin: 4px 0;
    }
    app-tag-chip {
      flex: none;
      width: 130px;
    }
    .games {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 16px;
    }
    .note {
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class GamesWorthALook {
  /** The session-logs folder of the run (one per list). */
  readonly runFolder = input.required<string>();
  /** What the folder holds: the list, or the changed settings. */
  readonly label = input.required<string>();

  private readonly api = inject(ApiService);

  protected readonly taggedGames = rxResource({
    params: () => this.runFolder(),
    stream: ({ params: runFolder }) =>
      this.api.logs().pipe(
        map(
          (runs) =>
            runs.find((run) => run.info.name === runFolder)?.tagCounts ?? {},
        ),
        switchMap((tagCounts) => {
          const tags = Object.keys(tagCounts).sort();
          if (tags.length === 0) return of([]);
          return forkJoin(
            tags.map((tag) =>
              this.api
                .games(runFolder, { tag, count: MOST_GAMES_OF_A_TAG })
                .pipe(
                  map((answer): TaggedGames => ({ tag, games: answer.rows })),
                ),
            ),
          );
        }),
      ),
  });
}
