/**
 * Helga, Skittish Seer's deck (Friend 2's, Bant ramp into big creatures, pod-only): the rules of its own cards.
 * The win, combat, values and the planner's score come from the engine's CreatureDeckGame.
 *
 * Files: cards.ts (names, values, tokens), game.ts (this file), candidates.ts (what the AI may do now).
 *
 * Helga: each creature spell with mana value 4 or more draws a card, gains 1 life and grows her; she taps for
 * mana equal to her power, for those creature spells only (castWithHelga).
 */
import {
  AKROMAS_MEMORIAL,
  ANNIHILATOR,
  CRATERHOOF,
  DEFILER_COUNTERS_IN_A_POD,
  GORECLAW,
  HELGA,
  KOMA,
  LIGHTNING_GREAVES,
  OB_NIXILIS,
  RADAGAST,
  REGAL_BEHEMOTH,
  TERASTODON_MINIMUM_TARGET_VALUE,
  TOKENS,
  ULAMOG_THE_DEFILER,
  VALUE,
} from './cards';
import { buildCandidates } from './candidates';
import { CardDef, Cost } from '../../engine/cards/cards';
import { Answer } from '../../engine/game/answers';
import { Candidate, Permanent, Zone } from '../../engine/game/game-types';
import { CreatureDeckGame } from '../../engine/game/creature-deck';
import {
  enterTriggerOfCommonCard,
  upkeepOfCommonCards,
} from '../../engine/game/common-permanents';

type Colour = 'W' | 'U' | 'G';

const EXILE_ANY_PERMANENT: Answer = {
  kind: 'removal',
  instant: false,
  hits: ['creature', 'artifact', 'enchantment', 'planeswalker'],
  how: 'exile',
};
const EXILE_ARTIFACT_OR_ENCHANTMENT: Answer = {
  kind: 'removal',
  instant: false,
  hits: ['artifact', 'enchantment'],
  how: 'exile',
};
/** The owner gets a 3/3 for each (the engine's token3; Terastodon's is a green Elephant). */
const DESTROY_NONCREATURE_PERMANENT: Answer = {
  kind: 'removal',
  instant: false,
  hits: ['artifact', 'enchantment', 'planeswalker'],
  how: 'destroy',
  gives: 'token3',
};

/** No coloured pips: an Eldrazi, an artifact creature, a colourless token. */
function isColourless(card: CardDef): boolean {
  const cost = card.cost;
  return (
    cost.white +
      cost.blue +
      cost.black +
      cost.red +
      cost.green +
      cost.hybrid ===
    0
  );
}

export class HelgaGame extends CreatureDeckGame {
  override colors = ['G', 'W', 'U'];
  readonly values = VALUE;

  /** Until end of turn: +X/+X to our creatures (Craterhoof Behemoth, Become the Avalanche). */
  pumpThisTurn = 0;
  creatureSpellsThisTurn = 0;
  lifeGainedThisTurn = 0;
  /** Regal Behemoth made us the monarch: a card at each end step (others taking it is not modelled). */
  isMonarch = false;

  override startTurn(): void {
    super.startTurn();
    this.pumpThisTurn = 0;
    this.creatureSpellsThisTurn = 0;
    this.lifeGainedThisTurn = 0;
  }

  override gainLife(amount: number): void {
    if (amount <= 0) return;
    super.gainLife(amount);
    this.lifeGainedThisTurn += amount;
  }

  // ================================================================ costs and Helga's mana
  /** Goreclaw: creature spells with power 4 or more cost {2} less. Radagast: the first creature spell each turn. */
  override effectiveCost(
    card: CardDef,
    base: Cost | null = null,
    fromGraveyard = false,
  ): Cost {
    const cost = super.effectiveCost(card, base, fromGraveyard);
    if (!card.isCreature) return cost;
    let reduction = 0;
    if (card.power >= 4 && this.isOnBattlefield(GORECLAW)) reduction += 2;
    if (this.creatureSpellsThisTurn === 0 && this.isOnBattlefield(RADAGAST))
      reduction += 2;
    return cost.withGeneric(Math.max(0, cost.generic - reduction));
  }

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

