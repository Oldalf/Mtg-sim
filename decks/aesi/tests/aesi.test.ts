/** Rules checks on hand-built boards. Run: npm run sim -- aesi --test */
import * as C from '../../../engine/cards';
import { Cost } from '../../../engine/cards';
import { Permanent } from '../../../engine/game-types';
import { Rng } from '../../../engine/rng';
import { CFG } from '../config';
import { keepsHand, DEFAULT_MULLIGAN } from '../../../engine/mulligan';
import { MULLIGAN } from '../mulligan';
import { AesiGame } from '../game';
import {
  AESI,
  RETREAT,
  KODAMA,
  MELOKU,
  UYO,
  MINDSWEEPER,
  COBRA,
  OMNI,
  KIRI,
  HARU,
  BSZ,
  SWARM,
  CHAMBER,
  TOK,
} from '../cards';

const repeatName = (cardName: string, count: number) =>
  new Array(count).fill(cardName) as string[];

function board(
  battlefieldNames: string[] = [],
  hand: string[] = [],
  library: string[] = [
    ...repeatName('Forest', 30),
    ...repeatName('Island', 30),
  ],
  lands = [...repeatName('Forest', 4), ...repeatName('Island', 4)],
): AesiGame {
  const game = new AesiGame([], library, new Rng(1), { ...CFG });
  game.startTurn();
  game.turn = 6;
  game.command = [];
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
  return game;
}

