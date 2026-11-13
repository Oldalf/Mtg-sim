import { Component } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatToolbar } from '@angular/material/toolbar';
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
  imports: [MatButton, MatToolbar, RouterLink, RouterLinkActive, RouterOutlet],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  protected readonly places = PLACES;
}
