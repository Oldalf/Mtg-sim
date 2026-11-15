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
  validate,
} from '@angular/forms/signals';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatCheckbox } from '@angular/material/checkbox';
import {
  MatError,
  MatFormField,
  MatHint,
  MatLabel,
  MatSuffix,
} from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatProgressBar } from '@angular/material/progress-bar';
import { MatOption, MatSelect } from '@angular/material/select';
import type { DeckSummary, PodRunRequest } from '../../../../../api-types';
import { ApiService } from '../../core/api';
import { CurrentRunService } from '../../core/current-run';
import { HelpIcon } from '../../shared/help-icon/help-icon';
import { RunProgress } from '../../shared/run-progress/run-progress';
import { podSettingHelp } from '../../shared/setting-help/setting-help';
import { PodResult, podRunFolder } from './pod-result';

const MIN_SEATS = 3;
const MAX_SEATS = 6;
const DEFAULT_SEATS = 4;
const DEFAULT_GAMES = 1_000;
/** The most games the server plays in one run (app/server/run-requests.ts). */
const MOST_GAMES = 50_000;
/** The command line's default (cli/pod-command.ts). */
const DEFAULT_ROUNDS_CAP = 17;
const MOST_ROUNDS = 50;

/** Who attacks aim at, and when a deck with a kill line goes for it (engine/pod/pod.ts, engine/pod/pod-table.ts). */
const THREAT_CHOICES = ['leader', 'spread', 'weakest', 'damage'];
const POLICY_CHOICES = ['any', 'protected', 'mixed', 'window'];
const THREAT_HELP = [
  'Who the attacks aim at (every deck). Removal and counterspells always aim at the biggest threat.',
  'leader: the biggest threat (board, mana, hand, damage dealt, close to winning).',
  "spread: the player we've hurt least.",
  'weakest: the one with the lowest life.',
  'damage: where the attack does the most damage.',
].join('\n');
const POLICY_HELP = [
  'When a deck that found a kill without counter backup goes for it (every deck).',
  'any: at once.',
  'protected: only with a counterspell and the mana to back it up.',
  'mixed: protected until round 9, then at once.',
  'window: when no opponent can answer (at most 1 untapped mana, or no cards in hand); otherwise it waits for backup.',
].join('\n');
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
  /** The settings of the decks that play, split by type so a number field and a checkbox each get a plain value. */
  numberSettings: { name: string; value: number }[];
  switchSettings: { name: string; isOn: boolean }[];
  powerSave: boolean;
}

/** A setting of the decks in the pod: one value applies to every deck that has a setting of this name. */
interface PodSetting {
  name: string;
  /** The first deck's default; a value equal to it is not sent. */
  defaultValue: number | boolean;
}

/** The deck setting that --turns changes in a goldfish run; a pod has its round cap instead. */
const TURNS_SETTING = 'max_turn';

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
  applyEach(path.numberSettings, (settingPath) =>
    validate(settingPath.value, ({ value }) =>
      Number.isFinite(value())
        ? undefined
        : { kind: 'not-a-number', message: 'A number' },
    ),
  );
});

