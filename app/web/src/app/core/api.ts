import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';
import type {
  CurrentRunAnswer,
  DecklistAnswer,
  DecksAnswer,
  GameAnswer,
  GamesAnswer,
  HealthAnswer,
  LogsAnswer,
  RealLogsAnswer,
  RunRequest,
  StartRunAnswer,
} from '../../../../api-types';

/** Which games of a run to list (GET /api/logs/<run>/games). Left out = no filter. */
export interface GamesFilter {
  tag?: string;
  /** A deck's index in the pod, or 'none' for games nobody won. */
  winner?: number | 'none';
  from?: number;
  count?: number;
}

/**
 * The server's API (PLAN.md, "The API"): one typed method per call. An error answer becomes a message on the page
 * by itself (show-http-errors.ts); a caller only handles it when it wants to do more than show it.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  health(): Observable<HealthAnswer> {
    return this.http.get<HealthAnswer>('/api/health');
  }

  /** Every deck. `withOldLists` adds lists/old and lists/cuts to their list files. */
  decks(withOldLists = false): Observable<DecksAnswer> {
    const params: Record<string, string> = withOldLists ? { all: '1' } : {};
    return this.http.get<DecksAnswer>('/api/decks', { params });
  }

  /** A decklist; `list` is relative to the deck folder (e.g. "lists/proposed.txt"). */
  decklist(deck: string, list: string): Observable<DecklistAnswer> {
    return this.http.get<DecklistAnswer>(
      `/api/decks/${encodeURIComponent(deck)}/lists/${encodeURIComponent(list)}`,
    );
  }

  /** Starts a run (409 when one is going). */
  startRun(request: RunRequest): Observable<StartRunAnswer> {
    return this.http.post<StartRunAnswer>('/api/runs', request);
  }

  /** The run in progress, or the last one (null before the first). */
  currentRun(): Observable<CurrentRunAnswer> {
    return this.http.get<CurrentRunAnswer>('/api/runs/current');
  }

  stopCurrentRun(): Observable<CurrentRunAnswer> {
    return this.http.post<CurrentRunAnswer>('/api/runs/current/stop', {});
  }

  /** The run folders of this session. */
  logs(): Observable<LogsAnswer> {
    return this.http.get<LogsAnswer>('/api/logs');
  }

  /** A page of the games of a run, filtered. */
  games(runFolder: string, filter: GamesFilter = {}): Observable<GamesAnswer> {
    let params = new HttpParams();
    for (const [name, value] of Object.entries(filter))
      if (value !== undefined) params = params.set(name, String(value));
    return this.http.get<GamesAnswer>(
      `/api/logs/${encodeURIComponent(runFolder)}/games`,
      { params },
    );
  }

  /** One game of a run, with its whole log. */
  game(runFolder: string, seed: number): Observable<GameAnswer> {
    return this.http.get<GameAnswer>(
      `/api/logs/${encodeURIComponent(runFolder)}/games/${seed}`,
    );
  }

  /** The file names of a deck's real Archidekt logs. */
  realLogs(deck: string): Observable<RealLogsAnswer> {
    return this.http.get<RealLogsAnswer>(
      `/api/decks/${encodeURIComponent(deck)}/logs`,
    );
  }

  /** One real Archidekt log, read as a game log. */
  realLog(deck: string, file: string): Observable<GameAnswer> {
    return this.http.get<GameAnswer>(
      `/api/decks/${encodeURIComponent(deck)}/logs/${encodeURIComponent(file)}`,
    );
  }

  /** Where a card's image is (an <img> loads it; 404 when there is none). */
  cardImageUrl(cardName: string): string {
    return `/api/cards/${encodeURIComponent(cardName)}/image`;
  }
}
