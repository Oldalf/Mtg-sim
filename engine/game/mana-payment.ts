/**
 * Mana and paying for things: what a mana source makes, what the pool is still short of, which source to tap next,
 * tapping it, and paying a cost (rules 601.2g-h and 605: mana abilities are activated while paying, the pool pays).
 * GameCore's manaSourceKind, short, tap and pay call these; a deck that overrides one of those methods still runs
 * where it did, because everything here calls the game's methods (game.tap, game.manaSourceKind), not its own.
 *
 * The greedy order comes first (the best source for what the pool is short of); when it fails while the untapped
 * sources could pay at all, payment-search.ts tries other sources and colours.
 */
import * as C from '../cards/cards';
import * as Facts from '../cards/card-facts';
import { Cost } from '../cards/cards';
import { ELDRAZI_SPAWN, TREASURE } from '../cards/tokens';
import type { GameCore } from './game-core';
import { ManaPool, Permanent } from './game-types';
import { isSourceOfClass } from './search-mana';
import {
  couldOtherOrderHelp,
  couldPayAtAll,
  manaAdded,
  payBySearch,
} from './payment-search';

export const COLOURS: readonly string[] = ['W', 'U', 'B', 'R', 'G'];

/** Which mana source to tap first for what we're short of (a colour, H = hybrid, N = generic). */
const RANK: Record<string, Record<string, number>> = {
  U: { U: 0, UB: 1, A: 2, F: 3, FGU: 3 },
  B: { B: 0, UB: 1, A: 2, F: 3 },
  W: { W: 0, A: 2 },
  R: { R: 0, A: 2 },
  G: { G: 0, A: 2, FGU: 3 },
  H: { U: 0, B: 0, UB: 1, A: 2, F: 3 },
  N: {
    S: 0,
    C2: 1,
    C: 2,
    B: 3,
    U: 4,
    G: 4,
    W: 4,
    R: 4,
    UB: 5,
    A: 6,
    F: 7,
    FGU: 7,
  },
};

/** Ranks for source kinds not in RANK: a two-colour land ("G/W"), n colourless ("C3"), {G}{U} ("GU"). */
function extraRank(short: string, sourceKind: string): number | null {
  if (sourceKind.length === 3 && sourceKind[1] === '/') {
    if (short === 'N') return 5.5;
    if (short === 'H')
      return sourceKind.includes('U') || sourceKind.includes('B') ? 1.5 : null;
    return sourceKind.includes(short) ? 1 : null;
  }
  if (/^[WUBRG](\/[WUBRG]){2}$/.test(sourceKind)) {
    // a three-colour land ("W/U/B")
    if (short === 'N') return 5.6;
    if (short === 'H')
      return sourceKind.includes('U') || sourceKind.includes('B') ? 1.6 : null;
    return sourceKind.includes(short) ? 1.2 : null;
  }
  if (/^C\d+$/.test(sourceKind)) return short === 'N' ? 0.5 : null;
  if (sourceKind === 'GU')
    return short === 'G' || short === 'U' ? 1 : short === 'N' ? 5 : null; // Simic Growth Chamber: both
  return null;
}

/** What kind of mana a permanent makes (see GameCore.manaSourceKind), or null if it makes none now. */
export function manaSourceKindOf(
  game: GameCore,
  permanent: Permanent,
  ignoreSick: boolean,
  ignoreEnergybending: boolean,
): string | null {
  if (permanent.card === TREASURE)
    return game.isKeepingExpendableManaBack ? null : 'A';
  if (permanent.card === ELDRAZI_SPAWN)
    return game.isKeepingExpendableManaBack ? null : 'C';
  if (permanent.land !== null) {
    // Energybending: every land is also an Island and a Swamp, so it taps for either colour
    if (
      game.isEnergybendingActive &&
      !ignoreEnergybending &&
      permanent.land.mana
    )
      return 'A';
    // "Activate only if you control a Swamp" (Tainted Wood): colourless without one
    const need = permanent.land.colourIf;
    if (
      need &&
      !game.battlefield.some(
        (otherPermanent) =>
          otherPermanent !== permanent &&
          otherPermanent.land !== null &&
          (otherPermanent.land as unknown as Record<string, boolean>)[need],
      )
    )
      return 'C';
    const landMana = permanent.land.mana;
    if (landMana.length === 3 && landMana[1] === '/')
      return game.colors.length <= 2 ? 'A' : landMana; // a two-colour land
    return landMana || null;
  }
  if (permanent.card.name === "Sarevok's Tome" && game.hasInitiative)
    return 'C2';
  if (permanent.card.rock) return permanent.card.rock;
  if (
    permanent.card.name === 'Curious Homunculus' &&
    !permanent.transformed &&
    (ignoreSick || !permanent.sick)
  )
    return 'S';
  const manaCreatureKind = Facts.MANA_CREATURES[permanent.card.name];
  if (manaCreatureKind && (ignoreSick || !permanent.sick))
    return manaCreatureKind;
  return null;
}

