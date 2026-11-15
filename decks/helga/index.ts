/** Helga, Skittish Seer (Friend 2's Bant ramp deck): a pod-only deck (see PLAN.md). */
import * as path from 'path';
import { ROOT } from '../../engine/cards/cards';
import { CFG, SETTING_DESCRIPTIONS } from './config';
import { HelgaGame } from './game';
import { runHelgaTests } from './tests/helga.test';

export const deck = {
  name: 'helga',
  dir: path.join(ROOT, 'decks', 'helga'),
  defaultList: 'decklist.txt',
  tests: runHelgaTests,
  config: CFG,
  settingDescriptions: SETTING_DESCRIPTIONS,
  // a pod: every other player must be dead
  podCfg: (players: number) => ({ win_dead: players - 1 }),
  Game: HelgaGame,
  metrics: [
    ['Win (all 3 dead)', 'win'],
    ['First opponent dead', '1st dead'],
  ] as [[string, string], [string, string]],
  compareTurns: [8, 10, 12],
};
