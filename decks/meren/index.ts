/** Meren of Clan Nel Toth: Golgari reanimator (bracket 2-3). Wins with Gray Merchant / Lotleth Giant drains and combat. */
import * as path from 'path';
import { ROOT } from '../../engine/cards';
import { CFG } from './config';
import { MerenGame } from './game';
import { landMakes, DiagRow } from '../../engine/runner';
import { CardDef } from '../../engine/cards';

const anyOf = (names: string[]) => {
  const set = new Set(names);
  return (hand: CardDef[]) => hand.some((c) => set.has(c.name));
};
const lands = (hand: CardDef[]) =>
  hand.filter((c) => c.land !== null || c.mdfcLand !== null).length;

const pct = (rows: DiagRow[], f: (r: DiagRow) => boolean) =>
  (100 * rows.filter(f).length) / rows.length;
const meanOf = (rows: DiagRow[], f: (r: DiagRow) => number) =>
  rows.reduce((s, r) => s + f(r), 0) / rows.length;
/** A turn the game never reached counts as turn 13 (the horizon is turn 12). */
const turnOf = (r: DiagRow, key: string) => (r[key] ?? 13) as number;
const win = (r: DiagRow) => turnOf(r, 'win');
// "No meaningful impact" (a first definition, change it here): by the end of turn 5 / 6 nothing has come back from a
// graveyard (Meren's end step, Unearth, Reanimate...) and the board has fewer than THIN nonland permanents.
const THIN = 3;
const noImpact = (r: DiagRow, t: 5 | 6) =>
  win(r) > t && (r['reanim' + t] ?? 0) === 0 && (r['perms' + t] ?? 0) < THIN;
const slow5 = (r: DiagRow) => win(r) > 5 && (r.spent5 ?? 0) < 9;
const slow6 = (r: DiagRow) => win(r) > 6 && (r.spent6 ?? 0) < 13;

