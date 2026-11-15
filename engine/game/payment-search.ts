/**
 * When pay()'s greedy order fails (game-core.ts: tap the best source for what we are short of, again and again),
 * a cost may still be payable in another order: a dual land made the wrong colour, a filter Signet needed feeding.
 * Then, if the untapped sources could pay the cost at all (couldPayAtAll, a quick count), payBySearch tries the
 * sources one by one: which to tap, and for a source of more than one colour which colour it makes. It stops at
 * the first way that pays, and gives up after a fixed number of tries.
 */
import { Cost } from '../cards/cards';
import * as C from '../cards/cards';
import type { GameCore } from './game-core';
import { Permanent } from './game-types';

/** How many tries the search makes before it gives up. */
const SEARCH_TRIES = 2000;
const COLOURS = ['W', 'U', 'B', 'R', 'G'] as const;
type Colour = (typeof COLOURS)[number];

/** The pips of a colour in a cost. */
function pipsOf(cost: Cost, colour: Colour): number {
  return {
    W: cost.white,
    U: cost.blue,
    B: cost.black,
    R: cost.red,
    G: cost.green,
  }[colour];
}

/** The untapped sources a payment could tap (filter sources last: they need a mana from the others). */
function untappedSources(
  game: GameCore<unknown>,
  isInstantOrSorcery: boolean,
): Permanent[] {
  const sources = game.battlefield.filter((permanent) => {
    if (permanent.tapped) return false;
    const kind = game.manaSourceKind(permanent);
    return kind !== null && (kind !== 'S' || isInstantOrSorcery);
  });
  const isFilter = (permanent: Permanent) =>
    game.manaSourceKind(permanent) === 'F';
  return [
    ...sources.filter((permanent) => !isFilter(permanent)),
    ...sources.filter(isFilter),
  ];
}

/** Can this source make a mana of this colour? */
function canMake(
  game: GameCore<unknown>,
  permanent: Permanent,
  colour: Colour,
): boolean {
  const kind = game.manaSourceKind(permanent) ?? '';
  if (permanent.land?.pain) return C.landMakes(permanent.card, colour);
  if (kind === colour) return true;
  if (kind === 'A') return game.colors.includes(colour);
  if (kind === 'UB' || kind === 'F') return colour === 'U' || colour === 'B';
  if (kind === 'GU') return colour === 'G' || colour === 'U';
  return kind.includes('/') && kind.includes(colour);
}

/** How much mana a source adds when tapped (a filter source: one more than it is fed). */
function manaOf(game: GameCore<unknown>, permanent: Permanent): number {
  const kind = game.manaSourceKind(permanent) ?? '';
  let mana = 1;
  if (kind === 'C2' || kind === 'UB' || kind === 'GU') mana = 2;
  else if (/^C\d+$/.test(kind)) mana = parseInt(kind.slice(1), 10);
  if (permanent.land !== null) {
    if (game.islandTyped(permanent)) mana += game.highTidesThisTurn;
    if (game.swampTyped(permanent)) mana += game.muck;
  }
  return mana;
}

/** The greedy order ran out of a colour (or of hybrid {U/B}, "H"): another order can only help if a source it tapped
 *  for something else could have made that colour (or it tapped a filter source, which another order may feed). */
export function couldOtherOrderHelp(
  game: GameCore<unknown>,
  tapped: Permanent[],
  short: string,
): boolean {
  const colours: Colour[] =
    short === 'H' ? ['U', 'B'] : COLOURS.filter((colour) => colour === short);
  return tapped.some(
    (source) =>
      game.manaSourceKind(source) === 'F' ||
      colours.some((colour) => canMake(game, source, colour)),
  );
}

/** A quick count: is there enough mana in the pool and the untapped sources, in all and of each colour? */
export function couldPayAtAll(
  game: GameCore<unknown>,
  cost: Cost,
  isInstantOrSorcery: boolean,
): boolean {
  const sources = untappedSources(game, isInstantOrSorcery);
  const pool = game.pool;
  let manaInAll =
    pool.U +
    pool.B +
    pool.C +
    pool.W +
    pool.R +
    pool.G +
    (isInstantOrSorcery ? pool.S : 0);
  for (const source of sources) manaInAll += manaOf(game, source);
  if (manaInAll < cost.manaValue) return false;
  for (const colour of COLOURS) {
    const pips = pipsOf(cost, colour);
    if (pips === 0) continue;
    const sourcesOfColour = sources.filter((source) =>
      canMake(game, source, colour),
    ).length;
    if (pool[colour] + sourcesOfColour < pips) return false;
  }
  return true;
}

/** Tries the untapped sources in turn until the cost can be paid from the pool. Returns true with the pool holding
 *  the mana (the cost is not yet taken out) and `tapped` / `made` naming each source tapped and what it added; or
 *  false with everything as it was. */
export function payBySearch(
  game: GameCore<unknown>,
  cost: Cost,
  isInstantOrSorcery: boolean,
  tapped: Permanent[],
  made: string[],
): boolean {
  const sources = untappedSources(game, isInstantOrSorcery);
  const neededColours = [
    ...COLOURS.filter((colour) => pipsOf(cost, colour) > 0),
    ...(cost.hybrid > 0 ? ['H'] : []),
    'N',
  ];
  let tries = 0;
  const tryFrom = (firstSource: number): boolean => {
    if (game.short(cost, isInstantOrSorcery) === null) return true;
    if (++tries > SEARCH_TRIES) return false;
    for (let index = firstSource; index < sources.length; index++) {
      const source = sources[index];
      const kind = game.manaSourceKind(source) ?? '';
      const pool = game.pool;
      if (kind === 'F' && pool.C + pool.U + pool.B < 1) continue; // nothing to feed it
      const hasChoice =
        kind === 'A' || kind.includes('/') || !!source.land?.pain;
      for (const short of hasChoice ? neededColours : ['N']) {
        const poolBefore = { ...game.pool };
        const painTapsBefore = game.painTaps;
        game.tap(source, short);
        tapped.push(source);
        made.push(manaAdded(poolBefore, game.pool));
        if (tryFrom(index + 1)) return true;
        tapped.pop();
        made.pop();
        source.tapped = false;
        game.pool = poolBefore;
        game.painTaps = painTapsBefore;
      }
    }
    return false;
  };
  return tryFrom(0);
}

/** What a tap added to the pool, as mana symbols ("U", "UB", "CC"). */
export function manaAdded(
  poolBefore: Record<string, number>,
  poolAfter: Record<string, number>,
): string {
  let symbols = '';
  for (const kind of Object.keys(poolAfter))
    symbols += kind.repeat(Math.max(0, poolAfter[kind] - poolBefore[kind]));
  return symbols;
}
