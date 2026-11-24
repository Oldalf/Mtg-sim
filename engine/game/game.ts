/**
 * A game as the decks and the pod use it: GameCore (game-core.ts, the rules of one goldfish game) plus the pod parts:
 * combat against real opponents (blocks, attackers, fog), and interaction (removal, counterspells, answering a win,
 * the threat score). In a goldfish game none of this is used. See engine/pod/pod.ts for how the pod drives it.
 *
 * A deck subclasses Game. It may override the pod hooks too: evasion(), blockValue(), fogPrevent(), podClose(),
 * podShield(), winAttempt(), podWinStopped(), combatHit().
 */
import { Cost, CardDef } from '../cards/cards';
import { ANSWERS, Answer, KEY_SPELLS } from './answers';
import { GameCore } from './game-core';
import {
  AnswerUsed,
  answerHitsPermanentTypes,
  answerHitsSpell,
  answerWinAttempt,
  castAnswerFromHand,
  costOfAnswer,
  counterAbilitiesAgainst,
  getWhatRemovalGives,
  loseCardOurWinStoppedAt,
  removalTargets,
  removeOurPermanent,
  shieldFromRemoval,
  spendCountersAgainst,
  useCounterAbility,
} from './pod-answers';
import {
  attackInPod,
  attackOpponentForReal,
  attackWithCreaturesThatMustAttack,
  bestOpponentToAttack,
  castCreaturesAsBlockers,
  creaturesToKeepHome,
  damageOfBiggestAttackNextTurn,
  describeFighter,
  mayAttackOpponentInSlot,
  planAttackOn,
} from './pod-attacks';
import {
  Arena,
  Evasion,
  Fighter,
  KillSearcher,
  Permanent,
  Target,
  WinAttempt,
  Zone,
} from './game-types';

export abstract class Game<S = unknown> extends GameCore<S> {
  /** Set in a pod game: real opponents with real blockers. */
  arena: Arena | null = null;
  /** Set in a pod game: the name of each opponent, for the log. */
  opponentNames: string[] | null = null;

  override opponentName(slot: number): string {
    return this.opponentNames?.[slot] ?? super.opponentName(slot);
  }
  override describeOpponentLife(): string {
    if (this.opponentNames === null) return super.describeOpponentLife();
    return this.opponentNames
      .map((name, slot) => `${name} ${this.life[slot]}`)
      .join(', ');
  }

  override podAllowsKill(): boolean {
    return !this.inArena() || this.arena!.go(this);
  }
  override podCounters(card: CardDef): boolean {
    return this.inArena() && this.arena!.counter(this, card);
  }
  override podTakeInitiative(): void {
    if (this.inArena()) this.arena!.takeInitiative(this);
  }
  override podGoadBestCreature(): void {
    if (this.inArena()) this.arena!.goadBestCreature(this);
  }
  override podWeakenBestCreature(powerLoss: number): void {
    if (this.inArena()) this.arena!.weakenBestCreature(this, powerLoss);
  }
  override podShrinkCreatures(
    amount: number,
    includeOwn: boolean,
    except: Permanent | null,
    sourceName: string,
  ): void {
    if (this.inArena())
      this.arena!.shrinkCreatures(this, amount, includeOwn, except, sourceName);
  }
  override podCreaturesShrinkWouldKill(amount: number): number {
    return this.inArena()
      ? this.arena!.creaturesShrinkWouldKill(this, amount)
      : 0;
  }
  override podStopBestCreatureAttackingUs(): void {
    if (this.inArena()) this.arena!.stopBestCreatureAttackingUs(this);
  }
  override podAnnounceCast(card: CardDef): void {
    if (this.inArena()) this.arena!.announceCast(this, card);
  }
  override podAnnounceDeath(permanent: Permanent): void {
    if (this.inArena()) this.arena!.announceDeath(this, permanent);
  }
  override podAnswersWin(): boolean {
    return this.inArena() && this.arena!.answerWin(this);
  }

