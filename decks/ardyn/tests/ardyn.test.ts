/** Rules checks on hand-built boards. Run: npm run sim -- ardyn --test */
import * as C from '../../../engine/cards/cards';
import { Cost } from '../../../engine/cards/cards';
import { Permanent } from '../../../engine/game/game-types';
import { triggerCount } from '../../../engine/game/trigger-doublers';
import { Rng } from '../../../engine/util/rng';
import { CFG } from '../config';
import { ArdynGame } from '../game';
import { ARDYN, BLOODLETTER, VILIS, isDemon } from '../cards';

const repeatName = (cardName: string, count: number) =>
  new Array(count).fill(cardName) as string[];

function board(
  battlefieldNames: string[] = [],
  hand: string[] = [],
  graveyardNames: string[] = [],
  lands = repeatName('Swamp', 8),
): ArdynGame {
  const game = new ArdynGame([], repeatName('Swamp', 60), new Rng(1), {
    ...CFG,
  });
  game.startTurn();
  game.turn = 6;
  for (const landName of lands) {
    const card = C.get(landName);
    const permanent = new Permanent(card, card.land);
    permanent.sick = false;
    game.battlefield.push(permanent);
  }
  for (const cardName of battlefieldNames) {
    const permanent = new Permanent(C.get(cardName));
    permanent.sick = false;
    game.battlefield.push(permanent);
  }
  game.hand = hand.map((cardName) => C.get(cardName));
  game.graveyard = graveyardNames.map((cardName) => C.get(cardName));
  return game;
}

export function runArdynTests(): boolean {
  let allPassed = true;
  const check = (label: string, got: unknown, expect: unknown) => {
    const good = JSON.stringify(got) === JSON.stringify(expect);
    console.log(
      `${good ? 'OK ' : 'BAD'} ${label}: got ${JSON.stringify(got)}, expected ${JSON.stringify(expect)}`,
    );
    if (!good) allPassed = false;
  };

  check(
    'a Demon by its type line (engine hasCreatureType)',
    [
      isDemon(C.get('Rune-Scarred Demon')),
      isDemon(C.get('Gray Merchant of Asphodel')),
    ],
    [true, false],
  );
  {
    const game = board(['Crypt Ghast'], [], [], repeatName('Swamp', 2));
    check(
      'Crypt Ghast: two Swamps pay {B}{B}{B}{B}',
      game.canPay(Cost.parse('{B}{B}{B}{B}')),
      true,
    );
  }
  {
    const game = board(['Roaming Throne', 'Bloodgift Demon']);
    check(
      'Roaming Throne (Demon): a Demon triggers twice',
      triggerCount(game, game.findPermanent('Bloodgift Demon')!),
      2,
    );
    const handBefore = game.hand.length;
    game.upkeep();
    check(
      'Bloodgift Demon under Roaming Throne: two cards at upkeep',
      game.hand.length - handBefore,
      2,
    );
  }
  {
    const game = board([BLOODLETTER, 'Exquisite Blood']);
    const lifeBefore = game.myLife;
    game.damageOpponent(0, 3);
    check(
      'Bloodletter doubles the loss, Exquisite Blood gives it back',
      [40 - game.life[0], game.myLife - lifeBefore],
      [6, 6],
    );
  }
  {
    const game = board([ARDYN], [], ['Gray Merchant of Asphodel']);
    game.starscourge();
    const copy = game.findPermanent('Gray Merchant of Asphodel');
    check(
      'Starscourge: a 5/5 Demon copy that drains for our devotion (Ardyn BBB)',
      [
        copy ? game.power(copy) : null,
        copy ? isDemon(copy.card) : null,
        40 - game.life[0],
      ],
      [5, true, 3],
    );
  }
  {
    const game = board([VILIS]);
    game.loseLife(2);
    check('Vilis: lose 2 life, draw 2', game.hand.length, 2);
  }
  {
    const game = board(['Heartless Summoning']);
    check(
      'Heartless Summoning: Rune-Scarred Demon costs {2} less',
      game.effectiveCost(C.get('Rune-Scarred Demon')).manaValue,
      5,
    );
  }
  return allPassed;
}
