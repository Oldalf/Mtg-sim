import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom, interval, switchMap, type Subscription } from 'rxjs';
import type { RunRequest, RunState } from '../../../../api-types';
import { ApiService } from './api';

/** How often the page asks the server how a run is going (PLAN.md decision 5). */
const POLL_MILLISECONDS = 1000;

/**
 * The server's one run (PLAN.md decision 4): starts it, follows it while it runs and stops it. The Simulate and Pod
 * pages both show it; it lives as long as the page, so a run keeps being followed when the user goes elsewhere.
 */
@Injectable({ providedIn: 'root' })
export class CurrentRunService {
  private readonly api = inject(ApiService);
  private readonly runState = signal<RunState | null>(null);
  private polling: Subscription | undefined;

  /** The run in progress, or the last one (null before the first). */
  readonly run = this.runState.asReadonly();
  readonly isRunning = computed(() => this.runState()?.status === 'running');

  /** Asks the server for the current run, and follows it if it is running. */
  refresh(): void {
    this.api.currentRun().subscribe((state) => this.show(state));
  }

  /** Starts a run. Resolves false when the server refused it (the reason is shown in the snack bar). */
  async start(request: RunRequest): Promise<boolean> {
    try {
      await firstValueFrom(this.api.startRun(request));
    } catch {
      return false;
    }
    this.refresh();
    return true;
  }

  stop(): void {
    this.api.stopCurrentRun().subscribe((state) => this.show(state));
  }

  private show(state: RunState | null): void {
    this.runState.set(state);
    if (state?.status === 'running') this.followWhileRunning();
    else this.stopFollowing();
  }

  private followWhileRunning(): void {
    if (this.polling) return;
    this.polling = interval(POLL_MILLISECONDS)
      .pipe(switchMap(() => this.api.currentRun()))
      .subscribe({
        next: (state) => this.show(state),
        // the server went away: stop asking; opening the page again asks once more
        error: () => (this.polling = undefined),
      });
  }

  private stopFollowing(): void {
    this.polling?.unsubscribe();
    this.polling = undefined;
  }
}
