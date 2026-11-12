import * as Facts from '../../engine/card-facts';
import {
  COMBO_PERMS,
  COMBO_SORC,
  COMBO_SPELLS,
  GALE,
  PACKAGES,
  RAMP_PREFS,
} from './roles';
import { search } from './kills';
import { buildKillSearchState } from './snapshot';
import type { GaleGame } from './game';
import { CardDef } from '../../engine/cards';
import { firstMax, firstMin } from '../../engine/lists';

function* combinations<T>(
  items: T[],
  size: number,
  start = 0,
  acc: T[] = [],
): Generator<T[]> {
  if (acc.length === size) {
    yield acc.slice();
    return;
  }
  for (let i = start; i < items.length; i++) {
    acc.push(items[i]);
    yield* combinations(items, size, i + 1, acc);
    acc.pop();
  }
}

/** The card to tutor for: the one that makes a kill, else ramp (if the config says so), else the card that brings the
 *  closest combo package closer to done. */
export function chooseTutorTarget(
  game: GaleGame,
  allowed: (card: CardDef) => boolean,
  toTop: boolean,
  spent: string | null = null,
  rampOk = false,
): CardDef | null {
  const candidates = new Map<string, CardDef>();
  for (const card of game.library)
    if (allowed(card) && !candidates.has(card.name))
      candidates.set(card.name, card);
  if (!candidates.size) return null;
  const killingCard = findCardThatKills(game, candidates, toTop, spent);
  if (killingCard !== null) return killingCard;
  if (rampOk) {
    const rampCard = findRampTutorTarget(game, candidates);
    if (rampCard !== null) return rampCard;
  }
  return choosePackageCard(game, candidates);
}

/** Tries each combo card on a copy of the game: the card after which the kill search finds a kill (now: 1000 or 800,
 *  or next turn: 600 or 400; with counter backup scores higher). Null if no card helps. */
function findCardThatKills(
  game: GaleGame,
  candidates: Map<string, CardDef>,
  toTop: boolean,
  spent: string | null,
): CardDef | null {
  if (game.inRollout) return null; // rollouts: the quick rule instead
  const removedFromHand = spent ? [spent] : [];
  const budget = Math.floor((game.cfg.search_budget as number) / 3);
  let bestCard: CardDef | null = null;
  let bestScore = -1;
  for (const [name, card] of candidates) {
    if (!(
      COMBO_PERMS.has(name) ||
      COMBO_SPELLS.has(name) ||
      Facts.COUNTERS.has(name) ||
      COMBO_SORC.has(name) ||
      name === 'Jidoor, Aristocratic Capital'
    ))
      continue;
    let score = 0;
    if (!toTop) {
      const state = buildKillSearchState(game, false, [name], removedFromHand);
      if (game.killReachable(state)) {
        const result = search.search(state, budget);
        score = result === 2 ? 1000 : result === 1 ? 800 : 0;
      }
    }
    if (score < 800) {
      const state = buildKillSearchState(game, true, [name], removedFromHand);
      if (game.killReachable(state)) {
        const result = search.search(state, budget);
        score = Math.max(score, result === 2 ? 600 : result === 1 ? 400 : 0);
      }
    }
    if (score > bestScore) {
      bestCard = card;
      bestScore = score;
    }
  }
  return bestScore > 0 ? bestCard : null;
}

/** "Tutor for ramp, recast the tutor later with Gale for the combo": early with few mana sources. */
function findRampTutorTarget(
  game: GaleGame,
  candidates: Map<string, CardDef>,
): CardDef | null {
  if (
    !game.cfg.ramp_tutor ||
    game.turn > ((game.cfg.ramp_tutor_until as number) ?? 4) ||
    game.manaSources() >= ((game.cfg.ramp_tutor_below as number) ?? 5)
  )
    return null;
  for (const name of RAMP_PREFS)
    if (
      candidates.has(name) &&
      !game.onBf(name) &&
      !game.hand.some((card) => card.name === name)
    )
      return candidates.get(name)!;
  return null;
}

/** The card that completes the combo package closest to done; once a package is assembled: protection, then mana,
 *  then cards. */
function choosePackageCard(
  game: GaleGame,
  candidates: Map<string, CardDef>,
): CardDef | null {
  const have = new Set([
    ...game.hand.map((card) => card.name),
    ...game.bf.map((permanent) => permanent.cd.name),
  ]);
  if (game.onBf(GALE) || game.command.length)
    for (const card of game.gy) if (card.isIS) have.add(card.name);
  let bestPackage: Set<string>[] | null = null;
  let bestMissing = 99;
  let hasCompletePackage = false;
  for (const comboPackage of PACKAGES) {
    const missing = comboPackage.filter(
      (needed) => ![...needed].some((name) => have.has(name)),
    );
    if (!missing.length) {
      hasCompletePackage = true;
      continue;
    }
    const fetchable = missing.filter((needed) =>
      [...needed].some((name) => candidates.has(name)),
    );
    // prefer packages that are closer to done, and fully fetchable ones on ties
    const closeness =
      missing.length + (fetchable.length === missing.length ? 0 : 0.5);
    if (fetchable.length && closeness < bestMissing) {
      bestPackage = fetchable;
      bestMissing = closeness;
    }
  }
  if (hasCompletePackage && !game.hasCounterInHand()) bestPackage = null;
  if (bestPackage === null) {
    // a full package is already assembled: protection, then mana, then cards
    const preferred = game.hasCounterInHand()
      ? []
      : [
          'Counterspell',
          'Arcane Denial',
          'Mana Sculpt',
          "Archmage's Charm",
          'Unwind',
          "An Offer You Can't Refuse",
          'Dispel',
        ];
    preferred.push(
      'Sol Ring',
      'High Tide',
      'Dark Ritual',
      'Stock Up',
      'See the Truth',
      "Night's Whisper",
    );
    for (const name of preferred)
      if (candidates.has(name)) return candidates.get(name)!;
    return firstMax([...candidates.values()], (card) => game.cardValue(card));
  }
  const neededNames = bestPackage[0];
  const options = [...neededNames]
    .filter((name) => candidates.has(name))
    .map((name) => candidates.get(name)!);
  return firstMin(options, (card) => card.mv);
}

