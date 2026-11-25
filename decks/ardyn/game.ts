/**
 * Ardyn, the Usurper's deck (Friend 3's mono-black Demons, pod-only): its choices and the cards the engine doesn't
 * have yet (Ardyn himself, Unholy Annex, and the cards other decks code too: Gray Merchant, Rune-Scarred Demon,
 * Disciple of Bolas, Indulgent Tormentor, Sheoldred, Bontu's Monument, Herald's Horn).
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
import { CardDef, Cost, makeToken } from '../../engine/cards/cards';
import { Candidate, Permanent, Zone } from '../../engine/game/game-types';
import { CreatureDeckGame } from '../../engine/game/creature-deck';
import {
  permanentSpellCastTriggers,
  deathTriggerOfCommonCard,
  enterTriggerOfCommonCard,
  triggersOfOthersOnEnter,
  triggersOnDeath,
  upkeepOfCommonCards,
} from '../../engine/card-rules/card-rules';
import { castPermanentSpell } from '../../engine/game/casting';
import {
  enterTriggerCount,
  triggerCount,
} from '../../engine/game/trigger-doublers';

export class ArdynGame extends CreatureDeckGame {
  override colors = ['B'];
  readonly values = VALUE;

  /** Roaming Throne, Urza's Incubator and Herald's Horn name Demon. */
  override chosenCreatureType(_card: CardDef): string | null {
    return 'Demon';
  }

  // ================================================================ mana and costs
  override effectiveCost(
    card: CardDef,
    base: Cost | null = null,
    fromGraveyard = false,
  ): Cost {
    const cost = super.effectiveCost(card, base, fromGraveyard);
    if (!card.isCreature) return cost;
    let reduction = 0;
    if (card.cost.black > 0)
      reduction += this.countOnBattlefield("Bontu's Monument");
    if (isDemon(card)) reduction += this.countOnBattlefield("Herald's Horn");
    return cost.withGeneric(Math.max(0, cost.generic - reduction));
  }

  // ================================================================ cast triggers
  /** Bontu's Monument: each creature spell drains 1 (before the engine's cast triggers, as it always ran). */
  override castPerm(card: CardDef, fromCommand = false): boolean {
    const manaSpent = this.manaToCast(card, fromCommand);
    if (!castPermanentSpell(this, card, fromCommand)) return false;
    if (card.isCreature)
      for (let i = 0; i < this.countOnBattlefield("Bontu's Monument"); i++)
        this.drainAll(1);
    permanentSpellCastTriggers(this, card, manaSpent);
    return true;
  }

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
    for (let i = 0; i < triggers; i++) {
      enterTriggerOfCommonCard(this, permanent);
      this.enterTrigger(permanent);
    }
  }

  enterTrigger(permanent: Permanent): void {
    switch (permanent.card.name) {
      case 'Gray Merchant of Asphodel':
        this.drainAll(this.devotion('B'));
        break;
      case 'Rune-Scarred Demon':
        this.doTutor(() => true, false);
        break;
      case 'Disciple of Bolas':
        this.sacrificeForDiscipleOfBolas(permanent);
        break;
    }
  }

  /** Disciple of Bolas: sacrifice our least valuable other creature; gain life and draw cards equal to its power. */
  sacrificeForDiscipleOfBolas(disciple: Permanent): void {
    const others = this.creatures().filter((other) => other !== disciple);
    if (!others.length) return;
    const fodder = others.reduce((first, second) =>
      this.battlefieldValue(second.card) < this.battlefieldValue(first.card)
        ? second
        : first,
    );
    const power = this.power(fodder);
    this.sacrifice(fodder);
    this.gainLife(power);
    this.draw(power);
  }

  /** The dead one's own trigger first, then the others' (as Ardyn always had it). */
  override onDies(permanent: Permanent): void {
    deathTriggerOfCommonCard(this, permanent);
    triggersOnDeath(this, permanent);
  }

  // ================================================================ upkeep and end step
  override upkeep(): void {
    upkeepOfCommonCards(this);
    for (const permanent of this.battlefield.slice()) {
      const triggers = triggerCount(this, permanent);
      for (let i = 0; i < triggers; i++)
        switch (permanent.card.name) {
          case 'Indulgent Tormentor': // (the opponent pays 3 life rather than give us a card)
            this.targetOpponentLosesLife(3);
            break;
          case 'Sheoldred, Whispering One': {
            const creature = this.bestCreatureInGraveyard();
            if (creature) this.reanimate(creature);
            break;
          }
        }
    }
    if (this.isOnBattlefield("Herald's Horn")) this.revealWithHeraldsHorn();
  }

  /** Herald's Horn: a Demon on top of the library goes to our hand. */
  revealWithHeraldsHorn(): void {
    const top = this.library[0];
    if (top && top.isCreature && isDemon(top)) {
      this.takeCard(top, 'library');
      this.putCard(top, 'hand');
    }
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
