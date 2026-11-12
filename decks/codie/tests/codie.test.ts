/** Rules and solver checks on hand-built boards. Run: npm run sim -- codie --test */
import * as C from '../../../engine/cards';
import { Perm } from '../../../engine/game-types';
import { Rng } from '../../../engine/rng';
import { CFG } from '../config';
import { CodieGame } from '../game';
import { findKillLine } from '../solver';
import {
  activateCodie,
  castAdNauseamWithTeferi,
  castVault,
  flashbackTutor,
  suspendProfaneTutor,
} from '../solver-actions';
import { finisherKills, reiterateCopyCost } from '../finishers';

const repeatName = (cardName: string, count: number) =>
  new Array(count).fill(cardName) as string[];

function board(
  lands: string[],
  hand: string[],
  battlefieldNames: string[] = [],
  library: string[] = repeatName('Island', 40),
  config = {},
): CodieGame {
  const game = new CodieGame([], library, new Rng(1), { ...CFG, ...config });
  game.startTurn();
  game.turn = 7;
  for (const landName of lands) {
    const card = C.get(landName);
    const permanent = new Perm(card, card.land);
    permanent.sick = false;
    game.battlefield.push(permanent);
  }
  for (const cardName of battlefieldNames) {
    const otherPermanent = new Perm(C.get(cardName));
    otherPermanent.sick = false;
    game.battlefield.push(otherPermanent);
  }
  game.hand = hand.map((cardName) => C.get(cardName));
  return game;
}

