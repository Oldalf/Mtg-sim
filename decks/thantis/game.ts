/**
 * Thantis, the Warweaver's deck (Friend 2's Jund forced-combat deck, pod-only): the cards the engine doesn't have yet
 * (Zopandrel and Pyrewood Gearhulk's until-end-of-turn pumps, Grave Venerations's monarch, Avacyn's return, Professor
 * Dellian Fel, Ruric Thar's trigger on our own spells) and the cards other decks code or play too (Syr Konrad, Morbid
 * Opportunist, Meren's end step, Garruk's Uprising, Whip of Erebos, Indulgent Tormentor, Selvala: U1b steps 3 and 4).
 * The win, combat, values and the planner's score come from the engine's CreatureDeckGame; the forced attacks
 * ("attacks each combat if able", Thantis, goad) are the pod's (engine/pod).
 *
 * Files: cards.ts (names, values), game.ts (this file), candidates.ts (what the AI may do now).
 *
 * The deck makes every creature attack each combat (Thantis, Ruric Thar, Ares) and profits from the deaths:
 * Syr Konrad, Sangromancer, Grave Venerations, Dictate of Erebos and the recursion (Avacyn, Meren, Alesha).
 */
import {
  AVACYN,
  DELLIAN_FEL,
  GARRUKS_UPRISING,
  GRAVE_VENERATIONS,
  MEREN,
  MORBID_OPPORTUNIST,
  PYREWOOD_GEARHULK,
  RURIC_THAR,
  SELVALA,
  SYR_KONRAD,
  THANTIS,
  VALUE,
  WHIP_OF_EREBOS,
  ZOPANDREL,
} from './cards';
import { buildCandidates } from './candidates';
import { CardDef } from '../../engine/cards/cards';
import {
  Candidate,
  CardListZone,
  Fighter,
  Permanent,
  Zone,
} from '../../engine/game/game-types';
import { CreatureDeckGame } from '../../engine/game/creature-deck';
import {
  deathTriggerOfCommonCard,
  enterTriggerOfCommonCard,
  upkeepTriggerOf,
  replacementsAsAnotherOfOursEnters,
  triggersOfOthersOnEnter,
  triggersOnDeath,
  triggersOnOtherPlayersCreatureDeath,
  endStepTriggers,
  combatDamageTriggerOf,
} from '../../engine/card-rules/card-rules';
import { returnBestCreatureCardToHand } from '../../engine/card-rules/self-mill';

const NEYITH = 'Neyith of the Dire Hunt';

export class ThantisGame extends CreatureDeckGame {
  override colors = ['B', 'R', 'G'];
  readonly values = VALUE;

  /** Pyrewood Gearhulk: +2/+2 for our other creatures until end of turn. */
  pumpThisTurn = 0;
  /** Zopandrel: our creatures' power and toughness are doubled until end of turn (from the beginning of combat). */
  isDoubledThisTurn = false;
  /** Morbid Opportunist draws only once each turn. */
  hasMorbidOpportunistDrawn = false;
  /** Grave Venerations made us the monarch: a card at each end step (others taking it is not modelled). */
  isMonarch = false;
  /** Avacyn: nontoken creatures that died, back at the next end step. */
  creatureCardsAvacynReturns: CardDef[] = [];

  override startTurn(): void {
    super.startTurn();
    this.hasMorbidOpportunistDrawn = false;
  }

  // ================================================================ mana
  /** Selvala ({T}: add {C}{C}) and Zopandrel ({T}: add one mana of any colour of our commander's identity). */
  override manaSourceKind(
    permanent: Permanent,
    ignoreSick = false,
  ): string | null {
    if (!permanent.sick || ignoreSick) {
      if (permanent.card.name === SELVALA) return 'C2';
      if (permanent.card.name === ZOPANDREL) return 'A';
    }
    return super.manaSourceKind(permanent, ignoreSick);
  }

  // ================================================================ trample, power
  override fighter(
    permanent: Permanent,
    powerOf?: (otherPermanent: Permanent) => number,
    toughnessOf?: (otherPermanent: Permanent) => number,
  ): Fighter {
    const fighter = super.fighter(permanent, powerOf, toughnessOf);
    if (this.isOnBattlefield(GARRUKS_UPRISING)) fighter.trample = true; // (Brawn's: the engine's)
    return fighter;
  }

