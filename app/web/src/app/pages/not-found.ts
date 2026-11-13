import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found',
  imports: [RouterLink],
  template: `
    <h1>Nothing here</h1>
    <p>
      This address is not a page of the app.
      <a routerLink="/">Go to the decks.</a>
    </p>
  `,
})
export class NotFound {}
