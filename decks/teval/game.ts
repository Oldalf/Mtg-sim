/**
 * Teval, the Balanced Scale's deck (Friend 4's Sultai self-mill and graveyard value, pod-only): the rules of its
 * own cards. The win, combat, values and the planner's score come from the engine's CreatureDeckGame.
 *
 * Files: cards.ts (names, values, tokens), game.ts (this file), candidates.ts (what the AI may do now).
 *
 * The engine of the deck: whenever one or more cards leave our graveyard (a reanimation, a land coming back, a card
 * returned to hand), Teval, Tormod and Teval's Judgment make Zombies; Doubling Season and Parallel Lives double
 * them. Self-mill (Teval's attack, Sidisi, Six, Lumra, the Grave-Reaver) fills the graveyard and lands come back
 * from it (landfall: Rampaging Baloths, Ob Nixilis, Tatyova, Aesi).
 */
import {
  COLOSSAL_GRAVE_REAVER,
  MULDROTHA,
  SIDISI_BROOD_TYRANT,
  TEVAL,
  TEVALS_JUDGMENT,
  TOKENS,
  TORMOD,
  VALUE,
  isZombie,
} from './cards';
import { buildCandidates } from './candidates';
import { CardDef } from '../../engine/cards/cards';
import {
  Candidate,
  CardListZone,
  Permanent,
  Zone,
} from '../../engine/game/game-types';
import { CreatureDeckGame } from '../../engine/game/creature-deck';
import {
  deathTriggerOfCommonCard,
  enterTriggerOfCommonCard,
  upkeepOfCommonCards,
} from '../../engine/game/common-permanents';

export class TevalGame extends CreatureDeckGame {
  override colors = ['B', 'G', 'U'];
  readonly values = VALUE;

  /** Teval's Judgment: the modes chosen this turn (each once a turn). */
  judgmentModesThisTurn: string[] = [];
  /** Muldrotha: a creature cast from the graveyard this turn. */
  hasCastCreatureFromGraveyard = false;
  /** While one effect moves several cards out of the graveyard, "one or more cards leave" triggers once. */
  graveyardBatchDepth = 0;
  cardsLeftDuringBatch = false;

  override startTurn(): void {
    super.startTurn();
    this.judgmentModesThisTurn = [];
    this.hasCastCreatureFromGraveyard = false;
  }

  countOnBattlefield(name: string): number {
    return this.battlefield.filter((permanent) => permanent.card.name === name)
      .length;
  }

  zombies(): Permanent[] {
    return this.creatures().filter((permanent) => isZombie(permanent.card));
  }

  // ================================================================ cards leaving the graveyard
  override takeCard(card: CardDef, fromZone: CardListZone): void {
    super.takeCard(card, fromZone);
    if (fromZone !== 'graveyard') return;
    if (this.graveyardBatchDepth > 0) this.cardsLeftDuringBatch = true;
    else this.cardsLeftGraveyard();
  }

  /** Runs an effect that may move several cards out of the graveyard: their triggers fire once, after it. */
  asOneGraveyardEvent(effect: () => void): void {
    this.graveyardBatchDepth++;
    try {
      effect();
    } finally {
      this.graveyardBatchDepth--;
    }
    if (this.graveyardBatchDepth === 0 && this.cardsLeftDuringBatch) {
      this.cardsLeftDuringBatch = false;
      this.cardsLeftGraveyard();
    }
  }

  /** Teval and Teval's Judgment make a Zombie Druid (the Judgment draws first), Tormod a tapped Zombie. */
  cardsLeftGraveyard(): void {
    for (const permanent of this.battlefield.slice())
      switch (permanent.card.name) {
        case TEVAL:
          this.createTokens(TOKENS.zombieDruid);
          break;
        case TORMOD:
          this.createTokens(TOKENS.zombie, 1, { tapped: true });
          break;
        case TEVALS_JUDGMENT:
          this.chooseJudgmentMode();
          break;
      }
  }

  chooseJudgmentMode(): void {
    if (!this.judgmentModesThisTurn.includes('draw')) {
      this.judgmentModesThisTurn.push('draw');
      this.draw(1);
    } else if (!this.judgmentModesThisTurn.includes('zombie')) {
      this.judgmentModesThisTurn.push('zombie');
      this.createTokens(TOKENS.zombieDruid);
    }
  }

