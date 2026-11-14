import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { PodRunRequest } from '../../../../../api-types';
import { FakeApi } from '../../../testing/fake-api';
import {
  chooseOption,
  numberFields,
  selects,
  submitForm,
  typeInto,
} from '../../../testing/form-actions';
import { ApiService } from '../../core/api';
import { Pod } from './pod';

describe('Pod form', () => {
  let fakeApi: FakeApi;
  let fixture: ComponentFixture<Pod>;

  beforeEach(() => {
    fakeApi = new FakeApi();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ApiService, useValue: fakeApi },
      ],
    });
    fixture = TestBed.createComponent(Pod);
  });

  function lastRequest(): PodRunRequest {
    return fakeApi.startedRuns.at(-1) as PodRunRequest;
  }

  function selectLabelled(labelText: string): HTMLSelectElement {
    const select = selects(fixture).find((candidate) =>
      candidate
        .closest('mat-form-field')
        ?.querySelector('mat-label')
        ?.textContent?.includes(labelText),
    );
    if (!select) throw new Error(`no select labelled ${labelText}`);
    return select;
  }

  it('starts with four seats of the decks in turn, and sends no threat or policy at their defaults', async () => {
    await fixture.whenStable();
    await submitForm(fixture);
    expect(fakeApi.startedRuns).toEqual([
      {
        mode: 'pod',
        decks: [
          { deck: 'alpha', list: 'decklist.txt' },
          { deck: 'beta', list: 'decklist.txt' },
          { deck: 'alpha', list: 'decklist.txt' },
          { deck: 'beta', list: 'decklist.txt' },
        ],
        games: 1000,
        rounds: 17,
        settings: {},
        threat: undefined,
        policy: undefined,
        powerSave: false,
      },
    ]);
  });

  it('sends a changed policy for every deck that plays, and a changed threat', async () => {
    await fixture.whenStable();
    await chooseOption(fixture, selectLabelled('Policy'), 'window');
    await chooseOption(fixture, selectLabelled('Threat'), 'weakest');
    await submitForm(fixture);
    expect(lastRequest().policy).toBe('alpha:window,beta:window');
    expect(lastRequest().threat).toBe('weakest');
  });

  it('gives a seat the default list of the deck chosen for it', async () => {
    await fixture.whenStable();
    await chooseOption(fixture, selectLabelled('Seat 1: deck'), 'beta');
    await submitForm(fixture);
    expect(lastRequest().decks[0]).toEqual({
      deck: 'beta',
      list: 'decklist.txt',
    });
  });

  it('shows the settings of the decks that play and sends a changed one', async () => {
    await fixture.whenStable();
    // the number fields: games, round cap, then the settings (alpha's planner_width, beta's combat_safety)
    const [, , plannerWidthField, combatSafetyField] = numberFields(fixture);
    expect(plannerWidthField.value).toBe('2');
    await typeInto(fixture, combatSafetyField, '5');
    await submitForm(fixture);
    expect(lastRequest().settings).toEqual({ combat_safety: 5 });
  });

  it('sends nothing while the round cap is out of range', async () => {
    await fixture.whenStable();
    const [, roundsField] = numberFields(fixture);
    await typeInto(fixture, roundsField, '0');
    await submitForm(fixture);
    expect(fakeApi.startedRuns).toEqual([]);
  });
});
