/**
 * Instant speed on the opponents' turns. Off unless a deck's config sets `opponents_end_step: true`, so the other decks
 * play as before.
 *
 * One window per round: the end step of the player just before us (in a goldfish game after our own turn; in a pod the
 * pod calls it after that player's turn). We use the lands and rocks still untapped from our turn, which untap right
 * after. The deck says what it would cast there (`opponentsEndStepCandidates`): instants, and sorceries when something
 * gives them flash. No kill is looked for in the window: a combo goes off on our own turn, with the new untap and draw.
 *
 * Flash for sorceries (rule 702.8): Wizards of Thay, Leyline of Anticipation and Vedalken Orrery while on the
 * battlefield; for one turn Borne Upon a Wind, and the next sorcery after Quicken; Emergence Zone ({1}, {T}, sacrifice
 * it) for one turn. A deck with the window on also starts with Leyline of Anticipation from its opening hand on the
 * battlefield (its own text); Azula plays the Leyline without that for now, so her results stay as they were.
 */
import * as C from '../cards/cards';
import { CardDef, Cost } from '../cards/cards';
import { SORCERY_FLASH_PERMANENTS } from '../cards/card-facts';
import type { GameCore } from './game-core';
import { Permanent, emptyPool } from './game-types';

export const QUICKEN = 'Quicken';
export const BORNE_UPON_A_WIND = 'Borne Upon a Wind';
export const EMERGENCE_ZONE = 'Emergence Zone';
const LEYLINE_OF_ANTICIPATION = 'Leyline of Anticipation';
/** Emergence Zone's cost: {1}, and the Zone itself taps for the ability instead of for mana. */
const EMERGENCE_ZONE_COST = new Cost(2);

/** Does this deck play the window on the opponents' turns? */
export function usesOpponentsEndStep(game: GameCore<unknown>): boolean {
  return game.config.opponents_end_step === true;
}

/** May we cast a sorcery now? Always on our own turn; on the opponents' turns only with flash. */
export function canCastSorceriesNow(game: GameCore<unknown>): boolean {
  return (
    !game.isInOpponentsTurn ||
    game.sorceriesHaveFlashThisTurn ||
    game.nextSorceryHasFlash ||
    game.battlefield.some((permanent) =>
      SORCERY_FLASH_PERMANENTS.has(permanent.card.name),
    )
  );
}

/** What it costs to be allowed to cast a sorcery now: nothing when we may already, otherwise the cheapest flash
 *  enabler we have. Null when there is none. */
export function sorceryFlashCost(game: GameCore<unknown>): Cost | null {
  if (canCastSorceriesNow(game)) return new Cost();
  const options = flashEnablers(game).map((enabler) => enabler.cost);
  if (!options.length) return null;
  return options.reduce((cheapest, cost) =>
    cost.manaValue < cheapest.manaValue ? cost : cheapest,
  );
}

/** Use the cheapest flash enabler we can pay for, keeping the sources the sorcery needs for its coloured mana out of
 *  that payment (the greedy payment would otherwise spend a Swamp on Borne Upon a Wind's {1}). False if none was used. */
export function gainSorceryFlash(
  game: GameCore<unknown>,
  sorceryCost: Cost,
): boolean {
  if (canCastSorceriesNow(game)) return true;
  const enablers = flashEnablers(game).sort(
    (first, second) => first.cost.manaValue - second.cost.manaValue,
  );
  const keptSources = sourcesForColouredMana(game, sorceryCost);
  for (const source of keptSources) source.tapped = true;
  let isGained = false;
  for (const enabler of enablers)
    if (enabler.use()) {
      isGained = true;
      break;
    }
  for (const source of keptSources) source.tapped = false;
  return isGained;
}

