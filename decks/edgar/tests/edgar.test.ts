/** Rules checks on hand-built boards. Run: npm run sim -- edgar --test */
import * as C from '../../../engine/cards/cards';
import { Arena, Permanent } from '../../../engine/game/game-types';
import { Rng } from '../../../engine/util/rng';
import { CFG } from '../config';
import { EdgarGame } from '../game';
import {
  EDGAR,
  EVERETH,
  NINE_LIVES_FAMILIAR,
  TOKENS,
  VANQUISHERS_BANNER,
} from '../cards';
import {
  clampToken,
  sacrificeEverything,
  sacrificeInto,
  findOutlets,
  skullclampToken,
  sacrificeTurnWins,
} from '../actions';
import { onPermanentAttacks } from '../triggers';

const repeatName = (cardName: string, count: number) =>
  new Array(count).fill(cardName) as string[];

function board(
  battlefieldNames: string[] = [],
  hand: string[] = [],
  graveyardNames: string[] = [],
  lands = [...repeatName('Swamp', 5), ...repeatName('Plains', 2), 'Mountain'],
): EdgarGame {
  const game = new EdgarGame([], repeatName('Swamp', 60), new Rng(1), {
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
    const otherPermanent = new Permanent(C.get(cardName));
    otherPermanent.sick = false;
    game.battlefield.push(otherPermanent);
  }
  game.hand = hand.map((cardName) => C.get(cardName));
  game.graveyard = graveyardNames.map((cardName) => C.get(cardName));
  return game;
}

export function runEdgarTests(): boolean {
  let allPassed = true;
  const check = (label: string, got: unknown, expect: unknown) => {
    const good = JSON.stringify(got) === JSON.stringify(expect);
    console.log(
      `${good ? 'OK ' : 'BAD'} ${label}: got ${JSON.stringify(got)}, expected ${JSON.stringify(expect)}`,
    );
    allPassed = allPassed && good;
  };
  const permanentNamed = (game: EdgarGame, name: string) =>
    game.findPermanent(name)!;
  const tokensOf = (game: EdgarGame, card: C.CardDef) =>
    game.battlefield.filter((permanent) => permanent.card === card);

  // ---- anthems
  let game = board(['Legion Lieutenant']);
  let vampire = game.createTokens(TOKENS.vampire)[0];
  check('Legion Lieutenant: a Vampire token is 2/2', game.power(vampire), 2);
  check(
    'Legion Lieutenant does not pump itself',
    game.power(permanentNamed(game, 'Legion Lieutenant')),
    2,
  );
  game = board(['Legion Lieutenant', 'Stromkirk Captain', VANQUISHERS_BANNER]);
  vampire = game.createTokens(TOKENS.vampire)[0];
  check(
    'two lords and the Banner: a Vampire token is 4/4',
    [game.power(vampire), game.toughness(vampire)],
    [4, 4],
  );
  game = board(['Bloodline Keeper']);
  const keeper = permanentNamed(game, 'Bloodline Keeper');
  vampire = game.createTokens(TOKENS.vampire)[0];
  keeper.transformed = true;
  check(
    'Lord of Lineage: Vampires +2/+2, itself 5/5',
    [game.power(vampire), game.power(keeper)],
    [3, 5],
  );

  // ---- Edgar
  game = board([], ['Legion Lieutenant', 'Sol Ring']);
  game.command = [C.get(EDGAR)];
  game.castPerm(C.get('Legion Lieutenant'));
  check(
    'Eminence: a Vampire spell makes a Vampire token (Edgar in the command zone)',
    tokensOf(game, TOKENS.vampire).length,
    1,
  );
  game = board([], ['Sol Ring']);
  game.command = [C.get(EDGAR)];
  game.castPerm(C.get('Sol Ring'));
  check(
    'Eminence: a non-Vampire spell makes nothing',
    tokensOf(game, TOKENS.vampire).length,
    0,
  );
  game = board([EDGAR, 'Cordial Vampire', 'Sol Ring']);
  vampire = game.createTokens(TOKENS.vampire)[0];
  onPermanentAttacks(game, [permanentNamed(game, EDGAR)]);
  check(
    'Edgar attacks: each Vampire gets a +1/+1 counter, a non-Vampire does not',
    [
      permanentNamed(game, EDGAR).counters,
      vampire.counters,
      permanentNamed(game, 'Sol Ring').counters,
    ],
    [1, 1, 0],
  );

  // ---- death triggers
  game = board(['Blood Artist']);
  game.sacrifice(game.createTokens(TOKENS.vampire)[0]);
  check(
    'Blood Artist: a creature dies, one opponent loses 1 and we gain 1',
    [game.life, game.myLife],
    [[39, 40, 40], 41],
  );
  game = board(['Blood Artist']);
  game.sacrifice(permanentNamed(game, 'Blood Artist'));
  check(
    'Blood Artist triggers on its own death',
    [game.life, game.myLife],
    [[39, 40, 40], 41],
  );
  game = board(['Cruel Celebrant']);
  game.sacrifice(game.createTokens(TOKENS.vampire)[0]);
  check(
    'Cruel Celebrant: each opponent loses 1',
    [game.life, game.myLife],
    [[39, 39, 39], 41],
  );
  game = board(['Marionette Apprentice']);
  game.sacrifice(game.createTokens(TOKENS.servo)[0]);
  check(
    'Marionette Apprentice: an artifact creature goes to the graveyard, each opponent loses 1 (no life for us)',
    [game.life, game.myLife],
    [[39, 39, 39], 40],
  );
  game = board(['Susurian Voidborn']);
  game.sacrifice(game.createTokens(TOKENS.treasure)[0]);
  check(
    'Susurian Voidborn: a Treasure (artifact) dying drains 1',
    game.life,
    [39, 40, 40],
  );
  game = board(['Arnyn, Deathbloom Botanist']);
  game.sacrifice(game.createTokens(TOKENS.vampire)[0]);
  check(
    'Arnyn: a 1/1 dies, target opponent loses 2 and we gain 2',
    [game.life, game.myLife],
    [[38, 40, 40], 42],
  );
  game = board(['Cordial Vampire']);
  vampire = game.createTokens(TOKENS.vampire)[0];
  const second = game.createTokens(TOKENS.vampire)[0];
  game.sacrifice(second);
  check(
    'Cordial Vampire: a death puts a counter on each Vampire (itself too)',
    [vampire.counters, permanentNamed(game, 'Cordial Vampire').counters],
    [1, 1],
  );
  game = board(['Elenda, the Dusk Rose']);
  const elenda = permanentNamed(game, 'Elenda, the Dusk Rose');
  game.sacrifice(game.createTokens(TOKENS.servo)[0]);
  game.sacrifice(game.createTokens(TOKENS.servo)[0]);
  check('Elenda: +1/+1 counter for each other death', elenda.counters, 2);
  game.sacrifice(elenda);
  check(
    'Elenda dies with power 3: three lifelink Vampire tokens',
    tokensOf(game, TOKENS.lifelinkVampire).length,
    3,
  );
  game = board(['Pitiless Plunderer']);
  game.sacrifice(game.createTokens(TOKENS.vampire)[0]);
  check(
    'Pitiless Plunderer: a Treasure for each other creature that dies',
    tokensOf(game, TOKENS.treasure).length,
    1,
  );
  game = board(['Pawn of Ulamog', 'Sol Ring']);
  game.sacrifice(game.createTokens(TOKENS.vampire)[0]);
  check(
    'Pawn of Ulamog: a token dying makes no Spawn',
    tokensOf(game, TOKENS.spawn).length,
    0,
  );
  game.sacrifice(permanentNamed(game, 'Pawn of Ulamog'));
  check(
    'Pawn of Ulamog: it making a Spawn when it dies itself',
    tokensOf(game, TOKENS.spawn).length,
    1,
  );
  game = board(['Mayhem Devil']);
  game.sacrifice(game.createTokens(TOKENS.vampire)[0]);
  check('Mayhem Devil: a sacrifice pings for 1', game.life, [39, 40, 40]);
  game.dies(game.createTokens(TOKENS.vampire)[0]);
  check('Mayhem Devil: dying is not a sacrifice', game.life, [39, 40, 40]);
  game = board(['Carmen, Cruel Skymarcher']);
  game.sacrifice(game.createTokens(TOKENS.servo)[0]);
  check(
    'Carmen: a sacrifice gives her a counter and us 1 life',
    [permanentNamed(game, 'Carmen, Cruel Skymarcher').counters, game.myLife],
    [1, 41],
  );

  // ---- tokens and card draw
  game = board(['Welcoming Vampire']);
  game.library = repeatName('Swamp', 10).map((name) => C.get(name));
  game.createTokens(TOKENS.vampire);
  game.createTokens(TOKENS.vampire);
  check(
    'Welcoming Vampire: one card each turn for small creatures entering',
    game.hand.length,
    1,
  );
  game = board(['Baron Bertram Graywater']);
  game.createTokens(TOKENS.servo);
  game.createTokens(TOKENS.servo);
  check(
    'Baron Bertram: one extra Vampire token each turn',
    tokensOf(game, TOKENS.lifelinkVampire).length,
    1,
  );
  game = board(['Dreadhorde Invasion']);
  game.upkeep();
  game.upkeep();
  check(
    'Dreadhorde Invasion: an Army that grows, 1 life each upkeep',
    [tokensOf(game, TOKENS.army).map((army) => army.counters), game.myLife],
    [[2], 38],
  );

  // ---- mana from Treasures and Spawn
  game = board(['Sol Ring'], [], [], ['Swamp', 'Swamp']);
  game.createTokens(TOKENS.treasure);
  game.pay(C.Cost.parse('{1}{B}'), false);
  check(
    'a payment lands and rocks can make leaves the Treasure alone',
    tokensOf(game, TOKENS.treasure).length,
    1,
  );
  game = board([], [], [], ['Swamp', 'Swamp']);
  game.createTokens(TOKENS.treasure);
  game.pay(C.Cost.parse('{1}{B}{B}'), false);
  check(
    'a payment that needs it sacrifices the Treasure',
    tokensOf(game, TOKENS.treasure).length,
    0,
  );

  // ---- sacrifice outlets
  game = board(['Viscera Seer', 'Blood Artist']);
  game.createTokens(TOKENS.vampire);
  game.createTokens(TOKENS.vampire);
  check(
    'sacrifice outlets: found and free',
    findOutlets(game).map((outlet) => outlet.permanent.card.name),
    ['Viscera Seer'],
  );
  game = board(['Evereth, Viceroy of Plunder', 'Viscera Seer']);
  const evereth = permanentNamed(game, EVERETH);
  sacrificeInto(game, findOutlets(game)[0], game.createTokens(TOKENS.servo)[0]);
  check(
    'Evereth as the outlet: +1/+1 counter per sacrifice (the first outlet found)',
    evereth.counters + permanentNamed(game, 'Viscera Seer').counters,
    1,
  );
  game = board([EVERETH, 'Viscera Seer']);
  game.life = [5, 5, 5];
  game.createTokens(TOKENS.servo, 3);
  check(
    'the all-in sacrifice turn is seen as a win: Evereth 2 + 3 counters = 5 to each opponent',
    sacrificeTurnWins(game),
    true,
  );
  sacrificeEverything(game);
  check(
    'the all-in sacrifice turn: Evereth hits each opponent for its power',
    game.hasWon(),
    true,
  );
  game = board([EVERETH, 'Viscera Seer']);
  game.life = [40, 40, 40];
  game.createTokens(TOKENS.servo, 2);
  check(
    'the all-in sacrifice turn is not tried when it cannot win',
    sacrificeTurnWins(game),
    false,
  );

  // ---- a pod: the explosion can be answered while Evereth is still there
  game = board([EVERETH]);
  check(
    'winAttempt: nothing declared, nothing to answer',
    game.winAttempt(),
    null,
  );
  game.explosionPending = permanentNamed(game, EVERETH);
  check(
    'winAttempt: Evereth is the permanent an answer must hit',
    game.winAttempt(),
    { spells: [], perms: [EVERETH], backup: 0 },
  );
  const destroy = { kind: 'removal', instant: true, how: 'destroy' } as const;
  const exile = { kind: 'removal', instant: true, how: 'exile' } as const;
  check(
    'a destroy effect does not stop the explosion (it makes Evereth die), exile does',
    [
      game.podCanTarget(permanentNamed(game, EVERETH), destroy),
      game.podCanTarget(permanentNamed(game, EVERETH), exile),
    ],
    [false, true],
  );
  game.podWinStopped();
  check('a stopped win clears the declared explosion', game.winAttempt(), null);
  // a stub arena makes this the real game of a pod: the explosion is declared only if Evereth was pumped
  const inPod = (podGame: EdgarGame) => {
    podGame.arena = { real: () => true } as unknown as Arena;
    return podGame;
  };
  game = inPod(board([EVERETH, 'Viscera Seer']));
  game.life = [2, 2, 2];
  sacrificeEverything(game);
  check(
    'no pump: Evereth is sacrificed for real, nothing to answer',
    [game.hasWon(), game.winAttempt(), game.findPermanent(EVERETH)],
    [true, null, null],
  );
  game = inPod(board([EVERETH, 'Viscera Seer']));
  game.life = [5, 5, 5];
  game.createTokens(TOKENS.servo, 3);
  sacrificeEverything(game);
  check(
    'pumped three times: declared with Evereth still on the battlefield',
    [
      game.hasWon(),
      game.winAttempt()?.perms,
      game.findPermanent(EVERETH) !== null,
    ],
    [true, [EVERETH], true],
  );
  game.podWinStopped();
  check(
    'an answer puts the life totals back to before the explosion',
    game.life,
    [5, 5, 5],
  );

  // ---- where the damage comes from (the win statistics)
  game = board(['Blood Artist']);
  game.sacrifice(game.createTokens(TOKENS.vampire)[0]);
  game.withDamageSource('combat', () => game.damageOpponent(1, 4));
  game.withDamageSource('explosion', () => game.damageOpponent(2, 5));
  check(
    'damage is counted by source: drain, combat, explosion',
    [game.damageFromDrains, game.damageFromCombat, game.damageFromExplosion],
    [1, 4, 5],
  );
  game.life = [1, 1, 1];
  game.withDamageSource('drain', () => game.drainAllOpponents(1));
  check(
    'the kill is credited to the damage that dealt it',
    game.winSource,
    'drain',
  );

  // ---- Nine-Lives Familiar
  game = board([]);
  const familiar = game.enter(C.get(NINE_LIVES_FAMILIAR), 'hand');
  check(
    'Nine-Lives Familiar: cast, it has 8 revival counters',
    familiar.marks,
    8,
  );
  game.sacrifice(familiar);
  check(
    'Nine-Lives Familiar dies: it waits in the graveyard for the end step',
    [
      game.battlefield.some((permanent) => permanent === familiar),
      game.graveyard.length,
    ],
    [false, 1],
  );
  game.endStep();
  const revived = game.findPermanent(NINE_LIVES_FAMILIAR)!;
  check('it returns at the end step with 7 counters', revived.marks, 7);

  // ---- Skullclamp
  game = board(['Skullclamp']);
  game.library = repeatName('Swamp', 10).map((name) => C.get(name));
  const clamped = game.createTokens(TOKENS.vampire)[0];
  check('Skullclamp: a 1/1 token is a target', skullclampToken(game), clamped);
  clampToken(game, clamped);
  check(
    'Skullclamp: the token dies and we draw two',
    [game.hand.length, game.creatures().length],
    [2, 0],
  );
  game = board(['Skullclamp', 'Legion Lieutenant']);
  game.createTokens(TOKENS.vampire);
  check(
    'Skullclamp: a token with a lord is 2/2 and not a target',
    skullclampToken(game),
    null,
  );

  // ---- prepared spells and the end step
  game = board(['Blood Artist']);
  game.createTokens(TOKENS.vampire);
  game.createTokens(TOKENS.vampire);
  const emeritus = game.enter(C.get('Emeritus of Woe'), 'hand');
  check('Emeritus of Woe enters prepared', game.prepared.has(emeritus), true);
  const copy = game.clone();
  check(
    'a copy of the game keeps the prepared spell on the copied permanent',
    [...copy.prepared].every((permanent) =>
      copy.battlefield.includes(permanent),
    ),
    true,
  );

  return allPassed;
}
