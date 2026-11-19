/** Meren of Clan Nel Toth: Golgari reanimator (bracket 2-3). Wins with Gray Merchant / Lotleth Giant drains and combat. */
import * as path from 'path';
import { ROOT, landMakes, CardDef } from '../../engine/cards/cards';
import { CFG, SETTING_DESCRIPTIONS } from './config';
import { MerenGame } from './game';
import { DISCARD_CARDS, DRAW_CARDS } from './cards';
import { runMerenTests } from './tests/meren.test';
import { DiagRow } from '../../engine/run/runner';
import {
  percentOf,
  winByTurnMetrics,
  averageOf,
} from '../../engine/tools/diag-metrics';

const anyOf = (names: string[]) => {
  const set = new Set(names);
  return (hand: CardDef[]) => hand.some((card) => set.has(card.name));
};
const lands = (hand: CardDef[]) =>
  hand.filter((card) => card.land !== null || card.mdfcLand !== null).length;

/** A turn the game never reached counts as turn 13 (the horizon is turn 12). */
const turnOf = (row: DiagRow, key: string) => (row[key] ?? 13) as number;
const win = (row: DiagRow) => turnOf(row, 'win');
const THIN = 3;
// "No meaningful impact" (Pontus, 2026-11-18): the game is still going at the end of turn 5 / 6 and Meren's engine
// isn't running: Meren isn't on the battlefield, or nothing has come back from a graveyard and she has fewer than
// ENGINE_EXPERIENCE experience counters. (The first definition was: nothing reanimated and under THIN nonland
// permanents.)
const ENGINE_EXPERIENCE = 2;
// Card draw: a hand this small at the end of turn 6 / 8 means we're playing off the top of the library.
const OUT_OF_CARDS = 1;
const isEngineRunning = (row: DiagRow, turn: 5 | 6) =>
  (row['merenOn' + turn] ?? 0) === 1 &&
  ((row['reanim' + turn] ?? 0) > 0 ||
    (row['exp' + turn] ?? 0) >= ENGINE_EXPERIENCE);
const noImpact = (row: DiagRow, turn: 5 | 6) =>
  win(row) > turn && !isEngineRunning(row, turn);
// What each draw card gave: the cards it drew in the games where it was played (0 when it never was: see its share).
const drewKey = (name: string) => 'drew:' + name;
const gamesWherePlayed = (rows: DiagRow[], name: string) =>
  rows.filter(
    (row) => row[drewKey(name)] !== null && row[drewKey(name)] !== undefined,
  );
const drawMetricsOf = (name: string) => [
  {
    label: `${name}: played in (% of games)`,
    unit: '%' as const,
    measure: (rows: DiagRow[]) =>
      (100 * gamesWherePlayed(rows, name).length) / rows.length,
  },
  {
    label: `${name}: cards it drew when played`,
    unit: 'n' as const,
    measure: (rows: DiagRow[]) => {
      const played = gamesWherePlayed(rows, name);
      return played.length
        ? averageOf(played, (row) => row[drewKey(name)] ?? 0)
        : 0;
    },
  },
];
// Cards in and out (Pontus, 2026-11-19): the draws, discards and mill, and what's left of the library.
const LOW_LIBRARY = 10;
const averageAtTurn8 = (key: string) => (rows: DiagRow[]) =>
  averageOf(
    rows.filter((row) => win(row) > 8),
    (row) => row[key] ?? 0,
  );
const cardFlowMetrics = [
  {
    label: 'Average cards discarded by end of turn 8',
    unit: 'n' as const,
    measure: averageAtTurn8('discarded8'),
  },
  {
    label: 'Average cards milled by end of turn 8',
    unit: 'n' as const,
    measure: averageAtTurn8('milled8'),
  },
  {
    label: 'Average net cards by end of turn 8 (drawn minus discarded)',
    unit: 'n' as const,
    measure: (rows: DiagRow[]) =>
      averageAtTurn8('drawn8')(rows) - averageAtTurn8('discarded8')(rows),
  },
  {
    label: 'Average cards left in the library at end of turn 8',
    unit: 'n' as const,
    measure: averageAtTurn8('library8'),
  },
  {
    label:
      'Library down to ' +
      LOW_LIBRARY +
      ' cards or fewer at end of turn 8, game still going (%)',
    unit: '%' as const,
    measure: (rows: DiagRow[]) =>
      percentOf(
        rows,
        (row) => win(row) > 8 && (row.library8 ?? 99) <= LOW_LIBRARY,
      ),
  },
  {
    label: 'Average life at end of turn 8',
    unit: 'n' as const,
    measure: averageAtTurn8('life8'),
  },
  {
    label: 'Average creature cards in the graveyard at end of turn 5',
    unit: 'n' as const,
    measure: (rows: DiagRow[]) =>
      averageOf(
        rows.filter((row) => win(row) > 5),
        (row) => row.graveyardCreatures5 ?? 0,
      ),
  },
  {
    label: 'Average creature cards in the graveyard at end of turn 6',
    unit: 'n' as const,
    measure: (rows: DiagRow[]) =>
      averageOf(
        rows.filter((row) => win(row) > 6),
        (row) => row.graveyardCreatures6 ?? 0,
      ),
  },
];
const slow5 = (row: DiagRow) => win(row) > 5 && (row.spent5 ?? 0) < 9;
const slow6 = (row: DiagRow) => win(row) > 6 && (row.spent6 ?? 0) < 13;

