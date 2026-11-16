/** Sanity checks: hand-built board states that must (or must not) be a kill. Run: npm run sim -- gale --test */
import * as C from '../../../engine/cards/cards';
import { Permanent } from '../../../engine/game/game-types';
import { Rng } from '../../../engine/util/rng';
import { CFG } from '../config';
import { GaleGame } from '../game';
import { search, finisherReachable } from '../kills';

const repeatName = (cardName: string, count: number) =>
  new Array(count).fill(cardName) as string[];

interface Board {
  battlefieldNames?: string[];
  hand?: string[];
  graveyardNames?: string[];
  lands?: string[];
}

function board({
  battlefieldNames: battlefieldNames = [],
  hand = [],
  graveyardNames: graveyardNames = [],
  lands = [...repeatName('Island', 3), ...repeatName('Swamp', 3)],
}: Board): GaleGame {
  const game = new GaleGame([], repeatName('Island', 60), new Rng(1), CFG);
  game.startTurn();
  game.turn = 5;
  for (const landName of lands) {
    const card = C.get(landName);
    game.battlefield.push(new Permanent(card, card.land));
  }
  for (const cardName of battlefieldNames) {
    const permanent = new Permanent(C.get(cardName));
    permanent.sick = false;
    game.battlefield.push(permanent);
  }
  game.hand = hand.map((cardName) => C.get(cardName));
  game.graveyard = graveyardNames.map((cardName) => C.get(cardName));
  return game;
}

