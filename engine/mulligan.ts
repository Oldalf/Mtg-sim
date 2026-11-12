/**
 * Mulligan rules: which opening hands a deck keeps. A rule is plain data, so it is easy to read and to change.
 *
 * Mulligans in the pod: the first one is free (a new 7), then London (draw 7, bottom the extras):
 *   attempt 0: the first 7        attempt 1: a new 7 (the free mulligan)
 *   attempt 2: 7 cards, keep 6    attempt 3: 7 cards, keep 5 (always kept)
 * `keep[i]` lists the ways to keep attempt i; the last list is used for every later attempt, so a short rule
 * can be loosened by giving fewer lists. A hand is kept if ANY clause of its list matches.
 *
 * A clause:   { lands: [min, max], need: ["G", "ramp"] }
 *   lands  how many lands the hand has (modal double-faced lands count)
 *   need   every item must hold (default none). An item is
 *            "G"          at least one land that makes that colour (W, U, B, R or G; fetch lands count for all)
 *            "G>=2"       at least two of them
 *            "ramp"       at least one card of the tag called ramp (tags below)
 *            "ramp>=2"    at least two cards of that tag
 *            "cheap"      a spell costing 1-2 (built in)
 *
 * Example (a deck that needs green): keep 3-5 lands with a green source, or 2 lands with green and cheap ramp.
 *   { tags: { ramp: ["Sol Ring", "Rampant Growth"] },
 *     keep: [[{ lands: [3, 5], need: ["G"] }, { lands: [2, 2], need: ["G", "ramp"] }], [{ lands: [2, 6], need: ["G"] }]],
 *     alwaysKeep: 5 }
 */
import * as C from './cards';

export interface Clause {
  lands: [number, number];
  need?: string[];
}

export interface MulliganRule {
  /** Named groups of cards, for the "need" items. */
  tags?: Record<string, string[]>;
  /** One list of clauses per attempt (see above). */
  keep: Clause[][];
  /** A hand of this many cards or fewer is always kept (default 5). */
  alwaysKeep?: number;
}

/** What every deck did before rules existed: keep 2 to 5 lands. */
export const DEFAULT_MULLIGAN: MulliganRule = {
  keep: [[{ lands: [2, 5] }]],
  alwaysKeep: 5,
};

const isLand = (card: C.CardDef) =>
  card.land !== null || card.mdfcLand !== null;

/** Does this hand satisfy one "need" item? */
function meets(rule: MulliganRule, hand: C.CardDef[], need: string): boolean {
  const match = /^([A-Za-z0-9]+)(?:>=(\d+))?$/.exec(need);
  if (!match) throw new Error(`bad mulligan need "${need}"`);
  const min = match[2] ? parseInt(match[2], 10) : 1;
  const name = match[1];
  if (/^[WUBRG]$/.test(name))
    return hand.filter((card) => C.landMakes(card, name)).length >= min;
  if (name === 'cheap')
    return (
      hand.filter(
        (card) => !isLand(card) && card.manaValue >= 1 && card.manaValue <= 2,
      ).length >= min
    );
  const names = rule.tags?.[name];
  if (!names) throw new Error(`mulligan need "${need}": no tag called ${name}`);
  return hand.filter((card) => names.includes(card.name)).length >= min;
}

/** Keep this opening hand (attempt 0, 1, 2, ...)? */
export function keepsHand(
  rule: MulliganRule,
  attempt: number,
  hand: C.CardDef[],
): boolean {
  const clauses = rule.keep[Math.min(attempt, rule.keep.length - 1)];
  const lands = hand.filter(isLand).length;
  return clauses.some(
    (clause) =>
      lands >= clause.lands[0] &&
      lands <= clause.lands[1] &&
      (clause.need ?? []).every((need) => meets(rule, hand, need)),
  );
}
