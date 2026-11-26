/**
 * Checks of the card rules two or three decks used to code each (U1b step 3): Syr Konrad, Bontu's Monument,
 * Garruk's Uprising, Whip of Erebos, Explore, Growth Spiral, Buried Alive, Breach the Multiverse in a goldfish game,
 * Morbid Opportunist, Windfall, Jeska's Will and Meren's end step.
 * Run: npm run pod -- --test
 */
import * as C from '../cards/cards';
import { STOLEN_CREATURE } from '../cards/tokens';
import { Rng } from '../util/rng';
import { Deck } from '../run/runner';
import { Permanent } from '../game/game-types';
import { permanentSpellCastTriggers } from './card-rules';

function newGame(allDecks: Record<string, Deck>, library: string[] = []) {
  const deck = allDecks.goldfish;
  const game = new deck.Game(
    [],
    [...library, ...new Array(40).fill('Island')],
    new Rng(1),
    { ...deck.config },
    false,
  );
  game.mayHaveStaticEffects = true;
  return game;
}
type TestGame = ReturnType<typeof newGame>;

function putOnBattlefield(game: TestGame, cardName: string): Permanent {
  const card = C.get(cardName);
  const permanent = new Permanent(card, card.land, false);
  permanent.sick = false;
  game.putOntoBattlefield(permanent);
  return permanent;
}

/** The life each opponent has lost since the game began. */
const lifeLost = (game: TestGame, startingLife: number[]): number[] =>
  game.life.map((life, slot) => startingLife[slot] - life);

export function runMergedCardTests(allDecks: Record<string, Deck>): boolean {
  const checks: [string, unknown, unknown][] = [];
  const check = (label: string, actual: unknown, expected: unknown) =>
    checks.push([label, actual, expected]);

  {
    const game = newGame(allDecks);
    const konrad = putOnBattlefield(game, 'Syr Konrad, the Grim');
    const startingLife = game.life.slice();
    const milled = C.get('Llanowar Elves'); // (milled: from the library)
    game.toGraveyard(milled, true);
    check(
      'Syr Konrad: a creature card milled pings each opponent',
      lifeLost(game, startingLife),
      game.life.map(() => 1),
    );
    game.takeCard(milled, 'graveyard');
    game.putCard(milled, 'hand');
    check(
      'Syr Konrad: a creature card leaving our graveyard pings each opponent',
      lifeLost(game, startingLife),
      game.life.map(() => 2),
    );
    game.dies(putOnBattlefield(game, 'Llanowar Elves'));
    check(
      'Syr Konrad: another creature dying pings once (not again as its card goes to the graveyard)',
      lifeLost(game, startingLife),
      game.life.map(() => 3),
    );
    game.dies(konrad);
    check(
      'Syr Konrad: its own death pings nobody',
      lifeLost(game, startingLife),
      game.life.map(() => 3),
    );
  }
  {
    const game = newGame(allDecks);
    putOnBattlefield(game, "Bontu's Monument");
    const startingLife = game.life.slice();
    const lifeBefore = game.myLife;
    const blackCreature = C.get('Gray Merchant of Asphodel');
    check(
      "Bontu's Monument: a black creature spell costs {1} less",
      game.effectiveCost(blackCreature).manaValue,
      blackCreature.manaValue - 1,
    );
    permanentSpellCastTriggers(game, blackCreature, 5);
    check(
      "Bontu's Monument: each opponent loses 1 and we gain 1 (not what they lost in all)",
      [lifeLost(game, startingLife), game.myLife - lifeBefore],
      [game.life.map(() => 1), 1],
    );
  }
  {
    const game = newGame(allDecks);
    game.enter(C.get("Garruk's Uprising"));
    check(
      "Garruk's Uprising: no creature with power 4: no card as it enters",
      game.hand.length,
      0,
    );
    game.enter(C.get('Sheoldred, Whispering One'), 'graveyard');
    check(
      "Garruk's Uprising: a 6/6 enters: a card; our creatures have trample",
      [game.hand.length, game.ourCreaturesHave('trample')],
      [1, true],
    );
  }
  {
    const game = newGame(allDecks);
    putOnBattlefield(game, 'Whip of Erebos');
    check(
      'Whip of Erebos: our creatures have lifelink',
      game.ourCreaturesHave('lifelink'),
      true,
    );
  }
  {
    const game = newGame(allDecks, ['Forest']);
    game.draw(1);
    game.landPlayed = true;
    game.resolve(C.get('Explore'));
    check(
      'Explore: a card, and a land played at once (the turn s land drop was used)',
      game.landsOnBattlefield().length,
      1,
    );
  }
  {
    const game = newGame(allDecks, ['Forest']);
    game.draw(1);
    game.resolve(C.get('Growth Spiral'));
    check(
      'Growth Spiral: a card, and the land from hand onto the battlefield',
      [game.landsOnBattlefield().length, game.hand.length],
      [1, 1],
    );
  }
  {
    const game = newGame(allDecks, [
      'Llanowar Elves',
      'Morbid Opportunist',
      'Rune-Scarred Demon',
      'Gray Merchant of Asphodel',
    ]);
    game.resolve(C.get('Buried Alive'));
    check(
      'Buried Alive: three creature cards into the graveyard',
      game.graveyard.filter((card) => card.isCreature).length,
      3,
    );
  }
  {
    const game = newGame(allDecks);
    const librariesBefore = game.opponentLibrarySizes.slice();
    game.resolve(C.get('Breach the Multiverse'));
    check(
      'Breach the Multiverse (goldfish): we mill 10, each opponent mills 10 and gives a 5/5 stand-in',
      [
        game.graveyard.length,
        game.opponentLibrarySizes.map(
          (size, slot) => librariesBefore[slot] - size,
        ),
        game.battlefield.filter(
          (permanent) => permanent.card === STOLEN_CREATURE,
        ).length,
      ],
      [10, game.life.map(() => 10), game.countOpponentsAlive()],
    );
  }
  {
    const game = newGame(allDecks);
    putOnBattlefield(game, 'Morbid Opportunist');
    game.dies(putOnBattlefield(game, 'Llanowar Elves'));
    game.dies(putOnBattlefield(game, 'Llanowar Elves'));
    check(
      'Morbid Opportunist: two creatures die, one card (once each turn)',
      game.hand.length,
      1,
    );
  }
  {
    const game = newGame(allDecks);
    game.draw(3);
    game.resolve(C.get('Windfall'));
    check(
      "Windfall (goldfish): we draw a goldfish opponent's hand of 7",
      [game.hand.length, game.graveyard.length],
      [7, 3],
    );
  }
  {
    const game = newGame(allDecks);
    game.resolve(C.get("Jeska's Will"));
    check(
      "Jeska's Will without a commander: {R} for each card in the fullest hand, no cards exiled",
      [game.pool.R, game.hand.length],
      [7, 0],
    );
  }
  {
    const game = newGame(allDecks);
    putOnBattlefield(game, 'Meren of Clan Nel Toth');
    game.gainExperience();
    game.gainExperience();
    game.toGraveyard(C.get('Rune-Scarred Demon'));
    game.endStep();
    check(
      "Meren's end step: the best creature card comes back to hand (its mana value is above our experience)",
      game.hand.map((card) => card.name),
      ['Rune-Scarred Demon'],
    );
  }

  const wrong = checks
    .map(([label, actual, expected]): [string, string, string] => [
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
    `${isGood ? 'OK ' : 'BAD'} merged card rules: ${wrong.length} wrong of ${checks.length}`,
  );
  for (const difference of wrong) console.log(`      ${difference}`);
  return isGood;
}
