/** Rules checks on hand-built boards. Run: npm run sim -- mike --test */
import * as C from '../../../engine/cards';
import { Perm } from '../../../engine/game-types';
import { Rng } from '../../../engine/rng';
import { CFG } from '../config';
import { MikeGame } from '../game';
import {
  TOK,
  VNWXT,
  PSYCHOSIS_CRAWLER,
  OMINOUS_SEAS,
  KRANG,
  TEFERIS_AGELESS_INSIGHT,
  LABORATORY_MANIAC,
  JACE,
  TWENTY_TOED_TOAD,
  LIVING_CONUNDRUM,
  ORMOS_ARCHIVE_KEEPER,
} from '../cards';

const repeatName = (cardName: string, count: number) =>
  new Array(count).fill(cardName) as string[];

function board(
  battlefieldNames: string[] = [],
  hand: string[] = [],
  library = repeatName('Island', 40),
  graveyardNames: string[] = [],
  lands = repeatName('Island', 6),
  config = {},
): MikeGame {
  const game = new MikeGame([], library, new Rng(1), { ...CFG, ...config });
  game.startTurn();
  game.turn = 6;
  game.drawStepOpen = false;
  for (const landName of lands) {
    const card = C.get(landName);
    const permanent = new Perm(card, card.land);
    permanent.sick = false;
    game.battlefield.push(permanent);
  }
  for (const cardName of battlefieldNames) {
    const otherPermanent = new Perm(C.get(cardName));
    otherPermanent.sick = false;
    game.battlefield.push(otherPermanent);
  }
  game.hand = hand.map((cardName) => C.get(cardName));
  game.graveyard = graveyardNames.map((cardName) => C.get(cardName));
  return game;
}