  // ================================================================ cast triggers
  override castPerm(card: CardDef, fromCommand = false): boolean {
    if (!super.castPerm(card, fromCommand)) return false;
    if (card.isCreature) {
      this.creatureSpellsThisTurn++;
      this.creatureCastTriggers(card);
    }
    return true;
  }

  /** "When you cast" triggers: Helga's, and the Eldrazi's own. */
  creatureCastTriggers(card: CardDef): void {
    const helga = this.findPermanent(HELGA);
    if (helga && card.manaValue >= 4) {
      this.draw(1);
      this.gainLife(1);
      helga.counters++;
    }
    switch (card.name) {
      case 'Kozilek, Butcher of Truth':
        this.draw(4);
        break;
      case 'Kozilek, the Broken Reality':
        this.draw(4); // two opponents manifest two cards each
        break;
      case 'Desolation Twin':
        this.createTokens(TOKENS.eldrazi);
        break;
      case 'Apex Devastator':
        for (let i = 0; i < 4; i++) this.cascade(card.manaValue);
        break;
      case 'Ulamog, the Ceaseless Hunger':
        this.removeInPod(EXILE_ANY_PERMANENT, card.name, 2, 0);
        break;
    }
  }

  /** An enters or cast trigger that removes up to `count` of the opponents' permanents (a pod only: in a goldfish
   *  game they have none worth taking). Each one must be worth at least `minimumValue`. */
  removeInPod(
    answer: Answer,
    sourceName: string,
    count: number,
    minimumValue: number,
  ): void {
    if (!this.inArena()) return;
    for (let i = 0; i < count; i++)
      if (!this.arena!.snipe(this, answer, sourceName, minimumValue)) return;
  }

  /** Cascade: from the top, the first nonland card that costs less; a permanent is cast for free, the rest
   *  (and an instant or sorcery found) go to the bottom. */
  cascade(manaValue: number): void {
    const exiled: CardDef[] = [];
    let found: CardDef | null = null;
    while (this.library.length) {
      const card = this.takeTopCardsOfLibrary(1)[0];
      if (card.land === null && card.manaValue < manaValue) {
        found = card;
        break;
      }
      exiled.push(card);
    }
    if (found && !found.isInstantOrSorcery) {
      this.say('cascade into', found);
      this.enter(found, 'library');
      if (found.isCreature) this.creatureCastTriggers(found);
    } else if (found) exiled.push(found);
    this.putCards(exiled, 'library');
  }

  // ================================================================ enter, upkeep, end step
  override onEnter(permanent: Permanent, _from: Zone): void {
    enterTriggerOfCommonCard(this, permanent);
    const card = permanent.card;
    if (card.isCreature) this.creatureEntered(permanent);
    if (card.name === "Garruk's Uprising" && this.hasCreatureWithPower(4))
      this.draw(1);
    if (card.name === REGAL_BEHEMOTH) this.isMonarch = true;
    if (card.name === ULAMOG_THE_DEFILER && this.inArena())
      permanent.counters += DEFILER_COUNTERS_IN_A_POD;
    if (card.name === 'Terastodon')
      this.removeInPod(
        DESTROY_NONCREATURE_PERMANENT,
        card.name,
        3,
        TERASTODON_MINIMUM_TARGET_VALUE,
      );
    if (card.name === 'Angel of the Ruins')
      this.removeInPod(EXILE_ARTIFACT_OR_ENCHANTMENT, card.name, 2, 0);
    if (card.name === CRATERHOOF) this.pumpThisTurn += this.creatures().length;
  }

  /** A creature of ours entered: card draw engines, Verdant Sun's Avatar, Lightning Greaves (equip {0}: haste). */
  creatureEntered(permanent: Permanent): void {
    if (this.isOnBattlefield(LIGHTNING_GREAVES)) permanent.sick = false;
    const power = this.power(permanent);
    if (power >= 4 && this.isOnBattlefield("Garruk's Uprising")) this.draw(1);
    if (power >= 3 && this.isOnBattlefield('Elemental Bond')) this.draw(1);
    if (
      !permanent.token &&
      this.isOnBattlefield('Guardian Project') &&
      this.battlefield.filter(
        (other) => other.card.name === permanent.card.name,
      ).length === 1 &&
      !this.graveyard.some((card) => card.name === permanent.card.name)
    )
      this.draw(1);
    for (const avatar of this.battlefield)
      if (avatar.card.name === "Verdant Sun's Avatar")
        this.gainLife(this.toughness(permanent));
  }

