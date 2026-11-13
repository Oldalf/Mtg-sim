/** What a spell does when it resolves, for the cards Codie's deck knows. Returns false for other cards (the engine handles them). */
import * as C from '../../engine/cards';
import {
  AD_NAUSEAM,
  BRASS_BOUNTY,
  CRACKLE_WITH_POWER,
  DEMONIC_TUTOR,
  EXSANGUINATE,
  FETCH,
  FINISHERS,
  MANA_GEYSER,
  HOLD,
  MANA_SPELLS,
  PROFANE_TUTOR,
  REITERATE,
  RETURN_THE_FAVOR,
  TEFERIS_PROTECTION,
  TORMENT_OF_HAILFIRE,
  TREASURE,
  LIM_DUL_VAULT,
  JESKAS_WILL,
} from './cards';
import { findKillLine } from './solver';
import { stackLibraryWithVault } from './solver-actions';
import type { CodieGame } from './game';
import { CardDef } from '../../engine/cards';
import { Permanent } from '../../engine/game-types';
import { firstMax } from '../../engine/lists';

export function resolveCodieSpell(game: CodieGame, spell: CardDef): boolean {
  return (
    resolveLandFetcher(game, spell) ||
    resolveManaSpell(game, spell) ||
    resolveCardSelection(game, spell) ||
    resolveTutor(game, spell)
  );
}

/** Spells that search for lands (see FETCH). */
function resolveLandFetcher(game: CodieGame, spell: CardDef): boolean {
  const fetcher = FETCH[spell.name];
  if (fetcher) {
    for (let i = 0; i < (fetcher.landsToSacrifice ?? 0); i++)
      sacrificeLand(game);
    for (let i = 0; i < fetcher.landCount; i++) {
      if (fetcher.secondLandToHand && i === 1)
        fetchLand(game, fetcher.kind, true, true);
      else fetchLand(game, fetcher.kind, fetcher.tapped);
    }
    return true;
  }
  if (spell.name === 'Sylvan Scrying') {
    fetchLand(game, 'any', false, true);
    return true;
  }
  return false;
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
      for (let i = 0; i < game.landsOnBattlefield().length; i++)
        game.putOntoBattlefield(new Permanent(TREASURE));
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
    case DEMONIC_TUTOR:
    case PROFANE_TUTOR:
      fetchCardFromLibrary(game, chooseTutorTarget(game), false);
      return true;
    case LIM_DUL_VAULT:
      stackLibraryWithVault(game);
      return true;
    case 'Vampiric Tutor':
      fetchCardFromLibrary(game, chooseTutorTarget(game), true);
      game.loseLife(2);
      return true;
    case 'Personal Tutor':
      fetchCardFromLibrary(
        game,
        chooseTutorTarget(game, (card) => card.isSorcery),
        true,
      );
      return true;
    case 'Merchant Scroll':
      fetchCardFromLibrary(
        game,
        chooseTutorTarget(game, (card) => card.isInstant && card.isBlue),
        false,
      );
      return true;
    default:
      return false;
  }
}

/** Put a land from the library onto the battlefield (or into the hand). Returns the land or null. */
export function fetchLand(
  game: CodieGame,
  kind: 'basic' | 'forest' | 'types' | 'any',
  tapped: boolean,
  toHand = false,
): CardDef | null {
  const isWantedKind = (card: CardDef) => {
    const landInfo = card.land;
    if (!landInfo) return false;
    if (kind === 'basic') return !!landInfo.basic;
    if (kind === 'forest') return !!landInfo.forest;
    if (kind === 'types')
      return !!(
        landInfo.plains ||
        landInfo.island ||
        landInfo.swamp ||
        landInfo.mountain
      );
    return true;
  };
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
  const candidates = game.library.filter(isWantedKind);
  if (!candidates.length) return null;
  const pick = firstMax(candidates, score);
  game.takeCardIfThere(pick, 'library');
  game.shuffle();
  if (toHand) game.putCard(pick, 'hand');
  else {
    const entersTapped =
      tapped || game.entersTapped(pick) || pick.land!.etb === 'tapped';
    const land = new Permanent(pick, pick.land, entersTapped);
    land.sick = false;
    game.putOntoBattlefield(land);
    game.onLandEnter(land, false);
  }
  return pick;
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

export function sacrificeLand(game: CodieGame): void {
  const permanent =
    game
      .landsOnBattlefield()
      .filter((basicLand) => basicLand.land?.basic)
      .sort((first, second) => +second.tapped - +first.tapped)[0] ??
    game.landsOnBattlefield()[0];
  if (permanent) game.takeFromBattlefieldIfThere(permanent);
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
  // 1. a card that completes a kill line (tried on a copy of the game)
  if (!game.inRollout || game.config.rollout_solver) {
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

export function fetchCardFromLibrary(
  game: CodieGame,
  card: CardDef | null,
  toTop: boolean,
): void {
  if (!card) return;
  game.takeCardIfThere(card, 'library');
  game.shuffle();
  if (toTop) game.putCardsOnTopOfLibrary([card]);
  else game.putCard(card, 'hand');
  game.say('tutor ->', card, toTop ? '(top)' : '');
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
