/**
 * Ardyn, the Usurper's deck (Friend 3's mono-black Demons, pod-only): its choices (Demon for the cards that name a
 * type), the order of its upkeep triggers, and the cards the engine doesn't have yet (Ardyn himself, Unholy Annex).
 * The win, combat, values and the planner's score come from the engine's CreatureDeckGame.
 *
 * Files: cards.ts (names, values, the Demon check), game.ts (this file), candidates.ts (what the AI may do now).
 *
 * Ardyn gives Demons menace, lifelink and haste, and at each of our combats makes a 5/5 Demon token copy of a
 * creature card from our graveyard (Starscourge). Roaming Throne (Demon) makes Demons' triggers trigger twice.
 */
import {
  ARDYN,
  EXQUISITE_BLOOD,
  STARSCOURGE_COPIES,
  VALUE,
  isDemon,
} from './cards';
import { buildCandidates } from './candidates';
import { CardDef, makeToken } from '../../engine/cards/cards';
import { Candidate, Permanent, Zone } from '../../engine/game/game-types';
import { CreatureDeckGame } from '../../engine/game/creature-deck';
import {
  deathTriggerOfCommonCard,
  enterTriggerOfCommonCard,
  triggersOfOthersOnEnter,
  triggersOnDeath,
  upkeepOfCommonCards,
  upkeepTriggerOf,
} from '../../engine/card-rules/card-rules';
import { enterTriggerCount } from '../../engine/game/trigger-doublers';

const HERALDS_HORN = "Herald's Horn";
/** The upkeep cards Ardyn runs after the engine's others: Indulgent Tormentor and Sheoldred, then Herald's Horn. */
const UPKEEP_AFTER_THE_OTHERS = [
  'Indulgent Tormentor',
  'Sheoldred, Whispering One',
  HERALDS_HORN,
];

export class ArdynGame extends CreatureDeckGame {
  override colors = ['B'];
  readonly values = VALUE;

  /** Roaming Throne, Urza's Incubator and Herald's Horn name Demon. */
  override chosenCreatureType(_card: CardDef): string | null {
    return 'Demon';
  }

  // ================================================================ cast triggers

  // ================================================================ life
  /** Each opponent loses n and we gain what they lost. */
  drainAll(amount: number): void {
    this.gainLife(this.drainEach(amount));
  }

  // ================================================================ enter and die
  override onEnter(permanent: Permanent, from: Zone): void {
    triggersOfOthersOnEnter(this, permanent, from);
    if (isDemon(permanent.card) && this.isOnBattlefield(ARDYN))
      permanent.sick = false; // Ardyn: Demons have haste
    const triggers = enterTriggerCount(this, permanent);
    for (let i = 0; i < triggers; i++)
      enterTriggerOfCommonCard(this, permanent);
  }

  /** The dead one's own trigger first, then the others' (as Ardyn always had it). */
  override onDies(permanent: Permanent): void {
    deathTriggerOfCommonCard(this, permanent);
    triggersOnDeath(this, permanent);
  }

  // ================================================================ upkeep and end step
  /** The engine's upkeep cards, then Indulgent Tormentor and Sheoldred in battlefield order, then Herald's Horn, as
   *  Ardyn always had it. */
  override upkeep(): void {
    upkeepOfCommonCards(this, (permanent) =>
      UPKEEP_AFTER_THE_OTHERS.includes(permanent.card.name),
    );
    for (const permanent of this.battlefield.slice())
      if (UPKEEP_AFTER_THE_OTHERS.slice(0, 2).includes(permanent.card.name))
        upkeepTriggerOf(this, permanent);
    const heraldsHorn = this.findPermanent(HERALDS_HORN);
    if (heraldsHorn) upkeepTriggerOf(this, heraldsHorn);
  }

  /** The engine's end step triggers, then Unholy Annex (it counts Starscourge's copies as Demons: isDemon). */
  override endStep(): void {
    super.endStep();
    if (this.isOnBattlefield('Unholy Annex')) {
      this.draw(1);
      if (this.battlefield.some((permanent) => isDemon(permanent.card)))
        this.drainAll(2);
      else this.loseLife(2);
    }
  }

  // ================================================================ combat
  /** Beginning of combat: Starscourge, then the engine's combat. */
  override combat(): void {
    if (this.isOnBattlefield(ARDYN)) this.starscourge();
    super.combat();
  }

  /** Starscourge: exile the best creature card from our graveyard and make a 5/5 black Demon token copy of it. */
  starscourge(): void {
    const best = this.bestCreatureInGraveyard();
    if (!best) return;
    this.takeCard(best, 'graveyard');
    this.putCard(best, 'exile');
    const copy = makeToken(best.name, 5, 5, 'black', [...best.keywords]);
    STARSCOURGE_COPIES.add(copy);
    this.say('Starscourge: a 5/5 Demon copy of', best);
    this.createTokens(copy);
  }

  /** Ardyn gives Demons lifelink. */
  override onCombatDamage(connected: Permanent[]): void {
    super.onCombatDamage(connected);
    if (!this.isOnBattlefield(ARDYN)) return;
    for (const permanent of connected)
      if (isDemon(permanent.card) && !permanent.card.keywords.has('lifelink'))
        this.gainLife(this.power(permanent));
  }

  // ================================================================ the planner and the pod
  override positionValue(): number {
    let value = super.positionValue();
    if (this.isOnBattlefield(ARDYN)) value += 60;
    if (this.isOnBattlefield(EXQUISITE_BLOOD)) value += 20;
    return value;
  }

  candidates(main2: boolean): Candidate[] {
    return buildCandidates(this, main2);
  }
}
