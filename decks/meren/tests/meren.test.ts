/** Rules checks on hand-built boards. Run: npm run sim -- meren --test */
import * as C from '../../../engine/cards';
import { Perm } from '../../../engine/game-types';
import { Rng } from '../../../engine/rng';
import { CFG } from '../config';
import { MerenGame } from '../game';

const rep = (n: string, k: number) => new Array(k).fill(n) as string[];

function board(
  bf: string[] = [],
  hand: string[] = [],
  gy: string[] = [],
  lands = [...rep('Swamp', 4), ...rep('Forest', 3)],
): MerenGame {
  const g = new MerenGame([], rep('Swamp', 60), new Rng(1), { ...CFG });
  g.startTurn();
  g.turn = 5;
  for (const l of lands) {
    const cd = C.get(l);
    const p = new Perm(cd, cd.land);
    p.sick = false;
    g.bf.push(p);
  }
  for (const n of bf) {
    const p = new Perm(C.get(n));
    p.sick = false;
    g.bf.push(p);
  }
  g.hand = hand.map((n) => C.get(n));
  g.gy = gy.map((n) => C.get(n));
  return g;
}

export function runMerenTests(): boolean {
  let ok = true;
  const check = (label: string, got: unknown, expect: unknown) => {
    const good = JSON.stringify(got) === JSON.stringify(expect);
    console.log(
      `${good ? 'OK ' : 'BAD'} ${label}: got ${JSON.stringify(got)}, expected ${JSON.stringify(expect)}`,
    );
    ok = ok && good;
  };

  // Gray Merchant: each opponent loses devotion to black (its own BB + Meren's B = 3), we gain the total
  let g = board(['Meren of Clan Nel Toth'], ['Gray Merchant of Asphodel']);
  g.castPerm(C.get('Gray Merchant of Asphodel'));
  check('Gray Merchant with Meren out drains 3 each', g.life, [37, 37, 37]);
  check('... and we gain 9', g.myLife, 49);

  // Meren's end step: experience 5 returns Gray Merchant to the battlefield (drain again)
  g = board(['Meren of Clan Nel Toth'], [], ['Gray Merchant of Asphodel']);
  g.exp = 5;
  g.endStep();
  check(
    'Meren with 5 experience returns Gray Merchant to the battlefield',
    g.onBf('Gray Merchant of Asphodel'),
    true,
  );
  check('... which drains 3 each', g.life, [37, 37, 37]);

  // ... with 4 experience it goes to hand instead
  g = board(['Meren of Clan Nel Toth'], [], ['Gray Merchant of Asphodel']);
  g.exp = 4;
  g.endStep();
  check(
    'Meren with 4 experience puts Gray Merchant in hand',
    g.hand.map((c) => c.name),
    ['Gray Merchant of Asphodel'],
  );

  // Twilight Diviner copies a creature entering from the graveyard: two Gray Merchant drains. Ordering the
  // triggers well, the copy enters first, so both drains count Meren B + Diviner B + Merchant BB + copy BB = 6
  g = board(
    ['Meren of Clan Nel Toth', 'Twilight Diviner'],
    [],
    ['Gray Merchant of Asphodel'],
  );
  g.exp = 5;
  g.endStep();
  check(
    'Diviner + Meren returning Gray Merchant: two drains of 6',
    g.life,
    [28, 28, 28],
  );

  // Saw in Half on our Gray Merchant: it dies, two token copies enter: two more drains
  g = board(['Gray Merchant of Asphodel'], ['Saw in Half']);
  const gm = g.perm('Gray Merchant of Asphodel')!;
  g.sawInHalf(C.get('Saw in Half'), gm);
  check(
    'Saw in Half on Gray Merchant: copies drain 2 then 4',
    g.life,
    [34, 34, 34],
  );
  check(
    '... Gray Merchant is in the graveyard (for Meren)',
    g.gy.some((c) => c.name === 'Gray Merchant of Asphodel'),
    true,
  );

  // a sacrificed creature gives Meren an experience counter
  g = board(['Meren of Clan Nel Toth', 'Viscera Seer', 'Llanowar Elves']);
  g.sacrifice(g.perm('Llanowar Elves')!);
  check('Sacrificing a creature with Meren out: 1 experience', g.exp, 1);

  // combat: flying always connects; half of the other attackers (rounded down) are blocked, the biggest first
  g = board([
    'Butcher of Malakir',
    'Grave Titan',
    'Woe Strider',
    'Llanowar Elves',
  ]);
  g.myLife = 1000; // (so crackback doesn't hold the attack back)
  g.creatureCombat();
  // all four: Butcher 5 (flying) + ground Titan 6 / Strider 3 / Elves 1 with one blocked (Titan) = 9. Better: Butcher +
  // Titan alone (one ground attacker, none blocked) = 11, so the AI attacks with those two
  check(
    'Combat: the AI attacks with Butcher + Grave Titan (11), not all four (9)',
    g.damageDealt,
    11,
  );

  // crackback: attacking with everything and nothing home -> we take what we dealt at our next upkeep
  g = board(['Butcher of Malakir']);
  g.myLife = 1000;
  g.creatureCombat();
  g.upkeep();
  check(
    'Full swing with nothing home: crackback = damage dealt (5)',
    g.myLife,
    995,
  );
  // Grave Titan's attack makes two Zombies that stay home as blockers: crackback 6 x (1 - 2/3) = 2
  g = board(['Grave Titan']);
  g.myLife = 1000;
  g.creatureCombat();
  g.upkeep();
  check(
    'Grave Titan attacks, its 2 Zombies stay home: crackback 2',
    g.myLife,
    998,
  );

  // Spore Frog stays home and prevents the crackback; it's sacrificed before our turn
  g = board(['Grave Titan', 'Spore Frog']);
  g.creatureCombat();
  g.upkeep();
  check('Spore Frog: no crackback', g.myLife, 40);
  check('... and Spore Frog was sacrificed', g.onBf('Spore Frog'), false);

  // win: 100 damage in total or 2 opponents dead
  g = board();
  g.hurtOpp(0, 40);
  g.hurtOpp(1, 40);
  check('Two opponents dead is a win', g.won(), true);
  g = board();
  g.drainEach(33);
  g.hurtOpp(0, 1);
  check('100 damage spread over three opponents is a win', g.won(), true);

  console.log(ok ? 'ALL OK' : 'SOME FAILED');
  // ---- lands with conditions (the shared engine: Game.entersTapped, pain lands, Tainted Wood)
  const tapped = (name: string, lands: string[], hand: string[] = []) => {
    const gg = board([], [name, ...hand], [], lands);
    return gg.entersTapped(C.get(name));
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
  g = board([], ['Woodland Cemetery'], [], ['Island']);
  g.playLand();
  check(
    'playLand: Woodland Cemetery with only an Island enters tapped',
    g.perm('Woodland Cemetery')!.tapped,
    true,
  );
  g = board([], [], [], ['Tainted Wood', 'Forest']);
  check(
    'Tainted Wood: no coloured mana without a Swamp (only {C})',
    [g.srcKind(g.perm('Tainted Wood')!), g.canPay(C.Cost.parse('{B}'))],
    ['C', false],
  );
  g = board([], [], [], ['Tainted Wood', 'Swamp']);
  check(
    '  ... with a Swamp it makes {B} or {G}',
    g.canPay(C.Cost.parse('{G}')),
    true,
  );
  g = board([], [], [], ['Llanowar Wastes']);
  g.pay(C.Cost.parse('{G}'));
  check('Llanowar Wastes: {G} costs 1 life', g.myLife, 39);
  g = board([], [], [], ['Llanowar Wastes']);
  g.pay(new C.Cost(1));
  g.canPay(C.Cost.parse('{G}'));
  check(
    '  ... {C} for a generic cost and just checking a payment cost nothing',
    g.myLife,
    40,
  );

  return ok;
}
