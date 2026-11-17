/** Gale, Waterdeep Prodigy + Scion of Halaster: Dimir spellslinger combo. */
import * as path from 'path';
import { ROOT, landMakes, CardDef } from '../../engine/cards/cards';
import { CFG, SETTING_DESCRIPTIONS } from './config';
import { GaleGame } from './game';
import { runKillTests } from './tests/kills.test';
import { DiagRow } from '../../engine/run/runner';
import {
  averageOf,
  percentOf,
  winByTurnMetrics,
} from '../../engine/tools/diag-metrics';

/** A turn from a --diag row; a game where it never happened counts as turn 99. */
const turnOf = (row: DiagRow, key: string) => (row[key] as number | null) ?? 99;
const win = (row: DiagRow) => turnOf(row, 'win');

/** Average of a turn over the games where it happened. */
const averageTurnOf = (rows: DiagRow[], key: string) =>
  averageOf(
    rows.filter((row) => row[key] !== null),
    (row) => row[key] as number,
  );

/** Lands and rocks left untapped at the end of a turn, in the games still going after it. */
function untappedAtEndOfTurn(turn: number) {
  return {
    label: `Untapped lands and rocks at the end of turn ${turn} (games still going)`,
    unit: 'n' as const,
    measure: (rows: DiagRow[]) =>
      averageOf(
        rows.filter(
          (row) => win(row) > turn && row[`untapped${turn}`] !== null,
        ),
        (row) => row[`untapped${turn}`] as number,
      ),
  };
}

/** No kill by the end of turn 6, and what was missing then (see GaleGame.missingAtTurn6). */
function missingAtTurn6(code: number, what: string) {
  return {
    label: `No kill by turn 6: ${what} (%)`,
    unit: '%' as const,
    measure: (rows: DiagRow[]) =>
      percentOf(rows, (row) => row.missingAtTurn6 === code),
  };
}

const anyOf = (names: string[]) => {
  const set = new Set(names);
  return (hand: CardDef[]) => hand.some((card) => set.has(card.name));
};
const lands = (hand: CardDef[]) =>
  hand.filter((card) => card.land !== null || card.mdfcLand !== null).length;

