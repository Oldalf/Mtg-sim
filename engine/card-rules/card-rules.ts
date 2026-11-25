/**
 * What a card does, one object per card: the engine owns the rules, the deck owns the choices. A rule calls the game's
 * choice methods (cardValue, returnToHandValue, chooseLandToFetch, tutorTarget...) wherever the card asks its
 * controller to choose, so the deck decides without knowing how the card works.
 *
 * The topic files (draw-spells.ts, mana-spells-and-tutors.ts, permanents.ts, aristocrats.ts, attack-triggers.ts,
 * ramp-spells.ts, landfall.ts,
 * graveyard-creatures.ts, damage-spells.ts, self-mill.ts, doublers.ts, cost-and-mana.ts, life-loss.ts) list
 * the cards; this file collects them
 * and runs the hook a moment in the game asks for. A card with no rules here may still be handled by an engine topic
 * file (blink, reanimation, land search...) or by its deck.
 */
import { CARD_RULES } from '../cards/cards';
import type { CardDef } from '../cards/cards';
import type { GameCore } from '../game/game-core';
import type { Permanent, Zone } from '../game/game-types';
import {
  takesInitiativeOnEnter,
  ventureIntoDungeon,
  venturesOnEnter,
} from '../game/dungeons';
import { triggerCount } from '../game/trigger-doublers';
import { ARISTOCRATS } from './aristocrats';
import { ATTACK_TRIGGERS } from './attack-triggers';
import { DAMAGE_SPELLS } from './damage-spells';
import { DOUBLERS } from './doublers';
import { COST_AND_MANA } from './cost-and-mana';
import { LIFE_LOSS } from './life-loss';
import { SELF_MILL } from './self-mill';
import { DRAW_SPELLS } from './draw-spells';
import { GRAVEYARD_CREATURES } from './graveyard-creatures';
import { LANDFALL } from './landfall';
import { MANA_SPELLS_AND_TUTORS } from './mana-spells-and-tutors';
import { PERMANENTS } from './permanents';
import { RAMP_SPELLS } from './ramp-spells';

/** How a spell was cast, for a rule that cares. */
export interface HowCast {
  fromGraveyard: boolean;
  /** The chosen mode, or for an X spell 'x=N'; null when there is none. */
  mode: string | null;
}

