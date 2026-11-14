import { of, type Observable } from 'rxjs';
import type {
  CurrentRunAnswer,
  DeckSummary,
  RunRequest,
  StartRunAnswer,
} from '../../../api-types';

/** Two made-up decks for the page tests: alpha without --diag, beta with it. */
export const FAKE_DECKS: DeckSummary[] = [
  {
    name: 'alpha',
    commanders: ['Alpha Commander'],
    defaultList: 'decklist.txt',
    lists: ['decklist.txt', 'lists/alpha-two.txt'],
    settings: [
      { name: 'max_turn', defaultValue: 8 },
      { name: 'planner_width', defaultValue: 2 },
      { name: 'smart_mulligan', defaultValue: true },
    ],
    resultNames: ['Win possible (any)', 'Win with counter backup'],
    hasDiag: false,
  },
  {
    name: 'beta',
    commanders: ['Beta Commander'],
    defaultList: 'decklist.txt',
    lists: ['decklist.txt', 'lists/beta-two.txt'],
    settings: [
      { name: 'max_turn', defaultValue: 9 },
      { name: 'combat_safety', defaultValue: 10 },
    ],
    resultNames: ['Win', 'Win by turn'],
    hasDiag: true,
  },
];

/**
 * Stands in for ApiService in the page tests: the decks above, no run going, and every run request kept in
 * `startedRuns` (as JSON would carry it) instead of being sent.
 */
export class FakeApi {
  readonly startedRuns: RunRequest[] = [];

  decks(): Observable<DeckSummary[]> {
    return of(FAKE_DECKS);
  }

  currentRun(): Observable<CurrentRunAnswer> {
    return of(null);
  }

  startRun(request: RunRequest): Observable<StartRunAnswer> {
    // as the server receives it: Signal Forms marks array items with a symbol key, which JSON leaves out
    this.startedRuns.push(JSON.parse(JSON.stringify(request)));
    return of({ runId: `run-${this.startedRuns.length}` });
  }
}
