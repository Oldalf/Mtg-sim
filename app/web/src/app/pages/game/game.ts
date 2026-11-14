import {
  Component,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  signal,
  untracked,
} from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIcon } from '@angular/material/icon';
import { MatProgressBar } from '@angular/material/progress-bar';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { MatTooltip } from '@angular/material/tooltip';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { boardAt } from '../../../../../../shared/game-log-board';
import type { GameLog } from '../../../../../../shared/game-log-types';
import { ApiService } from '../../core/api';
import { CardImage } from '../../shared/card-image/card-image';
import { ErrorBox } from '../../shared/error-box/error-box';
import { GameLogView } from './game-log-view';
import {
  AUTOPLAY_SPEEDS,
  type AutoplaySpeed,
  autoplayDelay,
  cardNamesOfGame,
  cardsOfEvent,
  eventIndexFromLine,
  speedFromStored,
  nextEvent,
  nextHighlight,
  nextTurn,
  playersTopDown,
  previousEvent,
  previousHighlight,
  previousTurn,
  turnsOfGame,
} from './game-steps';
import { PlayerBoard } from './player-board';

/** Which key does what (shown as the buttons' tooltips too). */
const STEP_KEYS = {
  nextLine: 'ArrowDown',
  previousLine: 'ArrowUp',
  nextTurn: 'ArrowRight',
  previousTurn: 'ArrowLeft',
  nextHighlight: 'h',
  previousHighlight: 'H',
  playOrPause: ' ',
};

/** The key the autoplay speed is kept under in the browser (per viewer, not shared). */
const SPEED_STORAGE_KEY = 'magic.autoplaySpeed';