  /** The engine's bonuses, Pyrewood Gearhulk's pump, then Zopandrel's doubling. */
  override powerBonus(permanent: Permanent): number {
    let bonus =
      super.powerBonus(permanent) +
      (permanent.card.name === PYREWOOD_GEARHULK ? 0 : this.pumpThisTurn);
    if (this.isDoubledThisTurn && permanent.card.isCreature)
      bonus +=
        permanent.card.power + permanent.counters + permanent.powerMod + bonus;
    return bonus;
  }

  override toughnessBonus(permanent: Permanent): number {
    let bonus =
      super.toughnessBonus(permanent) +
      (permanent.card.name === PYREWOOD_GEARHULK ? 0 : this.pumpThisTurn);
    if (this.isDoubledThisTurn && permanent.card.isCreature)
      bonus += permanent.card.toughness + permanent.counters + bonus;
    return bonus;
  }

  // ================================================================ spells we cast
  /** Ruric Thar: a noncreature spell of ours costs us 6 life. (An opponent's costs it the 6: the engine's
   *  opponent-cast triggers.) */
  override podAnnounceCast(card: CardDef): void {
    super.podAnnounceCast(card);
    if (!card.isCreature && this.isOnBattlefield(RURIC_THAR)) {
      this.say(`${card.name}: 6 damage to us from`, RURIC_THAR);
      this.loseLife(6);
    }
  }

  // ================================================================ enter
  /** Its own enter trigger, then what a creature enters with (riot) and the others' triggers, as Thantis always had
   *  it. */
  override onEnter(permanent: Permanent, from: Zone): void {
    enterTriggerOfCommonCard(this, permanent);
    const card = permanent.card;
    if (card.isCreature) this.creatureEntered(permanent);
    triggersOfOthersOnEnter(this, permanent, from);
    switch (card.name) {
      case GRAVE_VENERATIONS:
        this.isMonarch = true;
        break;
      case PYREWOOD_GEARHULK:
        this.pumpThisTurn += 2;
        break;
      case GARRUKS_UPRISING:
        if (this.creatures().some((other) => this.power(other) >= 4))
          this.draw(1);
        break;
      case DELLIAN_FEL:
        this.useDellianFel();
        break;
    }
  }

  /** A creature of ours entered: riot (the engine's Rhythm of the Wild), Garruk's Uprising, Selvala. The last two
   *  look at its power before riot's counter, as Thantis always had it. */
  creatureEntered(permanent: Permanent): void {
    const power = this.power(permanent);
    replacementsAsAnotherOfOursEnters(this, permanent);
    if (power >= 4 && this.isOnBattlefield(GARRUKS_UPRISING)) this.draw(1);
    if (
      permanent.card.name !== SELVALA &&
      this.isOnBattlefield(SELVALA) &&
      this.creatures().every(
        (other) => other === permanent || this.power(other) < power,
      )
    )
      this.draw(1);
  }

  /** Professor Dellian Fel: +2 (gain 3) when we are low on life, else 0 (draw a card, lose 1 life). We use her at
   *  each upkeep; her loyalty and -3 (destroy a creature) are not modelled. */
  useDellianFel(): void {
    if (this.myLife < 12) this.gainLife(3);
    else {
      this.draw(1);
      this.loseLife(1);
    }
  }

  // ================================================================ deaths
  override onDies(permanent: Permanent): void {
    deathTriggerOfCommonCard(this, permanent);
    this.creatureDied(permanent);
    for (let i = 0; i < this.countOnBattlefield(GRAVE_VENERATIONS); i++) {
      this.drainEach(1);
      this.gainLife(1);
    }
    triggersOnDeath(this, permanent); // Dictate of Erebos, Spinner of Souls, Meren's experience
    if (
      !permanent.token &&
      (this.isOnBattlefield(AVACYN) || permanent.card.name === AVACYN)
    )
      this.creatureCardsAvacynReturns.push(permanent.card);
  }

  /** A creature of another player died (a pod). */
  override onOtherPlayersCreatureDies(permanent: Permanent): void {
    this.creatureDied(permanent);
    triggersOnOtherPlayersCreatureDeath(this, permanent); // Sangromancer
  }