  // ================================================================ pod combat (real opponents; see engine/pod/pod.ts)
  /** Are we the real game of a player in a pod (not a planner copy, not a goldfish game)? */
  override inArena(): boolean {
    return this.arena !== null && !this.inRollout && this.arena.real(this);
  }
  /** Is this a pod game, the real one or a planner's copy of it? Candidates and card values that differ in a pod ask
   *  this, not inArena: a planner copy must list the same candidates in the same order as the real game. Effects on
   *  the other players happen only in the real game (inArena). */
  isPodGame(): boolean {
    return this.arena !== null;
  }
  /** How this attacker gets past blockers. Decks override it (or evasive()). */
  evasion(permanent: Permanent): Evasion {
    return this.evasive(permanent)
      ? permanent.card.flying
        ? 'flying'
        : 'unblockable'
      : 'none';
  }
  /** What we'd pay to keep this creature: decides which creatures trade or chump block. */
  blockValue(permanent: Permanent): number {
    return (
      (permanent.token ? 5 : 10 + 10 * permanent.card.manaValue) +
      (this.isCommander(permanent) ? 100 : 0)
    );
  }
  isCommander(permanent: Permanent): boolean {
    return (
      !permanent.token &&
      permanent.owner === null &&
      this.commanderNames.includes(permanent.card.name)
    );
  }
  fighter(
    permanent: Permanent,
    powerOf?: (otherPermanent: Permanent) => number,
    toughnessOf?: (otherPermanent: Permanent) => number,
  ): Fighter {
    return describeFighter(this, permanent, powerOf, toughnessOf);
  }
  /** Our untapped creatures, as blockers (a summoning-sick creature can block). */
  blockers(): Fighter[] {
    return this.creatures()
      .filter((permanent) => !permanent.tapped)
      .map((permanent) => this.fighter(permanent));
  }
  /** We are about to take this much combat damage: prevent all combat damage this turn (a fog)? Returns true if we did. */
  fogPrevent(_dmg: number, _lethal: boolean): boolean {
    return false;
  }

  /** Attack opponent `slot` for real: blockers are declared, creatures die, the damage that connects is dealt. */
  strike(
    slot: number,
    attackers: Permanent[],
    powerOf?: (permanent: Permanent) => number,
    toughnessOf?: (permanent: Permanent) => number,
  ): { damage: number; connected: Permanent[] } {
    return attackOpponentForReal(this, slot, attackers, powerOf, toughnessOf);
  }

  /** Combat damage our creatures deal to opponent `slot` (a deck may replace it: The Mindskinner). */
  combatHit(slot: number, damage: number): void {
    this.damageOpponent(slot, damage);
  }

  /** The attackers worth sending at opponent `slot`, and what the attack would do. An attacker stays home if it
   *  would be blocked without killing its blocker, or would die for less than it kills; a lethal attack sends everything. */
  planAttack(
    slot: number,
    pool: Permanent[],
    powerOf?: (permanent: Permanent) => number,
    toughnessOf?: (permanent: Permanent) => number,
  ): { attackers: Permanent[]; score: number; damage: number } {
    return planAttackOn(this, slot, pool, powerOf, toughnessOf);
  }

  /** The opponent to attack with these creatures (the attack that does the most; a kill first), or null if no attack is worth it.
   *  `prefer` adds to an opponent's score. */
  pickDefender(
    pool: Permanent[],
    prefer?: (slot: number) => number,
  ): { slot: number; attackers: Permanent[] } | null {
    return bestOpponentToAttack(this, pool, prefer);
  }

  /** Creatures to keep home as blockers: enough that the biggest board among the opponents can't kill us next turn
   *  (each blocker stops their biggest attacker). None if we couldn't stop it anyway. */
  homeGuard(
    pool: Permanent[],
    powerOf: (permanent: Permanent) => number,
  ): Set<Permanent> {
    return creaturesToKeepHome(this, pool, powerOf);
  }

  /** The creatures that attacked this turn (vigilance ones stay untapped, so tapped doesn't tell). */
  attackersThisTurn = new Set<Permanent>();

  /** Must this creature attack this combat if able ("attacks each combat if able", Thantis, goad)? */
  mustAttack(creature: Permanent): boolean {
    return this.arena!.mustAttack(this, creature);
  }

  /** May this creature attack opponent `slot`? A goaded creature attacks a player who goaded it only when it can
   *  attack no one else (rule 701.15b). */
  mayAttackOpponent(creature: Permanent, slot: number): boolean {
    return mayAttackOpponentInSlot(this, creature, slot);
  }

  /** After our combat: creatures that must attack and weren't sent attack now (the deck's own combat left them home). */
  override attackWithForcedCreatures(): void {
    attackWithCreaturesThatMustAttack(this);
  }

  /** Pod combat for a group of our creatures: choose the opponent and the attackers, attack, deal the damage.
   *  Creatures that must attack always go, and a goaded one avoids its goaders if it can. */
  override arenaCombat(
    pool: Permanent[],
    powerOf?: (permanent: Permanent) => number,
    toughnessOf?: (permanent: Permanent) => number,
  ): void {
    attackInPod(this, pool, powerOf, toughnessOf);
  }

