/** Fire Lord Azula (Friend 3's Grixis spells deck): a pod-only deck (see PLAN.md). */
import * as path from 'path';
import { ROOT } from '../../engine/cards/cards';
import { CFG, SETTING_DESCRIPTIONS } from './config';
import { AzulaGame } from './game';
import { runAzulaTests } from './tests/azula.test';

export const deck = {
  name: 'azula',
  dir: path.join(ROOT, 'decks', 'azula'),
  defaultList: 'decklist.txt',
  tests: runAzulaTests,
  config: CFG,
  settingDescriptions: SETTING_DESCRIPTIONS,
  // a pod: every other player must be dead
  podCfg: (players: number) => ({ win_dead: players - 1 }),
  Game: AzulaGame,
  metrics: [
    ['Win (all 3 dead)', 'win'],
    ['First opponent dead', '1st dead'],
  ] as [[string, string], [string, string]],
  compareTurns: [6, 8, 10],
};
