/** Gale, Waterdeep Prodigy + Scion of Halaster: Dimir spellslinger combo. */
import * as path from 'path';
import { ROOT, landMakes, CardDef } from '../../engine/cards';
import { CFG } from './config';
import { GaleGame } from './game';

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
  // counters and real removal do nothing against goldfish opponents (also when listed outside "Counters")
  rankProtect: {
    sections: ['counters'],
    cards: ['Spell Pierce', 'Muddle the Mixture', 'Rewind', 'Extended Absence'],
  },
  config: CFG,
  Game: GaleGame,
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
