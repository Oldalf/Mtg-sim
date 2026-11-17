/** Instant speed at the end of the opponents' turns (engine/game/instant-speed.ts), as Gale plays it. Run: npm run sim -- gale --test */
import * as C from '../../../engine/cards/cards';
import { Permanent } from '../../../engine/game/game-types';
import {
  playOpponentsEndStep,
  putOpeningHandLeylineOntoBattlefield,
} from '../../../engine/game/instant-speed';
import { Rng } from '../../../engine/util/rng';
import { CFG } from '../config';
import { GaleGame } from '../game';

interface WindowBoard {
  lands: string[];
  battlefieldNames?: string[];
  hand: string[];
  isWindowOn?: boolean;
  isHoldingCounter?: boolean;
}

/** A game on turn 5 with these untapped lands and permanents; the library is all Islands. */
function windowBoard({
  lands,
  battlefieldNames = [],
  hand,
  isWindowOn = true,
  isHoldingCounter = false,
}: WindowBoard): GaleGame {
  const config = {
    ...CFG,
    opponents_end_step: isWindowOn,
    hold_counter: isHoldingCounter,
  };
  const game = new GaleGame(
    [],
    new Array(60).fill('Island') as string[],
    new Rng(1),
    config,
  );
  game.startTurn();
  game.turn = 5;
  for (const landName of lands) {
    const card = C.get(landName);
    game.battlefield.push(new Permanent(card, card.land));
  }
  for (const cardName of battlefieldNames) {
    const permanent = new Permanent(C.get(cardName));
    permanent.sick = false;
    game.battlefield.push(permanent);
  }
  game.hand = hand.map((cardName) => C.get(cardName));
  return game;
}

const names = (cards: { name: string }[]) =>
  cards.map((card) => card.name).sort();

export function runInstantSpeedTests(): boolean {
  let allPassed = true;
  /** Plays the window and compares the graveyard (what was cast or sacrificed) with what is expected. */
  const checkWindow = (
    label: string,
    game: GaleGame,
    expectedGraveyard: string[],
  ) => {
    playOpponentsEndStep(game);
    const graveyard = names(game.graveyard);
    const isGood =
      JSON.stringify(graveyard) === JSON.stringify(expectedGraveyard.sort());
    console.log(
      `${isGood ? 'OK ' : 'BAD'} opponents' end step: ${label}: got ${JSON.stringify(graveyard)}, expected ${JSON.stringify(expectedGraveyard)}`,
    );
    allPassed = allPassed && isGood;
  };
  const check = (label: string, got: unknown, expected: unknown) => {
    const isGood = JSON.stringify(got) === JSON.stringify(expected);
    console.log(
      `${isGood ? 'OK ' : 'BAD'} ${label}: got ${JSON.stringify(got)}, expected ${JSON.stringify(expected)}`,
    );
    allPassed = allPassed && isGood;
  };

  checkWindow(
    'window off: Opt stays in hand',
    windowBoard({ lands: ['Island'], hand: ['Opt'], isWindowOn: false }),
    [],
  );
  checkWindow(
    'an instant (Opt) is cast',
    windowBoard({ lands: ['Island'], hand: ['Opt'] }),
    ['Opt'],
  );
  checkWindow(
    "a sorcery (Night's Whisper) without flash is not",
    windowBoard({ lands: ['Island', 'Swamp'], hand: ["Night's Whisper"] }),
    [],
  );
  checkWindow(
    "Wizards of Thay: Night's Whisper has flash (and costs {B})",
    windowBoard({
      lands: ['Swamp'],
      battlefieldNames: ['Wizards of Thay'],
      hand: ["Night's Whisper"],
    }),
    ["Night's Whisper"],
  );
  checkWindow(
    "Quicken, then Night's Whisper",
    windowBoard({
      lands: ['Island', 'Island', 'Swamp'],
      hand: ["Night's Whisper", 'Quicken'],
    }),
    ["Night's Whisper", 'Quicken'],
  );
  checkWindow(
    "Quicken but no mana left for Night's Whisper: Quicken is kept",
    windowBoard({
      lands: ['Island', 'Swamp'],
      hand: ["Night's Whisper", 'Quicken'],
    }),
    [],
  );
  checkWindow(
    "Emergence Zone ({1}, {T}, sacrifice), then Night's Whisper",
    windowBoard({
      lands: ['Emergence Zone', 'Island', 'Island', 'Swamp'],
      hand: ["Night's Whisper"],
    }),
    ['Emergence Zone', "Night's Whisper"],
  );
  checkWindow(
    "Borne Upon a Wind, then Night's Whisper",
    windowBoard({
      lands: ['Island', 'Island', 'Island', 'Swamp'],
      hand: ["Night's Whisper", 'Borne Upon a Wind'],
    }),
    ['Borne Upon a Wind', "Night's Whisper"],
  );

  const leylineGame = windowBoard({
    lands: [],
    hand: ['Leyline of Anticipation', 'Island'],
  });
  putOpeningHandLeylineOntoBattlefield(leylineGame);
  check(
    'Leyline of Anticipation in the opening hand starts on the battlefield',
    leylineGame.isOnBattlefield('Leyline of Anticipation'),
    true,
  );

  check(
    'hold_counter: Gale out, Counterspell in hand -> keep 2 mana up',
    windowBoard({
      lands: ['Island', 'Island'],
      battlefieldNames: ['Gale, Waterdeep Prodigy'],
      hand: ['Counterspell'],
      isHoldingCounter: true,
    }).podReserve(),
    2,
  );
  check(
    "hold_counter: Bender's Waterskin untaps on the others' turns -> keep 1 up for Counterspell",
    windowBoard({
      lands: ['Island', 'Island'],
      battlefieldNames: ['Gale, Waterdeep Prodigy', "Bender's Waterskin"],
      hand: ['Counterspell'],
      isHoldingCounter: true,
    }).podReserve(),
    1,
  );
  check(
    'hold_counter: no Gale yet -> keep nothing up',
    windowBoard({
      lands: ['Island', 'Island'],
      hand: ['Counterspell'],
      isHoldingCounter: true,
    }).podReserve(),
    0,
  );
  return allPassed;
}
