/**
 * Checks of a blink in answer to an opponent's removal or board wipe, on a hand-built table with DnD: Ephemerate
 * makes removal miss the creature it was aimed at, and Lae'zel's Acrobatics takes the creatures out of a wipe and
 * brings them back at the end of the wiper's turn. Run: npm run pod -- --test
 */
import * as C from '../cards/cards';
import { ANSWERS } from '../game/answers';
import { Game } from '../game/game';
import { Permanent } from '../game/game-types';
import { Deck } from '../run/runner';
import { podSpec, seatPlayers } from './pod';
import { hitWithRemoval, useRemovalAfterTurn } from './pod-interaction';
import { PodTable } from './pod-table';

const DND = 0;
const GALE = 1;

function putOnBattlefield(game: Game<unknown>, cardName: string) {
  const card = C.get(cardName);
  const permanent = new Permanent(card, card.land);
  permanent.sick = false;
  game.putOntoBattlefield(permanent);
  return permanent;
}

/** A table where DnD has eight open lands and Gale is the one to act. */
function newTable(allDecks: Record<string, Deck>): PodTable {
  const spec = podSpec(allDecks, ['dnd', 'gale', 'meren', 'aesi'], 17, {});
  const table = seatPlayers(allDecks, spec, 1, false);
  for (let i = 0; i < 4; i++) {
    putOnBattlefield(table.games[DND], 'Plains');
    putOnBattlefield(table.games[DND], 'Island');
  }
  table.games[DND].hand = [];
  table.games[GALE].hand = [];
  table.startTurnLog(GALE);
  table.refreshView(GALE);
  return table;
}

const creatureNames = (game: Game<unknown>) =>
  game.creatures().map((creature) => creature.card.name);

export function runBlinkAnswerTests(allDecks: Record<string, Deck>): boolean {
  const checks: [string, unknown, unknown][] = [];
  const check = (label: string, actual: unknown, expected: unknown) =>
    checks.push([label, actual, expected]);

  {
    const table = newTable(allDecks);
    const dnd = table.games[DND];
    dnd.hand = [C.get('Ephemerate')];
    const dungeoneer = putOnBattlefield(dnd, 'Veteran Dungeoneer');
    hitWithRemoval(
      table,
      GALE,
      'Swords to Plowshares',
      DND,
      dungeoneer,
      ANSWERS['Swords to Plowshares'],
    );
    check(
      'removal: Ephemerate blinks the creature, the removal misses',
      [
        creatureNames(dnd),
        dnd.graveyard.length,
        table.stats.shields[DND],
        table.stats.removed[DND],
      ],
      [['Veteran Dungeoneer'], 0, 1, 0],
    );
  }
  {
    const table = newTable(allDecks);
    const dnd = table.games[DND];
    const gale = table.games[GALE];
    dnd.hand = [C.get("Lae'zel's Acrobatics")];
    putOnBattlefield(dnd, 'Veteran Dungeoneer');
    putOnBattlefield(dnd, 'Brago, King Eternal');
    for (let i = 0; i < 4; i++) putOnBattlefield(gale, 'Plains');
    gale.hand = [C.get('Day of Judgment')];
    gale.config.wipe_at = 1;
    table.runOffTurn(() => useRemovalAfterTurn(table, GALE));
    const dungeoneerAfterWipe = creatureNames(dnd);
    dnd.returnBlinkedCardsAtOpponentEndStep();
    check(
      "wipe: Day of Judgment is cast, Lae'zel's Acrobatics exiles our creatures until the end of that turn",
      [
        gale.graveyard.map((card) => card.name),
        dungeoneerAfterWipe,
        creatureNames(dnd).sort(),
        dnd.graveyard.map((card) => card.name),
      ],
      [
        ['Day of Judgment'],
        [],
        ['Brago, King Eternal', 'Veteran Dungeoneer'],
        ["Lae'zel's Acrobatics"],
      ],
    );
  }
  {
    const table = newTable(allDecks);
    const dnd = table.games[DND];
    const gale = table.games[GALE];
    putOnBattlefield(dnd, 'Veteran Dungeoneer');
    for (let i = 0; i < 4; i++) putOnBattlefield(gale, 'Plains');
    gale.hand = [C.get('Day of Judgment')];
    gale.config.wipe_at = 1;
    table.runOffTurn(() => useRemovalAfterTurn(table, GALE));
    check(
      'wipe: without a blink spell in hand the creature dies',
      [creatureNames(dnd), dnd.graveyard.map((card) => card.name)],
      [[], ['Veteran Dungeoneer']],
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
    `${isGood ? 'OK ' : 'BAD'} blink in answer to removal and wipes: ${wrong.length} wrong of ${checks.length}`,
  );
  for (const difference of wrong) console.log(`      ${difference}`);
  return isGood;
}