export function runKillTests(): boolean {
  let allPassed = true;
  const check = (label: string, game: GaleGame, expect: number) => {
    const state = game.buildKillSearchState();
    const killLevel = finisherReachable(state) ? search.search(state, 5000) : 0; // same pre-filter the game uses
    console.log(
      `${killLevel === expect ? 'OK ' : 'BAD'} ${label}: got ${killLevel}, expected ${expect}`,
    );
    allPassed = allPassed && killLevel === expect;
  };
  const islands = (count: number) => repeatName('Island', count),
    swamps = (count: number) => repeatName('Swamp', count);

  check(
    'Guildmage+Mindcrank on board, Cacophony in hand (5 mana)',
    board({
      battlefieldNames: ['Duskmantle Guildmage', 'Mindcrank'],
      hand: ['Maddening Cacophony'],
    }),
    1,
  );
  check(
    '... plus Counterspell & 2 extra mana -> protected',
    board({
      battlefieldNames: ['Duskmantle Guildmage', 'Mindcrank'],
      hand: ['Maddening Cacophony', 'Counterspell'],
      lands: [...islands(5), ...swamps(3)],
    }),
    2,
  );
  check(
    'Guildmage + kicked Cacophony (9 mana)',
    board({
      battlefieldNames: ['Duskmantle Guildmage'],
      hand: ['Maddening Cacophony'],
      lands: [...islands(6), ...swamps(3)],
    }),
    1,
  );
  check(
    'Guildmage + kicked Cacophony with only 8 mana -> no',
    board({
      battlefieldNames: ['Duskmantle Guildmage'],
      hand: ['Maddening Cacophony'],
      lands: [...islands(5), ...swamps(3)],
    }),
    0,
  );
  check(
    'Kicked Cacophony + Monument exhaust (12 mana incl. casting monument)',
    board({
      hand: ['Maddening Cacophony', 'Riverchurn Monument'],
      lands: [...islands(9), ...swamps(3)],
    }),
    1,
  );
  check(
    'Mindskinner (can attack) + Konrad on board',
    board({ battlefieldNames: ['The Mindskinner', 'Syr Konrad, the Grim'] }),
    1,
  );
  check(
    'Gale: Dark Ritual from hand -> Cacophony from gy resolves BEFORE ritual mana (4 lands) -> no',
    board({
      battlefieldNames: [
        'Gale, Waterdeep Prodigy',
        'Duskmantle Guildmage',
        'Mindcrank',
      ],
      hand: ['Dark Ritual'],
      graveyardNames: ['Maddening Cacophony'],
      lands: [...islands(2), ...swamps(2)],
    }),
    0,
  );
  check(
    'Gale: Cacophony from hand -> Dark Ritual from gy, ritual mana activates Guildmage (4 lands)',
    board({
      battlefieldNames: [
        'Gale, Waterdeep Prodigy',
        'Duskmantle Guildmage',
        'Mindcrank',
      ],
      hand: ['Maddening Cacophony'],
      graveyardNames: ['Dark Ritual'],
      lands: [...islands(2), ...swamps(2)],
    }),
    1,
  );
  check(
    'Gale: High Tide from hand -> kicked Cacophony from gy, Guildmage active (8 Islands + 2 Swamps)',
    board({
      battlefieldNames: ['Gale, Waterdeep Prodigy', 'Duskmantle Guildmage'],
      hand: ['High Tide'],
      graveyardNames: ['Maddening Cacophony'],
      lands: [...islands(5), ...swamps(2)],
    }),
    0,
  );
  check(
    'Guildmage + Mindcrank + Windfall',
    board({
      battlefieldNames: ['Duskmantle Guildmage', 'Mindcrank'],
      hand: ['Windfall'],
    }),
    1,
  );
  check(
    'Guildmage + Mindcrank + Konrad activation',
    board({
      battlefieldNames: [
        'Duskmantle Guildmage',
        'Mindcrank',
        'Syr Konrad, the Grim',
      ],
    }),
    1,
  );
  check(
    'Guildmage + Singularity Rupture (9 mana)',
    board({
      battlefieldNames: ['Duskmantle Guildmage'],
      hand: ['Singularity Rupture'],
      lands: [...islands(5), ...swamps(4)],
    }),
    1,
  );
  check('Nothing relevant', board({ hand: ['Opt', 'Ponder'] }), 0);
  check(
    'Traumatize alone kills nobody',
    board({
      battlefieldNames: ['Duskmantle Guildmage'],
      hand: ['Traumatize'],
      lands: [...islands(6), ...swamps(3)],
    }),
    0,
  );
  check(
    'game4: Konrad + Mindcrank on board, kicked Cacophony (8 mana incl. Sol Ring, Signet, Homunculus)',
    board({
      battlefieldNames: [
        'Syr Konrad, the Grim',
        'Mindcrank',
        'Sol Ring',
        'Arcane Signet',
        'Curious Homunculus',
      ],
      hand: ['Maddening Cacophony'],
      lands: ['Island', 'Swamp', 'Reliquary Tower', 'Island'],
    }),
    1,
  );
  // stacking High Tides, Bubbling Muck, Energybending (game5). Guildmage + kicked Cacophony needs 9 mana.
  const GUILDMAGE_ONLY = ['Duskmantle Guildmage'];
  check(
    'One High Tide, 4 Islands + 2 Swamps: the Island paying for it gets no bonus (8 mana) -> no',
    board({
      battlefieldNames: GUILDMAGE_ONLY,
      hand: ['High Tide', 'Maddening Cacophony'],
      lands: [...islands(4), ...swamps(2)],
    }),
    0,
  );
  check(
    'Two High Tides stack, 4 Islands + 2 Swamps (9 mana)',
    board({
      battlefieldNames: GUILDMAGE_ONLY,
      hand: ['High Tide', 'High Tide', 'Maddening Cacophony'],
      lands: [...islands(4), ...swamps(2)],
    }),
    1,
  );
  check(
    'Two High Tides, 3 Islands + 2 Swamps (only 7 mana) -> no',
    board({
      battlefieldNames: GUILDMAGE_ONLY,
      hand: ['High Tide', 'High Tide', 'Maddening Cacophony'],
      lands: [...islands(3), ...swamps(2)],
    }),
    0,
  );
  check(
    'Gale: High Tide from hand, then Muck from hand -> Gale recasts High Tide from graveyard',
    board({
      battlefieldNames: ['Gale, Waterdeep Prodigy', ...GUILDMAGE_ONLY],
      hand: ['High Tide', 'Bubbling Muck', 'Maddening Cacophony'],
      lands: [...islands(4), ...swamps(2)],
    }),
    1,
  );
  check(
    'Muck alone, 5 Islands + 1 Swamp + Sol Ring (8 mana) -> no',
    board({
      battlefieldNames: [...GUILDMAGE_ONLY, 'Sol Ring'],
      hand: ['Bubbling Muck', 'Maddening Cacophony'],
      lands: [...islands(5), ...swamps(1)],
    }),
    0,
  );
  check(
    'Energybending (Sol Ring pays) makes every land a Swamp for Muck',
    board({
      battlefieldNames: [...GUILDMAGE_ONLY, 'Sol Ring'],
      hand: ['Energybending', 'Bubbling Muck', 'Maddening Cacophony'],
      lands: [...islands(5), ...swamps(1)],
    }),
    1,
  );
  check(
    'Energybending paid with lands + Muck, 5 Islands + 2 Swamps: Muck first, then a Swamp taps BB for Energybending and the 5 Islands make 2 each (10 mana)',
    board({
      battlefieldNames: GUILDMAGE_ONLY,
      hand: ['Energybending', 'Bubbling Muck', 'Maddening Cacophony'],
      lands: [...islands(5), ...swamps(2)],
    }),
    1,
  );
  check(
    'Energybending made free by Mocking Sprite + Geist taps no lands: every land a Swamp for Muck',
    board({
      battlefieldNames: [
        ...GUILDMAGE_ONLY,
        'Mocking Sprite',
        'Geist of Saint Thalia',
      ],
      hand: ['Energybending', 'Bubbling Muck', 'Maddening Cacophony'],
      lands: [...islands(6), ...swamps(1)],
    }),
    1,
  );
  let game = board({
    battlefieldNames: [...GUILDMAGE_ONLY, 'Sol Ring'],
    hand: ['Maddening Cacophony'],
    lands: [...islands(1), ...swamps(4)],
  });
  game.highTidesThisTurn = 1;
  check(
    'High Tide already resolved, 1 Island + 4 Swamps + Sol Ring (8 mana) -> no',
    game,
    0,
  );
  game = board({
    battlefieldNames: [...GUILDMAGE_ONLY, 'Sol Ring'],
    hand: ['Energybending', 'Maddening Cacophony'],
    lands: [...islands(1), ...swamps(4)],
  });
  game.highTidesThisTurn = 1;
  check(
    'High Tide already resolved, then Energybending turns the Swamps into Islands',
    game,
    1,
  );
  // Pontus's pod game (seed 206, turn 4): High Tide, then Konrad ({3}{B}{B}) and unkicked Cacophony ({1}{U}).
  // 3 Islands + Swamp + a rock: if the rock pays High Tide, 6 U + 1 B; if an Island does, 6 mana with 2 B.
  // Never 7 with BB: no kill, with a filter Signet or a plain one. (The line only kills at libraries <= 45.)
  for (const rockName of ['Dimir Signet', 'Arcane Signet']) {
    game = board({
      battlefieldNames: [rockName, 'Mindcrank'],
      hand: [
        'High Tide',
        'Syr Konrad, the Grim',
        'Maddening Cacophony',
        'Mocking Sprite',
        'Swamp',
      ],
      lands: [...islands(3), 'Swamp'],
    });
    game.opponentLibrarySizes = [40, 40, 40];
    check(`${rockName}: High Tide, Konrad, Cacophony -> no`, game, 0);
  }
  check(
    'Arcane Signet pays High Tide, 4 Islands keep the bonus: 8 + 1 = 9 for Guildmage + kicked Cacophony',
    board({
      battlefieldNames: ['Arcane Signet', ...GUILDMAGE_ONLY],
      hand: ['High Tide', 'Maddening Cacophony'],
      lands: [...islands(4), 'Swamp'],
    }),
    1,
  );
  // Konrad chains are checked with real shuffles: about 68% / 100% / 45% in a separate random-deal check (the old Python tool, since removed)
  const KONRAD_AND_MINDCRANK = ['Syr Konrad, the Grim', 'Mindcrank'];
  game = board({
    battlefieldNames: KONRAD_AND_MINDCRANK,
    hand: ['Maddening Cacophony'],
    lands: islands(2),
  });
  game.opponentLibrarySizes = [86, 86, 86];
  check('Konrad + Mindcrank + unkicked Cacophony (wins ~68%) -> no', game, 0);
  game = board({
    battlefieldNames: KONRAD_AND_MINDCRANK,
    hand: ['Maddening Cacophony'],
    lands: islands(6),
  });
  game.opponentLibrarySizes = [86, 86, 86];
  check('Konrad + Mindcrank + kicked Cacophony (wins ~100%)', game, 1);
  game = board({
    battlefieldNames: ['Syr Konrad, the Grim'],
    hand: ['Maddening Cacophony'],
    lands: islands(6),
  });
  game.opponentLibrarySizes = [86, 86, 86];
  check('Konrad, no Mindcrank, kicked Cacophony (wins ~45%) -> no', game, 0);
  // Poison: Prologue to Phyresis (1 poison) + Expansion Algorithm (proliferate X times, {X}{U}{U})
  const PROLOGUE_AND_ALGORITHM = [
    'Prologue to Phyresis',
    'Expansion Algorithm',
  ];
  check(
    'Prologue + Algorithm X=9, 13 mana',
    board({ hand: PROLOGUE_AND_ALGORITHM, lands: islands(13) }),
    1,
  );
  check(
    'Prologue + Algorithm with 12 mana -> no',
    board({ hand: PROLOGUE_AND_ALGORITHM, lands: islands(12) }),
    0,
  );
  check(
    'Prologue + Algorithm, 2 reducers (Mocking Sprite + Geist): 1 + 9 = 10 mana',
    board({
      battlefieldNames: ['Mocking Sprite', 'Geist of Saint Thalia'],
      hand: PROLOGUE_AND_ALGORITHM,
      lands: islands(10),
    }),
    1,
  );
  check(
    '... same with 9 mana -> no',
    board({
      battlefieldNames: ['Mocking Sprite', 'Geist of Saint Thalia'],
      hand: PROLOGUE_AND_ALGORITHM,
      lands: islands(9),
    }),
    0,
  );
  game = board({ hand: ['Expansion Algorithm'], lands: islands(11) });
  game.poison = [1, 1, 1];
  check(
    'Prologue cast on an earlier turn (1 poison each): Algorithm X=9 alone, 11 mana',
    game,
    1,
  );
  game = board({ hand: ['Expansion Algorithm'], lands: islands(10) });
  game.poison = [1, 1, 1];
  check('... with 10 mana -> no', game, 0);
  game = board({
    battlefieldNames: ['Gale, Waterdeep Prodigy'],
    hand: ['Expansion Algorithm'],
    graveyardNames: ['Prologue to Phyresis'],
    lands: islands(12),
  });
  game.poison = [1, 1, 1];
  check(
    'Gale: Algorithm X=8 from hand recasts Prologue from graveyard first (1+1+8), 12 mana',
    game,
    1,
  );
  check(
    'Algorithm with no poison anywhere -> no',
    board({ hand: ['Expansion Algorithm'], lands: islands(13) }),
    0,
  );
  // Turnabout untaps every land: 4 Islands + Swamp, High Tide (7 mana left), Turnabout (-4, +9) = 12
  check(
    'Guildmage + High Tide + Turnabout + kicked Cacophony',
    board({
      battlefieldNames: ['Duskmantle Guildmage'],
      hand: ['High Tide', 'Turnabout', 'Maddening Cacophony'],
      lands: [...islands(4), ...swamps(1)],
    }),
    1,
  );
  check(
    '... without Turnabout -> no',
    board({
      battlefieldNames: ['Duskmantle Guildmage'],
      hand: ['High Tide', 'Maddening Cacophony'],
      lands: [...islands(4), ...swamps(1)],
    }),
    0,
  );
  // untap effects after High Tide: 4 Islands + Swamp, High Tide leaves 7 mana (Guildmage + kicked Cacophony = 9)
  check(
    'High Tide + Peregrine Drake (-5, untap 5: +9) + kicked Cacophony',
    board({
      battlefieldNames: ['Duskmantle Guildmage'],
      hand: ['High Tide', 'Peregrine Drake', 'Maddening Cacophony'],
      lands: [...islands(4), ...swamps(1)],
    }),
    1,
  );
  check(
    'High Tide + Opt countered by your own Rewind (-1 -4, untap 4 Islands: +8) + kicked Cacophony',
    board({
      battlefieldNames: ['Duskmantle Guildmage'],
      hand: ['High Tide', 'Opt', 'Rewind', 'Maddening Cacophony'],
      lands: [...islands(4), ...swamps(1)],
    }),
    1,
  );
  // rituals (Guildmage + kicked Cacophony = 9 mana)
  check(
    'Energy Tap on Konrad (+5): 6 lands - 1 + 5 = 10',
    board({
      battlefieldNames: ['Duskmantle Guildmage', 'Syr Konrad, the Grim'],
      hand: ['Energy Tap', 'Maddening Cacophony'],
      lands: [...islands(4), ...swamps(2)],
    }),
    1,
  );
  check(
    'Energy Tap on Guildmage only (+2): 6 - 1 + 2 = 7 -> no',
    board({
      battlefieldNames: ['Duskmantle Guildmage'],
      hand: ['Energy Tap', 'Maddening Cacophony'],
      lands: [...islands(4), ...swamps(2)],
    }),
    0,
  );
  // Drain Power: an opponent has one land per turn, half of them untapped (rounded down)
  game = board({
    battlefieldNames: ['Duskmantle Guildmage'],
    hand: ['Drain Power', 'Maddening Cacophony'],
    lands: [...islands(5), ...swamps(2)],
  });
  game.turn = 10;
  check(
    'Drain Power on turn 10 (5 of 10 lands untapped): 7 - 2 + 5 = 10',
    game,
    1,
  );
  game = board({
    battlefieldNames: ['Duskmantle Guildmage'],
    hand: ['Drain Power', 'Maddening Cacophony'],
    lands: [...islands(5), ...swamps(2)],
  });
  game.turn = 7;
  check(
    'Drain Power on turn 7 (3 of 7 untapped): 7 - 2 + 3 = 8 -> no',
    game,
    0,
  );
  check(
    'Cabal Ritual without threshold: 7 - 2 + 3 = 8 -> no',
    board({
      battlefieldNames: ['Duskmantle Guildmage'],
      hand: ['Cabal Ritual', 'Maddening Cacophony'],
      lands: [...islands(5), ...swamps(2)],
    }),
    0,
  );
  check(
    'Cabal Ritual with threshold (7 cards in graveyard): 7 - 2 + 5 = 10',
    board({
      battlefieldNames: ['Duskmantle Guildmage'],
      hand: ['Cabal Ritual', 'Maddening Cacophony'],
      lands: [...islands(5), ...swamps(2)],
      graveyardNames: [...islands(4), 'Opt', 'Ponder', 'Brainstorm'],
    }),
    1,
  );
  // Rain of Filth: every land taps and is then sacrificed for {B}: N lands make 2N - 1 (Guildmage + kicked Cacophony = 9)
  check(
    'Rain of Filth with 6 lands: 6 + 6 - 1 = 11',
    board({
      battlefieldNames: ['Duskmantle Guildmage'],
      hand: ['Rain of Filth', 'Maddening Cacophony'],
      lands: [...islands(4), ...swamps(2)],
    }),
    1,
  );
  check(
    'Rain of Filth with 4 lands: 4 + 4 - 1 = 7 -> no',
    board({
      battlefieldNames: ['Duskmantle Guildmage'],
      hand: ['Rain of Filth', 'Maddening Cacophony'],
      lands: [...islands(2), ...swamps(2)],
    }),
    0,
  );
  allPassed = runPlayedKillTests() && allPassed;
  console.log(allPassed ? 'ALL OK' : 'SOME FAILED');
  return allPassed;
}

