/**
 * A game as the decks and the pod use it: GameCore (game-core.ts, the rules of one goldfish game) plus the pod parts:
 * combat against real opponents (blocks, attackers, fog), and interaction (removal, counterspells, answering a win,
 * the threat score). In a goldfish game none of this is used. See engine/pod.ts for how the pod drives it.
 *
 * A deck subclasses Game. It may override the pod hooks too: evasion(), blockValue(), fogPrevent(), podClose(),
 * podShield(), winAttempt(), podWinStopped(), combatHit().
 */
import * as C from './cards';
import { Cost, CardDef } from './cards';
import { ANSWERS, Answer, KEY_SPELLS } from './answers';
import { GameCore } from './game-core';
import {
  Arena,
  Evasion,
  Fighter,
  FightResult,
  KillSearcher,
  Permanent,
  Target,
  WinAttempt,
} from './game-types';
import { removeOrThrow } from './lists';

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
  override podAnswersWin(): boolean {
    return this.inArena() && this.arena!.answerWin(this);
  }

  // ================================================================ pod combat (real opponents; see engine/pod.ts)
  /** Are we the real game of a player in a pod (not a planner copy, not a goldfish game)? */
  override inArena(): boolean {
    return this.arena !== null && !this.inRollout && this.arena.real(this);
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
      !permanent.token && this.commanderNames.includes(permanent.card.name)
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

  /** Pod combat for a group of our creatures: choose the opponent and the attackers, attack, deal the damage. */
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
    for (const candidates of stay.size
      ? [pool, pool.filter((permanent) => !stay.has(permanent))]
      : [pool]) {
      for (let i = 0; i < this.life.length; i++) {
        if (!this.isOpponentAlive(i)) continue;
        const plan = this.planAttack(i, candidates, powerOf, toughnessOf);
        // the whole team only for a kill; otherwise the guards stay home
        if (candidates === pool && stay.size && plan.score < 1000) continue;
        if (!plan.attackers.length || plan.score <= 0) continue;
        const score = plan.score + this.arena!.prefer(this, i);
        if (best === null || score > best.score)
          best = { slot: i, ...plan, score: score };
      }
      if (best) break;
    }
    if (!best) return;
    // the creatures that weren't sent may attack other opponents (the guards stay home)
    const groups = [best];
    let rest = pool.filter(
      (permanent) =>
        !best!.attackers.includes(permanent) &&
        !(stay.has(permanent) && best!.score < 1000),
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
        const plan = this.planAttack(i, rest, powerOf, toughnessOf);
        if (!plan.attackers.length || plan.score <= 0) continue;
        const score = plan.score + this.arena!.prefer(this, i);
        if (next === null || score > next.score)
          next = { slot: i, ...plan, score: score };
      }
      if (!next) break;
      groups.push(next);
      rest = rest.filter((permanent) => !next!.attackers.includes(permanent));
    }
    this.attacked = true;
    const sent = groups.flatMap((x) => x.attackers);
    for (const permanent of sent)
      if (!permanent.card.keywords.has('vigilance')) permanent.tapped = true;
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

  // ================================================================ pod interaction (answers; see engine/answers.ts and engine/pod.ts)
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
    return this.effectiveCost(
      card,
      answer?.cost ? Cost.parse(answer.cost) : null,
    );
  }
  /** Mana to leave untapped on our own turn for the cheapest instant-speed answer in hand (from round config.hold_from, default 5). */
  override podReserve(): number {
    if (!this.podHold) return 0;
    if (
      !this.inArena() ||
      this.config.pod_answers === false ||
      this.turn < ((this.config.hold_from as number) ?? 5)
    )
      return 0;
    let best = 0;
    for (const card of this.hand) {
      const answer = this.answer(card);
      if (!answer || !answer.instant || answer.kind === 'wipe') continue;
      const manaValue = this.answerCost(card).manaValue;
      if (best === 0 || manaValue < best) best = manaValue;
    }
    return best;
  }
  /** Cast an answer from hand: pay for it, put it into the graveyard. False if we can't. */
  podCast(card: CardDef): boolean {
    const cost = this.answerCost(card);
    if (!this.hand.includes(card) || !this.pay(cost, true)) return false;
    removeOrThrow(this.hand, card);
    this.graveyard.push(card);
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
  }[] {
    const out: {
      card: string;
      target: string;
      how: string;
      shield?: string;
      answer: Answer;
    }[] = [];
    for (const card of this.hand.slice()) {
      if (out.filter((x) => !x.shield).length >= need) break;
      const answer = this.answer(card);
      if (!answer || !answer.instant || answer.kind === 'wipe') continue;
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
    return out;
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
   *  sacrifice it). Returns the card that did it. */
  podShield(permanent: Permanent): string | null {
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
        removeOrThrow(this.battlefield, land);
        this.hand.push(land.card);
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
        removeOrThrow(this.library, basic);
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
      removeOrThrow(this.battlefield, permanent);
      this.command.push(permanent.card);
    } else if (how === 'destroy' || how === 'sacrifice') {
      if (permanent.card.isCreature) this.dies(permanent);
      else {
        removeOrThrow(this.battlefield, permanent);
        if (!permanent.token) this.graveyard.push(permanent.card);
      }
    } else {
      removeOrThrow(this.battlefield, permanent);
      if (!permanent.token)
        (how === 'bounce' ? this.hand : this.exile).push(permanent.card);
    }
  }
  /** Tap n of our untapped mana sources (mana spent on something that was answered). */
  tapMana(amount: number): void {
    for (const permanent of this.battlefield)
      if (amount > 0 && !permanent.tapped && this.manaSourceKind(permanent)) {
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
    const take = (cards: CardDef[]) => {
      const i = cards.findIndex((otherCard) => otherCard.name === name);
      if (i < 0) return false;
      cards.splice(i, 1);
      return true;
    };
    if (take(this.command)) this.command.push(card);
    else if (take(this.hand))
      (how === 'exile'
        ? this.exile
        : how === 'bounce'
          ? this.hand
          : this.graveyard
      ).push(card);
    else if (how === 'countered' && take(this.graveyard)) this.exile.push(card);
    // a shortcut line (a loop that draws its finisher) still had it in the library
    else if (take(this.library))
      (how === 'exile' ? this.exile : this.graveyard).push(card);
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
}

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
