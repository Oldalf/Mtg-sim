/**
 * Checks of the cards wired into the pod in step 11 (T4), on a hand-built table: the counter abilities of Diversion
 * Unit and Soratami Savant, Shire Shirriff's exile, Vindictive Lich's three modes, Insidious Fungus's destroy mode,
 * Bushwhack's fight, Crypt Incursion on an opponent's graveyard, Wash Out and Soratami Mirror-Mage's bounce; Massacre
 * Wurm and D'Ghor Bloodletter (T6: -X/-X until end of turn, the Wurm's drain, the Bloodletter's modes and Meren loop).
 * Run: npm run pod -- --test
 */
import * as C from '../cards/cards';
import { Game } from '../game/game';
import { Permanent } from '../game/game-types';
import { Deck } from '../run/runner';
import { podSpec, seatPlayers } from './pod';
import type { MerenGame } from '../../decks/meren/game';
import type { MikeGame } from '../../decks/mike/game';
import { activateInsidiousFungus } from '../../decks/meren/actions';
import type { AesiGame } from '../../decks/aesi/game';
import { bounceWithMirrorMage } from '../../decks/aesi/candidates';

const MIKE = 0;
const MEREN = 1;
const SAM_AND_FRODO = 2;
const AESI = 3;

/** Puts a card onto a player's battlefield, untapped and ready. */
function putOnBattlefield(game: Game<unknown>, cardName: string): Permanent {
  const card = C.get(cardName);
  const permanent = new Permanent(card, card.land);
  permanent.sick = false;
  game.putOntoBattlefield(permanent);
  return permanent;
}

const names = (permanents: Permanent[]) =>
  permanents.map((permanent) => permanent.card.name).sort();
const cardNames = (cards: C.CardDef[]) => cards.map((card) => card.name).sort();

/** A fresh table: every player's battlefield, hand and graveyard emptied, all at 40 life. */
function newTable(allDecks: Record<string, Deck>) {
  const spec = podSpec(allDecks, ['mike', 'meren', 'samfrodo', 'aesi'], 17, {});
  const table = seatPlayers(allDecks, spec, 1, false); // the log is off: these tests empty zones by hand
  for (const game of table.games) {
    game.battlefield = [];
    game.hand = [];
    game.graveyard = [];
  }
  for (let player = 0; player < table.games.length; player++)
    table.refreshView(player);
  return table;
}

