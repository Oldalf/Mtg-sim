/** Thantis, the Warweaver (Friend 2's Jund forced-combat deck): a pod-only deck (see PLAN.md). */
import * as path from 'path';
import { ROOT } from '../../engine/cards/cards';
import { CFG, SETTING_DESCRIPTIONS } from './config';
import { ThantisGame } from './game';
import { runThantisTests } from './tests/thantis.test';

export const deck = {
  name: 'thantis',
  dir: path.join(ROOT, 'decks', 'thantis'),
  defaultList: 'decklist.txt',
  tests: runThantisTests,
  config: CFG,
  settingDescriptions: SETTING_DESCRIPTIONS,
  // a pod: every other player must be dead
  podCfg: (players: number) => ({ win_dead: players - 1 }),
  Game: ThantisGame,
  metrics: [
    ['Win (all 3 dead)', 'win'],
    ['First opponent dead', '1st dead'],
  ] as [[string, string], [string, string]],
  compareTurns: [8, 10, 12],
};
