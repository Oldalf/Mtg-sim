import {
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import {
  applyEach,
  form,
  FormField,
  FormRoot,
  max,
  min,
  required,
  schema,
} from '@angular/forms/signals';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatError, MatFormField, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatProgressBar } from '@angular/material/progress-bar';
import type { DeckSummary, PodRunRequest } from '../../../../../api-types';
import { ApiService } from '../../core/api';
import { CurrentRunService } from '../../core/current-run';
import { RunProgress } from '../../shared/run-progress/run-progress';
import { PodResult } from './pod-result';

const MIN_SEATS = 3;
const MAX_SEATS = 6;
const DEFAULT_SEATS = 4;
const DEFAULT_GAMES = 1_000;
/** The most games the server plays in one run (app/server/run-requests.ts). */
const MOST_GAMES = 50_000;
/** The command line's default (cli/pod-command.ts). */
const DEFAULT_ROUNDS_CAP = 17;
const MOST_ROUNDS = 50;

/** Who attacks aim at, and when a deck with a kill line goes for it (engine/pod.ts). */
const THREAT_CHOICES = ['leader', 'spread', 'weakest', 'damage'];
const POLICY_CHOICES = ['any', 'protected', 'mixed', 'window'];
const DEFAULT_THREAT = 'leader';
const DEFAULT_POLICY = 'any';

interface Seat {
  deck: string;
  /** List file, relative to the deck folder. */
  list: string;
}

interface PodFormModel {
  seats: Seat[];
  games: number;
  rounds: number;
  threat: string;
  /** One policy for every deck that plays. */
  policy: string;
  powerSave: boolean;
}

/** What the server accepts (app/server/run-requests.ts checks the same). */
const POD_FORM_RULES = schema<PodFormModel>((path) => {
  applyEach(path.seats, (seatPath) => {
    required(seatPath.deck, { message: 'Choose a deck' });
    required(seatPath.list, { message: 'Choose a list' });
  });
  required(path.games, { message: 'How many games?' });
  min(path.games, 1, { message: 'At least 1 game' });
  max(path.games, MOST_GAMES, {
    message: `At most ${MOST_GAMES.toLocaleString('en')} games`,
  });
  required(path.rounds, { message: 'How many rounds?' });
  min(path.rounds, 1, { message: 'At least 1 round' });
  max(path.rounds, MOST_ROUNDS, { message: `At most ${MOST_ROUNDS} rounds` });
});

/** Pod: 3 to 6 seats, a deck and a list in each, play each other; follow the run and read its result. */
@Component({
  selector: 'app-pod',
  imports: [
    FormField,
    FormRoot,
    MatButton,
    MatCheckbox,
    MatError,
    MatFormField,
    MatIcon,
    MatIconButton,
    MatInput,
    MatLabel,
    MatProgressBar,
    PodResult,
    RunProgress,
  ],
  templateUrl: './pod.html',
  styleUrl: './pod.scss',
})
export class Pod {
  private readonly api = inject(ApiService);
  protected readonly currentRun = inject(CurrentRunService);
  protected readonly decks = rxResource({ stream: () => this.api.decks() });

  protected readonly threatChoices = THREAT_CHOICES;
  protected readonly policyChoices = POLICY_CHOICES;
  protected readonly minSeats = MIN_SEATS;
  protected readonly maxSeats = MAX_SEATS;

  protected readonly formModel = signal<PodFormModel>({
    seats: [],
    games: DEFAULT_GAMES,
    rounds: DEFAULT_ROUNDS_CAP,
    threat: DEFAULT_THREAT,
    policy: DEFAULT_POLICY,
    powerSave: false,
  });

  /** `[formRoot]` in the template runs the submission action when the form is sent and valid. */
  protected readonly podForm = form(this.formModel, POD_FORM_RULES, {
    submission: { action: async () => this.startRun() },
  });

  /** The page shows the last pod run; a goldfish run shows on the Simulate page. */
  protected readonly podRun = computed(() => {
    const run = this.currentRun.run();
    return run?.request.mode === 'pod' ? run : undefined;
  });

  constructor() {
    this.currentRun.refresh();
    effect(() => {
      const decks = this.decks.value();
      if (decks && untracked(() => this.formModel().seats).length === 0)
        untracked(() => this.fillDefaultSeats(decks));
    });
  }

  protected listsOf(deckName: string): string[] {
    return this.deckNamed(deckName)?.lists ?? [];
  }

  protected listLabel(listFile: string): string {
    return listFile.replace(/\.txt$/, '');
  }

  /** A new deck in a seat: its default list. */
  protected chooseDeck(seatIndex: number, deckName: string): void {
    const deck = this.deckNamed(deckName);
    if (deck) this.changeSeat(seatIndex, seatOf(deck));
  }

  protected addSeat(): void {
    const decks = this.decks.value() ?? [];
    const seats = this.formModel().seats;
    const nextDeck = decks[seats.length % decks.length];
    if (nextDeck) this.setSeats([...seats, seatOf(nextDeck)]);
  }

  protected removeSeat(seatIndex: number): void {
    this.setSeats(
      this.formModel().seats.filter((_seat, index) => index !== seatIndex),
    );
  }

  private deckNamed(deckName: string): DeckSummary | undefined {
    return this.decks.value()?.find((deck) => deck.name === deckName);
  }

  private changeSeat(seatIndex: number, seat: Seat): void {
    this.setSeats(
      this.formModel().seats.map((oldSeat, index) =>
        index === seatIndex ? seat : oldSeat,
      ),
    );
  }

  private setSeats(seats: Seat[]): void {
    this.formModel.update((model) => ({ ...model, seats }));
  }

  /** The first decks with their default lists; the decks again if there are fewer than seats. */
  private fillDefaultSeats(decks: DeckSummary[]): void {
    if (decks.length === 0) return;
    this.setSeats(
      Array.from({ length: DEFAULT_SEATS }, (_, seatIndex) =>
        seatOf(decks[seatIndex % decks.length]),
      ),
    );
  }

  private async startRun(): Promise<void> {
    await this.currentRun.start(this.buildRequest());
  }

  /** The run request: threat and policy only when they differ from the defaults. */
  private buildRequest(): PodRunRequest {
    const model = this.formModel();
    const decksThatPlay = [...new Set(model.seats.map((seat) => seat.deck))];
    return {
      mode: 'pod',
      decks: model.seats,
      games: model.games,
      rounds: model.rounds,
      settings: {},
      threat: model.threat === DEFAULT_THREAT ? undefined : model.threat,
      // the engine takes the policy per deck: "deck:policy,deck:policy"
      policy:
        model.policy === DEFAULT_POLICY
          ? undefined
          : decksThatPlay.map((deck) => `${deck}:${model.policy}`).join(','),
      powerSave: model.powerSave,
    };
  }
}

function seatOf(deck: DeckSummary): Seat {
  return { deck: deck.name, list: deck.defaultList };
}
