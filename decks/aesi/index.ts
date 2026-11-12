/** Aesi, Tyrant of Gyre Strait (Simic "reverse landfall", bracket 3). Wins with loops: mill, endless flyers, epic copies. */
import * as path from 'path';
import { ROOT, landMakes, CardDef } from '../../engine/cards';
import { CFG } from './config';
import { AesiGame } from './game';
import { DiagRow } from '../../engine/runner';
import {
  percentOf,
  winByTurnMetrics,
  averageOf,
} from '../../engine/diag-metrics';

const anyOf = (names: string[]) => {
  const set = new Set(names);
  return (hand: CardDef[]) => hand.some((card) => set.has(card.name));
};
const lands = (hand: CardDef[]) =>
  hand.filter((card) => card.land !== null || card.mdfcLand !== null).length;

const turnOf = (row: DiagRow, key: string, none = 15) =>
  (row[key] ?? none) as number;
/** A turn number the game never reached counts as turn 15. */
const win = (row: DiagRow) => turnOf(row, 'win');

export const deck = {
  name: 'aesi',
  dir: path.join(ROOT, 'decks', 'aesi'),
  defaultList: 'decklist.txt',
  cfg: CFG,
  Game: AesiGame,
  metrics: [
    ['Win (all 3 out)', 'win'],
    ['First opponent out', '1st out'],
  ] as [[string, string], [string, string]],
  compareTurns: [8, 10, 12],
  // interaction is dead against goldfish opponents; the moonfolk among it still return lands (judged)
  rankProtect: {
    sections: ['removal', 'counters', 'protection', 'bounce', 'evasion'],
    except: [
      'Soratami Mirror-Mage',
      'Soratami Savant',
      'Oboro Envoy',
      'Soratami Rainshaper',
      'Floodbringer',
      'Moonbow Illusionist',
      'Oboro Breezecaller',
      'Soratami Mirror-Guard',
    ],
  },
  rankTurn: 10,
  // --hands: what to look for in an opening hand
  handFeatures: [
    {
      label: 'a green source (Forest, dual, fetch, Chamber)',
      f: (cards: CardDef[]) => cards.some((card) => landMakes(card, 'G')),
    },
    {
      label: 'a blue source',
      f: (cards: CardDef[]) => cards.some((card) => landMakes(card, 'U')),
    },
    {
      label: 'a green and a blue source',
      f: (cards: CardDef[]) =>
        cards.some((card) => landMakes(card, 'G')) &&
        cards.some((card) => landMakes(card, 'U')),
    },
    {
      label: 'a ramp spell or creature',
      f: anyOf([
        'Rampant Growth',
        'Farseek',
        'Cultivate',
        "Nissa's Pilgrimage",
        'Explosive Vegetation',
        'Circuitous Route',
        'Reach the Horizon',
        'Grow from the Ashes',
        'Entish Restoration',
        'Harrow',
        'Sakura-Tribe Elder',
        'Search for Tomorrow',
        'Skyshroud Claim',
        'Wood Elves',
        'Lotus Cobra',
        'Sol Ring',
        'Khalni Heart Expedition',
        "Nature's Lore",
        'Three Visits',
        'Beanstalk Giant',
      ]),
    },
    {
      label:
        'a ramp piece costing 1-2 (Rampant Growth, Elder, Search, Cobra, Sol Ring...)',
      f: anyOf([
        'Rampant Growth',
        'Farseek',
        'Sakura-Tribe Elder',
        'Search for Tomorrow',
        'Lotus Cobra',
        'Sol Ring',
        "Nature's Lore",
        'Three Visits',
        'Khalni Heart Expedition',
      ]),
    },
    {
      label:
        'an untapper or a land putter (Retreat, Raft-Steerer, Atlas, Scout, PuPu)',
      f: anyOf([
        'Retreat to Coralhelm',
        'Elven Raft-Steerer',
        'Walking Atlas',
        'Sakura-Tribe Scout',
        'PuPu UFO',
        'Budoka Gardener',
      ]),
    },
    {
      label: 'an extra-land-drop card (Azusa, Loot, Case, Druid Class...)',
      f: anyOf([
        'Azusa, Lost but Seeking',
        'Loot, Exuberant Explorer',
        'Case of the Locked Hothouse',
        'Druid Class',
        'Summer Bloom',
        "Azusa's Many Journeys",
      ]),
    },
    {
      label: '2 lands and a cheap ramp piece',
      f: (cards: CardDef[]) =>
        lands(cards) === 2 &&
        anyOf([
          'Rampant Growth',
          'Farseek',
          'Sakura-Tribe Elder',
          'Search for Tomorrow',
          'Lotus Cobra',
          'Sol Ring',
          "Nature's Lore",
          'Three Visits',
          'Khalni Heart Expedition',
        ])(cards),
    },
    {
      label: '2 lands, a green source and a cheap ramp piece',
      f: (cards: CardDef[]) =>
        lands(cards) === 2 &&
        cards.some((card) => landMakes(card, 'G')) &&
        anyOf([
          'Rampant Growth',
          'Farseek',
          'Sakura-Tribe Elder',
          'Search for Tomorrow',
          'Lotus Cobra',
          'Sol Ring',
          "Nature's Lore",
          'Three Visits',
          'Khalni Heart Expedition',
        ])(cards),
    },
  ],
  // --diag: consistency measures (Pontus, 2026-11-05). A game with no win by turn 14 counts as turn 15.
  diagMetrics: [
    ...winByTurnMetrics([10, 12], win),
    {
      label: 'No win by turn 14 (%)',
      unit: '%' as const,
      f: (rows: DiagRow[]) => percentOf(rows, (row) => win(row) > 14),
    },
    {
      label: 'Slow tail: turn the 90th-percentile game wins',
      unit: 'turn' as const,
      f: (rows: DiagRow[]) =>
        rows.map(win).sort((first, second) => first - second)[
          Math.floor(rows.length * 0.9)
        ],
    },
    // Aesi measures: a game that is already won doesn't need him (counted separately)
    {
      label: 'Won without ever casting Aesi (%)',
      unit: '%' as const,
      f: (rows: DiagRow[]) =>
        percentOf(
          rows,
          (row) => win(row) <= 14 && turnOf(row, 'aesiOut') > win(row),
        ),
    },
    {
      label: 'Average turn Aesi comes down (games where he does)',
      unit: 'turn' as const,
      f: (rows: DiagRow[]) =>
        averageOf(
          rows.filter(
            (row) =>
              row.aesiOut !== null && (row.aesiOut as number) <= win(row),
          ),
          (row) => turnOf(row, 'aesiOut'),
        ),
    },
    {
      label: 'No Aesi by end of turn 5, game still going (%)',
      unit: '%' as const,
      f: (rows: DiagRow[]) =>
        percentOf(rows, (row) => turnOf(row, 'aesiOut') > 5 && win(row) > 5),
    },
    {
      label: 'No Aesi by end of turn 6, game still going (%)',
      unit: '%' as const,
      f: (rows: DiagRow[]) =>
        percentOf(rows, (row) => turnOf(row, 'aesiOut') > 6 && win(row) > 6),
    },
    {
      label: 'No Aesi by end of turn 7, game still going (%)',
      unit: '%' as const,
      f: (rows: DiagRow[]) =>
        percentOf(rows, (row) => turnOf(row, 'aesiOut') > 7 && win(row) > 7),
    },
    {
      label:
        "Average turn of Aesi's first landfall draw (games where it happens)",
      unit: 'turn' as const,
      f: (rows: DiagRow[]) =>
        averageOf(
          rows.filter((row) => row.aesiDraw !== null),
          (row) => turnOf(row, 'aesiDraw'),
        ),
    },
    {
      label: 'No landfall draw by end of turn 7, game still going (%)',
      unit: '%' as const,
      f: (rows: DiagRow[]) =>
        percentOf(rows, (row) => turnOf(row, 'aesiDraw') > 7 && win(row) > 7),
    },
    // "Not doing much" (Pontus): less than 60% of the mana of one land per turn (15 by turn 5, 21 by turn 6)
    // is spent. A game already won by then doesn't count.
    {
      label: 'Slow start: under 9 mana spent by turn 5 (%)',
      unit: '%' as const,
      f: (rows: DiagRow[]) =>
        percentOf(rows, (row) => win(row) > 5 && (row.spent5 ?? 0) < 9),
    },
    {
      label: 'Slow start: under 13 mana spent by turn 6 (%)',
      unit: '%' as const,
      f: (rows: DiagRow[]) =>
        percentOf(rows, (row) => win(row) > 6 && (row.spent6 ?? 0) < 13),
    },
    {
      label: 'Slow start either way (%)',
      unit: '%' as const,
      f: (rows: DiagRow[]) =>
        percentOf(
          rows,
          (row) =>
            (win(row) > 5 && (row.spent5 ?? 0) < 9) ||
            (win(row) > 6 && (row.spent6 ?? 0) < 13),
        ),
    },
    {
      label: 'Average mana spent by turn 5 (of 15)',
      unit: 'n' as const,
      f: (rows: DiagRow[]) =>
        averageOf(
          rows.filter((row) => win(row) > 5),
          (row) => row.spent5 ?? 0,
        ),
    },
    {
      label: 'Average mana spent by turn 6 (of 21)',
      unit: 'n' as const,
      f: (rows: DiagRow[]) =>
        averageOf(
          rows.filter((row) => win(row) > 6),
          (row) => row.spent6 ?? 0,
        ),
    },
    {
      label: 'Lands on turn 5 (average)',
      unit: 'n' as const,
      f: (rows: DiagRow[]) => averageOf(rows, (row) => row.lands5 ?? 0),
    },
    {
      label: '5 lands or fewer after turn 6 (%)',
      unit: '%' as const,
      f: (rows: DiagRow[]) => percentOf(rows, (row) => (row.lands6 ?? 0) <= 5),
    },
  ],
};
