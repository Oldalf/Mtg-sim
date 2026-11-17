/** What a spell does when it resolves, for the cards Codie's deck knows. Returns false for other cards (the engine handles them). */
import { TREASURE } from '../../engine/cards/tokens';
import * as C from '../../engine/cards/cards';
import {
  AD_NAUSEAM,
  BRASS_BOUNTY,
  CRACKLE_WITH_POWER,
  EXSANGUINATE,
  FINISHERS,
  MANA_GEYSER,
  HOLD,
  MANA_SPELLS,
  PROFANE_TUTOR,
  REITERATE,
  RETURN_THE_FAVOR,
  TEFERIS_PROTECTION,
  TORMENT_OF_HAILFIRE,
  LIM_DUL_VAULT,
  JESKAS_WILL,
} from './cards';
import { findKillLine } from './solver';
import { stackLibraryWithVault } from './solver-actions';
import type { CodieGame } from './game';
import { CardDef } from '../../engine/cards/cards';
import { firstMax } from '../../engine/util/lists';

export function resolveCodieSpell(game: CodieGame, spell: CardDef): boolean {
  return (
    resolveManaSpell(game, spell) ||
    resolveCardSelection(game, spell) ||
    resolveTutor(game, spell)
  );
}

/** Rituals, Treasure makers and Manamorphose. */
function resolveManaSpell(game: CodieGame, spell: CardDef): boolean {
  switch (spell.name) {
    case 'Seething Song':
      game.pool.R += 5;
      return true;
    case 'Pyretic Ritual':
      game.pool.R += 3;
      return true;
    case 'Dark Ritual':
      game.pool.B += 3;
      return true;
    case JESKAS_WILL:
      game.pool.R += game.opponentHandSize();
      return true;
    case MANA_GEYSER:
      game.pool.R += game.opponentTappedLands();
      return true;
    case BRASS_BOUNTY:
      game.createTokens(TREASURE, game.landsOnBattlefield().length);
      return true;
    case 'Manamorphose': {
      const colours = coloursWeAreShortOf(game);
      const first = colours[0] ?? 'R';
      const second = colours[1] ?? colours[0] ?? 'B';
      game.pool[first as 'R'] += 1;
      game.pool[second as 'R'] += 1;
      game.draw(1);
      return true;
    }
    default:
      return false;
  }
}

/** Draw and "look at the top" spells. */
function resolveCardSelection(game: CodieGame, spell: CardDef): boolean {
  switch (spell.name) {
    case 'Growth Spiral':
      game.draw(1); // the land drop is played by the AI
      return true;
    case 'Brainstorm':
      game.draw(3);
      putCardsBackOnLibrary(game, 2);
      return true;
    case 'Flow State':
      lookAtTopAndKeep(game, 3, 1);
      return true;
    case 'Stock Up':
      lookAtTopAndKeep(game, 5, 2);
      return true;
    case 'Valakut Awakening': {
      const unwanted = game.hand.filter(
        (card) =>
          card !== spell &&
          (HOLD.has(card.name)
            ? false
            : card.land !== null || game.developmentValue(card) < 45),
      );
      for (const card of unwanted) {
        game.takeCardIfThere(card, 'hand');
        game.putCard(card, 'library');
      }
      game.draw(unwanted.length + 1);
      return true;
    }
    case 'Windfall': {
      const handSize = game.hand.length;
      for (const card of game.takeAllCards('hand')) game.toGraveyard(card);
      game.draw(Math.max(handSize, 7));
      return true;
    }
    default:
      return false;
  }
}

/** Tutors, Ad Nauseam and Lim-Dul's Vault. */
function resolveTutor(game: CodieGame, spell: CardDef): boolean {
  switch (spell.name) {
    case AD_NAUSEAM:
      resolveAdNauseam(game);
      return true;
    case PROFANE_TUTOR:
      game.doTutor(() => true, false);
      return true;
    case LIM_DUL_VAULT:
      stackLibraryWithVault(game);
      return true;
    default:
      return false;
  }
}

/** Put a land from the library onto the battlefield (or into the hand). Returns the land or null. */
/** Which land a land-search spell takes: one of a colour we are short of, a nonbasic before a basic, never a
 *  land that hurts us (Glacial Chasm, Maze of Ith, Volatile Fault). */