/** Kill-next-turn score if toHand goes to hand and toGy to the graveyard. */
export function valueOfGiftsSplit(
  game: GaleGame,
  toHand: CardDef[],
  toGy: CardDef[],
  budget: number,
): number {
  const state = buildKillSearchState(
    game,
    true,
    toHand.map((card) => card.name),
  );
  state.graveyardSpells = [
    ...state.graveyardSpells,
    ...toGy.filter((card) => card.isIS).map((card) => card.name),
  ].sort();
  state.graveyardCreatures = [
    ...state.graveyardCreatures,
    ...toGy.filter((card) => card.isCreature).map((card) => card.name),
  ].sort();
  if (!game.killReachable(state)) return 0;
  return search.search(state, budget);
}

/** The combo cards in the library, one of each name. */
function comboCardsInLibrary(game: GaleGame): CardDef[] {
  const cards = new Map<string, CardDef>();
  for (const card of game.library) {
    if (cards.has(card.name)) continue;
    if (
      COMBO_PERMS.has(card.name) ||
      COMBO_SPELLS.has(card.name) ||
      Facts.COUNTERS.has(card.name) ||
      COMBO_SORC.has(card.name)
    )
      cards.set(card.name, card);
  }
  return [...cards.values()];
}

/** The cards worth building a pile from: cards that make a kill next turn on their own (in hand or binned) first. */
function shortlistGiftsCards(
  game: GaleGame,
  comboCards: CardDef[],
  budget: number,
): CardDef[] {
  const valueAlone = (card: CardDef) =>
    Math.max(
      valueOfGiftsSplit(game, [card], [], budget),
      valueOfGiftsSplit(game, [], [card], budget),
    );
  const scored = comboCards.map((card) => ({
    card,
    killValue: valueAlone(card),
    cardValue: game.cardValue(card),
  }));
  scored.sort(
    (first, second) =>
      second.killValue - first.killValue || second.cardValue - first.cardValue,
  );
  return scored
    .slice(0, (game.cfg.gifts_shortlist as number) ?? 6)
    .map((entry) => entry.card);
}

/** valueOfGiftsSplit with a cache: the same split comes up for several piles. */
function cachedSplitValue(game: GaleGame, budget: number) {
  const cache = new Map<string, number>();
  return (handPart: CardDef[], graveyardPart: CardDef[]): number => {
    const key =
      handPart
        .map((card) => card.name)
        .sort()
        .join('|') +
      '#' +
      graveyardPart
        .map((card) => card.name)
        .sort()
        .join('|');
    let value = cache.get(key);
    if (value === undefined) {
      value = valueOfGiftsSplit(game, handPart, graveyardPart, budget);
      cache.set(key, value);
    }
    return value;
  };
}

/** Pick the pile whose WORST split (the opponent chooses) is best for us. Also considers finding
 *  only two instants/sorceries: then both go to the graveyard, where Gale can cast them.
 *  Returns [picks, binned] or null to use the simple rule. */
export function chooseGiftsPile(game: GaleGame): [CardDef[], CardDef[]] | null {
  game.everySplitWinsNextTurn = false;
  const comboCards = comboCardsInLibrary(game);
  if (comboCards.length < 2) return null;
  const budget = (game.cfg.gifts_budget as number) ?? 250;
  const shortlist = shortlistGiftsCards(game, comboCards, budget);
  const splitValue = cachedSplitValue(game, budget);
  let best: [CardDef[], CardDef[]] | null = null;
  // [value of the worst split, total of all splits]: higher is better, the worst split first
  let bestValue: [number, number] = [-1, -1];
  const isBetter = (first: [number, number], second: [number, number]) =>
    first[0] > second[0] || (first[0] === second[0] && first[1] > second[1]);
  for (const pile of combinations(shortlist, 4)) {
    let worst = 9;
    let total = 0;
    let worstGraveyardPart: CardDef[] | null = null;
    for (const graveyardPart of combinations(pile, 2)) {
      const handPart = pile.filter((card) => !graveyardPart.includes(card));
      const value = splitValue(handPart, graveyardPart);
      total += value;
      if (value < worst) {
        worst = value;
        worstGraveyardPart = graveyardPart;
      }
      if (worst < bestValue[0]) break; // this pile can no longer beat the best one: skip the rest
    }
    if (isBetter([worst, total], bestValue)) {
      best = [pile, worstGraveyardPart!];
      bestValue = [worst, total];
    }
  }
  if (game.onBf(GALE)) {
    // two instants/sorceries, both to the graveyard
    for (const pile of combinations(
      shortlist.filter((card) => card.isIS),
      2,
    )) {
      const value = splitValue([], pile);
      if (isBetter([value, value * 6], bestValue)) {
        best = [pile, pile];
        bestValue = [value, value * 6];
      }
    }
  }
  if (best === null || bestValue[0] === 0)
    return best === null || bestValue[1] === 0 ? null : best;
  game.everySplitWinsNextTurn = true;
  return best;
}
