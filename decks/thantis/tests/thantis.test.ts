/** Rules checks on hand-built boards. Run: npm run sim -- thantis --test */
import * as C from '../../../engine/cards/cards';
import { Permanent } from '../../../engine/game/game-types';
import { Rng } from '../../../engine/util/rng';
import { CFG } from '../config';
import { ThantisGame } from '../game';
import { buildCandidates } from '../candidates';

const repeatName = (cardName: string, count: number) =>
  new Array(count).fill(cardName) as string[];

function board(
  battlefieldNames: string[] = [],
  hand: string[] = [],
  graveyardNames: string[] = [],
  lands = repeatName('Swamp', 8),
  library = repeatName('Swamp', 60),
): ThantisGame {
  const game = new ThantisGame([], library, new Rng(1), { ...CFG });
  game.startTurn();
  game.turn = 6;
  game.mayHaveStaticEffects = true; // the board is put on the battlefield directly (Whip of Erebos's lifelink)
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
  // a graveyard set by hand: the engine's static effects (Anger, Brawn) are looked at only once one could be there
  game.mayHaveStaticEffects = true;
  return game;
}

/** A creature that just entered (summoning sick). */
function enterCreature(game: ThantisGame, cardName: string): Permanent {
  return game.enter(C.get(cardName));
}

