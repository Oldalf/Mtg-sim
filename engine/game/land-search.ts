/**
 * Land-search spells (Rampant Growth, Cultivate, Farseek...): what they do is a card fact (LAND_SEARCH in
 * card-facts.ts), which lands to take is the deck's choice (GameCore.chooseLandToFetch).
 */
import { CardDef } from '../cards/cards';
import { LAND_SEARCH, LandKind } from '../cards/card-facts';
import type { GameCore } from './game-core';

/** Plays a land-search spell. Returns false if the spell isn't one. */
export function resolveLandSearch(game: GameCore, spell: CardDef): boolean {
  const search = LAND_SEARCH[spell.name];
  if (!search) return false;
  for (let i = 0; i < (search.landsToSacrifice ?? 0); i++)
    sacrificeLandForSearch(game);
  for (let i = 0; i < search.landCount; i++) {
    const toHand = search.toHand || (search.secondLandToHand && i === 1);
    fetchLand(game, search.kind, search.tapped, !!toHand);
  }
  return true;
}

export function isLandOfKind(card: CardDef, kind: LandKind): boolean {
  const landInfo = card.land;
  if (!landInfo) return false;
  if (kind === 'basic') return !!landInfo.basic;
  if (kind === 'forest') return !!landInfo.forest;
  if (kind === 'plains') return !!landInfo.plains;
  if (kind === 'types')
    return !!(
      landInfo.plains ||
      landInfo.island ||
      landInfo.swamp ||
      landInfo.mountain
    );
  return true;
}

/** Takes a land of this kind from the library (the deck picks which), then shuffles. It goes to the hand, or onto
 *  the battlefield (tapped when the spell says so or the land always enters tapped). Returns the land, or null. */
export function fetchLand(
  game: GameCore,
  kind: LandKind,
  tapped: boolean,
  toHand = false,
): CardDef | null {
  const candidates = game.library.filter((card) => isLandOfKind(card, kind));
  if (!candidates.length) return null;
  const pick = game.chooseLandToFetch(candidates, toHand);
  game.takeCardIfThere(pick, 'library');
  if (toHand) {
    game.shuffle();
    game.putCard(pick, 'hand');
  } else {
    const entersTapped =
      tapped || game.entersTapped(pick) || pick.land!.etb === 'tapped';
    game.putSearchedLand(pick, entersTapped);
  }
  return pick;
}

/** Sacrifices a land for a spell's cost: a basic, tapped ones first. */
function sacrificeLandForSearch(game: GameCore): void {
  const permanent =
    game
      .landsOnBattlefield()
      .filter((basicLand) => basicLand.land?.basic)
      .sort((first, second) => +second.tapped - +first.tapped)[0] ??
    game.landsOnBattlefield()[0];
  if (permanent) game.takeFromBattlefieldIfThere(permanent);
}
