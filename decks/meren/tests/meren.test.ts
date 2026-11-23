/** Rules checks on hand-built boards. Run: npm run sim -- meren --test */
import * as C from '../../../engine/cards/cards';
import { Permanent } from '../../../engine/game/game-types';
import { Rng } from '../../../engine/util/rng';
import { CFG } from '../config';
import { castSawInHalf } from '../actions';
import { MerenGame } from '../game';
import { buildCandidates } from '../candidates';
import { TREASURE } from '../../../engine/cards/tokens';
import { Arena } from '../../../engine/game/game-types';
import { playGoldfishOpponentsTurns } from '../../../engine/game/turn';
import { GRAY_MERCHANT, MEREN, TOKENS } from '../cards';
import {
  EVOLUTIONARY_LEAP,
  FIEND_ARTISAN,
  HIGH_MARKET,
  PROMISE_OF_ACLAZOTZ,
  SIDISI_REGENT,
  YAHENNI,
  activateFiendArtisan,
  activateSidisi,
  castFoulRebirth,
  castFromAdventure,
} from '../../../engine/game/sacrifice-outlets';
import { JUNJI } from '../junji';

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
  game.experienceCounters = 5;
  game.endStep();
  check(
    'Meren with 5 experience returns Gray Merchant to the battlefield',
    game.isOnBattlefield('Gray Merchant of Asphodel'),
    true,
  );
  check('... which drains 3 each', game.life, [37, 37, 37]);

  // ... with 4 experience it goes to hand instead
  game = board(['Meren of Clan Nel Toth'], [], ['Gray Merchant of Asphodel']);
  game.experienceCounters = 4;
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
  game.experienceCounters = 5;
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
    game.experienceCounters,
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

  // Ophiomancer: a deathtouch Snake at each upkeep (ours and the opponents'), only if we have none
  game = board(['Ophiomancer']);
  game.opponentUpkeep();
  const snakes = game.battlefield.filter(
    (permanent) => permanent.card.name === 'Snake',
  );
  check('Ophiomancer: a Snake at an opponent upkeep', snakes.length, 1);
  check(
    '... with deathtouch',
    snakes[0]?.card.keywords.has('deathtouch'),
    true,
  );
  game.upkeep();
  game.opponentUpkeep();
  check(
    '... and no second Snake while we have one',
    game.battlefield.filter((permanent) => permanent.card.name === 'Snake')
      .length,
    1,
  );

  checkOpponentsTurns(check);
  checkJunji(check);
  checkSacrificeOutlets(check);

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

  // Wight of the Reliquary: {T}, sacrifice another creature (an expendable one): a land onto the battlefield tapped
  game = board(['Wight of the Reliquary', 'Sakura-Tribe Elder']);
  const wight = game.findPermanent('Wight of the Reliquary')!;
  const landsBefore = game.landsOnBattlefield().length;
  const wightCandidate = buildCandidates(game, true).find(
    (candidate) => candidate.score === 48,
  );
  wightCandidate?.action();
  check(
    'Wight of the Reliquary: sacrifices the Elder, a tapped land comes in, the Wight is tapped',
    [
      game.isOnBattlefield('Sakura-Tribe Elder'),
      game.landsOnBattlefield().length - landsBefore,
      game.landsOnBattlefield().some((land) => land.tapped),
      wight.tapped,
    ],
    [false, 1, true, true],
  );
  // Village Rites: any expendable creature will do (Llanowar Elves with Meren out), not only tokens
  game = board(['Meren of Clan Nel Toth', 'Llanowar Elves'], ['Village Rites']);
  check(
    'Village Rites: Llanowar Elves is expendable, so it can be cast',
    buildCandidates(game, false).some((candidate) => candidate.score === 52),
    true,
  );
  // Disciple of Bolas: sacrifices the creature worth the most cards (Protean Hulk: 6 cards, and its death trigger)
  game = board(
    ['Meren of Clan Nel Toth', 'Llanowar Elves', 'Protean Hulk'],
    ['Disciple of Bolas'],
  );
  const handBefore = game.hand.length;
  game.enter(C.get('Disciple of Bolas'));
  check(
    'Disciple of Bolas: sacrifices Protean Hulk, not the Elves: 6 cards and 6 life',
    [
      game.isOnBattlefield('Protean Hulk'),
      game.isOnBattlefield('Llanowar Elves'),
      game.hand.length - handBefore,
      game.myLife,
    ],
    [false, true, 6, 46],
  );
  // ... and an enter trigger Meren gives back this turn beats a plain body of the same power
  game = board(
    ['Meren of Clan Nel Toth', 'Llanowar Elves', 'Satyr Wayfinder'],
    [],
  );
  game.experienceCounters = 1;
  const disciple = new Permanent(C.get('Disciple of Bolas'));
  check(
    'Disciple of Bolas: Satyr Wayfinder (Meren returns it, it mills again) over Llanowar Elves',
    game.chooseDiscipleSacrifice(disciple)?.card.name,
    'Satyr Wayfinder',
  );

  // Card draw (T6 draw round): what to sacrifice, and what each card drew
  game = board(
    ['Meren of Clan Nel Toth', 'Llanowar Elves', 'Grave Titan'],
    ['Deadly Dispute'],
  );
  check(
    'Deadly Dispute sacrifices the Elves (expendable with Meren out), never Grave Titan or Meren',
    game.chooseSacrificeForDraw(true)?.card.name,
    'Llanowar Elves',
  );
  game = board(['Meren of Clan Nel Toth', 'Grave Titan'], ['Deadly Dispute']);
  game.createTokens(TREASURE);
  check(
    'Deadly Dispute with only Grave Titan to lose: a Treasure goes instead (creatures only, as Plumb has it: none)',
    [
      game.chooseSacrificeForDraw(true)?.card.name,
      game.chooseSacrificeForDraw(false)?.card.name,
    ],
    ['Treasure', undefined],
  );
  game = board(['Llanowar Elves', 'Sakura-Tribe Elder', 'Woe Strider']);
  game.turn = 6;
  check(
    'Plumb the Forbidden: sacrifices the expendable creatures (at most three)',
    game.choosePlumbSacrifices().length,
    2,
  );
  game.myLife = 17;
  check(
    'Plumb the Forbidden: not below 15 life (1 life each, one card for the spell)',
    game.choosePlumbSacrifices().length,
    1,
  );
  game = board(['Llanowar Elves', 'Skullclamp'], []);
  game.createTokens(TREASURE);
  game.turn = 3; // an Elf is our mana this early: not one to clamp
  check(
    'Skullclamp: not equipped to Llanowar Elves on turn 3',
    buildCandidates(game, false).some((candidate) => candidate.score === 75),
    false,
  );
  game.turn = 6;
  check(
    'Skullclamp: equipped to Llanowar Elves on turn 6 (it dies, two cards)',
    buildCandidates(game, false).some((candidate) => candidate.score === 75),
    true,
  );
  game = board(['Greater Good', 'Grave Titan', 'Llanowar Elves']);
  game.turn = 6;
  check(
    'Greater Good: Grave Titan is not given up without Meren to bring it back',
    game.chooseGreaterGoodSacrifice(),
    null,
  );
  game = board(['Greater Good', 'Meren of Clan Nel Toth', 'Grave Titan']);
  game.experienceCounters = 5;
  check(
    'Greater Good: with Meren and 5 experience, Grave Titan is the one to sacrifice',
    game.chooseGreaterGoodSacrifice()?.card.name,
    'Grave Titan',
  );
  // Greater Good's discards: surplus lands first, then creature cards, spells we may cast last
  game = board(['Greater Good', 'Meren of Clan Nel Toth']);
  game.experienceCounters = 5;
  game.hand = [
    "Dina's Guidance",
    'Grave Titan',
    'Swamp',
    'Gray Merchant of Asphodel',
  ].map((name) => C.get(name));
  game.discard(1);
  const firstDiscard = game.graveyard.map((card) => card.name);
  game.hand = ['Grave Titan', 'Gray Merchant of Asphodel'].map((name) =>
    C.get(name),
  );
  game.discard(1);
  check(
    'Greater Good discards the surplus Swamp first, then of two creatures the one Meren returns at once (Grave Titan)',
    [firstDiscard, game.graveyard.map((card) => card.name)],
    [['Swamp'], ['Swamp', 'Grave Titan']],
  );
  game = board(['Greater Good', 'Meren of Clan Nel Toth', 'Grave Titan']);
  game.experienceCounters = 5;
  check(
    'Greater Good: with Meren and 5 experience, Grave Titan is the one to sacrifice',
    game.chooseGreaterGoodSacrifice()?.card.name,
    'Grave Titan',
  );
  game = board(['Greater Good', 'Meren of Clan Nel Toth', 'Grave Titan']);
  game.experienceCounters = 5;
  game.library = repeatName('Swamp', 10).map((name) => C.get(name));
  check(
    'Greater Good: not with a library of 10 cards (it would mill us out)',
    game.chooseGreaterGoodSacrifice(),
    null,
  );
  game.library = repeatName('Swamp', 40).map((name) => C.get(name));
  game.endStep();
  check(
    'Greater Good at the end step: Grave Titan sacrificed (6 cards, 3 discarded), Meren returns it',
    [
      game.cardsDrawnFor('Greater Good'),
      game.cardsDiscardedBy['Greater Good'],
      game.isOnBattlefield('Grave Titan'),
    ],
    [6, 3, true],
  );
  // Dark Ritual: also cast to make two plays instead of one (3 lands: Viscera Seer, or Woe Strider; with the ritual both)
  const ritualTurn = (severalPlays: number) => {
    const ritualGame = board(
      [],
      ['Dark Ritual', 'Viscera Seer', 'Woe Strider'],
      [],
      repeatName('Swamp', 3),
    );
    ritualGame.config.ritual_several_plays = severalPlays;
    const candidates = ritualGame.orderedCandidates(false);
    const ritual = candidates.findIndex(
      (candidate) =>
        candidate.rock === undefined && candidate.isInstantOrSorcery,
    );
    return ritual === 0;
  };
  check(
    'Dark Ritual with a 1-mana and a 3-mana creature and 3 lands: cast first with the new rule, not with the old one',
    [ritualTurn(1), ritualTurn(0)],
    [true, false],
  );
  // Rise of the Dark Realms: only with 4 creature cards in the graveyard; they all come back
  game = board(
    [],
    ['Rise of the Dark Realms'],
    ['Grave Titan', 'Shriekmaw', 'Llanowar Elves'],
    repeatName('Swamp', 9),
  );
  check(
    'Rise of the Dark Realms is not cast with 3 creature cards in the graveyard',
    buildCandidates(game, false).length,
    0,
  );
  game.graveyard.push(C.get('Woe Strider'));
  check(
    'Rise of the Dark Realms is cast with 4: all of them come back',
    [
      buildCandidates(game, false).length,
      game.castInstantOrSorcery(C.get('Rise of the Dark Realms')),
      game.creatures().length,
    ],
    [1, true, 10], // four cards, Grave Titan's two Zombies, Woe Strider's Goat, and a vanilla 5/5 for each of the 3 goldfish opponents
  );
  // --diag counts the cards a card drew, in the games where it was played
  game = board(['Midnight Reaper', 'Llanowar Elves']);
  game.library = repeatName('Swamp', 5).map((name) => C.get(name));
  game.turn = 6;
  game.cardsPlayed.add('Midnight Reaper');
  game.sacrifice(game.findPermanent('Llanowar Elves')!);
  game.createTokens(TREASURE);
  check(
    'diag: the Reaper drew one card; a card never played counts as nothing',
    [game.diag()['drew:Midnight Reaper'], game.diag()['drew:Skullclamp']],
    [1, null],
  );

  return allPassed;
}

