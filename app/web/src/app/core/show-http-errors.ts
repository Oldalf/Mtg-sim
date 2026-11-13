import {
  HttpErrorResponse,
  type HttpHandlerFn,
  type HttpRequest,
} from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { catchError, throwError } from 'rxjs';
import type { ErrorAnswer } from '../../../../api-types';

/** How long a message stays when nobody closes it. */
const MESSAGE_MILLISECONDS = 8000;

/** Shows error messages in a snack bar, each one once while it is on screen. */
@Injectable({ providedIn: 'root' })
export class ErrorMessages {
  private readonly snackBar = inject(MatSnackBar);
  private messageShown: string | null = null;

  show(message: string): void {
    // a polling call fails once a second while the server is down: one message is enough
    if (message === this.messageShown) return;
    this.messageShown = message;
    this.snackBar
      .open(message, 'Close', { duration: MESSAGE_MILLISECONDS })
      .afterDismissed()
      .subscribe(() => {
        if (this.messageShown === message) this.messageShown = null;
      });
  }
}

/**
 * The one place where a failed call to the server becomes a message on the page.
 * The error still reaches the caller, which may do more with it (show an error box, stop polling).
 */
export function showHttpErrors(
  request: HttpRequest<unknown>,
  next: HttpHandlerFn,
) {
  const errorMessages = inject(ErrorMessages);
  return next(request).pipe(
    catchError((error: unknown) => {
      errorMessages.show(describeHttpError(error));
      return throwError(() => error);
    }),
  );
}

/** A failed call in words: the server's own message when it sent one. */
export function describeHttpError(error: unknown): string {
  if (!(error instanceof HttpErrorResponse)) return String(error);
  if (error.status === 0)
    return 'The server does not answer. Is it running (npm run app)?';
  const answer = error.error as Partial<ErrorAnswer> | null;
  if (typeof answer?.error === 'string') return answer.error;
  return `${error.status} ${error.statusText || 'error'}: ${error.url ?? ''}`;
}
