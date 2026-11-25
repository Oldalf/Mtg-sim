/**
 * The Edgar Markov deck's AI (Mardu vampire tribal / aristocrats): the rules of its cards, what it
 * wants to do each turn, and the goldfish rules agreed for this deck (see PLAN.md).
 *
 * Files:
 *   cards.ts       the card names and the facts about them (values, tokens, the Vampire check)
 *   game.ts        this file: EdgarGame, its state, anthems, mana, turn steps, tutors
 *   triggers.ts    what happens when a permanent enters, dies, or when we attack
 *   actions.ts     sacrifice outlets, the all-in sacrifice turn, prepared spells, activated abilities
 *   candidates.ts  everything the AI may do now, with a score each
 *
 * Win: all three opponents at 0 life (40 each). Second measure: first opponent dead.
 * Single-target drains ("target opponent loses ...") go to the opponent closest to dead.
 * Combat is the engine's goldfish combat for creature decks (flyers connect, half the ground attackers are blocked).
 * The win check, the two numbers, card values and the planner's base score are the engine's CreatureDeckGame
 * (engine/game/creature-deck.ts).
 * The game itself (mana, zones, casting, turns) is the shared engine in engine/game/game-core.ts.
 */
import { TREASURE } from '../../engine/cards/tokens';
import {
  BLOODLINE_KEEPER,
  EDGAR,
  ELDRAZI_MONUMENT,
  EVERETH,
  BONTUS_MONUMENT,
  HERALDS_HORN,
  OKETRAS_MONUMENT,
  SORIN,
  TWILIGHT_PROPHET,
  LEGIONS_LANDING,
  PITILESS_PONTIFF,
  TOKENS,
  VALUE,
  VAMPIRE_LORDS,
  VANQUISHERS_BANNER,
  YAHENNI,
  isVampire,
} from './cards';
import { buildCandidates } from './candidates';
import { findOutlets, spareFodder } from './actions';
import {
  onPermanentAttacks,
  onPermanentDied,
  onPermanentEntered,
} from './triggers';
import { CardDef, Cost } from '../../engine/cards/cards';
import {
  Candidate,
  Permanent,
  WinAttempt,
  Zone,
} from '../../engine/game/game-types';
import { Answer } from '../../engine/game/answers';
import { CreatureDeckGame } from '../../engine/game/creature-deck';
import { upkeepOfCommonCards } from '../../engine/card-rules/card-rules';
import { MulliganRule } from '../../engine/game/mulligan';
import { firstMax } from '../../engine/util/lists';
import { MULLIGAN } from './mulligan';

/** Where damage to an opponent comes from: attacking, drain triggers (and pings), or Evereth's explosion. */
export type DamageSource = 'combat' | 'drain' | 'explosion';

export class EdgarGame extends CreatureDeckGame {
  readonly values = VALUE;
  override mulliganRule(): MulliganRule | null {
    return this.config.smart_mulligan ? MULLIGAN : null;
  }
  override colors = ['W', 'B', 'R'];

  lifeGainedThisTurn = 0;
  creaturesDiedThisTurn = 0;
  /** True while a permanent is being sacrificed (Carmen and Mayhem Devil only care about sacrifices). */
  isSacrificing = false;
  baronBertramUsed = false;
  welcomingVampireUsed = false;
  /** Emeritus of Woe and Scheming Silvertongue: their spell can be cast once. */
  prepared = new Set<Permanent>();
  /** A pod: Evereth stays on the battlefield while the others may answer her last pump (see winAttempt). */
  explosionPending: Permanent | null = null;
  // ---- where the damage to the opponents came from (for --diag: how the deck wins)
  damageSource: DamageSource = 'drain';
  damageFromCombat = 0;
  damageFromDrains = 0;
  damageFromExplosion = 0;
  /** What dealt the damage that killed the last opponent. */
  winSource: DamageSource | null = null;
  // ---- measures for --diag (they change nothing in the game)
  permanentsAtTurnEnd: number[] = []; // nonland permanents (tokens too) at the end of turns 4-6
  override diag(): Record<string, number | null> {
    return {
      spent5: this.spentEnd[5] ?? null,
      spent6: this.spentEnd[6] ?? null,
      perms5: this.permanentsAtTurnEnd[5] ?? null,
      perms6: this.permanentsAtTurnEnd[6] ?? null,
      winSource:
        this.winSource === null
          ? null
          : { combat: 1, drain: 2, explosion: 3 }[this.winSource],
      damageFromCombat: this.damageFromCombat,
      damageFromDrains: this.damageFromDrains,
      damageFromExplosion: this.damageFromExplosion,
    };
  }

