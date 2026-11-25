/**
 * Untap effects: which of our tapped lands an untap spell or trigger untaps (GameCore.untapLands). The cards
 * themselves are in engine/card-rules/.
 */
import type { GameCore } from './game-core';
import { Permanent } from './game-types';
import { UNTAP, isSourceOfClass } from './search-mana';

/** Untaps up to count tapped lands (see GameCore.untapLands). */
export function untapBestLands(game: GameCore, count: number): void {
  const tapped = game.battlefield.filter(
    (permanent) => permanent.land !== null && permanent.tapped,
  );
  // the lands that make the most first (High Tide's and Bubbling Muck's bonus), then one that makes two colours
  const manaMade = (permanent: Permanent) =>
    1 +
    (game.islandTyped(permanent) ? game.highTidesThisTurn : 0) +
    (game.swampTyped(permanent) ? game.muck : 0);
  const makesTwoColours = (permanent: Permanent) => {
    const kind = game.manaSourceKind(permanent) ?? '';
    return kind === 'A' || kind === 'UB' || kind === 'GU' || kind.includes('/');
  };
  const key = (permanent: Permanent) =>
    -2 * manaMade(permanent) + (makesTwoColours(permanent) ? 0 : 1);
  tapped.sort((first, second) => key(first) - key(second));
  for (const otherPermanent of landsToUntap(game, tapped, count))
    otherPermanent.tapped = false;
}

/** The lands an untap effect untaps, from the tapped ones best first. A search that planned the untap (a kill line it
 *  found, GameCore.plannedPayments) may name others. */
function landsToUntap(
  game: GameCore,
  tappedLandsBestFirst: Permanent[],
  count: number,
): Permanent[] {
  const index = game.plannedPayments.findIndex(
    (payment) => payment.cost === UNTAP,
  );
  if (index < 0) return tappedLandsBestFirst.slice(0, count);
  const [payment] = game.plannedPayments.splice(index, 1);
  const chosen: Permanent[] = [];
  for (const landClass of payment.taps) {
    const land = tappedLandsBestFirst.find(
      (permanent) =>
        !chosen.includes(permanent) &&
        isSourceOfClass(game, permanent, landClass),
    );
    if (land) chosen.push(land);
  }
  // anything the plan didn't cover (the real game has other tapped lands) is untapped the usual way
  for (const land of tappedLandsBestFirst)
    if (
      chosen.length < Math.min(count, payment.taps.length) &&
      !chosen.includes(land)
    )
      chosen.push(land);
  return chosen;
}