type Check = (label: string, got: unknown, expect: unknown) => void;

const isOnBattlefieldCount = (game: MerenGame, cardName: string) =>
  game.battlefield.filter((permanent) => permanent.card.name === cardName)
    .length;

/** The opponents' turns (opponents-turns.ts): the Snake in every end step, Junji for Gray Merchant. */
function checkOpponentsTurns(check: Check): void {
  let game = board([MEREN, 'Ophiomancer', 'Viscera Seer']);
  playGoldfishOpponentsTurns(game);
  check(
    "Ophiomancer: the Snake is sacrificed in each opponent's end step (3 experience)",
    game.experienceCounters,
    3,
  );
  game = board([MEREN, 'Ophiomancer', 'Viscera Seer']);
  game.config.opponents_turns = 0;
  playGoldfishOpponentsTurns(game);
  check(
    '... and with opponents_turns=0 only a Snake is made',
    [game.experienceCounters, isOnBattlefieldCount(game, 'Snake')],
    [0, 1],
  );
  game = board([MEREN, 'Ophiomancer']);
  playGoldfishOpponentsTurns(game);
  check('... not without a free outlet', game.experienceCounters, 0);

  // Junji at an opponent's end step: Gray Merchant goes first, Junji returns it, Twilight Diviner (used on our turn,
  // fresh in this one) copies it. The copy enters before the drains resolve: devotion 6 (two Gray Merchants 4, Diviner 1,
  // Seer 1) for each drain.
  game = board([JUNJI, 'Twilight Diviner', 'Viscera Seer', GRAY_MERCHANT]);
  game.divinerUsed = true;
  game.opponentUpkeep();
  game.opponentEndStep();
  check(
    'Junji at an opponent end step: Gray Merchant back and copied, two drains',
    [game.life, isOnBattlefieldCount(game, GRAY_MERCHANT)],
    [[28, 28, 28], 2],
  );
  check(
    '... Junji is in the graveyard for Meren',
    game.graveyard.some((card) => card.name === JUNJI),
    true,
  );
  // our end step: Diviner has copied something this turn, so Junji is kept for an opponent's turn
  game = board(
    [MEREN, JUNJI, 'Twilight Diviner', 'Viscera Seer'],
    [],
    [GRAY_MERCHANT],
  );
  game.divinerUsed = true;
  game.endStep();
  check(
    "... and kept at our end step when Diviner's copy is used up this turn",
    isOnBattlefieldCount(game, JUNJI),
    1,
  );
  game = board([JUNJI, 'Twilight Diviner', GRAY_MERCHANT]);
  game.opponentUpkeep();
  game.opponentEndStep();
  check(
    '... not without a sacrifice outlet',
    isOnBattlefieldCount(game, JUNJI),
    1,
  );
}