  /** Copies need the references to permanents (prepared spells) to point at the copied permanents. */
  override clone(): this {
    const copy = super.clone();
    const copiedPermanent = new Map(
      this.battlefield.map(
        (permanent, i) =>
          [permanent, copy.battlefield[i]] as [Permanent, Permanent],
      ),
    );
    copy.prepared = new Set(
      [...this.prepared].map(
        (permanent) => copiedPermanent.get(permanent) ?? permanent,
      ),
    );
    return copy;
  }

  // ================================================================ drains and life
  override damageOpponent(i: number, amount: number): number {
    const lost = super.damageOpponent(i, amount);
    if (this.damageSource === 'combat') this.damageFromCombat += lost;
    else if (this.damageSource === 'explosion')
      this.damageFromExplosion += lost;
    else this.damageFromDrains += lost;
    if (this.winSource === null && this.hasWon())
      this.winSource = this.damageSource;
    return lost;
  }

  /** Runs something that deals damage with its source noted (for the win statistics). */
  withDamageSource(source: DamageSource, deal: () => void): void {
    const before = this.damageSource;
    this.damageSource = source;
    deal();
    this.damageSource = before;
  }

  /** "Target opponent loses N life and you gain N": the opponent closest to dead. */
  drainOne(amount: number): void {
    const target = this.chooseTargetOpponent();
    if (target === null) return;
    this.damageOpponent(target, amount);
    this.gainLife(amount);
  }

  /** "Each opponent loses N life and you gain N". */
  drainAllOpponents(amount: number, gainsLife = true): void {
    if (this.countOpponentsAlive() === 0) return;
    this.drainEach(amount);
    if (gainsLife) this.gainLife(amount);
  }

  override gainLife(amount: number): void {
    if (amount <= 0) return;
    super.gainLife(amount);
    this.lifeGainedThisTurn += amount;
  }

  /** How many life points the opponents lose each time one of our creatures dies (a rough count of the drain engines). */
  drainPerDeath(): number {
    const alive = this.countOpponentsAlive();
    let drain = 0;
    for (const permanent of this.battlefield) {
      switch (permanent.card.name) {
        case 'Blood Artist':
        case 'Vengeful Bloodwitch':
        case 'Susurian Voidborn':
          drain += 1;
          break;
        case 'Cruel Celebrant':
          drain += alive;
          break;
        case 'Mayhem Devil':
          drain += 0.5; // only sacrifices
          break;
      }
    }
    return drain;
  }

  // ================================================================ Vampires
  vampires(): Permanent[] {
    return this.creatures().filter((permanent) => isVampire(permanent.card));
  }

  isEdgarAvailable(): boolean {
    return (
      this.isOnBattlefield(EDGAR) ||
      this.command.some((card) => card.name === EDGAR)
    );
  }

  // ================================================================ indestructible by sacrifice
  /** Yahenni ("sacrifice another creature") and Pitiless Pontiff ({1}, sacrifice another creature) become indestructible
   *  until end of turn: a destroy or damage effect misses them (exile and bounce do not). Only once a turn costs a
   *  sacrifice. Returns what saved the creature, or null. */
  override podShield(
    permanent: Permanent,
    answer: Answer | null = null,
  ): string | null {
    const shield = super.podShield(permanent, answer);
    if (shield) return shield;
    const isDestroyed =
      answer !== null && (answer.how ?? 'destroy') === 'destroy';
    return isDestroyed ? this.makeIndestructible(permanent) : null;
  }

  /** A wipe that destroys: the same, for Yahenni and Pontiff. A creature that dies anyway is the one sacrificed. */
  override podAnswerWipe(dying: Permanent[], destroys: boolean): Permanent[] {
    if (!destroys) return [];
    return dying.filter((creature) => this.makeIndestructible(creature));
  }

