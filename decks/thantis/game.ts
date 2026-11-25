/**
 * Thantis, the Warweaver's deck (Friend 2's Jund forced-combat deck, pod-only): the rules of its own cards.
 * The win, combat, values and the planner's score come from the engine's CreatureDeckGame; the forced attacks
 * ("attacks each combat if able", Thantis, goad) are the pod's (engine/pod).
 *
 * Files: cards.ts (names, values), game.ts (this file), candidates.ts (what the AI may do now).
 *
 * The deck makes every creature attack each combat (Thantis, Ruric Thar, Ares) and profits from the deaths:
 * Syr Konrad, Sangromancer, Grave Venerations, Dictate of Erebos and the recursion (Avacyn, Meren, Alesha).
 */
import {
  ALESHA,
  ANGER,
  ARCHON_OF_CRUELTY,
  AVACYN,
  BRAWN,
  DELLIAN_FEL,
  DICTATE_OF_EREBOS,
  GARRUKS_UPRISING,
  GEODE_RAGER,
  GLISSA,
  GRAVE_VENERATIONS,
  KARDUR,
  LAVALEAPER,
  LURKING_PREDATORS,
  MEREN,
  MORBID_OPPORTUNIST,
  PYREWOOD_GEARHULK,
  RAPH_AND_MIKEY,
  RHYTHM_OF_THE_WILD,
  RURIC_THAR,
  SANGROMANCER,
  SELVALA,
  SPINNER_OF_SOULS,
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
  upkeepOfCommonCards,
} from '../../engine/card-rules/card-rules';
import type { GameCore } from '../../engine/game/game-core';

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

  /** Lavaleaper: a basic land tapped for mana adds one more mana of that type (per Lavaleaper). */
  override tap(permanent: Permanent, short: string): void {
    super.tap(permanent, short);
    if (!permanent.land?.basic) return;
    const extra = this.countOnBattlefield(LAVALEAPER);
    if (extra > 0)
      this.pool[permanent.land.mana as keyof typeof this.pool] += extra;
  }

  // ================================================================ haste, trample, power
  /** Lavaleaper: all creatures have haste. Anger in the graveyard with a Mountain: ours have haste. */
  grantsHaste(): boolean {
    if (this.isOnBattlefield(LAVALEAPER)) return true;
    return (
      this.graveyard.some((card) => card.name === ANGER) &&
      this.battlefield.some((permanent) => permanent.land?.mountain)
    );
  }

  /** Garruk's Uprising: our creatures have trample. Brawn in the graveyard with a Forest: the same. */
  grantsTrample(): boolean {
    if (this.isOnBattlefield(GARRUKS_UPRISING)) return true;
    return (
      this.graveyard.some((card) => card.name === BRAWN) &&
      this.battlefield.some((permanent) => permanent.land?.forest)
    );
  }

  override canAttack(permanent: Permanent): boolean {
    if (super.canAttack(permanent)) return true;
    return (
      permanent.card.isCreature &&
      permanent.sick &&
      !permanent.tapped &&
      this.grantsHaste() &&
      this.power(permanent) > 0
    );
  }

  override fighter(
    permanent: Permanent,
    powerOf?: (otherPermanent: Permanent) => number,
    toughnessOf?: (otherPermanent: Permanent) => number,
  ): Fighter {
    const fighter = super.fighter(permanent, powerOf, toughnessOf);
    if (this.grantsTrample()) fighter.trample = true;
    return fighter;
  }

  override powerBonus(permanent: Permanent): number {
    let bonus =
      permanent.card.name === PYREWOOD_GEARHULK ? 0 : this.pumpThisTurn;
    if (this.isDoubledThisTurn && permanent.card.isCreature)
      bonus +=
        permanent.card.power + permanent.counters + permanent.powerMod + bonus;
    return bonus;
  }

  override toughnessBonus(permanent: Permanent): number {
    let bonus =
      permanent.card.name === PYREWOOD_GEARHULK ? 0 : this.pumpThisTurn;
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

  /** Lurking Predators: an opponent cast a spell, we reveal the top card: a creature enters. */
  override onOpponentCast(spell: CardDef, caster: GameCore<unknown>): void {
    super.onOpponentCast(spell, caster);
    if (!this.isOnBattlefield(LURKING_PREDATORS) || !this.library.length)
      return;
    const top = this.library[0];
    this.say(`${spell.name} was cast: ${LURKING_PREDATORS} reveals`, top);
    if (top.isCreature) {
      this.takeCard(top, 'library');
      this.enter(top, 'library');
    } else if (top.land !== null && this.manaSources() >= 7) {
      this.takeCard(top, 'library');
      this.putCard(top, 'library'); // to the bottom
    }
  }

  // ================================================================ enter
  override onEnter(permanent: Permanent, _from: Zone): void {
    enterTriggerOfCommonCard(this, permanent);
    const card = permanent.card;
    if (card.isCreature) this.creatureEntered(permanent);
    switch (card.name) {
      case ARCHON_OF_CRUELTY:
        this.archonStrikes();
        break;
      case 'Graveshifter':
        this.returnBestCreatureToHand();
        break;
      case GRAVE_VENERATIONS:
        this.isMonarch = true;
        break;
      case KARDUR:
        this.goadOpponents();
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

  /** A creature of ours entered: Rhythm of the Wild (riot), Garruk's Uprising, Selvala. */
  creatureEntered(permanent: Permanent): void {
    const power = this.power(permanent);
    if (!permanent.token && this.isOnBattlefield(RHYTHM_OF_THE_WILD)) {
      // riot: haste for the big ones, a +1/+1 counter for the rest
      if (power >= 4) permanent.sick = false;
      else permanent.counters += 1;
    }
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

  /** Archon of Cruelty (enters or attacks): the target opponent loses 3, we draw a card and gain 3 life.
   *  (The sacrifice and the discard are not modelled.) */
  archonStrikes(): void {
    const target = this.chooseTargetOpponent();
    if (target !== null) this.damageOpponent(target, 3);
    this.draw(1);
    this.gainLife(3);
  }

  /** Kardur: the creatures of every opponent are goaded until our next turn. */
  goadOpponents(): void {
    if (!this.inArena()) return;
    for (let slot = 0; slot < this.life.length; slot++)
      if (this.isOpponentAlive(slot)) this.arena!.goadCreatures(this, slot);
  }

  /** Geode Rager (landfall): goad the creatures of the opponent with the most power on the board. */
  override onLandEnter(permanent: Permanent, gone: boolean): void {
    super.onLandEnter(permanent, gone);
    if (gone || !this.inArena() || this.countOnBattlefield(GEODE_RAGER) === 0)
      return;
    let target: number | null = null;
    let mostPower = 0;
    for (let slot = 0; slot < this.life.length; slot++) {
      if (!this.isOpponentAlive(slot)) continue;
      const power = this.arena!.board(this, slot).reduce(
        (total, creaturePower) => total + creaturePower,
        0,
      );
      if (target === null || power > mostPower) {
        target = slot;
        mostPower = power;
      }
    }
    if (target !== null) this.arena!.goadCreatures(this, target);
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

  returnBestCreatureToHand(): boolean {
    const creature = this.bestCreatureInGraveyard();
    if (!creature) return false;
    this.takeCard(creature, 'graveyard');
    this.putCard(creature, 'hand');
    return true;
  }

  /** Reveals cards from the top of the library until a creature card; the creature is taken out and the rest go to
   *  the bottom in a random order. Returns null (nothing changes) if there is no creature card. */
  takeCreatureFromLibrary(): CardDef | null {
    const index = this.library.findIndex((card) => card.isCreature);
    if (index < 0) return null;
    const revealed = this.takeTopCardsOfLibrary(index);
    const [creature] = this.takeTopCardsOfLibrary(1);
    this.rng.shuffle(revealed);
    this.putCards(revealed, 'library');
    return creature;
  }

  // ================================================================ deaths
  override onDies(permanent: Permanent): void {
    deathTriggerOfCommonCard(this, permanent);
    this.creatureDied(permanent);
    for (let i = 0; i < this.countOnBattlefield(GRAVE_VENERATIONS); i++) {
      this.drainEach(1);
      this.gainLife(1);
    }
    if (this.isOnBattlefield(DICTATE_OF_EREBOS) && this.inArena())
      this.arena!.edict(this, false);
    if (
      !permanent.token &&
      permanent.card.name !== SPINNER_OF_SOULS &&
      this.isOnBattlefield(SPINNER_OF_SOULS)
    ) {
      const creature = this.takeCreatureFromLibrary();
      if (creature) this.putCard(creature, 'hand');
    }
    if (this.isOnBattlefield(MEREN) && permanent.card.name !== MEREN)
      this.gainExperience(1);
    if (
      !permanent.token &&
      (this.isOnBattlefield(AVACYN) || permanent.card.name === AVACYN)
    )
      this.creatureCardsAvacynReturns.push(permanent.card);
  }

  /** A creature of another player died (a pod). */
  override onOtherPlayersCreatureDies(permanent: Permanent): void {
    this.creatureDied(permanent);
    for (let i = 0; i < this.countOnBattlefield(SANGROMANCER); i++)
      this.gainLife(3);
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

  /** Thantis: whenever a creature attacks us, a +1/+1 counter on Thantis. */
  override onAttackedBy(attackerCount: number): void {
    const thantis = this.findPermanent(THANTIS);
    if (thantis) thantis.counters += attackerCount;
  }

  // ================================================================ upkeep and end step
  override upkeep(): void {
    upkeepOfCommonCards(this);
    for (const permanent of this.battlefield.slice())
      switch (permanent.card.name) {
        case 'Neyith of the Dire Hunt':
          this.draw(1);
          this.loseLife(1);
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
        this.returnBestCreatureToHand();
    }
    this.merenReturnsCreature();
    this.aleshaReturnsCreature();
    this.avacynReturnsCreatures();
  }

  /** Meren: the best creature card in our graveyard comes back, to the battlefield if its mana value is no more
   *  than our experience, else to our hand. */
  merenReturnsCreature(): void {
    if (!this.isOnBattlefield(MEREN)) return;
    const creature = this.bestCreatureInGraveyard();
    if (!creature) return;
    if (creature.manaValue <= this.experienceCounters) this.reanimate(creature);
    else this.returnBestCreatureToHand();
  }

  /** Alesha (raid): if we attacked this turn, a creature card with mana value up to her power comes back. */
  aleshaReturnsCreature(): void {
    const alesha = this.findPermanent(ALESHA);
    if (!alesha || !this.attacked) return;
    const creature = this.bestCreatureInGraveyard(
      (card) => card.manaValue <= this.power(alesha),
    );
    if (creature) this.reanimate(creature);
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

  /** Alesha's counter, Raph & Mikey's creature that joins the attack, Archon of Cruelty's attack trigger. */
  override onAttack(attackers: Permanent[]): Permanent[] {
    const joined: Permanent[] = [];
    for (const attacker of attackers)
      switch (attacker.card.name) {
        case ALESHA:
          attacker.counters += 1;
          break;
        case ARCHON_OF_CRUELTY:
          this.archonStrikes();
          break;
        case RAPH_AND_MIKEY: {
          const creature = this.takeCreatureFromLibrary();
          if (creature)
            joined.push(this.enter(creature, 'library', { tapped: true }));
          break;
        }
      }
    return joined;
  }

  /** Glissa Sunslayer draws on combat damage; Whip of Erebos gives our creatures lifelink. */
  override onCombatDamage(connected: Permanent[]): void {
    super.onCombatDamage(connected);
    for (const permanent of connected) {
      if (permanent.card.name === GLISSA && this.myLife > 5) {
        this.draw(1);
        this.loseLife(1);
      }
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