/** The outlet round (2026-11-23): the new outlets at Meren's end step, and the Pod-like cards. */
function checkSacrificeOutlets(check: Check): void {
  const withZombie = (game: MerenGame) => {
    game.createTokens(TOKENS.zombie);
    return game;
  };
  let game = withZombie(board([MEREN, YAHENNI]));
  game.endStep();
  check(
    'Yahenni is a free outlet at the end step: the Zombie is sacrificed',
    [isOnBattlefieldCount(game, 'Zombie'), game.experienceCounters],
    [0, 1],
  );
  game = withZombie(
    board([MEREN], [], [], [...repeatName('Swamp', 3), HIGH_MARKET]),
  );
  game.endStep();
  check(
    'High Market: taps to sacrifice the Zombie, we gain 1',
    [
      isOnBattlefieldCount(game, 'Zombie'),
      game.findPermanent(HIGH_MARKET)?.tapped,
      game.myLife,
    ],
    [0, true, 41],
  );
  game = withZombie(board([MEREN, EVOLUTIONARY_LEAP]));
  game.library = ['Swamp', 'Forest', 'Grave Titan', 'Swamp'].map((name) =>
    C.get(name),
  );
  game.endStep();
  check(
    'Evolutionary Leap ({G}): sacrifice the Zombie, Grave Titan to the hand, Swamp and Forest to the bottom',
    [game.hand.map((card) => card.name), game.library.map((card) => card.name)],
    [['Grave Titan'], ['Swamp', 'Swamp', 'Forest']],
  );
  game = withZombie(board([MEREN, 'Vampiric Rites']));
  game.endStep();
  check(
    'Vampiric Rites ({1}{B}) sacrifices the Zombie at the end step: a card and 1 life',
    [isOnBattlefieldCount(game, 'Zombie'), game.hand.length, game.myLife],
    [0, 1, 41],
  );
  game = withZombie(board([MEREN, PROMISE_OF_ACLAZOTZ, 'Sakura-Tribe Elder']));
  game.endStep();
  check(
    'Promise of Aclazotz at the end step: Sakura-Tribe Elder sacrificed, the Zombie copied',
    [
      isOnBattlefieldCount(game, 'Sakura-Tribe Elder'),
      isOnBattlefieldCount(game, 'Zombie'),
    ],
    [0, 2],
  );

  // Foul Rebirth, then Promise of Aclazotz from exile
  game = board(['Llanowar Elves'], [PROMISE_OF_ACLAZOTZ]);
  const promise = game.hand[0];
  castFoulRebirth(game, promise, game.findPermanent('Llanowar Elves')!);
  check(
    'Foul Rebirth: the Elves for a 4/3 flying Vampire Demon, the card on an adventure in exile',
    [
      isOnBattlefieldCount(game, 'Vampire Demon'),
      game.exile.includes(promise),
      game.cardsOnAdventure.length,
    ],
    [1, true, 1],
  );
  castFromAdventure(game, promise);
  check(
    '... then Promise of Aclazotz is cast from exile',
    [isOnBattlefieldCount(game, PROMISE_OF_ACLAZOTZ), game.exile.length],
    [1, 0],
  );

  // Fiend Artisan: +1/+1 per creature card in the graveyard; {X}{B}, {T}, sacrifice: Grave Titan (X = 6, 7 lands)
  game = board(
    [FIEND_ARTISAN, 'Llanowar Elves'],
    [],
    ['Viscera Seer', 'Satyr Wayfinder'],
  );
  const artisan = game.findPermanent(FIEND_ARTISAN)!;
  check(
    'Fiend Artisan is a 3/3 with two creature cards in the graveyard',
    game.power(artisan),
    3,
  );
  game.library.push(C.get('Grave Titan'));
  check(
    '... and fetches Grave Titan for X = 6 by sacrificing the Elves',
    [
      activateFiendArtisan(
        game,
        artisan,
        game.findPermanent('Llanowar Elves')!,
        6,
        (cards) => cards[0],
      ),
      isOnBattlefieldCount(game, 'Grave Titan'),
      artisan.tapped,
    ],
    [true, 1, true],
  );

  // Sidisi: sacrifice mana value 1 (Llanowar Elves) for mana value 2 from the graveyard
  game = board(
    [SIDISI_REGENT, 'Llanowar Elves'],
    [],
    ['Fauna Shaman', 'Grave Titan'],
  );
  const sidisi = game.findPermanent(SIDISI_REGENT)!;
  const elves = game.findPermanent('Llanowar Elves')!;
  check(
    'Sidisi: mana value 1 cannot return Grave Titan (6)',
    activateSidisi(game, sidisi, elves, game.graveyard[1]),
    false,
  );
  check(
    '... but returns Fauna Shaman (2)',
    [
      activateSidisi(game, sidisi, elves, game.graveyard[0]),
      isOnBattlefieldCount(game, 'Fauna Shaman'),
    ],
    [true, 1],
  );
}

