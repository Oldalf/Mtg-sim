/**
 * Cards that draw by sacrificing, dying or investigating, as the engine plays them. The facts hold in any deck; what
 * to sacrifice, and when, is the deck's choice (it picks the creatures and calls these):
 *   - the sacrifice spells (Deadly Dispute, Costly Plunder, Plumb the Forbidden): castSacrificeDrawSpell;
 *   - the death payoffs: Midnight Reaper, Moldervine Reclamation, Corpse Augur (drawWhenCreatureDies, corpseAugurDies);
 *   - Tireless Tracker's Clues (landfall, crackClue), Skullclamp (clampCreature), Greater Good and Ayara's outlets;
 *   - Elvish Visionary draws when it enters (common-permanents.ts).
 * Every draw says which card it came from, so a deck can count what each card gave it (GameCore.draw).
 */
import { CardDef, Cost } from '../cards/cards';
import { CLUE, TREASURE } from '../cards/tokens';
import type { GameCore } from './game-core';
import { Permanent } from './game-types';

export const MIDNIGHT_REAPER = 'Midnight Reaper';
export const MOLDERVINE_RECLAMATION = 'Moldervine Reclamation';
export const CORPSE_AUGUR = 'Corpse Augur';
export const TIRELESS_TRACKER = 'Tireless Tracker';
export const SKULLCLAMP = 'Skullclamp';
export const GREATER_GOOD = 'Greater Good';
export const AYARA = 'Ayara, First of Locthwain';
/** Corpse Augur draws and loses X life: it targets an empty graveyard (X = 0) when that would leave us below this. */
export const CORPSE_AUGUR_LIFE_FLOOR = 15;
/** Greater Good makes us discard this many cards after the draw. */
export const GREATER_GOOD_DISCARDS = 3;

// ================================================================ sacrifice spells
/** "As an additional cost, sacrifice ...": what may be sacrificed and what the spell gives for it. */
export interface SacrificeDrawSpell {
  /** An artifact may be sacrificed too (else only a creature). */
  artifactAllowed: boolean;
  /** At most this many permanents may be sacrificed. */
  mostSacrifices: number;
  /** Cards drawn even when nothing is sacrificed. */
  cardsAlways: number;
  /** Cards drawn for each permanent sacrificed. */
  cardsPerSacrifice: number;
  /** Life lost for each card drawn. */
  lifePerCard: number;
  /** A Treasure for each permanent sacrificed. */
  treasurePerSacrifice: number;
}
export const SACRIFICE_DRAW_SPELLS: Record<string, SacrificeDrawSpell> = {
  // 1B instant: sacrifice a creature or artifact: draw two, create a Treasure
  'Deadly Dispute': {
    artifactAllowed: true,
    mostSacrifices: 1,
    cardsAlways: 0,
    cardsPerSacrifice: 2,
    lifePerCard: 0,
    treasurePerSacrifice: 1,
  },
  // 1B instant: sacrifice a creature or artifact: draw two
  'Costly Plunder': {
    artifactAllowed: true,
    mostSacrifices: 1,
    cardsAlways: 0,
    cardsPerSacrifice: 2,
    lifePerCard: 0,
    treasurePerSacrifice: 0,
  },
  // 1B instant: sacrifice any number of creatures; draw a card and lose 1 life, copied for each one sacrificed
  'Plumb the Forbidden': {
    artifactAllowed: false,
    mostSacrifices: Infinity,
    cardsAlways: 1,
    cardsPerSacrifice: 1,
    lifePerCard: 1,
    treasurePerSacrifice: 0,
  },
};

/** The spell doesn't choose what to sacrifice, the deck does: sacrifice these, then cast it. Returns false (and
 *  sacrifices nothing) when it can't be cast. */
export function castSacrificeDrawSpell(
  game: GameCore,
  spell: CardDef,
  sacrificed: Permanent[],
): boolean {
  const rule = SACRIFICE_DRAW_SPELLS[spell.name];
  if (
    !rule ||
    sacrificed.length > rule.mostSacrifices ||
    sacrificed.some((permanent) => !game.battlefield.includes(permanent)) ||
    !game.canPay(game.effectiveCost(spell), true)
  )
    return false;
  for (const permanent of sacrificed) game.sacrifice(permanent);
  game.spellSacrifices = sacrificed.length;
  const isCast = game.castInstantOrSorcery(spell);
  game.spellSacrifices = 0;
  return isCast;
}

