/**
 * Checks of blink (blink.ts): the permanent comes back as a new object (counters, marks and the tap gone, summoning
 * sick), its enter trigger fires again and its leave hook fires, a token blinked away is gone, an "until the next end
 * step" blink comes back at our end step, rebound casts Ephemerate again at the next upkeep, and the log shows both
 * moves. Run: npm run pod -- --test
 */
import * as C from '../cards/cards';
import { Rng } from '../util/rng';
import { Deck } from '../run/runner';
import { blink, resolveBlinkSpell } from './blink';
import { Permanent } from './game-types';
import { enterTriggerCount } from './trigger-doublers';

/** The blink spells as in Scryfall's data (DnD's list isn't in data/cards.json yet). */
const EPHEMERATE = new C.CardDef('Ephemerate', {
  mana_cost: '{W}',
  type_line: 'Instant',
  oracle:
    "Exile target creature you control, then return it to the battlefield under its owner's control.\nRebound",
  keywords: ['Rebound'],
});
const MORNINGTIDES_LIGHT = new C.CardDef("Morningtide's Light", {
  mana_cost: '{3}{W}',
  type_line: 'Sorcery',
  oracle:
    "Exile any number of target creatures. At the beginning of the next end step, return those cards to the battlefield tapped under their owners' control.",
});

function newGame(allDecks: Record<string, Deck>, isVerbose = false) {
  const deck = allDecks.goldfish;
  return new deck.Game(
    [],
    new Array(60).fill('Island'),
    new Rng(1),
    { ...deck.config },
    isVerbose,
  );
}

function putOnBattlefield(
  game: ReturnType<typeof newGame>,
  name: string,
): Permanent {
  const card = C.get(name);
  const permanent = new Permanent(card, card.land);
  permanent.sick = false;
  game.putOntoBattlefield(permanent);
  return permanent;
}

export function runBlinkTests(allDecks: Record<string, Deck>): boolean {
  const checks: [string, unknown, unknown][] = [];
  const check = (label: string, actual: unknown, expected: unknown) =>
    checks.push([label, actual, expected]);

  {
    const game = newGame(allDecks);
    const witness = putOnBattlefield(game, 'Eternal Witness');
    witness.counters = 2;
    witness.marks = 1;
    witness.tapped = true;
    game.graveyard = [C.get('Counterspell')];
    const left: string[] = [];
    game.onLeave = (permanent) => left.push(permanent.card.name);
    const returned = blink(game, witness)!;
    check('a new object comes back', returned !== witness, true);
    check(
      'counters, marks and the tap are gone; it is summoning sick',
      [returned.counters, returned.marks, returned.tapped, returned.sick],
      [0, 0, false, true],
    );
    check(
      'the old object is off the battlefield',
      game.battlefield.includes(witness),
      false,
    );
    check('the card is not left in exile', game.exile.length, 0);
    check(
      "Eternal Witness's enter trigger fires again",
      game.hand.map((card) => card.name),
      ['Counterspell'],
    );
    check('its leave hook fires', left, ['Eternal Witness']);
  }
  {
    const game = newGame(allDecks);
    const token = game.createTokens(C.makeToken('Spirit', 1, 1, 'white'))[0];
    check('a blinked token comes back as nothing', blink(game, token), null);
    check(
      'the token is gone (not in exile, not on the battlefield)',
      [game.battlefield.includes(token), game.exile.length],
      [false, 0],
    );
  }
  {
    const game = newGame(allDecks);
    putOnBattlefield(game, 'Eternal Witness');
    resolveBlinkSpell(game, MORNINGTIDES_LIGHT);
    check(
      "Morningtide's Light: in exile until the end step",
      game.exile.map((card) => card.name),
      ['Eternal Witness'],
    );
    game.endTurn();
    const back = game.findPermanent('Eternal Witness');
    check(
      '... it comes back tapped at our end step',
      [back !== null, back?.tapped],
      [true, true],
    );
  }
  {
    const game = newGame(allDecks);
    putOnBattlefield(game, 'Plains');
    putOnBattlefield(game, 'Eternal Witness');
    game.graveyard = [C.get('Counterspell'), C.get('Brainstorm')];
    game.hand = [EPHEMERATE];
    game.castInstantOrSorcery(EPHEMERATE);
    check(
      'Ephemerate: rebound exiles it',
      game.exile.map((card) => card.name),
      ['Ephemerate'],
    );
    check('... and Eternal Witness came back once', game.hand.length, 1);
    game.castReboundCards();
    check(
      '... at the next upkeep it is cast again for free, then goes to the graveyard',
      [
        game.exile.length,
        game.graveyard.some((card) => card.name === 'Ephemerate'),
      ],
      [0, true],
    );
    check('... and Eternal Witness came back again', game.hand.length, 2);
  }
  {
    const game = newGame(allDecks, true);
    const witness = putOnBattlefield(game, 'Eternal Witness');
    game.say('before the blink');
    game.logCardMovesSoFar();
    const eventsBefore = game.log.length;
    blink(game, witness);
    game.say('after the blink');
    game.logCardMovesSoFar();
    const actions = game.log
      .slice(eventsBefore)
      .flatMap((event) => event.moves)
      .filter((move) => move.card === 'Eternal Witness')
      .map((move) => move.action);
    check('the log shows both moves', actions, [
      'moved battlefield => exile',
      'moved exile => battlefield',
    ]);
  }

  {
    const game = newGame(allDecks);
    const witness = putOnBattlefield(game, 'Eternal Witness');
    putOnBattlefield(game, 'Starfield Vocalist');
    check(
      'Starfield Vocalist: an enter trigger triggers twice',
      enterTriggerCount(game, witness),
      2,
    );
  }

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
    `${isGood ? 'OK ' : 'BAD'} blink: ${wrong.length} wrong of ${checks.length}`,
  );
  for (const difference of wrong) console.log(`      ${difference}`);
  return isGood;
}
