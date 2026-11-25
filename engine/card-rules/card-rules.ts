/**
 * What a card does, one object per card: the engine owns the rules, the deck owns the choices. A rule calls the game's
 * choice methods (cardValue, returnToHandValue, chooseLandToFetch, tutorTarget...) wherever the card asks its
 * controller to choose, so the deck decides without knowing how the card works.
 *
 * The topic files (draw-spells.ts, mana-spells-and-tutors.ts, permanents.ts, aristocrats.ts, attack-triggers.ts) list
 * the cards; this file collects them
 * and runs the hook a moment in the game asks for. A card with no rules here may still be handled by an engine topic
 * file (blink, reanimation, land search...) or by its deck.
 */
import type { CardDef } from '../cards/cards';
import type { GameCore } from '../game/game-core';
import type { Permanent } from '../game/game-types';
import {
  takesInitiativeOnEnter,
  ventureIntoDungeon,
  venturesOnEnter,
} from '../game/dungeons';
import { ARISTOCRATS } from './aristocrats';
import { ATTACK_TRIGGERS } from './attack-triggers';
import { DRAW_SPELLS } from './draw-spells';
import { MANA_SPELLS_AND_TUTORS } from './mana-spells-and-tutors';
import { PERMANENTS } from './permanents';

/** How a spell was cast, for a rule that cares. */
export interface HowCast {
  fromGraveyard: boolean;
  /** The chosen mode, or for an X spell 'x=N'; null when there is none. */
  mode: string | null;
}

/** One card's rules. Every hook is optional: a card has only the ones its text has. */
export interface CardRules {
  /** The card, or the cards that share these rules word for word. */
  names: string[];
  /** An instant or sorcery resolves (it goes to the graveyard afterwards; the engine does that). */
  resolve?(game: GameCore, spell: CardDef, howCast: HowCast): void;
  /** Its enter trigger. */
  onEnter?(game: GameCore, permanent: Permanent): void;
  /** Its own death trigger (it is already off the battlefield). */
  onDies?(game: GameCore, permanent: Permanent): void;
  /** At the beginning of our upkeep, while it is on the battlefield. */
  onUpkeep?(game: GameCore, permanent: Permanent): void;
  /** Another permanent entered while this one is on the battlefield ("whenever another creature enters"). */
  onOtherPermanentEnters?(
    game: GameCore,
    permanent: Permanent,
    entered: Permanent,
  ): void;
  /** A permanent of ours died: runs for each of our permanents on the battlefield and for the dead one itself
   *  ("whenever this or another creature dies"; permanent === dead when it is itself). */
  onPermanentDies?(game: GameCore, permanent: Permanent, dead: Permanent): void;
  /** It attacks. */
  onAttacks?(game: GameCore, permanent: Permanent): void;
  /** We attack, while it is on the battlefield, after the attackers' own triggers ("whenever you attack with..."). */
  onWeAttack?(
    game: GameCore,
    permanent: Permanent,
    attackers: Permanent[],
  ): void;
}

const RULES_BY_NAME = new Map<string, CardRules>();
for (const rules of [
  ...DRAW_SPELLS,
  ...MANA_SPELLS_AND_TUTORS,
  ...PERMANENTS,
  ...ARISTOCRATS,
  ...ATTACK_TRIGGERS,
])
  for (const name of rules.names) {
    if (RULES_BY_NAME.has(name)) throw new Error(`two rules for ${name}`);
    RULES_BY_NAME.set(name, rules);
  }

/** The engine's rules for this card, or undefined if it has none here. */
export function rulesOf(card: CardDef): CardRules | undefined {
  return RULES_BY_NAME.get(card.name);
}

/** Resolves a spell the engine has rules for. False if it has none (the next topic file or the deck handles it). */
export function resolveSpellByRules(
  game: GameCore,
  spell: CardDef,
  howCast: HowCast,
): boolean {
  const resolve = rulesOf(spell)?.resolve;
  if (!resolve) return false;
  resolve(game, spell, howCast);
  return true;
}

/** The engine's enter trigger for this permanent. False if it has none. The engine's onEnter calls it; a deck that
 *  overrides onEnter calls it where it wants it. */
export function enterTriggerOfCommonCard(
  game: GameCore,
  permanent: Permanent,
): boolean {
  // what the card's text says (any card): venture, take the initiative
  if (venturesOnEnter(permanent.card)) {
    ventureIntoDungeon(game);
    return true;
  }
  if (takesInitiativeOnEnter(permanent.card)) {
    game.takeInitiative();
    return true;
  }
  const onEnter = rulesOf(permanent.card)?.onEnter;
  if (!onEnter) return false;
  onEnter(game, permanent);
  return true;
}

/** The engine's death trigger for this permanent. False if it has none. */
export function deathTriggerOfCommonCard(
  game: GameCore,
  permanent: Permanent,
): boolean {
  const onDies = rulesOf(permanent.card)?.onDies;
  if (!onDies) return false;
  onDies(game, permanent);
  return true;
}

/** The upkeep triggers of our permanents that the engine has rules for. */
export function upkeepOfCommonCards(game: GameCore): void {
  for (const permanent of game.battlefield.slice())
    rulesOf(permanent.card)?.onUpkeep?.(game, permanent);
}

/** The "whenever another permanent enters" triggers of our other permanents. The engine's onEnter runs them before the
 *  entering permanent's own trigger. */
export function triggersOfOthersOnEnter(
  game: GameCore,
  entered: Permanent,
): void {
  for (const permanent of game.battlefield.slice())
    if (permanent !== entered)
      rulesOf(permanent.card)?.onOtherPermanentEnters?.(
        game,
        permanent,
        entered,
      );
}

/** The "whenever this or another permanent dies" triggers: our permanents on the battlefield, then the dead one. The
 *  engine's onDies runs them before the dead permanent's own death trigger. */
export function triggersOnDeath(game: GameCore, dead: Permanent): void {
  for (const permanent of [...game.battlefield, dead])
    rulesOf(permanent.card)?.onPermanentDies?.(game, permanent, dead);
}

/** The attack triggers: each attacker's own, then our permanents' "whenever you attack" ones. */
export function attackTriggers(game: GameCore, attackers: Permanent[]): void {
  for (const attacker of attackers)
    rulesOf(attacker.card)?.onAttacks?.(game, attacker);
  for (const permanent of game.battlefield.slice())
    rulesOf(permanent.card)?.onWeAttack?.(game, permanent, attackers);
}
