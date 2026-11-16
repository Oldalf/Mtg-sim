/**
 * Ardyn, the Usurper's deck (Friend 3's mono-black Demons, pod-only): the rules of its own cards.
 * The win, combat, values and the planner's score come from the engine's CreatureDeckGame.
 *
 * Files: cards.ts (names, values, the Demon check), game.ts (this file), candidates.ts (what the AI may do now).
 *
 * Ardyn gives Demons menace, lifelink and haste, and at each of our combats makes a 5/5 Demon token copy of a
 * creature card from our graveyard (Starscourge). Roaming Throne (Demon) makes Demons' triggers trigger twice.
 */
import {
  ARDYN,
  BLOODLETTER,
  EXQUISITE_BLOOD,
  STARSCOURGE_COPIES,
  VALUE,
  VILIS,
  isBlack,
  isDemon,
} from './cards';
import { buildCandidates } from './candidates';
import { CardDef, Cost, makeToken } from '../../engine/cards/cards';
import { Candidate, Permanent, Zone } from '../../engine/game/game-types';
import { CreatureDeckGame } from '../../engine/game/creature-deck';
import {
  deathTriggerOfCommonCard,
  enterTriggerOfCommonCard,
  upkeepOfCommonCards,
} from '../../engine/game/common-permanents';
import {
  enterTriggerCount,
  triggerCount,
} from '../../engine/game/trigger-doublers';

export class ArdynGame extends CreatureDeckGame {
  override colors = ['B'];
  readonly values = VALUE;

  /** Each opponent's life at the start of our turn (Archfiend of Despair). */
  lifeAtTurnStart: number[] = [];

  override roamingThroneType(): string | null {
    return 'Demon';
  }

  override startTurn(): void {
    super.startTurn();
    this.lifeAtTurnStart = this.life.slice();
  }

  // ================================================================ mana and costs
  /** Crypt Ghast and Nirkana Revenant: each Swamp makes an extra {B}; Gauntlet of Power (black) for basic Swamps,
   *  Caged Sun (black) for any land tapped for black. */
  override tap(permanent: Permanent, short: string): void {
    super.tap(permanent, short);
    if (permanent.land === null || !permanent.land.swamp) return;
    let extra =
      this.countOnBattlefield('Crypt Ghast') +
      this.countOnBattlefield('Nirkana Revenant') +
      this.countOnBattlefield('Caged Sun');
    if (permanent.land.basic)
      extra += this.countOnBattlefield('Gauntlet of Power');
    this.pool.B += extra;
  }

  /** Throne of Eldraine: four mana for black spells (played as four colourless). */
  override manaSourceKind(
    permanent: Permanent,
    ignoreSick = false,
  ): string | null {
    if (permanent.card.name === 'Throne of Eldraine') return 'C4';
    return super.manaSourceKind(permanent, ignoreSick);
  }

  override effectiveCost(
    card: CardDef,
    base: Cost | null = null,
    fromGraveyard = false,
  ): Cost {
    const cost = super.effectiveCost(card, base, fromGraveyard);
    let reduction = 0;
    if (card.cost.black > 0)
      reduction += this.countOnBattlefield('Jet Medallion');
    if (isDemon(card))
      reduction += this.countOnBattlefield('Ancient Cellarspawn');
    if (card.isCreature) {
      if (card.cost.black > 0)
        reduction += this.countOnBattlefield("Bontu's Monument");
      reduction += 2 * this.countOnBattlefield('Heartless Summoning');
      if (isDemon(card))
        reduction +=
          2 * this.countOnBattlefield("Urza's Incubator") +
          this.countOnBattlefield("Herald's Horn");
    }
    return cost.withGeneric(Math.max(0, cost.generic - reduction));
  }

  // ================================================================ cast triggers
  override castPerm(card: CardDef, fromCommand = false): boolean {
    const manaValue = card.manaValue;
    let cost = this.effectiveCost(card);
    if (fromCommand) cost = this.commanderCost(card, cost);
    const manaSaved = manaValue - cost.manaValue;
    if (!super.castPerm(card, fromCommand)) return false;
    if (card.isCreature)
      for (let i = 0; i < this.countOnBattlefield("Bontu's Monument"); i++)
        this.drainAll(1);
    // Ancient Cellarspawn: less mana spent than the mana value, the difference is lost by an opponent
    if (manaSaved > 0)
      for (let i = 0; i < this.countOnBattlefield('Ancient Cellarspawn'); i++)
        this.loseLifeTarget(manaSaved);
    return true;
  }

  // ================================================================ life
  /** During our turn Bloodletter doubles what an opponent loses; Exquisite Blood and Bloodthirsty Conqueror give
   *  it back to us as life. */
  override damageOpponent(i: number, amount: number): number {
    const doubled = amount * 2 ** this.countOnBattlefield(BLOODLETTER);
    const lost = super.damageOpponent(i, doubled);
    if (lost > 0) {
      let lifeBack = this.countOnBattlefield(EXQUISITE_BLOOD);
      for (const conqueror of this.battlefield)
        if (conqueror.card.name === 'Bloodthirsty Conqueror')
          lifeBack += triggerCount(this, conqueror);
      this.gainLife(lifeBack * lost);
    }
    return lost;
  }

