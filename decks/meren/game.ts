/**
 * The Meren of Clan Nel Toth deck's AI (Golgari reanimator): the rules of its cards, what it wants to
 * do each turn, Meren's end-step loop, and the goldfish combat rules agreed for this deck (see PLAN.md).
 *
 * Files:
 *   cards.ts       the card names and the facts about them (values, which creatures do what)
 *   game.ts        this file: MerenGame, its state, turn steps, combat and tutors
 *   triggers.ts    what happens when a permanent enters the battlefield or dies
 *   candidates.ts  everything the AI may do now, with a score each
 *   actions.ts     what the abilities and spells do when the AI picks them
 *
 * Win: 2 opponents dead, or config.win_damage damage dealt in total. Second measure: first opponent dead.
 * The win check, the two numbers and goldfish combat are the engine's CreatureDeckGame (engine/game/creature-deck.ts).
 * The game itself (mana, zones, casting, turns, combat) is the shared engine in engine/game/game-core.ts.
 */
import {
  DEATH_VALUE,
  EDICT_ETB,
  FREE_OUTLETS,
  GRAY_MERCHANT,
  HOLD,
  MANA_ELVES,
  MEREN,
  TOKENS,
  VALUE,
} from './cards';
import { buildCandidates } from './candidates';
import { onPermanentDied, onPermanentEntered } from './triggers';
import { CardDef, Cost } from '../../engine/cards/cards';
import {
  Candidate,
  LogBoardView,
  Permanent,
  Zone,
} from '../../engine/game/game-types';
import { CreatureDeckGame } from '../../engine/game/creature-deck';
import { upkeepOfCommonCards } from '../../engine/game/common-permanents';
import { firstMax, sortDesc } from '../../engine/util/lists';
import { MulliganRule } from '../../engine/game/mulligan';
import { MULLIGAN } from './mulligan';

export class MerenGame extends CreatureDeckGame {
  readonly values = VALUE;
  override mulliganRule(): MulliganRule | null {
    return this.config.smart_mulligan ? MULLIGAN : null;
  }
  override colors = ['B', 'G'];
  merenCasts = 0;
  // ---- measures for --diag (they change nothing in the game)
  merenOut: number | null = null; // the turn Meren first entered the battlefield
  permanentsAtTurnEnd: number[] = []; // nonland permanents (tokens too) at the end of turns 4-6
  reanimated = 0; // creature cards that came back from a graveyard to the battlefield (Meren, Unearth, Reanimate...)
  reanimatedAtTurnEnd: number[] = []; // ... at the end of turns 4-6
  experienceAtTurnEnd: number[] = []; // Meren's experience at the end of turns 4-6
  override diag(): Record<string, number | null> {
    return {
      merenOut: this.merenOut,
      spent5: this.spentEnd[5] ?? null,
      spent6: this.spentEnd[6] ?? null,
      perms5: this.permanentsAtTurnEnd[5] ?? null,
      perms6: this.permanentsAtTurnEnd[6] ?? null,
      reanim5: this.reanimatedAtTurnEnd[5] ?? null,
      reanim6: this.reanimatedAtTurnEnd[6] ?? null,
      exp5: this.experienceAtTurnEnd[5] ?? null,
      exp6: this.experienceAtTurnEnd[6] ?? null,
    };
  }
  morbidUsed = false; // Morbid Opportunist: once each turn
  divinerUsed = false; // Twilight Diviner: once each turn
  leftThisTurn = false; // a nonland permanent left the battlefield this turn (Decode Transmissions' void)
  prepared = new Set<Permanent>(); // Studious First-Year / Grave Researcher can cast their spell copy
  lilianaUsed = false;
  gristUsed = false; // Grist: one loyalty ability per turn
  exileAtEnd: Permanent[] = []; // Puppeteer Clique's stolen creature
  sacAtEnd: Permanent[] = []; // Mobilize warriors

  // ---------------------------------------------------------------- log analyzer hooks
  override syncFromLog(board: LogBoardView): void {
    this.experienceCounters = board.trackers['Start Your Engines!'] ?? 0;
  }

  override logToken(name: string): CardDef | null {
    const lowerCaseName = name.toLowerCase();
    if (lowerCaseName.includes('demon') || lowerCaseName.includes('stolen'))
      return TOKENS.stolen; // Pontus plays stolen creatures as 5/5 Demons
    if (lowerCaseName.includes('insect')) return TOKENS.insect;
    if (lowerCaseName.includes('zombie')) return TOKENS.zombie;
    if (lowerCaseName.includes('goat')) return TOKENS.goat;
    if (lowerCaseName.includes('warrior')) return TOKENS.warrior;
    if (lowerCaseName.includes('beast')) return TOKENS.beast;
    return null;
  }