export const deck = {
  name: 'meren',
  dir: path.join(ROOT, 'decks', 'meren'),
  defaultList: 'decklist.txt',
  cfg: CFG,
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
      label: 'Win by turn 12 (%)',
      unit: '%' as const,
      f: (rows: DiagRow[]) => pct(rows, (r) => win(r) <= 12),
    },
    {
      label: 'Slow tail: turn the 90th-percentile game wins',
      unit: 'turn' as const,
      f: (rows: DiagRow[]) =>
        rows.map(win).sort((a, b) => a - b)[Math.floor(rows.length * 0.9)],
    },
    // Pontus's slow start: less than 60% of the mana of one land per turn spent (15 by turn 5, 21 by turn 6)
    {
      label: 'Slow start: under 9 mana spent by turn 5 (%)',
      unit: '%' as const,
      f: (rows: DiagRow[]) => pct(rows, slow5),
    },
    {
      label: 'Slow start: under 13 mana spent by turn 6 (%)',
      unit: '%' as const,
      f: (rows: DiagRow[]) => pct(rows, slow6),
    },
    {
      label: 'Slow start either way (%)',
      unit: '%' as const,
      f: (rows: DiagRow[]) => pct(rows, (r) => slow5(r) || slow6(r)),
    },
    {
      label: 'Average mana spent by turn 5 (of 15)',
      unit: 'n' as const,
      f: (rows: DiagRow[]) =>
        meanOf(
          rows.filter((r) => win(r) > 5),
          (r) => r.spent5 ?? 0,
        ),
    },
    {
      label: 'Average mana spent by turn 6 (of 21)',
      unit: 'n' as const,
      f: (rows: DiagRow[]) =>
        meanOf(
          rows.filter((r) => win(r) > 6),
          (r) => r.spent6 ?? 0,
        ),
    },
    {
      label: 'Average turn Meren comes down (games where she does)',
      unit: 'turn' as const,
      f: (rows: DiagRow[]) =>
        meanOf(
          rows.filter((r) => r.merenOut !== null),
          (r) => turnOf(r, 'merenOut'),
        ),
    },
    {
      label: 'No Meren by end of turn 4, game still going (%)',
      unit: '%' as const,
      f: (rows: DiagRow[]) =>
        pct(rows, (r) => turnOf(r, 'merenOut') > 4 && win(r) > 4),
    },
    {
      label: 'No Meren by end of turn 5, game still going (%)',
      unit: '%' as const,
      f: (rows: DiagRow[]) =>
        pct(rows, (r) => turnOf(r, 'merenOut') > 5 && win(r) > 5),
    },
    {
      label: 'No Meren by end of turn 6, game still going (%)',
      unit: '%' as const,
      f: (rows: DiagRow[]) =>
        pct(rows, (r) => turnOf(r, 'merenOut') > 6 && win(r) > 6),
    },
    {
      label:
        'Thin board: under ' +
        THIN +
        ' nonland permanents at end of turn 5 (%)',
      unit: '%' as const,
      f: (rows: DiagRow[]) =>
        pct(rows, (r) => win(r) > 5 && (r.perms5 ?? 0) < THIN),
    },
    {
      label: 'Nothing reanimated by end of turn 5, game still going (%)',
      unit: '%' as const,
      f: (rows: DiagRow[]) =>
        pct(rows, (r) => win(r) > 5 && (r.reanim5 ?? 0) === 0),
    },
    {
      label: 'Nothing reanimated by end of turn 6, game still going (%)',
      unit: '%' as const,
      f: (rows: DiagRow[]) =>
        pct(rows, (r) => win(r) > 6 && (r.reanim6 ?? 0) === 0),
    },
    {
      label: 'Average Meren experience at end of turn 5',
      unit: 'n' as const,
      f: (rows: DiagRow[]) =>
        meanOf(
          rows.filter((r) => win(r) > 5),
          (r) => r.exp5 ?? 0,
        ),
    },
    {
      label: 'Average Meren experience at end of turn 6',
      unit: 'n' as const,
      f: (rows: DiagRow[]) =>
        meanOf(
          rows.filter((r) => win(r) > 6),
          (r) => r.exp6 ?? 0,
        ),
    },
    {
      label: 'No impact by turn 5: nothing reanimated and a thin board (%)',
      unit: '%' as const,
      f: (rows: DiagRow[]) => pct(rows, (r) => noImpact(r, 5)),
    },
    {
      label: 'No impact by turn 6: the same (%)',
      unit: '%' as const,
      f: (rows: DiagRow[]) => pct(rows, (r) => noImpact(r, 6)),
    },
  ],
  // --hands: what to look for in an opening hand
  handFeatures: [
    {
      label: 'a black source and a green source',
      f: (h: CardDef[]) =>
        h.some((c) => landMakes(c, 'B')) && h.some((c) => landMakes(c, 'G')),
    },
    {
      label: 'a green source',
      f: (h: CardDef[]) => h.some((c) => landMakes(c, 'G')),
    },
    {
      label: 'a ramp piece (Llanowar, Elder, Sol Ring, Dark Ritual, Solemn...)',
      f: anyOf([
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
      f: anyOf([
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
      f: anyOf([
        'Viscera Seer',
        'Woe Strider',
        'Umbral Collar Zealot',
        'Wight of the Reliquary',
        'Plaguecrafter',
      ]),
    },
    {
      label: 'a payoff (Gray Merchant, Lotleth Giant, Diviner, Grave Titan...)',
      f: anyOf([
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
      f: anyOf([
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
      f: (h: CardDef[]) =>
        lands(h) === 2 &&
        anyOf([
          'Llanowar Elves',
          'Sakura-Tribe Elder',
          'Sol Ring',
          'Dark Ritual',
          'Solemn Simulacrum',
          'Studious First-Year',
          'Simulacrum Shaper',
        ])(h),
    },
  ],
};