  /** A spell's resolution is one event for "one or more cards leave your graveyard". */
  override resolve(
    card: CardDef,
    fromGraveyard = false,
    mode: string | null = null,
  ): void {
    this.asOneGraveyardEvent(() => super.resolve(card, fromGraveyard, mode));
  }

  /** Doubling Season and Parallel Lives: twice the tokens each. */
  override createTokens(
    card: CardDef,
    count = 1,
    options: { tapped?: boolean } = {},
  ): Permanent[] {
    const doublers =
      this.countOnBattlefield('Doubling Season') +
      this.countOnBattlefield('Parallel Lives');
    return super.createTokens(card, count * 2 ** doublers, options);
  }

  /** Doubling Season: twice the counters. */
  addCounters(permanent: Permanent, count: number): void {
    permanent.counters +=
      count * 2 ** this.countOnBattlefield('Doubling Season');
  }

  // ================================================================ mill and lands from the graveyard
  mill(count: number): void {
    const milled = this.takeTopCardsOfLibrary(count);
    for (const card of milled) this.toGraveyard(card, true);
    const creatures = milled.filter((card) => card.isCreature);
    if (!creatures.length) return;
    for (let i = 0; i < this.countOnBattlefield(SIDISI_BROOD_TYRANT); i++)
      this.createTokens(TOKENS.zombie);
    for (let i = 0; i < this.countOnBattlefield(COLOSSAL_GRAVE_REAVER); i++) {
      const best = creatures
        .filter((card) => this.graveyard.includes(card))
        .sort(
          (first, second) =>
            this.battlefieldValue(second) - this.battlefieldValue(first),
        )[0];
      if (best) this.reanimate(best);
    }
  }

  /** Lands from the graveyard to the battlefield tapped: all of them, or the best few. One graveyard event. */
  returnLandsFromGraveyard(maxCount = Infinity): void {
    const lands = this.graveyard
      .filter((card) => card.land !== null)
      .slice(0, maxCount);
    this.asOneGraveyardEvent(() => {
      for (const card of lands) {
        this.takeCard(card, 'graveyard');
        const land = new Permanent(card, card.land, true);
        land.sick = false;
        this.putOntoBattlefield(land);
        this.onLandEnter(land, false);
      }
    });
  }

  /** Landfall: Rampaging Baloths, Ob Nixilis, the Fallen, Tatyova, Aesi. */
  override onLandEnter(_permanent: Permanent, _gone: boolean): void {
    for (const permanent of this.battlefield.slice())
      switch (permanent.card.name) {
        case 'Rampaging Baloths':
          this.createTokens(TOKENS.beast);
          break;
        case 'Ob Nixilis, the Fallen': {
          const target = this.chooseTargetOpponent();
          if (target !== null) {
            this.damageOpponent(target, 3);
            this.addCounters(permanent, 3);
          }
          break;
        }
        case 'Tatyova, Benthic Druid':
          this.gainLife(1);
          this.draw(1);
          break;
        case 'Aesi, Tyrant of Gyre Strait':
          this.draw(1);
          break;
      }
  }

  // ================================================================ enter, attack, die
  override onEnter(permanent: Permanent, _from: Zone): void {
    enterTriggerOfCommonCard(this, permanent);
    switch (permanent.card.name) {
      case SIDISI_BROOD_TYRANT:
      case COLOSSAL_GRAVE_REAVER:
        this.mill(3);
        break;
      case 'Lumra, Bellow of the Woods':
        this.mill(4);
        this.returnLandsFromGraveyard();
        break;
    }
  }

  override onAttack(attackers: Permanent[]): Permanent[] {
    for (const attacker of attackers)
      switch (attacker.card.name) {
        case TEVAL:
          this.mill(3);
          this.returnLandsFromGraveyard(1);
          break;
        case SIDISI_BROOD_TYRANT:
        case COLOSSAL_GRAVE_REAVER:
          this.mill(3);
          break;
        case 'Six':
          this.sixDigs();
          break;
      }
    for (const ascension of this.battlefield)
      if (ascension.card.name === 'Beastmaster Ascension')
        ascension.counters += attackers.length;
    return [];
  }

