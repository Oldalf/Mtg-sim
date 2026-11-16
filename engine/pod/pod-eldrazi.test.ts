/**
 * Checks of Helga's annihilator and the removal her Eldrazi and Terastodon do, on a hand-built pod table.
 * Run: npm run pod -- --test
 */
import * as C from '../cards/cards';
import { Game } from '../game/game';
import { Permanent } from '../game/game-types';
import { Deck } from '../run/runner';
import { HelgaGame } from '../../decks/helga/game';
import { podSpec, seatPlayers } from './pod';

const HELGA_SEAT = 0;
const MEREN_SEAT = 1;

function putOnBattlefield(
  game: Game<unknown>,
  cardName: string,
  isToken = false,
): Permanent {
  const card = C.get(cardName);
  const permanent = new Permanent(card, card.land, isToken);
  permanent.sick = false;
  game.putOntoBattlefield(permanent);
  return permanent;
}

const namesOnBattlefield = (game: Game<unknown>) =>
  game.battlefield.map((permanent) => permanent.card.name).sort();

export function runEldraziTests(allDecks: Record<string, Deck>): boolean {
  const spec = podSpec(allDecks, ['helga', 'meren', 'gale', 'aesi'], 17, {});
  const table = seatPlayers(allDecks, spec, 1, true);
  const helga = table.games[HELGA_SEAT] as HelgaGame;
  const meren = table.games[MEREN_SEAT];
  table.threats[MEREN_SEAT] = 100; // Meren is the biggest threat: it is the target
  table.startTurnLog(HELGA_SEAT);
  table.refreshView(HELGA_SEAT);
  const checks: [string, unknown, unknown][] = [];
  const check = (label: string, actual: unknown, expected: unknown) =>
    checks.push([label, actual, expected]);
  const merenSlot = table.opponentsOf[HELGA_SEAT].indexOf(MEREN_SEAT);

  // annihilator 4: a token, then lands, then the cheapest permanent
  meren.battlefield.length = 0;
  putOnBattlefield(meren, 'Forest');
  putOnBattlefield(meren, 'Island');
  putOnBattlefield(meren, 'Eternal Witness');
  putOnBattlefield(meren, 'Grave Titan');
  putOnBattlefield(meren, 'Zombie', true);
  helga.arena!.annihilate(helga, merenSlot, 4, 'Kozilek, Butcher of Truth');
  check(
    'Annihilator 4: token, then the cheapest nonlands, before any land',
    namesOnBattlefield(meren),
    ['Island'],
  );

  // annihilator 2 sacrifices only what is there, and a creature goes to the graveyard
  helga.arena!.annihilate(helga, merenSlot, 2, "Ulamog's Crusher");
  check('Annihilator 2 on a board of one', namesOnBattlefield(meren), []);
  check(
    'a sacrificed creature goes to its owner graveyard',
    meren.graveyard.some((card) => card.name === 'Grave Titan'),
    true,
  );

  // Ulamog, the Ceaseless Hunger: exile two permanents when cast
  putOnBattlefield(meren, 'Sol Ring');
  putOnBattlefield(meren, 'Grave Titan');
  putOnBattlefield(meren, 'Forest');
  helga.creatureCastTriggers(C.get('Ulamog, the Ceaseless Hunger'));
  check(
    'Ulamog, the Ceaseless Hunger exiles two nonland permanents',
    namesOnBattlefield(meren),
    ['Forest'],
  );
  check(
    'what it exiles goes to exile, not the graveyard',
    meren.exile.some((card) => card.name === 'Grave Titan'),
    true,
  );

  // Terastodon: destroys noncreature permanents worth it; each owner gets a 3/3
  meren.battlefield.length = 0;
  putOnBattlefield(meren, 'Sol Ring');
  putOnBattlefield(meren, 'Forest');
  helga.enter(C.get('Terastodon'), 'hand');
  check(
    'Terastodon destroys the Sol Ring (not the land) and gives a 3/3',
    namesOnBattlefield(meren),
    ['Beast', 'Forest'],
  );

  // an attack by an annihilator creature triggers it before blocks
  meren.battlefield.length = 0;
  for (let i = 0; i < 5; i++) putOnBattlefield(meren, 'Forest');
  const kozilek = putOnBattlefield(helga, 'Kozilek, Butcher of Truth');
  helga.strike(merenSlot, [kozilek]);
  check(
    'Kozilek attacking: the defender is left with 1 of 5 lands',
    namesOnBattlefield(meren),
    ['Forest'],
  );

  // Ulamog, the Defiler enters with counters in a pod, so its annihilator is more than 0
  helga.enter(C.get('Ulamog, the Defiler'), 'hand');
  const defiler = helga.findPermanent('Ulamog, the Defiler');
  check(
    'Ulamog, the Defiler enters with counters in a pod',
    (defiler?.counters ?? 0) > 0,
    true,
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
    `${isGood ? 'OK ' : 'BAD'} Helga's annihilator and Eldrazi removal: ${wrong.length} wrong`,
  );
  for (const difference of wrong) console.log(`      ${difference}`);
  return isGood;
}
