import { Component, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatToolbar } from '@angular/material/toolbar';
import { ImageRefresh } from './shared/image-refresh/image-refresh';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

/** The four places of the app, in the toolbar. */
const PLACES = [
  { label: 'Decks', path: '/decks' },
  { label: 'Simulate', path: '/simulate' },
  { label: 'Pod', path: '/pod' },
  { label: 'Games', path: '/games' },
];

/** The app shell: the toolbar with the four places, and the page of the route below it. */
@Component({
  imports: [
    ImageRefresh,
    MatButton,
    MatToolbar,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
  ],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
  host: { '[class.page-fills-window]': 'pageFillsWindow()' },
})
export class App {
  protected readonly places = PLACES;
  /** The game viewer takes the whole window under the toolbar: its page says so with `fillsWindow = true`. */
  protected readonly pageFillsWindow = signal(false);

  protected pageOpened(page: object): void {
    this.pageFillsWindow.set(
      (page as { fillsWindow?: boolean }).fillsWindow === true,
    );
  }
}