/** A sacrifice spell resolves (GameCore.resolve asks this early). Returns false if the card isn't one. */
export function resolveSacrificeDrawSpell(
  game: GameCore,
  spell: CardDef,
): boolean {
  const rule = SACRIFICE_DRAW_SPELLS[spell.name];
  if (!rule) return false;
  const cards =
    rule.cardsAlways + rule.cardsPerSacrifice * game.spellSacrifices;
  game.draw(cards, spell.name);
  game.loseLife(rule.lifePerCard * cards);
  if (rule.treasurePerSacrifice)
    game.createTokens(
      TREASURE,
      rule.treasurePerSacrifice * game.spellSacrifices,
    );
  return true;
}

// ================================================================ when creatures die
/** A creature of ours died (it is already off the battlefield): Midnight Reaper (a nontoken creature, itself too:
 *  1 damage to us and a card) and Moldervine Reclamation (any creature: 1 life and a card). */
export function drawWhenCreatureDies(game: GameCore, died: Permanent): void {
  const reaperSawIt =
    died.card.name === MIDNIGHT_REAPER || game.isOnBattlefield(MIDNIGHT_REAPER);
  if (reaperSawIt && !died.token) {
    game.loseLife(1);
    game.draw(1, MIDNIGHT_REAPER);
  }
  if (game.isOnBattlefield(MOLDERVINE_RECLAMATION)) {
    game.gainLife(1);
    game.draw(1, MOLDERVINE_RECLAMATION);
  }
}

/** Corpse Augur died: we draw X and lose X, X the creature cards in a graveyard. Ours (it is in it now) unless that
 *  would take us under the life floor: then an opponent's empty graveyard (X = 0). */
export function corpseAugurDies(game: GameCore, died: Permanent): boolean {
  if (died.card.name !== CORPSE_AUGUR) return false;
  const creatureCards = game.graveyard.filter((card) => card.isCreature).length;
  const cards =
    game.myLife - creatureCards >= CORPSE_AUGUR_LIFE_FLOOR ? creatureCards : 0;
  game.draw(cards, CORPSE_AUGUR);
  game.loseLife(cards);
  return true;
}

// ================================================================ Clues and Tireless Tracker
/** A land entered under our control: Tireless Tracker investigates. */
export function landfallOfCommonCards(game: GameCore): void {
  if (game.isOnBattlefield(TIRELESS_TRACKER)) game.createTokens(CLUE);
}

/** We sacrificed a Clue: Tireless Tracker gets a +1/+1 counter. */
export function clueSacrificed(game: GameCore): void {
  const tracker = game.findPermanent(TIRELESS_TRACKER);
  if (tracker) tracker.counters += 1;
}

/** {2}, sacrifice this Clue: draw a card. */
export function crackClue(game: GameCore, clue: Permanent): boolean {
  if (!game.battlefield.includes(clue) || !game.pay(new Cost(2), false))
    return false;
  game.sacrifice(clue);
  game.draw(1, CLUE.name);
  return true;
}

// ================================================================ outlets that draw
/** Skullclamp: equip {1} to a creature with toughness 1 (it gets -1 toughness and dies): we draw two. */
export function clampCreature(game: GameCore, creature: Permanent): boolean {
  if (!game.pay(new Cost(1), false)) return false;
  game.say('Skullclamp equips', creature.card, 'and it dies');
  game.dies(creature);
  game.draw(2, SKULLCLAMP);
  return true;
}

/** Greater Good: sacrifice a creature, draw cards equal to its power, then discard three cards. */
export function sacrificeToGreaterGood(
  game: GameCore,
  creature: Permanent,
): boolean {
  if (!game.battlefield.includes(creature)) return false;
  const power = game.power(creature);
  game.sacrifice(creature);
  game.draw(power, GREATER_GOOD);
  game.discard(GREATER_GOOD_DISCARDS);
  return true;
}

/** Ayara: {T}, sacrifice another creature: draw a card. */
export function sacrificeToAyara(
  game: GameCore,
  ayara: Permanent,
  creature: Permanent,
): boolean {
  if (ayara.tapped || !game.battlefield.includes(creature)) return false;
  ayara.tapped = true;
  game.sacrifice(creature);
  game.draw(1, AYARA);
  return true;
}