export function chooseCodieLand(
  game: CodieGame,
  candidates: CardDef[],
  toHand: boolean,
): CardDef {
  const have = new Set(
    game.landsOnBattlefield().map((permanent) => permanent.card.name),
  );
  const need = coloursWeAreShortOf(game);
  const score = (card: CardDef) => {
    let score = 0;
    for (const colour of need) if (C.landMakes(card, colour)) score += 4;
    if (!card.land!.basic) score += 1; // nonbasics are better (more colours, or utility)
    if (have.has(card.name) && card.land!.basic) score += 0.5;
    if (
      card.name === 'Glacial Chasm' ||
      card.name === 'Maze of Ith' ||
      card.name === 'Volatile Fault'
    )
      score -= 20;
    if (card.name === 'Field of the Dead' && !toHand) score -= 3;
    return score;
  };
  return firstMax(candidates, score);
}

/** Colours we are short of for the cards in hand (red for Reiterate, black for the finishers, ...). */
export function coloursWeAreShortOf(game: CodieGame): string[] {
  const want: string[] = [];
  const have = (colour: string) =>
    game
      .landsOnBattlefield()
      .filter((permanent) => C.landMakes(permanent.card, colour)).length;
  for (const [colour, neededCount] of [
    ['R', 2],
    ['B', 2],
    ['U', 2],
    ['W', 1],
    ['G', 1],
  ] as [string, number][])
    if (have(colour) < neededCount) want.push(colour);
  return want;
}

export function putCardsBackOnLibrary(game: CodieGame, count: number): void {
  for (let i = 0; i < Math.min(count, game.hand.length); i++) {
    const card = game.hand.reduce((best, candidate) =>
      game.cardValue(candidate) < game.cardValue(best) ? candidate : best,
    );
    game.takeCardIfThere(card, 'hand');
    game.putCardsOnTopOfLibrary([card]);
  }
}

export function lookAtTopAndKeep(
  game: CodieGame,
  lookCount: number,
  keepCount: number,
): void {
  const top = game.takeTopCardsOfLibrary(lookCount);
  top.sort((first, second) => game.cardValue(second) - game.cardValue(first));
  game.putCards(top.slice(0, keepCount), 'hand');
  game.putCards(top.slice(keepCount), 'library');
}

/** The card the AI wants most from the library (the missing piece of a kill; see wantList). */
export function chooseTutorTarget(
  game: CodieGame,
  isAllowed: (card: CardDef) => boolean = () => true,
): CardDef | null {
  const candidates = game.library.filter(isAllowed);
  if (!candidates.length) return null;
  // 1. a card that completes a kill line (tried on a copy of the game). A kill line being played chooses as the solver
  // did on its copies (they are rollouts), so the line it found is the line played.
  if (
    (!game.inRollout && !game.isPlayingKillLine) ||
    game.config.rollout_solver
  ) {
    for (const name of tutorPriorityList(game)) {
      const candidate = candidates.find((card) => card.name === name);
      if (!candidate) continue;
      const solverCopy = game.buildKillSearchState();
      solverCopy.hand.push(candidate);
      if (findKillLine(solverCopy) !== null) return candidate;
    }
  }
  // 2. the best missing piece
  for (const name of tutorPriorityList(game)) {
    const wantedCard = candidates.find((card) => card.name === name);
    if (wantedCard) return wantedCard;
  }
  return firstMax(candidates, (card) => game.cardValue(card));
}

export function tutorPriorityList(game: CodieGame): string[] {
  const have = (name: string) => game.inHand(name);
  const out: string[] = [];
  if (!have(REITERATE)) out.push(REITERATE);
  if (!FINISHERS.some(have))
    out.push(TORMENT_OF_HAILFIRE, CRACKLE_WITH_POWER, EXSANGUINATE);
  if (![JESKAS_WILL, MANA_GEYSER, BRASS_BOUNTY].some(have))
    out.push(JESKAS_WILL, BRASS_BOUNTY, MANA_GEYSER);
  if (!have(AD_NAUSEAM) || !have(TEFERIS_PROTECTION))
    out.push(AD_NAUSEAM, TEFERIS_PROTECTION);
  out.push(
    ...MANA_SPELLS.filter((name) => !have(name)),
    ...FINISHERS,
    RETURN_THE_FAVOR,
  );
  return out;
}

/** Ad Nauseam: reveal cards until a limit on life (always the whole library with Teferi's Protection). */
export function resolveAdNauseam(game: CodieGame): void {
  const floor = game.config.ad_floor as number;
  while (game.library.length && game.isStillAlive()) {
    const card = game.library[0];
    if (game.myLife - card.manaValue < floor) break;
    game.takeTopCardsOfLibrary(1);
    game.putCard(card, 'hand');
    game.loseLife(card.manaValue);
  }
  game.say('Ad Nauseam: hand', game.hand.length, 'life', game.myLife);
}
