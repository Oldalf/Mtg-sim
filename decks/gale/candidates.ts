import * as Facts from '../../engine/card-facts';
import {
  COMBO_PERMS,
  COMBO_SORC,
  COMBO_SPELLS,
  GALE,
  PACKAGES,
  PERM_SCORE,
  SCION,
  SELF_COUNTER_DEV,
  permScore,
} from './roles';
import { OPPONENT_EVENT } from './kill-state';
import type { GaleGame } from './game';
import { CardDef, Cost } from '../../engine/cards';
import { Cand } from '../../engine/game-types';
import { firstMin, removeOrThrow } from '../../engine/lists';

/** Best graveyard card of the other type for Gale, given we just paid for cd. */
export function bestGaleRecastTarget(
  game: GaleGame,
  card: CardDef,
): CardDef | null {
  if (!game.onBf(GALE)) return null;
  const wantSorc = card.isInstant;
  let best: CardDef | null = null,
    bestScore = 0;
  for (const candidate of game.gy) {
    if (
      candidate === card ||
      !(wantSorc ? candidate.isSorcery : candidate.isInstant)
    )
      continue;
    const score = game.devValueIS(candidate, true);
    if (
      score > bestScore &&
      game.canPay(game.effCost(candidate, null, true), true)
    ) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

/** Everything the AI may do now, with a score each (higher first). */
export function buildCandidates(game: GaleGame, main2: boolean): Cand[] {
  const candidates: Cand[] = [];
  addCommanderCandidates(game, candidates);
  const seenNames = new Set<string>();
  for (const card of game.hand.slice()) {
    if (seenNames.has(card.name) || card.land !== null) continue;
    seenNames.add(card.name);
    if (card.isIS) addInstantOrSorceryCandidate(game, card, candidates);
    else addPermanentCandidate(game, card, candidates);
  }
  // flashback Deep Analysis
  const deepAnalysis = game.gy.find((card) => card.name === 'Deep Analysis');
  if (deepAnalysis)
    candidates.push({
      score: 44,
      cost: game.effCost(deepAnalysis, new Cost(1, 1), true),
      isIS: true,
      act: () => game.flashback(deepAnalysis),
    });
  if (game.cfg.self_counter_dev ?? true)
    candidates.push(...selfCounterDevelopmentCandidates(game));
  if (main2) candidates.push(...manaSinkCandidates(game));
  return candidates;
}

/** Casting a commander from the command zone (Gale pays the commander tax). */
function addCommanderCandidates(game: GaleGame, candidates: Cand[]): void {
  for (const commander of game.command.slice()) {
    let score = 40;
    let cost = game.effCost(commander);
    if (commander.name === GALE) {
      score = 95;
      cost = cost.withGeneric(cost.g + 2 * game.galeCasts);
    } else if (commander.name === SCION) {
      score = game.onBf(GALE) ? 91 : 18;
    }
    candidates.push({
      score,
      cost,
      isIS: false,
      act: () => game.castPerm(commander, true),
    });
  }
}

/** Casting a permanent from hand: rocks, reducers and the combo permanents. */
function addPermanentCandidate(
  game: GaleGame,
  card: CardDef,
  candidates: Cand[],
): void {
  const name = card.name;
  if (name === 'Wishclaw Talisman') {
    candidates.push({
      score: 73,
      cost: game.effCost(card).plus(new Cost(1)),
      isIS: false,
      act: () => game.wishclaw(card),
    });
    return;
  }
  let score = permScore(name, 30);
  if (COMBO_PERMS.has(name) && !game.onBf(name)) {
    const missing = missingPackagePieces(game, name);
    score = missing === 0 ? 88 : missing === 1 && game.turn >= 4 ? 78 : score;
  }
  if (card.rock && name !== 'Sol Ring' && game.manaSources() >= 7) score = 30;
  if (game.onBf(name) && name in PERM_SCORE) score = 5; // legendary / redundant
  candidates.push({
    score,
    cost: game.effCost(card),
    isIS: false,
    act: () => game.castPerm(card),
    rock: card.rock ? card : undefined,
  });
}

/** Casting an instant or sorcery from hand (with a Gale recast if one is possible). */
function addInstantOrSorceryCandidate(
  game: GaleGame,
  card: CardDef,
  candidates: Cand[],
): void {
  const name = card.name;
  const countersInHand = game.hand.filter((candidate) =>
    Facts.COUNTERS.has(candidate.name),
  ).length;
  if (name === 'Insatiable Avarice') {
    for (const [mode, extraCost, score] of [
      ['both', new Cost(2, 0, 2), 78],
      ['tutor', new Cost(2), 70],
      ['draw', new Cost(0, 0, 2), 50],
    ] as [string, Cost, number][]) {
      const baseCost = card.cost.plus(extraCost);
      candidates.push({
        score,
        cost: game.effCost(card, baseCost),
        isIS: true,
        act: () => castWithGaleRecast(game, card, baseCost, mode),
      });
    }
    return;
  }
  if (name === 'Muddle the Mixture') {
    // transmute {1}{U}{U}: discard it, find a card with mana value 2 (Guildmage, Mindcrank,
    // Cacophony, Prologue, Expansion Algorithm, ...). Keeps it as a counter when it's the only one.
    candidates.push({
      score: countersInHand >= 2 ? 72 : 60,
      cost: new Cost(1, 2),
      isIS: false,
      act: () => game.transmute(card),
    });
    return;
  }
  if (name === "Archmage's Charm") {
    if (countersInHand >= 2)
      candidates.push({
        score: 36,
        cost: game.effCost(card),
        isIS: true,
        act: () => castWithGaleRecast(game, card),
      });
    return;
  }
  if (Facts.RITUALS.has(name)) return;
  const score = game.devValueIS(card);
  if (score <= 0 && !game.onBf(GALE)) return;
  candidates.push({
    score,
    cost: game.effCost(card),
    isIS: true,
    act: () => castWithGaleRecast(game, card),
  });
}

/** Development play: cast a cheap spell, counter it with your own Offer (+2 Treasures) or Unwind
 *  (untap 3 lands). The counter is an instant, so Gale recasts a sorcery from the graveyard.
 *  Only when another counter stays in hand for protection. */
export function selfCounterDevelopmentCandidates(game: GaleGame): Cand[] {
  if (!game.onBf(GALE)) return [];
  const out: Cand[] = [];
  for (const kname of SELF_COUNTER_DEV) {
    const card = game.hand.find((candidate) => candidate.name === kname);
    if (
      !card ||
      !game.hand.some(
        (candidate) => Facts.COUNTERS.has(candidate.name) && candidate !== card,
      )
    )
      continue;
    const sorc = game.gy.filter(
      (candidate) =>
        candidate.isSorcery && game.devValueIS(candidate, true) > 0,
    );
    if (!sorc.length) continue;
    const targets = game.hand.filter(
      (candidate) =>
        candidate !== card &&
        candidate.isIS && // not a rock or other permanent
        !Facts.COUNTERS.has(candidate.name) &&
        !COMBO_SORC.has(candidate.name) &&
        !COMBO_PERMS.has(candidate.name) &&
        !COMBO_SPELLS.has(candidate.name) &&
        !Facts.TUTORS.has(candidate.name) &&
        candidate.name !== 'Jidoor, Aristocratic Capital',
    );
    if (!targets.length) continue;
    const target = firstMin(
      targets,
      (candidate) =>
        game.effCost(candidate).mv * 1000 + game.cardValue(candidate),
    );
    const gain = Math.max(
      ...sorc.map((candidate) => game.devValueIS(candidate, true)),
    );
    const score = gain - 4 - Math.floor(game.cardValue(target) / 10);
    out.push({
      score: score,
      cost: game.effCost(target).plus(game.effCost(card)),
      isIS: true,
      act: () => castSelfCounter(game, card, target),
    });
  }
  return out;
}

export function castSelfCounter(
  game: GaleGame,
  card: CardDef,
  targetCard: CardDef,
): boolean {
  const snapshot = game.snap();
  if (!(
    game.pay(game.effCost(targetCard), targetCard.isIS) &&
    game.pay(game.effCost(card), true)
  )) {
    game.restore(snapshot);
    return false;
  }
  game.restore(snapshot);
  game.pay(game.effCost(targetCard), targetCard.isIS);
  removeOrThrow(game.hand, targetCard);
  game.say('cast', targetCard, 'to counter it with your own', card);
  if (targetCard.isIS) {
    game.spellsCast += 1;
    game.onCastIS(false);
    const firstRecast = bestGaleRecastTarget(game, targetCard);
    if (firstRecast !== null) {
      const secondSnapshot = game.snap();
      if (
        game.pay(game.effCost(firstRecast, null, true), true) &&
        game.canPay(game.effCost(card), true)
      ) {
        removeOrThrow(game.gy, firstRecast);
        game.say('  Gale recasts', firstRecast);
        game.spellsCast += 1;
        game.onCastIS(true);
        game.resolve(firstRecast, true);
        game.exile.push(firstRecast);
      } else game.restore(secondSnapshot);
    }
  }
  if (!game.hand.includes(card) || !game.pay(game.effCost(card), true)) {
    // e.g. discarded by the recast
    game.gy.push(targetCard);
    return true;
  }
  removeOrThrow(game.hand, card);
  game.spellsCast += 1;
  game.onCastIS(false);
  const secondRecast = bestGaleRecastTarget(game, card);
  if (
    secondRecast !== null &&
    game.pay(game.effCost(secondRecast, null, true), true)
  ) {
    removeOrThrow(game.gy, secondRecast);
    game.say('  Gale recasts', secondRecast);
    game.spellsCast += 1;
    game.onCastIS(true);
    game.resolve(secondRecast, true);
    game.exile.push(secondRecast);
  }
  game.gy.push(targetCard, card);
  if (card.name === "An Offer You Can't Refuse") {
    game.pool.U += 1; // 2 Treasures (used this turn)
    game.pool.B += 1;
  } else game.untapLands(card.name === 'Rewind' ? 4 : 3);
  return true;
}

export function missingPackagePieces(game: GaleGame, extra: string): number {
  const have = new Set([
    ...game.hand.map((card) => card.name),
    ...game.bf.map((permanent) => permanent.cd.name),
    extra,
  ]);
  if (game.onBf(GALE))
    for (const candidate of game.gy)
      if (candidate.isIS) have.add(candidate.name);
  let fewest = Infinity;
  for (const pkg of PACKAGES) {
    if (!pkg.some((requirement) => requirement.has(extra))) continue;
    fewest = Math.min(
      fewest,
      pkg.filter((req) => ![...req].some((name) => have.has(name))).length,
    );
  }
  return fewest;
}

export function castWithGaleRecast(
  game: GaleGame,
  card: CardDef,
  base: Cost | null = null,
  mode: string | null = null,
): boolean {
  const snapshot = game.snap();
  if (!game.pay(game.effCost(card, base), true)) return false;
  const tgt = bestGaleRecastTarget(game, card);
  game.restore(snapshot);
  return game.castIS(card, false, base, mode, { galeTarget: tgt });
}

export function manaSinkCandidates(game: GaleGame): Cand[] {
  const out: Cand[] = [];
  const lands = game.landsBf().length;
  const cyc = game.hand.find(
    (card) =>
      (card.name === 'Fetid Pools' || card.name === 'Unearth') && lands >= 5,
  );
  if (cyc)
    out.push({
      score: 8,
      cost: new Cost(2),
      isIS: false,
      act: () => game.cycle(cyc),
    });
  if (game.perm('Syr Konrad, the Grim') && game.onBf(GALE))
    out.push({
      score: 6,
      cost: new Cost(1, 0, 1),
      isIS: false,
      act: () => activateKonradMill(game),
    });
  return out;
}

export function activateKonradMill(game: GaleGame): boolean {
  if (game.konradActivations >= 3 || !game.pay(new Cost(1, 0, 1))) return false;
  game.konradActivations += 1;
  const events: number[] = [];
  for (let i = 0; i < game.life.length; i++)
    events.push(OPPONENT_EVENT.MILL, i, 1);
  game.applyOpponentEvents(events);
  if (game.library.length) game.toGy(game.library.shift()!);
  return true;
}