export const deck = {
  name: 'meren',
  dir: path.join(ROOT, 'decks', 'meren'),
  defaultList: 'decklist.txt',
  tests: runMerenTests,
  regress: { lists: ['decklist.txt'] },
  config: CFG,
  settingDescriptions: SETTING_DESCRIPTIONS,
  // a pod: every other player must be dead (the goldfish rule was two dead or 100 damage)
  podCfg: (players: number) => ({ win_dead: players - 1, win_damage: 1e9 }),
  Game: MerenGame,
  metrics: [
    ['Win (2 dead / 100 dmg)', 'win'],
    ['First opponent dead', '1st dead'],
  ] as [[string, string], [string, string]],
  compareTurns: [8, 10, 12],
  // Pontus tracks Meren's experience counters with the "Start Your Engines!" speed tracker (only in this deck)
  logTrackers: ['Start Your Engines!'],
  // interaction is dead against goldfish opponents (like Gale's counters); Saw in Half is a combo piece here
  rankProtect: { sections: ['removal', 'protection'], except: ['Saw in Half'] },
  rankTurn: 10,
  // --diag: consistency measures (the same slow-start definition as Aesi). A game with no win by turn 12 counts as turn 13.
  diagMetrics: [
    ...winByTurnMetrics([8, 10, 12], win),
    {
      label: 'Slow tail: turn the 90th-percentile game wins',
      unit: 'turn' as const,
      measure: (rows: DiagRow[]) =>
        rows.map(win).sort((first, second) => first - second)[
          Math.floor(rows.length * 0.9)
        ],
    },
    // Pontus's slow start: less than 60% of the mana of one land per turn spent (15 by turn 5, 21 by turn 6)
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
      label: 'Average turn Meren comes down (games where she does)',
      unit: 'turn' as const,
      measure: (rows: DiagRow[]) =>
        averageOf(
          rows.filter((row) => row.merenOut !== null),
          (row) => turnOf(row, 'merenOut'),
        ),
    },
    {
      label: 'No Meren by end of turn 4, game still going (%)',
      unit: '%' as const,
      measure: (rows: DiagRow[]) =>
        percentOf(rows, (row) => turnOf(row, 'merenOut') > 4 && win(row) > 4),
    },
    {
      label: 'No Meren by end of turn 5, game still going (%)',
      unit: '%' as const,
      measure: (rows: DiagRow[]) =>
        percentOf(rows, (row) => turnOf(row, 'merenOut') > 5 && win(row) > 5),
    },
    {
      label: 'No Meren by end of turn 6, game still going (%)',
      unit: '%' as const,
      measure: (rows: DiagRow[]) =>
        percentOf(rows, (row) => turnOf(row, 'merenOut') > 6 && win(row) > 6),
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
      label: 'Nothing reanimated by end of turn 5, game still going (%)',
      unit: '%' as const,
      measure: (rows: DiagRow[]) =>
        percentOf(rows, (row) => win(row) > 5 && (row.reanim5 ?? 0) === 0),
    },
    {
      label: 'Nothing reanimated by end of turn 6, game still going (%)',
      unit: '%' as const,
      measure: (rows: DiagRow[]) =>
        percentOf(rows, (row) => win(row) > 6 && (row.reanim6 ?? 0) === 0),
    },
    {
      label: 'Average Meren experience at end of turn 5',
      unit: 'n' as const,
      measure: (rows: DiagRow[]) =>
        averageOf(
          rows.filter((row) => win(row) > 5),
          (row) => row.exp5 ?? 0,
        ),
    },
    {
      label: 'Average Meren experience at end of turn 6',
      unit: 'n' as const,
      measure: (rows: DiagRow[]) =>
        averageOf(
          rows.filter((row) => win(row) > 6),
          (row) => row.exp6 ?? 0,
        ),
    },
    {
      label:
        'No impact by turn 5: Meren not out, or nothing reanimated and under ' +
        ENGINE_EXPERIENCE +
        ' experience (%)',
      unit: '%' as const,
      measure: (rows: DiagRow[]) => percentOf(rows, (row) => noImpact(row, 5)),
    },
    {
      label: 'No impact by turn 6: the same (%)',
      unit: '%' as const,
      measure: (rows: DiagRow[]) => percentOf(rows, (row) => noImpact(row, 6)),
    },
    {
      label: 'Average cards in hand at end of turn 5',
      unit: 'n' as const,
      measure: (rows: DiagRow[]) =>
        averageOf(
          rows.filter((row) => win(row) > 5),
          (row) => row.hand5 ?? 0,
        ),
    },
    {
      label: 'Average cards in hand at end of turn 6',
      unit: 'n' as const,
      measure: (rows: DiagRow[]) =>
        averageOf(
          rows.filter((row) => win(row) > 6),
          (row) => row.hand6 ?? 0,
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
      label:
        'Out of cards: ' +
        OUT_OF_CARDS +
        ' or fewer in hand at end of turn 6, game still going (%)',
      unit: '%' as const,
      measure: (rows: DiagRow[]) =>
        percentOf(
          rows,
          (row) => win(row) > 6 && (row.hand6 ?? 0) <= OUT_OF_CARDS,
        ),
    },
    {
      label: 'Average cards drawn by end of turn 6 (draw steps included)',
      unit: 'n' as const,
      measure: (rows: DiagRow[]) =>
        averageOf(
          rows.filter((row) => win(row) > 6),
          (row) => row.drawn6 ?? 0,
        ),
    },
    {
      label:
        'Out of cards: ' +
        OUT_OF_CARDS +
        ' or fewer in hand at end of turn 8, game still going (%)',
      unit: '%' as const,
      measure: (rows: DiagRow[]) =>
        percentOf(
          rows,
          (row) => win(row) > 8 && (row.hand8 ?? 0) <= OUT_OF_CARDS,
        ),
    },
    {
      label: 'Average cards drawn by end of turn 8 (draw steps included)',
      unit: 'n' as const,
      measure: (rows: DiagRow[]) =>
        averageOf(
          rows.filter((row) => win(row) > 8),
          (row) => row.drawn8 ?? 0,
        ),
    },
    ...cardFlowMetrics,
    ...DRAW_CARDS.flatMap(drawMetricsOf),
    ...DISCARD_CARDS.map((name) => ({
      label: `${name}: net cards when played (drawn minus discarded)`,
      unit: 'n' as const,
      measure: (rows: DiagRow[]) => {
        const played = rows.filter((row) => row['net:' + name] != null);
        return played.length
          ? averageOf(played, (row) => row['net:' + name] ?? 0)
          : 0;
      },
    })),
  ],
  // --hands: what to look for in an opening hand
  handFeatures: [
    {
      label: 'a black source and a green source',
      matches: (cards: CardDef[]) =>
        cards.some((card) => landMakes(card, 'B')) &&
        cards.some((card) => landMakes(card, 'G')),
    },
    {
      label: 'a green source',
      matches: (cards: CardDef[]) => cards.some((card) => landMakes(card, 'G')),
    },
    {
      label: 'a ramp piece (Llanowar, Elder, Sol Ring, Dark Ritual, Solemn...)',
      matches: anyOf([
        'Llanowar Elves',
        'Sakura-Tribe Elder',
        'Sol Ring',
        'Dark Ritual',
        'Solemn Simulacrum',
        'Studious First-Year',
        'Simulacrum Shaper',
      ]),
    },
    {
      label:
        'a graveyard filler or tutor (Buried Alive, Fauna Shaman, Liliana, Wayfinder...)',
      matches: anyOf([
        'Buried Alive',
        'Fauna Shaman',
        'Grim Servant',
        "Dina's Guidance",
        'Eldritch Evolution',
        'Vile Entomber',
        'Liliana the Repentant',
        'Satyr Wayfinder',
        'Grisly Salvage',
        'Grist, the Hunger Tide',
      ]),
    },
    {
      label: 'a sacrifice outlet (Viscera Seer, Woe Strider, Zealot...)',
      matches: anyOf([
        'Viscera Seer',
        'Woe Strider',
        'Umbral Collar Zealot',
        'Wight of the Reliquary',
        'Plaguecrafter',
      ]),
    },
    {
      label: 'a payoff (Gray Merchant, Lotleth Giant, Diviner, Grave Titan...)',
      matches: anyOf([
        'Gray Merchant of Asphodel',
        'Lotleth Giant',
        'Twilight Diviner',
        'Grave Titan',
        'Rune-Scarred Demon',
        'Protean Hulk',
        'Avenger of the Fallen',
      ]),
    },
    {
      label: 'a card-draw engine (Arena, Priest, Disciple, Haruspex...)',
      matches: anyOf([
        'Phyrexian Arena',
        'Priest of Forgotten Gods',
        'Disciple of Bolas',
        'Grim Haruspex',
        'Morbid Opportunist',
        'Diresight',
      ]),
    },
    {
      label: '2 lands and a ramp piece',
      matches: (cards: CardDef[]) =>
        lands(cards) === 2 &&
        anyOf([
          'Llanowar Elves',
          'Sakura-Tribe Elder',
          'Sol Ring',
          'Dark Ritual',
          'Solemn Simulacrum',
          'Studious First-Year',
          'Simulacrum Shaper',
        ])(cards),
    },
  ],
};