  private makeIndestructible(permanent: Permanent): string | null {
    const name = permanent.card.name;
    if (name !== YAHENNI && name !== PITILESS_PONTIFF) return null;
    if (!this.battlefield.includes(permanent)) return null;
    if (this.podShielded.has(permanent)) return name; // already indestructible this turn
    const pontiffCost = Cost.parse('{1}');
    if (name === PITILESS_PONTIFF && !this.canPay(pontiffCost, true))
      return null;
    const creatureToSacrifice = spareFodder(this, [permanent], true).find(
      (spare) => spare.card.isCreature,
    );
    if (!creatureToSacrifice) return null;
    if (name === PITILESS_PONTIFF) this.pay(pontiffCost, true);
    this.sacrifice(creatureToSacrifice);
    this.podShielded.add(permanent);
    this.say(
      `  ${name}: sacrifice ${creatureToSacrifice.card.name}, indestructible`,
    );
    return name;
  }

  /** The +1/+1 the other Vampires give this Vampire: the lords, Vanquisher's Banner and Lord of Lineage. */
  vampireAnthem(permanent: Permanent): number {
    if (!isVampire(permanent.card)) return 0;
    let bonus = 0;
    for (const other of this.battlefield) {
      const name = other.card.name;
      if (name === VANQUISHERS_BANNER) bonus += 1;
      else if (other === permanent) continue;
      else if (VAMPIRE_LORDS.has(name)) bonus += 1;
      else if (name === BLOODLINE_KEEPER && other.transformed) bonus += 2;
    }
    return bonus;
  }

  /** Eldrazi Monument: +1/+1 for each creature of ours. */
  monumentBonus(permanent: Permanent): number {
    return permanent.card.isCreature && this.isOnBattlefield(ELDRAZI_MONUMENT)
      ? 1
      : 0;
  }

  override powerBonus(permanent: Permanent): number {
    const lordOfLineage =
      permanent.card.name === BLOODLINE_KEEPER && permanent.transformed;
    return (
      this.vampireAnthem(permanent) +
      this.monumentBonus(permanent) +
      (lordOfLineage ? 2 : 0)
    );
  }
  override toughnessBonus(permanent: Permanent): number {
    const lordOfLineage =
      permanent.card.name === BLOODLINE_KEEPER && permanent.transformed;
    return (
      this.vampireAnthem(permanent) +
      this.monumentBonus(permanent) +
      (lordOfLineage ? 2 : 0)
    );
  }

  override evasive(permanent: Permanent): boolean {
    return (
      permanent.card.flying ||
      (permanent.card.isCreature && this.isOnBattlefield(ELDRAZI_MONUMENT))
    );
  }

  // ================================================================ casting
  /** Eminence: casting another Vampire makes a 1/1 Vampire while Edgar is in the command zone or on the battlefield.
   *  Vanquisher's Banner draws a card for each Vampire spell. */
  override castPerm(card: CardDef, fromCommand = false): boolean {
    const wasCast = super.castPerm(card, fromCommand);
    if (!wasCast) return false;
    if (card.isCreature) this.creatureSpellMonumentsTrigger();
    if (card.name === EDGAR || !isVampire(card)) return true;
    if (this.isEdgarAvailable()) this.createTokens(TOKENS.vampire);
    if (this.isOnBattlefield(VANQUISHERS_BANNER)) this.draw(1);
    return true;
  }

  /** Bontu's Monument: each creature spell drains 1. Oketra's Monument: each makes a 1/1 Warrior. */
  creatureSpellMonumentsTrigger(): void {
    for (let i = 0; i < this.countOnBattlefield(BONTUS_MONUMENT); i++)
      this.drainAllOpponents(1);
    for (let i = 0; i < this.countOnBattlefield(OKETRAS_MONUMENT); i++)
      this.createTokens(TOKENS.warrior);
  }