export const deck = {
  name: 'gale',
  dir: path.join(ROOT, 'decks', 'gale'),
  defaultList: 'decklist.txt',
  tests: runKillTests,
  regress: {
    lists: ['decklist.txt', 'lists/original.txt', 'lists/proposed.txt'],
    // the logs were played with the original list (games 1-5) and the proposed list (game 6)
    logLists: {
      'game1_t7_mindskinner.txt': 'lists/original.txt',
      'game2_t6_duskmantle_maddening.txt': 'lists/original.txt',
      'game3_t6_mindskinner.txt': 'lists/original.txt',
      'game4_t7_konrad_mindcrank_maddening.txt': 'lists/original.txt',
      'game5_t6_duskmantle_maddening.txt': 'lists/original.txt',
      'game6_t9_duskmantle_singularity.txt': 'lists/proposed.txt',
    },
  },
  // counters and real removal do nothing against goldfish opponents (also when listed outside "Counters")
  rankProtect: {
    sections: ['counters'],
    cards: [
      'Spell Pierce',
      "It'll Quench Ya!",
      'Muddle the Mixture',
      'Rewind',
      'Extended Absence',
    ],
  },
  config: CFG,
  settingDescriptions: SETTING_DESCRIPTIONS,
  Game: GaleGame,
  // --diag: what a slow game is missing (task R2, 2026-11-17)
  diagMetrics: [
    ...winByTurnMetrics([5, 6, 7, 8], win),
    {
      label: 'Gale out by the end of turn 3 (%)',
      unit: '%' as const,
      measure: (rows: DiagRow[]) =>
        percentOf(rows, (row) => turnOf(row, 'galeOut') <= 3),
    },
    {
      label: 'Gale out by the end of turn 4 (%)',
      unit: '%' as const,
      measure: (rows: DiagRow[]) =>
        percentOf(rows, (row) => turnOf(row, 'galeOut') <= 4),
    },
    {
      label: 'Average turn Gale is out (games where he is)',
      unit: 'turn' as const,
      measure: (rows: DiagRow[]) => averageTurnOf(rows, 'galeOut'),
    },
    {
      label: 'A whole combo package at hand by the end of turn 5 (%)',
      unit: '%' as const,
      measure: (rows: DiagRow[]) =>
        percentOf(rows, (row) => turnOf(row, 'packageReady') <= 5),
    },
    {
      label: 'Average turn a whole combo package is at hand',
      unit: 'turn' as const,
      measure: (rows: DiagRow[]) => averageTurnOf(rows, 'packageReady'),
    },
    untappedAtEndOfTurn(3),
    untappedAtEndOfTurn(4),
    untappedAtEndOfTurn(5),
    untappedAtEndOfTurn(6),
    missingAtTurn6(1, 'no Gale'),
    missingAtTurn6(2, 'Gale, but a package piece missing'),
    missingAtTurn6(3, 'Gale and a package, no line (mana)'),
  ],
  // --hands: what to look for in an opening hand
  handFeatures: [
    {
      label: 'a blue source and a black source',
      matches: (cards: CardDef[]) =>
        cards.some((card) => landMakes(card, 'U')) &&
        cards.some((card) => landMakes(card, 'B')),
    },
    {
      label:
        'a mana rock (Sol Ring, Signet, Talisman, Fellwar Stone, Waterskin)',
      matches: anyOf([
        'Sol Ring',
        'Arcane Signet',
        'Dimir Signet',
        'Fellwar Stone',
        'Talisman of Dominance',
        "Bender's Waterskin",
      ]),
    },
    {
      label:
        'a cost reducer / engine creature (Baral, Sprite, Drake, Geist, Wizards...)',
      matches: anyOf([
        'Baral, Chief of Compliance',
        'Mocking Sprite',
        'Thunderclap Drake',
        'Geist of Saint Thalia',
        'Nightscape Familiar',
        'Wizards of Thay',
        'Curious Homunculus',
      ]),
    },
    {
      label:
        'a cheap cantrip (Brainstorm, Ponder, Preordain, Opt, Consider...)',
      matches: anyOf([
        'Brainstorm',
        'Consider',
        'Opt',
        'Ponder',
        'Preordain',
        'Frantic Search',
        'See the Truth',
      ]),
    },
    {
      label: 'a tutor',
      matches: anyOf([
        'Diabolic Tutor',
        'Gifts Ungiven',
        'Insatiable Avarice',
        'Personal Tutor',
        'Solve the Equation',
        'Waterlogged Teachings',
        'Wishclaw Talisman',
      ]),
    },
    {
      label:
        'a combo piece (Guildmage, Mindcrank, Konrad, Mindskinner, Cacophony...)',
      matches: anyOf([
        'Duskmantle Guildmage',
        'Mindcrank',
        'Syr Konrad, the Grim',
        'The Mindskinner',
        'Maddening Cacophony',
        'Riverchurn Monument',
        'Singularity Rupture',
        'Expansion Algorithm',
        'Prologue to Phyresis',
      ]),
    },
    {
      label:
        'a ritual or untap (High Tide, Muck, Dark Ritual, Energy Tap, Turnabout...)',
      matches: anyOf([
        'High Tide',
        'Bubbling Muck',
        'Dark Ritual',
        'Energy Tap',
        'Drain Power',
        'Turnabout',
        'Snap',
        'Energybending',
      ]),
    },
    {
      label: 'a rock, reducer or cantrip (something that develops)',
      matches: (cards: CardDef[]) =>
        anyOf([
          'Sol Ring',
          'Arcane Signet',
          'Dimir Signet',
          'Fellwar Stone',
          'Talisman of Dominance',
          "Bender's Waterskin",
          'Baral, Chief of Compliance',
          'Mocking Sprite',
          'Thunderclap Drake',
          'Geist of Saint Thalia',
          'Nightscape Familiar',
          'Wizards of Thay',
          'Curious Homunculus',
          'Brainstorm',
          'Consider',
          'Opt',
          'Ponder',
          'Preordain',
          'Frantic Search',
          'See the Truth',
        ])(cards),
    },
    {
      label: '2 lands and a rock, reducer or cantrip',
      matches: (cards: CardDef[]) =>
        lands(cards) === 2 &&
        anyOf([
          'Sol Ring',
          'Arcane Signet',
          'Dimir Signet',
          'Fellwar Stone',
          'Talisman of Dominance',
          "Bender's Waterskin",
          'Baral, Chief of Compliance',
          'Mocking Sprite',
          'Thunderclap Drake',
          'Geist of Saint Thalia',
          'Nightscape Familiar',
          'Wizards of Thay',
          'Curious Homunculus',
          'Brainstorm',
          'Consider',
          'Opt',
          'Ponder',
          'Preordain',
          'Frantic Search',
          'See the Truth',
        ])(cards),
    },
  ],
};
