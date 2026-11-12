/** Rules checks on hand-built boards. Run: npm run sim -- samfrodo --test */
import * as C from '../../../engine/cards';
import { Cost } from '../../../engine/cards';
import { Perm } from '../../../engine/game';
import { Rng } from '../../../engine/rng';
import { CFG } from '../config';
import {
  SamFrodoGame,
  FOOD,
  TREASURE,
  CLUE,
  FRODO,
  SAM,
  GOLLUM,
} from '../game';

const rep = (n: string, k: number) => new Array(k).fill(n) as string[];

function board(
  bf: string[] = [],
  hand: string[] = [],
  gy: string[] = [],
  lands = [...rep('Plains', 2), ...rep('Swamp', 3), ...rep('Forest', 2)],
): SamFrodoGame {
  const g = new SamFrodoGame([], rep('Forest', 60), new Rng(1), { ...CFG });
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

export function runSamFrodoTests(): boolean {
  let ok = true;
  const check = (label: string, got: unknown, expect: unknown) => {
    const good = JSON.stringify(got) === JSON.stringify(expect);
    console.log(
      `${good ? 'OK ' : 'BAD'} ${label}: got ${JSON.stringify(got)}, expected ${JSON.stringify(expect)}`,
    );
    ok = ok && good;
  };
  const count = (g: SamFrodoGame, cd: C.CardDef) =>
    g.bf.filter((p) => p.cd === cd).length;

  // token doublers: one Food with Peregrin Took + Tippy-Toe = 3 Foods; Academy Manufactor makes each one Food + Clue + Treasure
  let g = board([
    'Peregrin Took',
    'Tippy-Toe, Terrific Partner',
    'Academy Manufactor',
  ]);
  g.makeTokens([FOOD]);
  check(
    'Peregrin + Tippy-Toe + Manufactor: one Food becomes 3 Food, 3 Clue, 3 Treasure',
    [count(g, FOOD), count(g, CLUE), count(g, TREASURE)],
    [3, 3, 3],
  );

  // Mirkwood Bats: creating a token and sacrificing a token each drain every opponent 1
  g = board(['Mirkwood Bats', 'Umbral Collar Zealot']);
  const [f] = g.makeTokens([FOOD]);
  g.sacrifice(f);
  check(
    'Mirkwood Bats: create + sacrifice a Food = 2 each',
    g.life,
    [38, 38, 38],
  );

  // Sanguine Bond: single-target drains go to the opponent with the most life
  g = board(['Sanguine Bond']);
  g.gainLife(3);
  g.gainLife(3);
  check(
    'Sanguine Bond: two 3-life gains hit two different opponents',
    g.life,
    [37, 37, 40],
  );

  // Marionette Master with fabricate 3 as counters (power 4): each artifact to the graveyard drains 4
  g = board([], ['Marionette Master'], [], [...rep('Swamp', 6)]);
  g.castPerm(C.get('Marionette Master'));
  g.sacrifice(g.makeTokens([FOOD])[0]);
  check(
    'Marionette Master (4 power): a Food sacrificed = 4 to one opponent',
    g.life,
    [36, 40, 40],
  );

  // Cauldron Familiar + Witch's Oven with Marionette Apprentice: oven eats Familiar (1 each), Food brings it back
  // (Food to the graveyard: 1 each, Familiar enters: 1 each)
  g = board(["Witch's Oven", 'Cauldron Familiar', 'Marionette Apprentice']);
  g.oven(g.perm("Witch's Oven")!, g.perm('Cauldron Familiar')!);
  g.returnFamiliar(g.gy.find((c) => c.name === 'Cauldron Familiar')!);
  check('Familiar + Oven + Apprentice loop: 3 each', g.life, [37, 37, 37]);
  check('... Familiar is back', g.onBf('Cauldron Familiar'), true);

  // Popular Egotist + Susurian Voidborn: a sacrificed Food = 1 + 1 to opponents and 2 life for us
  g = board(['Popular Egotist', 'Susurian Voidborn']);
  g.sacrifice(g.makeTokens([FOOD])[0]);
  check(
    'Egotist + Voidborn: sacrificed Food drains 2 in total',
    g.life.reduce((a, b) => a + b, 0),
    118,
  );
  check('... and we gain 2', g.myLife, 42);

  // The Notary Hobbits: two token copies; each taps for {C} per Halfling (3 Notaries = 3 each)
  g = board([], ['The Notary Hobbits'], [], [...rep('Forest', 5)]);
  g.castPerm(C.get('The Notary Hobbits'));
  check(
    'The Notary Hobbits: three of them',
    g.bf.filter((p) => p.cd.name === 'The Notary Hobbits').length,
    3,
  );
  const nh = g.perm('The Notary Hobbits')!;
  nh.sick = false;
  check('... each taps for C3', g.srcKind(nh), 'C3');

  // Gollum: connects (skulk); at the end step, opponents he has hit lose the life we gained this turn
  g = board([GOLLUM]);
  g.combat();
  g.gainLife(3);
  g.endStep();
  check(
    'Gollum hits one opponent, then drains it for the 3 life gained',
    g.life,
    [36, 40, 40],
  );
  check(
    "... Gollum's next attack goes to a new opponent",
    (g.startTurn(), g.combat(), g.gollumHit),
    [true, true, false],
  );

  // Frodo with Sam: Sam's Food at combat, eat it ({1} with Sam) for 3 life, the Ring tempts us, Frodo connects
  g = board([FRODO, SAM]);
  g.combat();
  check('Frodo + Sam: the Ring tempts once', g.ringTempts, 1);
  check('... Frodo deals 1', g.life, [39, 40, 40]);

  // the Ring's fourth temptation: Frodo's combat damage makes each opponent lose 3
  g = board([FRODO, SAM]);
  g.ringTempts = 3;
  const hand0 = g.hand.length;
  g.combat();
  check(
    "Ring tempted 4 times: Frodo's hit drains 3 each",
    g.life,
    [36, 37, 37],
  );
  check(
    '... Frodo draws one and loots one (hand +1)',
    g.hand.length - hand0,
    1,
  );

  // Merry: artifacts entering make a lifelink Soldier once each turn
  g = board(['Merry, Warden of Isengard']);
  g.makeTokens([FOOD]);
  g.makeTokens([FOOD]);
  check(
    'Merry: one Soldier for two Foods in a turn',
    g.bf.filter((p) => p.cd.name === 'Soldier').length,
    1,
  );

  // Belladonna Took: tokens entering: 1st gain 1, 2nd draw, 3rd +1/+1 counter on each creature
  g = board(['Belladonna Took']);
  const hb = g.hand.length;
  g.makeTokens([FOOD, FOOD, FOOD]);
  check(
    'Belladonna: gain 1, draw 1, counters',
    [g.myLife, g.hand.length - hb, g.perm('Belladonna Took')!.counters],
    [41, 1, 1],
  );

  // a Treasure used for mana is sacrificed (Mirkwood Bats: 1 each for creating it and 1 for sacrificing it)
  g = board(['Mirkwood Bats'], [], [], []);
  g.makeTokens([TREASURE]);
  check('Treasure pays for {1}', g.pay(new Cost(1)), true);
  check(
    '... and is sacrificed: Bats drain 2 each',
    [count(g, TREASURE), g.life],
    [0, [38, 38, 38]],
  );

  // lands: a two-colour land only makes its own colours in a three-colour deck; snarls check the hand
  g = board([], [], [], ['Brushland']);
  check("Brushland can't pay {B}", g.canPay(Cost.parse('{B}')), false);
  check('Brushland pays {W}', g.canPay(Cost.parse('{W}')), true);
  check(
    'Fortified Village: untapped if a Forest or Plains is revealed',
    C.get('Fortified Village').land!.etb,
    'reveal:forest,plains',
  );

  // Partner with: casting Pippin puts Merry from the library into the hand
  g = board([], ['Pippin, Warden of Isengard']);
  g.library.push(C.get('Merry, Warden of Isengard'));
  g.castPerm(C.get('Pippin, Warden of Isengard'));
  check(
    'Pippin fetches Merry',
    g.hand.map((c) => c.name),
    ['Merry, Warden of Isengard'],
  );

  // Swords to Plowshares on our own Rapacious Guest (power 7): target opponent loses 7, we gain 7
  g = board(['Rapacious Guest'], ['Swords to Plowshares']);
  g.perm('Rapacious Guest')!.counters = 5;
  g.castIS(C.get('Swords to Plowshares'));
  check(
    'Swords on our own Rapacious Guest (7 power): one opponent loses 7, we gain 7',
    [g.life, g.myLife],
    [[33, 40, 40], 47],
  );

  // the win: all three opponents dead
  g = board();
  g.life = [0, 0, 5];
  check('Two opponents dead is not a win', g.won(), false);
  g.life = [0, -2, 0];
  check('All three dead is a win', g.won(), true);

  console.log(ok ? 'ALL OK' : 'SOME FAILED');
  // ---- lands with conditions (the shared engine: Game.entersTapped, pain lands)
  const tapped = (name: string, lands: string[], hand: string[] = []) =>
    board([], [name, ...hand], [], lands).entersTapped(C.get(name));
  check(
    'Isolated Chapel: tapped with no Plains or Swamp, untapped with a Swamp',
    [
      tapped('Isolated Chapel', ['Forest']),
      tapped('Isolated Chapel', ['Swamp']),
    ],
    [true, false],
  );
  check(
    'Sunpetal Grove: untapped with a Forest or Plains',
    [tapped('Sunpetal Grove', ['Forest']), tapped('Sunpetal Grove', ['Swamp'])],
    [false, true],
  );
  check(
    'Canopy Vista: untapped with two basic lands, tapped with one',
    [
      tapped('Canopy Vista', ['Plains', 'Forest']),
      tapped('Canopy Vista', ['Plains', 'Command Tower']),
    ],
    [false, true],
  );
  check(
    'Fortified Village: untapped only with a Forest or Plains card to reveal',
    [
      tapped('Fortified Village', ['Swamp'], ['Plains']),
      tapped('Fortified Village', ['Swamp'], ['Swamp']),
    ],
    [false, true],
  );
  check(
    'Murmuring Bosk and Graypelt Refuge: always tapped',
    [
      tapped('Murmuring Bosk', ['Forest', 'Plains']),
      tapped('Graypelt Refuge', ['Forest', 'Plains']),
    ],
    [true, true],
  );
  let gl = board([], [], [], ['Murmuring Bosk']);
  gl.pay(Cost.parse('{W}'));
  check('Murmuring Bosk: {W} costs 1 life', gl.myLife, 39);
  gl = board([], [], [], ['Murmuring Bosk']);
  gl.pay(Cost.parse('{G}'));
  gl.pay(new Cost(0));
  check('  ... {G} is free (it is a Forest)', gl.myLife, 40);
  gl = board([], [], [], ['Brushland']);
  gl.pay(new Cost(1));
  check('Brushland: {C} for a generic cost is free', gl.myLife, 40);
  gl = board([], [], [], ['Brushland']);
  gl.pay(Cost.parse('{W}'));
  check('  ... {W} costs 1 life', gl.myLife, 39);

  return ok;
}
