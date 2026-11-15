/**
 * Tokens in the log (PLAN.md step 6, D2): a creature token is known by its name and face, so Edgar's three kinds of
 * Vampire stay apart in the log and on the replayed board, and each gets its own art.
 */
import { CardDef, makeArtifactToken, makeToken } from '../cards/cards';
import { pickTokenArt } from '../cards/token-art';
import { Permanent } from '../game/game-types';
import { MoveRecorder, TableZones } from './game-log-moves';
import { CardMove } from './game-log';
import {
  PlayerBoard,
  applyMove,
  describeBoard,
} from '../../shared/game-log-board';
import { reportDifferences } from './game-log.test';

const VAMPIRE = makeToken('Vampire', 1, 1, 'black');
const LIFELINK_VAMPIRE = makeToken('Vampire', 1, 1, 'white', ['lifelink']);
const FLYING_VAMPIRE = makeToken('Vampire', 2, 2, 'black', ['flying']);

/** The Scryfall entry the art for a token comes from, as "power/toughness colours keywords", or "none". */
function describeArtFor(card: CardDef): string {
  const entry = pickTokenArt(card.logName, card.tokenFace ?? undefined);
  if (!entry) return 'none';
  return [
    `${entry.power}/${entry.toughness}`,
    ...entry.colours,
    ...entry.keywords,
  ].join(' ');
}

function artMistakes(): string[] {
  const checks: [string, string, string][] = [
    ['Vampire 1/1 black', describeArtFor(VAMPIRE), '1/1 black'],
    [
      'Vampire 1/1 white lifelink',
      describeArtFor(LIFELINK_VAMPIRE),
      '1/1 white lifelink',
    ],
    [
      'Vampire 2/2 black flying',
      describeArtFor(FLYING_VAMPIRE),
      '2/2 black flying',
    ],
    [
      'Stolen creature',
      describeArtFor(makeToken('Stolen creature', 5, 5)),
      'none',
    ],
    ['Treasure', describeArtFor(makeArtifactToken('Treasure')), 'null/null'],
    [
      'Illusion army (as an Illusion)',
      describeArtFor(
        makeToken('Illusion army', 999, 999, 'blue', ['flying'], {
          loggedAs: { name: 'Illusion', power: 1, toughness: 1, copies: 999 },
        }),
      ),
      '1/1 blue flying',
    ],
  ];
  return checks
    .filter(([, actual, expected]) => actual !== expected)
    .map(
      ([token, actual, expected]) =>
        `${token}: art of ${actual}, expected ${expected}`,
    );
}

function emptyZones(): TableZones {
  return {
    library: [],
    hand: [],
    graveyard: [],
    exile: [],
    command: [],
    battlefield: [],
  };
}

function emptyBoard(): PlayerBoard {
  return {
    hand: [],
    battlefield: [],
    graveyard: [],
    exile: [],
    commandZone: [],
    librarySize: 0,
    life: null,
    playerCounters: {},
  };
}

/** Three Vampires of each kind enter; some are tapped, then some untapped, one dies. The replay of the recorded
 *  moves must end with the same tapped count per kind as the game. */
function replayMistakes(): string[] {
  const zones = emptyZones();
  const recorder = new MoveRecorder(zones);
  const moves: CardMove[] = [];
  const collect = () => moves.push(...recorder.collectMoves(zones, 0, false));
  const vampires = [VAMPIRE, LIFELINK_VAMPIRE, FLYING_VAMPIRE].flatMap((card) =>
    [0, 1, 2].map(() => new Permanent(card)),
  );
  for (const vampire of vampires) {
    vampire.token = true;
    zones.battlefield.push(vampire);
    recorder.noteCardArrived(vampire.card, 'battlefield', true);
  }
  collect();
  const [black, , , lifelink, , , flying] = vampires;
  flying.tapped = true;
  lifelink.tapped = true;
  vampires[4].tapped = true;
  collect();
  lifelink.tapped = false;
  black.counters = 2;
  collect();
  zones.battlefield.splice(zones.battlefield.indexOf(flying), 1);
  recorder.notePermanentLeft(flying);
  collect();

  const board = emptyBoard();
  for (const move of moves) applyMove(board, move);
  const describeGame = (card: CardDef) => {
    const ofKind = zones.battlefield.filter(
      (permanent) => permanent.card === card,
    );
    const tapped = ofKind.filter((permanent) => permanent.tapped).length;
    const counters = ofKind.reduce(
      (sum, permanent) => sum + permanent.counters,
      0,
    );
    return `${ofKind.length} (${tapped} tapped, +${counters})`;
  };
  const describeReplay = (card: CardDef) => {
    const ofKind = board.battlefield.filter(
      (permanent) =>
        permanent.name === card.name &&
        JSON.stringify(permanent.token) === JSON.stringify(card.tokenFace),
    );
    const tapped = ofKind.filter((permanent) => permanent.tapped).length;
    const counters = ofKind.reduce(
      (sum, permanent) => sum + permanent.counters,
      0,
    );
    return `${ofKind.length} (${tapped} tapped, +${counters})`;
  };
  const mistakes = [VAMPIRE, LIFELINK_VAMPIRE, FLYING_VAMPIRE]
    .filter((card) => describeGame(card) !== describeReplay(card))
    .map(
      (card) =>
        `${card.name} ${JSON.stringify(card.tokenFace)}: game ${describeGame(card)}, replay ${describeReplay(card)}`,
    );
  const battlefieldLine = describeBoard(board)[1];
  const expectedLine =
    'battlefield: Vampire 1/1 black token +2, Vampire 1/1 black token x2, ' +
    'Vampire 1/1 white lifelink token x3 (1 tapped), Vampire 2/2 black flying token x2';
  if (battlefieldLine !== expectedLine)
    mistakes.push(
      `board line "${battlefieldLine}", expected "${expectedLine}"`,
    );
  return mistakes;
}

export function runTokenTests(): boolean {
  const isArtRight = reportDifferences(
    'token art fits the token',
    'wrong picks',
    artMistakes(),
  );
  const isReplayRight = reportDifferences(
    "Edgar's three Vampires stay apart in the log",
    'mix-ups',
    replayMistakes(),
  );
  return isArtRight && isReplayRight;
}
