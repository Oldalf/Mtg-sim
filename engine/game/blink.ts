/**
 * Blink (flicker): a permanent is exiled and comes back. Rule 400.7: it comes back as a new object, so
 *   - its leave and enter triggers fire again (onLeave, then enter -> onEnter, with the trigger doublers),
 *   - counters, marks (attached Auras and Equipment, "this turn" flags) and summoning sickness start anew,
 *   - a token blinked away is gone (rule 111.7),
 *   - the log shows both moves (battlefield -> exile -> battlefield).
 * Some spells return the cards "at the beginning of the next end step" (Morningtide's Light): they wait in exile
 * until our end step (returnBlinkedCards). Which permanents are blinked is the deck's choice (GameCore.blinkValue).
 *
 * The blink spells are card facts (BLINK_SPELLS). Rebound (Ephemerate) is the engine's too: GameCore casts the card
 * again from exile at our next upkeep.
 */
import { CardDef } from '../cards/cards';
import type { GameCore } from './game-core';
import { Permanent } from './game-types';

/** What a blink spell exiles and when it brings them back. */
export interface BlinkSpell {
  /** How many permanents it exiles (the best ones by blinkValue); 'all' = every one that qualifies. */
  count: number | 'all';
  /** Which of our permanents qualify. */
  targets: 'creature' | 'nontokenCreature' | 'artifactCreatureOrLand';
  /** 'now': they come back at once; 'endStep': at the beginning of the next end step. */
  returns: 'now' | 'endStep';
  /** They come back tapped. */
  tapped?: boolean;
  /** +1/+1 counters they come back with (Daydream). */
  counters?: number;
}

export const BLINK_SPELLS: Record<string, BlinkSpell> = {
  Ephemerate: { count: 1, targets: 'creature', returns: 'now' },
  Daydream: { count: 1, targets: 'creature', returns: 'now', counters: 1 },
  'Ghostly Flicker': {
    count: 2,
    targets: 'artifactCreatureOrLand',
    returns: 'now',
  },
  "Morningtide's Light": {
    count: 'all',
    targets: 'creature',
    returns: 'endStep',
    tapped: true,
  },
  // the d20: 1-9 they come back at the end step; 10-20 they come back now, are exiled again, and come back at the
  // end step (see resolveBlinkSpell)
  "Lae'zel's Acrobatics": {
    count: 'all',
    targets: 'nontokenCreature',
    returns: 'endStep',
  },
};

/** A card waiting in exile to come back at the beginning of the next end step. */
export interface BlinkedCard {
  card: CardDef;
  tapped: boolean;
}

export interface BlinkOptions {
  returnsAtEndStep?: boolean;
  tapped?: boolean;
  counters?: number;
}

/** Blinks a permanent of ours. Returns the new permanent, or null when nothing comes back now (a token, or a card
 *  that returns at the end step). A permanent another player owns is not blinked (it would go to its owner). */
export function blink(
  game: GameCore,
  permanent: Permanent,
  options: BlinkOptions = {},
): Permanent | null {
  if (!game.battlefield.includes(permanent) || permanent.owner !== null)
    return null;
  game.takeFromBattlefield(permanent);
  if (permanent.token) {
    game.say('  blink', permanent.card, '(a token: it is gone)');
    game.onLeave(permanent);
    return null;
  }
  game.putCard(permanent.card, 'exile');
  game.onLeave(permanent);
  if (options.returnsAtEndStep) {
    game.say('  exile', permanent.card, '(it returns at the next end step)');
    game.cardsReturningAtEndStep = [
      ...game.cardsReturningAtEndStep,
      { card: permanent.card, tapped: !!options.tapped },
    ];
    return null;
  }
  game.say('  blink', permanent.card);
  return returnFromExile(game, permanent.card, options);
}

function returnFromExile(
  game: GameCore,
  card: CardDef,
  options: BlinkOptions,
): Permanent {
  game.takeCard(card, 'exile');
  const returned = game.enter(card, 'exile', { tapped: options.tapped });
  if (options.counters) returned.counters += options.counters;
  return returned;
}

/** At the beginning of our end step: the cards blinked "until the next end step" come back. */
export function returnBlinkedCards(game: GameCore): void {
  const returning = game.cardsReturningAtEndStep;
  if (!returning.length) return;
  game.cardsReturningAtEndStep = [];
  for (const { card, tapped } of returning) {
    if (!game.exile.includes(card)) continue;
    game.say('  returns from exile', card);
    returnFromExile(game, card, { tapped });
  }
}

/** Our permanents a blink spell may exile, the ones we most want blinked first. Only those worth blinking
 *  (blinkValue above 0) are chosen, except for an "all" spell, which takes every one that qualifies. */
export function blinkTargets(game: GameCore, spell: BlinkSpell): Permanent[] {
  const qualifies = (permanent: Permanent): boolean => {
    if (permanent.owner !== null) return false;
    const card = permanent.card;
    if (spell.targets === 'creature') return card.isCreature;
    if (spell.targets === 'nontokenCreature')
      return card.isCreature && !permanent.token;
    return (
      card.isCreature || card.types.has('artifact') || permanent.land !== null
    );
  };
  const candidates = game.battlefield.filter(qualifies);
  if (spell.count === 'all') return candidates;
  return candidates
    .filter((permanent) => game.blinkValue(permanent) > 0)
    .sort((first, second) => game.blinkValue(second) - game.blinkValue(first))
    .slice(0, spell.count);
}

/** Plays a blink spell. Returns false if the spell isn't one. */
export function resolveBlinkSpell(game: GameCore, spell: CardDef): boolean {
  const spellInfo = BLINK_SPELLS[spell.name];
  if (!spellInfo) return false;
  const targets = blinkTargets(game, spellInfo);
  if (spell.name === "Lae'zel's Acrobatics") {
    const roll = 1 + Math.floor(game.rng.random() * 20);
    game.say(`  d20: ${roll}`);
    if (roll >= 10)
      for (let i = 0; i < targets.length; i++) {
        const returned = blink(game, targets[i]);
        if (returned) targets[i] = returned;
      }
  }
  for (const permanent of targets)
    blink(game, permanent, {
      returnsAtEndStep: spellInfo.returns === 'endStep',
      tapped: spellInfo.tapped,
      counters: spellInfo.counters,
    });
  return true;
}
