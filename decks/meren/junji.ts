/**
 * Junji, the Midnight Sky dies: choose one (Pontus, 2026-11-23: its value is in the choice, so weigh both modes).
 *   - Each opponent discards two cards and loses 2 life.
 *   - Put target non-Dragon creature card from a graveyard (ours, or in a pod an opponent's) onto the battlefield
 *     under our control. We lose 2 life.
 * Both are scored in battlefield-value points (cards.ts VALUE) and the higher one is taken.
 */
import { ENTER_AGAIN } from './cards';
import type { MerenGame } from './game';
import { CardDef, hasCreatureType } from '../../engine/cards/cards';
import { firstMax } from '../../engine/util/lists';

export const JUNJI = 'Junji, the Midnight Sky';

/** One life an opponent loses to the discard mode: 2 life from each of 3 opponents is 60, the creature value the old
 *  fixed rule asked for before it reanimated. */
const OPPONENT_LIFE_WORTH = 10;
/** One card an opponent discards: it slows the table (a pod only; goldfish opponents hold no cards). */
const OPPONENT_CARD_WORTH = 8;
/** The 2 life the discard mode takes is the last 2 an opponent has. */
const OPPONENT_KILL_WORTH = 50;
/** The returned creature's enter trigger happens again (Gray Merchant's drain, Grave Titan's Zombies...). */
const ENTER_TRIGGER_WORTH = 15;
/** Twilight Diviner copies the returned creature: it is worth this much more. */
const DIVINER_COPY_FACTOR = 1.5;
/** At this life or less, the 2 life the creature mode costs us matter. */
const LOW_LIFE = 10;
const LOW_LIFE_COST = 40;

/** A creature card Junji can return: from our graveyard (slot null) or an opponent's (a pod). */
export interface JunjiTarget {
  card: CardDef;
  slot: number | null;
  worth: number;
}

/** What the returned creature is worth to us now. */
export function junjiTargetWorth(game: MerenGame, card: CardDef): number {
  const isOurs = !game.inArena() || game.graveyard.includes(card);
  let worth = game.battlefieldValue(card);
  if (isOurs && ENTER_AGAIN.has(card.name)) worth += ENTER_TRIGGER_WORTH;
  if (game.isOnBattlefield('Twilight Diviner') && !game.divinerUsed)
    worth *= DIVINER_COPY_FACTOR;
  if (game.myLife <= LOW_LIFE) worth -= LOW_LIFE_COST;
  return worth;
}

/** The best creature card Junji can return now, or null when no graveyard has one. */
export function bestJunjiTarget(game: MerenGame): JunjiTarget | null {
  const targets: JunjiTarget[] = game.graveyard
    .filter((card) => card.isCreature && !hasCreatureType(card, 'Dragon'))
    .map((card) => ({
      card,
      slot: null,
      worth: junjiTargetWorth(game, card),
    }));
  if (game.inArena()) {
    const arena = game.arena!;
    for (const slot of livingOpponentSlots(game))
      for (const card of arena.creatureCardsOfGraveyard(game, slot))
        if (!hasCreatureType(card, 'Dragon'))
          targets.push({ card, slot, worth: junjiTargetWorth(game, card) });
  }
  return targets.length ? firstMax(targets, (target) => target.worth) : null;
}

/** What the discard mode is worth: each opponent's 2 life (more if it kills), and in a pod the cards discarded. */
export function junjiDiscardWorth(game: MerenGame): number {
  let worth = 0;
  for (const slot of livingOpponentSlots(game)) {
    const life = game.life[slot];
    worth += OPPONENT_LIFE_WORTH * Math.min(2, life);
    if (life <= 2) worth += OPPONENT_KILL_WORTH;
    if (game.inArena())
      worth +=
        OPPONENT_CARD_WORTH * Math.min(2, game.arena!.handSize(game, slot));
  }
  return worth;
}

/** Junji died: take the mode worth more. */
export function resolveJunjiDeath(game: MerenGame): void {
  const target = bestJunjiTarget(game);
  if (target && target.worth >= junjiDiscardWorth(game)) {
    game.say(`  Junji returns`, target.card);
    if (target.slot === null) game.reanimate(target.card);
    else game.stealCreatureCard(target.slot, target.card);
    game.loseLife(2);
    return;
  }
  const arena = game.inArena() ? game.arena! : null;
  if (arena)
    for (const slot of livingOpponentSlots(game))
      arena.discardOneOpponentsCards(game, slot, 2, JUNJI);
  game.drainEach(2);
  game.say(`  Junji: each opponent discards 2 and loses 2`);
}

function livingOpponentSlots(game: MerenGame): number[] {
  return game.life
    .map((_life, slot) => slot)
    .filter((slot) => game.isOpponentAlive(slot));
}
