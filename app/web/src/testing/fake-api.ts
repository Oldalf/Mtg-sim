import { of, type Observable } from 'rxjs';
import type {
  CurrentRunAnswer,
  DeckSetting,
  DeckSummary,
  RunRequest,
  StartRunAnswer,
} from '../../../api-types';

/** An engine setting unless `isDeckOwn`; one a pod uses unless `appliesInPod` is false. */
function setting(
  name: string,
  defaultValue: number | boolean,
  description: string,
  { isDeckOwn = false, appliesInPod = true } = {},
): DeckSetting {
  return { name, defaultValue, description, isDeckOwn, appliesInPod };
}

/** Two made-up decks for the page tests: alpha without --diag, beta with it. */
export const FAKE_DECKS: DeckSummary[] = [
  {
    name: 'alpha',
    commanders: ['Alpha Commander'],
    defaultList: 'decklist.txt',
    lists: ['decklist.txt', 'lists/alpha-two.txt'],
    settings: [
      setting('opponents', 3, 'How many goldfish opponents.', {
        appliesInPod: false,
      }),
      setting('max_turn', 8, 'The last turn played.'),
      setting('planner_width', 2, 'How many plays the planner compares.', {
        isDeckOwn: true,
      }),
      setting('smart_mulligan', true, "The deck's mulligan rule."),
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
      setting('max_turn', 9, 'The last turn played.'),
      setting('combat_safety', 10, 'Attack only above this life.'),
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
