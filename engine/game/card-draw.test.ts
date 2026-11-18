/**
 * Checks of the card-draw cards in engine/game/card-draw.ts: the sacrifice spells, Midnight Reaper, Moldervine
 * Reclamation, Corpse Augur, Tireless Tracker and its Clues, Skullclamp, Greater Good, Ayara, Elvish Visionary, and
 * Night's Whisper's life.
 * Run: npm run pod -- --test
 */
import * as C from '../cards/cards';
import { CLUE, TREASURE } from '../cards/tokens';
import { Rng } from '../util/rng';
import { Deck } from '../run/runner';
import {
  AYARA,
  CORPSE_AUGUR,
  GREATER_GOOD,
  MIDNIGHT_REAPER,
  MOLDERVINE_RECLAMATION,
  TIRELESS_TRACKER,
  castSacrificeDrawSpell,
  clampCreature,
  crackClue,
  sacrificeToAyara,
  sacrificeToGreaterGood,
} from './card-draw';
import { triggersOfCreatureEntering } from './creature-enter-triggers';
import { Permanent } from './game-types';

function newGame(allDecks: Record<string, Deck>) {
  const deck = allDecks.goldfish;
  return new deck.Game(
    [],
    new Array(60).fill('Island'),
    new Rng(1),
    { ...deck.config },
    false,
  );
}
type TestGame = ReturnType<typeof newGame>;

function putOnBattlefield(game: TestGame, cardName: string): Permanent {
  const card = C.get(cardName);
  const permanent = new Permanent(card, card.land);
  permanent.sick = false;
  game.putOntoBattlefield(permanent);
  return permanent;
}
const putLands = (game: TestGame, count: number) => {
  for (let i = 0; i < count; i++) putOnBattlefield(game, 'Swamp');
};
const countOnBattlefield = (game: TestGame, card: C.CardDef) =>
  game.battlefield.filter((permanent) => permanent.card === card).length;

