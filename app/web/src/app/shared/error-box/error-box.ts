import { Component, input } from '@angular/core';
import { MatIcon } from '@angular/material/icon';

/**
 * A message that something went wrong, in the page where it happened (a run that failed, a game that would not load).
 * Short-lived errors of a call go to the snack bar instead (core/show-http-errors.ts). Extra content (a retry button)
 * goes inside the element.
 */
@Component({
  selector: 'app-error-box',
  imports: [MatIcon],
  template: `
    <mat-icon aria-hidden="true">error</mat-icon>
    <div class="text">
      @if (title()) {
        <div class="title">{{ title() }}</div>
      }
      <div class="message">{{ message() }}</div>
      <ng-content />
    </div>
  `,
  styles: `
    :host {
      display: flex;
      gap: 12px;
      align-items: flex-start;
      padding: 12px 16px;
      border-radius: var(--mat-sys-corner-small);
      background-color: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);
    }
    .title {
      font: var(--mat-sys-title-small);
    }
    .message {
      white-space: pre-wrap;
    }
  `,
  host: { role: 'alert' },
})
export class ErrorBox {
  readonly message = input.required<string>();
  readonly title = input<string>();
}
