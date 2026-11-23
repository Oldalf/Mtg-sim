/**
 * The Marionette Master finish: sacrifice every artifact we can pay for, each one drains the Master's power from
 * an opponent, every Food also gains 3 life (Gollum's end-step ping for each opponent it hit this game).
 * It is played on a copy of the game first and only done for real when the copy wins by the end step.
 */
import { TREASURE } from '../../engine/cards/tokens';
import { activateTradingPost } from './actions';
import { eatFood } from './combat';
import type { SamFrodoGame } from './game';

const MARIONETTE_MASTER = 'Marionette Master';
const SECOND_HARVEST = 'Second Harvest';
/** Life a Food gains, for the quick check below. */
const LIFE_PER_FOOD = 3;

/** Plays the finish if it wins this turn. Returns true when the game is won already (otherwise the end step
 *  still has to win it with Gollum's ping). */
export function finishWithMasterDrain(game: SamFrodoGame): boolean {
  if (!couldPossiblyWin(game)) return false;
  const secondHarvestFirst = [false, true].find((castFirst) =>
    winsOnCopy(game, castFirst),
  );
  if (secondHarvestFirst === undefined) return false;
  game.say('Marionette Master finish: sacrifice every artifact');
  playFinish(game, secondHarvestFirst);
  return game.checkKill() === 2;
}

/** Plays the finish on a copy (with the end step, for Gollum): does it win? */
function winsOnCopy(game: SamFrodoGame, castSecondHarvestFirst: boolean) {
  const secondHarvest = game.hand.find((card) => card.name === SECOND_HARVEST);
  if (castSecondHarvestFirst && !secondHarvest) return false;
  const copy = game.clone();
  playFinish(copy, castSecondHarvestFirst);
  if (copy.hasWon()) return true;
  copy.endStep();
  return copy.hasWon();
}

/** Second Harvest first doubles every Food and Treasure, so there are twice the artifacts to sacrifice. */
function playFinish(game: SamFrodoGame, castSecondHarvestFirst: boolean) {
  const secondHarvest = game.hand.find((card) => card.name === SECOND_HARVEST);
  if (castSecondHarvestFirst && secondHarvest)
    game.castInstantOrSorcery(secondHarvest);
  sacrificeEveryArtifact(game);
}

/** A cheap upper bound, so the game is only copied when the artifacts could be enough. */
function couldPossiblyWin(game: SamFrodoGame): boolean {
  const master = game.findPermanent(MARIONETTE_MASTER);
  if (!master) return false;
  const artifactCount = game.battlefield.filter(
    (permanent) => permanent !== master && permanent.card.types.has('artifact'),
  ).length;
  const lifeLeft = game.life.reduce(
    (total, life, slot) => total + (game.isOpponentAlive(slot) ? life : 0),
    0,
  );
  const harvestFactor = game.hand.some((card) => card.name === SECOND_HARVEST)
    ? 2
    : 1;
  return (
    harvestFactor * artifactCount * (game.power(master) + LIFE_PER_FOOD) >=
    lifeLeft
  );
}

/** Foods first (they gain life too, and paying for them taps the Treasures we have not sacrificed yet), then the
 *  Treasures, then one more artifact (Sol Ring, a Signet) into Trading Post. Stops as soon as the opponents are beaten. */
function sacrificeEveryArtifact(game: SamFrodoGame): void {
  for (const food of game.foodsOnBattlefield()) {
    if (game.hasWon()) return;
    if (!eatFood(game, food)) break;
  }
  for (const treasure of game.battlefield.filter(
    (permanent) => permanent.card === TREASURE,
  )) {
    if (game.hasWon()) return;
    game.sacrifice(treasure);
  }
  const tradingPost = game.findPermanent('Trading Post');
  const artifact = game.battlefield.find(
    (permanent) =>
      permanent !== tradingPost &&
      permanent.card.name !== MARIONETTE_MASTER &&
      permanent.card.types.has('artifact'),
  );
  if (tradingPost && !tradingPost.tapped && artifact && !game.hasWon())
    activateTradingPost(game, tradingPost, () => game.sacrifice(artifact));
}
