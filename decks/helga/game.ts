/**
 * Helga, Skittish Seer's deck (Friend 2's, Bant ramp into big creatures, pod-only): Helga's mana (an activated
 * ability the planner uses: castWithHelga), the cards the engine doesn't have yet (Craterhoof Behemoth and Become the
 * Avalanche's until-end-of-turn pump, Regal Behemoth's monarch) and the cards other decks code too (Lightning Greaves,
 * Garruk's Uprising, Explore: U1b step 3). Every other card's rules are in engine/card-rules/.
 * The win, combat, values and the planner's score come from the engine's CreatureDeckGame.
 *
 * Files: cards.ts (names, values, tokens), game.ts (this file), candidates.ts (what the AI may do now).
 *
 * Helga: each creature spell with mana value 4 or more draws a card, gains 1 life and grows her; she taps for
 * mana equal to her power, for those creature spells only (castWithHelga).
 */
import {
  CRATERHOOF,
  HELGA,
  LIGHTNING_GREAVES,
  REGAL_BEHEMOTH,
  VALUE,
} from './cards';
import { buildCandidates } from './candidates';
import { CardDef, Cost } from '../../engine/cards/cards';
import { Candidate, Permanent, Zone } from '../../engine/game/game-types';
import { CreatureDeckGame } from '../../engine/game/creature-deck';
import {
  enterTriggerOfCommonCard,
  triggersOfOthersOnEnter,
} from '../../engine/card-rules/card-rules';

type Colour = 'W' | 'U' | 'G';

export class HelgaGame extends CreatureDeckGame {
  override colors = ['G', 'W', 'U'];
  readonly values = VALUE;

  /** Until end of turn: +X/+X to our creatures (Craterhoof Behemoth, Become the Avalanche). */
  pumpThisTurn = 0;
  /** Regal Behemoth made us the monarch: a card at each end step (others taking it is not modelled). */
  isMonarch = false;

  override startTurn(): void {
    super.startTurn();
    this.pumpThisTurn = 0;
  }

  // ================================================================ Helga's mana
  /** Helga, untapped and able to tap: she makes mana equal to her power. */
  readyHelga(): Permanent | null {
    const helga = this.findPermanent(HELGA);
    return helga && !helga.tapped && !helga.sick ? helga : null;
  }

  /** The mana Helga can put toward this card: her power, for a creature spell with mana value 4 or more. */
  helgaManaFor(card: CardDef): number {
    const helga = this.readyHelga();
    if (!helga || !card.isCreature || card.manaValue < 4) return 0;
    return this.power(helga);
  }

  /** Helga's mana is one colour: the one the card needs most (green when it needs none). */
  helgaColourFor(card: CardDef): Colour {
    const cost = card.cost;
    if (cost.white > cost.green && cost.white >= cost.blue) return 'W';
    if (cost.blue > cost.green && cost.blue > cost.white) return 'U';
    return 'G';
  }

  /** What is left to pay after Helga's mana: the generic part first, then pips of her colour. */
  costWithHelga(card: CardDef): Cost {
    const cost = this.effectiveCost(card);
    let helgaMana = this.helgaManaFor(card);
    const fromGeneric = Math.min(helgaMana, cost.generic);
    helgaMana -= fromGeneric;
    const colour = this.helgaColourFor(card);
    const pipsPaid = (pips: number, isHelgaColour: boolean) =>
      isHelgaColour ? Math.min(helgaMana, pips) : 0;
    return new Cost(
      cost.generic - fromGeneric,
      cost.blue - pipsPaid(cost.blue, colour === 'U'),
      cost.black,
      cost.hybrid,
      cost.white - pipsPaid(cost.white, colour === 'W'),
      cost.red,
      cost.green - pipsPaid(cost.green, colour === 'G'),
    );
  }

  /** No mana is held back for an answer while Helga can help cast a big creature: her draw and growth beat a held
   *  counterspell, and the lands she pays for are the ones the reserve would have kept. */
  override podReserve(): number {
    const canCastBigCreature =
      this.readyHelga() !== null &&
      this.hand.some((card) => this.helgaManaFor(card) > 0);
    return canCastBigCreature ? 0 : super.podReserve();
  }

  /** Tap Helga for what the spell needs (no more, so nothing is left floating for other spells), then cast it. */
  castWithHelga(card: CardDef): boolean {
    const helga = this.readyHelga();
    if (!helga) return false;
    const cost = this.effectiveCost(card);
    const manaMade = Math.min(
      this.power(helga),
      cost.generic + cost.green + cost.white + cost.blue,
    );
    helga.tapped = true;
    this.pool[this.helgaColourFor(card)] += manaMade;
    this.say(`Helga taps for ${manaMade}`);
    return this.castPerm(card);
  }

  // ================================================================ enter, upkeep, end step
  /** Its own enter trigger, Lightning Greaves and Garruk's Uprising, then the others' triggers (Elemental Bond,
   *  Guardian Project, Verdant Sun's Avatar), as Helga always had it. */
  override onEnter(permanent: Permanent, from: Zone): void {
    enterTriggerOfCommonCard(this, permanent);
    const card = permanent.card;
    if (card.isCreature) {
      if (this.isOnBattlefield(LIGHTNING_GREAVES)) permanent.sick = false; // (equip {0}: haste)
      if (
        this.power(permanent) >= 4 &&
        this.isOnBattlefield("Garruk's Uprising")
      )
        this.draw(1);
    }
    triggersOfOthersOnEnter(this, permanent, from);
    if (card.name === "Garruk's Uprising" && this.hasCreatureWithPower(4))
      this.draw(1);
    if (card.name === REGAL_BEHEMOTH) this.isMonarch = true;
    if (card.name === CRATERHOOF) this.pumpThisTurn += this.creatures().length;
  }

  hasCreatureWithPower(power: number): boolean {
    return this.creatures().some((permanent) => this.power(permanent) >= power);
  }

  /** The engine's end step triggers (Ob Nixilis, the Ascended), then the monarch's card. */
  override endStep(): void {
    super.endStep();
    if (this.isMonarch) this.draw(1);
  }

  // ================================================================ power and combat
  /** The engine's bonuses and Craterhoof's (or Become the Avalanche's) pump. */
  override powerBonus(permanent: Permanent): number {
    return super.powerBonus(permanent) + this.pumpThisTurn;
  }

  override toughnessBonus(permanent: Permanent): number {
    return super.toughnessBonus(permanent) + this.pumpThisTurn;
  }

  // ================================================================ spells
  override resolveOther(card: CardDef): void {
    switch (card.name) {
      case 'Explore':
        this.draw(1); // (its extra land drop is not modelled)
        break;
      case 'Become the Avalanche':
        this.draw(
          this.creatures().filter((permanent) => this.power(permanent) >= 4)
            .length,
        );
        this.pumpThisTurn += this.hand.length;
        break;
    }
  }

  // ================================================================ the planner and the pod
  override positionValue(): number {
    let value = super.positionValue();
    const helga = this.findPermanent(HELGA);
    if (helga) value += 40 + 15 * this.power(helga);
    return value;
  }

  /** A pod: big creatures on board, and Helga's mana for the next one. */
  override podClose(): number {
    const helga = this.findPermanent(HELGA);
    return Math.min(
      1,
      super.podClose() + (helga && this.power(helga) >= 6 ? 0.2 : 0),
    );
  }

  candidates(main2: boolean): Candidate[] {
    return buildCandidates(this, main2);
  }
}
