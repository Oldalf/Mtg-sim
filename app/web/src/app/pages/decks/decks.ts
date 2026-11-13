import { Component, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatCardModule } from '@angular/material/card';
import { MatProgressBar } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api';
import { ErrorBox } from '../../shared/error-box/error-box';

/** Every deck with its commanders and how many lists it has; a click opens the deck. */
@Component({
  imports: [MatCardModule, MatProgressBar, RouterLink, ErrorBox],
  selector: 'app-decks',
  template: `
    <h1>Decks</h1>
    @if (decks.isLoading()) {
      <mat-progress-bar mode="indeterminate" />
    }
    @if (decks.error()) {
      <app-error-box
        title="The decks did not load"
        message="Is the server running?"
      />
    }
    <div class="deck-grid">
      @for (deck of decks.value(); track deck.name) {
        <a class="deck-link" [routerLink]="['/decks', deck.name]">
          <mat-card appearance="outlined">
            <mat-card-header>
              <mat-card-title>{{ deck.name }}</mat-card-title>
              <mat-card-subtitle>
                {{ deck.commanders.join(' + ') }}
              </mat-card-subtitle>
            </mat-card-header>
            <mat-card-content>
              {{ deck.lists.length }}
              {{ deck.lists.length === 1 ? 'list' : 'lists' }}
            </mat-card-content>
          </mat-card>
        </a>
      }
    </div>
  `,
  styles: `
    .deck-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 12px;
    }
    .deck-link {
      text-decoration: none;
      color: inherit;
    }
    // every card the same size, whatever its commanders are called
    mat-card {
      height: 120px;
    }
    mat-card-title,
    mat-card-subtitle {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    mat-card:hover {
      border-color: var(--mat-sys-primary);
    }
  `,
})
export class Decks {
  private readonly api = inject(ApiService);
  protected readonly decks = rxResource({ stream: () => this.api.decks() });
}