/** What the pool is still short of to pay cost (null = enough). With mutate, pays it. */
export function whatPoolIsShortOf(
  game: GameCore,
  cost: Cost,
  isInstantOrSorcery: boolean,
  mutate: boolean,
): string | null {
  const poolLeft = mutate ? game.pool : { ...game.pool };
  if (poolLeft.U < cost.blue) return 'U';
  poolLeft.U -= cost.blue;
  if (poolLeft.B < cost.black) return 'B';
  poolLeft.B -= cost.black;
  if (poolLeft.G < cost.green) return 'G';
  poolLeft.G -= cost.green;
  if (poolLeft.W < cost.white) return 'W';
  poolLeft.W -= cost.white;
  if (poolLeft.R < cost.red) return 'R';
  poolLeft.R -= cost.red;
  for (let hybridPip = 0; hybridPip < cost.hybrid; hybridPip++) {
    if (poolLeft.U >= poolLeft.B && poolLeft.U > 0) poolLeft.U -= 1;
    else if (poolLeft.B > 0) poolLeft.B -= 1;
    else return 'H';
  }
  let genericLeft = cost.generic;
  const order: (keyof ManaPool)[] = [
    ...(isInstantOrSorcery ? ['S' as const] : []),
    'C',
    ...(poolLeft.B >= poolLeft.U
      ? (['B', 'U'] as const)
      : (['U', 'B'] as const)),
    'G',
    'W',
    'R',
  ];
  for (const manaType of order) {
    const spent = Math.min(poolLeft[manaType], genericLeft);
    poolLeft[manaType] -= spent;
    genericLeft -= spent;
  }
  return genericLeft > 0 ? 'N' : null;
}

/** While a kill line is played (kill-line.ts): how much later than its rank a source is tapped. A source the deck
 *  keeps back (avoidsSource) comes last; with one of the shuffled tapping orders (after the deck's own) each source
 *  gets a fixed small change (0 to 4), the same for the same order, source and need. */
function killLineRankChange(
  game: GameCore,
  permanent: Permanent,
  short: string,
): number {
  let change = game.avoidsSource(permanent) ? 10 : 0;
  const shuffledOrder =
    game.killLineTappingOrder - game.killLineTappingOrders() + 1;
  if (shuffledOrder > 0) {
    const sourceIndex = game.battlefield.indexOf(permanent);
    const hash =
      (shuffledOrder * 7919 + sourceIndex * 104729 + short.charCodeAt(0) * 31) %
      1000;
    change += hash / 250;
  }
  return change;
}

/** The untapped source to tap next for what the pool is short of (the lowest rank), or null. */
function pickSource(
  game: GameCore,
  short: string,
  isInstantOrSorcery: boolean,
): Permanent | null {
  const rank = RANK[short];
  let best: Permanent | null = null,
    bestRank = 99;
  // what can feed a filter source: not the colour we are short of (it would only trade it for itself)
  const feed =
    game.pool.C +
    (short === 'U' ? 0 : game.pool.U) +
    (short === 'B' ? 0 : game.pool.B) +
    (short === 'G' ? 0 : game.pool.G);
  for (const permanent of game.battlefield) {
    if (permanent.tapped) continue;
    const sourceKind = game.manaSourceKind(permanent);
    if (sourceKind === null) continue;
    if (!(sourceKind in rank)) {
      let fallbackRank = extraRank(short, sourceKind);
      if (fallbackRank === null) continue;
      if (game.isPlayingKillLine)
        fallbackRank += killLineRankChange(game, permanent, short);
      if (fallbackRank < bestRank) {
        best = permanent;
        bestRank = fallbackRank;
      }
      continue;
    }
    if (sourceKind === 'S' && !isInstantOrSorcery) continue;
    if (Facts.isFilterKind(sourceKind) && feed < 1) continue;
    let adjustedRank = game.rankAdjust(short, sourceKind, rank[sourceKind]);
    if (game.isPlayingKillLine)
      adjustedRank += killLineRankChange(game, permanent, short);
    if (
      game.highTidesThisTurn &&
      game.islandTyped(permanent) &&
      (short === 'U' || short === 'N' || short === 'H')
    )
      adjustedRank -= 0.5;
    if (adjustedRank < bestRank) {
      best = permanent;
      bestRank = adjustedRank;
    }
  }
  return best;
}