  /** Vilis: whenever we lose life, we draw that many cards. */
  override loseLife(amount: number): void {
    super.loseLife(amount);
    if (amount <= 0 || this.died) return;
    for (const vilis of this.battlefield)
      if (vilis.card.name === VILIS)
        this.draw(amount * triggerCount(this, vilis));
  }

  /** Each opponent loses n and we gain what they lost. */
  drainAll(amount: number): void {
    this.gainLife(this.drainEach(amount));
  }

  loseLifeTarget(amount: number): void {
    const target = this.chooseTargetOpponent();
    if (target !== null) this.damageOpponent(target, amount);
  }

  // ================================================================ enter and die
  override onEnter(permanent: Permanent, _from: Zone): void {
    enterTriggerOfCommonCard(this, permanent);
    if (isDemon(permanent.card) && this.isOnBattlefield(ARDYN))
      permanent.sick = false; // Ardyn: Demons have haste
    const triggers = enterTriggerCount(this, permanent);
    for (let i = 0; i < triggers; i++) this.enterTrigger(permanent);
  }

  enterTrigger(permanent: Permanent): void {
    switch (permanent.card.name) {
      case 'Gray Merchant of Asphodel':
        this.drainAll(this.devotion('B'));
        break;
      case 'Rune-Scarred Demon':
      case 'Burning-Rune Demon': // (an opponent picks one of two: we get the one we want, roughly)
        this.doTutor(() => true, false);
        break;
      case 'Demonlord Belzenlok':
        this.belzenlokDigs();
        break;
      case 'Disciple of Bolas':
        this.sacrificeForDiscipleOfBolas(permanent);
        break;
    }
  }

  /** Demonlord Belzenlok: the next nonland card goes to our hand, again while it costs 4 or more; 1 damage each. */
  belzenlokDigs(): void {
    for (let i = 0; i < 10 && this.library.length; i++) {
      const nonland = this.library.find((card) => card.land === null);
      if (!nonland) return;
      const skipped = this.library.indexOf(nonland);
      const exiled = this.takeTopCardsOfLibrary(skipped);
      this.putCards(exiled, 'exile');
      this.takeCard(nonland, 'library');
      this.putCard(nonland, 'hand');
      this.loseLife(1);
      if (nonland.manaValue < 4) return;
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

  override onDies(permanent: Permanent): void {
    deathTriggerOfCommonCard(this, permanent);
    for (const other of this.battlefield) {
      const triggers = triggerCount(this, other);
      switch (other.card.name) {
        case 'Harvester of Souls':
          if (!permanent.token) this.draw(triggers);
          break;
        case 'Ob Nixilis, Unshackled':
        case 'Venomcrawler':
          other.counters += triggers;
          break;
        case "Taborax, Hope's Demise":
          if (!permanent.token) other.counters += triggers;
          break;
      }
    }
  }

  // ================================================================ upkeep and end step
  override upkeep(): void {
    upkeepOfCommonCards(this);
    for (const permanent of this.battlefield.slice()) {
      const triggers = triggerCount(this, permanent);
      for (let i = 0; i < triggers; i++)
        switch (permanent.card.name) {
          case 'Bloodgift Demon':
            this.draw(1);
            this.loseLife(1);
            break;
          case 'Indulgent Tormentor': // (the opponent pays 3 life rather than give us a card)
            this.loseLifeTarget(3);
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

  override endStep(): void {
    for (const permanent of this.battlefield.slice()) {
      const triggers = triggerCount(this, permanent);
      for (let i = 0; i < triggers; i++)
        if (permanent.card.name === 'Archfiend of Despair') this.despair();
    }
    if (this.isOnBattlefield('Unholy Annex')) {
      this.draw(1);
      if (this.battlefield.some((permanent) => isDemon(permanent.card)))
        this.drainAll(2);
      else this.loseLife(2);
    }
  }

  /** Archfiend of Despair: each opponent loses the life it lost this turn, again. */
  despair(): void {
    for (let i = 0; i < this.life.length; i++) {
      const lostThisTurn =
        (this.lifeAtTurnStart[i] ?? this.life[i]) - this.life[i];
      if (lostThisTurn > 0 && this.isOpponentAlive(i))
        this.damageOpponent(i, lostThisTurn);
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

  /** Gauntlet of Power and Caged Sun (black): +1/+1 to black creatures; Heartless Summoning: -1/-1 to ours. */
  override powerBonus(permanent: Permanent): number {
    let bonus = -this.countOnBattlefield('Heartless Summoning');
    if (isBlack(permanent.card))
      bonus +=
        this.countOnBattlefield('Gauntlet of Power') +
        this.countOnBattlefield('Caged Sun');
    return bonus;
  }

  override toughnessBonus(permanent: Permanent): number {
    return this.powerBonus(permanent);
  }

  // ================================================================ spells
  override resolveOther(card: CardDef): void {
    switch (card.name) {
      case 'Will of the Abzan': {
        // with Ardyn out both modes: each opponent loses 3 (and sacrifices a creature), and a creature comes back
        if (this.isOnBattlefield(ARDYN)) this.drainEach(3);
        const creature = this.bestCreatureInGraveyard();
        if (creature) this.reanimate(creature);
        break;
      }
      case 'Demonic Counsel':
        this.doTutor((candidate) => isDemon(candidate), false);
        break;
    }
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