export function runCardDrawTests(allDecks: Record<string, Deck>): boolean {
  const checks: [string, unknown, unknown][] = [];
  const check = (label: string, actual: unknown, expected: unknown) =>
    checks.push([label, actual, expected]);

  {
    const game = newGame(allDecks);
    putLands(game, 2);
    const dispute = C.get('Deadly Dispute');
    game.putCard(dispute, 'hand');
    const bear = game.enter(C.get('Llanowar Elves'));
    const isCast = castSacrificeDrawSpell(game, dispute, [bear]);
    check(
      'Deadly Dispute: sacrifice a creature, draw two, make a Treasure',
      [
        isCast,
        game.hand.length,
        countOnBattlefield(game, TREASURE),
        game.battlefield.includes(bear),
      ],
      [true, 2, 1, false],
    );
  }
  {
    const game = newGame(allDecks);
    putLands(game, 2);
    const plunder = C.get('Costly Plunder');
    game.putCard(plunder, 'hand');
    game.createTokens(TREASURE);
    const [treasure] = game.battlefield.filter(
      (permanent) => permanent.card === TREASURE,
    );
    const isCast = castSacrificeDrawSpell(game, plunder, [treasure]);
    check(
      'Costly Plunder: sacrifice an artifact (a Treasure), draw two, no new Treasure',
      [isCast, game.hand.length, countOnBattlefield(game, TREASURE)],
      [true, 2, 0],
    );
  }
  {
    const game = newGame(allDecks);
    putLands(game, 2);
    const plumb = C.get('Plumb the Forbidden');
    game.putCard(plumb, 'hand');
    const bears = [1, 2, 3].map(() => game.enter(C.get('Llanowar Elves')));
    const isCast = castSacrificeDrawSpell(game, plumb, bears);
    check(
      'Plumb the Forbidden: three creatures sacrificed draw four cards and lose four life',
      [isCast, game.hand.length, game.myLife],
      [true, 4, 36],
    );
  }
  {
    const game = newGame(allDecks);
    const dispute = C.get('Deadly Dispute');
    game.putCard(dispute, 'hand');
    const bear = game.enter(C.get('Llanowar Elves'));
    check(
      'Deadly Dispute with no mana to cast it: nothing is sacrificed',
      [
        castSacrificeDrawSpell(game, dispute, [bear]),
        game.battlefield.includes(bear),
      ],
      [false, true],
    );
  }
  {
    const game = newGame(allDecks);
    const reaper = putOnBattlefield(game, MIDNIGHT_REAPER);
    const bear = putOnBattlefield(game, 'Llanowar Elves');
    game.dies(bear);
    game.createTokens(C.makeToken('Goblin', 1, 1, 'red'));
    game.dies(game.battlefield[game.battlefield.length - 1]);
    const afterBearAndToken = [game.hand.length, game.myLife];
    game.dies(reaper);
    check(
      'Midnight Reaper: a nontoken creature dying draws and costs 1 life, a token does not; the Reaper itself draws too',
      [afterBearAndToken, [game.hand.length, game.myLife]],
      [
        [1, 39],
        [2, 38],
      ],
    );
  }
  {
    const game = newGame(allDecks);
    putOnBattlefield(game, MOLDERVINE_RECLAMATION);
    game.createTokens(C.makeToken('Goblin', 1, 1, 'red'));
    game.dies(game.battlefield[game.battlefield.length - 1]);
    check(
      'Moldervine Reclamation: any creature dying (a token too) gains 1 life and draws',
      [game.hand.length, game.myLife],
      [1, 41],
    );
  }
  {
    const dieWithGraveyard = (creaturesInGraveyard: number, life: number) => {
      const game = newGame(allDecks);
      game.myLife = life;
      game.putCards(
        new Array(creaturesInGraveyard).fill(C.get('Llanowar Elves')),
        'graveyard',
      );
      const augur = putOnBattlefield(game, CORPSE_AUGUR);
      game.dies(augur);
      return [game.hand.length, game.myLife];
    };
    check(
      'Corpse Augur: draws X and loses X, counting itself; at low life it draws none (an empty graveyard)',
      [dieWithGraveyard(4, 40), dieWithGraveyard(4, 18)],
      [
        [5, 35],
        [0, 18],
      ],
    );
  }
  {
    const game = newGame(allDecks);
    putOnBattlefield(game, TIRELESS_TRACKER);
    putOnBattlefield(game, 'Swamp');
    game.onLandEnter(game.battlefield[1], false);
    putLands(game, 2);
    const clue = game.battlefield.find((permanent) => permanent.card === CLUE)!;
    const [tracker] = game.battlefield;
    const isCracked = crackClue(game, clue);
    check(
      'Tireless Tracker: a land makes a Clue; cracking it ({2}) draws a card and grows the Tracker',
      [
        countOnBattlefield(game, CLUE),
        isCracked,
        game.hand.length,
        tracker.counters,
      ],
      [0, true, 1, 1],
    );
  }
  {
    const game = newGame(allDecks);
    putLands(game, 1);
    const bear = putOnBattlefield(game, 'Llanowar Elves');
    const mouse = game.createTokens(C.makeToken('Insect', 1, 1, 'black'))[0];
    check(
      'Skullclamp: equip {1} to a creature with toughness 1: it dies and we draw two',
      [
        clampCreature(game, mouse),
        game.hand.length,
        game.battlefield.includes(bear),
      ],
      [true, 2, true],
    );
  }
  {
    const game = newGame(allDecks);
    putOnBattlefield(game, GREATER_GOOD);
    for (let i = 0; i < 4; i++) game.putCard(C.get('Island'), 'hand');
    const titan = putOnBattlefield(game, 'Grave Titan');
    sacrificeToGreaterGood(game, titan);
    check(
      'Greater Good: sacrifice a 6/6, draw six, discard three (4 + 6 - 3 cards in hand)',
      game.hand.length,
      7,
    );
  }
  {
    const game = newGame(allDecks);
    const ayara = putOnBattlefield(game, AYARA);
    const bear = putOnBattlefield(game, 'Llanowar Elves');
    sacrificeToAyara(game, ayara, bear);
    const isTappedAgain = sacrificeToAyara(
      game,
      ayara,
      putOnBattlefield(game, 'Llanowar Elves'),
    );
    check(
      'Ayara: tap and sacrifice another creature to draw a card, once while tapped',
      [game.hand.length, isTappedAgain, ayara.tapped],
      [1, false, true],
    );
  }
  {
    const game = newGame(allDecks);
    putOnBattlefield(game, AYARA);
    const blackCreature = putOnBattlefield(game, 'Shriekmaw');
    const greenCreature = putOnBattlefield(game, 'Llanowar Elves');
    triggersOfCreatureEntering(game, greenCreature);
    const lifeAfterGreen = game.myLife;
    triggersOfCreatureEntering(game, blackCreature);
    check(
      'Ayara: a black creature entering gains 1 life (and drains), a green one does not',
      [lifeAfterGreen, game.myLife, game.life[0]],
      [40, 41, 39],
    );
  }
  {
    const game = newGame(allDecks);
    game.enter(C.get('Elvish Visionary'));
    check('Elvish Visionary draws a card as it enters', game.hand.length, 1);
  }
  {
    const game = newGame(allDecks);
    putLands(game, 2);
    const whisper = C.get("Night's Whisper");
    game.putCard(whisper, 'hand');
    game.castInstantOrSorcery(whisper);
    check(
      "Night's Whisper: draws two and loses 2 life",
      [game.hand.length, game.myLife],
      [2, 38],
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
    `${isGood ? 'OK ' : 'BAD'} card draw rules: ${wrong.length} wrong of ${checks.length}`,
  );
  for (const difference of wrong) console.log(`      ${difference}`);
  return isGood;
}
