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
import { MatIcon } from '@angular/material/icon';
import { MatProgressBar } from '@angular/material/progress-bar';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  boardAt,
  describeEventText,
} from '../../../../../../shared/game-log-board';
import { namesItsPlayer } from '../../../../../../shared/game-log-lines';
import type { GameLog } from '../../../../../../shared/game-log-types';
import { ApiService } from '../../core/api';
import { ErrorBox } from '../../shared/error-box/error-box';
import { GameCaption } from './game-caption';
import { GameControls } from './game-controls';
import { GameLogView } from './game-log-view';
import {
  type AutoplaySpeed,
  autoplayDelay,
  cardNamesOfGame,
  cardsOfEvent,
  eventIndexFromLine,
  speedFromStored,
  nextEvent,
  nextHighlight,
  nextTurn,
  previousEvent,
  previousHighlight,
  previousTurn,
  turnsOfGame,
} from './game-steps';
import { PlayerSeat } from './player-seat';
import {
  changedCardsByPlayer,
  goldfishOpponents,
  lifeChanges,
  scrubMarks,
  seatRows,
} from './table-layout';

/** Which key does what (the control bar's tooltips name them too). */
const STEP_KEYS = {
  nextLine: 'ArrowDown',
  previousLine: 'ArrowUp',
  nextTurn: 'ArrowRight',
  previousTurn: 'ArrowLeft',
  nextHighlight: 'h',
  previousHighlight: 'H',
  first: 'Home',
  last: 'End',
};
const PLAY_OR_PAUSE_KEY = ' ';
const TOGGLE_LOG_KEY = 'l';

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
 * The game viewer, laid out as a table you can watch: the seats in fixed places around the table, what just happened
 * in a caption under it, video-style controls, the log in a drawer. Stepped by line, turn or highlight with the
 * buttons or the keys, or played by itself. Opens a game of a run (/games/<run>/<seed>) or a deck's real Archidekt
 * log (/games/real/<deck>/<file>).
 */
@Component({
  selector: 'app-game',
  imports: [
    MatButtonModule,
    MatIcon,
    MatProgressBar,
    MatSlideToggle,
    RouterLink,
    ErrorBox,
    GameCaption,
    GameControls,
    GameLogView,
    PlayerSeat,
  ],
  templateUrl: './game.html',
  styleUrl: './game.scss',
  host: { '(document:keydown)': 'stepByKey($event)' },
})
export class Game {
  /** Read by the app shell: the table takes the whole window under the toolbar. */
  readonly fillsWindow = true;

  /** A game of a run, from the route /games/:run/:seed. */
  readonly run = input<string>();
  readonly seed = input<string>();
  /** A real log, from the route /games/real/:deck/:file. */
  readonly deck = input<string>();
  readonly file = input<string>();

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

  /** The chosen event (index into the log's events). */
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
  /** The log is a drawer, closed by default so the table has the room. */
  protected readonly isLogOpen = signal(false);

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
  protected readonly seats = computed(() => {
    const gameLog = this.gameLog();
    return gameLog ? seatRows(gameLog) : { top: [], bottom: [] };
  });
  protected readonly marks = computed(() => {
    const gameLog = this.gameLog();
    return gameLog
      ? scrubMarks(gameLog, this.turns())
      : { turns: [], highlights: [] };
  });

  // ---------------------------------------------------------------- what the chosen line did
  protected readonly cardsOfChosenLine = computed(() => {
    const event = this.event();
    return event ? cardsOfEvent(event) : [];
  });
  protected readonly changedCards = computed(() => {
    const gameLog = this.gameLog();
    const event = this.event();
    return gameLog && event ? changedCardsByPlayer(gameLog, event) : [];
  });
  protected readonly lifeChanges = computed(() => {
    const gameLog = this.gameLog();
    return gameLog ? lifeChanges(gameLog, this.chosenEvent()) : [];
  });
  protected readonly goldfishOpponents = computed(() => {
    const gameLog = this.gameLog();
    const event = this.event();
    return gameLog && event ? goldfishOpponents(gameLog, event) : [];
  });
  /** The line as the log shows it, with what paid for it. */
  protected readonly captionText = computed(() => {
    const event = this.event();
    return event ? describeEventText(event) : '';
  });
  protected readonly captionPlayerName = computed(() => {
    const gameLog = this.gameLog();
    const event = this.event();
    return gameLog && event && namesItsPlayer(gameLog, event)
      ? gameLog.players[event.player].name
      : '';
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

  protected toggleLog(): void {
    this.isLogOpen.update((isOpen) => !isOpen);
  }

  protected choose(eventIndex: number): void {
    this.isPlaying.set(false);
    this.chosenEvent.set(eventIndex);
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

  /** Moves the chosen line by one of the steps (a manual step pauses); does nothing before the game has loaded. */
  protected step(stepName: keyof typeof this.steps): void {
    const gameLog = this.gameLog();
    if (!gameLog) return;
    this.choose(this.steps[stepName](gameLog, this.chosenEvent()));
  }

  protected stepByKey(keyEvent: KeyboardEvent): void {
    const target = keyEvent.target as HTMLElement | null;
    if (target?.closest('input, textarea, select, [contenteditable]')) return;
    if (keyEvent.ctrlKey || keyEvent.altKey || keyEvent.metaKey) return;
    if (keyEvent.key === TOGGLE_LOG_KEY) {
      this.toggleLog();
      return;
    }
    if (keyEvent.key === PLAY_OR_PAUSE_KEY) {
      // on a focused button Space already clicks it
      if (target?.closest('button, a')) return;
      keyEvent.preventDefault();
      this.togglePlaying();
      return;
    }
    const stepName = (
      Object.keys(STEP_KEYS) as (keyof typeof STEP_KEYS)[]
    ).find((name) => STEP_KEYS[name] === keyEvent.key);
    if (!stepName) return;
    keyEvent.preventDefault();
    this.step(stepName);
  }
}