  /** Bontu's Monument (black creature spells), Oketra's Monument (white ones) and Herald's Horn (Vampires, the type
   *  we choose) make creature spells cost {1} less each. */
  override effectiveCost(
    card: CardDef,
    base: Cost | null = null,
    fromGraveyard = false,
  ): Cost {
    const cost = super.effectiveCost(card, base, fromGraveyard);
    if (!card.isCreature) return cost;
    let reduction = 0;
    if (card.cost.black > 0)
      reduction += this.countOnBattlefield(BONTUS_MONUMENT);
    if (card.cost.white > 0)
      reduction += this.countOnBattlefield(OKETRAS_MONUMENT);
    if (isVampire(card)) reduction += this.countOnBattlefield(HERALDS_HORN);
    return cost.withGeneric(Math.max(0, cost.generic - reduction));
  }

  // ================================================================ sacrifice, death and triggers
  override sacrifice(permanent: Permanent): void {
    if (!this.battlefield.includes(permanent)) return;
    const wasSacrificing = this.isSacrificing;
    this.isSacrificing = true;
    super.sacrifice(permanent);
    this.isSacrificing = wasSacrificing;
  }

  override onEnter(permanent: Permanent, from: Zone): void {
    onPermanentEntered(this, permanent, from);
  }

  override onDies(permanent: Permanent): void {
    onPermanentDied(this, permanent);
  }

  // ================================================================ mana
  override manaSourceKind(
    permanent: Permanent,
    ignoreSick = false,
  ): string | null {
    if (permanent.card.name === LEGIONS_LANDING)
      return permanent.transformed ? 'W' : null;
    return super.manaSourceKind(permanent, ignoreSick);
  }

  // ================================================================ turn steps
  override startTurn(): void {
    if (this.turn >= 4 && this.turn <= 6)
      this.permanentsAtTurnEnd[this.turn] = this.battlefield.filter(
        (permanent) => permanent.land === null,
      ).length;
    super.startTurn();
    this.lifeGainedThisTurn = 0;
    this.creaturesDiedThisTurn = 0;
    this.baronBertramUsed = false;
    this.welcomingVampireUsed = false;
    this.explosionPending = null;
  }

  override upkeep(): void {
    if (this.pendingCrackback > 0) {
      this.loseLife(this.pendingCrackback);
      this.say(
        `crackback: we take ${this.pendingCrackback}, life ${this.myLife}`,
      );
    }
    this.pendingCrackback = 0;
    this.fogUsed = false;
    upkeepOfCommonCards(this);
    this.upkeepOfNewCards();
    if (this.isOnBattlefield('Black Market Connections'))
      this.chooseBlackMarketModes();
  }

  /** Twilight Prophet (ten permanents: the city's blessing) takes the top card and drains its mana value; Herald's Horn
   *  takes a Vampire from the top; Sorin's +1 puts a counter on our best Vampire (his other abilities are not
   *  modelled); Eldrazi Monument sacrifices a creature, or itself when we have none. */
  upkeepOfNewCards(): void {
    if (
      this.isOnBattlefield(TWILIGHT_PROPHET) &&
      this.battlefield.length >= 10
    ) {
      const top = this.library[0];
      if (top) {
        this.putCard(this.takeTopCardsOfLibrary(1)[0], 'hand');
        this.drainAllOpponents(top.manaValue);
      }
    }
    const top = this.library[0];
    if (
      this.isOnBattlefield(HERALDS_HORN) &&
      top &&
      top.isCreature &&
      isVampire(top)
    )
      this.putCard(this.takeTopCardsOfLibrary(1)[0], 'hand');
    const vampires = this.vampires();
    if (this.isOnBattlefield(SORIN) && vampires.length)
      firstMax(vampires, (vampire) => this.power(vampire)).counters += 1;
    if (this.isOnBattlefield(ELDRAZI_MONUMENT)) {
      const fodder = spareFodder(this, [], true).find(
        (spare) => spare.card.isCreature,
      );
      if (fodder) this.sacrifice(fodder);
      else this.sacrifice(this.findPermanent(ELDRAZI_MONUMENT)!);
    }
  }

  /** Black Market Connections: a card (2 life) when we can afford it, a Treasure early on, a 3/2 when life is high. */
  chooseBlackMarketModes(): void {
    if (this.myLife > 12) {
      this.draw(1);
      this.loseLife(2);
    }
    if (this.turn <= 8 && this.myLife > 8) {
      this.createTokens(TREASURE);
      this.loseLife(1);
    }
    if (this.myLife > 25) {
      this.createTokens(TOKENS.shapeshifter);
      this.loseLife(3);
    }
  }

