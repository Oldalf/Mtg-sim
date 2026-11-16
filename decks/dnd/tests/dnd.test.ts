/** Rules checks on hand-built boards. Run: npm run sim -- dnd --test */
import * as C from '../../../engine/cards/cards';
import { Arena, Permanent } from '../../../engine/game/game-types';
import { Answer } from '../../../engine/game/answers';
import { Rng } from '../../../engine/util/rng';
import { ALL_ABOARD, ANCESTRAL_RECALL, PREPARED } from '../cards';
import { CFG } from '../config';
import { DndGame } from '../game';
import { buildCandidates } from '../candidates';

const repeatName = (cardName: string, count: number) =>
  new Array(count).fill(cardName) as string[];

function board(
  battlefieldNames: string[] = [],
  hand: string[] = [],
  lands = [...repeatName('Plains', 4), ...repeatName('Island', 4)],
  library = [...repeatName('Plains', 20), ...repeatName('Island', 20)],
): DndGame {
  const game = new DndGame([], library, new Rng(1), { ...CFG });
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

/** Puts the game in a pod of stand-in opponents. `snipeHits` is what a snipe takes (null: nothing worth it);
 *  `opponentBoard` the power of each opponent's creatures. Returns the list of what was asked of the pod. */
function joinPod(
  game: DndGame,
  snipeHits: string | null,
  opponentBoard: number[] = [],
): string[] {
  const calls: string[] = [];
  game.arena = {
    real: () => true,
    announceCast: () => {},
    counter: () => false,
    board: () => opponentBoard,
    snipe: (
      _game: unknown,
      answer: Answer,
      sourceName: string,
      minimumValue = 0,
    ) => {
      calls.push(`snipe ${sourceName} ${answer.how} ${minimumValue}`);
      return snipeHits;
    },
    bounceAllCreatures: (_game: unknown, sourceName: string) =>
      calls.push(`bounce all ${sourceName}`),
  } as unknown as Arena;
  return calls;
}

const namesOnBattlefield = (game: DndGame, cardName: string): number =>
  game.battlefield.filter((permanent) => permanent.card.name === cardName)
    .length;

export function runDndTests(): boolean {
  let allPassed = true;
  const check = (label: string, got: unknown, expect: unknown) => {
    const good = JSON.stringify(got) === JSON.stringify(expect);
    console.log(
      `${good ? 'OK ' : 'BAD'} ${label}: got ${JSON.stringify(got)}, expected ${JSON.stringify(expect)}`,
    );
    if (!good) allPassed = false;
  };

  // ---------------------------------------------------------------- enter triggers
  {
    const game = board(['Panharmonicon']);
    game.enter(C.get('Veteran Dungeoneer'));
    check(
      'Panharmonicon: Veteran Dungeoneer ventures twice',
      game.dungeonPosition?.room,
      'Goblin Lair',
    );
  }
  {
    const game = board(['Hama Pashar, Ruin Seeker']);
    game.enter(C.get('Veteran Dungeoneer'));
    game.enter(C.get('Veteran Dungeoneer'));
    check(
      'Hama Pashar: the Goblin Lair makes two Goblins',
      namesOnBattlefield(game, 'Goblin'),
      2,
    );
  }
  {
    const game = board();
    game.enter(C.get('Aether Channeler'));
    const full = board([], repeatName('Plains', 6));
    full.enter(C.get('Aether Channeler'));
    check(
      'Aether Channeler: a card, or a Bird with a full hand',
      [game.hand.length, namesOnBattlefield(full, 'Bird')],
      [1, 1],
    );
  }
  {
    const game = board();
    game.enter(C.get('Niko, Light of Hope'));
    check('Niko: two Shards', namesOnBattlefield(game, 'Shard'), 2);
  }
  {
    const game = board();
    game.enter(C.get('Oji, the Exquisite Blade'));
    check('Oji: we gain 2', game.myLife, 42);
  }
  {
    const game = board();
    game.enter(C.get('Rasputin, the Oneiromancer'));
    check(
      'Rasputin: a dream counter per opponent',
      game.rasputinDreamCounters,
      3,
    );
  }
  {
    const behind = board([], [], ['Plains', 'Island']);
    behind.enter(C.get('Knight of the White Orchid'));
    const ahead = board();
    ahead.enter(C.get('Knight of the White Orchid'));
    check(
      'Knight of the White Orchid: a Plains only when an opponent has more lands',
      [behind.landsOnBattlefield().length, ahead.landsOnBattlefield().length],
      [3, 8],
    );
  }
  {
    const game = board([
      "Cathars' Crusade",
      'Panharmonicon',
      'Yuan-Ti Malison',
    ]);
    game.enter(C.get('Wall of Omens'));
    check(
      "Cathars' Crusade with Panharmonicon: two counters on each creature as one enters",
      game.creatures().map((creature) => creature.counters),
      [2, 2],
    );
  }
  {
    const game = board(['Radiant Solar']);
    game.enter(C.get('Wall of Omens'));
    game.createTokens(C.makeToken('Goblin', 1, 1, 'red'));
    check(
      'Radiant Solar: another nontoken creature entering ventures (a token does not)',
      game.dungeonPosition?.room,
      'Cave Entrance',
    );
  }
  {
    const game = board();
    game.enter(C.get("Archaeomancer's Map"));
    check(
      "Archaeomancer's Map: two Plains to hand",
      game.hand.map((card) => card.name),
      ['Plains', 'Plains'],
    );
  }
  {
    const library = ['Momo, Playful Pet', ...repeatName('Plains', 10)];
    const rich = board([], [], undefined, library);
    rich.enter(C.get('Starfield Shepherd'));
    const poor = board([], [], ['Plains'], library);
    poor.enter(C.get('Starfield Shepherd'));
    check(
      'Starfield Shepherd: Momo, or a Plains while short of lands',
      [rich.hand[0].name, poor.hand[0].name],
      ['Momo, Playful Pet', 'Plains'],
    );
  }

  // ---------------------------------------------------------------- leave triggers and blink
  {
    const game = board(['Momo, Playful Pet', 'Veteran Dungeoneer']);
    game.dies(game.findPermanent('Momo, Playful Pet')!);
    check(
      'Momo leaves: a +1/+1 counter on our best creature',
      game.findPermanent('Veteran Dungeoneer')!.counters,
      1,
    );
  }
  {
    const game = board(['Genku, Future Shaper', 'Wall of Omens']);
    game.blinkBestCreature();
    game.blinkBestCreature();
    game.dies(game.battlefield.find((permanent) => permanent.token)!);
    check(
      'Genku: a Fox, then a Moonfolk; a token leaving makes none',
      game.battlefield
        .filter((permanent) => permanent.token)
        .map((permanent) => permanent.card.name),
      ['Moonfolk'],
    );
  }
  {
    const game = board(['Veteran Dungeoneer', 'Brago, King Eternal']);
    const dungeoneer = game.findPermanent('Veteran Dungeoneer')!;
    const goblin = game.createTokens(C.makeToken('Goblin', 1, 1, 'red'))[0];
    const before = [game.blinkValue(dungeoneer), game.blinkValue(goblin)];
    game.enter(C.get('Genku, Future Shaper'));
    check(
      'blink value: Veteran Dungeoneer 7 (9 with Genku), a token never',
      [...before, game.blinkValue(dungeoneer)],
      [7, -1, 9],
    );
  }
  {
    const game = board([
      'Brago, King Eternal',
      'Veteran Dungeoneer',
      'Wall of Omens',
      'Sol Ring',
    ]);
    game.onCombatDamage([game.findPermanent('Brago, King Eternal')!]);
    check(
      'Brago: the permanents worth it are blinked (a venture and a card)',
      [game.dungeonPosition?.room, game.hand.length],
      ['Cave Entrance', 1],
    );
  }
  {
    const game = board(['Thassa, Deep-Dwelling', 'Wall of Omens']);
    game.endStep();
    check('Thassa: our end step blinks Wall of Omens', game.hand.length, 1);
  }
  {
    const game = board(['Airbender Ascension']);
    for (let i = 0; i < 4; i++) game.enter(C.get('Wall of Omens'));
    const handBefore = game.hand.length;
    const questCounters = game.airbenderQuestCounters;
    game.endStep();
    check(
      'Airbender Ascension: four creatures entered, the end step blinks one',
      [questCounters, game.hand.length - handBefore],
      [4, 1],
    );
  }

  // ---------------------------------------------------------------- spells cast
  {
    const game = board(['Pensive Professor']);
    for (let i = 0; i < 3; i++) game.podAnnounceCast(C.get('Wall of Omens'));
    check(
      'Pensive Professor: 2-mana spells grow it (and draw) while its power is below 2',
      [game.findPermanent('Pensive Professor')!.counters, game.hand.length],
      [2, 2],
    );
  }
  {
    const game = board(['Oji, the Exquisite Blade', 'Wall of Omens']);
    game.spellsCast = 1;
    game.podAnnounceCast(C.get('Brainstorm'));
    check('Oji: no blink on the first spell', game.hand.length, 0);
    game.spellsCast = 2;
    game.podAnnounceCast(C.get('Brainstorm'));
    check('Oji: the second spell blinks Wall of Omens', game.hand.length, 1);
  }
  {
    const game = board([
      'Kykar, Zephyr Awakener',
      'Wall of Omens',
      'Veteran Dungeoneer',
    ]);
    game.step = 'main2';
    game.podAnnounceCast(C.get('Sol Ring'));
    const exiledUntilEndStep = !game.isOnBattlefield('Veteran Dungeoneer');
    game.podAnnounceCast(C.get('Wall of Omens'));
    game.endTurn();
    check(
      'Kykar: a noncreature spell blinks Veteran Dungeoneer until the end step (it ventures then); a creature spell does nothing',
      [
        exiledUntilEndStep,
        game.dungeonPosition?.room,
        namesOnBattlefield(game, 'Spirit'),
      ],
      [true, 'Cave Entrance', 0],
    );
  }
  {
    const game = board(['Kykar, Zephyr Awakener', 'Veteran Dungeoneer']);
    game.step = 'main1';
    game.podAnnounceCast(C.get('Sol Ring'));
    check(
      'Kykar before combat: a Spirit (the attacker is not blinked away)',
      [
        namesOnBattlefield(game, 'Spirit'),
        game.isOnBattlefield('Veteran Dungeoneer'),
      ],
      [1, true],
    );
  }
  {
    const game = board(['Veteran Dungeoneer']);
    const dungeoneer = game.findPermanent('Veteran Dungeoneer')!;
    dungeoneer.counters = 3;
    check(
      'blink value: the +1/+1 counters a blink would lose count against it',
      game.blinkValue(dungeoneer),
      4,
    );
  }
  {
    const game = board(['Tomb of Horrors Adventurer']);
    game.spellsCast = 2;
    game.podAnnounceCast(C.get('Veteran Dungeoneer'));
    check(
      'Tomb of Horrors Adventurer: the second spell is copied (a token Veteran Dungeoneer ventures)',
      [
        namesOnBattlefield(game, 'Veteran Dungeoneer'),
        game.dungeonPosition?.room,
      ],
      [1, 'Cave Entrance'],
    );
  }
  {
    const game = board(['Wall of Omens']);
    const conductor = game.enter(C.get('Skycoach Conductor'));
    const wasPrepared = !!(conductor.marks & PREPARED);
    game.castPreparedSpell(conductor, ALL_ABOARD);
    check(
      'Skycoach Conductor enters prepared; All Aboard blinks Wall of Omens and unprepares it',
      [wasPrepared, game.hand.length, !!(conductor.marks & PREPARED)],
      [true, 1, false],
    );
  }
  {
    const game = board();
    const emeritus = game.enter(C.get('Emeritus of Ideation'));
    game.castPreparedSpell(emeritus, ANCESTRAL_RECALL);
    check(
      'Emeritus of Ideation: Ancestral Recall draws three',
      game.hand.length,
      3,
    );
    game.graveyard = repeatName('Plains', 9).map((name) => C.get(name));
    game.onAttack([emeritus]);
    check(
      'Emeritus of Ideation attacks: eight cards exiled, prepared again',
      [game.graveyard.length, !!(emeritus.marks & PREPARED)],
      [1, true],
    );
  }

  // ---------------------------------------------------------------- upkeeps
  {
    const game = board([], [], ['Plains', 'Island']);
    game.enter(C.get('Land Tax'));
    game.upkeep();
    check(
      'Land Tax: three basic lands to hand when behind',
      game.hand.length,
      3,
    );
  }
  {
    const game = board(['Ephara, God of the Polis']);
    game.enter(C.get('Veteran Dungeoneer'));
    game.opponentUpkeep();
    game.opponentUpkeep();
    check(
      'Ephara: one card at the next upkeep after a creature entered',
      game.hand.length,
      1,
    );
  }
  {
    const game = board(['White Plume Adventurer', 'Veteran Dungeoneer']);
    for (const creature of game.creatures()) creature.tapped = true;
    game.opponentUpkeep();
    const untappedOne = game
      .creatures()
      .filter((creature) => !creature.tapped).length;
    game.completedDungeons = 1;
    for (const creature of game.creatures()) creature.tapped = true;
    game.opponentUpkeep();
    check(
      "White Plume Adventurer: one creature untaps at an opponent's upkeep, all with a completed dungeon",
      [
        untappedOne,
        game.creatures().filter((creature) => !creature.tapped).length,
      ],
      [1, 2],
    );
  }

  // ---------------------------------------------------------------- combat
  {
    const game = board(['Nadaar, Selfless Paladin', 'Veteran Dungeoneer']);
    game.onAttack([game.findPermanent('Nadaar, Selfless Paladin')!]);
    const dungeoneer = game.findPermanent('Veteran Dungeoneer')!;
    const powerBefore = game.power(dungeoneer);
    game.completedDungeons = 1;
    check(
      'Nadaar ventures as it attacks; the others +1/+1 after a completed dungeon',
      [game.dungeonPosition?.room, powerBefore, game.power(dungeoneer)],
      ['Cave Entrance', 3, 4],
    );
  }
  {
    const game = board(["Delver's Torch", 'Veteran Dungeoneer']);
    const candidate = buildCandidates(game, false).find(
      (each) => each.cost.generic === 3 && each.score === 45,
    )!;
    candidate.action();
    const dungeoneer = game.findPermanent('Veteran Dungeoneer')!;
    game.onAttack([dungeoneer]);
    check(
      "Delver's Torch: equipped (+1/+1), its holder ventures as it attacks",
      [game.power(dungeoneer), game.dungeonPosition?.room],
      [4, 'Cave Entrance'],
    );
  }
  {
    const game = board(['Undercellar Sweep', 'Veteran Dungeoneer']);
    const attacker = game.findPermanent('Veteran Dungeoneer')!;
    const withoutInitiative = game.onAttack([attacker]).length;
    game.hasInitiative = true;
    check(
      'Undercellar Sweep: two Soldiers join the attack with the initiative',
      [withoutInitiative, game.onAttack([attacker]).length],
      [0, 2],
    );
  }
  {
    const game = board(['Midnight Pathlighter', 'Yuan-Ti Malison']);
    const malison = game.findPermanent('Yuan-Ti Malison')!;
    game.onCombatDamage([malison]);
    check(
      'Yuan-Ti Malison and Midnight Pathlighter venture on combat damage',
      game.dungeonPosition?.room,
      'Goblin Lair',
    );
  }
  {
    const game = board([
      'Midnight Pathlighter',
      'White Plume Adventurer',
      'Yuan-Ti Malison',
      'Kykar, Zephyr Awakener',
    ]);
    const evasiveNames = game
      .creatures()
      .filter((creature) => game.evasive(creature))
      .map((creature) => creature.card.name);
    check(
      "Midnight Pathlighter (goldfish): an opponent's legendary commander blocks our biggest ground creature",
      evasiveNames,
      ['Midnight Pathlighter', 'Yuan-Ti Malison', 'Kykar, Zephyr Awakener'],
    );
    check(
      'Midnight Pathlighter (pod): only legendary creatures block our ground creatures; a flyer is a flyer',
      game.creatures().map((creature) => game.evasion(creature)),
      ['legendary', 'legendary', 'legendary', 'flying'],
    );
  }
  {
    const game = board(['Cloister Gargoyle']);
    const gargoyle = game.findPermanent('Cloister Gargoyle')!;
    const before = [game.power(gargoyle), game.evasive(gargoyle)];
    game.completedDungeons = 1;
    check(
      'Cloister Gargoyle: +3/+0 and flying after a completed dungeon',
      [...before, game.power(gargoyle), game.evasive(gargoyle)],
      [0, false, 3, true],
    );
  }

  // ---------------------------------------------------------------- control in a pod (a stand-in for the other players)
  {
    const game = board();
    const calls = joinPod(game, 'a Sol Ring');
    game.enter(C.get('Aether Channeler'));
    check(
      "Aether Channeler in a pod: bounces an opponent's permanent worth 60 or more instead of drawing",
      [calls, game.hand.length],
      [['snipe Aether Channeler bounce 60'], 0],
    );
  }
  {
    const game = board();
    const calls = joinPod(game, null);
    game.enter(C.get('Aether Channeler'));
    check(
      'Aether Channeler in a pod with nothing worth bouncing: draws',
      game.hand.length,
      1,
    );
    check('(it looked first)', calls, ['snipe Aether Channeler bounce 60']);
  }
  {
    const game = board(['Hullbreaker Horror']);
    const calls = joinPod(game, 'a Sol Ring');
    game.podAnnounceCast(C.get('Brainstorm'));
    check(
      "Hullbreaker Horror in a pod: each spell we cast bounces an opponent's best nonland permanent",
      calls,
      ['snipe Hullbreaker Horror bounce 0'],
    );
  }
  {
    const game = board(
      ['Veteran Dungeoneer', 'Wall of Omens'],
      ["Avatar's Wrath"],
    );
    const calls = joinPod(game, null, [12]);
    game.onEnterStep('main2');
    check(
      "Avatar's Wrath in a pod, behind on board: every opponent's creatures bounce; we keep our strongest, the rest to hand",
      [
        calls,
        game.isOnBattlefield('Veteran Dungeoneer'),
        game.hand.map((card) => card.name),
      ],
      [["bounce all Avatar's Wrath"], true, ['Wall of Omens']],
    );
  }
  {
    const game = board([], ["Avatar's Wrath"]);
    const calls = joinPod(game, null, [6]);
    game.onEnterStep('main2');
    check(
      "Avatar's Wrath waits while the opponents' boards are small",
      [calls, game.hand.length],
      [[], 1],
    );
  }
  {
    const game = board();
    game.resolve(C.get("Morningtide's Light"));
    const shieldedNow = game.fogPrevent(20, true);
    game.startTurn();
    check(
      "Morningtide's Light: all damage to us is prevented until our next turn",
      [shieldedNow, game.fogPrevent(20, true)],
      [true, false],
    );
  }

  // ---------------------------------------------------------------- activated abilities
  {
    const game = board(['Dungeon Map']);
    const map = game.findPermanent('Dungeon Map')!;
    const candidate = buildCandidates(game, false).find(
      (each) => each.cost.generic === 3 && each.score === 50,
    )!;
    candidate.action();
    check(
      'Dungeon Map: {3} and tap it to venture',
      [game.dungeonPosition?.room, map.tapped],
      ['Cave Entrance', true],
    );
  }
  {
    const game = board(['Rasputin, the Oneiromancer']);
    game.rasputinDreamCounters = 3;
    const candidate = buildCandidates(game, true).find(
      (each) => each.score === 45,
    )!;
    candidate.action();
    check(
      'Rasputin: tap, remove a dream counter, a 2/2 Knight',
      [namesOnBattlefield(game, 'Knight'), game.rasputinDreamCounters],
      [1, 2],
    );
  }
  {
    const game = board(['Niko, Light of Hope', 'Veteran Dungeoneer']);
    const candidate = buildCandidates(game, true).find(
      (each) => each.score === 35 + 5 * 7,
    )!;
    candidate.action();
    const exiledNow = game.isOnBattlefield('Veteran Dungeoneer');
    game.endTurn();
    check(
      'Niko: the creature is exiled until the end step, then its trigger ventures',
      [
        exiledNow,
        game.isOnBattlefield('Veteran Dungeoneer'),
        game.dungeonPosition?.room,
      ],
      [false, true, 'Cave Entrance'],
    );
  }

  // ---------------------------------------------------------------- blink in answer to removal and wipes
  {
    const game = board(['Veteran Dungeoneer'], ['Ephemerate']);
    joinPod(game, null);
    const dungeoneer = game.findPermanent('Veteran Dungeoneer')!;
    const shield = game.podShield(dungeoneer);
    check(
      'removal aimed at a creature with an enter trigger: Ephemerate blinks it, the removal misses',
      [
        shield,
        game.battlefield.includes(dungeoneer),
        namesOnBattlefield(game, 'Veteran Dungeoneer'),
        game.dungeonPosition?.room,
      ],
      ['Ephemerate', false, 1, 'Cave Entrance'],
    );
  }
  {
    const game = board(['Veteran Dungeoneer'], ['Ephemerate'], []);
    joinPod(game, null);
    check(
      'removal: no mana open, no blink',
      game.podShield(game.findPermanent('Veteran Dungeoneer')!),
      null,
    );
  }
  {
    const game = board(['Midnight Pathlighter'], ['Ephemerate']);
    joinPod(game, null);
    check(
      'removal: a creature with no enter trigger is not worth Ephemerate',
      game.podShield(game.findPermanent('Midnight Pathlighter')!),
      null,
    );
  }
  {
    const game = board(
      ['Veteran Dungeoneer', 'Brago, King Eternal', 'Midnight Pathlighter'],
      ["Lae'zel's Acrobatics"],
    );
    joinPod(game, null);
    const dying = game.creatures();
    game.podAnswerWipe(dying);
    const exiledNow = dying.map((creature) =>
      game.battlefield.includes(creature),
    );
    game.returnBlinkedCardsAtOpponentEndStep();
    check(
      "wipe: Lae'zel's Acrobatics exiles the creatures, the end step of that turn brings them back",
      [
        exiledNow,
        game.creatures().filter((creature) => !creature.token).length,
        game.hand.length,
        game.graveyard.map((card) => card.name),
      ],
      [[false, false, false], 3, 0, ["Lae'zel's Acrobatics"]],
    );
  }
  {
    const game = board(['Midnight Pathlighter'], ["Lae'zel's Acrobatics"]);
    joinPod(game, null);
    game.podAnswerWipe(game.creatures());
    check(
      'wipe: nothing with an enter trigger to save, the Acrobatics stays in hand',
      [game.hand.length, game.creatures().length],
      [1, 1],
    );
  }

  return allPassed;
}
