/**
 * The Edgar Markov deck's AI (Mardu vampire tribal / aristocrats): the rules of its cards, what it
 * wants to do each turn, and the goldfish rules agreed for this deck (see PLAN.md).
 *
 * Files:
 *   cards.ts       the card names and the facts about them (values, tokens, the Vampire check)
 *   game.ts        this file: EdgarGame, its state, the win check, anthems, mana, turn steps, tutors
 *   triggers.ts    what happens when a permanent enters, dies, or when we attack
 *   actions.ts     sacrifice outlets, the all-in sacrifice turn, prepared spells, activated abilities
 *   candidates.ts  everything the AI may do now, with a score each
 *
 * Win: all three opponents at 0 life (40 each). Second measure: first opponent dead.
 * Single-target drains ("target opponent loses ...") go to the opponent closest to dead.
 * Combat is the engine's goldfish combat for creature decks (flyers connect, half the ground attackers are blocked).
 * The game itself (mana, zones, casting, turns) is the shared engine in engine/game/game-core.ts.
 */
import { TREASURE } from '../../engine/cards/tokens';
import {
  BLOODLINE_KEEPER,
  EDGAR,
  EVERETH,
  LEGIONS_LANDING,
  TOKENS,
  VALUE,
  VAMPIRE_LORDS,
  VANQUISHERS_BANNER,
  isVampire,
} from './cards';
import { buildCandidates } from './candidates';
import { findOutlets } from './actions';
import {
  onPermanentAttacks,
  onPermanentDied,
  onPermanentEntered,
} from './triggers';
import { CardDef } from '../../engine/cards/cards';
import {
  Candidate,
  Permanent,
  WinAttempt,
  Zone,
} from '../../engine/game/game-types';
import { Answer } from '../../engine/game/answers';
import { GameWithoutKillSearch } from '../../engine/game/game';
import { upkeepOfCommonCards } from '../../engine/game/common-permanents';
import { MulliganRule } from '../../engine/game/mulligan';
import { firstMax } from '../../engine/util/lists';
import { MULLIGAN } from './mulligan';

/** Where damage to an opponent comes from: attacking, drain triggers (and pings), or Evereth's explosion. */
export type DamageSource = 'combat' | 'drain' | 'explosion';

/** A Nine-Lives Familiar that comes back at the next end step. */
interface Revival {
  card: CardDef;
  revivalCounters: number;
}

export class EdgarGame extends GameWithoutKillSearch {
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
  revivals: Revival[] = [];
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

  // ================================================================ the win condition
  hasWon(): boolean {
    return (
      this.life.filter((life) => life <= 0).length >=
      (this.config.win_dead as number)
    );
  }

  override areOpponentsBeaten(): boolean {
    return this.hasWon();
  }

  override winsWith(damage: number): boolean {
    const life = this.life.slice();
    let left = damage;
    while (left > 0) {
      let weakestIndex = -1;
      for (let i = 0; i < life.length; i++)
        if (life[i] > 0 && (weakestIndex < 0 || life[i] < life[weakestIndex]))
          weakestIndex = i;
      if (weakestIndex < 0) break;
      const hit = Math.min(left, life[weakestIndex]);
      life[weakestIndex] -= hit;
      left -= hit;
    }
    return (
      life.filter((life) => life <= 0).length >=
      (this.config.win_dead as number)
    );
  }

  override checkKill(): number {
    if (this.died) return 2; // the game is over (lost)
    if (this.hasWon()) {
      if (this.unprotectedKillTurn === null) {
        this.unprotectedKillTurn = this.turn;
        this.say(`WIN: ${this.describeOpponentLife()}`);
      }
      return 2;
    }
    return 0;
  }