  /** A pod, after our second main phase: if the biggest opposing board would leave us at config.chump_life (10) or less next turn
   *  even with our untapped creatures blocking, cast creatures from hand as blockers, cheapest first (decks built against
   *  goldfish opponents never do this on their own). */
  override podDefence(): void {
    castCreaturesAsBlockers(this);
  }

  /** A pod: does any living opponent control a creature? */
  opponentsHaveCreatures(): boolean {
    if (this.arena === null) return false;
    for (let slot = 0; slot < this.life.length; slot++)
      if (this.isOpponentAlive(slot) && this.arena.board(this, slot).length)
        return true;
    return false;
  }
  /** Our creature with the most power, or null without one. */
  biggestCreature(): Permanent | null {
    const creatures = this.creatures();
    return creatures.length
      ? creatures.reduce((biggest, creature) =>
          this.power(creature) > this.power(biggest) ? creature : biggest,
        )
      : null;
  }
  /** A pod: the damage the biggest opposing board could deal us next turn, each untapped creature of ours blocking one
   *  of its biggest attackers. */
  biggestAttackNextTurn(): number {
    return damageOfBiggestAttackNextTurn(this);
  }

  /** An opponent cast this spell and we hold a counterspell for it: do we counter it? By default, a spell worth
   *  counterAnyWeight always, one worth counterAtWeight when its caster is the biggest threat and we hold two
   *  counterspells. A deck may counter more (Gale, when it is in danger). */
  podWantsToCounter(
    _spell: CardDef,
    weight: number,
    casterIsBiggestThreat: boolean,
    counterspellsHeld: number,
    settings: { counterAtWeight: number; counterAnyWeight: number },
  ): boolean {
    if (weight < settings.counterAtWeight) return false;
    return (
      weight >= settings.counterAnyWeight ||
      (casterIsBiggestThreat && counterspellsHeld >= 2)
    );
  }

  // ================================================================ pod interaction (answers; see engine/game/answers.ts and engine/pod/pod.ts)
  /** Opponents' life / library / poison just before our combo was applied (a deck sets it): put back if the win is stopped. */
  podPre: [number[], number[], number[]] | null = null;

