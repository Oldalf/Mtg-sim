/** Merchant Scroll and Mnemonic Wall (engine card rules) as Gale plays them. Run: npm run sim -- gale --test */
import * as C from '../../../engine/cards/cards';
import { Rng } from '../../../engine/util/rng';
import { CFG } from '../config';
import { GaleGame } from '../game';

/** A game on turn 5 whose library is these cards. */
function gameWithLibrary(libraryNames: string[]): GaleGame {
  const game = new GaleGame([], libraryNames, new Rng(1), CFG);
  game.startTurn();
  game.turn = 5;
  game.hand = [];
  return game;
}

export function runNewCardTests(): boolean {
  let allPassed = true;
  const check = (label: string, got: unknown, expected: unknown) => {
    const isGood = JSON.stringify(got) === JSON.stringify(expected);
    console.log(
      `${isGood ? 'OK ' : 'BAD'} ${label}: got ${JSON.stringify(got)}, expected ${JSON.stringify(expected)}`,
    );
    allPassed = allPassed && isGood;
  };

  const scrollGame = gameWithLibrary([
    ...(new Array(30).fill('Island') as string[]),
    'High Tide',
    "Night's Whisper",
  ]);
  scrollGame.resolve(C.get('Merchant Scroll'));
  check(
    'Merchant Scroll finds a blue instant (High Tide), not a sorcery',
    scrollGame.hand.map((card) => card.name),
    ['High Tide'],
  );

  const wallGame = gameWithLibrary(new Array(30).fill('Island') as string[]);
  wallGame.graveyard = [C.get('Opt'), C.get('Maddening Cacophony')];
  wallGame.enter(C.get('Mnemonic Wall'));
  check(
    'Mnemonic Wall returns the best instant or sorcery (Cacophony over Opt)',
    wallGame.hand.map((card) => card.name),
    ['Maddening Cacophony'],
  );
  return allPassed;
}
