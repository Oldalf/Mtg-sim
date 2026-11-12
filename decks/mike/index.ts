/** Mike: Vnwxt, Verbose Host (mono-blue card draw, bracket 2-3). Wins by milling itself out with Laboratory Maniac / Jace,
 *  Twenty-Toed Toad with twenty cards in hand, or draining all three opponents. */
import * as path from 'path';
import { ROOT } from '../../engine/cards';
import { CFG } from './config';
import { MikeGame } from './game';
import { LOG_TRACKERS } from './cards';
import { DiagRow } from '../../engine/runner';
import {
  percentOf,
  winByTurnMetrics,
  averageOf,
} from '../../engine/diag-metrics';

/** A game with no win by turn 14 counts as turn 15. */
const win = (row: DiagRow) => (row.win ?? 15) as number;

export const deck = {
  name: 'mike',
  dir: path.join(ROOT, 'decks', 'mike'),
  defaultList: 'decklist.txt',
  config: CFG,
  ownsDecking: true,
  Game: MikeGame,
  metrics: [
    ['Win', 'win'],
    ['First opponent dead', '1st dead'],
  ] as [[string, string], [string, string]],
  compareTurns: [9, 10, 11, 12],
  logTrackers: LOG_TRACKERS,
  // removal and counterspells do nothing against goldfish opponents
  rankProtect: {
    sections: ['removal', 'counterspell'],
    except: [] as string[],
  },
  rankTurn: 11,
  diagMetrics: [
    ...winByTurnMetrics([9, 10, 11, 12, 14], win),
    {
      label: 'Slow tail: turn the 90th-percentile game wins',
      unit: 'turn' as const,
      measure: (rows: DiagRow[]) =>
        rows.map(win).sort((first, second) => first - second)[
          Math.floor(rows.length * 0.9)
        ],
    },
    {
      label: 'Won by milling out (%)',
      unit: '%' as const,
      measure: (rows: DiagRow[]) => percentOf(rows, (row) => row.how === 1),
    },
    {
      label: 'Won with the Toad (%)',
      unit: '%' as const,
      measure: (rows: DiagRow[]) => percentOf(rows, (row) => row.how === 2),
    },
    {
      label: 'Won by life loss (%)',
      unit: '%' as const,
      measure: (rows: DiagRow[]) =>
        percentOf(rows, (row) => row.how === 3 || row.how === 4),
    },
    {
      label: 'Win with a counterspell in hand and 2 mana untapped (%)',
      unit: '%' as const,
      measure: (rows: DiagRow[]) => percentOf(rows, (row) => row.backup === 1),
    },
    {
      label: 'Library emptied (%)',
      unit: '%' as const,
      measure: (rows: DiagRow[]) => percentOf(rows, (row) => row.emptied === 1),
    },
    {
      label: 'Library emptied with a win piece / Conundrum / Ormos out (%)',
      unit: '%' as const,
      measure: (rows: DiagRow[]) =>
        percentOf(rows, (row) => row.emptiedSafe === 1),
    },
    {
      label: 'Decked ourselves (%)',
      unit: '%' as const,
      measure: (rows: DiagRow[]) => percentOf(rows, (row) => row.died === 1),
    },
    {
      label: 'Average turn Vnwxt comes down',
      unit: 'n' as const,
      measure: (rows: DiagRow[]) =>
        averageOf(
          rows.filter((row) => row.vnwxtOut != null),
          (row) => row.vnwxtOut as number,
        ),
    },
    {
      label: 'Reaches max speed by turn 8 (%)',
      unit: '%' as const,
      measure: (rows: DiagRow[]) =>
        percentOf(
          rows,
          (row) => row.maxSpeed != null && (row.maxSpeed as number) <= 8,
        ),
    },
    {
      label: 'Average cards drawn by turn 6',
      unit: 'n' as const,
      measure: (rows: DiagRow[]) =>
        averageOf(
          rows.filter((row) => win(row) > 6),
          (row) => row.draws6 ?? 0,
        ),
    },
    {
      label: 'Average cards in hand at end of turn 8',
      unit: 'n' as const,
      measure: (rows: DiagRow[]) =>
        averageOf(
          rows.filter((row) => win(row) > 8),
          (row) => row.hand8 ?? 0,
        ),
    },
    {
      label: 'Slow start: under 9 mana spent by turn 5 (%)',
      unit: '%' as const,
      measure: (rows: DiagRow[]) =>
        percentOf(rows, (row) => win(row) > 5 && (row.spent5 ?? 0) < 9),
    },
  ],
};