  /** We say we have won (takeTurn() returned true): what could the others answer? null = nothing (the damage is done). */
  winAttempt(): WinAttempt | null {
    return null;
  }
  /** What this card answers in a pod (null = it isn't interaction). */
  answer(card: CardDef): Answer | null {
    return ANSWERS[card.name] ?? null;
  }
  answerCost(card: CardDef): Cost {
    return costOfAnswer(this, card);
  }
  /** Daze's other cost: an Island we control returns to hand (a tapped one first), or null. */
  islandToReturnForDaze(): Permanent | null {
    const islands = this.battlefield.filter((permanent) =>
      this.islandTyped(permanent),
    );
    return islands.find((island) => island.tapped) ?? islands[0] ?? null;
  }
  controlsCommander(): boolean {
    return this.battlefield.some((permanent) => this.isCommander(permanent));
  }
  /** Force of Will's other cost: a blue card from hand to exile (the least wanted), or null. */
  forceOfWillPitch(forceOfWill: CardDef): CardDef | null {
    const blueCards = this.hand.filter(
      (card) => card !== forceOfWill && card.isBlue,
    );
    return blueCards.length
      ? blueCards.reduce((least, card) =>
          this.cardValue(card) < this.cardValue(least) ? card : least,
        )
      : null;
  }
  /** Mana to leave untapped on our own turn for the cheapest instant-speed answer in hand (from round config.hold_from, default 5). */
  override podReserve(): number {
    if (!this.isHoldingManaForAnswers()) return 0;
    return this.cheapestAnswerManaValue();
  }
  /** The mana value of the cheapest instant-speed answer in hand (not a wipe), or 0 without one. */
  cheapestAnswerManaValue(): number {
    let best = 0;
    for (const card of this.hand) {
      const answer = this.answer(card);
      if (!answer || !answer.instant || answer.kind === 'wipe') continue;
      const manaValue = this.answerCost(card).manaValue;
      if (best === 0 || manaValue < best) best = manaValue;
    }
    return best;
  }
  /** Do we keep mana open on our own turn for an instant-speed answer? (Not in a goldfish game, not before round
   *  config.hold_from.) */
  isHoldingManaForAnswers(): boolean {
    return (
      this.podHold &&
      this.inArena() &&
      this.config.pod_answers !== false &&
      this.turn >= ((this.config.hold_from as number) ?? 5)
    );
  }
  /** Cast an answer from hand: pay for it, put it into the graveyard. False if we can't. */
  podCast(card: CardDef): boolean {
    return castAnswerFromHand(this, card);
  }
  static spellOk(answer: Answer, card: CardDef): boolean {
    return answerHitsSpell(answer, card);
  }
  static permOk(answer: Answer, types: Set<string>): boolean {
    return answerHitsPermanentTypes(answer, types);
  }
  /** Answer a win attempt of `owner` at instant speed with up to `need` cards from hand (they are cast). A removal spell needs
   *  a legal target (type, "nonblack" and the like, hexproof); a shield of the owner's (Kira...) may counter it: then it is
   *  spent for nothing (listed with `shield`) and the next answer may try again. */
  podRespond(
    winAttempt: WinAttempt,
    need: number,
    owner: Game<unknown>,
  ): AnswerUsed[] {
    return answerWinAttempt(this, winAttempt, need, owner);
  }
  /** Our permanents whose counter ability (BOARD_COUNTERS) can counter this spell now. */
  boardCountersAgainst(spell: CardDef): Permanent[] {
    return counterAbilitiesAgainst(this, spell);
  }
  /** Uses a permanent's counter ability: pays it, then sacrifices the permanent or returns a land (a tapped one
   *  first) to hand. False if it can't be paid. */
  useBoardCounter(permanent: Permanent): boolean {
    return useCounterAbility(this, permanent);
  }
  /** May an opponent's removal spell target this permanent of ours? (Hexproof, shroud, the spell's own limits.) */
  podCanTarget(permanent: Permanent, answer: Answer): boolean {
    if (this.config.pod_legal === false) return true; // (a check: every permanent is a legal target)
    const keywords = permanent.card.keywords;
    if (
      keywords.has('shroud') ||
      (keywords.has('hexproof') &&
        !/hexproof from/i.test(permanent.card.oracle))
    )
      return false;
    for (const x of answer.not ?? []) {
      if (x === 'artifact' && permanent.card.types.has('artifact'))
        return false;
      if (x === 'black' && permanent.card.cost.black > 0) return false;
      if (x === 'counters' && permanent.counters !== 0) return false;
    }
    return true;
  }
  /** Creatures we already protected this turn (Kira counters only the first spell aimed at each creature). */
  podShielded = new Set<Permanent>();
  /** This turn we keep mana up for an answer (the pod decides it each turn: --set hold_chance, default always). */
  podHold = true;
  /** An opponent aims a spell at this permanent of ours: do we counter it? Kira, Great Glass-Spinner (the first time each
   *  creature is targeted each turn), Soratami Rainshaper ({3} and a land back to hand: shroud), Siren Stormtamer ({U},
   *  sacrifice it). `answer` is the removal, when there is one. Returns the card that did it. */
  podShield(
    permanent: Permanent,
    _answer: Answer | null = null,
  ): string | null {
    return shieldFromRemoval(this, permanent);
  }
  /** A board wipe is about to take these creatures of ours (all that it kills, the caster's own wipe too; `destroys`:
   *  it destroys them, so indestructible helps). A deck may answer at instant speed, e.g. by blinking them (what has
   *  left the battlefield is not hit). Returns the creatures that survive the wipe. */
  podAnswerWipe(_dying: Permanent[], _destroys: boolean): Permanent[] {
    return [];
  }
  /** One of our permanents was removed by this answer: what we get for it (a 3/3, a basic land, life, a 2/2). */
  podGet(permanent: Permanent, answer: Answer): void {
    getWhatRemovalGives(this, permanent, answer);
  }
  /** Removed by an opponent's answer: off the battlefield, and the owner gets what the card gives. */
  podSuffer(permanent: Permanent, answer: Answer): void {
    if (!this.battlefield.includes(permanent)) return;
    this.podRemove(permanent, answer.how ?? 'destroy');
    this.podGet(permanent, answer);
  }
  /** One of our permanents is removed by an opponent. A commander goes back to the command zone (the tax counts its casts). */
  podRemove(permanent: Permanent, how: string): void {
    removeOurPermanent(this, permanent, how);
  }
  /** Tap n of our untapped mana sources (mana spent on something that was answered). Treasures are left alone. */
  tapMana(amount: number): void {
    for (const permanent of this.battlefield)
      if (
        amount > 0 &&
        !permanent.tapped &&
        !this.isExpendableManaSource(permanent) &&
        this.manaSourceKind(permanent)
      ) {
        permanent.tapped = true;
        amount--;
      }
  }
  /** Our win was stopped at this card: it is gone from wherever it is. A countered spell goes to the graveyard (exile if it
   *  was cast from there) and its mana is spent; a removed permanent is destroyed / exiled / bounced (a commander goes to
   *  the command zone). The turn goes on. */
  podLose(name: string, how: string, answer?: Answer): void {
    loseCardOurWinStoppedAt(this, name, how, answer);
  }
  /** After our win was stopped: the opponents' totals go back to before the combo. Decks add their own flags. */
  podWinStopped(): void {
    if (this.podPre) {
      [this.life, this.opponentLibrarySizes, this.poison] = [
        this.podPre[0].slice(),
        this.podPre[1].slice(),
        this.podPre[2].slice(),
      ];
      this.podPre = null;
    }
  }
  /** Our answers were answered back (we went for the win with backup): n counterspells in hand are spent. */
  podBurnCounters(against: string[]): string[] {
    return spendCountersAgainst(this, against);
  }
  /** How much the others want to counter this spell of ours: mana value x 10, +30 for a commander, + the card's key bonus. */
  podWeight(card: CardDef): number {
    return (
      10 * card.manaValue +
      (this.commanderNames.includes(card.name) ? 30 : 0) +
      (KEY_SPELLS[card.name] ?? 0)
    );
  }
  /** How close we are to winning, 0 to 1 (decks override it): part of the threat the others see. */
  podClose(): number {
    return 0;
  }
  /** Our permanents an opponent may aim this removal spell at. */
  podTargets(answer: Answer): Target[] {
    return removalTargets(this, answer);
  }
  /** How dangerous we look to the others (step 4): board power, nonland permanents, mana, cards in hand, damage dealt so far,
   *  and the deck's own "close to winning" (podClose, worth config.threat_close, default 25). */
  threat(): number {
    let threatScore = this.hand.length / 2 + this.damageDealt / 10;
    for (const permanent of this.battlefield) {
      if (permanent.land !== null) threatScore += 0.5;
      else
        threatScore +=
          (permanent.card.isCreature ? this.power(permanent) : 0) +
          (permanent.card.rock ? 1 : 3);
    }
    return (
      threatScore +
      ((this.config.threat_close as number) ?? 25) * this.podClose()
    );
  }
  /** We are being attacked: an instant in hand that returns the attackers to hand (Aetherize), if the hit is lethal or big. */
  podDefend(damage: number, lethal: boolean): 'none' | 'fog' | 'bounce' {
    if (this.fogPrevent(damage, lethal)) return 'fog';
    if (!lethal && damage < ((this.config.fog_at as number) ?? 6))
      return 'none';
    const card = this.hand.find(
      (otherCard) => this.answer(otherCard)?.wipe === 'attackers',
    );
    return card && this.podCast(card) ? 'bounce' : 'none';
  }

