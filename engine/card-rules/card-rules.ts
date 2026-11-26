/**
 * What a card does, one object per card: the engine owns the rules, the deck owns the choices. A rule calls the game's
 * choice methods (cardValue, returnToHandValue, chooseLandToFetch, tutorTarget...) wherever the card asks its
 * controller to choose, so the deck decides without knowing how the card works.
 *
 * The topic files (draw-spells.ts, mana-spells-and-tutors.ts, permanents.ts, aristocrats.ts, attack-triggers.ts,
 * ramp-spells.ts, landfall.ts,
 * graveyard-creatures.ts, damage-spells.ts, self-mill.ts, doublers.ts, cost-and-mana.ts, life-loss.ts, big-creatures.ts, blink-and-dungeons.ts, tokens-and-life-gain.ts) list
 * the cards; this file collects them
 * and runs the hook a moment in the game asks for. A card with no rules here may still be handled by an engine topic
 * file (blink, reanimation, land search...) or by its deck.
 */
import { CARD_RULES } from '../cards/cards';
import { FOOD } from '../cards/tokens';
import type { CardDef } from '../cards/cards';
import type { GameCore } from '../game/game-core';
import type { Permanent, Zone } from '../game/game-types';
import {
  takesInitiativeOnEnter,
  ventureIntoDungeon,
  venturesOnEnter,
} from '../game/dungeons';
import { triggerCount, triggerCountOnEnter } from '../game/trigger-doublers';
import { ARISTOCRATS } from './aristocrats';
import { ATTACK_TRIGGERS } from './attack-triggers';
import { DAMAGE_SPELLS } from './damage-spells';
import { DOUBLERS } from './doublers';
import { COST_AND_MANA } from './cost-and-mana';
import { LIFE_LOSS } from './life-loss';
import { BIG_CREATURES } from './big-creatures';
import { BLINK_AND_DUNGEONS } from './blink-and-dungeons';
import { SELF_MILL } from './self-mill';
import { DRAW_SPELLS } from './draw-spells';
import { GRAVEYARD_CREATURES } from './graveyard-creatures';
import { LANDFALL } from './landfall';
import { MANA_SPELLS_AND_TUTORS } from './mana-spells-and-tutors';
import { PERMANENTS } from './permanents';
import { RAMP_SPELLS } from './ramp-spells';
import { TOKENS_AND_LIFE_GAIN } from './tokens-and-life-gain';

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
  /** At the beginning of each opponent's upkeep, while it is on the battlefield. */
  onOpponentUpkeep?(game: GameCore, permanent: Permanent): void;
  /** Its own leave trigger ("when this leaves the battlefield": it is already off the battlefield). */
  onLeaves?(game: GameCore, permanent: Permanent): void;
  /** Another permanent of ours left the battlefield (died, blinked, removed), while this one is on the battlefield. */
  onAnotherOfOursLeaves?(
    game: GameCore,
    permanent: Permanent,
    left: Permanent,
  ): void;
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
  /** We attack, while it is on the battlefield, after the attackers' own triggers ("whenever you attack with...").
   *  Returns the creatures its trigger puts onto the battlefield attacking (Undercellar Sweep), if any. */
  onWeAttack?(
    game: GameCore,
    permanent: Permanent,
    attackers: Permanent[],
  ): Permanent[] | void;
  /** One or more creature cards were milled from our library (millOurselves), while it is on the battlefield. */
  onCreatureCardsMilled?(
    game: GameCore,
    permanent: Permanent,
    creatureCards: CardDef[],
  ): void;
  /** One or more cards left our graveyard, while it is on the battlefield. One trigger per event: a spell's
   *  resolution, or an effect run as GameCore.asOneGraveyardEvent, is one event however many cards leave. */
  onCardsLeaveOurGraveyard?(game: GameCore, permanent: Permanent): void;
  /** While it is on the battlefield: a creature card was put into our graveyard from anywhere but the battlefield
   *  (milled, discarded, a spell's own card). GameCore.toGraveyard runs it. */
  onCreatureCardToOurGraveyard?(
    game: GameCore,
    permanent: Permanent,
    card: CardDef,
  ): void;
  /** While it is on the battlefield: a creature card left our graveyard (each card). GameCore.takeCard runs it. */
  onCreatureCardLeavesOurGraveyard?(
    game: GameCore,
    permanent: Permanent,
    card: CardDef,
  ): void;
  /** While it is on the battlefield: the tokens we create are multiplied by this (Doubling Season: 2). */
  tokenMultiplier?(game: GameCore, permanent: Permanent): number;
  /** While it is on the battlefield: the counters put on our permanents (GameCore.addCounters) are multiplied by this. */
  counterMultiplier?(game: GameCore, permanent: Permanent): number;
  /** While it is on the battlefield: the mana a permanent we tap makes is multiplied by this. */
  manaMultiplier?(game: GameCore, permanent: Permanent): number;
  /** While it is on the battlefield: the power and toughness it gives this creature of ours (itself or another): one
   *  number for both, or each its own (Kozilek, the Broken Reality: +3/+2). */
  powerAndToughnessBonus?(
    game: GameCore,
    permanent: Permanent,
    creature: Permanent,
  ): number | { power: number; toughness: number };
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
  /** A creature of ours dealt combat damage to a player, while it is on the battlefield (Ohran Frostfang). */
  onOurCreatureDealsCombatDamage?(
    game: GameCore,
    permanent: Permanent,
    creature: Permanent,
  ): void;
  /** One or more creatures of ours dealt combat damage to a player (once per combat), while it is on the battlefield
   *  (Midnight Pathlighter). */
  onOurCreaturesDealCombatDamage?(
    game: GameCore,
    permanent: Permanent,
    connected: Permanent[],
  ): void;
  /** "When you cast this spell" (it has resolved by then: the engine runs it after the spell, as the decks did). */
  whenCast?(game: GameCore, spell: CardDef): void;
  /** Its annihilator N while it attacks (the defending player sacrifices N permanents: a pod). */
  annihilator?(game: GameCore, permanent: Permanent): number;
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
  /** We cast any spell (a permanent, an instant or a sorcery; a copy we cast too), while it is on the battlefield.
   *  GameCore.weCastSpell runs it. */
  onWeCastSpell?(game: GameCore, permanent: Permanent, spell: CardDef): void;
  /** At the beginning of our end step, while it is on the battlefield. */
  onEndStep?(game: GameCore, permanent: Permanent): void;
  /** We create one or more tokens at once, while it is on the battlefield: the tokens it adds to them (Peregrin
   *  Took's Food). GameCore.createTokenGroup asks every permanent, then the replacements below. */
  extraTokensWhenWeCreate?(game: GameCore, permanent: Permanent): CardDef[];
  /** Instead of creating this token, the tokens it gives (Academy Manufactor), or null to leave it. */
  replacesTokenWeCreate?(
    game: GameCore,
    permanent: Permanent,
    token: CardDef,
  ): CardDef[] | null;
  /** We created a token (it has entered), while it is on the battlefield ("whenever you create a token"). */
  onWeCreateToken?(
    game: GameCore,
    permanent: Permanent,
    token: Permanent,
  ): void;
  /** We gained life (amount > 0), while it is on the battlefield. */
  onWeGainLife?(game: GameCore, permanent: Permanent, amount: number): void;
  /** We sacrificed a permanent (it is already gone), while it is on the battlefield. */
  onWeSacrifice?(
    game: GameCore,
    permanent: Permanent,
    sacrificed: Permanent,
  ): void;
  /** We sacrificed a Food, while it is on the battlefield (after every onWeSacrifice). */
  onWeSacrificeFood?(game: GameCore, permanent: Permanent): void;
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
  ...BIG_CREATURES,
  ...BLINK_AND_DUNGEONS,
  ...TOKENS_AND_LIFE_GAIN,
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

