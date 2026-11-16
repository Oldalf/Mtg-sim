/**
 * Checks of the protection a deck casts before going for the win (Silence, Orim's Chant, Autumn's Veil), on a hand-built
 * table: Codie's finisher is counterspelled unless protection stops the answers. Run: npm run pod -- --test
 */
import * as C from '../cards/cards';
import { Game } from '../game/game';
import { Permanent } from '../game/game-types';
import { Deck } from '../run/runner';
import { podSpec, seatPlayers } from './pod';
import { PodTable } from './pod-table';
import { answerWin } from './pod-interaction';

const CODIE_SEAT = 0;
const GALE_SEAT = 2;

function putOnBattlefield(game: Game<unknown>, cardName: string): Permanent {
  const card = C.get(cardName);
  const permanent = new Permanent(card, card.land);
  permanent.sick = false;
  game.putOntoBattlefield(permanent);
  return permanent;
}

/** Codie has just found a kill with Exsanguinate and holds `protection`; Gale holds a counterspell with mana for it. */
function tableWithWinAttempt(
  allDecks: Record<string, Deck>,
  protection: string[],
  galeHand: string[],
): PodTable {
  const spec = podSpec(allDecks, ['codie', 'meren', 'gale', 'mike'], 17, {});
  const table = seatPlayers(allDecks, spec, 1, false);
  table.startTurnLog(CODIE_SEAT);
  table.refreshView(CODIE_SEAT);
  const codie = table.games[CODIE_SEAT];
  codie.battlefield = [];
  for (const landName of ['Swamp', 'Swamp', 'Swamp', 'Plains', 'Forest'])
    putOnBattlefield(codie, landName);
  codie.hand = ['Exsanguinate', ...protection].map((name) => C.get(name));
  codie.lastKillLine = ['cast Exsanguinate X=1 (3 mana)'];
  const gale = table.games[GALE_SEAT];
  gale.battlefield = [];
  for (let island = 0; island < 3; island++) putOnBattlefield(gale, 'Island');
  gale.hand = galeHand.map((name) => C.get(name));
  return table;
}

export function runProtectionTests(allDecks: Record<string, Deck>): boolean {
  const checks: [string, unknown, unknown][] = [];
  const check = (label: string, actual: unknown, expected: unknown) =>
    checks.push([label, actual, expected]);
  const wasStopped = (protection: string[], galeHand: string[]) => {
    const table = tableWithWinAttempt(allDecks, protection, galeHand);
    return answerWin(table, table.games[CODIE_SEAT]);
  };

  check(
    "Codie's Exsanguinate is countered by Gale's Counterspell",
    wasStopped([], ['Counterspell']),
    true,
  );
  check(
    'Silence: no one can cast spells, the win stands',
    wasStopped(['Silence'], ['Counterspell']),
    false,
  );
  check(
    "Orim's Chant stops the one opponent with the counterspell",
    wasStopped(["Orim's Chant"], ['Counterspell']),
    false,
  );
  check(
    "Autumn's Veil: a blue counterspell can't stop it",
    wasStopped(["Autumn's Veil"], ['Counterspell']),
    false,
  );
  {
    const table = tableWithWinAttempt(allDecks, ['Silence'], []);
    const attempt = table.games[CODIE_SEAT].winAttempt();
    check(
      "Codie's win attempt names the finisher and the protection it can still pay for",
      [attempt?.spells, attempt?.protect],
      [['Exsanguinate'], 'Silence'],
    );
  }
  {
    const table = tableWithWinAttempt(allDecks, ['Silence'], []);
    for (const permanent of table.games[CODIE_SEAT].battlefield)
      permanent.tapped = true;
    check(
      "no mana for Silence: Codie's win attempt names no protection",
      table.games[CODIE_SEAT].winAttempt()?.protect,
      undefined,
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
    `${isGood ? 'OK ' : 'BAD'} protection before a win: ${wrong.length} wrong of ${checks.length}`,
  );
  for (const difference of wrong) console.log(`      ${difference}`);
  return isGood;
}