export function runAesiTests(): boolean {
  let allPassed = true;
  const check = (label: string, got: unknown, expect: unknown) => {
    const good = JSON.stringify(got) === JSON.stringify(expect);
    console.log(
      `${good ? 'OK ' : 'BAD'} ${label}: got ${JSON.stringify(got)}, expected ${JSON.stringify(expect)}`,
    );
    allPassed = allPassed && good;
  };
  const army = (game: AesiGame) =>
    game.battlefield.some(
      (permanent) =>
        permanent.card === TOK.illusionArmy || permanent.card === TOK.snakeArmy,
    );

  // land drops: 1 + Aesi + Azusa (2) + Loot = 5
  let game = board([
    AESI,
    'Azusa, Lost but Seeking',
    'Loot, Exuberant Explorer',
  ]);
  check('land drops with Aesi, Azusa and Loot', game.dropsAllowed(), 5);

  // Evolving Wilds with Aesi: two landfall triggers = two cards
  game = board([AESI], ['Evolving Wilds']);
  const lib0 = game.library.length;
  game.playLandVia();
  check(
    'Evolving Wilds with Aesi: 2 draws, the basic enters tapped',
    [
      lib0 - game.library.length - 1,
      game.landsOnBattlefield().filter((permanent) => permanent.tapped).length,
    ],
    [2, 1],
  );

  // ability costs: Familiar makes Dokai's {4}{G}{G} cost {2}{G}{G}; Meloku's {1} stays {1}; Training Grounds + Familiar: {G}{G}
  game = board(["Biomancer's Familiar"]);
  check(
    'Familiar: {4}{G}{G} -> 4 mana, {1} -> 1, {2} -> 1',
    [
      game.abilityCost(Cost.parse('{4}{G}{G}')).manaValue,
      game.abilityCost(new Cost(1)).manaValue,
      game.abilityCost(new Cost(2)).manaValue,
    ],
    [4, 1, 1],
  );
  game = board(["Biomancer's Familiar", 'Training Grounds']);
  check(
    'Familiar + Training Grounds: {4}{G}{G} -> {G}{G}',
    game.abilityCost(Cost.parse('{4}{G}{G}')).manaValue,
    2,
  );

  // Retreat untaps Walking Atlas: one Atlas puts two lands
  game = board([RETREAT, 'Walking Atlas'], ['Forest', 'Island']);
  game.dropsUsed = 1;
  game.playLandVia();
  game.playLandVia();
  check(
    'Retreat + Atlas: one Atlas puts both lands (Retreat untaps it after the first)',
    [game.landsInHand().length, game.dropsUsed],
    [0, 1],
  );

  // Lotus Cobra: a mana per landfall
  game = board([COBRA], ['Forest']);
  game.playLandVia();
  check(
    'Lotus Cobra: one mana floating after a land',
    game.pool.U + game.pool.G,
    1,
  );

  // Kodama: a land drop puts a second land from hand
  game = board([KODAMA], ['Forest', 'Island']);
  game.playLandVia();
  check(
    'Kodama: one land drop puts both lands',
    [game.landsInHand().length, game.dropsUsed],
    [0, 1],
  );

  // Simic Growth Chamber returns a tapped basic
  game = board([], [CHAMBER]);
  game.landsOnBattlefield()[0].tapped = true;
  game.playLandVia();
  check(
    'Simic Growth Chamber: enters tapped, returns a tapped basic',
    [
      game.findPermanent(CHAMBER)!.tapped,
      game.landsInHand().map((card) => card.name),
    ],
    [true, ['Forest']],
  );

  // the loops
  // Retreat + Atlas + Simic Growth Chamber in hand + Aesi: endless landfall -> draw down to 5 cards
  game = board([AESI, RETREAT, 'Walking Atlas'], [CHAMBER]);
  let loops = game.loops();
  check(
    'Retreat + Atlas + Chamber: endless landfall and draws, no endless mana',
    [loops.landfall, loops.draw, loops.mana],
    [true, true, false],
  );
  game.comboSolve();
  check('  ... the solver draws the library down to 5', game.library.length, 5);

  // Retreat + Atlas + Mindsweeper + Familiar: mill everyone
  game = board([RETREAT, 'Walking Atlas', MINDSWEEPER, "Biomancer's Familiar"]);
  game.checkKill();
  check(
    'Retreat + Atlas + Mindsweeper + Familiar: everyone milled',
    game.opponentLibrarySizes,
    [0, 0, 0],
  );

  // without a reducer the Mindsweeper loop loses a mana each time: no loop; with Lotus Cobra it's endless mana
  game = board([RETREAT, 'Walking Atlas', MINDSWEEPER]);
  check('Mindsweeper without a reducer: no loop', game.loops().landfall, false);
  game = board([RETREAT, 'Walking Atlas', MINDSWEEPER, COBRA]);
  loops = game.loops();
  check(
    'Mindsweeper + Lotus Cobra: endless mana and mill',
    [loops.mana, loops.mill],
    [true, true],
  );

  // Oboro Breezecaller pays for itself (return one land, untap another)
  game = board([RETREAT, 'Sakura-Tribe Scout', 'Oboro Breezecaller', AESI]);
  loops = game.loops();
  check(
    'Breezecaller + Retreat + Scout: endless landfall, no reducer needed',
    [loops.landfall, loops.mana, loops.draw],
    [true, false, true],
  );

  // Mirror-Mage returns three lands for {3}: even; with Familiar, +2 a loop = endless mana
  game = board([RETREAT, 'Walking Atlas', 'Soratami Mirror-Mage']);
  check(
    'Mirror-Mage: endless landfall without a reducer',
    [game.loops().landfall, game.loops().mana],
    [true, false],
  );
  game = board([
    RETREAT,
    'Walking Atlas',
    'Soratami Mirror-Mage',
    "Biomancer's Familiar",
  ]);
  check('Mirror-Mage + Familiar: endless mana', game.loops().mana, true);

  // Kodama + Meloku: endless Illusions, they attack next turn
  game = board([KODAMA, MELOKU]);
  game.checkKill();
  check(
    'Kodama + Meloku: an Illusion army, not a win yet',
    [army(game), game.areOpponentsBeaten()],
    [true, false],
  );
  game.startTurn();
  game.combat();
  check(
    '  ... the army kills everyone next turn',
    game.areOpponentsBeaten(),
    true,
  );

  // Uyo + Retreat + Atlas + Blue Sun's Zenith in hand (4 mana for X = 1): copies mill everyone
  game = board([UYO, RETREAT, 'Walking Atlas'], [BSZ]);
  game.checkKill();
  check(
    "Uyo + Retreat + Atlas + Blue Sun's Zenith: everyone milled",
    game.opponentLibrarySizes,
    [0, 0, 0],
  );

  // Uyo copying Endless Swarm: a Snake army
  game = board(
    [UYO, RETREAT, 'Walking Atlas'],
    [SWARM, 'Island', 'Forest'],
    undefined,
    [...repeatName('Forest', 6), ...repeatName('Island', 4)],
  );
  game.checkKill();
  check(
    'Uyo + Retreat + Atlas + Endless Swarm: Snake army, epic',
    [army(game), game.epic],
    [true, true],
  );

  // Omniscience + Kiri-Onna + Haru-Onna: endless draws; the library has Kodama and Meloku -> Illusion army
  game = board(
    [OMNI],
    [KIRI, HARU],
    [...repeatName('Forest', 20), KODAMA, MELOKU, ...repeatName('Island', 20)],
  );
  game.checkKill();
  check(
    'Omniscience + Onnas: draws, casts Kodama + Meloku for free -> Illusion army',
    [game.isOnBattlefield(KODAMA), game.isOnBattlefield(MELOKU), army(game)],
    [true, true, true],
  );

  // Omniscience + Onnas with Mindsweeper, Familiar, Retreat and an old Walking Atlas: mill now (Pontus's turn 10)
  game = board(
    [OMNI, 'Walking Atlas', AESI],
    [KIRI, HARU],
    [
      ...repeatName('Forest', 20),
      MINDSWEEPER,
      RETREAT,
      "Biomancer's Familiar",
      ...repeatName('Island', 20),
    ],
  );
  game.checkKill();
  check(
    "Pontus's turn 10: Omniscience + Onnas find Retreat, Familiar, Mindsweeper -> everyone milled",
    game.opponentLibrarySizes,
    [0, 0, 0],
  );

  // Endless Swarm: a Snake per card in hand, then epic stops spells; the next upkeep copies it
  game = board(
    [],
    [SWARM, 'Forest', 'Island', 'Growth Spiral'],
    undefined,
    repeatName('Forest', 8),
  );
  game.castInstantOrSorcery(C.get(SWARM));
  const snakes = () =>
    game.battlefield.filter((permanent) => permanent.card === TOK.snake).length;
  const snakesBefore = snakes();
  const cast = game.castInstantOrSorcery(C.get('Growth Spiral'));
  game.upkeep();
  check(
    'Endless Swarm: 3 Snakes, no more spells, 3 more next upkeep',
    [snakesBefore, cast, snakes()],
    [3, false, 6],
  );

  // Patron of the Moon by moonfolk offering: sacrifice Floodbringer ({1}{U}) -> pay {4}{U}
  game = board(
    ['Floodbringer'],
    ['Patron of the Moon'],
    undefined,
    repeatName('Island', 5),
  );
  const candidate = game
    .candidates(false)
    .find((option) => option.cost.manaValue === 5 && option.score > 74);
  check(
    'Patron of the Moon via Floodbringer: costs 5',
    candidate !== undefined,
    true,
  );

  // ---- lands as creatures (Nature's Revolt, Natural Affinity, Sylvan Awakening)
  // Nature's Revolt: a replayed land is a summoning-sick creature (no mana), so Kodama + Meloku stops paying for itself
  game = board([KODAMA, MELOKU, "Nature's Revolt"]);
  game.revolt = true;
  check(
    "Nature's Revolt breaks Kodama + Meloku (replayed lands can't tap)",
    game.loops().landfall,
    false,
  );
  game = board([KODAMA, MELOKU, "Nature's Revolt", RETREAT]);
  game.revolt = true;
  check(
    '  ... but with Retreat (it untaps an older land each time) it works again',
    game.loops().landfall,
    true,
  );
  game = board([KODAMA, MELOKU, "Nature's Revolt", COBRA]);
  game.revolt = true;
  check('  ... and with Lotus Cobra', game.loops().landfall, true);
  game = board([MELOKU, RETREAT, 'Walking Atlas', "Nature's Revolt"]);
  game.revolt = true;
  check(
    "Nature's Revolt breaks Retreat + Atlas + Meloku",
    game.loops().landfall,
    false,
  );
  game = board([MELOKU, RETREAT, 'Walking Atlas', 'Sylvan Awakening']);
  game.awakened = true;
  check(
    "Sylvan Awakening doesn't (haste: replayed lands still tap)",
    game.loops().landfall,
    true,
  );
  // a land that entered this turn can't tap under Revolt
  game = board(["Nature's Revolt"], ['Forest']);
  game.revolt = true;
  game.playLandVia();
  check(
    "Nature's Revolt: the land played this turn makes no mana",
    game.availMana(),
    8,
  );

  // land lock: Omniscience + Onnas + Natural Affinity in hand -> Kiri-Onna bounces every opponent's land
  game = board([OMNI], [KIRI, HARU, 'Natural Affinity']);
  game.checkKill();
  check(
    'Omniscience + Onnas + Natural Affinity: land lock (counts as a win)',
    [game.locked, game.areOpponentsBeaten()],
    [true, true],
  );
  game = board([OMNI], [KIRI, HARU, 'Natural Affinity']);
  game.config.land_lock_win = false;
  game.checkKill();
  check('  ... not with land_lock_win off', game.locked, false);

  // Sylvan Awakening: cast when our lands (2/2 haste, half blocked) kill the table
  game = board([], ['Sylvan Awakening'], undefined, [
    ...repeatName('Forest', 6),
    ...repeatName('Island', 6),
  ]);
  game.life = [4, 4, 4];
  const awakeningCandidate = game
    .candidates(false)
    .find((option) => option.score === 98);
  check(
    'Sylvan Awakening: 12 lands, 3 pay for it, 9 attack (5 unblocked = 10 damage) vs 12 life: no',
    awakeningCandidate === undefined,
    true,
  );
  game.life = [3, 3, 3];
  check(
    '  ... vs 9 life: yes',
    game.candidates(false).some((option) => option.score === 98),
    true,
  );

  // ---- land tutors and utility lands
  // Sylvan Scrying with Retreat + Atlas out: gets Simic Growth Chamber -> the Retreat loop (Aesi draws)
  game = board(
    [RETREAT, 'Walking Atlas', AESI],
    ['Sylvan Scrying'],
    [...repeatName('Forest', 30), CHAMBER, ...repeatName('Island', 30)],
  );
  check(
    'Retreat + Atlas: Sylvan Scrying wants the Chamber',
    game.landTutorTarget()?.name,
    CHAMBER,
  );
  game.castInstantOrSorcery(C.get('Sylvan Scrying'));
  game.checkKill();
  check(
    '  ... and the loop draws the library down to 5',
    game.library.length,
    5,
  );
  // Crop Rotation puts the Chamber onto the battlefield; it returns itself (the loop wants it in hand)
  game = board(
    [RETREAT, 'Walking Atlas'],
    ['Crop Rotation'],
    [
      ...repeatName('Forest', 30),
      'Guildless Commons',
      ...repeatName('Island', 30),
    ],
  );
  game.castInstantOrSorcery(C.get('Crop Rotation'));
  check(
    'Crop Rotation -> Guildless Commons, which returns itself',
    game.hand.map((card) => card.name),
    ['Guildless Commons'],
  );
  // Uyo copies Explosive Vegetation: 4 basics for two returned lands
  game = board([UYO], ['Explosive Vegetation']);
  const landsBefore = game.landsOnBattlefield().length;
  game.castInstantOrSorcery(C.get('Explosive Vegetation'));
  check(
    'Uyo copies Explosive Vegetation: +4 lands, 2 back in hand',
    [game.landsOnBattlefield().length - landsBefore, game.landsInHand().length],
    [2, 2],
  );

  // ---- Elven Raft-Steerer, Tatyova, Nature's Lore
  game = board(['Elven Raft-Steerer', 'Walking Atlas'], ['Forest', 'Island']);
  game.dropsUsed = 1;
  game.playLandVia();
  game.playLandVia();
  check(
    'Elven Raft-Steerer untaps Walking Atlas like Retreat (both lands from one Atlas)',
    [game.landsInHand().length, game.dropsUsed],
    [0, 1],
  );
  game = board([
    'Elven Raft-Steerer',
    'Walking Atlas',
    'Soratami Mindsweeper',
    "Biomancer's Familiar",
  ]);
  game.checkKill();
  check(
    'Raft-Steerer + Atlas + Mindsweeper + Familiar: everyone milled',
    game.opponentLibrarySizes,
    [0, 0, 0],
  );
  game = board(['Tatyova, Benthic Druid'], ['Forest']);
  const libraryBefore = game.library.length;
  game.playLandVia();
  check('Tatyova: a land draws a card', libraryBefore - game.library.length, 1);
  game = board(
    ['Tatyova, Benthic Druid', 'Retreat to Coralhelm', 'Walking Atlas'],
    ['Simic Growth Chamber'],
  );
  game.checkKill();
  check(
    'Tatyova alone is an engine: Retreat + Atlas + Chamber draws the library down to 5',
    game.library.length,
    5,
  );
  game = board(
    [],
    ["Nature's Lore"],
    [...repeatName('Forest', 20), ...repeatName('Island', 20)],
  );
  const untappedLandsBefore = game
    .landsOnBattlefield()
    .filter((permanent) => !permanent.tapped).length;
  game.castInstantOrSorcery(C.get("Nature's Lore"));
  check(
    "Nature's Lore: a Forest, untapped",
    [
      game.landsOnBattlefield().length,
      game.landsOnBattlefield().filter((permanent) => !permanent.tapped)
        .length -
        untappedLandsBefore +
        2,
    ],
    [9, 1],
  );

  // ---- dual lands: the real "enters tapped unless" conditions, and the pain land
  const landTapped = (
    name: string,
    battlefieldNames: string[],
    hand: string[] = [],
  ) => {
    const game = board([], [name, ...hand], undefined, battlefieldNames);
    game.playLandVia(null, C.get(name));
    return game.findPermanent(name)!.tapped;
  };
  check(
    'Hinterland Harbor: tapped with no Forest or Island',
    landTapped('Hinterland Harbor', []),
    true,
  );
  check(
    '  ... untapped with a Forest',
    landTapped('Hinterland Harbor', ['Forest']),
    false,
  );
  check(
    'Botanical Sanctum: untapped with two other lands',
    landTapped('Botanical Sanctum', ['Forest', 'Island']),
    false,
  );
  check(
    '  ... tapped with three other lands',
    landTapped('Botanical Sanctum', ['Forest', 'Island', 'Forest']),
    true,
  );
  check(
    'Vineglimmer Snarl: tapped with no Forest or Island in hand',
    landTapped('Vineglimmer Snarl', ['Forest']),
    true,
  );
  check(
    '  ... untapped when it can reveal a Forest',
    landTapped('Vineglimmer Snarl', ['Forest'], ['Forest']),
    false,
  );
  check(
    'Command Tower and Yavimaya Coast: untapped',
    [landTapped('Command Tower', []), landTapped('Yavimaya Coast', [])],
    [false, false],
  );
  check(
    'Temple of Mystery: tapped',
    landTapped('Temple of Mystery', ['Forest']),
    true,
  );
  game = board([], [], undefined, ['Yavimaya Coast', 'Island']);
  game.pay(Cost.parse('{G}'));
  check('Yavimaya Coast: {G} costs 1 life', game.myLife, 39);
  game = board([], [], undefined, ['Yavimaya Coast']);
  game.pay(new Cost(1));
  check("  ... {C} for a generic cost doesn't", game.myLife, 40);
  game = board([], [], undefined, ['Yavimaya Coast', 'Island']);
  game.canPay(Cost.parse('{G}'));
  game.canPay(Cost.parse('{G}'));
  check(
    '  ... and just checking whether we can pay costs nothing',
    game.myLife,
    40,
  );

  // ---- land-fetch spells that never miss
  const forests = (game: AesiGame) =>
    game
      .landsOnBattlefield()
      .filter((permanent) => permanent.card.name === 'Forest').length;
  game = board(
    [],
    ['Three Visits'],
    [...repeatName('Forest', 20), ...repeatName('Island', 20)],
  );
  let forestCount = forests(game);
  game.castInstantOrSorcery(C.get('Three Visits'));
  check(
    'Three Visits: a Forest, untapped',
    [
      forests(game) - forestCount,
      game
        .landsOnBattlefield()
        .slice(-1)
        .every((permanent) => !permanent.tapped),
    ],
    [1, true],
  );
  game = board(
    [],
    ['Skyshroud Claim'],
    [...repeatName('Forest', 20), ...repeatName('Island', 20)],
  );
  forestCount = forests(game);
  game.castInstantOrSorcery(C.get('Skyshroud Claim'));
  check(
    'Skyshroud Claim: two Forests, untapped',
    [
      forests(game) - forestCount,
      game
        .landsOnBattlefield()
        .slice(-2)
        .every((permanent) => !permanent.tapped),
    ],
    [2, true],
  );
  game = board(
    [],
    ['Wood Elves'],
    [...repeatName('Forest', 20), ...repeatName('Island', 20)],
  );
  forestCount = forests(game);
  game.castPerm(C.get('Wood Elves'));
  check(
    'Wood Elves: a Forest, untapped, and a creature',
    [forests(game) - forestCount, game.isOnBattlefield('Wood Elves')],
    [1, true],
  );
  game = board(
    [],
    ['Search for Tomorrow'],
    [...repeatName('Forest', 20), ...repeatName('Island', 20)],
  );
  const landsAfter = game.landsOnBattlefield().length;
  game.suspendSearch(C.get('Search for Tomorrow'));
  game.upkeep();
  const afterOne = game.landsOnBattlefield().length - landsAfter;
  game.upkeep();
  check(
    'Search for Tomorrow: suspended for {G}, the land arrives at the second upkeep, untapped',
    [
      afterOne,
      game.landsOnBattlefield().length - landsAfter,
      game.landsOnBattlefield().filter((permanent) => permanent.tapped).length,
    ],
    [0, 1, 1],
  );

  // ---- mulligan rule (decks/aesi/mulligan.ts, engine/mulligan.ts)
  const hand = (names: string[]) => names.map((cardName) => C.get(cardName));
  const keep = (names: string[], attempt = 0) =>
    keepsHand(MULLIGAN, attempt, hand(names));
  const FOREST = 'Forest',
    ISLAND = 'Island';
  check(
    'mulligan: 3 lands with a Forest and spells is a keep',
    keep([
      FOREST,
      ISLAND,
      ISLAND,
      'Kiri-Onna',
      'Uyo, Silent Prophet',
      'Omniscience',
      'Haru-Onna',
    ]),
    true,
  );
  check(
    'mulligan: 4 Islands and no green source goes back',
    keep([
      ISLAND,
      ISLAND,
      ISLAND,
      ISLAND,
      'Kiri-Onna',
      'Uyo, Silent Prophet',
      'Omniscience',
    ]),
    false,
  );
  check(
    'mulligan: 2 lands with green and cheap ramp is a keep',
    keep([
      FOREST,
      ISLAND,
      'Rampant Growth',
      'Kiri-Onna',
      'Uyo, Silent Prophet',
      'Omniscience',
      'Haru-Onna',
    ]),
    true,
  );
  check(
    'mulligan: 2 lands with green but no cheap ramp goes back',
    keep([
      FOREST,
      ISLAND,
      'Kiri-Onna',
      'Uyo, Silent Prophet',
      'Omniscience',
      'Haru-Onna',
      'Patron of the Moon',
    ]),
    false,
  );
  check(
    'mulligan: a one-lander goes back, even at 6 cards',
    [
      keep([
        FOREST,
        'Rampant Growth',
        'Kiri-Onna',
        'Uyo, Silent Prophet',
        'Omniscience',
        'Haru-Onna',
        'Patron of the Moon',
      ]),
      keep(
        [
          FOREST,
          'Rampant Growth',
          'Kiri-Onna',
          'Uyo, Silent Prophet',
          'Omniscience',
          'Haru-Onna',
          'Patron of the Moon',
        ],
        2,
      ),
    ],
    [false, false],
  );
  check(
    'mulligan: a fetch land counts as a green source',
    keep([
      'Evolving Wilds',
      ISLAND,
      ISLAND,
      'Kiri-Onna',
      'Uyo, Silent Prophet',
      'Omniscience',
      'Haru-Onna',
    ]),
    true,
  );
  check(
    "mulligan: after the free mulligan 6 lands are kept (with green), the default rule isn't",
    [
      keep([FOREST, FOREST, FOREST, ISLAND, ISLAND, ISLAND, 'Kiri-Onna'], 1),
      keepsHand(
        DEFAULT_MULLIGAN,
        1,
        hand([FOREST, FOREST, FOREST, ISLAND, ISLAND, ISLAND, 'Kiri-Onna']),
      ),
    ],
    [true, false],
  );

  return allPassed;
}