  /** Windfall: each player discards their hand and draws as many cards as the biggest hand discarded (in a goldfish
   *  game at least 7, a goldfish opponent's hand). A deck with its own Windfall (Gale, Codie) resolves it first. */
  override resolveOther(
    card: CardDef,
    _fromGraveyard: boolean,
    _mode: string | null,
  ): void {
    if (card.name !== 'Windfall') return;
    const handSize = this.hand.length;
    for (const discarded of this.takeAllCards('hand'))
      this.toGraveyard(discarded);
    this.draw(
      this.inArena()
        ? this.arena!.wheel(this, handSize)
        : Math.max(handSize, 7),
    );
  }

  // ================================================================ change of control (a pod only)
  override enter(
    card: CardDef,
    from: Zone = 'hand',
    options: { token?: boolean; tapped?: boolean } = {},
  ): Permanent {
    const permanent = super.enter(card, from, options);
    if (
      card.name === VOLATILE_STORMDRAKE &&
      this.inArena() &&
      this.battlefield.includes(permanent)
    )
      // in a goldfish game there is no creature to take: it stays a 3/2 flyer
      this.arena!.stormdrakeExchange(this, permanent);
    return permanent;
  }
}

const VOLATILE_STORMDRAKE = 'Volatile Stormdrake';

/** Base for decks that have no kill search (no combo to find), so they skip the three search hooks. */
export abstract class GameWithoutKillSearch extends Game<null> {
  buildKillSearchState(): null {
    return null;
  }
  killSearchStateKey(): string {
    return '';
  }
  killSearch(): KillSearcher<null> {
    return NO_KILL_SEARCH;
  }
}

const NO_KILL_SEARCH: KillSearcher<null> = {
  search: () => 0,
  lastLine: null,
  lastLineProbability: null,
  bestMiss: null,
  minChance: 1,
};
