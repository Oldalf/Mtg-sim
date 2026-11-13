import { Component, input } from '@angular/core';

/** Stands in for a page a later task of PLAN.md builds; that task points the route to its own page. */
@Component({
  selector: 'app-page-to-come',
  template: `
    <h1>{{ title() }}</h1>
    <p>This page comes with task {{ task() }} of PLAN.md.</p>
  `,
})
export class PageToCome {
  /** From the route's data. */
  readonly title = input.required<string>();
  readonly task = input.required<number>();
}
