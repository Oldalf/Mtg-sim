/** Rules checks on hand-built boards. Run: npm run sim -- meren --test */
import * as C from '../../../engine/cards';
import { Permanent } from '../../../engine/game-types';
import { Rng } from '../../../engine/rng';
import { CFG } from '../config';
import { castSawInHalf } from '../actions';
import { MerenGame } from '../game';

const repeatName = (cardName: string, count: number) =>
  new Array(count).fill(cardName) as string[];

function board(
  battlefieldNames: string[] = [],
  hand: string[] = [],
  graveyardNames: string[] = [],
  lands = [...repeatName('Swamp', 4), ...repeatName('Forest', 3)],
): MerenGame {
  const game = new MerenGame([], repeatName('Swamp', 60), new Rng(1), {
    ...CFG,
  });
  game.startTurn();
  game.turn = 5;
  for (const landName of lands) {
    const card = C.get(landName);
    const permanent = new Permanent(card, card.land);
    permanent.sick = false;
    game.battlefield.push(permanent);
  }
  for (const cardName of battlefieldNames) {
    const otherPermanent = new Permanent(C.get(cardName));
    otherPermanent.sick = false;
    game.battlefield.push(otherPermanent);
  }
  game.hand = hand.map((cardName) => C.get(cardName));
  game.graveyard = graveyardNames.map((cardName) => C.get(cardName));
  return game;
}

