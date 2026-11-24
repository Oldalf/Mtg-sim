/** Edgar Markov: Mardu vampire tribal / aristocrats (bracket 2-3). Wins by draining and attacking all three opponents from 40. */
import * as path from 'path';
import { ROOT, landMakes, CardDef } from '../../engine/cards/cards';
import { CFG, SETTING_DESCRIPTIONS } from './config';
import { EdgarGame } from './game';
import { runEdgarTests } from './tests/edgar.test';
import { DiagRow } from '../../engine/run/runner';
import {
  percentOf,
  winByTurnMetrics,
  averageOf,
} from '../../engine/tools/diag-metrics';
import { DRAIN_ENGINES, OUTLETS, RAMP_PIECES, TOKEN_MAKERS } from './mulligan';

const anyOf = (names: string[]) => {
  const set = new Set(names);
  return (hand: CardDef[]) => hand.some((card) => set.has(card.name));
};
const lands = (hand: CardDef[]) =>
  hand.filter((card) => card.land !== null || card.mdfcLand !== null).length;
/** A game with no win by turn 14 counts as turn 15. */
const win = (row: DiagRow) => (row.win ?? 15) as number;
const THIN = 3; // fewer nonland permanents than this = a thin board
const slow5 = (row: DiagRow) => win(row) > 5 && (row.spent5 ?? 0) < 9;
const slow6 = (row: DiagRow) => win(row) > 6 && (row.spent6 ?? 0) < 13;

/** How the deck wins: the kind of damage that killed the last opponent, and where all the damage came from. */
function winTypeMetrics() {
  const won = (rows: DiagRow[]) => rows.filter((row) => row.win !== null);
  const winnersBy = (code: number) => (rows: DiagRow[]) =>
    percentOf(won(rows), (row) => row.winSource === code);
  const damageFrom = (key: string) => (rows: DiagRow[]) =>
    averageOf(won(rows), (row) => (row[key] ?? 0) as number);
  return [
    {
      label: 'Last opponent killed by combat (% of wins)',
      unit: '%' as const,
      measure: winnersBy(1),
    },
    {
      label: 'Last opponent killed by drains and pings (% of wins)',
      unit: '%' as const,
      measure: winnersBy(2),
    },
    {
      label: "Last opponent killed by Evereth's explosion (% of wins)",
      unit: '%' as const,
      measure: winnersBy(3),
    },
    {
      label: 'Damage from combat per won game',
      unit: 'n' as const,
      measure: damageFrom('damageFromCombat'),
    },
    {
      label: 'Damage from drains and pings per won game',
      unit: 'n' as const,
      measure: damageFrom('damageFromDrains'),
    },
    {
      label: "Damage from Evereth's explosion per won game",
      unit: 'n' as const,
      measure: damageFrom('damageFromExplosion'),
    },
  ];
}

export const deck = {
  name: 'edgar',
  dir: path.join(ROOT, 'decks', 'edgar'),
  defaultList: 'decklist.txt',
  tests: runEdgarTests,
  regress: { lists: ['decklist.txt'] },
  config: CFG,
  settingDescriptions: SETTING_DESCRIPTIONS,
  // a pod: every other player must be dead
  podCfg: (players: number) => ({ win_dead: players - 1 }),
  Game: EdgarGame,
  metrics: [
    ['Win (all 3 dead)', 'win'],
    ['First opponent dead', '1st dead'],
  ] as [[string, string], [string, string]],
  compareTurns: [8, 10, 12],
  // removal does nothing against goldfish opponents (like Gale's counters)
  rankProtect: { sections: ['removal'], except: [] as string[] },
  rankTurn: 10,
  // --diag: consistency measures (the same slow-start definition as Aesi, Meren and Sam & Frodo)
  diagMetrics: [
    ...winByTurnMetrics([8, 10, 12], win),
    ...winTypeMetrics(),
    {
      label: 'Slow tail: turn the 90th-percentile game wins',
      unit: 'turn' as const,
      measure: (rows: DiagRow[]) =>
        rows.map(win).sort((first, second) => first - second)[
          Math.floor(rows.length * 0.9)
        ],
    },
    {
      label: 'Slow start: under 9 mana spent by turn 5 (%)',
      unit: '%' as const,
      measure: (rows: DiagRow[]) => percentOf(rows, slow5),
    },
    {
      label: 'Slow start: under 13 mana spent by turn 6 (%)',
      unit: '%' as const,
      measure: (rows: DiagRow[]) => percentOf(rows, slow6),
    },
    {
      label: 'Slow start either way (%)',
      unit: '%' as const,
      measure: (rows: DiagRow[]) =>
        percentOf(rows, (row) => slow5(row) || slow6(row)),
    },
    {
      label: 'Average mana spent by turn 5 (of 15)',
      unit: 'n' as const,
      measure: (rows: DiagRow[]) =>
        averageOf(
          rows.filter((row) => win(row) > 5),
          (row) => row.spent5 ?? 0,
        ),
    },
    {
      label: 'Average mana spent by turn 6 (of 21)',
      unit: 'n' as const,
      measure: (rows: DiagRow[]) =>
        averageOf(
          rows.filter((row) => win(row) > 6),
          (row) => row.spent6 ?? 0,
        ),
    },
    {
      label:
        'Thin board: under ' +
        THIN +
        ' nonland permanents at end of turn 5 (%)',
      unit: '%' as const,
      measure: (rows: DiagRow[]) =>
        percentOf(rows, (row) => win(row) > 5 && (row.perms5 ?? 0) < THIN),
    },
    {
      label: 'Thin board at end of turn 6 (%)',
      unit: '%' as const,
      measure: (rows: DiagRow[]) =>
        percentOf(rows, (row) => win(row) > 6 && (row.perms6 ?? 0) < THIN),
    },
  ],
  // --hands: what to look for in an opening hand
  handFeatures: [
    {
      label: 'sources for white, black and red',
      matches: (cards: CardDef[]) =>
        ['W', 'B', 'R'].every((colour) =>
          cards.some((card) => landMakes(card, colour)),
        ),
    },
    {
      label: 'a black source and a second colour',
      matches: (cards: CardDef[]) =>
        cards.some((card) => landMakes(card, 'B')) &&
        ['W', 'R'].some((colour) =>
          cards.some((card) => landMakes(card, colour)),
        ),
    },
    {
      label: 'a ramp piece (Sol Ring, Signet, Stone, Sphere, Ritual...)',
      matches: anyOf(RAMP_PIECES),
    },
    {
      label:
        'a drain engine (Blood Artist, Celebrant, Bloodwitch, Voidborn...)',
      matches: anyOf(DRAIN_ENGINES),
    },
    {
      label: 'a sacrifice outlet (Evereth, Seer, an Altar, Pontiff...)',
      matches: anyOf(OUTLETS),
    },
    {
      label: 'a token maker (Landing, Keeper, Preacher, Bertram, Elenda...)',
      matches: anyOf(TOKEN_MAKERS),
    },
    {
      label: 'one of the best (Sol Ring, Skullclamp, Blood Artist, Keeper)',
      matches: anyOf([
        'Sol Ring',
        'Skullclamp',
        'Blood Artist',
        'Bloodline Keeper',
        'Evereth, Viceroy of Plunder',
      ]),
    },
    {
      label: '2 lands and a ramp piece',
      matches: (cards: CardDef[]) =>
        lands(cards) === 2 && anyOf(RAMP_PIECES)(cards),
    },
  ],
};