/** The upkeep triggers of our permanents that the engine has rules for. Then a new "since the last upkeep" begins
 *  (Ephara). */
export function upkeepOfCommonCards(
  game: GameCore,
  runsElsewhere: (permanent: Permanent) => boolean = () => false,
): void {
  for (const permanent of game.orderSimultaneousTriggers(
    game.battlefield.slice(),
  ))
    if (!runsElsewhere(permanent)) upkeepTriggerOf(game, permanent);
  game.hasCreatureEnteredSinceLastUpkeep = false;
}

/** The triggers of our permanents at an opponent's upkeep. Then a new "since the last upkeep" begins (Ephara).
 *  GameCore.opponentUpkeep runs them. */
export function opponentUpkeepTriggers(game: GameCore): void {
  for (const permanent of game.orderSimultaneousTriggers(
    game.battlefield.slice(),
  )) {
    const rules = rulesOf(permanent.card);
    if (rules?.onOpponentUpkeep)
      runTrigger(game, permanent, () =>
        rules.onOpponentUpkeep!(game, permanent),
      );
  }
  game.hasCreatureEnteredSinceLastUpkeep = false;
}

/** The leave triggers: the permanent's own, then our other permanents' "whenever another permanent you control
 *  leaves". GameCore.onLeave runs them. */
