/**
 * Checks of the mana a search works with (search-mana.ts): sources stay untapped until a payment needs them, so High
 * Tide counts only the Islands still untapped, an untap puts tapped lands back, a filter Signet needs a mana fed to
 * it, and what was tapped is recorded for the real game to repeat. Run: npm run pod -- --test
 */
import { Cost } from '../cards/cards';
import { LandClass, SearchMana, UNTAP } from './search-mana';

const ISLAND: LandClass = {
  kind: 'U',
  isIsland: true,
  isSwamp: false,
  isLand: true,
};
const SWAMP: LandClass = {
  kind: 'B',
  isIsland: false,
  isSwamp: true,
  isLand: true,
};
const DIMIR_SIGNET: LandClass = {
  kind: 'F',
  isIsland: false,
  isSwamp: false,
  isLand: false,
};

const FILTER_LAND: LandClass = { ...DIMIR_SIGNET, isLand: true };
const ANY_COLOUR_LAND: LandClass = {
  kind: 'A',
  isIsland: false,
  isSwamp: false,
  isLand: true,
};

function manaOf(...sources: LandClass[]): SearchMana {
  const mana = new SearchMana();
  for (const source of sources) mana.addLand(source);
  return mana;
}

const pay = (mana: SearchMana, cost: Cost) =>
  mana.spendMana(cost, false, false);

export function runSearchManaTests(): boolean {
  const checks: [string, unknown, unknown][] = [];
  const check = (label: string, actual: unknown, expected: unknown) =>
    checks.push([label, actual, expected]);

  {
    // High Tide resolved with 2 Islands untapped: each makes {U}{U}
    const mana = manaOf(ISLAND, ISLAND);
    mana.highTides = 1;
    check('High Tide: 2 Islands pay {3}{U}', pay(mana, new Cost(3, 1)), true);
    const tooMuch = manaOf(ISLAND, ISLAND);
    tooMuch.highTides = 1;
    check(
      'High Tide: 2 Islands cannot pay 5',
      pay(tooMuch, new Cost(4, 1)),
      false,
    );
  }
  {
    // an Island tapped before High Tide resolves gets no bonus, the one left does
    const mana = manaOf(ISLAND, ISLAND);
    pay(mana, new Cost(0, 1));
    mana.highTides = 1;
    check(
      'High Tide: one Island left pays {U}{U}',
      pay(mana, new Cost(0, 2)),
      true,
    );
    const again = manaOf(ISLAND, ISLAND);
    pay(again, new Cost(0, 1));
    again.highTides = 1;
    check(
      'High Tide: one Island left cannot pay 3',
      pay(again, new Cost(2, 1)),
      false,
    );
  }
  {
    // Muck counts Swamps only
    const mana = manaOf(ISLAND, SWAMP);
    mana.bubblingMucks = 1;
    check('Muck: the Swamp pays {B}{B}', pay(mana, new Cost(0, 0, 2)), true);
  }
  {
    // an untap puts the tapped lands back
    const mana = manaOf(ISLAND, ISLAND);
    pay(mana, new Cost(1, 1));
    check('both Islands tapped', pay(mana, new Cost(0, 1)), false);
    mana.untapLands(Infinity);
    check('after the untap they pay again', pay(mana, new Cost(1, 1)), true);
    check(
      'the untap is recorded',
      mana.payments.filter((payment) => payment.cost === UNTAP).length,
      1,
    );
  }
  {
    // a filter Signet needs a mana fed to it: it turns one into {U}{B}
    const withIsland = manaOf(ISLAND, ISLAND, DIMIR_SIGNET);
    check(
      '2 Islands + Signet pay {U}{B}',
      pay(withIsland, new Cost(0, 1, 1)),
      true,
    );
    const alone = manaOf(DIMIR_SIGNET);
    check('a Signet alone pays nothing', pay(alone, new Cost(0, 1)), false);
  }
  {
    // what was tapped is recorded, in order, for the real game
    const mana = manaOf(ISLAND, SWAMP);
    pay(mana, new Cost(0, 1));
    pay(mana, new Cost(0, 0, 1));
    check(
      'the payments are recorded',
      mana.payments.map((payment) => [
        payment.cost,
        payment.taps.map((tap) => tap.kind),
      ]),
      [
        ['{0}U', ['U']],
        ['{0}B', ['B']],
      ],
    );
  }
  {
    // Curious Homunculus's mana is in the pool from the start; a payment that spends it records a tap of it, so the
    // real game taps the Homunculus for the instant and keeps the Island for what follows (Gale proposed.txt seed 332)
    const mana = manaOf(ISLAND, ISLAND);
    mana.pool.S = 1;
    mana.spendMana(new Cost(1, 1), true, false);
    check(
      'Homunculus mana spent on an instant is recorded as a tap',
      mana.payments[0].taps.map((tap) => tap.kind),
      ['S', 'U'],
    );
  }
  {
    // a filter land's {1} is an ability: Homunculus's mana can't feed it (Gale proposed.txt seed 1847: Swamp,
    // Darkwater Catacombs, 2 Islands and a Homunculus make 4 for Syr Konrad, not 5)
    const mana = manaOf(SWAMP, FILTER_LAND, ISLAND, ISLAND);
    mana.pool.S = 1;
    check(
      'instant-only mana does not feed a filter land',
      pay(mana, new Cost(3, 0, 2)),
      false,
    );
  }
  {
    // Rain of Filth taps every land, then sacrifices it for {B}: a filter land must be fed (Gale speed.txt seed 874)
    const mana = manaOf(SWAMP, FILTER_LAND);
    mana.sacrificeAllLands();
    check('Rain of Filth: Swamp + filter land make 4', mana.pool, {
      U: 1,
      B: 3,
      A: 0,
      C: 0,
      S: 0,
    });
    const alone = manaOf(FILTER_LAND);
    alone.sacrificeAllLands();
    check('Rain of Filth: a filter land alone is only sacrificed', alone.pool, {
      U: 0,
      B: 1,
      A: 0,
      C: 0,
      S: 0,
    });
    check(
      'Rain of Filth: the sacrificed filter land cannot be tapped later',
      alone.spendMana(new Cost(0, 1), false, false),
      false,
    );
  }
  {
    // the colour a flexible source made is recorded, so the game makes the same (Gale proposed.txt seed 856)
    const mana = manaOf(ANY_COLOUR_LAND, ISLAND);
    pay(mana, new Cost(0, 1, 1));
    check(
      'the colours flexible sources made are recorded',
      mana.payments[0].colours,
      ['', 'B'],
    );
  }
  {
    // Energybending: an Island taps for {B} too
    const mana = manaOf(ISLAND);
    mana.isEnergybent = true;
    check(
      'Energybending: an Island pays {B}',
      pay(mana, new Cost(0, 0, 1)),
      true,
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
    `${isGood ? 'OK ' : 'BAD'} the mana of a search: ${wrong.length} wrong of ${checks.length}`,
  );
  for (const difference of wrong) console.log(`      ${difference}`);
  return isGood;
}
