/**
 * Checks of the triggers on another player's spell, on a hand-built table: Taurean Mauler grows on each spell an
 * opponent casts (not on its own controller's), Rhystic Study draws unless the caster pays {1}, and a spell an
 * opponent of a player with neither card casts changes nothing. Run: npm run pod -- --test
 */
import * as C from '../cards/cards';
import { Game } from '../game/game';
import { Permanent } from '../game/game-types';
import { Deck } from '../run/runner';
import type { MerenGame } from '../../decks/meren/game';
import { castSawInHalf } from '../../decks/meren/actions';
import { podSpec, seatPlayers } from './pod';
import { PodTable } from './pod-table';

const MEREN = 1;
const GALE = 2;

/** The cards as in Scryfall's data (Thantis's and Azula's lists aren't in data/cards.json yet). */
const TAUREAN_MAULER = new C.CardDef('Taurean Mauler', {
  mana_cost: '{2}{R}',
  type_line: 'Creature — Shapeshifter',
  oracle:
    'Changeling\nWhenever an opponent casts a spell, you may put a +1/+1 counter on this creature.',
  power: '2',
  toughness: '2',
  keywords: ['Changeling'],
});
const RURIC_THAR = new C.CardDef('Ruric Thar, the Unbowed', {
  mana_cost: '{4}{R}{G}',
  type_line: 'Legendary Creature — Ogre Warrior',
  oracle:
    'Reach, vigilance\nRuric Thar attacks each combat if able.\nWhenever a player casts a noncreature spell, Ruric Thar deals 6 damage to that player.',
  power: '6',
  toughness: '6',
  keywords: ['Reach', 'Vigilance'],
});
const RHYSTIC_STUDY = new C.CardDef('Rhystic Study', {
  mana_cost: '{2}{U}',
  type_line: 'Enchantment',
  oracle:
    'Whenever an opponent casts a spell, you may draw a card unless that player pays {1}.',
});

function putOnBattlefield(game: Game<unknown>, card: C.CardDef | string) {
  const cardDef = typeof card === 'string' ? C.get(card) : card;
  const permanent = new Permanent(cardDef, cardDef.land);
  permanent.sick = false;
  game.putOntoBattlefield(permanent);
  return permanent;
}

/** A table with Meren to act. */
function newTable(allDecks: Record<string, Deck>): PodTable {
  const spec = podSpec(allDecks, ['mike', 'meren', 'gale', 'aesi'], 17, {
    pod_answers: false,
  });
  const table = seatPlayers(allDecks, spec, 1, false);
  table.startTurnLog(MEREN);
  table.refreshView(MEREN);
  return table;
}

export function runOpponentCastTests(allDecks: Record<string, Deck>): boolean {
  const checks: [string, unknown, unknown][] = [];
  const check = (label: string, actual: unknown, expected: unknown) =>
    checks.push([label, actual, expected]);
  const spell = C.get('Eternal Witness');

  {
    const table = newTable(allDecks);
    const mauler = putOnBattlefield(table.games[GALE], TAUREAN_MAULER);
    const ownMauler = putOnBattlefield(table.games[MEREN], TAUREAN_MAULER);
    table.games[MEREN].podAnnounceCast(spell);
    table.games[MEREN].podAnnounceCast(spell);
    check("Mauler grows on an opponent's spells", mauler.counters, 2);
    check("Mauler ignores its controller's own spells", ownMauler.counters, 0);
    table.games[GALE].podAnnounceCast(spell);
    check("Gale's own spell: his Mauler stays", mauler.counters, 2);
    check("Gale's spell grows Meren's Mauler", ownMauler.counters, 1);
  }
  {
    const table = newTable(allDecks);
    const meren = table.games[MEREN];
    const gale = table.games[GALE];
    putOnBattlefield(gale, RHYSTIC_STUDY);
    const handBefore = gale.hand.length;
    meren.podAnnounceCast(spell);
    check(
      'Rhystic Study: caster has no mana left, we draw',
      gale.hand.length,
      handBefore + 1,
    );
    const forest = putOnBattlefield(meren, 'Forest');
    meren.podAnnounceCast(spell);
    check(
      'Rhystic Study: the caster pays {1}, no draw',
      gale.hand.length,
      handBefore + 1,
    );
    check('the caster tapped its land to pay', forest.tapped, true);
  }
  {
    const table = newTable(allDecks);
    putOnBattlefield(table.games[GALE], RURIC_THAR);
    const lifeBefore = table.games[MEREN].myLife;
    table.games[MEREN].podAnnounceCast(spell);
    check(
      'Ruric Thar: a creature spell costs its caster nothing',
      table.games[MEREN].myLife,
      lifeBefore,
    );
    table.games[MEREN].podAnnounceCast(C.get('Sol Ring'));
    check(
      'Ruric Thar: a noncreature spell costs its caster 6 life',
      table.games[MEREN].myLife,
      lifeBefore - 6,
    );
  }
  {
    // a creature dying is told to every other living player (Syr Konrad, Sangromancer)
    const table = newTable(allDecks);
    const told: number[] = [];
    table.games.forEach((game, player) => {
      game.onOtherPlayersCreatureDies = () => told.push(player);
    });
    const creature = putOnBattlefield(table.games[GALE], spell);
    table.games[GALE].dies(creature);
    check(
      "a creature of Gale's dies: the other three players hear it",
      told.sort(),
      [0, 1, 3].sort(),
    );
  }
  {
    // a spell a deck casts through its own code announces itself too (Meren's Saw in Half)
    const table = newTable(allDecks);
    const mauler = putOnBattlefield(table.games[GALE], TAUREAN_MAULER);
    const meren = table.games[MEREN] as unknown as MerenGame;
    const sawInHalf = C.get('Saw in Half');
    meren.hand.push(sawInHalf);
    const target = putOnBattlefield(meren, 'Eternal Witness');
    meren.pool.B = 3;
    meren.pool.G = 3;
    const wasCast = castSawInHalf(meren, sawInHalf, target);
    check('Saw in Half was cast', wasCast, true);
    check('Saw in Half grows the Mauler', mauler.counters, 1);
  }
  {
    const table = newTable(allDecks);
    const handsBefore = table.games.map((game) => game.hand.length);
    table.games[MEREN].podAnnounceCast(spell);
    check(
      'no such cards on the table: nothing changes',
      table.games.map((game) => game.hand.length),
      handsBefore,
    );
  }

  const wrong = checks
    .map(([label, actual, expected]) => [
      label,
      JSON.stringify(actual),
      JSON.stringify(expected),
    ])
    .filter(([, actual, expected]) => actual !== expected)
    .map(
      ([label, actual, expected]) =>
        `${label}: ${actual}, expected ${expected}`,
    );
  const isGood = wrong.length === 0;
  console.log(
    `${isGood ? 'OK ' : 'BAD'} triggers on an opponent's spell: ${wrong.length} wrong of ${checks.length}`,
  );
  for (const difference of wrong) console.log(`      ${difference}`);
  return isGood;
}