/** A pain land: the colour we need costs 1 life, {C} (for generic costs) is free. The engine taps lands to test a
 *  payment and then undoes it, so the damage is only counted here (painTaps) and dealt when pay() commits. */
function tapPainLand(
  game: GameCore,
  permanent: Permanent,
  short: string,
): void {
  permanent.tapped = true;
  const land = permanent.land!;
  const pain = land.pain ?? '';
  const makes = (colour: string) => C.landMakes(permanent.card, colour);
  let colour: string | null = null;
  if (COLOURS.includes(short) && makes(short)) colour = short;
  else if (short === 'H') colour = ['U', 'B'].find(makes) ?? null;
  else {
    // a generic cost: colourless if the land can, else a colour that costs no life, else any
    if (land.colourless) {
      game.pool.C += 1;
      return;
    }
    colour =
      game.colors.find((colour) => makes(colour) && !pain.includes(colour)) ??
      game.colors.find(makes) ??
      null;
  }
  if (colour === null) {
    game.pool.C += 1;
    return;
  }
  game.pool[colour as keyof ManaPool] += 1;
  if (pain.includes(colour)) game.painTaps += 1;
}

/** Taps a source for the mana we are short of and adds it to the pool (see GameCore.tap). */
export function tapForMana(
  game: GameCore,
  permanent: Permanent,
  short: string,
): void {
  if (permanent.land?.pain) {
    tapPainLand(game, permanent, short);
    addLandTypeBonus(game, permanent); // (an Island or Swamp only under Energybending)
    return;
  }
  const sourceKind = game.manaSourceKind(permanent);
  permanent.tapped = true;
  const pool = game.pool;
  if (sourceKind === 'U') pool.U += 1;
  else if (sourceKind === 'B') pool.B += 1;
  else if (sourceKind === 'G') pool.G += 1;
  else if (sourceKind === 'W') pool.W += 1;
  else if (sourceKind === 'R') pool.R += 1;
  else if (sourceKind === 'A') {
    // either of the deck's colours: the one we're short of; for generic, black if the deck plays it
    if (COLOURS.includes(short)) pool[short as keyof ManaPool] += 1;
    else if (short === 'N')
      pool[
        (game.colors.includes('B') ? 'B' : game.colors[0]) as keyof ManaPool
      ] += 1;
    else
      pool[
        (game.colors.includes('U') ? 'U' : game.colors[0]) as keyof ManaPool
      ] += 1;
  } else if (sourceKind === 'UB') {
    pool.U += 1;
    pool.B += 1;
  } else if (sourceKind === 'GU') {
    pool.G += 1;
    pool.U += 1;
  } else if (sourceKind === 'C') pool.C += 1;
  else if (sourceKind === 'C2') pool.C += 2;
  else if (sourceKind !== null && /^C\d+$/.test(sourceKind))
    pool.C += parseInt(sourceKind.slice(1), 10);
  else if (sourceKind !== null && sourceKind.includes('/')) {
    // a two- or three-colour land ("G/W", "W/U/B"): the colour we're short of if it makes it, else its first colour
    const colour =
      sourceKind.includes(short) && COLOURS.includes(short)
        ? short
        : short === 'H' && sourceKind.includes('B')
          ? 'B'
          : sourceKind[0];
    pool[colour as keyof ManaPool] += 1;
  } else if (sourceKind === 'S') pool.S += 1;
  else if (sourceKind !== null && Facts.isFilterKind(sourceKind)) {
    // it is fed a mana from the pool: colourless first, never the colour we are short of if another will do
    const [firstColour, secondColour] = Facts.FILTER_COLOURS[sourceKind];
    const feedOrder =
      short === secondColour
        ? (['C', firstColour, secondColour] as const)
        : (['C', secondColour, firstColour] as const);
    for (const manaType of feedOrder)
      if (pool[manaType as keyof ManaPool] > 0) {
        pool[manaType as keyof ManaPool] -= 1;
        break;
      }
    pool[firstColour as keyof ManaPool] += 1;
    pool[secondColour as keyof ManaPool] += 1;
  }
  addLandTypeBonus(game, permanent);
}