/** Kill lines are played for real (engine/game/kill-line.ts): the game wins only when the line it found wins when
 *  played, and then the game is the one the line was played in (cards moved, lands tapped, opponents beaten). */
function runPlayedKillTests(): boolean {
  let allPassed = true;
  const checkPlayed = (label: string, game: GaleGame) => {
    const killResult = game.checkKill();
    game.adoptKillLineCopy();
    const outcome = [
      killResult,
      game.areOpponentsBeaten(),
      game.killMisses,
      game.hand.map((card) => card.name),
    ];
    const expected = [2, true, 0, []];
    const isGood = JSON.stringify(outcome) === JSON.stringify(expected);
    console.log(
      `${isGood ? 'OK ' : 'BAD'} played for real: ${label}: got ${JSON.stringify(outcome)}, expected ${JSON.stringify(expected)}`,
    );
    allPassed = allPassed && isGood;
  };
  checkPlayed(
    'Guildmage + Mindcrank, Cacophony cast from hand (5 lands)',
    board({
      battlefieldNames: ['Duskmantle Guildmage', 'Mindcrank'],
      hand: ['Maddening Cacophony'],
    }),
  );
  checkPlayed(
    'Riverchurn Monument cast, kicked Cacophony, Monument exhausted (12 lands)',
    board({
      hand: ['Maddening Cacophony', 'Riverchurn Monument'],
      lands: [...repeatName('Island', 9), ...repeatName('Swamp', 3)],
    }),
  );
  return allPassed;
}
