/**
 * Checks of single card rules in the engine that the DnD deck brought: "enters, draw a card" (Wall of Omens), Peregrine
 * Drake's untap doubled by Panharmonicon, Theros gods that aren't creatures below their devotion (Thassa, Ephara),
 * the rocks (Azorius Signet, Midnight Clock, Sarevok's Tome with the initiative), a Plains search, and Day of
 * Judgment as a pod answer, Cathars' Crusade and Radiant Solar, Thunderclap Drake's copies, Mizzix's Mastery. Also a search's copy of our next turn (copyAtNextTurn).
 * Run: npm run pod -- --test
 */
import * as C from '../cards/cards';
import { Rng } from '../util/rng';
import { Deck } from '../run/runner';
import { ANSWERS } from './answers';
import { triggersOfCreatureEntering } from './creature-enter-triggers';
import { Permanent } from './game-types';
import { fetchLand } from './land-search';
import {
  MIZZIXS_MASTERY,
  MIZZIXS_MASTERY_OVERLOAD_COST,
  OVERLOAD,
  THUNDERCLAP_DRAKE,
  activateThunderclapDrake,
} from './spell-copies';

function newGame(allDecks: Record<string, Deck>, library: string[] = []) {
  const deck = allDecks.goldfish;
  return new deck.Game(
    [],
    [...library, ...new Array(40).fill('Island')],
    new Rng(1),
    { ...deck.config },
    false,
  );
}

function putOnBattlefield(
  game: ReturnType<typeof newGame>,
  cardName: string,
  tapped = false,
): Permanent {
  const card = C.get(cardName);
  const permanent = new Permanent(card, card.land, tapped);
  permanent.sick = false;
  game.putOntoBattlefield(permanent);
  return permanent;
}

const untappedLands = (game: ReturnType<typeof newGame>): number =>
  game.landsOnBattlefield().filter((land) => !land.tapped).length;

