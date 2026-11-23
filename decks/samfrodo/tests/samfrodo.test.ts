/** Rules checks on hand-built boards. Run: npm run sim -- samfrodo --test */
import * as C from '../../../engine/cards/cards';
import { Cost } from '../../../engine/cards/cards';
import { Permanent } from '../../../engine/game/game-types';
import { Rng } from '../../../engine/util/rng';
import { CFG } from '../config';
import { SamFrodoGame } from '../game';
import { TREASURE } from '../../../engine/cards/tokens';
import {
  AGENT_OF_THE_IRON_THRONE,
  CLUE,
  FOOD,
  FRODO,
  GOLLUM,
  IDOL_OF_OBLIVION,
  SAM,
} from '../cards';
import { activateWitchsOven, returnCauldronFamiliar } from '../actions';
import { playCombat } from '../combat';
import { finishWithMasterDrain } from '../drain-finish';

const repeatName = (cardName: string, count: number) =>
  new Array(count).fill(cardName) as string[];

function board(
  battlefieldNames: string[] = [],
  hand: string[] = [],
  graveyardNames: string[] = [],
  lands = [
    ...repeatName('Plains', 2),
    ...repeatName('Swamp', 3),
    ...repeatName('Forest', 2),
  ],
): SamFrodoGame {
  const game = new SamFrodoGame([], repeatName('Forest', 60), new Rng(1), {
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

export function runSamFrodoTests(): boolean {
  let allPassed = true;
  const check = (label: string, got: unknown, expect: unknown) => {
    const good = JSON.stringify(got) === JSON.stringify(expect);
    console.log(
      `${good ? 'OK ' : 'BAD'} ${label}: got ${JSON.stringify(got)}, expected ${JSON.stringify(expect)}`,
    );
    allPassed = allPassed && good;
  };
  const count = (game: SamFrodoGame, card: C.CardDef) =>
    game.battlefield.filter((permanent) => permanent.card === card).length;

  // token doublers: one Food with Peregrin Took + Tippy-Toe = 3 Foods; Academy Manufactor makes each one Food + Clue + Treasure
  let game = board([
    'Peregrin Took',
    'Tippy-Toe, Terrific Partner',
    'Academy Manufactor',
  ]);
  game.makeTokens([FOOD]);
  check(
    'Peregrin + Tippy-Toe + Manufactor: one Food becomes 3 Food, 3 Clue, 3 Treasure',
    [count(game, FOOD), count(game, CLUE), count(game, TREASURE)],
    [3, 3, 3],
  );

  // Mirkwood Bats: creating a token and sacrificing a token each drain every opponent 1
  game = board(['Mirkwood Bats', 'Umbral Collar Zealot']);
  const [otherPermanent] = game.makeTokens([FOOD]);
  game.sacrifice(otherPermanent);
  check(
    'Mirkwood Bats: create + sacrifice a Food = 2 each',
    game.life,
    [38, 38, 38],
  );

  // Sanguine Bond: single-target drains go to the opponent with the most life
  game = board(['Sanguine Bond']);
  game.gainLife(3);
  game.gainLife(3);
  check(
    'Sanguine Bond: two 3-life gains hit two different opponents',
    game.life,
    [37, 37, 40],
  );

  // Marionette Master with fabricate 3 as counters (power 4): each artifact to the graveyard drains 4
  game = board([], ['Marionette Master'], [], [...repeatName('Swamp', 6)]);
  game.castPerm(C.get('Marionette Master'));
  game.sacrifice(game.makeTokens([FOOD])[0]);
  check(
    'Marionette Master (4 power): a Food sacrificed = 4 to one opponent',
    game.life,
    [36, 40, 40],
  );

  // the Master finish: 6 Foods at 1 mana each (Sam), each drains 4 = 24 = three opponents at 8; at 40 life it does nothing
  const masterBoard = (opponentLife: number) => {
    const finishBoard = board(
      [SAM, 'Marionette Master'],
      [],
      [],
      repeatName('Swamp', 6),
    );
    finishBoard.findPermanent('Marionette Master')!.counters = 3;
    finishBoard.makeTokens(new Array(6).fill(FOOD));
    finishBoard.life = [opponentLife, opponentLife, opponentLife];
    return finishBoard;
  };
  game = masterBoard(8);
  check('Master finish: wins on 6 Foods', finishWithMasterDrain(game), true);
  game = masterBoard(40);
  check(
    'Master finish: not enough, nothing sacrificed',
    [finishWithMasterDrain(game), game.life, game.foodsOnBattlefield().length],
    [false, [40, 40, 40], 6],
  );

  // with Second Harvest in hand: 3 Foods become 6 first
  game = board(
    [SAM, 'Marionette Master'],
    ['Second Harvest'],
    [],
    repeatName('Forest', 12),
  );
  game.findPermanent('Marionette Master')!.counters = 3;
  game.makeTokens(new Array(3).fill(FOOD));
  game.life = [8, 8, 8];
  check(
    'Master finish: Second Harvest first, then 6 Foods',
    finishWithMasterDrain(game),
    true,
  );

  // Cauldron Familiar + Witch's Oven with Marionette Apprentice: oven eats Familiar (1 each), Food brings it back
  // (Food to the graveyard: 1 each, Familiar enters: 1 each)
  game = board(["Witch's Oven", 'Cauldron Familiar', 'Marionette Apprentice']);
  activateWitchsOven(
    game,
    game.findPermanent("Witch's Oven")!,
    game.findPermanent('Cauldron Familiar')!,
  );
  returnCauldronFamiliar(
    game,
    game.graveyard.find((card) => card.name === 'Cauldron Familiar')!,
  );
  check('Familiar + Oven + Apprentice loop: 3 each', game.life, [37, 37, 37]);
  check(
    '... Familiar is back',
    game.isOnBattlefield('Cauldron Familiar'),
    true,
  );

  // Popular Egotist + Susurian Voidborn: a sacrificed Food = 1 + 1 to opponents and 2 life for us
  game = board(['Popular Egotist', 'Susurian Voidborn']);
  game.sacrifice(game.makeTokens([FOOD])[0]);
  check(
    'Egotist + Voidborn: sacrificed Food drains 2 in total',
    game.life.reduce((total, value) => total + value, 0),
    118,
  );
  check('... and we gain 2', game.myLife, 42);

  // The Notary Hobbits: two token copies; each taps for {C} per Halfling (3 Notaries = 3 each)
  game = board([], ['The Notary Hobbits'], [], [...repeatName('Forest', 5)]);
  game.castPerm(C.get('The Notary Hobbits'));
  check(
    'The Notary Hobbits: three of them',
    game.battlefield.filter(
      (permanent) => permanent.card.name === 'The Notary Hobbits',
    ).length,
    3,
  );
  const anotherPermanent = game.findPermanent('The Notary Hobbits')!;
  anotherPermanent.sick = false;
  check('... each taps for C3', game.manaSourceKind(anotherPermanent), 'C3');

  // Gollum: connects (skulk); at the end step, opponents he has hit lose the life we gained this turn
  game = board([GOLLUM]);
  playCombat(game);
  game.gainLife(3);
  game.endStep();
  check(
    'Gollum hits one opponent, then drains it for the 3 life gained',
    game.life,
    [36, 40, 40],
  );
  check(
    "... Gollum's next attack goes to a new opponent",
    (game.startTurn(), playCombat(game), game.gollumHit),
    [true, true, false],
  );

  // Frodo with Sam: Sam's Food at combat, eat it ({1} with Sam) for 3 life, the Ring tempts us, Frodo connects
  game = board([FRODO, SAM]);
  playCombat(game);
  check('Frodo + Sam: the Ring tempts once', game.ringTempts, 1);
  check('... Frodo deals 1', game.life, [39, 40, 40]);

  // the Ring's fourth temptation: Frodo's combat damage makes each opponent lose 3
  game = board([FRODO, SAM]);
  game.ringTempts = 3;
  const hand0 = game.hand.length;
  playCombat(game);
  check(
    "Ring tempted 4 times: Frodo's hit drains 3 each",
    game.life,
    [36, 37, 37],
  );
  check(
    '... Frodo draws one and loots one (hand +1)',
    game.hand.length - hand0,
    1,
  );

  // Merry: artifacts entering make a lifelink Soldier once each turn
  game = board(['Merry, Warden of Isengard']);
  game.makeTokens([FOOD]);
  game.makeTokens([FOOD]);
  check(
    'Merry: one Soldier for two Foods in a turn',
    game.battlefield.filter((permanent) => permanent.card.name === 'Soldier')
      .length,
    1,
  );
  // its Soldier has lifelink: combat damage gains us life (the engine's CreatureDeckGame rule)
  const lifeBeforeHit = game.myLife;
  game.onCombatDamage(
    game.battlefield.filter((permanent) => permanent.card.name === 'Soldier'),
  );
  check(
    'the lifelink Soldier connects: gain 1',
    game.myLife - lifeBeforeHit,
    1,
  );

  // Belladonna Took: tokens entering: 1st gain 1, 2nd draw, 3rd +1/+1 counter on each creature
  game = board(['Belladonna Took']);
  const handSizeBefore = game.hand.length;
  game.makeTokens([FOOD, FOOD, FOOD]);
  check(
    'Belladonna: gain 1, draw 1, counters',
    [
      game.myLife,
      game.hand.length - handSizeBefore,
      game.findPermanent('Belladonna Took')!.counters,
    ],
    [41, 1, 1],
  );

  // a Treasure used for mana is sacrificed (Mirkwood Bats: 1 each for creating it and 1 for sacrificing it)
  game = board(['Mirkwood Bats'], [], [], []);
  game.makeTokens([TREASURE]);
  check('Treasure pays for {1}', game.pay(new Cost(1)), true);
  check(
    '... and is sacrificed: Bats drain 2 each',
    [count(game, TREASURE), game.life],
    [0, [38, 38, 38]],
  );

  // lands: a two-colour land only makes its own colours in a three-colour deck; snarls check the hand
  game = board([], [], [], ['Brushland']);
  check("Brushland can't pay {B}", game.canPay(Cost.parse('{B}')), false);
  check('Brushland pays {W}', game.canPay(Cost.parse('{W}')), true);
  check(
    'Fortified Village: untapped if a Forest or Plains is revealed',
    C.get('Fortified Village').land!.etb,
    'reveal:forest,plains',
  );

  // Partner with: casting Pippin puts Merry from the library into the hand
  game = board([], ['Pippin, Warden of Isengard']);
  game.library.push(C.get('Merry, Warden of Isengard'));
  game.castPerm(C.get('Pippin, Warden of Isengard'));
  check(
    'Pippin fetches Merry',
    game.hand.map((card) => card.name),
    ['Merry, Warden of Isengard'],
  );

  // Swords to Plowshares on our own Rapacious Guest (power 7): target opponent loses 7, we gain 7
  game = board(['Rapacious Guest'], ['Swords to Plowshares']);
  game.findPermanent('Rapacious Guest')!.counters = 5;
  game.castInstantOrSorcery(C.get('Swords to Plowshares'));
  check(
    'Swords on our own Rapacious Guest (7 power): one opponent loses 7, we gain 7',
    [game.life, game.myLife],
    [[33, 40, 40], 47],
  );

  // the win: all three opponents dead
  game = board();
  game.life = [0, 0, 5];
  check('Two opponents dead is not a win', game.hasWon(), false);
  game.life = [0, -2, 0];
  check('All three dead is a win', game.hasWon(), true);

  console.log(allPassed ? 'ALL OK' : 'SOME FAILED');
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
  let boskGame = board([], [], [], ['Murmuring Bosk']);
  boskGame.pay(Cost.parse('{W}'));
  check('Murmuring Bosk: {W} costs 1 life', boskGame.myLife, 39);
  boskGame = board([], [], [], ['Murmuring Bosk']);
  boskGame.pay(Cost.parse('{G}'));
  boskGame.pay(new Cost(0));
  check('  ... {G} is free (it is a Forest)', boskGame.myLife, 40);
  boskGame = board([], [], [], ['Brushland']);
  boskGame.pay(new Cost(1));
  check('Brushland: {C} for a generic cost is free', boskGame.myLife, 40);
  boskGame = board([], [], [], ['Brushland']);
  boskGame.pay(Cost.parse('{W}'));
  check('  ... {W} costs 1 life', boskGame.myLife, 39);

  // Agent of the Iron Throne: 1 per commander on the battlefield, for an artifact or creature of ours dying
  game = board([AGENT_OF_THE_IRON_THRONE, SAM, FRODO]);
  game.sacrifice(game.makeTokens([FOOD])[0]);
  check(
    'Agent of the Iron Throne with Sam and Frodo: a Food sacrificed = 2 each',
    game.life,
    [38, 38, 38],
  );
  game = board([AGENT_OF_THE_IRON_THRONE, SAM]);
  const agentFood = game.makeTokens([FOOD])[0];
  check(
    '  ... with Sam only: the AI counts 1 each for the Food',
    game.sacrificeValue(agentFood),
    3,
  );
  game = board([AGENT_OF_THE_IRON_THRONE]);
  game.sacrifice(game.makeTokens([FOOD])[0]);
  check('  ... with no commander out: nothing', game.life, [40, 40, 40]);

  // Idol of Oblivion: draws only in a turn we created a token
  game = board([IDOL_OF_OBLIVION]);
  const idolCandidates = () =>
    game.candidates(true).filter((candidate) => candidate.score === 50).length;
  check('Idol of Oblivion: no token this turn, no draw', idolCandidates(), 0);
  game.makeTokens([FOOD]);
  check('  ... after a Food: it may draw', idolCandidates(), 1);
  game.startTurn();
  check('  ... next turn: not until a new token', idolCandidates(), 0);

  // Deadly Dispute: sacrifices a spare Food (not a Treasure), draws 2, its Treasure gets Peregrin's Food
  game = board(['Peregrin Took'], ['Deadly Dispute']);
  game.battlefield.push(new Permanent(FOOD), new Permanent(FOOD));
  game.battlefield[game.battlefield.length - 1].token = true;
  game.battlefield[game.battlefield.length - 2].token = true;
  const handBefore = game.hand.length;
  const dispute = game
    .candidates(false)
    .find((candidate) => candidate.score === 54);
  check(
    'Deadly Dispute: offered with a spare Food',
    dispute !== undefined,
    true,
  );
  dispute?.action();
  check(
    '  ... draws 2 (hand -1 +2), one Food gone, a Treasure and a Food made',
    [game.hand.length - handBefore, count(game, FOOD), count(game, TREASURE)],
    [1, 2, 1],
  );

  // Eternal Witness: the best card in the graveyard comes back (in a goldfish game not held removal)
  game = board([], ['Eternal Witness'], ['Swords to Plowshares', 'Sol Ring']);
  game.castPerm(C.get('Eternal Witness'));
  check(
    'Eternal Witness: Sol Ring back to hand',
    game.hand.map((card) => card.name),
    ['Sol Ring'],
  );

  return allPassed;
}
