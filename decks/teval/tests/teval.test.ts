/** Rules checks on hand-built boards. Run: npm run sim -- teval --test */
import * as C from '../../../engine/cards/cards';
import { Cost } from '../../../engine/cards/cards';
import { Permanent } from '../../../engine/game/game-types';
import { Rng } from '../../../engine/util/rng';
import { CFG } from '../config';
import { TevalGame } from '../game';
import { TEVAL } from '../cards';

const repeatName = (cardName: string, count: number) =>
  new Array(count).fill(cardName) as string[];

function board(
  battlefieldNames: string[] = [],
  hand: string[] = [],
  graveyardNames: string[] = [],
  lands = [...repeatName('Swamp', 4), ...repeatName('Forest', 3), 'Island'],
  library = repeatName('Forest', 60),
): TevalGame {
  const game = new TevalGame([], library, new Rng(1), { ...CFG });
  game.startTurn();
  game.turn = 6;
  for (const landName of lands) {
    const card = C.get(landName);
    const permanent = new Permanent(card, card.land);
    permanent.sick = false;
    game.putOntoBattlefield(permanent);
  }
  for (const cardName of battlefieldNames) {
    const permanent = new Permanent(C.get(cardName));
    permanent.sick = false;
    game.putOntoBattlefield(permanent);
  }
  game.hand = hand.map((cardName) => C.get(cardName));
  game.graveyard = graveyardNames.map((cardName) => C.get(cardName));
  return game;
}

const zombieTokens = (game: TevalGame) =>
  game.battlefield.filter(
    (permanent) => permanent.token && permanent.card.name.includes('Zombie'),
  ).length;

export function runTevalTests(): boolean {
  let allPassed = true;
  const check = (label: string, got: unknown, expect: unknown) => {
    const good = JSON.stringify(got) === JSON.stringify(expect);
    console.log(
      `${good ? 'OK ' : 'BAD'} ${label}: got ${JSON.stringify(got)}, expected ${JSON.stringify(expect)}`,
    );
    if (!good) allPassed = false;
  };

  {
    const game = board([TEVAL], [], ['Eternal Witness']);
    game.returnCreatureToHand();
    check(
      'Teval: a card leaves the graveyard, a Zombie Druid',
      zombieTokens(game),
      1,
    );
  }
  {
    const game = board([TEVAL, 'Doubling Season'], [], ['Eternal Witness']);
    game.returnCreatureToHand();
    check('Doubling Season: two Zombie Druids', zombieTokens(game), 2);
  }
  {
    const game = board(
      [TEVAL],
      ['Rise of the Dark Realms'],
      ['Eternal Witness', 'Sakura-Tribe Elder', 'Rampaging Baloths'],
      repeatName('Swamp', 9),
    );
    game.castInstantOrSorcery(C.get('Rise of the Dark Realms'));
    check(
      'Rise of the Dark Realms: three creatures back, one event, one Zombie Druid',
      [
        game.creatures().filter((permanent) => !permanent.token).length,
        zombieTokens(game),
      ],
      [4, 1],
    );
  }
  {
    const game = board([TEVAL, 'Rampaging Baloths'], [], [], undefined, [
      'Forest',
      'Forest',
      'Forest',
      ...repeatName('Swamp', 57),
    ]);
    game.onAttack([game.findPermanent(TEVAL)!]);
    check(
      "Teval attacks: mill three, a land comes back (Baloths' Beast) and a Zombie Druid",
      [
        game.battlefield.filter((permanent) => permanent.card.name === 'Beast')
          .length,
        zombieTokens(game),
      ],
      [1, 1],
    );
  }
  {
    const game = board(['Nyxbloom Ancient'], [], [], ['Forest']);
    check(
      'Nyxbloom Ancient: one Forest pays {G}{G}{G}',
      game.canPay(Cost.parse('{G}{G}{G}')),
      true,
    );
  }
  {
    const game = board(['Lumra, Bellow of the Woods']);
    check(
      'Lumra: power equal to our lands (8)',
      game.power(game.findPermanent('Lumra, Bellow of the Woods')!),
      8,
    );
  }
  return allPassed;
}
