/**
 * A game as the decks and the pod use it: GameCore (game-core.ts, the rules of one goldfish game) plus the pod parts:
 * combat against real opponents (blocks, attackers, fog), and interaction (removal, counterspells, answering a win,
 * the threat score). In a goldfish game none of this is used. See engine/pod/pod.ts for how the pod drives it.
 *
 * A deck subclasses Game. It may override the pod hooks too: evasion(), blockValue(), fogPrevent(), podClose(),
 * podShield(), winAttempt(), podWinStopped(), combatHit().
 */
import * as C from '../cards/cards';
import { Cost, CardDef } from '../cards/cards';
import {
  ANSWERS,
  Answer,
  BOARD_COUNTERS,
  BoardCounter,
  KEY_SPELLS,
  PROTECTIONS,
} from './answers';
import { GameCore } from './game-core';
import { addFirebendingMana } from './firebending';
import {
  Arena,
  CardListZone,
  Evasion,
  Fighter,
  FightResult,
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
    const keywords = permanent.card.keywords;
    return {
      permanent: permanent,
      name: permanent.card.name,
      power: powerOf ? powerOf(permanent) : this.power(permanent),
      toughness: toughnessOf
        ? toughnessOf(permanent)
        : this.toughness(permanent),
      evasion: this.evasion(permanent),
      air: keywords.has('flying') || keywords.has('reach'),
      deathtouch: keywords.has('deathtouch'),
      value: this.blockValue(permanent),
      commander: this.isCommander(permanent),
      trample: keywords.has('trample'),
      first: keywords.has('first strike') || keywords.has('double strike'),
      menace: keywords.has('menace'),
      legendary: permanent.card.types.has('legendary'),
    };
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
    for (const attacker of attackers) this.attackersThisTurn.add(attacker);
    const fightResult = this.arena!.fight(
      this,
      slot,
      attackers.map((permanent) =>
        this.fighter(permanent, powerOf, toughnessOf),
      ),
      true,
    );
    if (fightResult.bounced)
      for (const row of fightResult.rows)
        this.podRemove(row.attacker.permanent, 'bounce');
    for (const row of fightResult.rows)
      if (row.attackerDies) this.dies(row.attacker.permanent);
    if (fightResult.kills)
      this.damageOpponent(slot, Math.max(fightResult.damage, this.life[slot]));
    else if (fightResult.damage > 0) this.combatHit(slot, fightResult.damage);
    return {
      damage: fightResult.damage,
      connected:
        fightResult.damage > 0
          ? fightResult.rows
              .filter((x) => x.blocker === null)
              .map((x) => x.attacker.permanent)
          : [],
    };
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
    let attackers = pool.slice();
    let fightResult: FightResult = { rows: [], damage: 0, kills: false };
    for (let round = 0; round < 6 && attackers.length; round++) {
      fightResult = this.arena!.fight(
        this,
        slot,
        attackers.map((permanent) =>
          this.fighter(permanent, powerOf, toughnessOf),
        ),
        false,
      );
      if (fightResult.kills) break;
      const bad = new Set(
        fightResult.rows
          .filter(
            (x) =>
              x.blocker !== null &&
              (!x.blockerDies ||
                (x.attackerDies && x.blocker.value < x.attacker.value)),
          )
          .map((x) => x.attacker.permanent),
      );
      if (!bad.size) break;
      attackers = attackers.filter((permanent) => !bad.has(permanent));
    }
    if (!attackers.length) return { attackers: attackers, score: 0, damage: 0 };
    const gain = fightResult.rows.reduce(
      (total, x) =>
        total +
        (x.blockerDies ? x.blocker!.value : 0) -
        (x.attackerDies ? x.attacker.value : 0),
      0,
    );
    return {
      attackers: attackers,
      score:
        (fightResult.kills ? 1000 : 0) +
        fightResult.damage +
        gain / 20 -
        this.life[slot] / 1000,
      damage: fightResult.damage,
    };
  }

  /** The opponent to attack with these creatures (the attack that does the most; a kill first), or null if no attack is worth it.
   *  `prefer` adds to an opponent's score. */
  pickDefender(
    pool: Permanent[],
    prefer?: (slot: number) => number,
  ): { slot: number; attackers: Permanent[] } | null {
    let best: { slot: number; attackers: Permanent[] } | null = null,
      bestScore = 0;
    for (let i = 0; i < this.life.length; i++) {
      if (!this.isOpponentAlive(i)) continue;
      const plan = this.planAttack(i, pool);
      if (!plan.attackers.length) continue;
      const score =
        plan.score +
        (prefer ? prefer(i) : 0) +
        this.arena!.prefer(this, i) +
        0.01;
      if (best === null || score > bestScore) {
        best = { slot: i, attackers: plan.attackers };
        bestScore = score;
      }
    }
    return best;
  }

  /** Creatures to keep home as blockers: enough that the biggest board among the opponents can't kill us next turn
   *  (each blocker stops their biggest attacker). None if we couldn't stop it anyway. */
  homeGuard(
    pool: Permanent[],
    powerOf: (permanent: Permanent) => number,
  ): Set<Permanent> {
    let need = 0;
    for (let i = 0; i < this.life.length; i++) {
      if (!this.isOpponentAlive(i)) continue;
      const opponentPowers = this.arena!.board(this, i).sort(
        (first, second) => second - first,
      );
      let sum = opponentPowers.reduce((total, value) => total + value, 0),
        strongestRemoved = 0;
      while (sum >= this.myLife && strongestRemoved < opponentPowers.length)
        sum -= opponentPowers[strongestRemoved++];
      need = Math.max(need, strongestRemoved);
    }
    const stay = new Set<Permanent>();
    if (!need) return stay;
    const others = this.creatures().filter(
      (permanent) => !permanent.tapped && !pool.includes(permanent),
    ).length;
    const vig = pool.filter((permanent) =>
      permanent.card.keywords.has('vigilance'),
    ).length;
    const hold = need - others - vig;
    if (hold <= 0 || hold > pool.length) return stay;
    for (const otherPermanent of pool
      .filter((permanent) => !permanent.card.keywords.has('vigilance'))
      .sort((first, second) => powerOf(first) - powerOf(second))
      .slice(0, hold))
      stay.add(otherPermanent);
    return stay;
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
    if (this.arena!.forbiddenAttackSlots(this, creature).includes(slot))
      return false;
    const goaderSlots = this.arena!.goaderSlots(this, creature);
    if (!goaderSlots.includes(slot)) return true;
    return !this.life.some(
      (_, otherSlot) =>
        this.isOpponentAlive(otherSlot) && !goaderSlots.includes(otherSlot),
    );
  }

  /** The creatures of the pool that may attack opponent `slot`. */
  private allowedAttackers(pool: Permanent[], slot: number): Permanent[] {
    return pool.filter((creature) => this.mayAttackOpponent(creature, slot));
  }

  /** A forced attacker the plan left home joins a group attacking an opponent it may attack, or starts one at the
   *  opponent its controller would pick (the threat rule). */
  private addForcedAttackers(
    groups: { slot: number; attackers: Permanent[] }[],
    pool: Permanent[],
    powerOf?: (permanent: Permanent) => number,
    toughnessOf?: (permanent: Permanent) => number,
  ): void {
    for (const creature of pool) {
      if (!this.mustAttack(creature)) continue;
      if (groups.some((group) => group.attackers.includes(creature))) continue;
      const group = groups.find((existing) =>
        this.mayAttackOpponent(creature, existing.slot),
      );
      if (group) {
        group.attackers.push(creature);
        continue;
      }
      let bestSlot = -1,
        bestScore = 0;
      for (let slot = 0; slot < this.life.length; slot++) {
        if (!this.isOpponentAlive(slot)) continue;
        if (!this.mayAttackOpponent(creature, slot)) continue;
        const score =
          this.planAttack(slot, [creature], powerOf, toughnessOf).score +
          this.arena!.prefer(this, slot);
        if (bestSlot < 0 || score > bestScore) {
          bestSlot = slot;
          bestScore = score;
        }
      }
      if (bestSlot >= 0) groups.push({ slot: bestSlot, attackers: [creature] });
    }
  }

  /** After our combat: creatures that must attack and weren't sent attack now (the deck's own combat left them home). */
  override attackWithForcedCreatures(): void {
    if (this.inArena()) {
      const forced = this.creatures().filter(
        (creature) =>
          !creature.tapped &&
          (!creature.sick || creature.card.haste) &&
          !this.attackersThisTurn.has(creature) &&
          this.mustAttack(creature),
      );
      if (forced.length) this.arenaCombat(forced);
    }
    this.attackersThisTurn.clear();
  }

  /** Pod combat for a group of our creatures: choose the opponent and the attackers, attack, deal the damage.
   *  Creatures that must attack always go, and a goaded one avoids its goaders if it can. */
  override arenaCombat(
    pool: Permanent[],
    powerOf?: (permanent: Permanent) => number,
    toughnessOf?: (permanent: Permanent) => number,
  ): void {
    const power = powerOf ?? ((permanent: Permanent) => this.power(permanent));
    let best: {
      slot: number;
      attackers: Permanent[];
      score: number;
      damage: number;
    } | null = null;
    const stay = this.homeGuard(pool, power);
    for (const guard of stay) if (this.mustAttack(guard)) stay.delete(guard);
    for (const candidates of stay.size
      ? [pool, pool.filter((permanent) => !stay.has(permanent))]
      : [pool]) {
      for (let i = 0; i < this.life.length; i++) {
        if (!this.isOpponentAlive(i)) continue;
        const plan = this.planAttack(
          i,
          this.allowedAttackers(candidates, i),
          powerOf,
          toughnessOf,
        );
        // the whole team only for a kill; otherwise the guards stay home
        if (candidates === pool && stay.size && plan.score < 1000) continue;
        if (!plan.attackers.length || plan.score <= 0) continue;
        const score = plan.score + this.arena!.prefer(this, i);
        if (best === null || score > best.score)
          best = { slot: i, ...plan, score: score };
      }
      if (best) break;
    }
    if (!best && !pool.some((creature) => this.mustAttack(creature))) return;
    // the creatures that weren't sent may attack other opponents (the guards stay home)
    const groups: { slot: number; attackers: Permanent[] }[] = best
      ? [best]
      : [];
    const plannedAttackers = best ? best.attackers : [];
    const keepsGuardsHome = best === null || best.score < 1000;
    let rest = pool.filter(
      (permanent) =>
        !plannedAttackers.includes(permanent) &&
        !(stay.has(permanent) && keepsGuardsHome),
    );
    while (rest.length && groups.length < 3) {
      let next: {
        slot: number;
        attackers: Permanent[];
        score: number;
        damage: number;
      } | null = null;
      for (let i = 0; i < this.life.length; i++) {
        if (!this.isOpponentAlive(i) || groups.some((x) => x.slot === i))
          continue;
        const plan = this.planAttack(
          i,
          this.allowedAttackers(rest, i),
          powerOf,
          toughnessOf,
        );
        if (!plan.attackers.length || plan.score <= 0) continue;
        const score = plan.score + this.arena!.prefer(this, i);
        if (next === null || score > next.score)
          next = { slot: i, ...plan, score: score };
      }
      if (!next) break;
      groups.push(next);
      rest = rest.filter((permanent) => !next!.attackers.includes(permanent));
    }
    this.addForcedAttackers(groups, pool, powerOf, toughnessOf);
    if (!groups.length) return;
    this.attacked = true;
    const sent = groups.flatMap((x) => x.attackers);
    for (const permanent of sent)
      if (!permanent.card.keywords.has('vigilance')) permanent.tapped = true;
    addFirebendingMana(this, sent);
    const joined = this.onAttack(sent);
    const connected: Permanent[] = [];
    let total = 0;
    groups.forEach((group, groupIndex) => {
      const all = [
        ...group.attackers,
        ...(groupIndex === 0 ? joined : []),
      ].filter((permanent) => this.battlefield.includes(permanent));
      if (!all.length || !this.isOpponentAlive(group.slot)) return;
      const strikeResult = this.strike(group.slot, all, powerOf, toughnessOf);
      connected.push(...strikeResult.connected);
      total += strikeResult.damage;
      this.sayEvent(
        'attack',
        `attack ${this.opponentName(group.slot)} with ${all.length} creature(s): ${strikeResult.damage} damage (${this.opponentName(group.slot)} ${this.life[group.slot]})`,
      );
    });
    this.onCombatDamage(
      connected.filter((permanent) => this.battlefield.includes(permanent)),
      total,
    );
  }

  /** A pod, after our second main phase: if the biggest opposing board would leave us at config.chump_life (10) or less next turn
   *  even with our untapped creatures blocking, cast creatures from hand as blockers, cheapest first (decks built against
   *  goldfish opponents never do this on their own). */
  override podDefence(): void {
    for (let round = 0; round < 4; round++) {
      const worst = this.biggestAttackNextTurn();
      if (
        worst <= 0 ||
        this.myLife - worst > ((this.config.chump_life as number) ?? 10)
      )
        return;
      const cards = this.hand
        .filter(
          (card) =>
            card.isCreature && this.canPay(this.effectiveCost(card), false),
        )
        .sort(
          (first, second) =>
            this.effectiveCost(first).manaValue -
            this.effectiveCost(second).manaValue,
        );
      if (!cards.length || !this.castPerm(cards[0])) return;
      this.say(
        '(a blocker: the biggest opposing board would leave us at',
        this.myLife - worst,
        'life)',
      );
    }
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
    const mine = this.creatures().filter(
      (permanent) => !permanent.tapped,
    ).length;
    let worst = 0;
    for (let i = 0; i < this.life.length; i++) {
      if (!this.isOpponentAlive(i)) continue;
      const opponentPowers = this.arena!.board(this, i)
        .sort((first, second) => second - first)
        .slice(mine);
      worst = Math.max(
        worst,
        opponentPowers.reduce((total, value) => total + value, 0),
      );
    }
    return worst;
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
    const answer = this.answer(card);
    const cost = this.effectiveCost(
      card,
      answer?.cost ? Cost.parse(answer.cost) : null,
    );
    if (card.name === FIERCE_GUARDIANSHIP && this.controlsCommander())
      return new Cost();
    if (
      card.name === FORCE_OF_WILL &&
      !this.canPay(cost, true) &&
      this.forceOfWillPitch(card)
    )
      return new Cost();
    if (
      card.name === DAZE &&
      !this.canPay(cost, true) &&
      this.islandToReturnForDaze()
    )
      return new Cost();
    return cost;
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
    const cost = this.answerCost(card);
    if (!this.hand.includes(card) || !this.pay(cost, true)) return false;
    if (card.name === FORCE_OF_WILL && cost.manaValue === 0) {
      // the alternative cost: exile a blue card and pay 1 life
      this.moveCard(this.forceOfWillPitch(card)!, 'hand', 'exile');
      this.loseLife(1);
    }
    if (card.name === DAZE && cost.manaValue === 0) {
      // the alternative cost: return an Island to hand
      const island = this.islandToReturnForDaze()!;
      this.takeFromBattlefield(island);
      this.putCard(island.card, 'hand');
    }
    this.moveCard(card, 'hand', 'graveyard');
    this.podAnnounceCast(card);
    const life = this.answer(card)?.pay ?? 0;
    if (life) this.loseLife(life);
    return true;
  }
  static spellOk(answer: Answer, card: CardDef): boolean {
    if (answer.spells === 'noncreature') return !card.isCreature;
    if (answer.spells === 'instant') return card.isInstant;
    if (answer.spells === 'instant-sorcery') return card.isInstantOrSorcery;
    return true;
  }
  static permOk(answer: Answer, types: Set<string>): boolean {
    return (
      !types.has('land') &&
      (answer.hits ?? []).some((hitType) => types.has(hitType))
    );
  }
  /** Answer a win attempt of `owner` at instant speed with up to `need` cards from hand (they are cast). A removal spell needs
   *  a legal target (type, "nonblack" and the like, hexproof); a shield of the owner's (Kira...) may counter it: then it is
   *  spent for nothing (listed with `shield`) and the next answer may try again. */
  podRespond(
    winAttempt: WinAttempt,
    need: number,
    owner: Game<unknown>,
  ): {
    card: string;
    target: string;
    how: string;
    shield?: string;
    answer: Answer;
    isAbility?: boolean;
  }[] {
    const out: {
      card: string;
      target: string;
      how: string;
      shield?: string;
      answer: Answer;
      isAbility?: boolean;
    }[] = [];
    for (const card of this.hand.slice()) {
      if (out.filter((x) => !x.shield).length >= need) break;
      const answer = this.answer(card);
      if (!answer || !answer.instant || answer.kind === 'wipe') continue;
      const isStoppedByVeil =
        PROTECTIONS[winAttempt.protect ?? '']?.stops === 'blue-black-cards' &&
        (card.isBlue || card.isBlack);
      if (isStoppedByVeil) continue;
      if (answer.kind === 'counter') {
        const target = winAttempt.spells.find((x) =>
          Game.spellOk(answer, C.get(x)),
        );
        if (!target || !this.podCast(card)) continue;
        out.push({ card: card.name, target, how: 'countered', answer: answer });
        continue;
      }
      let permanent: Permanent | undefined;
      for (const x of winAttempt.perms) {
        permanent = owner.battlefield.find(
          (otherPermanent) =>
            otherPermanent.card.name === x &&
            Game.permOk(answer, otherPermanent.card.types) &&
            owner.podCanTarget(otherPermanent, answer),
        );
        if (permanent) break;
      }
      if (!permanent || !this.podCast(card)) continue;
      const shield = owner.podShield(permanent) ?? undefined;
      out.push({
        card: card.name,
        target: permanent.card.name,
        how: answer.how ?? 'destroy',
        shield,
        answer: answer,
      });
    }
    // then the counter abilities of our permanents (Diversion Unit, Soratami Savant)
    for (const permanent of this.battlefield.slice()) {
      if (out.filter((x) => !x.shield).length >= need) break;
      const ability = BOARD_COUNTERS[permanent.card.name];
      if (!ability) continue;
      const answer = boardCounterAnswer(ability);
      const target = winAttempt.spells.find((x) =>
        Game.spellOk(answer, C.get(x)),
      );
      if (!target || !this.useBoardCounter(permanent)) continue;
      out.push({
        card: permanent.card.name,
        target,
        how: 'countered',
        answer,
        isAbility: true,
      });
    }
    return out;
  }
  /** Our permanents whose counter ability (BOARD_COUNTERS) can counter this spell now. */
  boardCountersAgainst(spell: CardDef): Permanent[] {
    return this.battlefield.filter((permanent) => {
      const ability = BOARD_COUNTERS[permanent.card.name];
      return (
        ability !== undefined &&
        Game.spellOk(boardCounterAnswer(ability), spell) &&
        (!ability.returnLand || this.landsOnBattlefield().length > 0) &&
        this.canPay(Cost.parse(ability.cost), false)
      );
    });
  }
  /** Uses a permanent's counter ability: pays it, then sacrifices the permanent or returns a land (a tapped one
   *  first) to hand. False if it can't be paid. */
  useBoardCounter(permanent: Permanent): boolean {
    const ability = BOARD_COUNTERS[permanent.card.name];
    if (!ability || !this.pay(Cost.parse(ability.cost), false)) return false;
    if (ability.sacrifice) this.sacrifice(permanent);
    if (ability.returnLand) {
      const lands = this.landsOnBattlefield();
      const land = lands.find((candidate) => candidate.tapped) ?? lands[0];
      if (land) {
        this.takeFromBattlefield(land);
        this.putCard(land.card, 'hand');
      }
    }
    return true;
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
    if (!permanent.card.isCreature || this.config.pod_legal === false)
      return null;
    if (
      this.isOnBattlefield('Kira, Great Glass-Spinner') &&
      !this.podShielded.has(permanent)
    ) {
      this.podShielded.add(permanent);
      return 'Kira, Great Glass-Spinner';
    }
    const rain = this.findPermanent('Soratami Rainshaper');
    if (rain && this.openMana() >= 4) {
      this.tapMana(3);
      const land =
        this.landsOnBattlefield().find(
          (otherPermanent) => otherPermanent.tapped,
        ) ?? this.landsOnBattlefield()[0];
      if (land) {
        this.takeFromBattlefield(land);
        this.putCard(land.card, 'hand');
      }
      return 'Soratami Rainshaper';
    }
    const siren = this.findPermanent('Siren Stormtamer');
    if (
      siren &&
      siren !== permanent &&
      this.openMana() >= 1 &&
      this.canPay(Cost.parse('{U}'), true)
    ) {
      this.pay(Cost.parse('{U}'), true);
      this.sacrifice(siren);
      return 'Siren Stormtamer';
    }
    return null;
  }
  /** A board wipe is about to take these creatures of ours (all that it kills, the caster's own wipe too; `destroys`:
   *  it destroys them, so indestructible helps). A deck may answer at instant speed, e.g. by blinking them (what has
   *  left the battlefield is not hit). Returns the creatures that survive the wipe. */
  podAnswerWipe(_dying: Permanent[], _destroys: boolean): Permanent[] {
    return [];
  }
  /** One of our permanents was removed by this answer: what we get for it (a 3/3, a basic land, life, a 2/2). */
  podGet(permanent: Permanent, answer: Answer): void {
    if (answer.gives === 'token3')
      this.createTokens(C.makeToken('Beast', 3, 3, 'Green'));
    else if (answer.gives === 'manifest')
      this.createTokens(C.makeToken('Manifest', 2, 2));
    else if (answer.gives === 'life') this.gainLife(this.power(permanent));
    else if (answer.gives === 'land') {
      const basic = this.library.find(
        (card) =>
          card.land !== null &&
          /^(Snow-Covered )?(Plains|Island|Swamp|Mountain|Forest|Wastes)$/.test(
            card.name,
          ),
      );
      if (basic) {
        this.takeCard(basic, 'library');
        this.enter(basic, 'library', { tapped: true });
        this.shuffle();
      }
    }
  }
  /** Removed by an opponent's answer: off the battlefield, and the owner gets what the card gives. */
  podSuffer(permanent: Permanent, answer: Answer): void {
    if (!this.battlefield.includes(permanent)) return;
    this.podRemove(permanent, answer.how ?? 'destroy');
    this.podGet(permanent, answer);
  }
  /** One of our permanents is removed by an opponent. A commander goes back to the command zone (the tax counts its casts). */
  podRemove(permanent: Permanent, how: string): void {
    if (!this.battlefield.includes(permanent)) return;
    if (this.isCommander(permanent)) {
      this.takeFromBattlefield(permanent);
      this.putCard(permanent.card, 'command');
      this.onLeave(permanent);
    } else if (how === 'destroy' || how === 'sacrifice') {
      if (permanent.card.isCreature) this.dies(permanent);
      else {
        this.takeFromBattlefield(permanent);
        if (!permanent.token) this.putCard(permanent.card, 'graveyard');
        this.onLeave(permanent);
      }
    } else {
      this.takeFromBattlefield(permanent);
      if (!permanent.token)
        this.putCard(permanent.card, how === 'bounce' ? 'hand' : 'exile');
      this.onLeave(permanent);
    }
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
    const permanent = this.battlefield.find(
      (otherPermanent) =>
        otherPermanent.card.name === name && !otherPermanent.token,
    );
    if (permanent && how !== 'countered') {
      if (answer) this.podSuffer(permanent, answer);
      else this.podRemove(permanent, how);
      return;
    }
    const card = C.get(name);
    if (how === 'countered') this.tapMana(this.effectiveCost(card).manaValue);
    /** Takes the card with that name out of a zone. False if it is not there. */
    const take = (fromZone: CardListZone) => {
      const found = this[fromZone].find((otherCard) => otherCard.name === name);
      if (!found) return false;
      this.takeCard(found, fromZone);
      return true;
    };
    if (take('command')) this.putCard(card, 'command');
    else if (take('hand'))
      this.putCard(
        card,
        how === 'exile' ? 'exile' : how === 'bounce' ? 'hand' : 'graveyard',
      );
    else if (how === 'countered' && take('graveyard'))
      this.putCard(card, 'exile');
    // a shortcut line (a loop that draws its finisher) still had it in the library
    else if (take('library'))
      this.putCard(card, how === 'exile' ? 'exile' : 'graveyard');
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
    const used: string[] = [];
    for (const name of against) {
      const target = C.get(name);
      const card = this.hand.find((otherCard) => {
        const answer = this.answer(otherCard);
        return (
          answer?.kind === 'counter' &&
          Game.spellOk(answer, target) &&
          this.canPay(this.answerCost(otherCard), true)
        );
      });
      if (card && this.podCast(card)) used.push(card.name);
    }
    return used;
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
    return this.battlefield
      .filter(
        (permanent) =>
          permanent.land === null &&
          Game.permOk(answer, permanent.card.types) &&
          this.podCanTarget(permanent, answer),
      )
      .map((permanent) => ({
        permanent,
        name: permanent.card.name,
        power: permanent.card.isCreature ? this.power(permanent) : 0,
        types: permanent.card.types,
        token: permanent.token,
        commander: this.isCommander(permanent),
        value:
          (permanent.token ? 0 : this.cardValue(permanent.card)) +
          (this.isCommander(permanent) ? 30 : 0) +
          (permanent.card.isCreature ? 2 * this.power(permanent) : 0),
      }));
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
const FORCE_OF_WILL = 'Force of Will';
const FIERCE_GUARDIANSHIP = 'Fierce Guardianship';
const DAZE = 'Daze';

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

/** A permanent's counter ability seen as an answer (what spells it may counter). */
function boardCounterAnswer(ability: BoardCounter): Answer {
  return { kind: 'counter', instant: true, spells: ability.spells };
}