  /** Copies also need Meren's own references to permanents pointing at the copied permanents. */
  override clone(): this {
    const copy = super.clone();
    const map = new Map(
      this.battlefield.map(
        (permanent, i) =>
          [permanent, copy.battlefield[i]] as [Permanent, Permanent],
      ),
    );
    const toCopy = (permanent: Permanent) => map.get(permanent) ?? permanent;
    copy.prepared = new Set([...this.prepared].map(toCopy));
    copy.exileAtEnd = this.exileAtEnd.map(toCopy);
    copy.sacAtEnd = this.sacAtEnd.map(toCopy);
    return copy;
  }

  /** The planner's score for a position with no win yet (higher is better). */
  override positionValue(): number {
    if (this.died) return -5000;
    let value = 0;
    // progress to the win: total damage, and the two opponents closest to dead
    value += 5 * Math.min(this.config.win_damage as number, this.damageDealt);
    const lives = this.life.slice().sort((first, second) => first - second);
    const start = this.config.opp_life as number;
    for (let i = 0; i < (this.config.win_dead as number); i++)
      value += 3 * (start - Math.max(0, lives[i]));
    // the board: attackers, Gray Merchant's devotion, Meren and her experience
    for (const permanent of this.creatures()) {
      if (permanent.card.name === 'Spore Frog') value += 25;
      else
        value +=
          7 * this.power(permanent) * (permanent.card.flying ? 1.5 : 1) +
          0.25 * this.battlefieldValue(permanent.card);
    }
    value += 10 * Math.min(12, this.devotion('B'));
    if (this.isOnBattlefield(MEREN))
      value += 90 + 12 * Math.min(8, this.experienceCounters);
    else value += 6 * Math.min(8, this.experienceCounters);
    for (const battlefieldPermanent of this.battlefield)
      if (
        battlefieldPermanent.land === null &&
        !battlefieldPermanent.isCreature
      )
        value += 0.4 * this.battlefieldValue(battlefieldPermanent.card);
    // resources: creature cards to bring back, mana, cards in hand
    value += 6 * Math.min(10, this.creaturesInGraveyard());
    value += 25 * Math.min(10, this.manaSources());
    value +=
      0.4 * this.hand.reduce((total, card) => total + this.cardValue(card), 0);
    // our life after the crackback that's coming
    const life = this.myLife - (this.fogUsed ? 0 : this.pendingCrackback);
    value +=
      life <= 0
        ? -3000
        : life < 20
          ? -10 * (20 - life)
          : 0.5 * Math.min(60, life - 20);
    return value;
  }

  // ================================================================ card values
  /** Lotleth Giant grows with the creature cards in our graveyard. */
  override battlefieldValue(card: CardDef): number {
    if (card.name === 'Lotleth Giant')
      return Math.min(95, 10 * this.creaturesInGraveyard());
    return super.battlefieldValue(card);
  }

  /** Spells in hand: cards we hold for later are worth little, the others a flat 45. */
  override cardValue(card: CardDef): number {
    if (card.land !== null || card.isCreature) return super.cardValue(card);
    if (HOLD.has(card.name)) return 20;
    return 45;
  }

  override discardValue(card: CardDef): number {
    // creature cards in the graveyard are fine: Meren and reanimation get them back
    return this.cardValue(card) - (card.isCreature ? 25 : 0);
  }

  creaturesInGraveyard(): number {
    return this.graveyard.filter((card) => card.isCreature).length;
  }

  override commanderCost(card: CardDef, cost: Cost): Cost {
    return card.name === MEREN
      ? cost.withGeneric(cost.generic + 2 * this.merenCasts)
      : cost;
  }
  override onCommanderCast(card: CardDef): void {
    if (card.name === MEREN) this.merenCasts++;
  }

  // ================================================================ zones
  millOurselves(count: number): void {
    for (let i = 0; i < count && this.library.length; i++)
      this.toGraveyard(this.takeTopCardsOfLibrary(1)[0], true);
  }

  /** A basic land from the library onto the battlefield tapped. */
  fetchBasic(): void {
    const want =
      this.landsOnBattlefield().filter(
        (permanent) => permanent.land!.mana === 'G',
      ).length <=
      this.landsOnBattlefield().filter(
        (permanent) => permanent.land!.mana === 'B',
      ).length
        ? 'Forest'
        : 'Swamp';
    const card =
      this.library.find((candidate) => candidate.name === want) ??
      this.library.find((candidate) => candidate.land?.basic) ??
      null;
    if (!card) return;
    this.takeCardIfThere(card, 'library');
    this.shuffle();
    const basicLand = new Permanent(card, card.land, true);
    basicLand.sick = false;
    this.putOntoBattlefield(basicLand);
  }

