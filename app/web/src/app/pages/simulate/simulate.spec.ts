import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { GoldfishRunRequest } from '../../../../../api-types';
import { FakeApi } from '../../../testing/fake-api';
import {
  chooseOption,
  numberFields,
  selects,
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
    // the number fields: games, turns, then the deck's number settings (planner_width)
    const [gamesField, turnsField, plannerWidthField] = numberFields(fixture);
    await typeInto(fixture, gamesField, '300');
    await typeInto(fixture, turnsField, '10');
    await typeInto(fixture, plannerWidthField, '3');
    await submitForm(fixture);
    expect(lastRequest().games).toBe(300);
    expect(lastRequest().turns).toBe(10);
    expect(lastRequest().settings).toEqual({ planner_width: 3 });
  });

  it('gives the new deck its default list and turns when another deck is chosen', async () => {
    await fixture.whenStable();
    const [deckSelect] = selects(fixture);
    await chooseOption(fixture, deckSelect, 'beta');
    const [, turnsField] = numberFields(fixture);
    expect(turnsField.value).toBe('9');
    await submitForm(fixture);
    expect(lastRequest().deck).toBe('beta');
    expect(lastRequest().lists).toEqual(['decklist.txt']);
    expect(lastRequest().turns).toBeUndefined();
    expect(lastRequest().settings).toEqual({});
  });

  it('sends nothing while the number of games is out of range', async () => {
    await fixture.whenStable();
    const [gamesField] = numberFields(fixture);
    await typeInto(fixture, gamesField, '0');
    await submitForm(fixture);
    expect(fakeApi.startedRuns).toEqual([]);
    const page = fixture.nativeElement as HTMLElement;
    expect(page.textContent).toContain('At least 1 game');
  });
});
