import { Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { AUTOPLAY_SPEEDS, type AutoplaySpeed } from './game-steps';
import type { ScrubMarks } from './table-layout';

/** The steps the control bar has buttons for (the game page knows where each goes). */
export type ControlStep =
  | 'previousTurn'
  | 'previousLine'
  | 'nextLine'
  | 'nextTurn'
  | 'previousHighlight'
  | 'nextHighlight';

/**
 * The bar under the table, like a video player's: play / pause and the speed, steps by turn and by line, a scrub bar
 * (a tick per turn, a taller one per round, a dot per highlight), the position, steps by highlight and the log.
 */
@Component({
  selector: 'app-game-controls',
  imports: [MatButtonModule, MatButtonToggleModule, MatIcon, MatTooltip],
  templateUrl: './game-controls.html',
  styleUrl: './game-controls.scss',
  host: { role: 'toolbar', 'aria-label': 'Play the game' },
})
export class GameControls {
  readonly isPlaying = input(false);
  readonly speed = input<AutoplaySpeed>('normal');
  readonly chosenEvent = input(0);
  readonly eventCount = input(1);
  readonly marks = input<ScrubMarks>({ turns: [], highlights: [] });
  /** Read out for the scrub bar's position ("Round 3, meren"). */
  readonly turnTitle = input('');
  readonly isLogOpen = input(false);

  readonly togglePlay = output();
  readonly chooseSpeed = output<AutoplaySpeed>();
  readonly step = output<ControlStep>();
  readonly seek = output<number>();
  readonly toggleLog = output();

  protected readonly AUTOPLAY_SPEEDS = AUTOPLAY_SPEEDS;

  protected seekFromSlider(inputEvent: Event): void {
    this.seek.emit(Number((inputEvent.target as HTMLInputElement).value));
  }
}
