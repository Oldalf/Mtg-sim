/** What the solver found. */
import {
  AD_NAUSEAM,
  BRASS_BOUNTY,
  CODIE,
  CRACKLE_WITH_POWER,
  DEMONIC_TUTOR,
  EXSANGUINATE,
  FLASHBACK,
  MANA_GEYSER,
  MANA_SPELLS,
  PROFANE_TUTOR,
  REITERATE,
  RETURN_THE_FAVOR,
  TEFERIS_PROTECTION,
  TORMENT_OF_HAILFIRE,
  TREASURE,
  TRIGGER_SPELLS,
  LIM_DUL_VAULT,
  JESKAS_WILL,
} from './cards';
import { manamorphoseCost } from './candidates';
import {
  activateCodie,
  activateCodieForTutor,
  castAdNauseamWithTeferi,
  castCantripDrawingTop,
  castDrawSpellOnKnownTop,
  castManaSpell,
  castTutor,
  castUntapSpell,
  castVault,
  exileFromHand,
  flashbackCast,
  flashbackTutor,
  tryReiterateLoop,
} from './solver-actions';
import { findFinisherCast } from './finishers';
import type { CodieGame } from './game';
import { CardDef } from '../../engine/cards';
import { Permanent } from '../../engine/game-types';
import { removeIfPresent } from '../../engine/lists';

export interface Line {
  steps: string[];
  backup: boolean;
  nextTurn?: boolean; // the kill is on the next turn (Ad Nauseam + Teferi's Protection put the library in hand, the mana is spent)
}

/** Solve for a kill this turn. Returns the line, with whether a counterspell / protection spell is still castable after it. */
export function findKillLine(game: CodieGame): Line | null {
  const any = searchForKill(game, false);
  if (!any) return null;
  const prot = searchForKill(game, true);
  return prot ?? { ...any, backup: false };
}

export function searchForKill(
  game: CodieGame,
  needBackup: boolean,
  maxNodes = game.config.solver_nodes as number,
): Line | null {
  game.searchedStates = new Set<string>();
  game.searchedNodeCount = 0;
  game.searchNodeLimit = maxNodes;
  return exploreMoves(game, game, [], 0, needBackup);
}

export function exploreMoves(
  game: CodieGame,
  state: CodieGame,
  steps: string[],
  depth: number,
  needBackup: boolean,
): Line | null {
  const key = state.killSearchStateKey() + (state.loopUsed ?? '');
  if (game.searchedStates.has(key)) return null;
  game.searchedStates.add(key);
  if (++game.searchedNodeCount > game.searchNodeLimit) return null; // a search budget: a rich hand can have a huge tree
  const fin = findFinisherCast(state, needBackup);
  if (fin)
    return {
      steps: [...steps, ...fin],
      backup: needBackup,
      nextTurn: state.nextTurn,
    };
  if (state.libraryInHand && !state.nextTurn) {
    const nextTurnLine = findNextTurnKill(state, needBackup);
    if (nextTurnLine)
      return {
        steps: [...steps, ...nextTurnLine.steps],
        backup: nextTurnLine.backup,
        nextTurn: true,
      };
  }
  if (depth >= 9) return null;
  for (const [name, apply] of possibleMoves(state)) {
    const nextState = state.clone();
    if (!apply(nextState)) continue;
    const line = exploreMoves(
      game,
      nextState,
      [...steps, name],
      depth + 1,
      needBackup,
    );
    if (line) return line;
  }
  return null;
}

/** One thing the solver may do: its name for the kill line, and how to do it on a copy of the game (false = can't). */
type SolverMove = [string, (copy: CodieGame) => boolean];

/** Moves of the solver: things that make mana or find cards. Each is applied to a copy of the game. */
export function possibleMoves(game: CodieGame): SolverMove[] {
  const moves: SolverMove[] = [];
  addSpiritGuideMoves(game, moves);
  addReiterateLoopMoves(game, moves);
  addFlashbackMoves(game, moves);
  addManaMoves(game, moves);
  addTutorMoves(game, moves);
  addStackedLibraryMoves(game, moves);
  return moves;
}

