/** Teval, the Balanced Scale (Friend 4's Sultai self-mill deck): a pod-only deck (see PLAN.md). */
import * as path from 'path';
import { ROOT } from '../../engine/cards/cards';
import { CFG, SETTING_DESCRIPTIONS } from './config';
import { TevalGame } from './game';
import { runTevalTests } from './tests/teval.test';

export const deck = {
  name: 'teval',
  dir: path.join(ROOT, 'decks', 'teval'),
  defaultList: 'decklist.txt',
  tests: runTevalTests,
  config: CFG,
  settingDescriptions: SETTING_DESCRIPTIONS,
  // a pod: every other player must be dead
  podCfg: (players: number) => ({ win_dead: players - 1 }),
  Game: TevalGame,
  metrics: [
    ['Win (all 3 dead)', 'win'],
    ['First opponent dead', '1st dead'],
  ] as [[string, string], [string, string]],
  compareTurns: [8, 10, 12],
};
