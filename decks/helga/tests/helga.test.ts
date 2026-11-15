/** Rules checks on hand-built boards. Run: npm run sim -- helga --test */
import * as C from '../../../engine/cards/cards';
import { Permanent } from '../../../engine/game/game-types';
import { Rng } from '../../../engine/util/rng';
import { CFG } from '../config';
import { HelgaGame } from '../game';
import { HELGA } from '../cards';

const repeatName = (cardName: string, count: number) =>
  new Array(count).fill(cardName) as string[];

function board(
  battlefieldNames: string[] = [],
  hand: string[] = [],
  lands = [...repeatName('Forest', 6), 'Island', 'Plains'],
): HelgaGame {
  const game = new HelgaGame([], repeatName('Forest', 60), new Rng(1), {
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
  return game;
}

export function runHelgaTests(): boolean {
  let allPassed = true;
  const check = (label: string, got: unknown, expect: unknown) => {
    const good = JSON.stringify(got) === JSON.stringify(expect);
    console.log(
      `${good ? 'OK ' : 'BAD'} ${label}: got ${JSON.stringify(got)}, expected ${JSON.stringify(expect)}`,
    );
    if (!good) allPassed = false;
  };

  {
    const game = board([HELGA], ["Ulamog's Crusher"]);
    const helga = game.findPermanent(HELGA)!;
    const lifeBefore = game.myLife;
    game.castPerm(C.get("Ulamog's Crusher"));
    check(
      'Helga: a creature spell of mana value 4+ grows her, draws and gains 1',
      [helga.counters, game.hand.length, game.myLife - lifeBefore],
      [1, 1, 1],
    );
  }
  {
    const game = board([HELGA]);
    game.findPermanent(HELGA)!.counters = 3; // power 4
    check(
      "Helga's mana pays 4 of Ulamog's Crusher's {8}",
      game.costWithHelga(C.get("Ulamog's Crusher")).generic,
      4,
    );
    check(
      "Helga's mana is only for creature spells of mana value 4+",
      game.helgaManaFor(C.get('Cultivate')),
      0,
    );
  }
  {
    const game = board([HELGA], ["Ulamog's Crusher"], repeatName('Forest', 4));
    game.findPermanent(HELGA)!.counters = 3;
    check(
      'Helga (power 4) and 4 Forests cast an 8-drop',
      game.castWithHelga(C.get("Ulamog's Crusher")),
      true,
    );
  }
  {
    const game = board(['Goreclaw, Terror of Qal Sisma']);
    check(
      'Goreclaw: Aggressive Mammoth costs {2} less',
      game.effectiveCost(C.get('Aggressive Mammoth')).generic,
      1,
    );
  }
  {
    const game = board(
      ['Llanowar Elves', 'Sakura-Tribe Elder'],
      ['Craterhoof Behemoth'],
    );
    game.castPerm(C.get('Craterhoof Behemoth'));
    check(
      'Craterhoof: +X/+X where X is our creature count (3)',
      game.power(game.findPermanent('Llanowar Elves')!),
      4,
    );
  }
  {
    const game = board(["Garruk's Uprising"], ['Aggressive Mammoth']);
    game.castPerm(C.get('Aggressive Mammoth'));
    check(
      "Garruk's Uprising: a creature with power 4+ enters, we draw",
      game.hand.length,
      1,
    );
  }
  {
    const game = board(
      [],
      ['Kozilek, Butcher of Truth'],
      repeatName('Forest', 10),
    );
    game.castPerm(C.get('Kozilek, Butcher of Truth'));
    check('Kozilek, Butcher of Truth: cast, draw four', game.hand.length, 4);
  }
  return allPassed;
}