/** Junji's death (junji.ts): the mode worth more, from any graveyard in a pod. */
function checkJunji(check: Check): void {
  const killJunji = (game: MerenGame) =>
    game.sacrifice(game.findPermanent(JUNJI)!);

  let game = board([JUNJI], [], ['Llanowar Elves']);
  killJunji(game);
  check(
    'Junji, goldfish: Llanowar Elves is worth less than 2 life from each opponent',
    [game.life, isOnBattlefieldCount(game, 'Llanowar Elves')],
    [[38, 38, 38], 0],
  );
  game = board([JUNJI], [], ['Llanowar Elves', 'Grave Titan']);
  killJunji(game);
  check(
    '... Grave Titan comes back, we lose 2',
    [isOnBattlefieldCount(game, 'Grave Titan'), game.myLife, game.life],
    [1, 38, [40, 40, 40]],
  );

  // a pod: opponents' graveyards and hands (a stub arena)
  const discarded: number[] = [];
  const inPod = (
    podGame: MerenGame,
    opponentGraveyards: string[][],
    handSize: number,
  ) => {
    const graveyards = opponentGraveyards.map((names) =>
      names.map((name) => C.get(name)),
    );
    podGame.arena = {
      real: () => true,
      announceDeath: () => {},
      edict: () => {},
      handSize: () => handSize,
      creatureCardsOfGraveyard: (_game: MerenGame, slot: number) =>
        graveyards[slot],
      takeCreatureCardFromGraveyard: (
        _game: MerenGame,
        slot: number,
        card: C.CardDef,
      ) => graveyards[slot].splice(graveyards[slot].indexOf(card), 1),
      discardOneOpponentsCards: (_game: MerenGame, slot: number) =>
        discarded.push(slot),
    } as unknown as Arena;
    return podGame;
  };
  game = inPod(
    board([JUNJI], [], ['Llanowar Elves']),
    [[], ['Grave Titan'], []],
    0,
  );
  killJunji(game);
  check(
    'Junji, pod: a big creature in an opponent graveyard beats the discard (empty hands)',
    [isOnBattlefieldCount(game, 'Grave Titan'), discarded.length],
    [1, 0],
  );
  game = inPod(board([JUNJI], [], []), [['Llanowar Elves'], [], []], 7);
  killJunji(game);
  check(
    '... a weak one does not: each opponent discards',
    [isOnBattlefieldCount(game, 'Llanowar Elves'), discarded.length],
    [0, 3],
  );
  game = inPod(
    board([JUNJI], [], [GRAY_MERCHANT]),
    [['Grave Titan'], [], []],
    0,
  );
  killJunji(game);
  check(
    '... our own Gray Merchant beats their Grave Titan',
    [
      isOnBattlefieldCount(game, GRAY_MERCHANT),
      isOnBattlefieldCount(game, 'Grave Titan'),
    ],
    [1, 0],
  );
}