/** One card's rules. Every hook is optional: a card has only the ones its text has.
 *
 * Whose permanents a hook sees: each player's game has only its own battlefield, so "you control" is built in. Our
 * hooks run for our permanents only (an opponent's creature entering or dying never reaches onAnotherOfOursEnters or
 * onOurPermanentDies); a card whose text also counts other players' creatures ("whenever another creature dies") adds
 * onOtherPlayersCreatureDies, which only a pod calls. A permanent that changes control doesn't enter (no enter
 * triggers); when it dies, its controller's game runs the death. */
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
  /** Another permanent of ours entered while this one is on the battlefield ("whenever another creature you control
   *  enters"). */
  onAnotherOfOursEnters?(
    game: GameCore,
    permanent: Permanent,
    entered: Permanent,
    from: Zone,
  ): void;
  /** A permanent of ours died: runs for each of our permanents on the battlefield and for the dead one itself
   *  ("whenever this or another creature you control dies"; permanent === dead when it is itself). */
  onOurPermanentDies?(
    game: GameCore,
    permanent: Permanent,
    dead: Permanent,
  ): void;
  /** A land entered under our control while this is on the battlefield (landfall: "a land you control enters"). */
  onLandfall?(game: GameCore, permanent: Permanent, land: Permanent): void;
  /** The additional land drops it gives each turn while it is on the battlefield. */
  landDropsItGives?(game: GameCore, permanent: Permanent): number;
  /** Another player's creature died (a pod only), while this is on our battlefield ("whenever another creature
   *  dies" counts theirs too). */
  onOtherPlayersCreatureDies?(
    game: GameCore,
    permanent: Permanent,
    dead: Permanent,
  ): void;
  /** The first time we would draw a card this turn, while it is on the battlefield (a replacement: it runs before
   *  that draw). */
  beforeFirstDrawEachTurn?(game: GameCore, permanent: Permanent): void;
  /** It attacks. Returns the creatures its trigger puts onto the battlefield attacking (Raph & Mikey), if any. */
  onAttacks?(game: GameCore, permanent: Permanent): Permanent[] | void;
  /** We attack, while it is on the battlefield, after the attackers' own triggers ("whenever you attack with..."). */
  onWeAttack?(
    game: GameCore,
    permanent: Permanent,
    attackers: Permanent[],
  ): void;
  /** One or more creature cards were milled from our library (millOurselves), while it is on the battlefield. */
  onCreatureCardsMilled?(
    game: GameCore,
    permanent: Permanent,
    creatureCards: CardDef[],
  ): void;
  /** One or more cards left our graveyard, while it is on the battlefield. One trigger per event: a spell's
   *  resolution, or an effect run as GameCore.asOneGraveyardEvent, is one event however many cards leave. */
  onCardsLeaveOurGraveyard?(game: GameCore, permanent: Permanent): void;
  /** While it is on the battlefield: the tokens we create are multiplied by this (Doubling Season: 2). */
  tokenMultiplier?(game: GameCore, permanent: Permanent): number;
  /** While it is on the battlefield: the counters put on our permanents (GameCore.addCounters) are multiplied by this. */
  counterMultiplier?(game: GameCore, permanent: Permanent): number;
  /** While it is on the battlefield: the mana a permanent we tap makes is multiplied by this. */
  manaMultiplier?(game: GameCore, permanent: Permanent): number;
  /** While it is on the battlefield: the power and toughness it gives this creature of ours (itself or another). */
  powerAndToughnessBonus?(
    game: GameCore,
    permanent: Permanent,
    creature: Permanent,
  ): number;
  /** While it is on the battlefield: the keywords our creatures have from it (Lavaleaper: haste). */
  givesOurCreaturesKeywords?(game: GameCore, permanent: Permanent): string[];
  /** While this card is in our graveyard: the keywords our creatures have from it (Wonder: flying, with an Island). */
  givesOurCreaturesKeywordsFromGraveyard?(game: GameCore): string[];
  /** Another creature of ours is entering, while it is on the battlefield: what it enters with (a replacement, before
   *  any trigger: Rhythm of the Wild's riot). */
  asAnotherOfOursEnters?(
    game: GameCore,
    permanent: Permanent,
    entering: Permanent,
  ): void;
  /** It dealt combat damage to a player. */
  onCombatDamageToPlayer?(game: GameCore, permanent: Permanent): void;
  /** An opponent cast this spell, while it is on the battlefield. */
  onOpponentCasts?(game: GameCore, permanent: Permanent, spell: CardDef): void;
  /** Creatures attacked us (a pod), while it is on the battlefield. */
  onCreaturesAttackUs?(
    game: GameCore,
    permanent: Permanent,
    attackerCount: number,
  ): void;
  /** While it is on the battlefield: how much less (generic mana) this spell of ours costs. */
  costReduction?(game: GameCore, permanent: Permanent, spell: CardDef): number;
  /** We tapped this land of ours for mana, while it is on the battlefield (it adds its extra mana to the pool). */
  onLandTappedForMana?(
    game: GameCore,
    permanent: Permanent,
    land: Permanent,
  ): void;
  /** While it is on the battlefield: what an opponent would lose is multiplied by this (Bloodletter of Aclazotz: 2). */
  opponentLifeLossMultiplier?(game: GameCore, permanent: Permanent): number;
  /** An opponent lost life (lost: how much), while it is on the battlefield. */
  onOpponentLosesLife?(
    game: GameCore,
    permanent: Permanent,
    lost: number,
  ): void;
  /** We lost life, while it is on the battlefield. */
  onWeLoseLife?(game: GameCore, permanent: Permanent, amount: number): void;
  /** We cast a permanent spell (manaSpent: the mana we paid for it), while it is on the battlefield. */
  onWeCast?(
    game: GameCore,
    permanent: Permanent,
    spell: CardDef,
    manaSpent: number,
  ): void;
  /** At the beginning of our end step, while it is on the battlefield. */
  onEndStep?(game: GameCore, permanent: Permanent): void;
}

const RULES_BY_NAME = new Map<string, CardRules>();
for (const rules of [
  ...DRAW_SPELLS,
  ...MANA_SPELLS_AND_TUTORS,
  ...PERMANENTS,
  ...ARISTOCRATS,
  ...ATTACK_TRIGGERS,
  ...RAMP_SPELLS,
  ...LANDFALL,
  ...GRAVEYARD_CREATURES,
  ...DAMAGE_SPELLS,
  ...SELF_MILL,
  ...DOUBLERS,
  ...COST_AND_MANA,
  ...LIFE_LOSS,
])
  for (const name of rules.names) {
    if (RULES_BY_NAME.has(name)) throw new Error(`two rules for ${name}`);
    RULES_BY_NAME.set(name, rules);
  }

