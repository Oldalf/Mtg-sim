/**
 * Checks of the cards wired into the pod in step 11 (T4), on a hand-built table: the counter abilities of Diversion
 * Unit and Soratami Savant, Shire Shirriff's exile, Vindictive Lich's three modes, Insidious Fungus's destroy mode,
 * Bushwhack's fight, Crypt Incursion on an opponent's graveyard, Wash Out and Soratami Mirror-Mage's bounce.
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
