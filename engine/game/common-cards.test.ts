/**
 * Checks of single card rules in the engine that the DnD deck brought: "enters, draw a card" (Wall of Omens), Peregrine
 * Drake's untap doubled by Panharmonicon, Theros gods that aren't creatures below their devotion (Thassa, Ephara),
 * the rocks (Azorius Signet, Midnight Clock, Sarevok's Tome with the initiative), a Plains search, and Day of
 * Judgment as a pod answer.
 * Run: npm run pod -- --test
 */
import * as C from '../cards/cards';
import { Rng } from '../util/rng';
import { Deck } from '../run/runner';
import { ANSWERS } from './answers';
import { Permanent } from './game-types';
import { fetchLand } from './land-search';

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
