import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('shows the four places in the toolbar', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const page = fixture.nativeElement as HTMLElement;
    const placeNames = [...page.querySelectorAll('nav a')].map((link) =>
      link.textContent?.trim(),
    );
    expect(placeNames).toEqual(['Decks', 'Simulate', 'Pod', 'Games']);
  });
});
