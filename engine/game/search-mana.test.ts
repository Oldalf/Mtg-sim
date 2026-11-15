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