export function runCommonCardTests(allDecks: Record<string, Deck>): boolean {
  const checks: [string, unknown, unknown][] = [];
  const check = (label: string, actual: unknown, expected: unknown) =>
    checks.push([label, actual, expected]);

  {
    const game = newGame(allDecks);
    game.enter(C.get('Wall of Omens'));
    check('Wall of Omens draws a card as it enters', game.hand.length, 1);
  }
  for (const cardName of ['Thought Vessel', 'Decanter of Endless Water']) {
    const game = newGame(allDecks, new Array(9).fill('Island'));
    putOnBattlefield(game, cardName);
    game.draw(9);
    game.endTurn();
    check(`${cardName}: no discard to seven`, game.hand.length, 9);
  }
  {
    // a search's copy of our next turn: everything untapped, the pool empty, a new land drop; the game unchanged
    const game = newGame(allDecks);
    game.turn = 3;
    putOnBattlefield(game, 'Island', true);
    game.pool.U = 2;
    game.landPlayed = true;
    game.highTidesThisTurn = 1;
    const nextTurn = game.copyAtNextTurn();
    check(
      'copyAtNextTurn untaps, empties the pool, gives a new land drop; each opponent has drawn',
      [
        nextTurn.turn - game.turn,
        game.opponentLibrarySizes[0] - nextTurn.opponentLibrarySizes[0],
        untappedLands(nextTurn),
        nextTurn.pool.U,
        nextTurn.landPlayed,
        nextTurn.highTidesThisTurn,
        nextTurn.verbose,
      ],
      [1, 1, 1, 0, false, 0, false],
    );
    check(
      'copyAtNextTurn leaves the game itself as it was',
      [untappedLands(game), game.pool.U, game.landPlayed],
      [0, 2, true],
    );
  }
  {
    const alone = newGame(allDecks);
    const withPanharmonicon = newGame(allDecks);
    putOnBattlefield(withPanharmonicon, 'Panharmonicon');
    for (const game of [alone, withPanharmonicon]) {
      for (let i = 0; i < 8; i++) putOnBattlefield(game, 'Island', true);
      game.enter(C.get('Peregrine Drake'));
    }
    check(
      'Peregrine Drake untaps five lands, ten with Panharmonicon',
      [untappedLands(alone), untappedLands(withPanharmonicon)],
      [5, 8],
    );
  }
  {
    const game = newGame(allDecks);
    const thassa = putOnBattlefield(game, 'Thassa, Deep-Dwelling');
    const isThassaACreature = () => game.creatures().includes(thassa);
    const lowDevotion = isThassaACreature();
    putOnBattlefield(game, 'Pensive Professor');
    putOnBattlefield(game, 'Pensive Professor');
    check(
      'Thassa is a creature only with devotion to blue of five (1 + 2 + 2)',
      [lowDevotion, isThassaACreature()],
      [false, true],
    );
    check(
      'Ephara needs devotion to white and blue of seven (its text)',
      C.devotionToBeCreature(C.get('Ephara, God of the Polis')),
      { colours: ['W', 'U'], atLeast: 7 },
    );
  }
  {
    const game = newGame(allDecks);
    const signet = putOnBattlefield(game, 'Azorius Signet');
    const clock = putOnBattlefield(game, 'Midnight Clock');
    const tome = putOnBattlefield(game, "Sarevok's Tome");
    const withoutInitiative = game.manaSourceKind(tome);
    game.hasInitiative = true;
    check(
      "the rocks: Azorius Signet, Midnight Clock, Sarevok's Tome (more with the initiative)",
      [
        game.manaSourceKind(signet),
        game.manaSourceKind(clock),
        withoutInitiative,
        game.manaSourceKind(tome),
      ],
      ['W/U', 'U', 'C', 'C2'],
    );
  }
  {
    const game = newGame(allDecks, ['Plains']);
    check(
      'a Plains search finds the Plains among the Islands',
      fetchLand(game, 'plains', false, true)?.name,
      'Plains',
    );
  }
  {
    const game = newGame(allDecks);
    putOnBattlefield(game, "Cathars' Crusade");
    const solar = putOnBattlefield(game, 'Radiant Solar');
    const bear = putOnBattlefield(game, 'Wall of Omens');
    triggersOfCreatureEntering(game, bear);
    const roomAfterCreature = game.dungeonPosition?.room;
    const token = game.createTokens(C.makeToken('Goblin', 1, 1, 'red'))[0];
    triggersOfCreatureEntering(game, token);
    check(
      "Cathars' Crusade: a counter on each creature as one enters; Radiant Solar ventures for a nontoken one only",
      [
        solar.counters,
        bear.counters,
        token.counters,
        roomAfterCreature,
        game.dungeonPosition?.room,
      ],
      [2, 2, 1, 'Cave Entrance', 'Cave Entrance'],
    );
  }
  {
    // Thunderclap Drake: with the commander cast twice, the next instant or sorcery is copied twice (only that one)
    const game = newGame(allDecks);
    game.putCards([C.get('Opt'), C.get('Opt')], 'hand');
    game.commandCasts = ['Gale', 'Gale'];
    for (let i = 0; i < 5; i++) putOnBattlefield(game, 'Island');
    const drake = putOnBattlefield(game, THUNDERCLAP_DRAKE);
    const isActivated = activateThunderclapDrake(game, drake);
    const [firstOpt, secondOpt] = game.hand;
    game.castInstantOrSorcery(firstOpt);
    const handAfterFirstOpt = game.hand.length;
    game.castInstantOrSorcery(secondOpt);
    check(
      'Thunderclap Drake: sacrificed for {2}{U}; the next Opt draws three cards (two copies), the one after draws one',
      [
        isActivated,
        game.isOnBattlefield(THUNDERCLAP_DRAKE),
        game.graveyard.some((card) => card.name === THUNDERCLAP_DRAKE),
        handAfterFirstOpt,
        game.hand.length,
      ],
      [true, false, true, 4, 4],
    );
  }
  {
    // Mizzix's Mastery: a free copy of the named card (exiled), or of every instant and sorcery with overload
    const castMastery = (
      graveyard: string[],
      mountains: number,
      mode: string,
      overload: boolean,
    ) => {
      const game = newGame(allDecks);
      game.putCards(
        graveyard.map((name) => C.get(name)),
        'graveyard',
      );
      for (let i = 0; i < mountains; i++) putOnBattlefield(game, 'Mountain');
      const mastery = C.get(MIZZIXS_MASTERY);
      game.putCard(mastery, 'hand');
      const isCast = game.castInstantOrSorcery(
        mastery,
        false,
        overload ? MIZZIXS_MASTERY_OVERLOAD_COST : null,
        mode,
      );
      return [
        isCast,
        game.pool.B,
        game.graveyard.map((card) => card.name),
        game.exile.map((card) => card.name).sort(),
      ];
    };
    check(
      "Mizzix's Mastery on Dark Ritual: BBB; the Ritual and the Mastery are exiled, Opt stays",
      castMastery(['Dark Ritual', 'Opt'], 4, 'Dark Ritual', false),
      [true, 3, ['Opt'], ['Dark Ritual', MIZZIXS_MASTERY]],
    );
    check(
      "Mizzix's Mastery overloaded on two Dark Rituals: six B",
      castMastery(['Dark Ritual', 'Dark Ritual'], 8, OVERLOAD, true),
      [true, 6, [], ['Dark Ritual', 'Dark Ritual', MIZZIXS_MASTERY]],
    );
  }
  check(
    'Day of Judgment is a wipe of all creatures in a pod',
    ANSWERS['Day of Judgment'],
    { kind: 'wipe', instant: false, wipe: 'all' },
  );

  const wrong = checks
    .map(([label, actual, expected]) => [
      label,
      JSON.stringify(actual),
      JSON.stringify(expected),
    ])
    .filter(([, actual, expected]) => actual !== expected)
    .map(
      ([label, actual, expected]) =>
        `${label}: ${actual}, expected ${expected}`,
    );
  const isGood = wrong.length === 0;
  console.log(
    `${isGood ? 'OK ' : 'BAD'} common card rules: ${wrong.length} wrong of ${checks.length}`,
  );
  for (const difference of wrong) console.log(`      ${difference}`);
  return isGood;
}