  /** Any creature died (ours or not): Syr Konrad drains each opponent 1, Morbid Opportunist draws (once a turn). */
  creatureDied(_permanent: Permanent): void {
    for (let i = 0; i < this.countOnBattlefield(SYR_KONRAD); i++)
      this.drainEach(1);
    if (
      this.isOnBattlefield(MORBID_OPPORTUNIST) &&
      !this.hasMorbidOpportunistDrawn
    ) {
      this.hasMorbidOpportunistDrawn = true;
      this.draw(1);
    }
  }

  /** Syr Konrad: a creature card leaving our graveyard (reanimated, returned to hand) drains each opponent 1. */
  override takeCard(card: CardDef, fromZone: CardListZone): void {
    super.takeCard(card, fromZone);
    if (fromZone === 'graveyard' && card.isCreature)
      for (let i = 0; i < this.countOnBattlefield(SYR_KONRAD); i++)
        this.drainEach(1);
  }

  // ================================================================ upkeep and end step
  /** Our upkeep triggers in Thantis's order: the engine's cards first, then Neyith, Indulgent Tormentor and Dellian Fel
   *  in battlefield order (Neyith's life loss before Dellian Fel's look at our life, as Thantis always had it). */
  override upkeep(): void {
    for (const permanent of this.battlefield.slice())
      if (permanent.card.name !== NEYITH) upkeepTriggerOf(this, permanent);
    for (const permanent of this.battlefield.slice())
      switch (permanent.card.name) {
        case NEYITH:
          upkeepTriggerOf(this, permanent);
          break;
        case 'Indulgent Tormentor': {
          // (the opponent pays 3 life rather than give us a card)
          const target = this.chooseTargetOpponent();
          if (target !== null) this.damageOpponent(target, 3);
          break;
        }
        case DELLIAN_FEL:
          this.useDellianFel();
          break;
      }
  }

  override endStep(): void {
    this.pumpThisTurn = 0;
    this.isDoubledThisTurn = false;
    if (this.isMonarch) {
      this.draw(1);
      if (this.isOnBattlefield(GRAVE_VENERATIONS))
        returnBestCreatureCardToHand(this);
    }
    this.merenReturnsCreature();
    endStepTriggers(this); // Alesha
    this.avacynReturnsCreatures();
  }

  /** Meren: the best creature card in our graveyard comes back, to the battlefield if its mana value is no more
   *  than our experience, else to our hand. */
  merenReturnsCreature(): void {
    if (!this.isOnBattlefield(MEREN)) return;
    const creature = this.bestCreatureInGraveyard();
    if (!creature) return;
    if (creature.manaValue <= this.experienceCounters) this.reanimate(creature);
    else returnBestCreatureCardToHand(this);
  }

  /** Avacyn: the nontoken creatures of ours that died this turn come back. */
  avacynReturnsCreatures(): void {
    const dead = this.creatureCardsAvacynReturns.splice(0);
    for (const card of dead)
      if (this.graveyard.includes(card)) this.reanimate(card);
  }

  // ================================================================ combat
  /** Zopandrel doubles our creatures' power and toughness at the beginning of combat. */
  override combat(): void {
    if (this.isOnBattlefield(ZOPANDREL)) this.isDoubledThisTurn = true;
    super.combat();
  }

  /** Each creature's combat damage trigger (Glissa Sunslayer), then Whip of Erebos's lifelink for it, as Thantis
   *  always had it. */
  override onCombatDamage(connected: Permanent[]): void {
    this.gainLifeFromLifelink(connected);
    for (const permanent of connected) {
      combatDamageTriggerOf(this, permanent);
      if (
        this.isOnBattlefield(WHIP_OF_EREBOS) &&
        !permanent.card.keywords.has('lifelink')
      )
        this.gainLife(this.power(permanent));
    }
  }

  // ================================================================ the planner and the pod
  override positionValue(): number {
    let value = super.positionValue();
    if (this.isOnBattlefield(THANTIS)) value += 40;
    if (this.isOnBattlefield(SYR_KONRAD)) value += 20;
    return value;
  }

  candidates(main2: boolean): Candidate[] {
    return buildCandidates(this, main2);
  }
}
