/** Gale, Waterdeep Prodigy + Scion of Halaster: Dimir spellslinger combo. */
import * as path from 'path';
import { ROOT, landMakes, CardDef } from '../../engine/cards';
import { CFG } from './config';
import { GaleGame } from './game';

const anyOf = (names: string[]) => {
  const set = new Set(names);
  return (hand: CardDef[]) => hand.some((c) => set.has(c.name));
};
const lands = (hand: CardDef[]) =>
  hand.filter((c) => c.land !== null || c.mdfcLand !== null).length;

export const deck = {
  name: 'gale',
  dir: path.join(ROOT, 'decks', 'gale'),
  defaultList: 'decklist.txt',
  // counters and real removal do nothing against goldfish opponents (also when listed outside "Counters")
  rankProtect: {
    sections: ['counters'],
    cards: ['Spell Pierce', 'Muddle the Mixture', 'Rewind', 'Extended Absence'],
  },
  cfg: CFG,
  Game: GaleGame,
  // --hands: what to look for in an opening hand
  handFeatures: [
    {
      label: 'a blue source and a black source',
      f: (h: CardDef[]) =>
        h.some((c) => landMakes(c, 'U')) && h.some((c) => landMakes(c, 'B')),
    },
    {
      label:
        'a mana rock (Sol Ring, Signet, Talisman, Fellwar Stone, Waterskin)',
      f: anyOf([
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
      f: anyOf([
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
      f: anyOf([
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
      f: anyOf([
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
      f: anyOf([
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
      f: anyOf([
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
      f: (h: CardDef[]) =>
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
        ])(h),
    },
    {
      label: '2 lands and a rock, reducer or cantrip',
      f: (h: CardDef[]) =>
        lands(h) === 2 &&
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
        ])(h),
    },
  ],
};