export function runMerenTests(): boolean {
  let allPassed = true;
  const check = (label: string, got: unknown, expect: unknown) => {
    const good = JSON.stringify(got) === JSON.stringify(expect);
    console.log(
      `${good ? 'OK ' : 'BAD'} ${label}: got ${JSON.stringify(got)}, expected ${JSON.stringify(expect)}`,
    );
    allPassed = allPassed && good;
  };

  // Gray Merchant: each opponent loses devotion to black (its own BB + Meren's B = 3), we gain the total
  let game = board(['Meren of Clan Nel Toth'], ['Gray Merchant of Asphodel']);
  game.castPerm(C.get('Gray Merchant of Asphodel'));
  check('Gray Merchant with Meren out drains 3 each', game.life, [37, 37, 37]);
  check('... and we gain 9', game.myLife, 49);

  // Meren's end step: experience 5 returns Gray Merchant to the battlefield (drain again)
  game = board(['Meren of Clan Nel Toth'], [], ['Gray Merchant of Asphodel']);
  game.experience = 5;
  game.endStep();
  check(
    'Meren with 5 experience returns Gray Merchant to the battlefield',
    game.isOnBattlefield('Gray Merchant of Asphodel'),
    true,
  );
  check('... which drains 3 each', game.life, [37, 37, 37]);

  // ... with 4 experience it goes to hand instead
  game = board(['Meren of Clan Nel Toth'], [], ['Gray Merchant of Asphodel']);
  game.experience = 4;
  game.endStep();
  check(
    'Meren with 4 experience puts Gray Merchant in hand',
    game.hand.map((card) => card.name),
    ['Gray Merchant of Asphodel'],
  );

  // Twilight Diviner copies a creature entering from the graveyard: two Gray Merchant drains. Ordering the
  // triggers well, the copy enters first, so both drains count Meren B + Diviner B + Merchant BB + copy BB = 6
  game = board(
    ['Meren of Clan Nel Toth', 'Twilight Diviner'],
    [],
    ['Gray Merchant of Asphodel'],
  );
  game.experience = 5;
  game.endStep();
  check(
    'Diviner + Meren returning Gray Merchant: two drains of 6',
    game.life,
    [28, 28, 28],
  );

  // Saw in Half on our Gray Merchant: it dies, two token copies enter: two more drains
  game = board(['Gray Merchant of Asphodel'], ['Saw in Half']);
  const permanent = game.findPermanent('Gray Merchant of Asphodel')!;
  castSawInHalf(game, C.get('Saw in Half'), permanent);
  check(
    'Saw in Half on Gray Merchant: copies drain 2 then 4',
    game.life,
    [34, 34, 34],
  );
  check(
    '... Gray Merchant is in the graveyard (for Meren)',
    game.graveyard.some((card) => card.name === 'Gray Merchant of Asphodel'),
    true,
  );

  // a sacrificed creature gives Meren an experience counter
  game = board(['Meren of Clan Nel Toth', 'Viscera Seer', 'Llanowar Elves']);
  game.sacrifice(game.findPermanent('Llanowar Elves')!);
  check(
    'Sacrificing a creature with Meren out: 1 experience',
    game.experience,
    1,
  );

  // combat: flying always connects; half of the other attackers (rounded down) are blocked, the biggest first
  game = board([
    'Butcher of Malakir',
    'Grave Titan',
    'Woe Strider',
    'Llanowar Elves',
  ]);
  game.myLife = 1000; // (so crackback doesn't hold the attack back)
  game.creatureCombat();
  // all four: Butcher 5 (flying) + ground Titan 6 / Strider 3 / Elves 1 with one blocked (Titan) = 9. Better: Butcher +
  // Titan alone (one ground attacker, none blocked) = 11, so the AI attacks with those two
  check(
    'Combat: the AI attacks with Butcher + Grave Titan (11), not all four (9)',
    game.damageDealt,
    11,
  );

  // crackback: attacking with everything and nothing home -> we take what we dealt at our next upkeep
  game = board(['Butcher of Malakir']);
  game.myLife = 1000;
  game.creatureCombat();
  game.upkeep();
  check(
    'Full swing with nothing home: crackback = damage dealt (5)',
    game.myLife,
    995,
  );
  // Grave Titan's attack makes two Zombies that stay home as blockers: crackback 6 x (1 - 2/3) = 2
  game = board(['Grave Titan']);
  game.myLife = 1000;
  game.creatureCombat();
  game.upkeep();
  check(
    'Grave Titan attacks, its 2 Zombies stay home: crackback 2',
    game.myLife,
    998,
  );

  // Spore Frog stays home and prevents the crackback; it's sacrificed before our turn
  game = board(['Grave Titan', 'Spore Frog']);
  game.creatureCombat();
  game.upkeep();
  check('Spore Frog: no crackback', game.myLife, 40);
  check(
    '... and Spore Frog was sacrificed',
    game.isOnBattlefield('Spore Frog'),
    false,
  );

  // win: 100 damage in total or 2 opponents dead
  game = board();
  game.damageOpponent(0, 40);
  game.damageOpponent(1, 40);
  check('Two opponents dead is a win', game.hasWon(), true);
  game = board();
  game.drainEach(33);
  game.damageOpponent(0, 1);
  check('100 damage spread over three opponents is a win', game.hasWon(), true);

  console.log(allPassed ? 'ALL OK' : 'SOME FAILED');
  // ---- lands with conditions (the shared engine: Game.entersTapped, pain lands, Tainted Wood)
  const tapped = (name: string, lands: string[], hand: string[] = []) => {
    const testGame = board([], [name, ...hand], [], lands);
    return testGame.entersTapped(C.get(name));
  };
  check(
    'Woodland Cemetery: tapped with no Swamp or Forest',
    tapped('Woodland Cemetery', ['Island']),
    true,
  );
  check(
    '  ... untapped with a Swamp',
    tapped('Woodland Cemetery', ['Swamp']),
    false,
  );
  check(
    '  ... untapped with a battle land that has the Swamp type (Vernal Fen)',
    tapped('Woodland Cemetery', ['Vernal Fen']),
    false,
  );
  check(
    'Blooming Marsh: untapped with two other lands, tapped with three',
    [
      tapped('Blooming Marsh', ['Swamp', 'Forest']),
      tapped('Blooming Marsh', ['Swamp', 'Forest', 'Swamp']),
    ],
    [false, true],
  );
  check(
    'Vernal Fen: untapped with two basic lands, tapped with one',
    [
      tapped('Vernal Fen', ['Swamp', 'Forest']),
      tapped('Vernal Fen', ['Swamp', 'Command Tower']),
    ],
    [false, true],
  );
  check(
    'Necroblossom Snarl: untapped only with a Swamp or Forest card in hand to reveal',
    [
      tapped('Necroblossom Snarl', ['Swamp'], ['Forest']),
      tapped('Necroblossom Snarl', ['Swamp'], ['Island']),
    ],
    [false, true],
  );
  check(
    'Bojuka Bog: always tapped',
    tapped('Bojuka Bog', ['Swamp', 'Forest']),
    true,
  );
  game = board([], ['Woodland Cemetery'], [], ['Island']);
  game.playLand();
  check(
    'playLand: Woodland Cemetery with only an Island enters tapped',
    game.findPermanent('Woodland Cemetery')!.tapped,
    true,
  );
  game = board([], [], [], ['Tainted Wood', 'Forest']);
  check(
    'Tainted Wood: no coloured mana without a Swamp (only {C})',
    [
      game.manaSourceKind(game.findPermanent('Tainted Wood')!),
      game.canPay(C.Cost.parse('{B}')),
    ],
    ['C', false],
  );
  game = board([], [], [], ['Tainted Wood', 'Swamp']);
  check(
    '  ... with a Swamp it makes {B} or {G}',
    game.canPay(C.Cost.parse('{G}')),
    true,
  );
  game = board([], [], [], ['Llanowar Wastes']);
  game.pay(C.Cost.parse('{G}'));
  check('Llanowar Wastes: {G} costs 1 life', game.myLife, 39);
  game = board([], [], [], ['Llanowar Wastes']);
  game.pay(new C.Cost(1));
  game.canPay(C.Cost.parse('{G}'));
  check(
    '  ... {C} for a generic cost and just checking a payment cost nothing',
    game.myLife,
    40,
  );

  return allPassed;
}