  /** The basic land we'd fetch: a Forest when we have no more Forests than Swamps, else a Swamp. */
  override chooseLandToFetch(candidates: CardDef[], _toHand: boolean): CardDef {
    const want =
      this.landsOnBattlefield().filter(
        (permanent) => permanent.land!.mana === 'G',
      ).length <=
      this.landsOnBattlefield().filter(
        (permanent) => permanent.land!.mana === 'B',
      ).length
        ? 'Forest'
        : 'Swamp';
    return candidates.find((card) => card.name === want) ?? candidates[0];
  }

  /** Eternal Witness: the card we want most, a noncreature first (Meren brings creatures back anyway). */
  override returnToHandValue(card: CardDef): number {
    return this.cardValue(card) + (card.isCreature ? 0 : 10);
  }

  /** Our creatures in the order we'd sacrifice them (cheapest loss first). */
  sacrificeOrder(exclude: Permanent[] = []): Permanent[] {
    const sacValue = (permanent: Permanent): number => {
      if (permanent.card === TOKENS.stolen) return 80;
      if (permanent.token) return 5 + this.power(permanent);
      if (DEATH_VALUE.has(permanent.card.name) && this.isOnBattlefield(MEREN))
        return 10;
      if (MANA_ELVES.has(permanent.card.name) && this.turn >= 5) return 15;
      if (
        EDICT_ETB.has(permanent.card.name) ||
        permanent.card.name === 'Satyr Wayfinder' ||
        permanent.card.name === 'Studious First-Year'
      )
        return 20;
      return this.battlefieldValue(permanent.card);
    };
    return sortDesc(
      this.creatures().filter(
        (permanent) =>
          !exclude.includes(permanent) &&
          permanent.card.name !== MEREN &&
          permanent.card.name !== 'Spore Frog' &&
          permanent.card.name !== 'Twilight Diviner',
      ),
      (permanent) => -sacValue(permanent),
    );
  }

  findFreeSacrificeOutlet(): Permanent | null {
    for (const name of FREE_OUTLETS) {
      const permanent = this.findPermanent(name);
      if (permanent) return permanent;
    }
    return null;
  }

  // ================================================================ triggers
  override onEnter(permanent: Permanent, from: Zone): void {
    onPermanentEntered(this, permanent, from);
  }

  override onDies(permanent: Permanent): void {
    onPermanentDied(this, permanent);
  }

  override powerBonus(permanent: Permanent): number {
    return permanent.card.name === 'Wight of the Reliquary'
      ? this.creaturesInGraveyard()
      : 0;
  }
  override toughnessBonus(permanent: Permanent): number {
    return permanent.card.name === 'Wight of the Reliquary'
      ? this.creaturesInGraveyard()
      : 0;
  }

  // ================================================================ turn steps
  override startTurn(): void {
    if (this.turn >= 4 && this.turn <= 6) {
      this.permanentsAtTurnEnd[this.turn] = this.battlefield.filter(
        (permanent) => permanent.land === null,
      ).length;
      this.reanimatedAtTurnEnd[this.turn] = this.reanimated;
      this.experienceAtTurnEnd[this.turn] = this.experienceCounters;
    }
    super.startTurn();
    this.morbidUsed =
      this.divinerUsed =
      this.leftThisTurn =
      this.gristUsed =
        false;
  }

  override upkeep(): void {
    // the opponents' turns happened: crackback, unless Spore Frog prevents it (then it's sacrificed)
    const frog = this.findPermanent('Spore Frog');
    if (frog && this.fogUsed) {
      this.say('Spore Frog prevents the crackback');
      this.sacrifice(frog);
    } else if (this.pendingCrackback > 0) {
      this.loseLife(this.pendingCrackback);
      this.say(
        `crackback: we take ${this.pendingCrackback}, life ${this.myLife}`,
      );
    }
    this.pendingCrackback = 0;
    this.fogUsed = false;
    upkeepOfCommonCards(this);
    this.makeOphiomancerSnake();
    for (const researcher of this.battlefield.filter(
      (permanent) => permanent.card.name === 'Grave Researcher',
    )) {
      this.scry(1, true);
      if (this.creaturesInGraveyard() >= 3) this.prepared.add(researcher);
    }
  }

  override opponentUpkeep(): void {
    this.makeOphiomancerSnake();
  }

