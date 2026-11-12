import {
  AD_NAUSEAM,
  BRASS_BOUNTY,
  CODIE,
  DEMONIC_TUTOR,
  FINISHERS,
  FLASHBACK,
  MANA_GEYSER,
  PROFANE_TUTOR,
  REITERATE,
  RETURN_THE_FAVOR,
  TEFERIS_PROTECTION,
  LIM_DUL_VAULT,
  JESKAS_WILL,
} from './cards';
import { manamorphoseCost } from './candidates';
import { lookAtTopAndKeep, putCardsBackOnLibrary } from './spells';
import type { CodieGame } from './game';
import { CardDef, Cost } from '../../engine/cards';
import { removeIfPresent } from '../../engine/lists';

export function exileFromHand(game: CodieGame, name: string): void {
  const card = game.cardInHand(name)!;
  removeIfPresent(game.hand, card);
  game.exile.push(card);
}

/** Cast a mana spell (and maybe copy it with a Reiterate that does not buy back). */
export function castManaSpell(
  game: CodieGame,
  name: string,
  copy: 0 | 1 | 2,
): boolean {
  const card = game.cardInHand(name)!;
  const cost = Cost.parse('{1}{R}{R}').plus(new Cost(copy === 2 ? 3 : 0));
  const total = copy ? card.cost.plus(cost) : card.cost;
  if (!game.canPay(total, true)) return false;
  if (!game.castInstantOrSorcery(card)) return false;
  if (copy) {
    const reiterateCard = game.cardInHand(REITERATE);
    if (!reiterateCard || !game.pay(cost, true)) return false;
    if (copy === 1) {
      removeIfPresent(game.hand, reiterateCard);
      game.graveyard.push(reiterateCard);
    } // (with buyback it stays in hand)
    game.spellsCast += 1;
    game.resolve(card);
  }
  return true;
}

/** What a Reiterate loop on this spell makes per copy: [yield, colour] (the copy costs 6: {1}{R}{R}{3} with buyback). */
export function manaPerLoopCopy(
  game: CodieGame,
  spell: string,
): [number, 'R' | 'any'] {
  if (spell === JESKAS_WILL) return [game.opponentHandSize(), 'R'];
  if (spell === MANA_GEYSER) return [game.opponentTappedLands(), 'R'];
  return [game.landsOnBattlefield().length, 'any']; // Brass's Bounty: a Treasure for each land
}

/** The loop: cast s, then Reiterate (with buyback) copies it again and again. It grows when a copy makes more than the 6 it costs. */
export function tryReiterateLoop(
  game: CodieGame,
  spell: string,
  viaFlashback = false,
): boolean {
  const spellCard = viaFlashback
    ? game.graveyard.find((card) => card.name === spell)
    : game.cardInHand(spell);
  if (!spellCard) return false;
  const [yieldPerCopy] = manaPerLoopCopy(game, spell);
  if (yieldPerCopy < 7) return false;
  // both must be paid before the first copy resolves: s (with Flashback: {R} more), then Reiterate with buyback
  let first = spellCard.cost.plus(Cost.parse('{1}{R}{R}').plus(new Cost(3)));
  if (viaFlashback) first = first.plus(Cost.parse('{R}'));
  if (!game.canPay(first, true)) return false;
  game.say(
    `LOOP: ${spell}${viaFlashback ? ' (Flashback)' : ''} + Reiterate (buyback): each copy makes ${yieldPerCopy}, costs 6 -> bottomless`,
  );
  game.loopUsed = spell;
  beginReiterateLoop(game, spell, spellCard, viaFlashback, first);
  return true;
}

/** Pay for the loop's first spell and add the bottomless mana. */
export function beginReiterateLoop(
  game: CodieGame,
  spell: string,
  card: CardDef,
  viaFlashback: boolean,
  first: Cost,
): void {
  if (viaFlashback) {
    removeIfPresent(game.graveyard, card);
    game.exile.push(card);
    const flashbackCard = game.cardInHand(FLASHBACK);
    if (flashbackCard) {
      removeIfPresent(game.hand, flashbackCard);
      game.graveyard.push(flashbackCard);
    }
  } else {
    removeIfPresent(game.hand, card);
    game.graveyard.push(card);
  }
  game.pay(first, true);
  if (manaPerLoopCopy(game, spell)[1] === 'R') game.pool.R += 99;
  else {
    game.pool.W += 99;
    game.pool.U += 99;
    game.pool.B += 99;
    game.pool.R += 99;
    game.pool.G += 99;
  }
  // Jeska's Will with a commander out: each copy also exiles the top three cards, which may be played this turn: the whole library
  if (spell === JESKAS_WILL && game.isOnBattlefield(CODIE)) game.digAll = true;
}