export function runMikeTests(): boolean {
  let allPassed = true;
  const check = (label: string, got: unknown, expect: unknown) => {
    const good = JSON.stringify(got) === JSON.stringify(expect);
    console.log(
      `${good ? 'OK ' : 'BAD'} ${label}: got ${JSON.stringify(got)}, expected ${JSON.stringify(expect)}`,
    );
    allPassed = allPassed && good;
  };

  // ---- drawing from an empty library
  let game = board([LABORATORY_MANIAC], [], []);
  game.draw(1);
  check(
    'Laboratory Maniac: drawing from an empty library wins',
    [game.milled, game.died],
    [true, false],
  );
  game = board([JACE], [], []);
  game.draw(1);
  check(
    'Jace: drawing from an empty library wins',
    [game.milled, game.died],
    [true, false],
  );
  game = board([LIVING_CONUNDRUM], [], []);
  game.draw(3);
  check(
    'Living Conundrum: the draws are skipped',
    [game.milled, game.died, game.hand.length],
    [false, false, 0],
  );
  game = board([ORMOS_ARCHIVE_KEEPER], [], []);
  game.draw(2);
  check(
    'Ormos: two empty draws = ten +1/+1 counters',
    [game.findPermanent(ORMOS_ARCHIVE_KEEPER)!.counters, game.died],
    [10, false],
  );
  game = board([], [], []);
  game.draw(1);
  check('no protection: drawing from an empty library loses', game.died, true);
  game = board([LABORATORY_MANIAC, LIVING_CONUNDRUM], [], []);
  game.draw(1);
  check(
    'Maniac and Conundrum together: we win (Maniac is chosen)',
    game.milled,
    true,
  );

  // ---- doubling draws
  game = board([VNWXT], []);
  game.speed = 4;
  game.draw(1);
  check('Vnwxt at max speed: draw two instead', game.hand.length, 2);
  game = board([VNWXT], []);
  game.speed = 3;
  game.draw(1);
  check('Vnwxt below max speed: draw one', game.hand.length, 1);
  game = board([TEFERIS_AGELESS_INSIGHT], []);
  game.draw(1);
  check(
    "Teferi's Ageless Insight: an effect draw gives two",
    game.hand.length,
    2,
  );
  game = board([TEFERIS_AGELESS_INSIGHT], []);
  game.drawStepOpen = true;
  game.draw(1);
  check(
    'Teferi: the first draw of the draw step is just one card',
    game.hand.length,
    1,
  );
  game = board([TEFERIS_AGELESS_INSIGHT, VNWXT], []);
  game.speed = 4;
  game.draw(1);
  check(
    'Teferi + Vnwxt (max speed): one effect draw gives four',
    game.hand.length,
    4,
  );
  game = board([TEFERIS_AGELESS_INSIGHT, VNWXT], []);
  game.speed = 4;
  game.drawStepOpen = true;
  game.draw(1);
  check(
    'Teferi + Vnwxt: the draw step gives three (the first card is exempt from Teferi)',
    game.hand.length,
    3,
  );

  // ---- draw triggers
  game = board([PSYCHOSIS_CRAWLER], []);
  game.draw(3);
  check(
    'Psychosis Crawler: each draw drains every opponent 1',
    game.life,
    [37, 37, 37],
  );
  game = board([PSYCHOSIS_CRAWLER, KRANG], []);
  game.draw(2);
  check("Krang doubles Psychosis Crawler's trigger", game.life, [36, 36, 36]);
  game = board([OMINOUS_SEAS], []);
  game.draw(7);
  check(
    'Ominous Seas: seven draws, seven counters, no Kraken',
    [
      game.findPermanent(OMINOUS_SEAS)!.counters,
      game.battlefield.filter((permanent) => permanent.card === TOK.kraken)
        .length,
    ],
    [7, 0],
  );
  game.draw(1);
  check(
    'Ominous Seas: the eighth draw makes an 8/8 Kraken',
    [
      game.findPermanent(OMINOUS_SEAS)!.counters,
      game.battlefield.filter((permanent) => permanent.card === TOK.kraken)
        .length,
    ],
    [0, 1],
  );
  game = board(['Clinquant Skymage', 'Oneirophage'], []);
  game.draw(2);
  check(
    'Skymage and Oneirophage grow with each draw',
    game.battlefield.filter((permanent) => permanent.counters === 2).length,
    2,
  );
  game = board(["Emrakul's Messenger", 'Mischievous Mystic'], []);
  game.draw(1);
  const none = game.battlefield.length;
  game.draw(1);
  check(
    'Messenger / Mystic: only the second card each turn makes a Spawn and a Faerie',
    [none, game.battlefield.length],
    [8, 10],
  );

  // ---- speed
  game = board([VNWXT], []);
  game.speed = 1;
  game.damageOpponent(0, 3);
  game.damageOpponent(1, 3);
  check('speed rises once per turn when an opponent loses life', game.speed, 2);
  game.startTurn();
  game.damageOpponent(0, 1);
  check('...and again on the next turn', game.speed, 3);
  game = board([], []);
  game.damageOpponent(0, 3);
  check('without a speed card there is no speed', game.speed, 0);

  // ---- Toad
  game = board([TWENTY_TOED_TOAD], repeatName('Island', 20));
  check(
    'Twenty-Toed Toad with twenty cards in hand wins',
    (game.checkKill(), game.areOpponentsBeaten()),
    true,
  );
  game = board([TWENTY_TOED_TOAD], repeatName('Island', 19));
  check(
    '...with nineteen it does not',
    (game.checkKill(), game.areOpponentsBeaten()),
    false,
  );

  // ---- the AI's safety rule
  game = board([], [], repeatName('Island', 6));
  check(
    'no protection: the AI will not draw into the last 3 cards',
    [game.mayDraw(2), game.mayDraw(4)],
    [true, false],
  );
  game = board([LIVING_CONUNDRUM], [], repeatName('Island', 6));
  check(
    'Living Conundrum on the battlefield: drawing everything is fine',
    game.mayDraw(20),
    true,
  );
  game = board([LABORATORY_MANIAC], [], repeatName('Island', 6));
  check(
    'a win piece on the battlefield: drawing everything is the plan',
    game.mayDraw(20),
    true,
  );

  // ---- Slick Imitator copies a Windfall (Pontus: 15 cards in hand = 30 drawn, then the copy discards 30 and draws 60)
  game = board(
    [VNWXT, 'Slick Imitator'],
    ['Windfall', ...repeatName('Brainstorm', 14)],
    repeatName('Island', 300),
  );
  game.speed = 4;
  game.castInstantOrSorcery(C.get('Windfall'));
  check(
    'Windfall with 14 other cards at max speed, copied by Slick Imitator: 28 drawn, then 56',
    [game.hand.length, game.isOnBattlefield('Slick Imitator')],
    [56, false],
  );
  game = board(
    [VNWXT, LABORATORY_MANIAC],
    ['Flux', ...repeatName('Brainstorm', 14)],
    repeatName('Island', 25),
  );
  game.speed = 4;
  game.castInstantOrSorcery(C.get('Flux'));
  check(
    'Flux with a win piece out and a small library: the whole hand is refilled and the library runs out (win)',
    game.milled,
    true,
  );

  // ---- the Water Crystal makes blue spells cheaper
  game = board(['The Water Crystal'], []);
  check(
    'The Water Crystal: Pull from Tomorrow (X=3) costs one less',
    game.effCost(
      C.get('Pull from Tomorrow'),
      C.Cost.parse('{U}{U}').withGeneric(3),
    ).manaValue,
    4,
  );

  return allPassed;
}