/** Runs a permanent's triggered ability as many times as it triggers (Roaming Throne: triggerCount). */
function runTrigger(
  game: GameCore,
  permanent: Permanent,
  trigger: () => void,
): void {
  const times = triggerCount(game, permanent);
  for (let i = 0; i < times; i++) trigger();
}

/** The engine's rules for this card, or undefined if it has none here. */
export function rulesOf(card: CardDef): CardRules | undefined {
  // looked up once per card: the static-effect hooks ask at every power and mana check
  let rules = card[CARD_RULES] as CardRules | null | undefined;
  if (rules === undefined) {
    rules = RULES_BY_NAME.get(card.name) ?? null;
    card[CARD_RULES] = rules;
  }
  return rules ?? undefined;
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
  for (const permanent of game.orderSimultaneousTriggers(
    game.battlefield.slice(),
  ))
    upkeepTriggerOf(game, permanent);
}

/** The "whenever another permanent enters" triggers of our other permanents. The engine's onEnter runs them before the
 *  entering permanent's own trigger. */
export function triggersOfOthersOnEnter(
  game: GameCore,
  entered: Permanent,
  from: Zone,
): void {
  for (const permanent of game.orderSimultaneousTriggers(
    game.battlefield.slice(),
  )) {
    const rules = rulesOf(permanent.card);
    if (permanent !== entered && rules?.onAnotherOfOursEnters)
      runTrigger(game, permanent, () =>
        rules.onAnotherOfOursEnters!(game, permanent, entered, from),
      );
  }
}

/** The "whenever this or another permanent dies" triggers: our permanents on the battlefield, then the dead one. The
 *  engine's onDies runs them before the dead permanent's own death trigger. */
export function triggersOnDeath(game: GameCore, dead: Permanent): void {
  for (const permanent of game.orderSimultaneousTriggers([
    ...game.battlefield,
    dead,
  ])) {
    const rules = rulesOf(permanent.card);
    if (rules?.onOurPermanentDies)
      runTrigger(game, permanent, () =>
        rules.onOurPermanentDies!(game, permanent, dead),
      );
  }
}

/** The attack triggers: each attacker's own, then our permanents' "whenever you attack" ones. Returns the creatures
 *  they put onto the battlefield attacking. */
export function attackTriggers(
  game: GameCore,
  attackers: Permanent[],
): Permanent[] {
  const joined: Permanent[] = [];
  for (const attacker of attackers)
    joined.push(...attackTriggerOf(game, attacker));
  for (const permanent of game.battlefield.slice()) {
    const rules = rulesOf(permanent.card);
    if (rules?.onWeAttack)
      runTrigger(game, permanent, () =>
        rules.onWeAttack!(game, permanent, attackers),
      );
  }
  return joined;
}

/** One attacker's own attack trigger. Returns the creatures it put onto the battlefield attacking. */
export function attackTriggerOf(
  game: GameCore,
  attacker: Permanent,
): Permanent[] {
  const joined: Permanent[] = [];
  const rules = rulesOf(attacker.card);
  if (rules?.onAttacks)
    runTrigger(game, attacker, () =>
      joined.push(...(rules.onAttacks!(game, attacker) ?? [])),
    );
  return joined;
}

/** One permanent's landfall trigger. False if it has none (a deck with landfall cards of its own runs them in the same
 *  loop, so the order stays the battlefield's). */
export function landfallTriggerOf(
  game: GameCore,
  permanent: Permanent,
  land: Permanent,
): boolean {
  const rules = rulesOf(permanent.card);
  if (!rules?.onLandfall) return false;
  runTrigger(game, permanent, () => rules.onLandfall!(game, permanent, land));
  return true;
}

/** The landfall triggers of our permanents. The engine's onLandEnter runs them. */
export function landfallTriggers(game: GameCore, land: Permanent): void {
  for (const permanent of game.orderSimultaneousTriggers(
    game.battlefield.slice(),
  ))
    landfallTriggerOf(game, permanent, land);
}

/** The additional land drops our permanents give this turn (Azusa, Druid Class...). */
export function landDropsFromPermanents(game: GameCore): number {
  let drops = 0;
  for (const permanent of game.battlefield)
    drops += rulesOf(permanent.card)?.landDropsItGives?.(game, permanent) ?? 0;
  return drops;
}

/** One permanent's upkeep trigger (a deck with upkeep cards of its own runs them in the same loop, so the order stays
 *  the battlefield's). */