/** Flashback (R) on a spell in the graveyard: it may be cast again for its mana cost. */
export function flashbackCast(game: CodieGame, name: string): boolean {
  const card = game.graveyard.find((candidate) => candidate.name === name);
  if (!card || !spendSpell(game, FLASHBACK)) return false;
  return game.castInstantOrSorcery(card, true);
}

export function flashbackTutor(
  game: CodieGame,
  name: string,
  target: string,
): boolean {
  const card = game.graveyard.find((candidate) => candidate.name === name);
  const targetCard = game.library.find(
    (candidate) => candidate.name === target,
  );
  if (!card || !targetCard || !spendSpell(game, FLASHBACK)) return false;
  if (!game.pay(game.effCost(card, null, true), true)) return false;
  removeIfPresent(game.graveyard, card);
  game.exile.push(card);
  removeIfPresent(game.library, targetCard);
  game.hand.push(targetCard);
  return true;
}

export function suspendProfaneTutor(game: CodieGame, card: CardDef): boolean {
  if (!game.pay(Cost.parse('{1}{B}'), true)) return false;
  removeIfPresent(game.hand, card);
  game.exile.push(card);
  game.suspended.push(2);
  game.say('suspend Profane Tutor');
  return true;
}

/** Cast a spell for its cost without resolving it (the solver applies the effect itself). */
export function spendSpell(
  game: CodieGame,
  name: string,
  base: Cost | null = null,
): CardDef | null {
  const card = game.cardInHand(name);
  if (!card) return null;
  const cost = game.effCost(card, base);
  if (!game.pay(cost, true)) return null;
  removeIfPresent(game.hand, card);
  game.graveyard.push(card);
  game.spellsCast += 1;
  return card;
}

export function castUntapSpell(game: CodieGame, name: string): boolean {
  if (!spendSpell(game, name)) return false;
  game.untapLands(3);
  return true;
}

export function activateCodie(game: CodieGame): boolean {
  const permanent = game.findPermanent(CODIE);
  if (
    !permanent ||
    permanent.tapped ||
    permanent.sick ||
    !game.pay(new Cost(4))
  )
    return false;
  permanent.tapped = true;
  for (const colour of ['W', 'U', 'B', 'R', 'G'] as const)
    game.pool[colour] += 1;
  game.codieArmed += 1;
  return true;
}

export function castTutor(
  game: CodieGame,
  spell: string,
  target: string,
  top: boolean,
): boolean {
  const card = game.library.find((candidate) => candidate.name === target);
  if (!card || !spendSpell(game, spell)) return false;
  removeIfPresent(game.library, card);
  if (top) {
    game.library.unshift(card);
    game.knownTop = 1;
  } else game.hand.push(card);
  return true;
}

/** A draw spell on a stacked top: the cards it draws are known. */
export function castDrawSpellOnKnownTop(
  game: CodieGame,
  name: string,
): boolean {
  const card = spendSpell(
    game,
    name,
    name === 'Manamorphose' ? manamorphoseCost(game) : null,
  );
  if (!card) return false;
  if (name === 'Manamorphose') {
    game.draw(1);
    game.pool.R += 1;
    game.pool.B += 1;
    game.knownTop -= 1;
  } else if (name === 'Brainstorm') {
    game.draw(3);
    putCardsBackOnLibrary(game, 2);
    game.knownTop = Math.max(0, game.knownTop - 1);
  } else if (name === 'Frantic Search') {
    game.draw(2);
    game.discard(2);
    game.untapLands(3);
    game.knownTop -= 2;
  } else if (name === 'Stock Up') {
    lookAtTopAndKeep(game, 5, 2);
    game.knownTop = 0;
  } else if (name === 'Flow State') {
    lookAtTopAndKeep(game, 3, 1);
    game.knownTop = Math.max(0, game.knownTop - 3);
  }
  return true;
}