  override endStep(): void {
    for (const permanent of this.battlefield) {
      if (
        permanent.card.name === 'Emeritus of Woe' &&
        this.creaturesDiedThisTurn >= 2
      )
        this.prepared.add(permanent);
      if (
        permanent.card.name === 'Scheming Silvertongue' &&
        this.lifeGainedThisTurn >= 2
      )
        this.prepared.add(permanent);
    }
    this.checkKill();
  }

  // ================================================================ combat
  override combat(): void {
    this.withDamageSource('combat', () => this.creatureCombat());
  }

  override onAttack(attackers: Permanent[]): Permanent[] {
    return onPermanentAttacks(this, attackers);
  }

  // ================================================================ tutors
  /** What we want most from the library: a missing drain engine or outlet first, lands while short of them. */
  tutorValue(card: CardDef): number {
    let value = this.battlefieldValue(card);
    if (card.land !== null) return this.manaSources() < 5 ? 70 : 10;
    const onBoardOrHand = (name: string) =>
      this.isOnBattlefield(name) ||
      this.hand.some((inHand) => inHand.name === name);
    if (onBoardOrHand(card.name)) value -= 60;
    const isDrainEngine = [
      'Blood Artist',
      'Cruel Celebrant',
      'Vengeful Bloodwitch',
      'Susurian Voidborn',
    ].includes(card.name);
    if (isDrainEngine && this.drainPerDeath() === 0) value += 20;
    if (card.name === EVERETH && findOutlets(this).length > 0) value += 10;
    return value;
  }

  override tutorTarget(
    allowed: (card: CardDef) => boolean,
    _toTop: boolean,
    _spent: string | null = null,
  ): CardDef | null {
    const options = this.library.filter(allowed);
    return options.length
      ? firstMax(options, (card) => this.tutorValue(card))
      : null;
  }

  // ================================================================ the planner's score
  /** The planner's score: the engine's (damage, board, mana, cards, life) plus the drain engines, the Vampires,
   *  Edgar and the sacrifice outlets. */
  override positionValue(): number {
    if (this.died) return -5000;
    return (
      super.positionValue() +
      30 * this.drainPerDeath() +
      3 * this.vampires().length +
      (this.isOnBattlefield(EDGAR) ? 60 : 0) +
      8 * findOutlets(this).length
    );
  }

  /** A pod: the explosion is declared after Evereth was pumped (her ability uses the stack), with her still on the
   *  battlefield: an exile or bounce effect on her in response to the pump stops the win. Sacrificing her to an outlet
   *  is a cost and cannot be answered, and a destroy effect does not stop it (her dying is what makes her explode),
   *  so those are not used. A line that did not pump her has nothing to answer. */
  override winAttempt(): WinAttempt | null {
    const evereth = this.explosionPending;
    if (!evereth || !this.battlefield.includes(evereth)) return null;
    return { spells: [], perms: [EVERETH], backup: 0 };
  }

  override podCanTarget(permanent: Permanent, answer: Answer): boolean {
    if (permanent === this.explosionPending && answer.how === 'destroy')
      return false;
    return super.podCanTarget(permanent, answer);
  }

  /** The win was stopped: the explosion did not happen (the engine puts the life totals back). */
  override podWinStopped(): void {
    super.podWinStopped();
    this.explosionPending = null;
  }

  /** A pod: how close to winning the others think we are: Edgar out, a big Vampire board, drain engines and an outlet
   *  (Evereth's explosion). */
  override podClose(): number {
    let closeness = 0;
    if (this.isOnBattlefield(EDGAR)) closeness += 0.2;
    if (this.vampires().length >= 6) closeness += 0.2;
    closeness += Math.min(0.3, 0.1 * this.drainPerDeath());
    if (this.isOnBattlefield(EVERETH) && findOutlets(this).length > 1)
      closeness += 0.3;
    return Math.min(1, closeness);
  }

  candidates(main2: boolean): Candidate[] {
    return buildCandidates(this, main2);
  }
}