/** Pod: 3 to 6 seats, a deck and a list in each, play each other; follow the run and read its result. */
@Component({
  selector: 'app-pod',
  imports: [
    FormField,
    FormRoot,
    HelpIcon,
    MatButton,
    MatCheckbox,
    MatError,
    MatFormField,
    MatHint,
    MatSuffix,
    MatIcon,
    MatIconButton,
    MatInput,
    MatLabel,
    MatOption,
    MatProgressBar,
    MatSelect,
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
  protected readonly threatHelp = THREAT_HELP;
  protected readonly policyHelp = POLICY_HELP;
  protected readonly minSeats = MIN_SEATS;
  protected readonly maxSeats = MAX_SEATS;

  protected readonly formModel = signal<PodFormModel>({
    seats: [],
    games: DEFAULT_GAMES,
    rounds: DEFAULT_ROUNDS_CAP,
    threat: DEFAULT_THREAT,
    policy: DEFAULT_POLICY,
    numberSettings: [],
    switchSettings: [],
    powerSave: false,
  });

  /** `[formRoot]` in the template runs the submission action when the form is sent and valid. */
  protected readonly podForm = form(this.formModel, POD_FORM_RULES, {
    submission: { action: async () => this.startRun() },
  });

  protected readonly podRunFolder = podRunFolder;

  /** The page shows the last pod run; a goldfish run shows on the Simulate page. */
  protected readonly podRun = computed(() => {
    const run = this.currentRun.run();
    return run?.request.mode === 'pod' ? run : undefined;
  });

  /** The decks that play, once each, as one text: it changes only when a deck is added to or leaves the pod. */
  private readonly decksPlaying = computed(() =>
    [...new Set(this.formModel().seats.map((seat) => seat.deck))].join(','),
  );

  /** What each setting means in the decks that play, and which of them have it (tooltip and hint), by name. */
  protected readonly settingHelp = computed(() => {
    const decksPlaying = this.decksPlaying()
      .split(',')
      .flatMap((deckName) => this.deckNamed(deckName) ?? []);
    const model = this.formModel();
    const names = [
      ...model.numberSettings.map((setting) => setting.name),
      ...model.switchSettings.map((setting) => setting.name),
    ];
    return new Map(
      names.map((name) => [name, podSettingHelp(decksPlaying, name)]),
    );
  });

  constructor() {
    this.currentRun.refresh();
    effect(() => {
      const decks = this.decks.value();
      if (decks && untracked(() => this.formModel().seats).length === 0)
        untracked(() => this.fillDefaultSeats(decks));
    });
    effect(() => {
      const decksPlaying = this.decksPlaying();
      if (this.decks.value())
        untracked(() => this.fitSettingsToDecks(decksPlaying.split(',')));
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

  /** The settings of the decks that play (by name), at their defaults, keeping the values already chosen. */
  private fitSettingsToDecks(deckNames: string[]): void {
    const settings = this.settingsOf(deckNames);
    this.formModel.update((model) => {
      const keptValue = (name: string) =>
        model.numberSettings.find((setting) => setting.name === name)?.value;
      const keptSwitch = (name: string) =>
        model.switchSettings.find((setting) => setting.name === name)?.isOn;
      return {
        ...model,
        numberSettings: settings.flatMap(({ name, defaultValue }) =>
          typeof defaultValue === 'number'
            ? [{ name, value: keptValue(name) ?? defaultValue }]
            : [],
        ),
        switchSettings: settings.flatMap(({ name, defaultValue }) =>
          typeof defaultValue === 'boolean'
            ? [{ name, isOn: keptSwitch(name) ?? defaultValue }]
            : [],
        ),
      };
    });
  }

  private settingsOf(deckNames: string[]): PodSetting[] {
    const settings: PodSetting[] = [];
    for (const deckName of deckNames)
      for (const { name, defaultValue, appliesInPod } of this.deckNamed(
        deckName,
      )?.settings ?? [])
        if (
          appliesInPod &&
          name !== TURNS_SETTING &&
          !settings.some((setting) => setting.name === name)
        )
          settings.push({ name, defaultValue });
    return settings;
  }

  private async startRun(): Promise<void> {
    await this.currentRun.start(this.buildRequest());
  }

  /** The run request: threat and policy only when they differ from the defaults. */
  private buildRequest(): PodRunRequest {
    const model = this.formModel();
    const decksThatPlay = [...new Set(model.seats.map((seat) => seat.deck))];
    const defaults = this.settingsOf(decksThatPlay);
    const defaultOf = (name: string) =>
      defaults.find((setting) => setting.name === name)?.defaultValue;
    const settings: Record<string, number | boolean> = {};
    for (const { name, value } of model.numberSettings)
      if (value !== defaultOf(name)) settings[name] = value;
    for (const { name, isOn } of model.switchSettings)
      if (isOn !== defaultOf(name)) settings[name] = isOn;
    return {
      mode: 'pod',
      decks: model.seats,
      games: model.games,
      rounds: model.rounds,
      settings,
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
