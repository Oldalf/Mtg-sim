/**
 * Teval, the Balanced Scale's deck (Friend 4's Sultai self-mill and graveyard value, pod-only): its choices, Muldrotha,
 * and the cards other decks code too (Tatyova, Sheoldred, Meren, Whip of Erebos, Growth Spiral, Buried Alive, Breach
 * the Multiverse: U1b step 3). The win, combat, values and the planner's score come from the engine's
 * CreatureDeckGame; the rules of its other cards are the engine's (engine/card-rules/self-mill.ts, doublers.ts...).
 *
 * Files: cards.ts (names, values), game.ts (this file), candidates.ts (what the AI may do now).
 *
 * The engine of the deck: whenever one or more cards leave our graveyard (a reanimation, a land coming back, a card
 * returned to hand), Teval, Tormod and Teval's Judgment make Zombies; Doubling Season and Parallel Lives double
 * them. Self-mill (Teval's attack, Sidisi, Six, Lumra, the Grave-Reaver) fills the graveyard and lands come back
 * from it (landfall: Rampaging Baloths, Ob Nixilis, Tatyova, Aesi).
 */
import { MULDROTHA, TEVAL, VALUE, isZombie } from './cards';
import { buildCandidates } from './candidates';
import { CardDef } from '../../engine/cards/cards';
import { Candidate, Permanent, Zone } from '../../engine/game/game-types';
import { CreatureDeckGame } from '../../engine/game/creature-deck';
import {
  attackTriggers,
  deathTriggerOfCommonCard,
  enterTriggerOfCommonCard,
  landfallTriggerOf,
  upkeepTriggerOf,
} from '../../engine/card-rules/card-rules';
import { returnBestCreatureCardToHand } from '../../engine/card-rules/self-mill';

export class TevalGame extends CreatureDeckGame {
  override colors = ['B', 'G', 'U'];
  readonly values = VALUE;

  /** Muldrotha: a creature cast from the graveyard this turn. */
  hasCastCreatureFromGraveyard = false;

  override startTurn(): void {
    super.startTurn();
    this.hasCastCreatureFromGraveyard = false;
  }

  zombies(): Permanent[] {
    return this.creatures().filter((permanent) => isZombie(permanent.card));
  }

  /** Landfall: the engine's rules (Rampaging Baloths, Ob Nixilis, Aesi), and Tatyova (step 3), in battlefield order. */
  override onLandEnter(land: Permanent, _gone: boolean): void {
    for (const permanent of this.battlefield.slice()) {
      landfallTriggerOf(this, permanent, land);
      if (permanent.card.name === 'Tatyova, Benthic Druid') {
        this.gainLife(1);
        this.draw(1);
      }
    }
  }

  // ================================================================ enter, attack, die
  override onEnter(permanent: Permanent, _from: Zone): void {
    enterTriggerOfCommonCard(this, permanent);
  }

  override onAttack(attackers: Permanent[]): Permanent[] {
    attackTriggers(this, attackers);
    return [];
  }

  override onDies(permanent: Permanent): void {
    deathTriggerOfCommonCard(this, permanent);
    if (
      permanent.card.isCreature &&
      permanent.card.name !== 'Meren of Clan Nel Toth' &&
      this.isOnBattlefield('Meren of Clan Nel Toth')
    )
      this.gainExperience(1);
  }

  // ================================================================ upkeep and end step
  /** Upkeep: the engine's rules, and Sheoldred (step 3), in battlefield order. */
  override upkeep(): void {
    for (const permanent of this.battlefield.slice()) {
      upkeepTriggerOf(this, permanent);
      if (permanent.card.name === 'Sheoldred, Whispering One') {
        const creature = this.bestCreatureInGraveyard();
        if (creature) this.reanimate(creature);
      }
    }
  }

  /** The best creature card in our graveyard to our hand (paying life if lifeCost is set). */
  returnCreatureToHand(lifeCost = 0): boolean {
    return returnBestCreatureCardToHand(this, lifeCost);
  }

  /** Meren: the best creature card in our graveyard comes back, to the battlefield if its mana value is no more than
   *  our experience, else to our hand. */
  override endStep(): void {
    if (!this.isOnBattlefield('Meren of Clan Nel Toth')) return;
    const creature = this.bestCreatureInGraveyard();
    if (!creature) return;
    if (creature.manaValue <= this.experienceCounters) this.reanimate(creature);
    else {
      this.takeCard(creature, 'graveyard');
      this.putCard(creature, 'hand');
    }
  }

  // ================================================================ combat
  /** Whip of Erebos: our creatures have lifelink. */
  override onCombatDamage(connected: Permanent[]): void {
    super.onCombatDamage(connected);
    if (!this.isOnBattlefield('Whip of Erebos')) return;
    for (const permanent of connected)
      if (!permanent.card.keywords.has('lifelink'))
        this.gainLife(this.power(permanent));
  }

  // ================================================================ spells and Muldrotha
  override resolveOther(card: CardDef): void {
    switch (card.name) {
      case 'Growth Spiral': {
        this.draw(1);
        const land = this.hand.find((candidate) => candidate.land !== null);
        if (land) {
          this.takeCard(land, 'hand');
          const permanent = new Permanent(
            land,
            land.land,
            this.entersTapped(land),
          );
          permanent.sick = false;
          this.putOntoBattlefield(permanent);
          this.onLandEnter(permanent, false);
        }
        break;
      }
      case 'Buried Alive':
        this.buryCreatures(3);
        break;
      case 'Breach the Multiverse': {
        this.millOurselves(10);
        for (let i = 0; i < this.opponentLibrarySizes.length; i++)
          this.opponentLibrarySizes[i] = Math.max(
            0,
            this.opponentLibrarySizes[i] - 10,
          );
        const creature = this.bestCreatureInGraveyard();
        if (creature) this.reanimate(creature);
        break;
      }
    }
  }

  /** Buried Alive: the creatures we'd most like to reanimate go from the library to the graveyard. */
  buryCreatures(count: number): void {
    const creatures = this.library
      .filter((card) => card.isCreature)
      .sort(
        (first, second) =>
          this.battlefieldValue(second) - this.battlefieldValue(first),
      )
      .slice(0, count);
    for (const card of creatures) {
      this.takeCard(card, 'library');
      this.toGraveyard(card, true);
    }
    this.shuffle();
  }

  /** Muldrotha: one creature card a turn may be cast from the graveyard. */
  creatureToCastFromGraveyard(): CardDef | null {
    if (this.hasCastCreatureFromGraveyard || !this.isOnBattlefield(MULDROTHA))
      return null;
    return this.bestCreatureInGraveyard();
  }

  castCreatureFromGraveyard(card: CardDef): boolean {
    if (!this.pay(this.effectiveCost(card), false)) return false;
    this.hasCastCreatureFromGraveyard = true;
    this.takeCard(card, 'graveyard');
    this.spellsCast += 1;
    this.sayEvent('cast', 'cast from the graveyard', card);
    this.podAnnounceCast(card);
    this.enter(card, 'graveyard');
    return true;
  }

  // ================================================================ the planner and the pod
  override positionValue(): number {
    let value = super.positionValue();
    if (this.isOnBattlefield(TEVAL)) value += 60;
    value += 4 * this.graveyard.length;
    return value;
  }

  override podClose(): number {
    return Math.min(1, super.podClose() + 0.03 * this.zombies().length);
  }

  candidates(main2: boolean): Candidate[] {
    return buildCandidates(this, main2);
  }
}