/** High Tide's {U} for a tapped Island and Bubbling Muck's {B} for a tapped Swamp. */
function addLandTypeBonus(game: GameCore, permanent: Permanent): void {
  if (permanent.land === null) return;
  if (game.highTidesThisTurn && game.islandTyped(permanent))
    game.pool.U += game.highTidesThisTurn;
  if (game.muck && game.swampTyped(permanent)) game.pool.B += game.muck;
}

/** Pays a cost (payFromSources). Treasures and Eldrazi Spawn are spent last: only when lands, rocks and mana
 *  creatures are not enough. A committed payment sacrifices the ones it tapped; a tested one keeps them. */
export function payCost(
  game: GameCore,
  cost: Cost,
  isInstantOrSorcery: boolean,
  commit: boolean,
): boolean {
  if (
    game.isKeepingExpendableManaBack ||
    !game.battlefield.some(
      (permanent) =>
        !permanent.tapped && game.isExpendableManaSource(permanent),
    )
  )
    return payFromSources(game, cost, isInstantOrSorcery, commit);
  const plannedPaymentsBefore = game.plannedPayments.slice();
  const isPaidWithoutThem = game.withoutExpendableMana(() =>
    payFromSources(game, cost, isInstantOrSorcery, commit),
  );
  if (isPaidWithoutThem) return true;
  game.plannedPayments = plannedPaymentsBefore; // the failed try used up this cost's plan
  const untappedBefore = game.battlefield.filter(
    (permanent) => !permanent.tapped && game.isExpendableManaSource(permanent),
  );
  if (!payFromSources(game, cost, isInstantOrSorcery, commit)) return false;
  if (commit)
    for (const source of untappedBefore)
      if (source.tapped) game.sacrifice(source);
  return true;
}

/** Pays a cost: taps sources one by one into the pool (rules 601.2g-h, 605), then pays from the pool. The greedy
 *  order comes first (the best source for what we are short of); if it fails while the sources could pay at all,
 *  payment-search.ts tries other orders and colours. commit = false only tests it (everything is undone). */
function payFromSources(
  game: GameCore,
  cost: Cost,
  isInstantOrSorcery: boolean,
  commit: boolean,
): boolean {
  // undo = untap what this payment tapped and restore the pool (cheaper than a snapshot of a big board)
  const poolBefore = { ...game.pool };
  const tapped: Permanent[] = [];
  const made: string[] = [];
  const undo = () => {
    game.pool = poolBefore;
    for (const permanent of tapped) permanent.tapped = false;
    tapped.length = 0;
    made.length = 0;
    game.painTaps = 0;
  };
  game.painTaps = 0;
  const shortAtTheEnd = payGreedily(
    game,
    cost,
    isInstantOrSorcery,
    tapped,
    made,
    commit,
  );
  let isPaid = shortAtTheEnd === null;
  // Another order can only help when a source the greedy order tapped could have made the colour still missing
  // (short of generic mana, it has tapped every source it could).
  if (
    !isPaid &&
    shortAtTheEnd !== 'N' &&
    couldOtherOrderHelp(game, tapped, shortAtTheEnd!)
  ) {
    undo();
    game.pool = { ...poolBefore }; // the search changes the pool: keep poolBefore as it was
    isPaid =
      couldPayAtAll(game, cost, isInstantOrSorcery) &&
      payBySearch(game, cost, isInstantOrSorcery, tapped, made);
  }
  if (!isPaid) {
    undo();
    return false;
  }
  game.short(cost, isInstantOrSorcery, true);
  if (!commit) undo();
  else {
    game.spent += cost.manaValue;
    if (game.painTaps) game.loseLife(game.painTaps);
    game.lastPayment = tapped.map((source, i) => ({
      source,
      made: made[i],
    }));
    if (game.verbose)
      for (const part of game.lastPayment)
        game.paymentsForLog.push({
          card: part.source.card.logName,
          made: part.made,
        });
  }
  game.painTaps = 0;
  return true;
}