// The browser's storage can be blocked (private window): then the speed is just not remembered.
function readStoredSpeed(): string | null {
  try {
    return localStorage.getItem(SPEED_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredSpeed(speed: AutoplaySpeed): void {
  try {
    localStorage.setItem(SPEED_STORAGE_KEY, speed);
  } catch {
    // not remembered, nothing else to do
  }
}

/**
 * The game viewer: the log on the left, the board after the chosen line on the right, stepped by line, turn or
 * highlight with the buttons or the keys. Opens a game of a run (/games/<run>/<seed>) or a deck's real Archidekt
 * log (/games/real/<deck>/<file>).
 */
@Component({
  selector: 'app-game',
  imports: [
    MatButtonModule,
    MatButtonToggleModule,
    MatIcon,
    MatProgressBar,
    MatSlideToggle,
    MatTooltip,
    RouterLink,
    CardImage,
    ErrorBox,
    GameLogView,
    PlayerBoard,
  ],
  templateUrl: './game.html',
  styleUrl: './game.scss',
  host: { '(document:keydown)': 'stepByKey($event)' },
})
export class Game {
  /** A game of a run, from the route /games/:run/:seed. */
  readonly run = input<string>();
  readonly seed = input<string>();
  /** A real log, from the route /games/real/:deck/:file. */
  readonly deck = input<string>();
  readonly file = input<string>();

  protected readonly STEP_KEYS = STEP_KEYS;
  protected readonly AUTOPLAY_SPEEDS = AUTOPLAY_SPEEDS;
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly queryParams = toSignal(this.route.queryParamMap, {
    requireSync: true,
  });
  private readonly lineInUrl = computed(() => this.queryParams().get('line'));

  protected readonly game = rxResource({
    params: () => ({
      run: this.run(),
      seed: this.seed(),
      deck: this.deck(),
      file: this.file(),
    }),
    stream: ({ params }) =>
      params.deck && params.file
        ? this.api.realLog(params.deck, params.file)
        : this.api.game(params.run ?? '', Number(params.seed)),
  });
  protected readonly gameLog = computed(() =>
    this.game.hasValue() ? this.game.value() : undefined,
  );
  protected readonly isRealLog = computed(() => !!this.deck());
  protected readonly title = computed(() =>
    this.isRealLog()
      ? `${this.deck()}: ${this.file()}`
      : `${this.run()}, seed ${this.seed()}`,
  );

  protected readonly cardFacts = rxResource({
    params: () => this.gameLog(),
    stream: ({ params }) => this.api.cardFacts(cardNamesOfGame(params)),
    defaultValue: {},
  });
  protected readonly facts = computed(() =>
    this.cardFacts.hasValue() ? this.cardFacts.value() : {},
  );

  /** The chosen event (index into the log's events); a new game starts at its first. */
  /** Starts at the line in the URL (if the game has it), so a refresh or a shared link opens the same spot. */
  protected readonly chosenEvent = linkedSignal({
    source: this.gameLog,
    computation: (gameLog) =>
      // untracked: changing the URL later must not jump the game back to that line
      untracked(() =>
        gameLog
          ? eventIndexFromLine(this.lineInUrl(), gameLog.events.length)
          : 0,
      ),
  });
  protected readonly showMoves = signal(false);

  /** Autoplay; loading another game pauses it. */
  protected readonly isPlaying = linkedSignal({
    source: this.gameLog,
    computation: () => false,
  });
  protected readonly speed = signal<AutoplaySpeed>(
    speedFromStored(readStoredSpeed()),
  );

  protected readonly turns = computed(() => {
    const gameLog = this.gameLog();
    return gameLog ? turnsOfGame(gameLog) : [];
  });
  protected readonly event = computed(
    () => this.gameLog()?.events[this.chosenEvent()],
  );
  protected readonly turnTitleOfChosen = computed(
    () =>
      this.turns().find((turn) => this.chosenEvent() <= turn.lastEvent)
        ?.title ?? '',
  );
  protected readonly boards = computed(() => {
    const gameLog = this.gameLog();
    return gameLog ? boardAt(gameLog, this.chosenEvent()) : [];
  });
  /** The players top to bottom, the one whose turn it is first. */
  protected readonly playerOrder = computed(() => {
    const gameLog = this.gameLog();
    const event = this.event();
    return gameLog && event ? playersTopDown(gameLog, event.activePlayer) : [];
  });
  protected readonly cardsOfChosenLine = computed(() => {
    const event = this.event();
    return event ? cardsOfEvent(event) : [];
  });

  constructor() {
    // Keeps the line in the URL, replacing the history entry; the first line leaves it out
    effect(() => {
      if (!this.gameLog()) return;
      const lineNumber = this.chosenEvent() + 1;
      this.router.navigate([], {
        queryParams: { line: lineNumber === 1 ? null : lineNumber },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    });

    // One timer at a time: each step re-runs the effect, which schedules the next
    effect((onCleanup) => {
      const gameLog = this.gameLog();
      const event = this.event();
      if (!this.isPlaying() || !gameLog || !event) return;
      const eventIndex = this.chosenEvent();
      if (eventIndex >= gameLog.events.length - 1) {
        this.isPlaying.set(false);
        return;
      }
      const startsTurn = this.turns().some(
        (turn) => turn.firstEvent === eventIndex,
      );
      const timer = setTimeout(
        () => this.chosenEvent.set(nextEvent(gameLog, eventIndex)),
        autoplayDelay(event, startsTurn, this.speed()),
      );
      onCleanup(() => clearTimeout(timer));
    });
  }

  /** Pressing play at the end of the game starts it over. */
  protected togglePlaying(): void {
    const gameLog = this.gameLog();
    if (!gameLog) return;
    if (!this.isPlaying() && this.chosenEvent() >= gameLog.events.length - 1)
      this.chosenEvent.set(0);
    this.isPlaying.update((isPlaying) => !isPlaying);
  }

  protected setSpeed(speed: AutoplaySpeed): void {
    this.speed.set(speed);
    writeStoredSpeed(speed);
  }

  protected choose(eventIndex: number): void {
    this.isPlaying.set(false);
    this.chosenEvent.set(eventIndex);
  }

  /** Moves the chosen line by one of the steps; does nothing before the game has loaded. */
  protected step(stepTo: (gameLog: GameLog, eventIndex: number) => number) {
    const gameLog = this.gameLog();
    if (!gameLog) return;
    this.isPlaying.set(false);
    this.chosenEvent.set(stepTo(gameLog, this.chosenEvent()));
  }

  protected readonly steps = {
    nextLine: (gameLog: GameLog, eventIndex: number) =>
      nextEvent(gameLog, eventIndex),
    previousLine: (_gameLog: GameLog, eventIndex: number) =>
      previousEvent(eventIndex),
    nextTurn: (_gameLog: GameLog, eventIndex: number) =>
      nextTurn(this.turns(), eventIndex),
    previousTurn: (_gameLog: GameLog, eventIndex: number) =>
      previousTurn(this.turns(), eventIndex),
    nextHighlight,
    previousHighlight,
    first: () => 0,
    last: (gameLog: GameLog) => gameLog.events.length - 1,
  };

  protected stepByKey(keyEvent: KeyboardEvent): void {
    const target = keyEvent.target as HTMLElement | null;
    if (target?.closest('input, textarea, select, [contenteditable]')) return;
    if (keyEvent.ctrlKey || keyEvent.altKey || keyEvent.metaKey) return;
    const stepName = (
      Object.keys(STEP_KEYS) as (keyof typeof STEP_KEYS)[]
    ).find((name) => STEP_KEYS[name] === keyEvent.key);
    if (!stepName) return;
    if (stepName === 'playOrPause') {
      // on a focused button Space already clicks it
      if (target?.closest('button, a')) return;
      keyEvent.preventDefault();
      this.togglePlaying();
      return;
    }
    keyEvent.preventDefault();
    this.step(this.steps[stepName]);
  }
}