  /** Ophiomancer: at the beginning of each upkeep, a deathtouch Snake if we control none. */
  private makeOphiomancerSnake(): void {
    if (
      this.isOnBattlefield('Ophiomancer') &&
      !this.battlefield.some((permanent) => permanent.card === TOKENS.snake)
    )
      this.createTokens(TOKENS.snake);
  }

  override endStep(): void {
    for (const permanent of this.sacAtEnd)
      if (this.battlefield.includes(permanent)) this.sacrifice(permanent);
    this.sacAtEnd = [];
    for (const exiledPermanent of this.exileAtEnd) {
      if (this.takeFromBattlefieldIfThere(exiledPermanent))
        this.leftThisTurn = true;
    }
    this.exileAtEnd = [];
    if (this.isOnBattlefield(MEREN)) this.feedMerenAtEndStep();
    this.checkKill();
  }

  /** Feed Meren with a free sacrifice outlet, then return the best creature card from the graveyard. */
  feedMerenAtEndStep(): void {
    const outlet = this.findFreeSacrificeOutlet();
    if (outlet) {
      // sacrifice tokens and creatures whose death is worth something: each one is an experience counter
      for (const permanent of this.sacrificeOrder()) {
        if (permanent === outlet && outlet.card.name !== 'Viscera Seer')
          continue;
        if (
          permanent.card === TOKENS.stolen ||
          FREE_OUTLETS.includes(permanent.card.name)
        )
          continue;
        if (permanent.token || DEATH_VALUE.has(permanent.card.name))
          this.sacrifice(permanent);
      }
      // the Gray Merchant loop: sacrifice it and let Meren bring it back (drain again)
      const grayMerchant = this.findPermanent(GRAY_MERCHANT);
      if (
        grayMerchant &&
        !grayMerchant.token &&
        this.experienceCounters + 1 >= 5
      )
        this.sacrifice(grayMerchant);
    }
    const candidates = this.graveyard.filter((card) => card.isCreature);
    if (!candidates.length) return;
    const score = (card: CardDef) =>
      card.manaValue <= this.experienceCounters
        ? this.battlefieldValue(card)
        : this.battlefieldValue(card) * 0.4;
    const best = firstMax(candidates, score);
    if (best.manaValue <= this.experienceCounters) {
      this.say(`Meren (${this.experienceCounters} experience) returns`, best);
      this.reanimate(best);
    } else {
      this.takeCardIfThere(best, 'graveyard');
      this.putCard(best, 'hand');
      this.say(
        `Meren (${this.experienceCounters} experience) returns to hand`,
        best,
      );
    }
  }

  // ================================================================ combat
  override canAttack(permanent: Permanent): boolean {
    return super.canAttack(permanent) && permanent.card.name !== 'Spore Frog';
  }
  override fogBlocker(): Permanent | null {
    return this.findPermanent('Spore Frog');
  }
  override onAttack(attackers: Permanent[]): Permanent[] {
    const extra: Permanent[] = [];
    for (const permanent of attackers) {
      if (permanent.card.name === 'Grave Titan')
        this.createTokens(TOKENS.zombie, 2);
      if (permanent.card.name === 'Avenger of the Fallen') {
        // Mobilize X: tapped and attacking 1/1s, sacrificed at the end step
        for (const warrior of this.createTokens(
          TOKENS.warrior,
          this.creaturesInGraveyard(),
          {
            tapped: true,
          },
        )) {
          extra.push(warrior);
          this.sacAtEnd.push(warrior);
        }
      }
    }
    return extra;
  }
  /** How close to winning the others think we are: Meren out, black devotion for Gray Merchant, a big graveyard. */
  override podClose(): number {
    let closeness = 0;
    if (this.isOnBattlefield(MEREN)) closeness += 0.3;
    if (this.devotion('B') >= 8) closeness += 0.3;
    if (this.creaturesInGraveyard() >= 8) closeness += 0.2;
    if (
      this.isOnBattlefield('Priest of Forgotten Gods') ||
      this.isOnBattlefield('Zulaport Cutthroat')
    )
      closeness += 0.2;
    return Math.min(1, closeness);
  }
  /** A pod: Spore Frog is the fog, not a blocker. */
  override blockValue(permanent: Permanent): number {
    return permanent.card.name === 'Spore Frog'
      ? 500
      : super.blockValue(permanent);
  }
  /** A pod: sacrifice Spore Frog to prevent all combat damage this turn, when the hit is lethal or big (config.fog_at). */
  override fogPrevent(damage: number, lethal: boolean): boolean {
    const frog = this.findPermanent('Spore Frog');
    if (!frog || (!lethal && damage < ((this.config.fog_at as number) ?? 6)))
      return false;
    this.sacrifice(frog);
    return true;
  }

