import { Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButton } from '@angular/material/button';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatPaginator, type PageEvent } from '@angular/material/paginator';
import { MatProgressBar } from '@angular/material/progress-bar';
import { MatOption, MatSelect } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { Router, RouterLink } from '@angular/router';
import { ApiService, type GamesFilter } from '../../core/api';
import { ErrorBox } from '../../shared/error-box/error-box';
import { TagChip } from '../../shared/tag-chip/tag-chip';
import { PodResult } from '../pod/pod-result';
import { GoldfishResult } from '../simulate/goldfish-result';

const ALL = 'all';
const GAMES_PER_PAGE = 50;

/** The games of one run as a table: filter by tag (and winner, in a pod), a page at a time, jump to a seed. */
@Component({
  selector: 'app-run-games',
  imports: [
    GoldfishResult,
    MatButton,
    MatExpansionModule,
    PodResult,
    MatFormField,
    MatInput,
    MatLabel,
    MatOption,
    MatPaginator,
    MatProgressBar,
    MatSelect,
    MatTableModule,
    RouterLink,
    ErrorBox,
    TagChip,
  ],
  template: `
    <h1>{{ run() }}</h1>
    @if (report.value(); as shownReport) {
      <mat-accordion>
        <mat-expansion-panel>
          <mat-expansion-panel-header>
            <mat-panel-title>Stats of the run</mat-panel-title>
          </mat-expansion-panel-header>
          <ng-template matExpansionPanelContent>
            @if (runInfo(); as info) {
              @if (info.mode === 'pod') {
                <app-pod-result [report]="shownReport" />
              } @else {
                <app-goldfish-result
                  [report]="shownReport"
                  [deck]="info.decks[0]"
                />
              }
            }
          </ng-template>
        </mat-expansion-panel>
      </mat-accordion>
    }
    <p><a routerLink="/games">All runs</a></p>
    @if (summary.isLoading() || games.isLoading()) {
      <mat-progress-bar mode="indeterminate" />
    }
    @if (summary.hasValue() && !runInfo()) {
      <app-error-box
        title="No such run"
        message="The runs are cleared when the app starts."
      />
    }
    @if (runInfo(); as info) {
      <div class="filters">
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Tag</mat-label>
          <mat-select [value]="tag()" (valueChange)="changeTag($event)">
            <mat-option [value]="ALL">all games</mat-option>
            @for (tagName of tagNames(); track tagName) {
              <mat-option [value]="tagName">
                {{ tagName }} ({{ tagCounts()[tagName] }})
              </mat-option>
            }
          </mat-select>
        </mat-form-field>
        @if (info.mode === 'pod' && info.pod) {
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Winner</mat-label>
            <mat-select [value]="winner()" (valueChange)="changeWinner($event)">
              <mat-option [value]="ALL">anyone</mat-option>
              @for (deck of info.pod.decks; track $index) {
                <mat-option [value]="'' + $index">{{ deck }}</mat-option>
              }
              <mat-option value="none">nobody</mat-option>
            </mat-select>
          </mat-form-field>
        }
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Seed</mat-label>
          <input
            matInput
            type="number"
            #seedField
            (keydown.enter)="openSeed(seedField.value)"
          />
        </mat-form-field>
        <button matButton="outlined" (click)="openSeed(seedField.value)">
          Open seed
        </button>
      </div>
    }

    <table mat-table [dataSource]="rows()">
      <ng-container matColumnDef="seed">
        <th mat-header-cell *matHeaderCellDef>Seed</th>
        <td mat-cell *matCellDef="let row">
          <a class="row-link" [routerLink]="['/games', run(), row.seed]">{{
            row.seed
          }}</a>
        </td>
      </ng-container>
      <ng-container matColumnDef="result">
        <th mat-header-cell *matHeaderCellDef>Result</th>
        <td mat-cell *matCellDef="let row">{{ row.result }}</td>
      </ng-container>
      <ng-container matColumnDef="tags">
        <th mat-header-cell *matHeaderCellDef>Tags</th>
        <td mat-cell *matCellDef="let row">
          <span class="tags">
            @for (rowTag of row.tags; track rowTag) {
              <app-tag-chip [tag]="rowTag" />
            }
          </span>
        </td>
      </ng-container>
      <tr mat-header-row *matHeaderRowDef="columns"></tr>
      <tr mat-row *matRowDef="let row; columns: columns"></tr>
    </table>
    @if (games.hasValue() && rows().length === 0) {
      <p class="note">No games match.</p>
    }
    <mat-paginator
      [length]="total()"
      [pageSize]="GAMES_PER_PAGE"
      [pageIndex]="pageIndex()"
      [hidePageSize]="true"
      [showFirstLastButtons]="true"
      (page)="changePage($event)"
    />
  `,
  styles: `
    .filters {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px;
      margin-bottom: 12px;
    }
    mat-accordion {
      display: block;
      margin-bottom: 12px;
    }
    table {
      width: 100%;
    }
    tr[mat-row] {
      position: relative;
      cursor: pointer;
    }
    /* The seed's link covers the whole row, so a click anywhere opens the game. */
    .row-link::after {
      content: '';
      position: absolute;
      inset: 0;
    }
    .tags {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }
    .note {
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class RunGames {
  /** The run folder, from the route. */
  readonly run = input.required<string>();

  protected readonly ALL = ALL;
  protected readonly GAMES_PER_PAGE = GAMES_PER_PAGE;
  protected readonly columns = ['seed', 'result', 'tags'];

  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  protected readonly tag = signal(ALL);
  /** ALL, 'none', or a deck's index in the pod as text. */
  protected readonly winner = signal(ALL);
  protected readonly pageIndex = signal(0);

  protected readonly summary = rxResource({ stream: () => this.api.logs() });
  private readonly runSummary = computed(() =>
    this.summary.value()?.find((summary) => summary.info.name === this.run()),
  );
  protected readonly runInfo = computed(() => this.runSummary()?.info);
  protected readonly tagCounts = computed(
    () => this.runSummary()?.tagCounts ?? {},
  );
  protected readonly tagNames = computed(() =>
    Object.keys(this.tagCounts()).sort(),
  );

  /** What the run printed; null for a run without a saved report (stopped, or older). */
  protected readonly report = rxResource({
    params: () => this.run(),
    stream: ({ params: runFolder }) => this.api.runReport(runFolder),
  });

  protected readonly games = rxResource({
    params: () => ({
      run: this.run(),
      tag: this.tag(),
      winner: this.winner(),
      pageIndex: this.pageIndex(),
    }),
    stream: ({ params }) => {
      const filter: GamesFilter = {
        from: params.pageIndex * GAMES_PER_PAGE,
        count: GAMES_PER_PAGE,
      };
      if (params.tag !== ALL) filter.tag = params.tag;
      if (params.winner === 'none') filter.winner = 'none';
      else if (params.winner !== ALL) filter.winner = Number(params.winner);
      return this.api.games(params.run, filter);
    },
  });
  protected readonly rows = computed(() => this.games.value()?.rows ?? []);
  protected readonly total = computed(() => this.games.value()?.total ?? 0);

  protected changeTag(tag: string): void {
    this.tag.set(tag);
    this.pageIndex.set(0);
  }

  protected changeWinner(winner: string): void {
    this.winner.set(winner);
    this.pageIndex.set(0);
  }

  protected changePage(event: PageEvent): void {
    this.pageIndex.set(event.pageIndex);
  }

  protected openSeed(seedText: string): void {
    if (!/^\d+$/.test(seedText.trim())) return;
    void this.router.navigate(['/games', this.run(), Number(seedText)]);
  }
}
