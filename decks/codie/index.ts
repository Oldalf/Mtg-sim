/** Codie, Vociferous Codex (five-colour spells combo, bracket 4). Wins with an X spell (Exsanguinate, Crackle with Power,
 *  Torment of Hailfire), copied by Reiterate; Reiterate loops on Jeska's Will / Mana Geyser / Brass's Bounty are bottomless. */
import * as path from 'path';
import { ROOT } from '../../engine/cards';
import { CFG } from './config';
import { CodieGame } from './game';
import { DiagRow } from '../../engine/runner';
import { percentOf, winByTurnMetrics } from '../../engine/diag-metrics';

const win = (row: DiagRow) => (row.win ?? 13) as number;

export const deck = {
  name: 'codie',
  dir: path.join(ROOT, 'decks', 'codie'),
  defaultList: 'decklist.txt',
  config: CFG,
  Game: CodieGame,
  rankProtect: { sections: ['protection', 'removal'], except: [] as string[] },
  rankTurn: 7,
  diagMetrics: [
    ...winByTurnMetrics([5, 6, 7, 8, 10], win),
    {
      label: 'Won through a Reiterate loop (%)',
      unit: '%' as const,
      measure: (rows: DiagRow[]) => percentOf(rows, (row) => row.loop === 1),
    },
    {
      label: 'Had Reiterate by turn 7 (%)',
      unit: '%' as const,
      measure: (rows: DiagRow[]) => percentOf(rows, (row) => row.reit7 === 1),
    },
    {
      label: 'Had a loop piece (Will / Geyser / Bounty) by turn 7 (%)',
      unit: '%' as const,
      measure: (rows: DiagRow[]) =>
        percentOf(rows, (row) => row.loopPiece7 === 1),
    },
    {
      label: 'Had a finisher by turn 7 (%)',
      unit: '%' as const,
      measure: (rows: DiagRow[]) => percentOf(rows, (row) => row.fin7 === 1),
    },
    {
      label: 'Had a tutor by turn 7 (%)',
      unit: '%' as const,
      measure: (rows: DiagRow[]) => percentOf(rows, (row) => row.tutor7 === 1),
    },
    {
      label: 'Had Reiterate + loop piece + finisher by turn 7 (%)',
      unit: '%' as const,
      measure: (rows: DiagRow[]) => percentOf(rows, (row) => row.all3 === 1),
    },
    {
      label: 'Lands on the battlefield on turn 7',
      unit: 'n' as const,
      measure: (rows: DiagRow[]) =>
        rows
          .filter((row) => row.lands7)
          .reduce((total, row) => total + (row.lands7 as number), 0) /
        Math.max(1, rows.filter((row) => row.lands7).length),
    },
    {
      label: 'Mana sources on turn 7',
      unit: 'n' as const,
      measure: (rows: DiagRow[]) =>
        rows
          .filter((row) => row.mana7)
          .reduce((total, row) => total + (row.mana7 as number), 0) /
        Math.max(1, rows.filter((row) => row.mana7).length),
    },
    {
      label: 'Died (%)',
      unit: '%' as const,
      measure: (rows: DiagRow[]) => percentOf(rows, (row) => row.died === 1),
    },
  ],
};