  // ================================================================ tutors
  tutorPriorities(): string[] {
    const wantedNames: string[] = [];
    if (!this.findFreeSacrificeOutlet())
      wantedNames.push('Viscera Seer', 'Umbral Collar Zealot', 'Woe Strider');
    wantedNames.push(
      GRAY_MERCHANT,
      'Twilight Diviner',
      'Sepulchral Primordial',
      'Grave Titan',
      'Morbid Opportunist',
    );
    if (this.creaturesInGraveyard() >= 8) wantedNames.unshift('Lotleth Giant');
    return wantedNames;
  }

  override tutorTarget(
    allowed: (card: CardDef) => boolean,
    _toTop: boolean,
    _spent: string | null = null,
  ): CardDef | null {
    const candidates = this.library.filter(allowed);
    if (!candidates.length) return null;
    for (const name of this.tutorPriorities()) {
      const wantedCard = candidates.find(
        (card) =>
          card.name === name &&
          !this.isOnBattlefield(name) &&
          !this.hand.some((inHandCard) => inHandCard.name === name),
      );
      if (wantedCard) return wantedCard;
    }
    return firstMax(candidates, (card) => this.cardValue(card));
  }

  /** A card from the library into the graveyard (Vile Entomber, Buried Alive). */
  tutorToGraveyard(allowed: (card: CardDef) => boolean): void {
    const candidates = this.library.filter(
      (card) => allowed(card) && !this.graveyard.includes(card),
    );
    if (!candidates.length) return;
    const order = [
      GRAY_MERCHANT,
      'Sepulchral Primordial',
      'Lotleth Giant',
      'Grave Titan',
      'Protean Hulk',
      'Rune-Scarred Demon',
    ];
    const chosen =
      order
        .map((name) => candidates.find((card) => card.name === name))
        .find((card) => card) ??
      firstMax(candidates, (card) => this.battlefieldValue(card));
    this.takeCardIfThere(chosen, 'library');
    this.toGraveyard(chosen, true);
    this.shuffle();
  }

  // ================================================================ spells
  override resolveOther(
    card: CardDef,
    _fromGraveyard: boolean,
    mode: string | null,
  ): void {
    const name = card.name;
    if (name === 'Decode Transmissions') {
      this.draw(2);
      if (this.leftThisTurn) this.drainEach(2);
      else this.loseLife(2);
    } else if (name === 'Village Rites') this.draw(2);
    else if (name === 'Breach the Multiverse') {
      this.millOurselves(10);
      for (let i = 0; i < this.opponentLibrarySizes.length; i++)
        this.opponentLibrarySizes[i] = Math.max(
          0,
          this.opponentLibrarySizes[i] - 10,
        );
      const best = this.bestCreatureInGraveyard();
      if (best) this.reanimate(best);
      for (let i = 0; i < this.countOpponentsAlive(); i++)
        this.enter(TOKENS.stolen, 'graveyard', { token: true });
    } else if (name === 'Grisly Salvage') {
      const top = this.takeTopCardsOfLibrary(5);
      const keep = top.filter(
        (candidate) => candidate.isCreature || candidate.land !== null,
      );
      const kept = keep.length
        ? firstMax(keep, (candidate) => this.cardValue(candidate))
        : null;
      for (const otherCard of top)
        if (otherCard === kept) this.putCard(otherCard, 'hand');
        else this.toGraveyard(otherCard, true);
    } else if (name === 'Songs of the Damned')
      this.pool.B += this.creaturesInGraveyard();
    else if (name === 'Deadly Brew') {
      if (this.inArena()) this.arena!.edict(this, false);
      const permanent = this.sacrificeOrder()[0];
      if (permanent) {
        this.sacrifice(permanent);
        const back = this.graveyard.filter(
          (candidate) =>
            candidate !== permanent.card && candidate.land === null,
        );
        if (back.length) {
          const creature = firstMax(back, (candidate) =>
            this.cardValue(candidate),
          );
          this.takeCardIfThere(creature, 'graveyard');
          this.putCard(creature, 'hand');
        }
      }
    } else if (name === 'Buried Alive') {
      for (let copyNumber = 0; copyNumber < 3; copyNumber++)
        this.tutorToGraveyard((candidate) => candidate.isCreature);
    } else if (name === "Dina's Guidance") {
      if (mode === 'gy')
        this.tutorToGraveyard((candidate) => candidate.isCreature);
      else this.doTutor((candidate) => candidate.isCreature, false);
    }
  }
  candidates(main2: boolean): Candidate[] {
    return buildCandidates(this, main2);
  }
}