export function upkeepTriggerOf(game: GameCore, permanent: Permanent): void {
  const rules = rulesOf(permanent.card);
  if (rules?.onUpkeep)
    runTrigger(game, permanent, () => rules.onUpkeep!(game, permanent));
}

/** The triggers of our permanents for creature cards milled from our library. GameCore.millOurselves runs them. */
export function millTriggers(game: GameCore, creatureCards: CardDef[]): void {
  for (const permanent of game.orderSimultaneousTriggers(
    game.battlefield.slice(),
  )) {
    const rules = rulesOf(permanent.card);
    if (rules?.onCreatureCardsMilled)
      runTrigger(game, permanent, () =>
        rules.onCreatureCardsMilled!(game, permanent, creatureCards),
      );
  }
}

/** The triggers of our permanents for cards leaving our graveyard (GameCore.takeCard runs them, once per event). */
export function graveyardLeaveTriggers(game: GameCore): void {
  for (const permanent of game.orderSimultaneousTriggers(
    game.battlefield.slice(),
  )) {
    const rules = rulesOf(permanent.card);
    if (rules?.onCardsLeaveOurGraveyard)
      runTrigger(game, permanent, () =>
        rules.onCardsLeaveOurGraveyard!(game, permanent),
      );
  }
}

/** Does the card have a static effect (a multiplier, a power bonus, a cost reduction, flying from the graveyard) or a
 *  trigger on mana or life (a land tapped, life lost)? GameCore skips those checks, which run very often, until a card
 *  with one could be on its battlefield (mayHaveStaticEffects). */
export function hasStaticEffect(card: CardDef): boolean {
  const rules = rulesOf(card);
  return (
    rules !== undefined &&
    (rules.tokenMultiplier !== undefined ||
      rules.counterMultiplier !== undefined ||
      rules.manaMultiplier !== undefined ||
      rules.powerAndToughnessBonus !== undefined ||
      rules.givesOurCreaturesKeywords !== undefined ||
      rules.givesOurCreaturesKeywordsFromGraveyard !== undefined ||
      rules.costReduction !== undefined ||
      rules.onLandTappedForMana !== undefined ||
      rules.opponentLifeLossMultiplier !== undefined ||
      rules.onOpponentLosesLife !== undefined ||
      rules.onWeLoseLife !== undefined)
  );
}

/** The product of a multiplier our permanents give (tokens, counters, mana, the opponents' life loss); 1 without
 *  one. */
export function multiplierFromPermanents(
  game: GameCore,
  which:
    | 'tokenMultiplier'
    | 'counterMultiplier'
    | 'manaMultiplier'
    | 'opponentLifeLossMultiplier',
): number {
  let multiplier = 1;
  for (const permanent of game.battlefield)
    multiplier *= rulesOf(permanent.card)?.[which]?.(game, permanent) ?? 1;
  return multiplier;
}

/** The power and toughness our permanents give this creature. */
export function powerAndToughnessBonusOf(
  game: GameCore,
  creature: Permanent,
): number {
  let bonus = 0;
  for (const permanent of game.battlefield)
    bonus +=
      rulesOf(permanent.card)?.powerAndToughnessBonus?.(
        game,
        permanent,
        creature,
      ) ?? 0;
  return bonus;
}

/** Do our creatures have this keyword from a permanent of ours (Lavaleaper) or a card in our graveyard (Wonder)? */
export function ourCreaturesHaveKeywordFromCards(
  game: GameCore,
  keyword: string,
): boolean {
  for (const permanent of game.battlefield)
    if (
      rulesOf(permanent.card)
        ?.givesOurCreaturesKeywords?.(game, permanent)
        .includes(keyword)
    )
      return true;
  return game.graveyard.some(
    (card) =>
      rulesOf(card)
        ?.givesOurCreaturesKeywordsFromGraveyard?.(game)
        .includes(keyword) ?? false,
  );
}

/** What our permanents replace the first draw of the turn with. The engine's draw runs it. */
export function replacementsOfFirstDraw(game: GameCore): void {
  for (const permanent of game.battlefield.slice())
    rulesOf(permanent.card)?.beforeFirstDrawEachTurn?.(game, permanent);
}

/** The triggers of our permanents for another player's creature dying (a pod). The engine's onOtherPlayersCreatureDies
 *  runs them. */
export function triggersOnOtherPlayersCreatureDeath(
  game: GameCore,
  dead: Permanent,
): void {
  for (const permanent of game.battlefield.slice()) {
    const rules = rulesOf(permanent.card);
    if (rules?.onOtherPlayersCreatureDies)
      runTrigger(game, permanent, () =>
        rules.onOtherPlayersCreatureDies!(game, permanent, dead),
      );
  }
}

