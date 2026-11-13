import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  it('shows the answer of /api/health', async () => {
    const fixture = TestBed.createComponent(App);
    TestBed.tick(); // sends the request (whenStable would wait for its answer)
    TestBed.inject(HttpTestingController)
      .expectOne('/api/health')
      .flush({ status: 'ok' });
    await fixture.whenStable();
    const page = fixture.nativeElement as HTMLElement;
    expect(page.querySelector('h1')?.textContent).toContain('it works');
    expect(page.querySelector('strong')?.textContent).toContain('ok');
  });
});
