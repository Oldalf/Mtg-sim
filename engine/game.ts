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
  Perm,
  Target,
  WinAttempt,
} from './game-types';
import { removeOrThrow } from './lists';

export abstract class Game<S = unknown> extends GameCore<S> {
  /** Set in a pod game: real opponents with real blockers. */
  arena: Arena | null = null;

  override podAllowsKill(): boolean {
    return !this.inArena() || this.arena!.go(this);
  }
  override podCounters(cd: CardDef): boolean {
    return this.inArena() && this.arena!.counter(this, cd);
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
  evasion(p: Perm): Evasion {
    return this.evasive(p) ? (p.cd.flying ? 'flying' : 'unblockable') : 'none';
  }
  /** What we'd pay to keep this creature: decides which creatures trade or chump block. */
  blockValue(p: Perm): number {
    return (p.token ? 5 : 10 + 10 * p.cd.mv) + (this.isCommander(p) ? 100 : 0);
  }
  isCommander(p: Perm): boolean {
    return !p.token && this.commanderNames.includes(p.cd.name);
  }
  fighter(
    p: Perm,
    pw?: (p: Perm) => number,
    tg?: (p: Perm) => number,
  ): Fighter {
    const k = p.cd.keywords;
    return {
      p,
      name: p.cd.name,
      power: pw ? pw(p) : this.power(p),
      toughness: tg ? tg(p) : this.toughness(p),
      evasion: this.evasion(p),
      air: k.has('flying') || k.has('reach'),
      deathtouch: k.has('deathtouch'),
      value: this.blockValue(p),
      commander: this.isCommander(p),
      trample: k.has('trample'),
      first: k.has('first strike') || k.has('double strike'),
      menace: k.has('menace'),
    };
  }
  /** Our untapped creatures, as blockers (a summoning-sick creature can block). */
  blockers(): Fighter[] {
    return this.creatures()
      .filter((p) => !p.tapped)
      .map((p) => this.fighter(p));
  }
  /** We are about to take this much combat damage: prevent all combat damage this turn (a fog)? Returns true if we did. */
  fogPrevent(_dmg: number, _lethal: boolean): boolean {
    return false;
  }

  /** Attack opponent `slot` for real: blockers are declared, creatures die, the damage that connects is dealt. */
  strike(
    slot: number,
    att: Perm[],
    pw?: (p: Perm) => number,
    tg?: (p: Perm) => number,
  ): { dmg: number; connected: Perm[] } {
    const r = this.arena!.fight(
      this,
      slot,
      att.map((p) => this.fighter(p, pw, tg)),
      true,
    );
    if (r.bounced) for (const row of r.rows) this.podRemove(row.a.p, 'bounce');
    for (const row of r.rows) if (row.aDies) this.dies(row.a.p);
    if (r.kills) this.hurtOpp(slot, Math.max(r.dmg, this.life[slot]));
    else if (r.dmg > 0) this.combatHit(slot, r.dmg);
    return {
      dmg: r.dmg,
      connected:
        r.dmg > 0 ? r.rows.filter((x) => x.b === null).map((x) => x.a.p) : [],
    };
  }

  /** Combat damage our creatures deal to opponent `slot` (a deck may replace it: The Mindskinner). */
  combatHit(slot: number, n: number): void {
    this.hurtOpp(slot, n);
  }

  /** The attackers worth sending at opponent `slot`, and what the attack would do. An attacker stays home if it
   *  would be blocked without killing its blocker, or would die for less than it kills; a lethal attack sends everything. */
  planAttack(
    slot: number,
    pool: Perm[],
    pw?: (p: Perm) => number,
    tg?: (p: Perm) => number,
  ): { att: Perm[]; score: number; dmg: number } {
    let att = pool.slice();
    let r: FightResult = { rows: [], dmg: 0, kills: false };
    for (let it = 0; it < 6 && att.length; it++) {
      r = this.arena!.fight(
        this,
        slot,
        att.map((p) => this.fighter(p, pw, tg)),
        false,
      );
      if (r.kills) break;
      const bad = new Set(
        r.rows
          .filter(
            (x) =>
              x.b !== null && (!x.bDies || (x.aDies && x.b.value < x.a.value)),
          )
          .map((x) => x.a.p),
      );
      if (!bad.size) break;
      att = att.filter((p) => !bad.has(p));
    }
    if (!att.length) return { att, score: 0, dmg: 0 };
    const gain = r.rows.reduce(
      (s, x) => s + (x.bDies ? x.b!.value : 0) - (x.aDies ? x.a.value : 0),
      0,
    );
    return {
      att,
      score: (r.kills ? 1000 : 0) + r.dmg + gain / 20 - this.life[slot] / 1000,
      dmg: r.dmg,
    };
  }

  /** The opponent to attack with these creatures (the attack that does the most; a kill first), or null if no attack is worth it.
   *  `prefer` adds to an opponent's score. */
  pickDefender(
    pool: Perm[],
    prefer?: (slot: number) => number,
  ): { slot: number; att: Perm[] } | null {
    let best: { slot: number; att: Perm[] } | null = null,
      bs = 0;
    for (let i = 0; i < this.life.length; i++) {
      if (!this.oppAlive(i)) continue;
      const pl = this.planAttack(i, pool);
      if (!pl.att.length) continue;
      const sc =
        pl.score +
        (prefer ? prefer(i) : 0) +
        this.arena!.prefer(this, i) +
        0.01;
      if (best === null || sc > bs) {
        best = { slot: i, att: pl.att };
        bs = sc;
      }
    }
    return best;
  }

  /** Creatures to keep home as blockers: enough that the biggest board among the opponents can't kill us next turn
   *  (each blocker stops their biggest attacker). None if we couldn't stop it anyway. */
  homeGuard(pool: Perm[], pw: (p: Perm) => number): Set<Perm> {
    let need = 0;
    for (let i = 0; i < this.life.length; i++) {
      if (!this.oppAlive(i)) continue;
      const ps = this.arena!.board(this, i).sort((a, b) => b - a);
      let sum = ps.reduce((s, x) => s + x, 0),
        k = 0;
      while (sum >= this.myLife && k < ps.length) sum -= ps[k++];
      need = Math.max(need, k);
    }
    const stay = new Set<Perm>();
    if (!need) return stay;
    const others = this.creatures().filter(
      (p) => !p.tapped && !pool.includes(p),
    ).length;
    const vig = pool.filter((p) => p.cd.keywords.has('vigilance')).length;
    const hold = need - others - vig;
    if (hold <= 0 || hold > pool.length) return stay;
    for (const p of pool
      .filter((q) => !q.cd.keywords.has('vigilance'))
      .sort((a, b) => pw(a) - pw(b))
      .slice(0, hold))
      stay.add(p);
    return stay;
  }

  /** Pod combat for a group of our creatures: choose the opponent and the attackers, attack, deal the damage. */
  override arenaCombat(
    pool: Perm[],
    pw?: (p: Perm) => number,
    tg?: (p: Perm) => number,
  ): void {
    const power = pw ?? ((p: Perm) => this.power(p));
    let best: { slot: number; att: Perm[]; score: number; dmg: number } | null =
      null;
    const stay = this.homeGuard(pool, power);
    for (const cands of stay.size
      ? [pool, pool.filter((p) => !stay.has(p))]
      : [pool]) {
      for (let i = 0; i < this.life.length; i++) {
        if (!this.oppAlive(i)) continue;
        const pl = this.planAttack(i, cands, pw, tg);
        // the whole team only for a kill; otherwise the guards stay home
        if (cands === pool && stay.size && pl.score < 1000) continue;
        if (!pl.att.length || pl.score <= 0) continue;
        const sc = pl.score + this.arena!.prefer(this, i);
        if (best === null || sc > best.score)
          best = { slot: i, ...pl, score: sc };
      }
      if (best) break;
    }
    if (!best) return;
    // the creatures that weren't sent may attack other opponents (the guards stay home)
    const groups = [best];
    let rest = pool.filter(
      (p) => !best!.att.includes(p) && !(stay.has(p) && best!.score < 1000),
    );
    while (rest.length && groups.length < 3) {
      let next: {
        slot: number;
        att: Perm[];
        score: number;
        dmg: number;
      } | null = null;
      for (let i = 0; i < this.life.length; i++) {
        if (!this.oppAlive(i) || groups.some((x) => x.slot === i)) continue;
        const pl = this.planAttack(i, rest, pw, tg);
        if (!pl.att.length || pl.score <= 0) continue;
        const sc = pl.score + this.arena!.prefer(this, i);
        if (next === null || sc > next.score)
          next = { slot: i, ...pl, score: sc };
      }
      if (!next) break;
      groups.push(next);
      rest = rest.filter((p) => !next!.att.includes(p));
    }
    this.attacked = true;
    const sent = groups.flatMap((x) => x.att);
    for (const p of sent) if (!p.cd.keywords.has('vigilance')) p.tapped = true;
    const joined = this.onAttack(sent);
    const connected: Perm[] = [];
    let total = 0;
    groups.forEach((gr, k) => {
      const all = [...gr.att, ...(k === 0 ? joined : [])].filter((p) =>
        this.bf.includes(p),
      );
      if (!all.length || !this.oppAlive(gr.slot)) return;
      const r = this.strike(gr.slot, all, pw, tg);
      connected.push(...r.connected);
      total += r.dmg;
      this.say(
        `attack opponent ${gr.slot + 1} with ${all.length} creature(s): ${r.dmg} damage, opp life [${this.life.join(', ')}]`,
      );
    });
    this.onCombatDamage(
      connected.filter((p) => this.bf.includes(p)),
      total,
    );
  }

  /** A pod, after our second main phase: if the biggest opposing board would leave us at cfg.chump_life (10) or less next turn
   *  even with our untapped creatures blocking, cast creatures from hand as blockers, cheapest first (decks built against
   *  goldfish opponents never do this on their own). */
  override podDefence(): void {
    for (let n = 0; n < 4; n++) {
      const mine = this.creatures().filter((p) => !p.tapped).length;
      let worst = 0;
      for (let i = 0; i < this.life.length; i++) {
        if (!this.oppAlive(i)) continue;
        const ps = this.arena!.board(this, i)
          .sort((a, b) => b - a)
          .slice(mine);
        worst = Math.max(
          worst,
          ps.reduce((s, x) => s + x, 0),
        );
      }
      if (
        worst <= 0 ||
        this.myLife - worst > ((this.cfg.chump_life as number) ?? 10)
      )
        return;
      const cs = this.hand
        .filter((c) => c.isCreature && this.canPay(this.effCost(c), false))
        .sort((a, b) => this.effCost(a).mv - this.effCost(b).mv);
      if (!cs.length || !this.castPerm(cs[0])) return;
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
  answer(cd: CardDef): Answer | null {
    return ANSWERS[cd.name] ?? null;
  }
  answerCost(cd: CardDef): Cost {
    const a = this.answer(cd);
    return this.effCost(cd, a?.cost ? Cost.parse(a.cost) : null);
  }
  /** Mana to leave untapped on our own turn for the cheapest instant-speed answer in hand (from round cfg.hold_from, default 5). */
  override podReserve(): number {
    if (!this.podHold) return 0;
    if (
      !this.inArena() ||
      this.cfg.pod_answers === false ||
      this.turn < ((this.cfg.hold_from as number) ?? 5)
    )
      return 0;
    let best = 0;
    for (const c of this.hand) {
      const a = this.answer(c);
      if (!a || !a.instant || a.kind === 'wipe') continue;
      const mv = this.answerCost(c).mv;
      if (best === 0 || mv < best) best = mv;
    }
    return best;
  }
  /** Cast an answer from hand: pay for it, put it into the graveyard. False if we can't. */
  podCast(cd: CardDef): boolean {
    const cost = this.answerCost(cd);
    if (!this.hand.includes(cd) || !this.pay(cost, true)) return false;
    removeOrThrow(this.hand, cd);
    this.gy.push(cd);
    const life = this.answer(cd)?.pay ?? 0;
    if (life) this.loseLife(life);
    return true;
  }
  static spellOk(a: Answer, cd: CardDef): boolean {
    if (a.spells === 'noncreature') return !cd.isCreature;
    if (a.spells === 'instant') return cd.isInstant;
    if (a.spells === 'instant-sorcery') return cd.isIS;
    return true;
  }
  static permOk(a: Answer, types: Set<string>): boolean {
    return !types.has('land') && (a.hits ?? []).some((h) => types.has(h));
  }
  /** Answer a win attempt of `owner` at instant speed with up to `need` cards from hand (they are cast). A removal spell needs
   *  a legal target (type, "nonblack" and the like, hexproof); a shield of the owner's (Kira...) may counter it: then it is
   *  spent for nothing (listed with `shield`) and the next answer may try again. */
  podRespond(
    w: WinAttempt,
    need: number,
    owner: Game<unknown>,
  ): {
    card: string;
    target: string;
    how: string;
    shield?: string;
    a: Answer;
  }[] {
    const out: {
      card: string;
      target: string;
      how: string;
      shield?: string;
      a: Answer;
    }[] = [];
    for (const cd of this.hand.slice()) {
      if (out.filter((x) => !x.shield).length >= need) break;
      const a = this.answer(cd);
      if (!a || !a.instant || a.kind === 'wipe') continue;
      if (a.kind === 'counter') {
        const target = w.spells.find((x) => Game.spellOk(a, C.get(x)));
        if (!target || !this.podCast(cd)) continue;
        out.push({ card: cd.name, target, how: 'countered', a });
        continue;
      }
      let p: Perm | undefined;
      for (const x of w.perms) {
        p = owner.bf.find(
          (q) =>
            q.cd.name === x &&
            Game.permOk(a, q.cd.types) &&
            owner.podCanTarget(q, a),
        );
        if (p) break;
      }
      if (!p || !this.podCast(cd)) continue;
      const shield = owner.podShield(p) ?? undefined;
      out.push({
        card: cd.name,
        target: p.cd.name,
        how: a.how ?? 'destroy',
        shield,
        a,
      });
    }
    return out;
  }
  /** May an opponent's removal spell target this permanent of ours? (Hexproof, shroud, the spell's own limits.) */
  podCanTarget(p: Perm, a: Answer): boolean {
    if (this.cfg.pod_legal === false) return true; // (a check: every permanent is a legal target)
    const k = p.cd.keywords;
    if (
      k.has('shroud') ||
      (k.has('hexproof') && !/hexproof from/i.test(p.cd.oracle))
    )
      return false;
    for (const x of a.not ?? []) {
      if (x === 'artifact' && p.cd.types.has('artifact')) return false;
      if (x === 'black' && p.cd.cost.b > 0) return false;
      if (x === 'counters' && p.counters !== 0) return false;
    }
    return true;
  }
  /** Creatures we already protected this turn (Kira counters only the first spell aimed at each creature). */
  podShielded = new Set<Perm>();
  /** This turn we keep mana up for an answer (the pod decides it each turn: --set hold_chance, default always). */
  podHold = true;
  /** An opponent aims a spell at this permanent of ours: do we counter it? Kira, Great Glass-Spinner (the first time each
   *  creature is targeted each turn), Soratami Rainshaper ({3} and a land back to hand: shroud), Siren Stormtamer ({U},
   *  sacrifice it). Returns the card that did it. */
  podShield(p: Perm): string | null {
    if (!p.cd.isCreature || this.cfg.pod_legal === false) return null;
    if (this.onBf('Kira, Great Glass-Spinner') && !this.podShielded.has(p)) {
      this.podShielded.add(p);
      return 'Kira, Great Glass-Spinner';
    }
    const rain = this.perm('Soratami Rainshaper');
    if (rain && this.openMana() >= 4) {
      this.tapMana(3);
      const land = this.landsBf().find((q) => q.tapped) ?? this.landsBf()[0];
      if (land) {
        removeOrThrow(this.bf, land);
        this.hand.push(land.cd);
      }
      return 'Soratami Rainshaper';
    }
    const siren = this.perm('Siren Stormtamer');
    if (
      siren &&
      siren !== p &&
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
  podGet(p: Perm, a: Answer): void {
    if (a.gives === 'token3')
      this.createTokens(C.makeToken('Beast', 3, 3, 'Green'));
    else if (a.gives === 'manifest')
      this.createTokens(C.makeToken('Manifest', 2, 2));
    else if (a.gives === 'life') this.gainLife(this.power(p));
    else if (a.gives === 'land') {
      const basic = this.library.find(
        (c) =>
          c.land !== null &&
          /^(Snow-Covered )?(Plains|Island|Swamp|Mountain|Forest|Wastes)$/.test(
            c.name,
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
  podSuffer(p: Perm, a: Answer): void {
    if (!this.bf.includes(p)) return;
    this.podRemove(p, a.how ?? 'destroy');
    this.podGet(p, a);
  }
  /** One of our permanents is removed by an opponent. A commander goes back to the command zone (the tax counts its casts). */
  podRemove(p: Perm, how: string): void {
    if (!this.bf.includes(p)) return;
    if (this.isCommander(p)) {
      removeOrThrow(this.bf, p);
      this.command.push(p.cd);
    } else if (how === 'destroy' || how === 'sacrifice') {
      if (p.cd.isCreature) this.dies(p);
      else {
        removeOrThrow(this.bf, p);
        if (!p.token) this.gy.push(p.cd);
      }
    } else {
      removeOrThrow(this.bf, p);
      if (!p.token) (how === 'bounce' ? this.hand : this.exile).push(p.cd);
    }
  }
  /** Tap n of our untapped mana sources (mana spent on something that was answered). */
  tapMana(n: number): void {
    for (const p of this.bf)
      if (n > 0 && !p.tapped && this.srcKind(p)) {
        p.tapped = true;
        n--;
      }
  }
  /** Our win was stopped at this card: it is gone from wherever it is. A countered spell goes to the graveyard (exile if it
   *  was cast from there) and its mana is spent; a removed permanent is destroyed / exiled / bounced (a commander goes to
   *  the command zone). The turn goes on. */
  podLose(name: string, how: string, a?: Answer): void {
    const p = this.bf.find((q) => q.cd.name === name && !q.token);
    if (p && how !== 'countered') {
      if (a) this.podSuffer(p, a);
      else this.podRemove(p, how);
      return;
    }
    const cd = C.get(name);
    if (how === 'countered') this.tapMana(this.effCost(cd).mv);
    const take = (xs: CardDef[]) => {
      const i = xs.findIndex((c) => c.name === name);
      if (i < 0) return false;
      xs.splice(i, 1);
      return true;
    };
    if (take(this.command)) this.command.push(cd);
    else if (take(this.hand))
      (how === 'exile'
        ? this.exile
        : how === 'bounce'
          ? this.hand
          : this.gy
      ).push(cd);
    else if (how === 'countered' && take(this.gy)) this.exile.push(cd);
    // a shortcut line (a loop that draws its finisher) still had it in the library
    else if (take(this.library))
      (how === 'exile' ? this.exile : this.gy).push(cd);
  }
  /** After our win was stopped: the opponents' totals go back to before the combo. Decks add their own flags. */
  podWinStopped(): void {
    if (this.podPre) {
      [this.life, this.lib, this.poison] = [
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
      const cd = this.hand.find((c) => {
        const a = this.answer(c);
        return (
          a?.kind === 'counter' &&
          Game.spellOk(a, target) &&
          this.canPay(this.answerCost(c), true)
        );
      });
      if (cd && this.podCast(cd)) used.push(cd.name);
    }
    return used;
  }
  /** How much the others want to counter this spell of ours: mana value x 10, +30 for a commander, + the card's key bonus. */
  podWeight(cd: CardDef): number {
    return (
      10 * cd.mv +
      (this.commanderNames.includes(cd.name) ? 30 : 0) +
      (KEY_SPELLS[cd.name] ?? 0)
    );
  }
  /** How close we are to winning, 0 to 1 (decks override it): part of the threat the others see. */
  podClose(): number {
    return 0;
  }
  /** Our permanents an opponent may aim this removal spell at. */
  podTargets(a: Answer): Target[] {
    return this.bf
      .filter(
        (p) =>
          p.land === null &&
          Game.permOk(a, p.cd.types) &&
          this.podCanTarget(p, a),
      )
      .map((p) => ({
        p,
        name: p.cd.name,
        power: p.cd.isCreature ? this.power(p) : 0,
        types: p.cd.types,
        token: p.token,
        commander: this.isCommander(p),
        value:
          (p.token ? 0 : this.cardValue(p.cd)) +
          (this.isCommander(p) ? 30 : 0) +
          (p.cd.isCreature ? 2 * this.power(p) : 0),
      }));
  }
  /** How dangerous we look to the others (step 4): board power, nonland permanents, mana, cards in hand, damage dealt so far,
   *  and the deck's own "close to winning" (podClose, worth cfg.threat_close, default 25). */
  threat(): number {
    let t = this.hand.length / 2 + this.damageDealt / 10;
    for (const p of this.bf) {
      if (p.land !== null) t += 0.5;
      else t += (p.cd.isCreature ? this.power(p) : 0) + (p.cd.rock ? 1 : 3);
    }
    return t + ((this.cfg.threat_close as number) ?? 25) * this.podClose();
  }
  /** We are being attacked: an instant in hand that returns the attackers to hand (Aetherize), if the hit is lethal or big. */
  podDefend(dmg: number, lethal: boolean): 'none' | 'fog' | 'bounce' {
    if (this.fogPrevent(dmg, lethal)) return 'fog';
    if (!lethal && dmg < ((this.cfg.fog_at as number) ?? 6)) return 'none';
    const cd = this.hand.find((c) => this.answer(c)?.wipe === 'attackers');
    return cd && this.podCast(cd) ? 'bounce' : 'none';
  }
}

/** Base for decks that have no kill search (no combo to find), so they skip the three search hooks. */
export abstract class GameWithoutKillSearch extends Game<null> {
  light(): null {
    return null;
  }
  lightKey(): string {
    return '';
  }
  killSearch(): KillSearcher<null> {
    return NO_KILL_SEARCH;
  }
}

const NO_KILL_SEARCH: KillSearcher<null> = {
  search: () => 0,
  lastLine: null,
  lastP: null,
  bestMiss: null,
  minChance: 1,
};