/** How much less (generic mana) our permanents make this spell cost. */
export function costReductionFromPermanents(
  game: GameCore,
  spell: CardDef,
): number {
  let reduction = 0;
  for (const permanent of game.battlefield)
    reduction +=
      rulesOf(permanent.card)?.costReduction?.(game, permanent, spell) ?? 0;
  return reduction;
}

/** The triggers of our permanents for a land of ours tapped for mana (Crypt Ghast). GameCore.tap runs them. */
export function landTappedForManaTriggers(
  game: GameCore,
  land: Permanent,
): void {
  for (const permanent of game.battlefield.slice()) {
    const rules = rulesOf(permanent.card);
    if (rules?.onLandTappedForMana)
      runTrigger(game, permanent, () =>
        rules.onLandTappedForMana!(game, permanent, land),
      );
  }
}

/** The triggers of our permanents for an opponent losing life. GameCore.damageOpponent runs them. */
export function opponentLifeLossTriggers(game: GameCore, lost: number): void {
  for (const permanent of game.battlefield.slice()) {
    const rules = rulesOf(permanent.card);
    if (rules?.onOpponentLosesLife)
      runTrigger(game, permanent, () =>
        rules.onOpponentLosesLife!(game, permanent, lost),
      );
  }
}

/** The triggers of our permanents for us losing life. GameCore.loseLife runs them. */
export function ourLifeLossTriggers(game: GameCore, amount: number): void {
  for (const permanent of game.battlefield.slice()) {
    const rules = rulesOf(permanent.card);
    if (rules?.onWeLoseLife)
      runTrigger(game, permanent, () =>
        rules.onWeLoseLife!(game, permanent, amount),
      );
  }
}

/** The triggers of our permanents for a permanent spell we cast. GameCore.castPerm runs them (after the spell). */
export function permanentSpellCastTriggers(
  game: GameCore,
  spell: CardDef,
  manaSpent: number,
): void {
  for (const permanent of game.battlefield.slice()) {
    const rules = rulesOf(permanent.card);
    if (rules?.onWeCast)
      runTrigger(game, permanent, () =>
        rules.onWeCast!(game, permanent, spell, manaSpent),
      );
  }
}

/** The end step triggers of our permanents. GameCore.endStep runs them. */
export function endStepTriggers(game: GameCore): void {
  for (const permanent of game.orderSimultaneousTriggers(
    game.battlefield.slice(),
  )) {
    const rules = rulesOf(permanent.card);
    if (rules?.onEndStep)
      runTrigger(game, permanent, () => rules.onEndStep!(game, permanent));
  }
}

/** What another creature of ours enters with (Rhythm of the Wild's riot), before any trigger. */
export function replacementsAsAnotherOfOursEnters(
  game: GameCore,
  entering: Permanent,
): void {
  for (const permanent of game.battlefield.slice())
    if (permanent !== entering)
      rulesOf(permanent.card)?.asAnotherOfOursEnters?.(
        game,
        permanent,
        entering,
      );
}

/** One creature's "deals combat damage to a player" trigger (Glissa Sunslayer). */
export function combatDamageTriggerOf(
  game: GameCore,
  permanent: Permanent,
): void {
  const rules = rulesOf(permanent.card);
  if (rules?.onCombatDamageToPlayer)
    runTrigger(game, permanent, () =>
      rules.onCombatDamageToPlayer!(game, permanent),
    );
}

/** The triggers of our permanents for a spell an opponent cast. GameCore.onOpponentCast runs them. */
export function opponentCastTriggers(game: GameCore, spell: CardDef): void {
  for (const permanent of game.battlefield.slice()) {
    const rules = rulesOf(permanent.card);
    if (rules?.onOpponentCasts)
      runTrigger(game, permanent, () =>
        rules.onOpponentCasts!(game, permanent, spell),
      );
  }
}

/** The triggers of our permanents for creatures attacking us (a pod). GameCore.onAttackedBy runs them. */
export function attackedByTriggers(
  game: GameCore,
  attackerCount: number,
): void {
  for (const permanent of game.battlefield.slice()) {
    const rules = rulesOf(permanent.card);
    if (rules?.onCreaturesAttackUs)
      runTrigger(game, permanent, () =>
        rules.onCreaturesAttackUs!(game, permanent, attackerCount),
      );
  }
}