/** Free mana: the Spirit Guides. */
function addSpiritGuideMoves(game: CodieGame, moves: SolverMove[]): void {
  if (game.inHand('Elvish Spirit Guide'))
    moves.push([
      'exile Elvish Spirit Guide: G',
      (copy) => {
        exileFromHand(copy, 'Elvish Spirit Guide');
        copy.pool.G += 1;
        return true;
      },
    ]);
  if (game.inHand('Simian Spirit Guide'))
    moves.push([
      'exile Simian Spirit Guide: R',
      (copy) => {
        exileFromHand(copy, 'Simian Spirit Guide');
        copy.pool.R += 1;
        return true;
      },
    ]);
}

/** The loops: Reiterate with buyback on a spell that makes more than the copy costs. */
function addReiterateLoopMoves(game: CodieGame, moves: SolverMove[]): void {
  if (!game.inHand(REITERATE)) return;
  for (const spell of [JESKAS_WILL, MANA_GEYSER, BRASS_BOUNTY])
    if (game.inHand(spell))
      moves.push([
        `loop: ${spell} + Reiterate`,
        (copy) => tryReiterateLoop(copy, spell),
      ]);
}

/** Flashback: a tutor or a mana spell from the graveyard again (the loop piece too). */
function addFlashbackMoves(game: CodieGame, moves: SolverMove[]): void {
  if (!game.inHand(FLASHBACK)) return;
  const inGraveyard = (name: string) =>
    game.graveyard.some((card) => card.name === name);
  for (const tutor of [DEMONIC_TUTOR])
    if (inGraveyard(tutor))
      for (const target of wantedLibraryCards(game))
        moves.push([
          `Flashback ${tutor} -> ${target.name}`,
          (copy) => flashbackTutor(copy, tutor, target.name),
        ]);
  for (const spell of MANA_SPELLS)
    if (inGraveyard(spell))
      moves.push([`Flashback ${spell}`, (copy) => flashbackCast(copy, spell)]);
  if (game.inHand(REITERATE))
    for (const spell of [JESKAS_WILL, MANA_GEYSER, BRASS_BOUNTY])
      if (inGraveyard(spell))
        moves.push([
          `loop: Flashback ${spell} + Reiterate`,
          (copy) => tryReiterateLoop(copy, spell, true),
        ]);
}

/** Rituals and mana spells (alone or with one Reiterate copy), Manamorphose, Frantic Search and Codie. */
function addManaMoves(game: CodieGame, moves: SolverMove[]): void {
  for (const spell of MANA_SPELLS) {
    if (!game.inHand(spell)) continue;
    moves.push([`cast ${spell}`, (copy) => castManaSpell(copy, spell, 0)]);
    if (game.inHand(REITERATE)) {
      moves.push([
        `cast ${spell} + Reiterate copy`,
        (copy) => castManaSpell(copy, spell, 1),
      ]);
      moves.push([
        `cast ${spell} + Reiterate copy (buyback)`,
        (copy) => castManaSpell(copy, spell, 2),
      ]);
    }
  }
  if (game.inHand('Manamorphose'))
    moves.push([
      'Manamorphose',
      (copy) => {
        const card = copy.cardInHand('Manamorphose')!;
        return copy.castInstantOrSorcery(card, false, manamorphoseCost(copy));
      },
    ]);
  if (game.inHand('Frantic Search'))
    moves.push([
      'Frantic Search (untap 3 lands)',
      (copy) => castUntapSpell(copy, 'Frantic Search'),
    ]);
  if (game.isOnBattlefield(CODIE))
    moves.push(['Codie: {4}, T: WUBRG', (copy) => activateCodie(copy)]);
}

