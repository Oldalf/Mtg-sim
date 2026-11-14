import type { Routes } from '@angular/router';

/** The page's routes. Each page is loaded when it is first opened. A later task replaces its PageToCome. */
const loadPageToCome = () =>
  import('./pages/page-to-come').then((module) => module.PageToCome);

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'decks' },
  {
    path: 'decks',
    title: 'Decks',
    loadComponent: () =>
      import('./pages/decks/decks').then((module) => module.Decks),
  },
  {
    path: 'decks/:deck',
    title: 'Deck',
    loadComponent: () =>
      import('./pages/deck/deck').then((module) => module.Deck),
  },
  {
    path: 'simulate',
    title: 'Simulate',
    loadComponent: () =>
      import('./pages/simulate/simulate').then((module) => module.Simulate),
  },
  {
    path: 'pod',
    title: 'Pod',
    loadComponent: () => import('./pages/pod/pod').then((module) => module.Pod),
  },
  {
    path: 'games',
    title: 'Games',
    loadComponent: () =>
      import('./pages/games/games').then((module) => module.Games),
  },
  {
    // a real Archidekt log in the game viewer (task 13)
    path: 'games/real/:deck/:file',
    title: 'Real game',
    loadComponent: loadPageToCome,
    data: { title: 'Real game', task: 13 },
  },
  {
    path: 'games/:run',
    title: 'Games of a run',
    loadComponent: () =>
      import('./pages/games/run-games').then((module) => module.RunGames),
  },
  {
    path: 'games/:run/:seed',
    title: 'Game',
    loadComponent: loadPageToCome,
    data: { title: 'Game', task: 13 },
  },
  {
    // every shared piece on one page, to see the look (task 6)
    path: 'pieces',
    title: 'Shared pieces',
    loadComponent: () =>
      import('./pages/pieces/pieces').then((module) => module.Pieces),
  },
  {
    path: '**',
    title: 'Not found',
    loadComponent: () =>
      import('./pages/not-found').then((module) => module.NotFound),
  },
];
