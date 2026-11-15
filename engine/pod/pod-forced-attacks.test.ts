/**
 * Checks of forced attacks and goad in pod combat, on hand-built tables: a goaded creature avoids the player who
 * goaded it, attacks that player when no one else is left, and a creature that must attack (Thantis, its own text)
 * attacks even when the deck's own rule would keep it home. Run: npm run pod -- --test
 */
import * as C from '../cards/cards';
import { Game } from '../game/game';
import { Permanent } from '../game/game-types';
import { Deck } from '../run/runner';
import { podSpec, seatPlayers } from './pod';
import { PodTable } from './pod-table';

const MIKE = 0;
const MEREN = 1;
const GALE = 2;
const AESI = 3;

/** Thantis's card, as in Scryfall's data (its list isn't in data/cards.json yet). */
const THANTIS = new C.CardDef('Thantis, the Warweaver', {
  mana_cost: '{3}{B}{R}{G}',
  type_line: 'Legendary Creature — Spider',
  oracle:
    'Reach, vigilance\nAll creatures attack each combat if able.\nWhenever a creature attacks you or a planeswalker you control, put a +1/+1 counter on Thantis.',
  power: '1',
  toughness: '5',
  keywords: ['Reach', 'Vigilance'],
});

/** Puts a card onto a player's battlefield, ready to attack. */
function putOnBattlefield(
  game: Game<unknown>,
  card: C.CardDef | string,
): Permanent {
  const permanent = new Permanent(
    typeof card === 'string' ? C.get(card) : card,
  );
  permanent.sick = false;
  game.putOntoBattlefield(permanent);
  return permanent;
}

/** A table with Meren to act: Mike is at 2 life and the biggest threat, so Meren would rather attack Mike. */
function newTable(allDecks: Record<string, Deck>): PodTable {
  const spec = podSpec(allDecks, ['mike', 'meren', 'gale', 'aesi'], 17, {
    pod_answers: false,
  });
  const table = seatPlayers(allDecks, spec, 1, false);
  table.games[MIKE].myLife = 2;
  table.threats[MIKE] = 100;
  table.startTurnLog(MEREN);
  table.refreshView(MEREN);
  return table;
}

export function runForcedAttackTests(allDecks: Record<string, Deck>): boolean {
  const checks: [string, unknown, unknown][] = [];
  const check = (label: string, actual: unknown, expected: unknown) =>
    checks.push([label, actual, expected]);

  check(
    "Ulamog's Crusher attacks each combat (its own text)",
    C.attacksEachCombat(C.get("Ulamog's Crusher")),
    true,
  );
  check(
    'Eternal Witness does not have to attack',
    C.attacksEachCombat(C.get('Eternal Witness')),
    false,
  );
  check(
    'Thantis makes all creatures attack',
    C.makesAllCreaturesAttack(THANTIS),
    true,
  );
  check(
    'Thantis itself is not "attacks each combat" by its own text',
    C.attacksEachCombat(THANTIS),
    false,
  );

  {
    // without goad Meren attacks Mike, who is at 2 life
    const table = newTable(allDecks);
    const meren = table.games[MEREN];
    const mikeSlot = table.opponentsOf[MEREN].indexOf(MIKE);
    meren.arenaCombat([putOnBattlefield(meren, 'Eternal Witness')]);
    check('not goaded: Meren attacks Mike', meren.life[mikeSlot], 0);
  }

  {
    const table = newTable(allDecks);
    const meren = table.games[MEREN];
    const mikeSlot = table.opponentsOf[MEREN].indexOf(MIKE);
    const witness = putOnBattlefield(meren, 'Eternal Witness');
    table.goad(MIKE, witness);
    const otherLifeBefore = meren.life.reduce((sum, life) => sum + life, 0);
    meren.arenaCombat([witness]);
    check('goaded by Mike: Mike is not attacked', meren.life[mikeSlot], 2);
    check(
      'goaded by Mike: another player takes the 2 damage',
      otherLifeBefore - meren.life.reduce((sum, life) => sum + life, 0),
      2,
    );
    table.prepareTurn(MIKE);
    check("the goad ends at Mike's next turn", table.goaders.size, 0);
  }

  {
    const table = newTable(allDecks);
    table.eliminate(GALE, 'test');
    table.eliminate(AESI, 'test');
    table.refreshView(MEREN);
    const meren = table.games[MEREN];
    const mikeSlot = table.opponentsOf[MEREN].indexOf(MIKE);
    const witness = putOnBattlefield(meren, 'Eternal Witness');
    table.goad(MIKE, witness);
    meren.arenaCombat([witness]);
    check(
      'goaded with only Mike left: Mike is attacked',
      meren.life[mikeSlot],
      0,
    );
  }

  // every opponent has a Grave Titan: Eternal Witness would die for nothing, so Meren's rule keeps it home
  const tableWithTitans = (withThantis: boolean) => {
    const table = newTable(allDecks);
    for (const other of [MIKE, GALE, AESI])
      putOnBattlefield(table.games[other], 'Grave Titan');
    if (withThantis) putOnBattlefield(table.games[GALE], THANTIS);
    return table;
  };
  {
    const meren = tableWithTitans(false).games[MEREN];
    const witness = putOnBattlefield(meren, 'Eternal Witness');
    meren.arenaCombat([witness]);
    check(
      'no Thantis: Eternal Witness stays home',
      meren.attackersThisTurn.has(witness),
      false,
    );
  }
  {
    const meren = tableWithTitans(true).games[MEREN];
    const witness = putOnBattlefield(meren, 'Eternal Witness');
    meren.arenaCombat([witness]);
    check(
      "Thantis on Gale's battlefield: Eternal Witness attacks",
      meren.attackersThisTurn.has(witness),
      true,
    );
  }
  {
    // the deck's own combat didn't send it: it attacks after the deck's combat
    const meren = tableWithTitans(true).games[MEREN];
    const witness = putOnBattlefield(meren, 'Eternal Witness');
    meren.attackWithForcedCreatures();
    check(
      'a forced creature the deck left home attacks after combat',
      [witness.tapped, meren.battlefield.includes(witness)],
      [true, false],
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
    `${isGood ? 'OK ' : 'BAD'} forced attacks and goad: ${wrong.length} wrong of ${checks.length}`,
  );
  for (const difference of wrong) console.log(`      ${difference}`);
  return isGood;
}