/** Finding pieces: Demonic Tutor, the top-of-library tutors with a cantrip, and Codie with a mana value 1 spell. */
function addTutorMoves(game: CodieGame, moves: SolverMove[]): void {
  if (game.inHand(DEMONIC_TUTOR))
    for (const target of wantedLibraryCards(game))
      moves.push([
        `Demonic Tutor -> ${target.name}`,
        (copy) => castTutor(copy, DEMONIC_TUTOR, target.name, false),
      ]);
  for (const tutor of ['Vampiric Tutor', 'Personal Tutor']) {
    if (!game.inHand(tutor)) continue;
    const cantrip = ['Manamorphose', 'Brainstorm'].find((name) =>
      game.inHand(name),
    );
    if (!cantrip) continue;
    for (const target of wantedLibraryCards(game)) {
      if (tutor === 'Personal Tutor' && !target.isSorcery) continue;
      moves.push([
        `${tutor} -> ${target.name}, then ${cantrip}`,
        (copy) =>
          castTutor(copy, tutor, target.name, true) &&
          castCantripDrawingTop(copy, cantrip),
      ]);
    }
  }
  // Codie + a spell of mana value 1: the free spell is always Profane Tutor (the only mana value 0 one): any card to hand
  if (
    game.isOnBattlefield(CODIE) &&
    game.library.some((card) => card.name === PROFANE_TUTOR)
  ) {
    for (const spell of TRIGGER_SPELLS) {
      if (!game.inHand(spell)) continue;
      for (const target of wantedLibraryCards(game))
        moves.push([
          `Codie + ${spell} -> Profane Tutor -> ${target.name}`,
          (copy) => activateCodieForTutor(copy, spell, target.name),
        ]);
    }
  }
}

/** Lim-Dul's Vault, draw spells on a stacked top, and Ad Nauseam with Teferi's Protection. */
function addStackedLibraryMoves(game: CodieGame, moves: SolverMove[]): void {
  if (game.inHand(LIM_DUL_VAULT))
    moves.push([
      "Lim-Dûl's Vault: the best five on top",
      (copy) => castVault(copy),
    ]);
  // draw spells are only used when every card they draw is known (a stacked top)
  for (const [name, cardsDrawn] of [
    ['Manamorphose', 1],
    ['Brainstorm', 3],
    ['Frantic Search', 2],
    ['Stock Up', 5],
    ['Flow State', 3],
  ] as [string, number][])
    if (game.inHand(name) && game.knownTop >= cardsDrawn)
      moves.push([
        `${name} (known top)`,
        (copy) => castDrawSpellOnKnownTop(copy, name),
      ]);
  if (game.inHand(AD_NAUSEAM) && game.inHand(TEFERIS_PROTECTION))
    moves.push([
      "Teferi's Protection + Ad Nauseam: the whole library",
      (copy) => castAdNauseamWithTeferi(copy),
    ]);
}

/** Cards in the library the solver may want. */
export function wantedLibraryCards(game: CodieGame): CardDef[] {
  const names = [
    REITERATE,
    CRACKLE_WITH_POWER,
    TORMENT_OF_HAILFIRE,
    EXSANGUINATE,
    JESKAS_WILL,
    BRASS_BOUNTY,
    MANA_GEYSER,
    AD_NAUSEAM,
    TEFERIS_PROTECTION,
    'Seething Song',
    'Pyretic Ritual',
    'Dark Ritual',
    RETURN_THE_FAVOR,
  ];
  return names
    .map((name) => game.library.find((card) => card.name === name))
    .filter((card): card is CardDef => !!card && !game.inHand(card.name));
}

/** After Ad Nauseam + Teferi's Protection the whole library is in the hand and life can't change: the kill next turn, with all
 *  lands untapped, Codie ready and one more land drop. */
export function findNextTurnKill(
  game: CodieGame,
  needBackup: boolean,
): Line | null {
  const copy = game.clone();
  copy.nextTurn = true;
  copy.turn += 1;
  copy.pool = { U: 0, B: 0, C: 0, S: 0, W: 0, R: 0, G: 0 };
  copy.battlefield = copy.battlefield.filter(
    (permanent) => permanent.card !== TREASURE || !permanent.tapped,
  );
  for (const permanent of copy.battlefield) {
    permanent.tapped = false;
    permanent.sick = false;
  }
  const land = copy.hand.find(
    (card) =>
      card.land !== null &&
      card.land.mana !== '' &&
      !copy.entersTapped(card) &&
      card.land.etb !== 'tapped' &&
      card.name !== 'Glacial Chasm',
  );
  if (land) {
    removeIfPresent(copy.hand, land);
    const landPermanent = new Permanent(land, land.land, false);
    landPermanent.sick = false;
    copy.battlefield.push(landPermanent);
  }
  const line = searchForKill(copy, needBackup, 1500);
  return line
    ? {
        steps: ['(next turn, the library in hand)', ...line.steps],
        backup: line.backup,
        nextTurn: true,
      }
    : null;
}
