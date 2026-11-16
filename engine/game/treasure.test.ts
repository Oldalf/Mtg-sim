/**
 * Checks of Treasures and Eldrazi Spawn in the engine (GameCore.pay, SearchMana): a Treasure pays any colour, lands
 * are tapped before it, a committed payment sacrifices it (and the log says so), a tested payment keeps it, an
 * Eldrazi Spawn is spent last too, and a search spends Treasures last the same way.
 * Run: npm run pod -- --test
 */
import * as C from '../cards/cards';
import { ELDRAZI_SPAWN, TREASURE } from '../cards/tokens';
import { Rng } from '../util/rng';
import { Deck } from '../run/runner';
import { Permanent } from './game-types';
import { SearchMana } from './search-mana';

function newGame(allDecks: Record<string, Deck>, lands: string[]) {
  const deck = allDecks.goldfish;
  const game = new deck.Game(
    [],
    new Array(60).fill('Island'),
    new Rng(1),
    { ...deck.config },
    true,
  );
  for (const landName of lands) {
    const land = C.get(landName);
    game.putOntoBattlefield(new Permanent(land, land.land));
  }
  return game;
}

const countOf = (game: ReturnType<typeof newGame>, card: C.CardDef): number =>
  game.battlefield.filter((permanent) => permanent.card === card).length;

export function runTreasureTests(allDecks: Record<string, Deck>): boolean {
  const checks: [string, unknown, unknown][] = [];
  const check = (label: string, actual: unknown, expected: unknown) =>
    checks.push([label, actual, expected]);

  {
    const game = newGame(allDecks, ['Island']);
    game.createTokens(TREASURE);
    check(
      'a tested payment that needs the Treasure keeps it',
      [game.canPay(C.Cost.parse('{U}{B}')), countOf(game, TREASURE)],
      [true, 1],
    );
    check(
      'a Treasure pays the colour no land makes',
      game.pay(C.Cost.parse('{U}{B}')),
      true,
    );
    check(
      '... and is sacrificed by the committed payment',
      countOf(game, TREASURE),
      0,
    );
    check(
      'the log shows the sacrifice',
      game.log.some((event) => event.text === 'sacrifice Treasure'),
      true,
    );
  }

  {
    const game = newGame(allDecks, ['Island']);
    game.createTokens(TREASURE);
    game.pay(C.Cost.parse('{1}'));
    check(
      'lands are tapped before a Treasure',
      [game.battlefield[0].tapped, countOf(game, TREASURE)],
      [true, 1],
    );
    check(
      'an untapped Treasure still counts as a mana source',
      game.openMana(),
      1,
    );
  }

  {
    const game = newGame(allDecks, ['Swamp']);
    game.createTokens(ELDRAZI_SPAWN);
    game.pay(C.Cost.parse('{1}'));
    check('an Eldrazi Spawn is kept back too', countOf(game, ELDRAZI_SPAWN), 1);
    game.pay(C.Cost.parse('{1}'));
    check(
      '... and sacrificed when it is needed',
      countOf(game, ELDRAZI_SPAWN),
      0,
    );
  }

  {
    const game = newGame(allDecks, ['Island', 'Swamp']);
    game.createTokens(TREASURE);
    const mana = SearchMana.fromGame(game, false, false);
    check('a search counts the Treasure', mana.treasures, 1);
    mana.spendMana(C.Cost.parse('{1}'), false, false);
    check(
      'a search taps a land first',
      [mana.treasures, mana.payments[0].taps.map((tap) => tap.isLand)],
      [1, [true]],
    );
    mana.spendMana(C.Cost.parse('{U}{B}'), false, false);
    check(
      'a search spends the Treasure when the lands fall short',
      [mana.treasures, mana.payments[1].taps.map((tap) => tap.isLand)],
      [0, [true, false]],
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
    `${isGood ? 'OK ' : 'BAD'} Treasures and Eldrazi Spawn: ${wrong.length} wrong of ${checks.length}`,
  );
  for (const difference of wrong) console.log(`      ${difference}`);
  return isGood;
}
