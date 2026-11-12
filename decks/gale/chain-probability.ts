/**
 * Konrad chains checked against real shuffles: the kill search only knows the *average* number of creature cards
 * milled, so a line that relies on it is replayed on random deals of the opponents' libraries.
 */
import { KillSearchState, OlogNode } from './kill-state';
import { Rng } from '../../engine/rng';

/** Python's round(): halves go to the even neighbour. */
function pyRound(value: number): number {
  const whole = Math.floor(value);
  const fraction = value - whole;
  if (Math.abs(fraction - 0.5) < 1e-12)
    return whole % 2 === 0 ? whole : whole + 1;
  return Math.round(value);
}

/** One random deal of the opponents' (and our own) libraries, for replaying a line's opponent steps.
 *  Cards are drawn lazily: deck[i] = [cards left, creatures left]; the last entry is our own library. */
class World extends KillSearchState {
  deck: [number, number][] = [];
  rng!: Rng;

  take(deck: [number, number], count: number): number {
    let hits = 0;
    let [rem, cre] = deck;
    const draws = Math.min(count, rem);
    for (let draw = 0; draw < draws; draw++) {
      if (this.rng.random() * rem < cre) {
        cre -= 1;
        hits += 1;
      }
      rem -= 1;
    }
    deck[0] = rem;
    deck[1] = cre;
    return hits;
  }

  override creatureCardsMilled(
    i: number,
    count: number,
    fromLib: boolean,
  ): number {
    if (fromLib)
      return this.take(this.deck[i < 0 ? this.deck.length - 1 : i], count);
    let hits = 0;
    for (let draw = 0; draw < count; draw++)
      if (this.rng.random() < this.opponentCreatureDensity) hits++; // cards from hand (Windfall)
    return hits;
  }

  override opponentDraws(i: number, count: number): void {
    super.opponentDraws(i, count);
    this.take(this.deck[i], count);
  }
}

export const CHAIN_MIN = 0.9; // a line that relies on Konrad's creature count must win at least this often
const CHAIN_N = 400; // random deals per line (40, then 100, then 400; stop once clearly above or below CHAIN_MIN)
const CHAIN_CACHE = new Map<string, number>();

/** Fraction of random deals in which the leaf's logged opponent steps kill every opponent.
 *  root: the position the search started from (life, libraries, graveyards before the line). */
export function chainProb(
  root: KillSearchState,
  leaf: KillSearchState,
): number {
  const cacheKey = `${root.opponentLife}|${root.opponentLibrary}|${root.opponentGraveyard}|${root.opponentPoison}|${root.ownLibrarySize}|${root.ownCreatureDensity}|${root.opponentCreatureDensity}|${leaf.opponentStepKey}`;
  const hit = CHAIN_CACHE.get(cacheKey);
  if (hit !== undefined) return hit;
  const rng = new Rng(12345); // fixed seed: the same line always gets the same answer
  const nMy = pyRound(root.ownLibrarySize * root.ownCreatureDensity);
  const steps: OlogNode[] = [];
  for (let step = leaf.opponentStepLog; step; step = step.prev)
    steps.push(step);
  steps.reverse();

  const deal = (zero: boolean): boolean => {
    const world = new World();
    world.opponentLife = root.opponentLife.slice();
    world.opponentLibrary = root.opponentLibrary.slice();
    world.opponentGraveyard = root.opponentGraveyard.slice();
    world.opponentPoison = root.opponentPoison.slice();
    world.opponentCreatureAccumulator = root.opponentLife.map(() => 0);
    world.ownLibrarySize = root.ownLibrarySize;
    world.ownCreatureAccumulator = 0;
    world.ownCreatureDensity = root.ownCreatureDensity;
    world.opponentCreatureDensity = zero ? 0 : root.opponentCreatureDensity;
    world.rng = rng;
    world.deck = root.opponentLibrary.map(
      (librarySize) =>
        [
          librarySize,
          zero ? 0 : pyRound(librarySize * root.opponentCreatureDensity),
        ] as [number, number],
    );
    world.deck.push([root.ownLibrarySize, zero ? 0 : nMy]);
    for (const step of steps) {
      if (world.hasWon()) break;
      world.guildmageActivations = step.gmAct;
      world.hasMindcrank = step.crank;
      world.hasKonrad = step.konrad;
      world.hasMindskinner = step.skinner;
      world.applyOpponentStep(step.opponentStep);
    }
    return world.hasWon();
  };

  // more creatures milled never hurts, so a line that wins with none at all always wins (e.g. Mindskinner)
  if (deal(true)) {
    CHAIN_CACHE.set(cacheKey, 1);
    return 1;
  }
  let wins = 0,
    done = 0;
  for (const nTotal of [40, 100, CHAIN_N]) {
    // stop as soon as the answer is clear
    while (done < nTotal) {
      if (deal(false)) wins++;
      done++;
    }
    if (wins / done < CHAIN_MIN - 0.15 || wins / done >= 0.98) break;
  }
  const probability = wins / done;
  if (CHAIN_CACHE.size > 100000) CHAIN_CACHE.clear();
  CHAIN_CACHE.set(cacheKey, probability);
  return probability;
}
