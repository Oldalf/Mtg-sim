import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { GoldfishRunRequest } from '../../../../../api-types';
import { FakeApi } from '../../../testing/fake-api';
import {
  chooseOption,
  fieldLabelled,
  helpOfField,
  submitForm,
  typeInto,
} from '../../../testing/form-actions';
import { ApiService } from '../../core/api';
import { Simulate } from './simulate';

describe('Simulate form', () => {
  let fakeApi: FakeApi;
  let fixture: ComponentFixture<Simulate>;

  beforeEach(() => {
    fakeApi = new FakeApi();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ApiService, useValue: fakeApi },
      ],
    });
    fixture = TestBed.createComponent(Simulate);
  });

  function lastRequest(): GoldfishRunRequest {
    return fakeApi.startedRuns.at(-1) as GoldfishRunRequest;
  }

  function numberField(labelText: string): HTMLInputElement {
    return fieldLabelled<HTMLInputElement>(fixture, labelText);
  }

  it('sends the first deck with its default list and no changed settings', async () => {
    await fixture.whenStable();
    await submitForm(fixture);
    expect(fakeApi.startedRuns).toEqual([
      {
        mode: 'goldfish',
        deck: 'alpha',
        lists: ['decklist.txt'],
        games: 5000,
        settings: {},
        diag: false,
        powerSave: false,
      },
    ]);
  });

  it('takes the deck and lists from the query string, and adds a list to compare with', async () => {
    fixture.componentRef.setInput('deck', 'beta');
    fixture.componentRef.setInput('lists', 'lists/beta-two.txt');
    fixture.componentRef.setInput('compare', '1');
    await fixture.whenStable();
    await submitForm(fixture);
    expect(lastRequest().deck).toBe('beta');
    expect(lastRequest().lists).toEqual(['lists/beta-two.txt', 'decklist.txt']);
  });

  it('sends only the turns and settings that differ from the defaults', async () => {
    await fixture.whenStable();
    await typeInto(fixture, numberField('Games'), '300');
    await typeInto(fixture, numberField('Turns'), '10');
    await typeInto(fixture, numberField('planner_width'), '3');
    await submitForm(fixture);
    expect(lastRequest().games).toBe(300);
    expect(lastRequest().turns).toBe(10);
    expect(lastRequest().settings).toEqual({ planner_width: 3 });
  });

  it("explains each setting and says whether it is the engine's or the deck's own", async () => {
    await fixture.whenStable();
    expect(helpOfField(fixture, 'opponents').hint).toBe('same in every deck');
    expect(helpOfField(fixture, 'planner_width')).toEqual({
      hint: 'alpha only',
      tooltip: 'How many plays the planner compares.',
    });
    expect(helpOfField(fixture, 'Turns').tooltip).toBe(
      'The last turn played. (setting max_turn)',
    );
  });

  it('gives the new deck its default list and turns when another deck is chosen', async () => {
    await fixture.whenStable();
    await chooseOption(
      fixture,
      fieldLabelled<HTMLSelectElement>(fixture, 'Deck'),
      'beta',
    );
    expect(numberField('Turns').value).toBe('9');
    await submitForm(fixture);
    expect(lastRequest().deck).toBe('beta');
    expect(lastRequest().lists).toEqual(['decklist.txt']);
    expect(lastRequest().turns).toBeUndefined();
    expect(lastRequest().settings).toEqual({});
  });

  it('sends nothing while the number of games is out of range', async () => {
    await fixture.whenStable();
    await typeInto(fixture, numberField('Games'), '0');
    await submitForm(fixture);
    expect(fakeApi.startedRuns).toEqual([]);
    const page = fixture.nativeElement as HTMLElement;
    expect(page.textContent).toContain('At least 1 game');
  });
});