export function leaveTriggers(game: GameCore, left: Permanent): void {
  const ownRules = rulesOf(left.card);
  if (ownRules?.onLeaves)
    runTrigger(game, left, () => ownRules.onLeaves!(game, left));
  for (const permanent of game.orderSimultaneousTriggers(
    game.battlefield.slice(),
  )) {
    const rules = rulesOf(permanent.card);
    if (permanent !== left && rules?.onAnotherOfOursLeaves)
      runTrigger(game, permanent, () =>
        rules.onAnotherOfOursLeaves!(game, permanent, left),
      );
  }
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
    if (permanent === entered || !rules?.onAnotherOfOursEnters) continue;
    const times = triggerCountOnEnter(game, permanent, entered);
    for (let i = 0; i < times; i++)
      rules.onAnotherOfOursEnters(game, permanent, entered, from);
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
  joined.push(...weAttackTriggers(game, attackers));
  return joined;
}

/** Our permanents' "whenever you attack" triggers (after the attackers' own). Returns the creatures they put onto the
 *  battlefield attacking. */
export function weAttackTriggers(
  game: GameCore,
  attackers: Permanent[],
): Permanent[] {
  const joined: Permanent[] = [];
  for (const permanent of game.battlefield.slice()) {
    const rules = rulesOf(permanent.card);
    if (rules?.onWeAttack)
      runTrigger(game, permanent, () =>
        joined.push(...(rules.onWeAttack!(game, permanent, attackers) ?? [])),
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

/** The triggers of our permanents for a creature card put into our graveyard from anywhere but the battlefield. */
export function creatureCardToGraveyardTriggers(
  game: GameCore,
  card: CardDef,
): void {
  for (const permanent of game.orderSimultaneousTriggers(
    game.battlefield.slice(),
  )) {
    const rules = rulesOf(permanent.card);
    if (rules?.onCreatureCardToOurGraveyard)
      runTrigger(game, permanent, () =>
        rules.onCreatureCardToOurGraveyard!(game, permanent, card),
      );
  }
}

/** The triggers of our permanents for a creature card leaving our graveyard. */
export function creatureCardLeavesGraveyardTriggers(
  game: GameCore,
  card: CardDef,
): void {
  for (const permanent of game.orderSimultaneousTriggers(
    game.battlefield.slice(),
  )) {
    const rules = rulesOf(permanent.card);
    if (rules?.onCreatureCardLeavesOurGraveyard)
      runTrigger(game, permanent, () =>
        rules.onCreatureCardLeavesOurGraveyard!(game, permanent, card),
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
      rules.onWeLoseLife !== undefined ||
      rules.extraTokensWhenWeCreate !== undefined ||
      rules.replacesTokenWeCreate !== undefined ||
      rules.onWeCreateToken !== undefined ||
      rules.onWeGainLife !== undefined ||
      rules.onWeSacrifice !== undefined ||
      rules.onWeSacrificeFood !== undefined ||
      rules.onCreatureCardToOurGraveyard !== undefined ||
      rules.onCreatureCardLeavesOurGraveyard !== undefined)
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

/** The power (or toughness) our permanents give this creature. */
export function bonusFromPermanents(
  game: GameCore,
  creature: Permanent,
  which: 'power' | 'toughness',
): number {
  let total = 0;
  for (const permanent of game.battlefield) {
    const bonus = rulesOf(permanent.card)?.powerAndToughnessBonus?.(
      game,
      permanent,
      creature,
    );
    if (bonus === undefined) continue;
    total += typeof bonus === 'number' ? bonus : bonus[which];
  }
  return total;
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

/** The triggers for a permanent spell we cast: our permanents' (Helga), then its own "when you cast this spell"
 *  (Kozilek). GameCore.castPerm runs them (after the spell), and so do the free casts (cascade). */
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
  rulesOf(spell)?.whenCast?.(game, spell);
}

/** Our permanents' "whenever you cast a spell" triggers (Pensive Professor). GameCore.weCastSpell runs them. */
export function spellCastTriggers(game: GameCore, spell: CardDef): void {
  for (const permanent of game.battlefield.slice()) {
    const rules = rulesOf(permanent.card);
    if (rules?.onWeCastSpell)
      runTrigger(game, permanent, () =>
        rules.onWeCastSpell!(game, permanent, spell),
      );
  }
}

/** The end step triggers of our permanents. GameCore.endStep runs them. */
export function endStepTriggers(
  game: GameCore,
  runsElsewhere: (permanent: Permanent) => boolean = () => false,
): void {
  for (const permanent of game.orderSimultaneousTriggers(
    game.battlefield.slice(),
  ))
    if (!runsElsewhere(permanent)) endStepTriggerOf(game, permanent);
}

/** One permanent's end step trigger (a deck that runs its own end step cards between them calls it). */
export function endStepTriggerOf(game: GameCore, permanent: Permanent): void {
  const rules = rulesOf(permanent.card);
  if (rules?.onEndStep)
    runTrigger(game, permanent, () => rules.onEndStep!(game, permanent));
}

/** The tokens we create when we would create these at once: our permanents add theirs (Peregrin Took), then the
 *  replacements change each one (Academy Manufactor). GameCore.createTokenGroup asks it. */
export function tokensWeCreate(game: GameCore, tokens: CardDef[]): CardDef[] {
  let group = tokens.slice();
  for (const permanent of game.battlefield) {
    const extra = rulesOf(permanent.card)?.extraTokensWhenWeCreate;
    if (extra) group.push(...extra(game, permanent));
  }
  for (const permanent of game.battlefield) {
    const replace = rulesOf(permanent.card)?.replacesTokenWeCreate;
    if (replace)
      group = group.flatMap(
        (token) => replace(game, permanent, token) ?? [token],
      );
  }
  return group;
}

/** The "whenever you create a token" triggers of our permanents, for one token that entered. */
export function tokenCreatedTriggers(game: GameCore, token: Permanent): void {
  for (const permanent of game.orderSimultaneousTriggers(
    game.battlefield.slice(),
  )) {
    const rules = rulesOf(permanent.card);
    if (rules?.onWeCreateToken)
      runTrigger(game, permanent, () =>
        rules.onWeCreateToken!(game, permanent, token),
      );
  }
}

/** The "whenever you gain life" triggers of our permanents. GameCore.gainLife runs them. */
export function lifeGainTriggers(game: GameCore, amount: number): void {
  for (const permanent of game.orderSimultaneousTriggers(
    game.battlefield.slice(),
  )) {
    const rules = rulesOf(permanent.card);
    if (rules?.onWeGainLife)
      runTrigger(game, permanent, () =>
        rules.onWeGainLife!(game, permanent, amount),
      );
  }
}

/** The "whenever you sacrifice" triggers of our permanents, then for a Food the "whenever you sacrifice a Food"
 *  ones. GameCore.sacrifice runs them. */
export function sacrificeTriggers(game: GameCore, sacrificed: Permanent): void {
  for (const permanent of game.orderSimultaneousTriggers(
    game.battlefield.slice(),
  )) {
    const rules = rulesOf(permanent.card);
    if (rules?.onWeSacrifice)
      runTrigger(game, permanent, () =>
        rules.onWeSacrifice!(game, permanent, sacrificed),
      );
  }
  if (sacrificed.card !== FOOD) return;
  for (const permanent of game.orderSimultaneousTriggers(
    game.battlefield.slice(),
  )) {
    const rules = rulesOf(permanent.card);
    if (rules?.onWeSacrificeFood)
      runTrigger(game, permanent, () =>
        rules.onWeSacrificeFood!(game, permanent),
      );
  }
}

/** One permanent's "whenever another permanent of ours dies" trigger (a deck with death cards of its own runs them
 *  in the same loop, so the order stays the battlefield's). */
export function ourPermanentDiesTriggerOf(
  game: GameCore,
  permanent: Permanent,
  dead: Permanent,
): void {
  const rules = rulesOf(permanent.card);
  if (rules?.onOurPermanentDies)
    runTrigger(game, permanent, () =>
      rules.onOurPermanentDies!(game, permanent, dead),
    );
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

/** The triggers for one creature of ours dealing combat damage to a player: its own (Glissa Sunslayer), then our
 *  permanents' "a creature you control deals combat damage" ones (Ohran Frostfang). */
export function combatDamageTriggerOf(
  game: GameCore,
  creature: Permanent,
): void {
  const rules = rulesOf(creature.card);
  if (rules?.onCombatDamageToPlayer)
    runTrigger(game, creature, () =>
      rules.onCombatDamageToPlayer!(game, creature),
    );
  for (const permanent of game.battlefield.slice()) {
    const permanentRules = rulesOf(permanent.card);
    if (permanentRules?.onOurCreatureDealsCombatDamage)
      runTrigger(game, permanent, () =>
        permanentRules.onOurCreatureDealsCombatDamage!(
          game,
          permanent,
          creature,
        ),
      );
  }
}

/** The triggers of our permanents for one or more of our creatures dealing combat damage to a player (Midnight
 *  Pathlighter): once per combat, after each creature's own. */
export function creaturesDealtCombatDamageTriggers(
  game: GameCore,
  connected: Permanent[],
): void {
  if (!connected.length) return;
  for (const permanent of game.battlefield.slice()) {
    const rules = rulesOf(permanent.card);
    if (rules?.onOurCreaturesDealCombatDamage)
      runTrigger(game, permanent, () =>
        rules.onOurCreaturesDealCombatDamage!(game, permanent, connected),
      );
  }
}

/** An attacker's annihilator N (0 without one). */
export function annihilatorOf(game: GameCore, attacker: Permanent): number {
  return rulesOf(attacker.card)?.annihilator?.(game, attacker) ?? 0;
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