export function runPodCardTests(allDecks: Record<string, Deck>): boolean {
  const checks: [string, unknown, unknown][] = [];
  const check = (label: string, actual: unknown, expected: unknown) =>
    checks.push([label, actual, expected]);

  {
    // Diversion Unit ({U}, sacrifice it) counters an instant or sorcery, not a creature spell
    const table = newTable(allDecks);
    table.settings.counterAnyWeight = 0; // every spell is worth countering here
    table.settings.counterAtWeight = 0;
    const mike = table.games[MIKE];
    putOnBattlefield(mike, 'Diversion Unit');
    putOnBattlefield(mike, 'Island');
    table.startTurnLog(MEREN);
    table.refreshView(MEREN);
    const meren = table.games[MEREN];
    const creatureCountered = meren.arena!.counter(meren, C.get('Grave Titan'));
    const sorceryCountered = meren.arena!.counter(meren, C.get('Damnation'));
    check(
      'Diversion Unit: a creature spell is not countered, a sorcery is; the Unit is sacrificed',
      [
        creatureCountered,
        sorceryCountered,
        names(mike.battlefield),
        cardNames(mike.graveyard),
      ],
      [false, true, ['Island'], ['Diversion Unit']],
    );
  }
  {
    // Soratami Savant ({3}, a land back to hand) counters any spell
    const table = newTable(allDecks);
    table.settings.counterAnyWeight = 0;
    table.settings.counterAtWeight = 0;
    const aesi = table.games[AESI];
    putOnBattlefield(aesi, 'Soratami Savant');
    for (let i = 0; i < 3; i++) putOnBattlefield(aesi, 'Island');
    table.startTurnLog(MEREN);
    table.refreshView(MEREN);
    const meren = table.games[MEREN];
    const countered = meren.arena!.counter(meren, C.get('Grave Titan'));
    check(
      'Soratami Savant: counters a creature spell, a land returns to hand',
      [countered, aesi.landsOnBattlefield().length, cardNames(aesi.hand)],
      [true, 2, ['Island']],
    );
  }
  {
    // Shire Shirriff: a token is sacrificed, the best creature of the biggest threat is exiled
    const table = newTable(allDecks);
    const samAndFrodo = table.games[SAM_AND_FRODO];
    const meren = table.games[MEREN];
    putOnBattlefield(meren, 'Grave Titan');
    table.threats[MEREN] = 100;
    samAndFrodo.createTokens(C.makeToken('Halfling', 1, 1, 'white'));
    table.startTurnLog(SAM_AND_FRODO);
    table.refreshView(SAM_AND_FRODO);
    samAndFrodo.enter(C.get('Shire Shirriff'));
    check(
      "Shire Shirriff: the token is sacrificed and Meren's Grave Titan is exiled",
      [
        names(samAndFrodo.battlefield),
        names(meren.battlefield),
        cardNames(meren.exile),
      ],
      [['Shire Shirriff'], [], ['Grave Titan']],
    );
  }
  {
    // Vindictive Lich: 5 life to the opponent closest to dead, a sacrifice for the one with creatures, a discard of
    // two for the one with cards in hand: three different opponents
    const table = newTable(allDecks);
    const meren = table.games[MEREN];
    const mike = table.games[MIKE];
    const samAndFrodo = table.games[SAM_AND_FRODO];
    const aesi = table.games[AESI];
    mike.myLife = 12;
    putOnBattlefield(samAndFrodo, 'Shire Shirriff');
    aesi.hand = [C.get('Island'), C.get('Forest'), C.get('Opt')];
    samAndFrodo.hand = [C.get('Plains')];
    table.startTurnLog(MEREN);
    table.refreshView(MEREN);
    const lich = putOnBattlefield(meren, 'Vindictive Lich');
    meren.sacrifice(lich);
    table.refreshView(MEREN);
    check(
      'Vindictive Lich: Mike loses 5, Sam & Frodo sacrifices its creature, Aesi discards two',
      [
        table.games[MIKE].myLife,
        names(samAndFrodo.battlefield),
        aesi.hand.length,
        samAndFrodo.hand.length,
      ],
      [7, [], 1, 1],
    );
  }
  {
    // Insidious Fungus: destroys an opponent's artifact worth it
    const table = newTable(allDecks);
    const meren = table.games[MEREN];
    const mike = table.games[MIKE];
    putOnBattlefield(mike, 'Sol Ring');
    table.threats[MIKE] = 100;
    const fungus = putOnBattlefield(meren, 'Insidious Fungus');
    putOnBattlefield(meren, 'Swamp');
    putOnBattlefield(meren, 'Swamp');
    table.startTurnLog(MEREN);
    table.refreshView(MEREN);
    const handBefore = meren.hand.length;
    activateInsidiousFungus(meren as MerenGame, fungus);
    check(
      "Insidious Fungus: Mike's Sol Ring is destroyed, no card drawn",
      [
        names(mike.battlefield),
        cardNames(mike.graveyard),
        meren.hand.length - handBefore,
      ],
      [[], ['Sol Ring'], 0],
    );
  }
  {
    // Bushwhack's fight: our 6/6 kills their 2/1 and survives
    const table = newTable(allDecks);
    const aesi = table.games[AESI];
    const mike = table.games[MIKE];
    putOnBattlefield(mike, 'Diversion Unit'); // a 2/1
    const fighter = putOnBattlefield(aesi, 'Grave Titan'); // a 6/6
    table.startTurnLog(AESI);
    table.refreshView(AESI);
    const fought = aesi.arena!.fightBestCreature(aesi, fighter, 'Bushwhack');
    check(
      "Bushwhack: Aesi's creature fights and kills Mike's Diversion Unit, and lives",
      [fought, names(mike.battlefield), aesi.battlefield.includes(fighter)],
      ['Diversion Unit', [], true],
    );
  }
  {
    // Crypt Incursion: the opponent's graveyard has more creature cards than ours
    const table = newTable(allDecks);
    const samAndFrodo = table.games[SAM_AND_FRODO];
    const meren = table.games[MEREN];
    meren.graveyard = [
      'Grave Titan',
      'Eternal Witness',
      'Reassembling Skeleton',
    ].map((name) => C.get(name));
    samAndFrodo.graveyard = [C.get('Shire Shirriff')];
    table.startTurnLog(SAM_AND_FRODO);
    table.refreshView(SAM_AND_FRODO);
    const lifeBefore = samAndFrodo.myLife;
    samAndFrodo.resolve(C.get('Crypt Incursion'));
    check(
      "Crypt Incursion: Meren's three creature cards are exiled, Sam & Frodo gains 9 and keeps its own",
      [
        meren.graveyard.length,
        samAndFrodo.myLife - lifeBefore,
        cardNames(samAndFrodo.graveyard),
      ],
      [0, 9, ['Shire Shirriff']],
    );
  }
  {
    // Wash Out: the colour that costs the opponents most (black: Meren's), Mike's own blue stays
    const table = newTable(allDecks);
    const mike = table.games[MIKE];
    const meren = table.games[MEREN];
    for (const name of [
      'Grave Titan',
      'Eternal Witness',
      'Reassembling Skeleton',
      'Vindictive Lich',
    ])
      putOnBattlefield(meren, name);
    putOnBattlefield(mike, 'Diversion Unit');
    table.startTurnLog(MIKE);
    table.refreshView(MIKE);
    const choice = (mike as MikeGame).washOutColour();
    mike.resolve(C.get('Wash Out'), false, choice.colour);
    check(
      "Wash Out: black is chosen; Meren's black creatures return to hand, Eternal Witness (green) and Mike's Unit stay",
      [choice.colour, names(meren.battlefield), names(mike.battlefield)],
      ['B', ['Eternal Witness'], ['Diversion Unit']],
    );
  }

  {
    // Soratami Mirror-Mage: {3} and three lands back to hand, the biggest threat's best creature returns to hand
    const table = newTable(allDecks);
    const aesi = table.games[AESI];
    const meren = table.games[MEREN];
    putOnBattlefield(meren, 'Grave Titan');
    table.threats[MEREN] = 100;
    putOnBattlefield(aesi, 'Soratami Mirror-Mage');
    for (let i = 0; i < 4; i++) putOnBattlefield(aesi, 'Island');
    table.startTurnLog(AESI);
    table.refreshView(AESI);
    const isActivated = bounceWithMirrorMage(aesi as AesiGame);
    check(
      "Soratami Mirror-Mage: Meren's Grave Titan back to hand, three of Aesi's four Islands too",
      [
        isActivated,
        cardNames(meren.hand),
        aesi.landsOnBattlefield().length,
        aesi.hand.length,
      ],
      [true, ['Grave Titan'], 1, 3],
    );
  }
  {
    // Massacre Wurm: the opponents' creatures get -2/-2 until end of turn, each one that dies costs its owner 2 life
    const table = newTable(allDecks);
    const meren = table.games[MEREN];
    const mike = table.games[MIKE];
    putOnBattlefield(mike, 'Llanowar Elves');
    const titan = putOnBattlefield(mike, 'Grave Titan');
    const ownElves = putOnBattlefield(meren, 'Llanowar Elves');
    table.startTurnLog(MEREN);
    table.refreshView(MEREN);
    meren.enter(C.get('Massacre Wurm'));
    table.applyChangesFrom(MEREN);
    const toughnessThisTurn = mike.toughness(titan);
    table.prepareTurn(table.opponentsOf[MEREN][0]);
    check(
      'Massacre Wurm: the Elves die and Mike loses 2, the Titan is a 4/4 until the next turn, our Elves are untouched',
      [
        names(mike.battlefield),
        mike.myLife,
        toughnessThisTurn,
        mike.toughness(titan),
        meren.battlefield.includes(ownElves),
      ],
      [['Grave Titan'], 38, 4, 6, true],
    );
  }
  {
    // D'Ghor Bloodletter, two opposing 1/1s: all other creatures get -1/-1 (our Elves die too: experience)
    const table = newTable(allDecks);
    const meren = table.games[MEREN] as MerenGame;
    putOnBattlefield(table.games[MIKE], 'Llanowar Elves');
    putOnBattlefield(table.games[SAM_AND_FRODO], 'Llanowar Elves');
    putOnBattlefield(meren, 'Meren of Clan Nel Toth');
    putOnBattlefield(meren, 'Llanowar Elves');
    meren.experienceCounters = 0;
    table.startTurnLog(MEREN);
    table.refreshView(MEREN);
    meren.enter(C.get("D'Ghor Bloodletter"));
    check(
      "D'Ghor Bloodletter: the -1/-1 kills both opposing Elves and ours, Meren gets an experience counter",
      [
        names(table.games[MIKE].battlefield),
        names(table.games[SAM_AND_FRODO].battlefield),
        names(meren.battlefield),
        meren.experienceCounters,
      ],
      [[], [], ["D'Ghor Bloodletter", 'Meren of Clan Nel Toth'], 1],
    );
  }
  {
    // D'Ghor Bloodletter, one big creature: the edict (each player sacrifices; it is our only creature)
    const table = newTable(allDecks);
    const meren = table.games[MEREN];
    putOnBattlefield(table.games[MIKE], 'Grave Titan');
    table.startTurnLog(MEREN);
    table.refreshView(MEREN);
    meren.enter(C.get("D'Ghor Bloodletter"));
    check(
      "D'Ghor Bloodletter: the edict takes Mike's Titan, the Bloodletter sacrifices itself",
      [names(table.games[MIKE].battlefield), cardNames(meren.graveyard)],
      [[], ["D'Ghor Bloodletter"]],
    );
  }
  {
    // the Meren loop: two 2/2s, cast it for -1/-1, sacrifice it at the end step, Meren returns it for a second -1/-1
    const table = newTable(allDecks);
    const meren = table.games[MEREN] as MerenGame;
    const mike = table.games[MIKE];
    for (let i = 0; i < 2; i++) {
      const zombie = new Permanent(C.makeToken('Zombie', 2, 2, 'black'));
      zombie.token = true;
      mike.putOntoBattlefield(zombie);
    }
    putOnBattlefield(meren, 'Meren of Clan Nel Toth');
    putOnBattlefield(meren, 'Woe Strider');
    meren.experienceCounters = 2;
    table.startTurnLog(MEREN);
    table.refreshView(MEREN);
    meren.enter(C.get("D'Ghor Bloodletter"));
    const zombiesAfterCast = mike.creatures().length;
    meren.feedMerenAtEndStep();
    check(
      "D'Ghor Bloodletter with Meren: the first -1/-1 kills nothing, the second at the end step kills both 2/2s (and Woe Strider: experience 2 + Bloodletter + Strider)",
      [zombiesAfterCast, mike.creatures().length, meren.experienceCounters],
      [2, 0, 4],
    );
  }
  {
    // Junji dies with nothing of ours worth returning: the opponents hold cards, so each discards two and loses 2
    const table = newTable(allDecks);
    const meren = table.games[MEREN];
    const mike = table.games[MIKE];
    mike.hand = [C.get('Island'), C.get('Opt'), C.get('Forest')];
    table.games[SAM_AND_FRODO].hand = [C.get('Plains'), C.get('Forest')];
    table.games[AESI].hand = [C.get('Island'), C.get('Forest')];
    table.startTurnLog(MEREN);
    table.refreshView(MEREN);
    meren.sacrifice(putOnBattlefield(meren, 'Junji, the Midnight Sky'));
    table.applyChangesFrom(MEREN);
    check(
      'Junji: each opponent discards two cards and loses 2',
      [mike.hand.length, table.games[AESI].hand.length, mike.myLife],
      [1, 0, 38],
    );
  }
  {
    // ... the opponents' hands are empty and Aesi has a creature card in its graveyard: it comes to us (the real card, with its Zombies)
    const table = newTable(allDecks);
    const meren = table.games[MEREN];
    table.games[AESI].graveyard = [C.get('Grave Titan')];
    table.startTurnLog(MEREN);
    table.refreshView(MEREN);
    meren.sacrifice(putOnBattlefield(meren, 'Junji, the Midnight Sky'));
    check(
      "Junji: Grave Titan from Aesi's graveyard comes in as the real card (with its two Zombies), we lose 2, Aesi's graveyard is empty",
      [
        names(meren.battlefield),
        meren.myLife,
        table.games[AESI].graveyard.length,
      ],
      [['Grave Titan', 'Zombie', 'Zombie'], 38, 0],
    );
  }

  const wrong = checks.filter(
    ([, actual, expected]) =>
      JSON.stringify(actual) !== JSON.stringify(expected),
  );
  for (const [label, actual, expected] of checks) {
    const isGood = JSON.stringify(actual) === JSON.stringify(expected);
    if (!isGood)
      console.log(
        `BAD ${label}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`,
      );
  }
  const isGood = wrong.length === 0;
  console.log(
    `${isGood ? 'OK ' : 'BAD'} pod cards (step 11, T4): ${wrong.length} wrong of ${checks.length}`,
  );
  return isGood;
}