export function runCodieTests(): boolean {
  let allPassed = true;
  const check = (label: string, got: unknown, expect: unknown) => {
    const good = JSON.stringify(got) === JSON.stringify(expect);
    console.log(
      `${good ? 'OK ' : 'BAD'} ${label}: got ${JSON.stringify(got)}, expected ${JSON.stringify(expect)}`,
    );
    allPassed = allPassed && good;
  };
  const five = [
    'Mountain',
    'Mountain',
    'Swamp',
    'Swamp',
    'Island',
    'Plains',
    'Forest',
    'Forest',
    'Mountain',
  ]; // 9 lands, 3 red, 2 black
  const twelve = [...five, 'Mountain', 'Swamp', 'Island']; // 12 lands: 4 red, 3 black
  const thirteen = [...twelve, 'Plains'];
  const loops = (game: CodieGame) =>
    findKillLine(game)?.steps.some((step) => step.startsWith('loop')) ?? false;

  // ---- the finishers' arithmetic
  let game = board(five, []);
  check(
    'Exsanguinate: X=40 kills three opponents at 40',
    finisherKills(game, 'Exsanguinate', 40, 1, 40, 3),
    true,
  );
  check(
    'Exsanguinate with one copy: X=20',
    finisherKills(game, 'Exsanguinate', 20, 2, 40, 3),
    true,
  );
  check(
    'Exsanguinate X=19 with one copy does not',
    finisherKills(game, 'Exsanguinate', 19, 2, 40, 3),
    false,
  );
  check(
    'Crackle with Power: X=8 (40 to each of 8 targets) kills',
    finisherKills(game, 'Crackle with Power', 8, 1, 40, 3),
    true,
  );
  check(
    'Crackle X=4 needs a copy (20 twice)',
    [
      finisherKills(game, 'Crackle with Power', 4, 1, 40, 3),
      finisherKills(game, 'Crackle with Power', 4, 2, 40, 3),
    ],
    [false, true],
  );
  check(
    'Torment of Hailfire: X=19 (5 payments each, then 3 per repeat) kills',
    [
      finisherKills(game, 'Torment of Hailfire', 18, 1, 40, 3),
      finisherKills(game, 'Torment of Hailfire', 19, 1, 40, 3),
    ],
    [false, true],
  );
  check(
    'Torment X=10 with one copy kills (20 repeats)',
    finisherKills(game, 'Torment of Hailfire', 10, 2, 40, 3),
    true,
  );

  // ---- copy costs
  game = board(five, ['Reiterate']);
  check(
    'one Reiterate (no buyback) = one copy costs {1}{R}{R}',
    reiterateCopyCost(game, 2)!.toString(),
    '{1}RR',
  );
  check(
    'two copies from Reiterate: buyback the first (6) + the second (3) = 9 mana',
    reiterateCopyCost(game, 3)!.manaValue,
    9,
  );
  game = board(five, ['Reiterate', 'Return the Favor']);
  check(
    'Return the Favor makes a copy cheaper than a second Reiterate',
    reiterateCopyCost(game, 3)!.manaValue,
    6,
  );

  // ---- the solver
  game = board(five, ['Crackle with Power']);
  check(
    '9 lands, Crackle: no kill (no loop, no copy)',
    findKillLine(game),
    null,
  );
  game = board(
    [...five, ...repeatName('Mountain', 5), ...repeatName('Swamp', 4)],
    ['Torment of Hailfire', 'Reiterate'],
  );
  check(
    '18 lands: Torment X=10 with a Reiterate copy (15 mana) kills',
    findKillLine(game) !== null,
    true,
  );
  game = board(five, ['Reiterate', "Jeska's Will", 'Crackle with Power']);
  check(
    "Jeska's Will + Reiterate (9 mana: 3 + 6 buyback): a bottomless loop, then Crackle X=8 (red only)",
    [findKillLine(game) !== null, loops(game)],
    [true, true],
  );
  game = board(five, ['Reiterate', "Jeska's Will", 'Exsanguinate']);
  check(
    '...but Exsanguinate needs BB and the loop used every land: no kill',
    findKillLine(game),
    null,
  );
  game = board(
    [...five, 'Swamp', 'Swamp'],
    ['Reiterate', "Jeska's Will", 'Exsanguinate'],
  );
  check(
    '...with two more Swamps left over after the loop: Exsanguinate X=40, the infinite red pays the generic',
    findKillLine(game) !== null,
    true,
  );
  game = board(
    five,
    ['Reiterate', "Jeska's Will", 'Crackle with Power'],
    [],
    repeatName('Island', 40),
    { opp_hand: 6 },
  );
  check(
    "Jeska's Will with only 6 cards in the opponent's hand: a copy costs 6, so no loop",
    loops(game),
    false,
  );
  game = board(
    twelve,
    ['Reiterate', 'Mana Geyser', 'Crackle with Power'],
    [],
    repeatName('Island', 40),
    { opp_tapped_lands: 6 },
  );
  check(
    'Mana Geyser with 6 tapped opposing lands is break-even: not a loop',
    loops(game),
    false,
  );
  game = board(
    twelve,
    ['Reiterate', 'Mana Geyser', 'Crackle with Power'],
    [],
    repeatName('Island', 40),
    { opp_tapped_lands: 8 },
  );
  check(
    'Mana Geyser with 8 tapped opposing lands (5 + 6 = 11 mana): a loop',
    loops(game),
    true,
  );
  game = board(
    five,
    ['Reiterate', 'Mana Geyser', 'Crackle with Power'],
    [],
    repeatName('Island', 40),
    { opp_tapped_lands: 8 },
  );
  check("...with 9 lands it can't start", loops(game), false);
  game = board(thirteen, [
    'Reiterate',
    "Brass's Bounty",
    'Torment of Hailfire',
  ]);
  check(
    "Brass's Bounty with 13 lands (7 + 6 mana; 13 Treasures per copy): a loop, any colour",
    loops(game),
    true,
  );
  game = board(
    ['Mountain', 'Mountain', 'Swamp', 'Swamp', 'Island'],
    ['Reiterate', "Jeska's Will", 'Crackle with Power'],
  );
  check(
    'only 5 lands: the loop needs 9 mana, no kill',
    findKillLine(game),
    null,
  );

  // ---- rituals and tutors
  game = board(
    twelve,
    ['Demonic Tutor', "Jeska's Will", 'Reiterate'],
    [],
    ['Crackle with Power', ...repeatName('Island', 40)],
  );
  check(
    '12 lands: Demonic Tutor for Crackle (2), then the Will loop (9) and Crackle',
    findKillLine(game) !== null,
    true,
  );
  game = board(five, [
    'Seething Song',
    'Dark Ritual',
    'Pyretic Ritual',
    'Torment of Hailfire',
    'Reiterate',
  ]);
  check(
    '9 lands + Seething Song, Dark Ritual, Pyretic Ritual (+5 net) = 14 mana: Torment X=10 with a Reiterate copy needs 15: no kill',
    findKillLine(game),
    null,
  );
  game = board(
    [...five, 'Mountain'],
    [
      'Seething Song',
      'Dark Ritual',
      'Pyretic Ritual',
      'Torment of Hailfire',
      'Reiterate',
    ],
  );
  check(
    '...with a tenth land it is 15 mana: kill',
    findKillLine(game) !== null,
    true,
  );

  // ---- Codie + a spell of mana value 1 = the free Profane Tutor (the only mana value 0 instant or sorcery)
  const lib = [
    'Profane Tutor',
    "Teferi's Protection",
    'Reiterate',
    "Jeska's Will",
    'Crackle with Power',
    ...repeatName('Island', 40),
  ];
  game = board(
    five,
    ['Silence', 'Ad Nauseam'],
    ['Codie, Vociferous Codex'],
    lib,
  );
  game.findPermanent('Codie, Vociferous Codex')!.sick = false;
  const silenceKillLine = findKillLine(game);
  check(
    "Codie + Silence -> Profane Tutor -> Teferi's Protection, then Ad Nauseam: the library in hand, a kill next turn",
    [
      silenceKillLine !== null,
      silenceKillLine?.nextTurn,
      silenceKillLine?.steps.some((step) => step.startsWith('Codie + Silence')),
    ],
    [true, true, true],
  );
  game = board(five, ['Silence', 'Ad Nauseam'], [], lib);
  check(
    "without Codie there is no tutor for Teferi's Protection: no kill",
    findKillLine(game),
    null,
  );
  game = board(five, ['Ad Nauseam', "Teferi's Protection"], [], lib);
  check(
    "Ad Nauseam + Teferi's Protection in hand (8 mana): a kill next turn",
    findKillLine(game)?.nextTurn,
    true,
  );
  game = board(five, ['Ad Nauseam', "Teferi's Protection"], [], lib);
  const permanent = new Perm(C.get('Codie, Vociferous Codex'));
  permanent.sick = false;
  game.battlefield.push(permanent);
  game.hand.push(C.get('Fog'));
  game.library = game.library.filter((card) => card.name !== 'Profane Tutor');
  check(
    'Profane Tutor already gone: Codie + Fog finds nothing',
    findKillLine(game)?.steps.some((step) => step.startsWith('Codie + Fog')) ??
      false,
    false,
  );
  // Codie's trigger in development finds Profane Tutor for a spell of mana value 1
  game = board(five, ['Silence'], ['Codie, Vociferous Codex'], lib);
  game.findPermanent('Codie, Vociferous Codex')!.sick = false;
  activateCodie(game);
  game.castInstantOrSorcery(C.get('Silence'));
  check(
    'Codie armed, then Silence: Profane Tutor was cast free and fetched a card',
    game.hand.length,
    1,
  );

  // ---- the opponents' tapped lands grow with the turn
  game = board(five, []);
  game.turn = 3;
  const tappedLandCount = game.opponentTappedLands();
  game.turn = 6;
  check(
    'tapped opposing lands: 6 on turn 3, 13 on turn 6',
    [tappedLandCount, game.opponentTappedLands()],
    [6, 13],
  );

  // ---- Ad Nauseam + Teferi's Protection leaves the last five cards; Lim-Dul's Vault stacks the best window of five
  game = board(five, ['Ad Nauseam', "Teferi's Protection"], [], lib);
  castAdNauseamWithTeferi(game);
  check(
    "Ad Nauseam + Teferi's Protection: all but the last 5 cards of the library are drawn",
    [game.library.length, game.libraryInHand],
    [5, true],
  );
  const vlib = [
    ...repeatName('Island', 10),
    'Reiterate',
    "Jeska's Will",
    'Crackle with Power',
    'Ad Nauseam',
    "Teferi's Protection",
    ...repeatName('Island', 25),
  ];
  game = board(twelve, ["Lim-Dûl's Vault"], [], vlib);
  game.library = vlib.map((cardName) => C.get(cardName)); // (a board shuffles its library: put the order back)
  castVault(game);
  check(
    "Lim-Dul's Vault: the third window (two looks, 2 life) has the combo cards; they are on top",
    [
      game.library
        .slice(0, 5)
        .map((card) => card.name)
        .sort(),
      game.myLife,
      game.knownTop,
    ],
    [
      [
        'Ad Nauseam',
        'Crackle with Power',
        "Jeska's Will",
        'Reiterate',
        "Teferi's Protection",
      ],
      38,
      5,
    ],
  );
  game = board(twelve, ["Lim-Dûl's Vault", 'Stock Up'], [], vlib);
  game.hand.push(C.get('Brainstorm'));
  check(
    'a stacked top lets the solver use Brainstorm / Stock Up (every card drawn is known)',
    findKillLine(game) === null,
    true,
  );

  // ---- from the old script (codie_sim_v2.js): Jeska's Will's exile mode digs the library, Windfall, Profane Tutor's suspend, Flashback
  const crlib = ['Crackle with Power', ...repeatName('Island', 40)];
  game = board(
    five,
    ['Reiterate', "Jeska's Will"],
    ['Codie, Vociferous Codex'],
    crlib,
  );
  game.findPermanent('Codie, Vociferous Codex')!.sick = false;
  const exileModeKillLine = findKillLine(game);
  check(
    "Jeska's Will + Reiterate with Codie out: the exile mode digs the library, so a Crackle in the library is enough",
    [
      exileModeKillLine !== null,
      exileModeKillLine?.steps.some((step) => step.startsWith('loop')),
    ],
    [true, true],
  );
  game = board(five, ['Reiterate', "Jeska's Will"], [], crlib);
  check(
    '...without Codie (no commander: one mode only) there is no dig: no kill',
    findKillLine(game),
    null,
  );
  game = board(
    five,
    ['Windfall', ...repeatName('Brainstorm', 9)],
    [],
    repeatName('Island', 40),
  );
  game.castInstantOrSorcery(C.get('Windfall'));
  check(
    'Windfall: the 9 other cards are discarded and 9 new ones drawn (at least 7)',
    [
      game.hand.length,
      game.graveyard.filter((card) => card.name === 'Brainstorm').length,
    ],
    [9, 9],
  );
  game = board(
    five,
    ['Profane Tutor'],
    [],
    ['Reiterate', ...repeatName('Island', 40)],
  );
  suspendProfaneTutor(game, C.get('Profane Tutor'));
  game.upkeep();
  const afterOne = game.hand.length;
  game.upkeep();
  check(
    'Profane Tutor suspended for {1}{B}: nothing after one upkeep, a tutored card after two',
    [afterOne, game.hand.length],
    [0, 1],
  );
  game = board(
    five,
    ['Flashback'],
    [],
    ['Crackle with Power', ...repeatName('Island', 40)],
  );
  game.graveyard.push(C.get('Demonic Tutor'));
  check(
    'Flashback on a Demonic Tutor in the graveyard: tutor for Crackle with Power (1 + 2 mana)',
    [
      flashbackTutor(game, 'Demonic Tutor', 'Crackle with Power'),
      game.hand.map((card) => card.name),
    ],
    [true, ['Crackle with Power']],
  );
  game = board(
    [...five, 'Mountain'],
    ['Flashback', 'Reiterate', 'Crackle with Power'],
    ['Codie, Vociferous Codex'],
    repeatName('Island', 40),
  );
  game.graveyard.push(C.get("Jeska's Will"));
  game.findPermanent('Codie, Vociferous Codex')!.sick = false;
  check(
    "Flashback Jeska's Will + Reiterate (1 + 3 + 6 = 10 mana): a bottomless loop, then Crackle",
    findKillLine(game)?.steps.some((step) =>
      step.startsWith('loop: Flashback'),
    ) ?? false,
    true,
  );

  // ---- counter backup
  game = board(
    [...twelve, 'Island', 'Island'],
    ['Reiterate', "Jeska's Will", 'Crackle with Power', 'Counterspell'],
  );
  check(
    'a loop kill with a Counterspell in hand has backup (two Islands stay untapped)',
    findKillLine(game)?.backup,
    true,
  );
  game = board(twelve, ['Reiterate', "Jeska's Will", 'Crackle with Power']);
  check('...without one it does not', findKillLine(game)?.backup, false);

  return allPassed;
}