  /** Six: mill three, a land milled goes to our hand. */
  sixDigs(): void {
    this.mill(3);
    const land = this.graveyard.find((card) => card.land !== null);
    if (land) {
      this.takeCard(land, 'graveyard');
      this.putCard(land, 'hand');
    }
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
  override upkeep(): void {
    upkeepOfCommonCards(this);
    for (const permanent of this.battlefield.slice())
      switch (permanent.card.name) {
        case 'Endless Ranks of the Dead': {
          const newZombies = Math.floor(this.zombies().length / 2);
          if (newZombies > 0) this.createTokens(TOKENS.zombie, newZombies);
          break;
        }
        case 'The Scarab God':
          this.drainEach(this.zombies().length);
          break;
        case 'Oversold Cemetery':
          if (this.graveyard.filter((card) => card.isCreature).length >= 4)
            this.returnCreatureToHand();
          break;
        case 'Sheoldred, Whispering One': {
          const creature = this.bestCreatureInGraveyard();
          if (creature) this.reanimate(creature);
          break;
        }
        case 'Ripples of Undeath': // (at the first main phase, really)
          this.mill(3);
          if (this.myLife > 15) this.returnCreatureToHand(3);
          break;
      }
  }

  /** The best creature card in our graveyard to our hand (paying life if lifeCost is set). */
  returnCreatureToHand(lifeCost = 0): boolean {
    const creature = this.bestCreatureInGraveyard();
    if (!creature) return false;
    if (lifeCost) this.loseLife(lifeCost);
    this.takeCard(creature, 'graveyard');
    this.putCard(creature, 'hand');
    return true;
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

  // ================================================================ mana, power and combat
  /** Nyxbloom Ancient: a permanent tapped for mana makes three times as much. */
  override tap(permanent: Permanent, short: string): void {
    const poolBefore = { ...this.pool };
    super.tap(permanent, short);
    const nyxblooms = this.countOnBattlefield('Nyxbloom Ancient');
    if (!nyxblooms) return;
    for (const manaType of Object.keys(this.pool) as (keyof typeof this.pool)[])
      this.pool[manaType] +=
        (3 ** nyxblooms - 1) * (this.pool[manaType] - poolBefore[manaType]);
  }

  override powerBonus(permanent: Permanent): number {
    let bonus = 0;
    const landsOnBattlefield = this.landsOnBattlefield().length;
    if (permanent.card.name === "Multani, Yavimaya's Avatar")
      bonus +=
        landsOnBattlefield +
        this.graveyard.filter((card) => card.land !== null).length;
    if (permanent.card.name === 'Lumra, Bellow of the Woods')
      bonus += landsOnBattlefield;
    if (
      this.battlefield.some(
        (ascension) =>
          ascension.card.name === 'Beastmaster Ascension' &&
          ascension.counters >= 7,
      )
    )
      bonus += 5;
    return bonus;
  }

  override toughnessBonus(permanent: Permanent): number {
    return this.powerBonus(permanent);
  }

  /** Wonder in our graveyard and an Island: our creatures fly. */
  override evasive(permanent: Permanent): boolean {
    return (
      super.evasive(permanent) ||
      (this.graveyard.some((card) => card.name === 'Wonder') &&
        this.landsOnBattlefield().some((land) => this.islandTyped(land)))
    );
  }

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
      case 'Demonic Tutor':
        this.doTutor(() => true, false);
        break;
      case 'Vampiric Tutor':
        this.doTutor(() => true, true);
        this.loseLife(2);
        break;
      case 'Buried Alive':
        this.buryCreatures(3);
        break;
      case 'Will of the Sultai':
        this.willOfTheSultai();
        break;
      case 'Breach the Multiverse': {
        this.mill(10);
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

  /** Will of the Sultai, both modes with Teval out: mill three and return all lands from the graveyard; then
   *  +1/+1 counters equal to our lands on our best creature. */
  willOfTheSultai(): void {
    this.mill(3);
    this.returnLandsFromGraveyard();
    if (!this.isOnBattlefield(TEVAL)) return;
    const creatures = this.creatures();
    if (!creatures.length) return;
    const best = creatures.reduce((first, second) =>
      this.power(second) > this.power(first) ? second : first,
    );
    this.addCounters(best, this.landsOnBattlefield().length);
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
