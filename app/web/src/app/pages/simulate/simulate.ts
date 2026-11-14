import {
  Component,
  computed,
  effect,
  inject,
  input,
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
import { MatError, MatFormField, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatProgressBar } from '@angular/material/progress-bar';
import type { DeckSummary, GoldfishRunRequest } from '../../../../../api-types';
import { ApiService } from '../../core/api';
import { CurrentRunService } from '../../core/current-run';
import { RunProgress } from '../../shared/run-progress/run-progress';
import { GoldfishResult } from './goldfish-result';

/** The most games the server plays in one run (app/server/run-requests.ts). */
const MOST_GAMES = 50_000;
const MOST_TURNS = 50;
const DEFAULT_GAMES = 5_000;
/** The deck setting that --turns changes: the form shows it as "Turns", not among the other settings. */
const TURNS_SETTING = 'max_turn';

/** The form's model. Settings are split by type, so a number field and a checkbox each get a plain value. */
interface SimulateFormModel {
  deck: string;
  /** List files, relative to the deck folder; the first is the base. */
  lists: string[];
  games: number;
  turns: number;
  numberSettings: { name: string; value: number }[];
  switchSettings: { name: string; isOn: boolean }[];
  diag: boolean;
  powerSave: boolean;
}

/** What the server accepts (app/server/run-requests.ts checks the same). */
const SIMULATE_FORM_RULES = schema<SimulateFormModel>((path) => {
  required(path.deck, { message: 'Choose a deck' });
  applyEach(path.lists, (listPath) =>
    required(listPath, { message: 'Choose a list' }),
  );
  validate(path.lists, ({ value }) => {
    const lists = value();
    return new Set(lists).size < lists.length
      ? { kind: 'repeated', message: 'A list is chosen twice' }
      : undefined;
  });
  required(path.games, { message: 'How many games?' });
  min(path.games, 1, { message: 'At least 1 game' });
  max(path.games, MOST_GAMES, {
    message: `At most ${MOST_GAMES.toLocaleString('en')} games`,
  });
  required(path.turns, { message: 'How many turns?' });
  min(path.turns, 1, { message: 'At least 1 turn' });
  max(path.turns, MOST_TURNS, { message: `At most ${MOST_TURNS} turns` });
  applyEach(path.numberSettings, (settingPath) =>
    validate(settingPath.value, ({ value }) =>
      Number.isFinite(value())
        ? undefined
        : { kind: 'not-a-number', message: 'A number' },
    ),
  );
});

/**
 * Simulate: run one deck with one or more lists (the first is the base the others are compared to), follow the run
 * and read its result. The deck and lists can come from the query string (`?deck=gale&lists=decklist.txt`, from the
 * deck page); with `compare=1` a second list is added to compare with.
 */
@Component({
  selector: 'app-simulate',
  imports: [
    FormField,
    FormRoot,
    GoldfishResult,
    MatButton,
    MatCheckbox,
    MatError,
    MatFormField,
    MatIcon,
    MatIconButton,
    MatInput,
    MatLabel,
    MatProgressBar,
    RunProgress,
  ],
  templateUrl: './simulate.html',
  styleUrl: './simulate.scss',
})
export class Simulate {
  /** From the query string. */
  readonly deck = input<string>();
  /** One list or several (`lists=a.txt&lists=b.txt`). */
  readonly lists = input<string | string[]>();
  readonly compare = input<string>();

  private readonly api = inject(ApiService);
  protected readonly currentRun = inject(CurrentRunService);
  protected readonly decks = rxResource({ stream: () => this.api.decks() });

  protected readonly formModel = signal<SimulateFormModel>({
    deck: '',
    lists: [],
    games: DEFAULT_GAMES,
    turns: 1,
    numberSettings: [],
    switchSettings: [],
    diag: false,
    powerSave: false,
  });

  /** `[formRoot]` in the template runs the submission action when the form is sent and valid. */
  protected readonly simulateForm = form(this.formModel, SIMULATE_FORM_RULES, {
    submission: { action: async () => this.startRun() },
  });
  /** The chosen deck; the same object until another deck is chosen, so the effect below runs once per choice. */
  protected readonly chosenDeck = computed(() =>
    this.decks.value()?.find((deck) => deck.name === this.formModel().deck),
  );

  /** The deck's lists that are not chosen yet: what "Add a list" can add. */
  protected readonly unchosenLists = computed(() => {
    const chosen = this.formModel().lists;
    return (this.chosenDeck()?.lists ?? []).filter(
      (listFile) => !chosen.includes(listFile),
    );
  });

  /** The page shows the last goldfish run; a pod run shows on the Pod page (but its progress shows here too). */
  protected readonly goldfishRun = computed(() => {
    const run = this.currentRun.run();
    return run?.request.mode === 'goldfish' ? run : undefined;
  });

  constructor() {
    this.currentRun.refresh();
    effect(() => {
      const decks = this.decks.value();
      if (decks && untracked(() => this.formModel().deck) === '')
        untracked(() => this.fillFromQueryString(decks));
    });
    effect(() => {
      const deck = this.chosenDeck();
      if (deck) untracked(() => this.fitFormToDeck(deck));
    });
  }

  protected listLabel(listFile: string): string {
    return listFile.replace(/\.txt$/, '');
  }

  protected addList(): void {
    const [nextList] = this.unchosenLists();
    this.formModel.update((model) => ({
      ...model,
      lists: [...model.lists, nextList ?? ''],
    }));
  }

  protected removeList(listIndex: number): void {
    this.formModel.update((model) => ({
      ...model,
      lists: model.lists.filter((_list, index) => index !== listIndex),
    }));
  }

  private async startRun(): Promise<void> {
    const deck = this.chosenDeck();
    if (deck) await this.currentRun.start(this.buildRequest(deck));
  }

  /** The deck and lists the deck page sent; the first deck and its default list otherwise. */
  private fillFromQueryString(decks: DeckSummary[]): void {
    const deck =
      decks.find((summary) => summary.name === this.deck()) ?? decks[0];
    if (!deck) return;
    const askedLists = [this.lists() ?? []]
      .flat()
      .filter((listFile) => deck.lists.includes(listFile));
    const lists = askedLists.length > 0 ? askedLists : [deck.defaultList];
    if (this.compare()) {
      const otherList = deck.lists.find(
        (listFile) => !lists.includes(listFile),
      );
      if (otherList) lists.push(otherList);
    }
    this.formModel.update((model) => ({ ...model, deck: deck.name, lists }));
  }

  /** A new deck: its lists (keeping those it has), its turns and its settings at their defaults. */
  private fitFormToDeck(deck: DeckSummary): void {
    this.formModel.update((model) => {
      const keptLists = model.lists.filter((listFile) =>
        deck.lists.includes(listFile),
      );
      const settings = deck.settings.filter(
        (setting) => setting.name !== TURNS_SETTING,
      );
      return {
        ...model,
        lists: keptLists.length > 0 ? keptLists : [deck.defaultList],
        turns: Number(defaultOf(deck, TURNS_SETTING) ?? 1),
        numberSettings: settings.flatMap((setting) =>
          typeof setting.defaultValue === 'number'
            ? [{ name: setting.name, value: setting.defaultValue }]
            : [],
        ),
        switchSettings: settings.flatMap((setting) =>
          typeof setting.defaultValue === 'boolean'
            ? [{ name: setting.name, isOn: setting.defaultValue }]
            : [],
        ),
        diag: model.diag && deck.hasDiag,
      };
    });
  }

  /** The run request: only the settings and turns that differ from the deck's defaults (as --set and --turns). */
  private buildRequest(deck: DeckSummary): GoldfishRunRequest {
    const model = this.formModel();
    const settings: Record<string, number | boolean> = {};
    for (const { name, value } of model.numberSettings)
      if (value !== defaultOf(deck, name)) settings[name] = value;
    for (const { name, isOn } of model.switchSettings)
      if (isOn !== defaultOf(deck, name)) settings[name] = isOn;
    const isDefaultTurns = model.turns === defaultOf(deck, TURNS_SETTING);
    return {
      mode: 'goldfish',
      deck: deck.name,
      lists: model.lists,
      games: model.games,
      ...(isDefaultTurns ? {} : { turns: model.turns }),
      settings,
      diag: model.diag && deck.hasDiag,
      powerSave: model.powerSave,
    };
  }
}

function defaultOf(
  deck: DeckSummary,
  settingName: string,
): number | boolean | undefined {
  return deck.settings.find((setting) => setting.name === settingName)
    ?.defaultValue;
}
