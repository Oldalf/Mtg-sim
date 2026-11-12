/** Codie, Vociferous Codex (five-colour spells combo, bracket 4). Wins with an X spell (Exsanguinate, Crackle with Power,
 *  Torment of Hailfire), copied by Reiterate; Reiterate loops on Jeska's Will / Mana Geyser / Brass's Bounty are bottomless. */
import * as path from 'path';
import { ROOT } from '../../engine/cards';
import { CFG } from './config';
import { CodieGame } from './game';
import { DiagRow } from '../../engine/runner';

const pct = (rows: DiagRow[], f: (r: DiagRow) => boolean) =>
  (100 * rows.filter(f).length) / rows.length;
const win = (r: DiagRow) => (r.win ?? 13) as number;

export const deck = {
  name: 'codie',
  dir: path.join(ROOT, 'decks', 'codie'),
  defaultList: 'decklist.txt',
  cfg: CFG,
  Game: CodieGame,
  rankProtect: { sections: ['protection', 'removal'], except: [] as string[] },
  rankTurn: 7,
  diagMetrics: [
    {
      label: 'Win by turn 5 (%)',
      unit: '%' as const,
      f: (rows: DiagRow[]) => pct(rows, (r) => win(r) <= 5),
    },
    {
      label: 'Win by turn 6 (%)',
      unit: '%' as const,
      f: (rows: DiagRow[]) => pct(rows, (r) => win(r) <= 6),
    },
    {
      label: 'Win by turn 7 (%)',
      unit: '%' as const,
      f: (rows: DiagRow[]) => pct(rows, (r) => win(r) <= 7),
    },
    {
      label: 'Win by turn 8 (%)',
      unit: '%' as const,
      f: (rows: DiagRow[]) => pct(rows, (r) => win(r) <= 8),
    },
    {
      label: 'Win by turn 10 (%)',
      unit: '%' as const,
      f: (rows: DiagRow[]) => pct(rows, (r) => win(r) <= 10),
    },
    {
      label: 'Won through a Reiterate loop (%)',
      unit: '%' as const,
      f: (rows: DiagRow[]) => pct(rows, (r) => r.loop === 1),
    },
    {
      label: 'Had Reiterate by turn 7 (%)',
      unit: '%' as const,
      f: (rows: DiagRow[]) => pct(rows, (r) => r.reit7 === 1),
    },
    {
      label: 'Had a loop piece (Will / Geyser / Bounty) by turn 7 (%)',
      unit: '%' as const,
      f: (rows: DiagRow[]) => pct(rows, (r) => r.loopPiece7 === 1),
    },
    {
      label: 'Had a finisher by turn 7 (%)',
      unit: '%' as const,
      f: (rows: DiagRow[]) => pct(rows, (r) => r.fin7 === 1),
    },
    {
      label: 'Had a tutor by turn 7 (%)',
      unit: '%' as const,
      f: (rows: DiagRow[]) => pct(rows, (r) => r.tutor7 === 1),
    },
    {
      label: 'Had Reiterate + loop piece + finisher by turn 7 (%)',
      unit: '%' as const,
      f: (rows: DiagRow[]) => pct(rows, (r) => r.all3 === 1),
    },
    {
      label: 'Lands on the battlefield on turn 7',
      unit: 'n' as const,
      f: (rows: DiagRow[]) =>
        rows
          .filter((r) => r.lands7)
          .reduce((s, r) => s + (r.lands7 as number), 0) /
        Math.max(1, rows.filter((r) => r.lands7).length),
    },
    {
      label: 'Mana sources on turn 7',
      unit: 'n' as const,
      f: (rows: DiagRow[]) =>
        rows
          .filter((r) => r.mana7)
          .reduce((s, r) => s + (r.mana7 as number), 0) /
        Math.max(1, rows.filter((r) => r.mana7).length),
    },
    {
      label: 'Died (%)',
      unit: '%' as const,
      f: (rows: DiagRow[]) => pct(rows, (r) => r.died === 1),
    },
  ],
};
