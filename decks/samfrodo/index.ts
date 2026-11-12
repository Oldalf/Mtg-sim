/** Sam & Frodo (Abzan tokens / aristocrats, bracket 2-3). Wins by draining all three opponents from 40. */
import * as path from 'path';
import { ROOT, landMakes, CardDef } from '../../engine/cards';
import { CFG } from './config';
import { SamFrodoGame } from './game';
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
/** A game with no win by turn 14 counts as turn 15. */
const win = (row: DiagRow) => (row.win ?? 15) as number;
const THIN = 3; // fewer nonland permanents than this = a thin board
const slow5 = (row: DiagRow) => win(row) > 5 && (row.spent5 ?? 0) < 9;
const slow6 = (row: DiagRow) => win(row) > 6 && (row.spent6 ?? 0) < 13;

export const deck = {
  name: 'samfrodo',
  dir: path.join(ROOT, 'decks', 'samfrodo'),
  defaultList: 'decklist.txt',
  config: CFG,
  podCfg: (players: number) => ({ win_dead: players - 1 }),
  Game: SamFrodoGame,
  metrics: [
    ['Win (all 3 dead)', 'win'],
    ['First opponent dead', '1st dead'],
  ] as [[string, string], [string, string]],
  compareTurns: [10, 12, 14],
  // Archidekt's Ring card counts the temptations
  logTrackers: ['The Ring // The Ring Tempts You'],
  // a tapped Food was eaten (or sacrificed), a tapped Treasure was spent: Archidekt doesn't log tokens leaving
  logSacOnTap: ['Food', 'Treasure'],
  // removal does nothing against goldfish opponents (like Gale's counters)
  rankProtect: { sections: ['removal'], except: [] as string[] },
  rankTurn: 12,
  // --diag: consistency measures (the same slow-start definition as Aesi and Meren)
  diagMetrics: [
    ...winByTurnMetrics([10, 12, 14], win),
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
      label: 'sources for white, black and green',
      matches: (cards: CardDef[]) =>
        ['W', 'B', 'G'].every((colour) =>
          cards.some((card) => landMakes(card, colour)),
        ),
    },
    {
      label:
        'a ramp piece (Sol Ring, Signet, Birds, Goose, Cultivate, Innkeeper...)',
      matches: anyOf([
        'Sol Ring',
        'Arcane Signet',
        'Birds of Paradise',
        'Gilded Goose',
        "Commander's Sphere",
        'Cultivate',
        'Farseek',
        'Prosperous Innkeeper',
        'Tireless Provisioner',
        'Prize Pig',
        'Unlucky Cabbage Merchant',
        'The Notary Hobbits',
        'Elanor Gardner',
        'Pristine Talisman',
        'Chromatic Lantern',
      ]),
    },
    {
      label:
        'a token or Food maker (Manufactor, Peregrin, Tippy-Toe, Rosie, Cotton...)',
      matches: anyOf([
        'Academy Manufactor',
        'Peregrin Took',
        'Tippy-Toe, Terrific Partner',
        'Rosie Cotton of South Lane',
        'Cat Collector',
        'Farmer Cotton',
        'Merry, Warden of Isengard',
        'Pippin, Warden of Isengard',
        'Meriadoc Brandybuck',
        'Nuka-Cola Vending Machine',
        'Rapacious Guest',
        'Second Harvest',
      ]),
    },
    {
      label:
        'a drain payoff (Bats, Apprentice, Master, Egotist, Voidborn, Bond, Gollum)',
      matches: anyOf([
        'Mirkwood Bats',
        'Marionette Apprentice',
        'Marionette Master',
        'Popular Egotist',
        'Susurian Voidborn',
        'Sanguine Bond',
        'Gollum, Obsessed Stalker',
        'Cauldron Familiar',
      ]),
    },
    {
      label:
        "a card-draw piece (Night's Whisper, Harmonize, Belladonna, Gaffer...)",
      matches: anyOf([
        "Night's Whisper",
        'Harmonize',
        'Belladonna Took',
        'Mentor of the Meek',
        'Of Herbs and Stewed Rabbit',
        'Savvy Hunter',
        'Lobelia, Defender of Bag End',
        'Trading Post',
        'Dawn of Hope',
        'Well of Lost Dreams',
        'The Gaffer',
      ]),
    },
    {
      label:
        'one of the best (Manufactor, Peregrin, Nuka-Cola, Notary, Bats, Gollum, Sol Ring)',
      matches: anyOf([
        'Academy Manufactor',
        'Peregrin Took',
        'Nuka-Cola Vending Machine',
        'The Notary Hobbits',
        'Mirkwood Bats',
        'Gollum, Obsessed Stalker',
        'Sol Ring',
      ]),
    },
    {
      label: '2 lands and a ramp piece',
      matches: (cards: CardDef[]) =>
        lands(cards) === 2 &&
        anyOf([
          'Sol Ring',
          'Arcane Signet',
          'Birds of Paradise',
          'Gilded Goose',
          "Commander's Sphere",
          'Cultivate',
          'Farseek',
          'Prosperous Innkeeper',
          'Tireless Provisioner',
          'Prize Pig',
          'Unlucky Cabbage Merchant',
          'The Notary Hobbits',
          'Elanor Gardner',
          'Pristine Talisman',
          'Chromatic Lantern',
        ])(cards),
    },
  ],
};
