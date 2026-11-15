/** Ardyn, the Usurper (Friend 3's mono-black Demons): a pod-only deck (see PLAN.md). */
import * as path from 'path';
import { ROOT } from '../../engine/cards/cards';
import { CFG, SETTING_DESCRIPTIONS } from './config';
import { ArdynGame } from './game';
import { runArdynTests } from './tests/ardyn.test';

export const deck = {
  name: 'ardyn',
  dir: path.join(ROOT, 'decks', 'ardyn'),
  defaultList: 'decklist.txt',
  tests: runArdynTests,
  config: CFG,
  settingDescriptions: SETTING_DESCRIPTIONS,
  // a pod: every other player must be dead
  podCfg: (players: number) => ({ win_dead: players - 1 }),
  Game: ArdynGame,
  metrics: [
    ['Win (all 3 dead)', 'win'],
    ['First opponent dead', '1st dead'],
  ] as [[string, string], [string, string]],
  compareTurns: [8, 10, 12],
};
