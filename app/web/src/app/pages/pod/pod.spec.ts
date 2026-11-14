import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { PodRunRequest } from '../../../../../api-types';
import { FakeApi } from '../../../testing/fake-api';
import {
  chooseOption,
  fieldLabelled,
  helpOfField,
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

  function select(labelText: string): HTMLSelectElement {
    return fieldLabelled<HTMLSelectElement>(fixture, labelText);
  }

  function labels(): string[] {
    const page = fixture.nativeElement as HTMLElement;
    return [...page.querySelectorAll('mat-label')].map(
      (label) => label.textContent?.trim() ?? '',
    );
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
    await chooseOption(fixture, select('Policy'), 'window');
    await chooseOption(fixture, select('Threat'), 'weakest');
    await submitForm(fixture);
    expect(lastRequest().policy).toBe('alpha:window,beta:window');
    expect(lastRequest().threat).toBe('weakest');
  });

  it('gives a seat the default list of the deck chosen for it', async () => {
    await fixture.whenStable();
    await chooseOption(fixture, select('Seat 1: deck'), 'beta');
    await submitForm(fixture);
    expect(lastRequest().decks[0]).toEqual({
      deck: 'beta',
      list: 'decklist.txt',
    });
  });

  it('shows the settings of the decks that play and sends a changed one', async () => {
    await fixture.whenStable();
    expect(
      fieldLabelled<HTMLInputElement>(fixture, 'planner_width').value,
    ).toBe('2');
    await typeInto(
      fixture,
      fieldLabelled<HTMLInputElement>(fixture, 'combat_safety'),
      '5',
    );
    await submitForm(fixture);
    expect(lastRequest().settings).toEqual({ combat_safety: 5 });
  });

  it('leaves out the settings a pod sets itself, and says which decks have each setting', async () => {
    await fixture.whenStable();
    expect(labels()).not.toContain('opponents');
    expect(helpOfField(fixture, 'combat_safety')).toEqual({
      hint: 'beta only',
      tooltip: 'Attack only above this life.',
    });
    expect(helpOfField(fixture, 'Policy').tooltip).toContain('window:');
  });

  it('sends nothing while the round cap is out of range', async () => {
    await fixture.whenStable();
    await typeInto(
      fixture,
      fieldLabelled<HTMLInputElement>(fixture, 'Round cap'),
      '0',
    );
    await submitForm(fixture);
    expect(fakeApi.startedRuns).toEqual([]);
  });
});
