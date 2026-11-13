import { httpResource } from '@angular/common/http';
import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import type { HealthAnswer } from '../../../api-types';

/** The skeleton page of task 0: shows that the page runs and what the server answers. Task 6 replaces it with the app shell. */
@Component({
  imports: [RouterOutlet],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  protected readonly health = httpResource<HealthAnswer>(() => '/api/health');
}