export function runThantisTests(): boolean {
  let allPassed = true;
  const check = (label: string, got: unknown, expect: unknown) => {
    const good = JSON.stringify(got) === JSON.stringify(expect);
    console.log(
      `${good ? 'OK ' : 'BAD'} ${label}: got ${JSON.stringify(got)}, expected ${JSON.stringify(expect)}`,
    );
    if (!good) allPassed = false;
  };

  {
    const game = board(['Thantis, the Warweaver']);
    const thantis = game.findPermanent('Thantis, the Warweaver')!;
    game.onAttackedBy(3);
    check(
      'Thantis: three attackers, three +1/+1 counters',
      game.power(thantis),
      8,
    );
  }
  {
    const game = board(['Lavaleaper'], [], [], ['Mountain']);
    const bear = enterCreature(game, 'Taurean Mauler');
    check(
      'Lavaleaper: a summoning-sick creature can attack',
      game.canAttack(bear),
      true,
    );
    game.startTurn();
    game.tap(game.battlefield[0], 'N');
    check(
      'Lavaleaper: a basic land makes one more mana of its type',
      game.pool.R,
      2,
    );
  }
  {
    const withMountain = board([], [], ['Anger'], ['Mountain']);
    const withoutMountain = board([], [], ['Anger'], ['Swamp']);
    check(
      'Anger in the graveyard: haste only with a Mountain',
      [
        withMountain.ourCreaturesHave('haste'),
        withoutMountain.ourCreaturesHave('haste'),
      ],
      [true, false],
    );
  }
  {
    const game = board([], [], ['Brawn'], ['Forest']);
    const fighter = game.fighter(new Permanent(C.get('Taurean Mauler')));
    check(
      'Brawn in the graveyard with a Forest: our creatures trample',
      fighter.trample,
      true,
    );
  }
  {
    const game = board(['Ruric Thar, the Unbowed']);
    game.podAnnounceCast(C.get('Explore'));
    game.podAnnounceCast(C.get('Eternal Witness'));
    check('Ruric Thar: our noncreature spell costs 6 life', game.myLife, 34);
  }
  {
    const game = board(
      ['Ruric Thar, the Unbowed'],
      ['Explore', 'Taurean Mauler'],
    );
    game.myLife = 10;
    check(
      'Ruric Thar at low life: only creature spells are cast',
      buildCandidates(game, false).length,
      1,
    );
  }
  {
    const game = board(['Syr Konrad, the Grim', 'Taurean Mauler']);
    game.dies(game.findPermanent('Taurean Mauler')!);
    check(
      'Syr Konrad: another creature dies, each opponent loses 1',
      game.life,
      [39, 39, 39],
    );
    const graveyardCreature = game.graveyard[0];
    game.reanimate(graveyardCreature);
    check(
      'Syr Konrad: a creature card leaves the graveyard, each opponent loses 1 more',
      game.life,
      [38, 38, 38],
    );
  }
  {
    const game = board(['Sangromancer']);
    game.onOtherPlayersCreatureDies(new Permanent(C.get('Taurean Mauler')));
    check(
      "Sangromancer: an opponent's creature dies, we gain 3",
      game.myLife,
      43,
    );
  }
  {
    const game = board(['Grave Venerations', 'Taurean Mauler']);
    game.dies(game.findPermanent('Taurean Mauler')!);
    check(
      'Grave Venerations: our creature dies, each opponent loses 1 and we gain 1',
      [game.life, game.myLife],
      [[39, 39, 39], 41],
    );
  }
  {
    const game = board(['Morbid Opportunist', 'Taurean Mauler', 'Anger']);
    const handBefore = game.hand.length;
    game.dies(game.findPermanent('Taurean Mauler')!);
    game.dies(game.findPermanent('Anger')!);
    check(
      'Morbid Opportunist: one card a turn, however many creatures die',
      game.hand.length - handBefore,
      1,
    );
  }
  {
    const game = board(['Avacyn, Angel of Horror', 'Taurean Mauler']);
    game.dies(game.findPermanent('Taurean Mauler')!);
    check(
      'Avacyn: the creature is in the graveyard until the end step',
      game.graveyard.map((card) => card.name),
      ['Taurean Mauler'],
    );
    game.endStep();
    check(
      'Avacyn: it is back at the end step',
      [game.isOnBattlefield('Taurean Mauler'), game.graveyard.length],
      [true, 0],
    );
  }
  {
    const game = board(['Zopandrel, Hunger Dominus', 'Taurean Mauler']);
    const mauler = game.findPermanent('Taurean Mauler')!;
    game.isDoubledThisTurn = true;
    check(
      "Zopandrel: our creatures' power and toughness are doubled",
      [game.power(mauler), game.toughness(mauler)],
      [4, 4],
    );
    game.endStep();
    check('Zopandrel: until end of turn', game.power(mauler), 2);
  }
  {
    const game = board(['Taurean Mauler']);
    const gearhulk = enterCreature(game, 'Pyrewood Gearhulk');
    const mauler = game.findPermanent('Taurean Mauler')!;
    check(
      'Pyrewood Gearhulk: the others get +2/+2, not the Gearhulk',
      [game.power(mauler), game.power(gearhulk)],
      [4, 7],
    );
  }
  {
    const game = board([
      'Selvala, Heart of the Wilds',
      'Zopandrel, Hunger Dominus',
    ]);
    check(
      'Selvala makes {C}{C}, Zopandrel any colour',
      [
        game.manaSourceKind(game.findPermanent('Selvala, Heart of the Wilds')!),
        game.manaSourceKind(game.findPermanent('Zopandrel, Hunger Dominus')!),
      ],
      ['C2', 'A'],
    );
  }
  {
    const game = board(
      ['Meren of Clan Nel Toth', 'Sakura-Tribe Elder'],
      [],
      ['Eternal Witness'],
    );
    game.dies(game.findPermanent('Sakura-Tribe Elder')!);
    game.endStep();
    check(
      'Meren: one experience, a creature of mana value 3 goes to hand',
      [game.experienceCounters, game.hand.map((card) => card.name)],
      [1, ['Eternal Witness']],
    );
  }
  {
    const game = board(
      ['Alesha, Who Laughs at Fate'],
      [],
      ['Taurean Mauler', 'Archon of Cruelty'],
    );
    const alesha = game.findPermanent('Alesha, Who Laughs at Fate')!;
    game.onAttack([alesha]);
    check('Alesha: a counter when she attacks', alesha.counters, 1);
    game.attacked = true;
    game.endStep();
    check(
      'Alesha (raid): a creature of mana value up to her power (3) returns',
      game.battlefield.some(
        (permanent) => permanent.card.name === 'Taurean Mauler',
      ),
      true,
    );
  }
  {
    const game = board([], [], [], repeatName('Swamp', 8), [
      ...repeatName('Swamp', 3),
      'Eternal Witness',
      ...repeatName('Swamp', 10),
    ]);
    const archon = enterCreature(game, 'Archon of Cruelty');
    check(
      'Archon of Cruelty: an opponent loses 3, we draw a card and gain 3',
      [
        game.life.slice().sort((a, b) => a - b)[0],
        game.hand.length,
        game.myLife,
      ],
      [37, 1, 43],
    );
    const handBefore = game.hand.length;
    game.onAttack([archon]);
    check(
      'Archon of Cruelty: again when it attacks',
      game.hand.length - handBefore,
      1,
    );
  }
  {
    const game = board([], [], [], repeatName('Swamp', 8), [
      ...repeatName('Swamp', 3),
      'Eternal Witness',
      ...repeatName('Swamp', 10),
    ]);
    const raph = enterCreature(game, 'Raph & Mikey, Troublemakers');
    const joined = game.onAttack([raph]);
    check(
      'Raph & Mikey: the first creature of the library joins the attack, the rest go to the bottom',
      [
        joined.map((permanent) => permanent.card.name),
        game.library.length,
        game.library[game.library.length - 1].name,
      ],
      [['Eternal Witness'], 13, 'Swamp'],
    );
  }
  {
    const game = board(['Lurking Predators'], [], [], repeatName('Swamp', 8), [
      'Eternal Witness',
      'Swamp',
      'Swamp',
    ]);
    game.onOpponentCast(C.get('Explore'), game);
    check(
      "Lurking Predators: an opponent's spell puts the top creature onto the battlefield",
      game.isOnBattlefield('Eternal Witness'),
      true,
    );
  }
  {
    const game = board(
      ['Spinner of Souls', 'Taurean Mauler'],
      [],
      [],
      repeatName('Swamp', 8),
      ['Swamp', 'Swamp', 'Eternal Witness', 'Swamp'],
    );
    game.dies(game.findPermanent('Taurean Mauler')!);
    check(
      'Spinner of Souls: a nontoken creature dies, the first creature of the library to hand',
      game.hand.map((card) => card.name),
      ['Eternal Witness'],
    );
  }
  {
    const game = board(['Professor Dellian Fel']);
    game.myLife = 8;
    game.useDellianFel();
    check('Professor Dellian Fel: gains 3 life when low', game.myLife, 11);
    game.myLife = 30;
    const handBefore = game.hand.length;
    game.useDellianFel();
    check(
      'Professor Dellian Fel: otherwise a card for 1 life',
      [game.hand.length - handBefore, game.myLife],
      [1, 29],
    );
  }
  {
    const game = board(['Whip of Erebos', 'Glissa Sunslayer']);
    const glissa = game.findPermanent('Glissa Sunslayer')!;
    const handBefore = game.hand.length;
    game.onCombatDamage([glissa]);
    check(
      'Glissa Sunslayer draws, Whip of Erebos gives lifelink',
      [game.hand.length - handBefore, game.myLife],
      [1, 40 - 1 + 3],
    );
  }

  return allPassed;
}