/** One untapped source for each coloured pip of a cost: a source of only that colour first, then one of two colours. */
function sourcesForColouredMana(
  game: GameCore<unknown>,
  cost: Cost,
): Permanent[] {
  const kept: Permanent[] = [];
  const pips: [string, number][] = [
    ['W', cost.white],
    ['U', cost.blue],
    ['B', cost.black],
    ['R', cost.red],
    ['G', cost.green],
  ];
  const kindOf = (permanent: Permanent) => game.manaSourceKind(permanent) ?? '';
  for (const [colour, count] of pips)
    for (let i = 0; i < count; i++) {
      const free = game.battlefield.filter(
        (permanent) => !permanent.tapped && !kept.includes(permanent),
      );
      const source =
        free.find((permanent) => kindOf(permanent) === colour) ??
        free.find((permanent) => {
          const kind = kindOf(permanent);
          return (
            kind === 'A' || (/^[WUBRG]{2}$/.test(kind) && kind.includes(colour))
          );
        });
      if (source) kept.push(source);
    }
  return kept;
}

interface FlashEnabler {
  cost: Cost;
  use: () => boolean;
}

/** The flash enablers we could use now: Quicken or Borne Upon a Wind in hand, an untapped Emergence Zone. */
function flashEnablers(game: GameCore<unknown>): FlashEnabler[] {
  const enablers: FlashEnabler[] = [];
  for (const name of [QUICKEN, BORNE_UPON_A_WIND]) {
    const card = game.hand.find((handCard) => handCard.name === name);
    if (card)
      enablers.push({
        cost: game.effectiveCost(card),
        use: () => game.castInstantOrSorcery(card),
      });
  }
  const zone = game.battlefield.find(
    (permanent) => permanent.card.name === EMERGENCE_ZONE && !permanent.tapped,
  );
  if (zone)
    enablers.push({
      cost: EMERGENCE_ZONE_COST,
      use: () => {
        zone.tapped = true; // {T} is part of the cost, so the Zone can't pay the {1}
        if (!game.pay(new Cost(1))) {
          zone.tapped = false;
          return false;
        }
        game.say('activate', zone.card, ': spells have flash this turn');
        game.sacrifice(zone);
        game.sorceriesHaveFlashThisTurn = true;
        return true;
      },
    });
  return enablers;
}

/** Quicken and Borne Upon a Wind resolve. Returns false for any other card. */
export function resolveFlashSpell(
  game: GameCore<unknown>,
  card: CardDef,
): boolean {
  if (card.name === QUICKEN) {
    game.nextSorceryHasFlash = true;
    game.draw(1);
    return true;
  }
  if (card.name === BORNE_UPON_A_WIND) {
    game.sorceriesHaveFlashThisTurn = true;
    game.draw(1);
    return true;
  }
  return false;
}

/** The window: cast what the deck wants at instant speed with the mana left from our turn, best first. */
export function playOpponentsEndStep(game: GameCore<unknown>): void {
  if (!usesOpponentsEndStep(game) || game.turn === 0) return;
  game.isInOpponentsTurn = true;
  game.say("end of the opponents' turns: instant speed");
  for (let step = 0; step < 20; step++) {
    const affordable = game
      .opponentsEndStepCandidates()
      .filter(
        (candidate) =>
          candidate.score > 0 &&
          game.canPay(candidate.cost, candidate.isInstantOrSorcery),
      );
    if (!affordable.length) break;
    const best = affordable.reduce((top, candidate) =>
      candidate.score > top.score ? candidate : top,
    );
    if (best.action() === false) break;
    game.opponentsEndStepCasts += 1;
  }
  game.isInOpponentsTurn = false;
  game.pool = emptyPool(); // mana made in the window is gone before our untap
}

/** Leyline of Anticipation in the opening hand starts on the battlefield (with the window on). */
export function putOpeningHandLeylineOntoBattlefield(
  game: GameCore<unknown>,
): void {
  if (!usesOpponentsEndStep(game)) return;
  const leyline = game.hand.find(
    (card) => card.name === LEYLINE_OF_ANTICIPATION,
  );
  if (!leyline) return;
  game.takeCard(leyline, 'hand');
  game.enter(leyline, 'hand');
  game.say('Leyline of Anticipation starts on the battlefield');
}

C.registerKnown([QUICKEN, BORNE_UPON_A_WIND]);