  override play(): [number | null, number | null] {
    super.play();
    return [
      this.died ? null : this.unprotectedKillTurn,
      this.firstOpponentDeadTurn,
    ];
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
        case 'Marionette Apprentice':
          drain += alive;
          break;
        case 'Mayhem Devil':
          drain += 0.5; // only sacrifices
          break;
      }
    }
    return drain;
  }

  // ================================================================ card values
  battlefieldValue(card: CardDef): number {
    return VALUE[card.name] ?? (card.isCreature ? 40 : 30);
  }

  override cardValue(card: CardDef): number {
    if (card.land !== null) {
      const manaAndLands = this.manaSources() + this.countLandsHand();
      return manaAndLands <= 3
        ? 80
        : manaAndLands <= 6
          ? 60
          : manaAndLands <= 8
            ? 40
            : 15;
    }
    return this.battlefieldValue(card);
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

  override powerBonus(permanent: Permanent): number {
    const lordOfLineage =
      permanent.card.name === BLOODLINE_KEEPER && permanent.transformed;
    return this.vampireAnthem(permanent) + (lordOfLineage ? 2 : 0);
  }
  override toughnessBonus(permanent: Permanent): number {
    const lordOfLineage =
      permanent.card.name === BLOODLINE_KEEPER && permanent.transformed;
    return this.vampireAnthem(permanent) + (lordOfLineage ? 2 : 0);
  }

  override evasive(permanent: Permanent): boolean {
    return permanent.card.flying;
  }

  // ================================================================ casting
  /** Eminence: casting another Vampire makes a 1/1 Vampire while Edgar is in the command zone or on the battlefield.
   *  Vanquisher's Banner draws a card for each Vampire spell. */
  override castPerm(card: CardDef, fromCommand = false): boolean {
    const wasCast = super.castPerm(card, fromCommand);
    if (!wasCast || card.name === EDGAR || !isVampire(card)) return wasCast;
    if (this.isEdgarAvailable()) this.createTokens(TOKENS.vampire);
    if (this.isOnBattlefield(VANQUISHERS_BANNER)) this.draw(1);
    return wasCast;
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

  /** A Nine-Lives Familiar that dies with a revival counter comes back at the next end step with one fewer. */
  reviveAtEndStep(card: CardDef, revivalCounters: number): void {
    this.revivals = [...this.revivals, { card, revivalCounters }];
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
    if (this.isOnBattlefield('Dreadhorde Invasion')) this.amassZombies();
    if (this.isOnBattlefield('Keen Duelist')) this.revealWithKeenDuelist();
    if (this.isOnBattlefield('Black Market Connections'))
      this.chooseBlackMarketModes();
  }

  /** Dreadhorde Invasion: lose 1 life and put a +1/+1 counter on our Army (made first if we have none). */
  amassZombies(): void {
    this.loseLife(1);
    const army =
      this.battlefield.find((permanent) => permanent.card === TOKENS.army) ??
      this.createTokens(TOKENS.army)[0];
    army.counters += 1;
  }

  /** Keen Duelist: we reveal our top card, the opponent loses its mana value and we lose that of a card of theirs
   *  (a goldfish opponent: an average card, 0 to 5). We put the card into our hand. */
  revealWithKeenDuelist(): void {
    const top = this.library[0];
    if (!top) return;
    this.putCard(this.takeTopCardsOfLibrary(1)[0], 'hand');
    const target = this.chooseTargetOpponent();
    if (target !== null) this.damageOpponent(target, top.manaValue);
    this.loseLife(this.rng.below(6));
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
    for (const revival of this.revivals) {
      if (!this.takeCardIfThere(revival.card, 'graveyard')) continue;
      const permanent = this.enter(revival.card, 'graveyard');
      permanent.marks = revival.revivalCounters;
      this.say('  revives with', String(revival.revivalCounters), 'counters');
    }
    this.revivals = [];
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

  /** Lifelink creatures that connected gain us their power. */
  override onCombatDamage(connected: Permanent[]): void {
    for (const permanent of connected)
      if (permanent.card.keywords.has('lifelink'))
        this.gainLife(this.power(permanent));
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
      'Marionette Apprentice',
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
  /** The planner's score for a position with no win yet (higher is better). */
  override positionValue(): number {
    if (this.died) return -5000;
    let value = 0;
    const startLife = this.config.opp_life as number;
    for (const life of this.life) value += 3 * (startLife - Math.max(0, life));
    for (const permanent of this.creatures())
      value +=
        6 * this.power(permanent) * (permanent.card.flying ? 1.5 : 1) +
        0.25 * this.battlefieldValue(permanent.card);
    value += 30 * this.drainPerDeath();
    value += 3 * this.vampires().length;
    if (this.isOnBattlefield(EDGAR)) value += 60;
    value += 8 * findOutlets(this).length;
    for (const permanent of this.battlefield)
      if (permanent.land === null && !permanent.card.isCreature)
        value += 0.4 * this.battlefieldValue(permanent.card);
    value += 25 * Math.min(10, this.manaSources());
    value +=
      0.4 * this.hand.reduce((total, card) => total + this.cardValue(card), 0);
    value +=
      this.myLife <= 0
        ? -3000
        : this.myLife < 15
          ? -10 * (15 - this.myLife)
          : 0.3 * Math.min(40, this.myLife - 15);
    return value;
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
