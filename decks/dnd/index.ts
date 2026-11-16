/** Hama Pashar, Ruin Seeker (William's Azorius blink and dungeon deck): a pod-only deck (see PLAN.md). */
import * as path from 'path';
import { ROOT } from '../../engine/cards/cards';
import { CFG, SETTING_DESCRIPTIONS } from './config';
import { DndGame } from './game';
import { runDndTests } from './tests/dnd.test';

export const deck = {
  name: 'dnd',
  dir: path.join(ROOT, 'decks', 'dnd'),
  defaultList: 'decklist.txt',
  tests: runDndTests,
  config: CFG,
  settingDescriptions: SETTING_DESCRIPTIONS,
  // a pod: every other player must be dead
  podCfg: (players: number) => ({ win_dead: players - 1 }),
  Game: DndGame,
  metrics: [
    ['Win (all 3 dead)', 'win'],
    ['First opponent dead', '1st dead'],
  ] as [[string, string], [string, string]],
  compareTurns: [8, 10, 12],
};
