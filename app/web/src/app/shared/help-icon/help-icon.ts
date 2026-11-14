import { Component, input } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';

/**
 * A small info icon that explains a field: its text shows as a tooltip on hover, keyboard focus or a long press,
 * and screen readers read it as the icon's label. Line breaks in the text are kept.
 */
@Component({
  selector: 'app-help-icon',
  imports: [MatIcon, MatTooltip],
  template: `
    <mat-icon
      class="help-icon"
      tabindex="0"
      role="img"
      [attr.aria-label]="text()"
      [matTooltip]="text()"
      matTooltipClass="help-tooltip"
      (click)="$event.stopPropagation()"
      >info</mat-icon
    >
  `,
  styles: `
    .help-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      vertical-align: middle;
      cursor: help;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class HelpIcon {
  readonly text = input.required<string>();
}
