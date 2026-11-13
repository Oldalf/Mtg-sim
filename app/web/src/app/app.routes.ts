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
    loadComponent: loadPageToCome,
    data: { title: 'Simulate', task: 9 },
  },
  {
    path: 'pod',
    title: 'Pod',
    loadComponent: loadPageToCome,
    data: { title: 'Pod', task: 11 },
  },
  {
    path: 'games',
    title: 'Games',
    loadComponent: loadPageToCome,
    data: { title: 'Games', task: 12 },
  },
  {
    path: 'games/:run',
    title: 'Games of a run',
    loadComponent: loadPageToCome,
    data: { title: 'Games of a run', task: 12 },
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
