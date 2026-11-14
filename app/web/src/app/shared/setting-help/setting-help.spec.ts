import { FAKE_DECKS } from '../../../testing/fake-api';
import { goldfishSettingHelp, podSettingHelp } from './setting-help';

const [alpha, beta] = FAKE_DECKS;

describe('setting help', () => {
  it("says in the Simulate form whether a setting is the engine's or the deck's own", () => {
    expect(goldfishSettingHelp(alpha, 'max_turn')).toEqual({
      description: 'The last turn played.',
      appliesTo: 'same in every deck',
    });
    expect(goldfishSettingHelp(alpha, 'planner_width')).toEqual({
      description: 'How many plays the planner compares.',
      appliesTo: 'alpha only',
    });
  });

  it('names the decks of the pod that have a setting, each once', () => {
    expect(podSettingHelp([alpha, beta, alpha], 'planner_width')).toEqual({
      description: 'How many plays the planner compares.',
      appliesTo: 'alpha only',
    });
  });

  it("gives each deck's own meaning and default when they differ", () => {
    expect(podSettingHelp([alpha, beta], 'max_turn')).toEqual({
      description:
        'alpha (default 8): The last turn played.\nbeta (default 9): The last turn played.',
      appliesTo: 'all decks in the pod',
    });
  });
});