  hasCreatureWithPower(power: number): boolean {
    return this.creatures().some((permanent) => this.power(permanent) >= power);
  }

  override upkeep(): void {
    upkeepOfCommonCards(this);
    if (
      this.isOnBattlefield('Colossal Majesty') &&
      this.hasCreatureWithPower(4)
    )
      this.draw(1);
  }

  override endStep(): void {
    if (this.lifeGainedThisTurn > 0)
      for (const permanent of this.battlefield.slice())
        if (permanent.card.name === OB_NIXILIS) this.createTokens(TOKENS.angel);
    if (this.isMonarch) this.draw(1);
  }

  // ================================================================ power and combat
  override powerBonus(permanent: Permanent): number {
    let bonus = this.pumpThisTurn;
    if (
      permanent.card.name === 'Stormsurge Kraken' &&
      this.isOnBattlefield(HELGA)
    )
      bonus += 2;
    if (this.isOtherColourlessUnderKozilek(permanent)) bonus += 3;
    return bonus;
  }

  override toughnessBonus(permanent: Permanent): number {
    let bonus = this.pumpThisTurn;
    if (
      permanent.card.name === 'Stormsurge Kraken' &&
      this.isOnBattlefield(HELGA)
    )
      bonus += 2;
    if (this.isOtherColourlessUnderKozilek(permanent)) bonus += 2;
    return bonus;
  }

  /** Kozilek, the Broken Reality: other colourless creatures get +3/+2. */
  isOtherColourlessUnderKozilek(permanent: Permanent): boolean {
    return (
      permanent.card.name !== 'Kozilek, the Broken Reality' &&
      isColourless(permanent.card) &&
      this.isOnBattlefield('Kozilek, the Broken Reality')
    );
  }

  /** Akroma's Memorial gives every creature flying. */
  override evasive(permanent: Permanent): boolean {
    return super.evasive(permanent) || this.isOnBattlefield(AKROMAS_MEMORIAL);
  }

  /** Annihilator N: when it attacks, the defending player sacrifices N permanents (before blocks). */
  annihilatorOf(permanent: Permanent): number {
    return permanent.card.name === ULAMOG_THE_DEFILER
      ? permanent.counters
      : (ANNIHILATOR[permanent.card.name] ?? 0);
  }

  override strike(
    slot: number,
    attackers: Permanent[],
    powerOf?: (permanent: Permanent) => number,
    toughnessOf?: (permanent: Permanent) => number,
  ): { damage: number; connected: Permanent[] } {
    for (const attacker of attackers) {
      const sacrifices = this.annihilatorOf(attacker);
      if (sacrifices > 0)
        this.arena!.annihilate(this, slot, sacrifices, attacker.card.name);
    }
    return super.strike(slot, attackers, powerOf, toughnessOf);
  }

  override onCombatDamage(connected: Permanent[]): void {
    super.onCombatDamage(connected);
    if (this.isOnBattlefield('Ohran Frostfang')) this.draw(connected.length);
    for (const permanent of connected)
      if (permanent.card.name === KOMA) this.createTokens(TOKENS.serpent, 4);
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
      case "Rishkar's Expertise":
        this.draw(this.greatestPower());
        this.castFreeFromHand(5);
        break;
    }
  }

  greatestPower(): number {
    return Math.max(
      0,
      ...this.creatures().map((permanent) => this.power(permanent)),
    );
  }

  /** Rishkar's Expertise: the permanent we want most with mana value up to this, for free. */
  castFreeFromHand(maxManaValue: number): void {
    const choices = this.hand.filter(
      (card) =>
        card.land === null &&
        !card.isInstantOrSorcery &&
        card.manaValue <= maxManaValue,
    );
    if (!choices.length) return;
    const best = choices.reduce((first, second) =>
      this.battlefieldValue(second) > this.battlefieldValue(first)
        ? second
        : first,
    );
    this.takeCard(best, 'hand');
    this.say('cast for free:', best);
    this.enter(best);
    if (best.isCreature) this.creatureCastTriggers(best);
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