/** A cantrip that draws the card on top of the library (the solver puts a tutored card there first). */
export function castCantripDrawingTop(game: CodieGame, name: string): boolean {
  const card = spendSpell(
    game,
    name,
    name === 'Manamorphose' ? manamorphoseCost(game) : null,
  );
  if (!card) return false;
  const top = game.library.shift();
  if (top) game.hand.push(top);
  if (name === 'Manamorphose') {
    game.pool.R += 1;
    game.pool.B += 1;
  } // two mana of the colours we need
  return true;
}

/** How much a card is worth in a stacked window (what completes a kill, tutors, Ad Nauseam + Teferi's Protection). */
export function windowWeight(game: CodieGame, card: CardDef): number {
  const name = card.name;
  if (game.inHand(name)) return 0;
  if (name === TEFERIS_PROTECTION || name === AD_NAUSEAM) return 10;
  if (name === REITERATE) return 9;
  if (name === PROFANE_TUTOR) return game.isOnBattlefield(CODIE) ? 8 : 3;
  if (
    name === JESKAS_WILL ||
    name === MANA_GEYSER ||
    name === BRASS_BOUNTY ||
    FINISHERS.includes(name)
  )
    return 7;
  if (name === DEMONIC_TUTOR || name === 'Vampiric Tutor') return 6;
  if (
    name === 'Seething Song' ||
    name === 'Dark Ritual' ||
    name === 'Pyretic Ritual'
  )
    return 3;
  if (name === RETURN_THE_FAVOR || name === 'Manamorphose') return 2;
  return 0;
}

/** Lim-Dul's Vault: look at the top five, pay 1 life to put them on the bottom and look at the next five, as often as we like; the
 *  last five go on top in the order we want. We take the best of the first twelve windows (1 life each, never below 15 life). Under
 *  Teferi's Protection no life can be paid, so this must be cast before it. */
export function stackLibraryWithVault(game: CodieGame): void {
  const maxLooks = Math.min(
    12,
    Math.floor(game.library.length / 5),
    Math.max(1, game.myLife - 15),
  );
  let best = 0,
    bestScore = -1;
  for (let windowIndex = 0; windowIndex < maxLooks; windowIndex++) {
    const score =
      game.library
        .slice(5 * windowIndex, 5 * windowIndex + 5)
        .reduce((total, card) => total + windowWeight(game, card), 0) -
      0.4 * windowIndex;
    if (score > bestScore) {
      best = windowIndex;
      bestScore = score;
    }
  }
  const skipped = game.library.splice(0, 5 * best);
  const win = game.library
    .splice(0, 5)
    .sort(
      (first, second) => windowWeight(game, second) - windowWeight(game, first),
    );
  game.library.push(...skipped);
  game.shuffle();
  game.library.unshift(...win);
  game.loseLife(best);
  game.knownTop = win.length;
  game.say("Lim-Dul's Vault: window", best + 1, 'on top, life', game.myLife);
}

export function castVault(game: CodieGame): boolean {
  if (!spendSpell(game, LIM_DUL_VAULT)) return false;
  stackLibraryWithVault(game);
  return true;
}

/** Codie activates (WUBRG for 4), the spell of mana value 1 is cast: the free Profane Tutor fetches the target. */
export function activateCodieForTutor(
  game: CodieGame,
  spell: string,
  target: string,
): boolean {
  const card = game.library.find((candidate) => candidate.name === target);
  const profaneTutor = game.library.find(
    (candidate) => candidate.name === PROFANE_TUTOR,
  );
  if (!card || !profaneTutor || !activateCodie(game)) return false;
  game.codieArmed -= 1; // used right away
  if (!spendSpell(game, spell)) return false;
  if (spell === 'Dark Ritual') game.pool.B += 3;
  removeIfPresent(game.library, profaneTutor);
  removeIfPresent(game.library, card);
  game.hand.push(card);
  game.graveyard.push(profaneTutor);
  return true;
}

export function castAdNauseamWithTeferi(game: CodieGame): boolean {
  const total = Cost.parse('{3}{B}{B}').plus(Cost.parse('{2}{W}'));
  if (
    !game.canPay(total, true) ||
    !game.cardInHand(TEFERIS_PROTECTION) ||
    !game.cardInHand(AD_NAUSEAM)
  )
    return false;
  spendSpell(game, TEFERIS_PROTECTION);
  spendSpell(game, AD_NAUSEAM);
  const keep = Math.min(game.library.length, game.config.ad_keep as number); // the bottom cards stay in the library (Pontus: all but the last 5)
  game.hand.push(...game.library.splice(0, game.library.length - keep));
  game.libraryInHand = true;
  return true;
}