/** The greedy order: tap the best source for what we are short of until the pool holds the cost. Returns null when
 *  it does, else what it is still short of. What each source made is only noted for a payment that commits (the
 *  log reads it). */
function payGreedily(
  game: GameCore,
  cost: Cost,
  isInstantOrSorcery: boolean,
  tapped: Permanent[],
  made: string[],
  commit: boolean,
): string | null {
  const plannedTaps = commit ? tapsPlannedFor(game, cost) : [];
  for (;;) {
    const short = game.short(cost, isInstantOrSorcery);
    // every source the search tapped is tapped, also when the cost is paid already: what it made more floats
    if (short === null && !plannedTaps.some((tap) => !tap.source.tapped))
      return null;
    let plannedTap: PlannedTap | undefined;
    while (plannedTaps.length && !plannedTap) {
      const candidate = plannedTaps.shift()!;
      if (!candidate.source.tapped) plannedTap = candidate;
    }
    const shortOrGeneric = short ?? 'N'; // (paid already: only planned sources are left to tap)
    const source =
      plannedTap?.source ??
      pickSource(game, shortOrGeneric, isInstantOrSorcery) ??
      filterSignetFeeder(game, shortOrGeneric, isInstantOrSorcery);
    if (source === null) return shortOrGeneric;
    // a planned flexible source makes the colour the search counted
    const colourToMake = plannedTap?.colour || shortOrGeneric;
    if (commit) {
      const poolBefore = { ...game.pool };
      game.tap(source, colourToMake);
      made.push(manaAdded(poolBefore, game.pool));
    } else game.tap(source, colourToMake);
    tapped.push(source);
  }
}

/** A source a search tapped for a payment, and the colour it made there ('' = no choice, see PaymentRecord). */
interface PlannedTap {
  source: Permanent;
  colour: string;
}

/** A search that planned this payment (a kill line it paid for) names the sources to tap first
 *  (GameCore.plannedPayments). Only the greedy order uses them; what is still short is paid the usual way. */
function tapsPlannedFor(game: GameCore, cost: Cost): PlannedTap[] {
  const index = game.plannedPayments.findIndex(
    (payment) => payment.cost === `${cost}`,
  );
  if (index < 0) return [];
  const [payment] = game.plannedPayments.splice(index, 1);
  const plannedTaps: PlannedTap[] = [];
  payment.taps.forEach((landClass, tapIndex) => {
    const source = game.battlefield.find(
      (permanent) =>
        !permanent.tapped &&
        !plannedTaps.some((plannedTap) => plannedTap.source === permanent) &&
        isSourceOfClass(game, permanent, landClass),
    );
    if (source)
      plannedTaps.push({ source, colour: payment.colours?.[tapIndex] ?? '' });
  });
  // a filter is tapped last, so the others' mana is in the pool to feed it (the search may have fed it from
  // mana it had floating)
  const isFilter = (plannedTap: PlannedTap) =>
    Facts.isFilterKind(game.manaSourceKind(plannedTap.source, false, true));
  return [
    ...plannedTaps.filter((plannedTap) => !isFilter(plannedTap)),
    ...plannedTaps.filter(isFilter),
  ];
}

/** Nothing can make what we are short of, but an untapped filter Signet could (it turns {1} into {U}{B}) if a mana
 *  were in the pool to feed it: the source to tap for that mana (as for a generic cost), or null. */
function filterSignetFeeder(
  game: GameCore,
  short: string,
  isInstantOrSorcery: boolean,
): Permanent | null {
  if (!['U', 'B', 'G', 'H', 'N'].includes(short)) return null;
  const canMakeShort = (kind: string) =>
    short === 'H' || short === 'N'
      ? kind === 'F'
      : Facts.FILTER_COLOURS[kind].includes(short);
  const hasUntappedFilterSignet = game.battlefield.some((permanent) => {
    const kind = game.manaSourceKind(permanent);
    return (
      !permanent.tapped &&
      kind !== null &&
      Facts.isFilterKind(kind) &&
      canMakeShort(kind)
    );
  });
  return hasUntappedFilterSignet
    ? pickSource(game, 'N', isInstantOrSorcery)
    : null;
}
