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

const rep = (n: string, k: number) => new Array(k).fill(n) as string[];

function board(
  lands: string[],
  hand: string[],
  bf: string[] = [],
  library: string[] = rep('Island', 40),
  cfg = {},
): CodieGame {
  const g = new CodieGame([], library, new Rng(1), { ...CFG, ...cfg });
  g.startTurn();
  g.turn = 7;
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
  return g;
}

export function runCodieTests(): boolean {
  let ok = true;
  const check = (label: string, got: unknown, expect: unknown) => {
    const good = JSON.stringify(got) === JSON.stringify(expect);
    console.log(
      `${good ? 'OK ' : 'BAD'} ${label}: got ${JSON.stringify(got)}, expected ${JSON.stringify(expect)}`,
    );
    ok = ok && good;
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
  const loops = (g: CodieGame) =>
    findKillLine(g)?.steps.some((s) => s.startsWith('loop')) ?? false;

  // ---- the finishers' arithmetic
  let g = board(five, []);
  check(
    'Exsanguinate: X=40 kills three opponents at 40',
    finisherKills(g, 'Exsanguinate', 40, 1, 40, 3),
    true,
  );
  check(
    'Exsanguinate with one copy: X=20',
    finisherKills(g, 'Exsanguinate', 20, 2, 40, 3),
    true,
  );
  check(
    'Exsanguinate X=19 with one copy does not',
    finisherKills(g, 'Exsanguinate', 19, 2, 40, 3),
    false,
  );
  check(
    'Crackle with Power: X=8 (40 to each of 8 targets) kills',
    finisherKills(g, 'Crackle with Power', 8, 1, 40, 3),
    true,
  );
  check(
    'Crackle X=4 needs a copy (20 twice)',
    [
      finisherKills(g, 'Crackle with Power', 4, 1, 40, 3),
      finisherKills(g, 'Crackle with Power', 4, 2, 40, 3),
    ],
    [false, true],
  );
  check(
    'Torment of Hailfire: X=19 (5 payments each, then 3 per repeat) kills',
    [
      finisherKills(g, 'Torment of Hailfire', 18, 1, 40, 3),
      finisherKills(g, 'Torment of Hailfire', 19, 1, 40, 3),
    ],
    [false, true],
  );
  check(
    'Torment X=10 with one copy kills (20 repeats)',
    finisherKills(g, 'Torment of Hailfire', 10, 2, 40, 3),
    true,
  );

  // ---- copy costs
  g = board(five, ['Reiterate']);
  check(
    'one Reiterate (no buyback) = one copy costs {1}{R}{R}',
    reiterateCopyCost(g, 2)!.toString(),
    '{1}RR',
  );
  check(
    'two copies from Reiterate: buyback the first (6) + the second (3) = 9 mana',
    reiterateCopyCost(g, 3)!.mv,
    9,
  );
  g = board(five, ['Reiterate', 'Return the Favor']);
  check(
    'Return the Favor makes a copy cheaper than a second Reiterate',
    reiterateCopyCost(g, 3)!.mv,
    6,
  );

  // ---- the solver
  g = board(five, ['Crackle with Power']);
  check('9 lands, Crackle: no kill (no loop, no copy)', findKillLine(g), null);
  g = board(
    [...five, ...rep('Mountain', 5), ...rep('Swamp', 4)],
    ['Torment of Hailfire', 'Reiterate'],
  );
  check(
    '18 lands: Torment X=10 with a Reiterate copy (15 mana) kills',
    findKillLine(g) !== null,
    true,
  );
  g = board(five, ['Reiterate', "Jeska's Will", 'Crackle with Power']);
  check(
    "Jeska's Will + Reiterate (9 mana: 3 + 6 buyback): a bottomless loop, then Crackle X=8 (red only)",
    [findKillLine(g) !== null, loops(g)],
    [true, true],
  );
  g = board(five, ['Reiterate', "Jeska's Will", 'Exsanguinate']);
  check(
    '...but Exsanguinate needs BB and the loop used every land: no kill',
    findKillLine(g),
    null,
  );
  g = board(
    [...five, 'Swamp', 'Swamp'],
    ['Reiterate', "Jeska's Will", 'Exsanguinate'],
  );
  check(
    '...with two more Swamps left over after the loop: Exsanguinate X=40, the infinite red pays the generic',
    findKillLine(g) !== null,
    true,
  );
  g = board(
    five,
    ['Reiterate', "Jeska's Will", 'Crackle with Power'],
    [],
    rep('Island', 40),
    { opp_hand: 6 },
  );
  check(
    "Jeska's Will with only 6 cards in the opponent's hand: a copy costs 6, so no loop",
    loops(g),
    false,
  );
  g = board(
    twelve,
    ['Reiterate', 'Mana Geyser', 'Crackle with Power'],
    [],
    rep('Island', 40),
    { opp_tapped_lands: 6 },
  );
  check(
    'Mana Geyser with 6 tapped opposing lands is break-even: not a loop',
    loops(g),
    false,
  );
  g = board(
    twelve,
    ['Reiterate', 'Mana Geyser', 'Crackle with Power'],
    [],
    rep('Island', 40),
    { opp_tapped_lands: 8 },
  );
  check(
    'Mana Geyser with 8 tapped opposing lands (5 + 6 = 11 mana): a loop',
    loops(g),
    true,
  );
  g = board(
    five,
    ['Reiterate', 'Mana Geyser', 'Crackle with Power'],
    [],
    rep('Island', 40),
    { opp_tapped_lands: 8 },
  );
  check("...with 9 lands it can't start", loops(g), false);
  g = board(thirteen, ['Reiterate', "Brass's Bounty", 'Torment of Hailfire']);
  check(
    "Brass's Bounty with 13 lands (7 + 6 mana; 13 Treasures per copy): a loop, any colour",
    loops(g),
    true,
  );
  g = board(
    ['Mountain', 'Mountain', 'Swamp', 'Swamp', 'Island'],
    ['Reiterate', "Jeska's Will", 'Crackle with Power'],
  );
  check('only 5 lands: the loop needs 9 mana, no kill', findKillLine(g), null);

  // ---- rituals and tutors
  g = board(
    twelve,
    ['Demonic Tutor', "Jeska's Will", 'Reiterate'],
    [],
    ['Crackle with Power', ...rep('Island', 40)],
  );
  check(
    '12 lands: Demonic Tutor for Crackle (2), then the Will loop (9) and Crackle',
    findKillLine(g) !== null,
    true,
  );
  g = board(five, [
    'Seething Song',
    'Dark Ritual',
    'Pyretic Ritual',
    'Torment of Hailfire',
    'Reiterate',
  ]);
  check(
    '9 lands + Seething Song, Dark Ritual, Pyretic Ritual (+5 net) = 14 mana: Torment X=10 with a Reiterate copy needs 15: no kill',
    findKillLine(g),
    null,
  );
  g = board(
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
    findKillLine(g) !== null,
    true,
  );

  // ---- Codie + a spell of mana value 1 = the free Profane Tutor (the only mana value 0 instant or sorcery)
  const lib = [
    'Profane Tutor',
    "Teferi's Protection",
    'Reiterate',
    "Jeska's Will",
    'Crackle with Power',
    ...rep('Island', 40),
  ];
  g = board(five, ['Silence', 'Ad Nauseam'], ['Codie, Vociferous Codex'], lib);
  g.perm('Codie, Vociferous Codex')!.sick = false;
  const rc = findKillLine(g);
  check(
    "Codie + Silence -> Profane Tutor -> Teferi's Protection, then Ad Nauseam: the library in hand, a kill next turn",
    [
      rc !== null,
      rc?.nextTurn,
      rc?.steps.some((s) => s.startsWith('Codie + Silence')),
    ],
    [true, true, true],
  );
  g = board(five, ['Silence', 'Ad Nauseam'], [], lib);
  check(
    "without Codie there is no tutor for Teferi's Protection: no kill",
    findKillLine(g),
    null,
  );
  g = board(five, ['Ad Nauseam', "Teferi's Protection"], [], lib);
  check(
    "Ad Nauseam + Teferi's Protection in hand (8 mana): a kill next turn",
    findKillLine(g)?.nextTurn,
    true,
  );
  g = board(five, ['Ad Nauseam', "Teferi's Protection"], [], lib);
  const c4 = new Perm(C.get('Codie, Vociferous Codex'));
  c4.sick = false;
  g.bf.push(c4);
  g.hand.push(C.get('Fog'));
  g.library = g.library.filter((c) => c.name !== 'Profane Tutor');
  check(
    'Profane Tutor already gone: Codie + Fog finds nothing',
    findKillLine(g)?.steps.some((s) => s.startsWith('Codie + Fog')) ?? false,
    false,
  );
  // Codie's trigger in development finds Profane Tutor for a spell of mana value 1
  g = board(five, ['Silence'], ['Codie, Vociferous Codex'], lib);
  g.perm('Codie, Vociferous Codex')!.sick = false;
  activateCodie(g);
  g.castIS(C.get('Silence'));
  check(
    'Codie armed, then Silence: Profane Tutor was cast free and fetched a card',
    g.hand.length,
    1,
  );

  // ---- the opponents' tapped lands grow with the turn
  g = board(five, []);
  g.turn = 3;
  const t3 = g.opponentTappedLands();
  g.turn = 6;
  check(
    'tapped opposing lands: 6 on turn 3, 13 on turn 6',
    [t3, g.opponentTappedLands()],
    [6, 13],
  );

  // ---- Ad Nauseam + Teferi's Protection leaves the last five cards; Lim-Dul's Vault stacks the best window of five
  g = board(five, ['Ad Nauseam', "Teferi's Protection"], [], lib);
  castAdNauseamWithTeferi(g);
  check(
    "Ad Nauseam + Teferi's Protection: all but the last 5 cards of the library are drawn",
    [g.library.length, g.libraryInHand],
    [5, true],
  );
  const vlib = [
    ...rep('Island', 10),
    'Reiterate',
    "Jeska's Will",
    'Crackle with Power',
    'Ad Nauseam',
    "Teferi's Protection",
    ...rep('Island', 25),
  ];
  g = board(twelve, ["Lim-Dûl's Vault"], [], vlib);
  g.library = vlib.map((n) => C.get(n)); // (a board shuffles its library: put the order back)
  castVault(g);
  check(
    "Lim-Dul's Vault: the third window (two looks, 2 life) has the combo cards; they are on top",
    [
      g.library
        .slice(0, 5)
        .map((c) => c.name)
        .sort(),
      g.myLife,
      g.knownTop,
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
  g = board(twelve, ["Lim-Dûl's Vault", 'Stock Up'], [], vlib);
  g.hand.push(C.get('Brainstorm'));
  check(
    'a stacked top lets the solver use Brainstorm / Stock Up (every card drawn is known)',
    findKillLine(g) === null,
    true,
  );

  // ---- from the old script (codie_sim_v2.js): Jeska's Will's exile mode digs the library, Windfall, Profane Tutor's suspend, Flashback
  const crlib = ['Crackle with Power', ...rep('Island', 40)];
  g = board(
    five,
    ['Reiterate', "Jeska's Will"],
    ['Codie, Vociferous Codex'],
    crlib,
  );
  g.perm('Codie, Vociferous Codex')!.sick = false;
  const dg = findKillLine(g);
  check(
    "Jeska's Will + Reiterate with Codie out: the exile mode digs the library, so a Crackle in the library is enough",
    [dg !== null, dg?.steps.some((s) => s.startsWith('loop'))],
    [true, true],
  );
  g = board(five, ['Reiterate', "Jeska's Will"], [], crlib);
  check(
    '...without Codie (no commander: one mode only) there is no dig: no kill',
    findKillLine(g),
    null,
  );
  g = board(five, ['Windfall', ...rep('Brainstorm', 9)], [], rep('Island', 40));
  g.castIS(C.get('Windfall'));
  check(
    'Windfall: the 9 other cards are discarded and 9 new ones drawn (at least 7)',
    [g.hand.length, g.gy.filter((c) => c.name === 'Brainstorm').length],
    [9, 9],
  );
  g = board(five, ['Profane Tutor'], [], ['Reiterate', ...rep('Island', 40)]);
  suspendProfaneTutor(g, C.get('Profane Tutor'));
  g.upkeep();
  const afterOne = g.hand.length;
  g.upkeep();
  check(
    'Profane Tutor suspended for {1}{B}: nothing after one upkeep, a tutored card after two',
    [afterOne, g.hand.length],
    [0, 1],
  );
  g = board(
    five,
    ['Flashback'],
    [],
    ['Crackle with Power', ...rep('Island', 40)],
  );
  g.gy.push(C.get('Demonic Tutor'));
  check(
    'Flashback on a Demonic Tutor in the graveyard: tutor for Crackle with Power (1 + 2 mana)',
    [
      flashbackTutor(g, 'Demonic Tutor', 'Crackle with Power'),
      g.hand.map((c) => c.name),
    ],
    [true, ['Crackle with Power']],
  );
  g = board(
    [...five, 'Mountain'],
    ['Flashback', 'Reiterate', 'Crackle with Power'],
    ['Codie, Vociferous Codex'],
    rep('Island', 40),
  );
  g.gy.push(C.get("Jeska's Will"));
  g.perm('Codie, Vociferous Codex')!.sick = false;
  check(
    "Flashback Jeska's Will + Reiterate (1 + 3 + 6 = 10 mana): a bottomless loop, then Crackle",
    findKillLine(g)?.steps.some((s) => s.startsWith('loop: Flashback')) ??
      false,
    true,
  );

  // ---- counter backup
  g = board(
    [...twelve, 'Island', 'Island'],
    ['Reiterate', "Jeska's Will", 'Crackle with Power', 'Counterspell'],
  );
  check(
    'a loop kill with a Counterspell in hand has backup (two Islands stay untapped)',
    findKillLine(g)?.backup,
    true,
  );
  g = board(twelve, ['Reiterate', "Jeska's Will", 'Crackle with Power']);
  check('...without one it does not', findKillLine(g)?.backup, false);

  return ok;
}
