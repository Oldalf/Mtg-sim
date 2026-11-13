import { Component, inject, signal } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { switchMap, takeWhile, timer } from 'rxjs';
import type { ImageUpdateState } from '../../../../../api-types';
import { ApiService } from '../../core/api';

/** The toolbar's refresh button for card images: downloads the missing ones and shows how far it is. */
@Component({
  imports: [MatIcon, MatIconButton, MatTooltip],
  selector: 'app-image-refresh',
  template: `
    <button
      mat-icon-button
      [disabled]="state()?.isRunning"
      [matTooltip]="tooltip()"
      aria-label="Download missing card images"
      (click)="start()"
    >
      <mat-icon [class.spin]="state()?.isRunning">{{
        state()?.isRunning ? 'sync' : 'image_search'
      }}</mat-icon>
    </button>
  `,
  styles: `
    mat-icon.spin {
      animation: spin 1s linear infinite;
    }
    @keyframes spin {
      to {
        rotate: 360deg;
      }
    }
  `,
})
export class ImageRefresh {
  private readonly api = inject(ApiService);
  protected readonly state = signal<ImageUpdateState | null>(null);

  protected tooltip(): string {
    const state = this.state();
    if (!state) return 'Download missing card images';
    if (state.isRunning)
      return `Downloading card images: ${state.imagesDone} of ${state.imagesTotal}`;
    if (state.failedCards.length)
      return `${state.failedCards.length} card images failed. Click to try again.`;
    return 'Card images are up to date. Click to check for missing ones.';
  }

  protected start(): void {
    this.api
      .startImageUpdate()
      .pipe(
        switchMap((first) => {
          this.state.set(first);
          return timer(500, 500).pipe(
            switchMap(() => this.api.imageUpdate()),
            takeWhile((state) => state.isRunning, true),
          );
        }),
      )
      .subscribe((state) => this.state.set(state));
  }
}
