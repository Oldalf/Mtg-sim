import { Component, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatCardModule } from '@angular/material/card';
import { MatProgressBar } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import { forkJoin, map, switchMap } from 'rxjs';
import { ApiService } from '../../core/api';
import { ErrorBox } from '../../shared/error-box/error-box';

/** A deck with the file names of its real Archidekt logs. */
interface DeckRealLogs {
  deck: string;
  files: string[];
}

/** The games of this session's runs, and each deck's real games (the Archidekt logs). */
@Component({
  selector: 'app-games',
  imports: [MatCardModule, MatProgressBar, RouterLink, ErrorBox],
  template: `
    <h1>Games</h1>
    @if (runs.isLoading() || realLogs.isLoading()) {
      <mat-progress-bar mode="indeterminate" />
    }
    @if (runs.error()) {
      <app-error-box
        title="The runs did not load"
        message="Is the server running?"
      />
    }

    <h2>Runs of this session</h2>
    @for (run of newestFirst(); track run.info.name) {
      <a class="link" [routerLink]="['/games', run.info.name]">
        <mat-card appearance="outlined">
          <mat-card-header>
            <mat-card-title>{{ run.info.name }}</mat-card-title>
            <mat-card-subtitle>
              {{ run.info.mode === 'pod' ? 'pod' : 'goldfish' }},
              {{ run.info.gameCount }} games,
              {{ run.info.decks.join(' + ') }}
            </mat-card-subtitle>
          </mat-card-header>
        </mat-card>
      </a>
    } @empty {
      @if (runs.hasValue()) {
        <p class="note">
          No runs yet. Start one on the Simulate or Pod page; the runs are
          cleared when the app starts.
        </p>
      }
    }

    <h2>Real games</h2>
    @for (deckLogs of realLogs.value(); track deckLogs.deck) {
      <h3>{{ deckLogs.deck }}</h3>
      <div class="files">
        @for (file of deckLogs.files; track file) {
          <a [routerLink]="['/games/real', deckLogs.deck, file]">{{ file }}</a>
        }
      </div>
    } @empty {
      @if (realLogs.hasValue()) {
        <p class="note">No real logs.</p>
      }
    }
  `,
  styles: `
    h2 {
      font: var(--mat-sys-title-medium);
      margin: 20px 0 8px;
    }
    h3 {
      font: var(--mat-sys-title-small);
      margin: 12px 0 4px;
    }
    .link {
      display: block;
      margin-bottom: 8px;
      text-decoration: none;
      color: inherit;
    }
    .link:hover mat-card {
      border-color: var(--mat-sys-primary);
    }
    .files {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 16px;
    }
    .note {
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class Games {
  private readonly api = inject(ApiService);

  protected readonly runs = rxResource({ stream: () => this.api.logs() });
  protected readonly newestFirst = computed(() =>
    [...(this.runs.value() ?? [])].reverse(),
  );

  /** Only the decks that have real logs. */
  protected readonly realLogs = rxResource({
    stream: () =>
      this.api.decks().pipe(
        switchMap((decks) =>
          forkJoin(
            decks.map((deck) =>
              this.api
                .realLogs(deck.name)
                .pipe(
                  map((files): DeckRealLogs => ({ deck: deck.name, files })),
                ),
            ),
          ),
        ),
        map((all) => all.filter((deckLogs) => deckLogs.files.length > 0)),
      ),
  });
}
