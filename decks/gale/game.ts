/**
 * The Gale deck's AI: what it wants to do each turn, and the rules of the cards only it uses.
 * The game itself (mana, zones, casting, turns, planner) is the shared engine in engine/game-core.ts.
 *
 * Files:
 *   roles.ts             what each card is for (combo pieces, engines, packages, scores)
 *   game.ts              this file: GaleGame, its state, hooks and what the AI values
 *   candidates.ts        everything the AI may do now, with a score each, and Gale's recasts
 *   tutoring.ts          what to tutor for, and which Gifts Ungiven pile to make
 *   spells.ts            what the spells only this deck uses do when they resolve
 *   snapshot.ts          builds the state the kill search starts from
 *   kills.ts             the kill search and its pre-filter
 *   kill-state.ts        the state the search works on, and the effects of spells on it
 *   kill-moves.ts        the moves of the search (what can be cast or activated from a state)
 *   chain-probability.ts checks lines that rely on Konrad's creature count against real shuffles
 */
import * as C from '../../engine/cards';
import * as Facts from '../../engine/card-facts';
import {
  COMBO_PERMS,
  COMBO_SORC,
  ENGINES,
  GALE,
  PACKAGES,
  PERM_SCORE,
  SCION,
  permScore,
} from './roles';
import { OPPONENT_EVENT, KillSearchState } from './kill-state';
import { finisherReachable, search } from './kills';
import { chooseTutorTarget } from './tutoring';
import { buildCandidates, castWithGaleRecast } from './candidates';
import { buildKillSearchState } from './snapshot';
import { resolveGaleSpell } from './spells';
import { CardDef, Cost } from '../../engine/cards';
import {
  Candidate,
  KillSearcher,
  LogBoardView,
  Permanent,
  WinAttempt,
} from '../../engine/game-types';
import { Game } from '../../engine/game';
import { MulliganRule } from '../../engine/mulligan';
import { MULLIGAN } from './mulligan';

export class GaleGame extends Game<KillSearchState> {
  override mulliganRule(): MulliganRule | null {
    return this.config.smart_mulligan ? MULLIGAN : null;
  }
  // (subclass fields are set after the engine's constructor has run, so they can use this.config)
  everySplitWinsNextTurn = false;
  galeCasts = 0;
  opponentCreatureAccumulator: number[] = new Array(
    this.config.opponents as number,
  ).fill(0);
  guildmageActivations = 0;
  konradActivations = 0;
  emetSelchUsed = false;
  override chanceName = 'Konrad chain';

  killSearch(): KillSearcher<KillSearchState> {
    return search;
  }
  override killReachable(state: KillSearchState): boolean {
    return finisherReachable(state);
  }
  killSearchStateKey(state: KillSearchState): string {
    return state.searchKey();
  }
  override killSearchStatePool(state: KillSearchState): Record<string, number> {
    return { ...state.pool };
  }

  // ---------------------------------------------------------------- log analyzer hooks
  override syncFromLog(board: LogBoardView): void {
    this.galeCasts = board.battlefield.some(
      (permanent) => permanent.name === GALE,
    )
      ? 1
      : 0;
  }
  override addManaToKillSearchState(
    state: KillSearchState,
    amount: number,
  ): void {
    state.pool.A += amount;
    state.coloursFromOutsideLands += amount;
  }
  override addLandToKillSearchState(state: KillSearchState): void {
    state.pool.A += 1;
    state.landCount += 1;
    state.landMix = [
      state.landMix[0],
      state.landMix[1],
      state.landMix[2],
      state.landMix[3] + 1,
    ];
  }

  // ---------------------------------------------------------------- card rules only Gale uses
  override onToGraveyard(card: CardDef): void {
    if (card.isCreature && this.isOnBattlefield('Syr Konrad, the Grim'))
      this.applyOpponentEvents([OPPONENT_EVENT.KONRAD, -1, 1]);
  }

  override beforeDraw(): void {
    // Scion of Halaster: the first draw each turn looks at the top two, one goes to the graveyard
    if (
      !this.firstDrawDone &&
      this.isOnBattlefield(GALE) &&
      this.isOnBattlefield(SCION) &&
      this.library.length >= 2
    ) {
      this.firstDrawDone = true;
      const [topCard, secondCard] = this.library;
      const worse =
        this.discardValue(topCard) < this.discardValue(secondCard)
          ? topCard
          : secondCard;
      const keep = worse === topCard ? secondCard : topCard;
      this.takeTopCardsOfLibrary(2);
      this.putCardsOnTopOfLibrary([keep]);
      this.toGraveyard(worse);
      this.say(`Scion: ${worse.name} -> graveyard`);
    }
  }

  override castTriggers(
    card: CardDef,
    fromGraveyard: boolean,
    triggerOptions: Record<string, unknown>,
  ): void {
    // Gale: casting an instant/sorcery from hand lets you cast one of the other type from the graveyard
    const target = triggerOptions.galeTarget as CardDef | null | undefined;
    if (target && !fromGraveyard && this.isOnBattlefield(GALE)) {
      const gcost = this.effectiveCost(
        target,
        (triggerOptions.galeBase as Cost | undefined) ?? null,
        true,
      );
      if (this.pay(gcost, true)) {
        this.takeCard(target, 'graveyard');
        this.say('  Gale recasts', target);
        this.spellsCast += 1;
        this.onCastInstantOrSorcery(true);
        this.resolve(target, true, null);
        this.putCard(target, 'exile');
      }
    }
  }

  /** A pod: what the others can answer in our kill line. The spells it casts (the most expensive first: the finisher),
   *  and the permanents it names (Guildmage, Mindskinner, the Monument, Gale for a cast from the graveyard). */
  override winAttempt(): WinAttempt | null {
    const text = this.lastKillLine.join(' | ');
    if (!text) return null;
    const have = new Set(
      [...this.hand, ...this.graveyard, ...this.library].map(
        (card) => card.name,
      ),
    );
    const spells: string[] = [];
    for (const match of text.matchAll(
      /cast (.+?)(?: \[unk\])? from (?:hand|graveyard)/g,
    ))
      if (have.has(match[1]) && !spells.includes(match[1]))
        spells.push(match[1]);
    spells.sort(
      (first, second) => C.get(second).manaValue - C.get(first).manaValue,
    );
    const perms: string[] = [];
    for (const permanent of this.battlefield) {
      if (
        permanent.land !== null ||
        permanent.card.rock ||
        perms.includes(permanent.card.name)
      )
        continue;
      const words = [
        permanent.card.name,
        permanent.card.name.split(',')[0],
        ...permanent.card.name
          .split(/[ ,]+/)
          .filter((word) => word.length >= 7),
      ];
      if (words.some((word) => text.includes(word)))
        perms.push(permanent.card.name);
    }
    return {
      spells,
      perms,
      backup: this.protectedKillTurn === this.turn ? 1 : 0,
    };
  }

  /** A pod: with The Mindskinner out, damage our creatures would deal to an opponent is prevented and each opponent mills that many. */
  override combatHit(slot: number, amount: number): void {
    if (this.isOnBattlefield('The Mindskinner'))
      this.applyOpponentEvents([OPPONENT_EVENT.DMG, slot, amount]);
    else super.combatHit(slot, amount);
  }
  /** How close to winning the others think we are: Gale out, the kill engines, a big graveyard of instants and sorceries. */
  override podClose(): number {
    let closeness = 0;
    if (this.isOnBattlefield(GALE)) closeness += 0.3;
    if (
      this.isOnBattlefield('Duskmantle Guildmage') ||
      this.isOnBattlefield('The Mindskinner') ||
      this.isOnBattlefield('Riverchurn Monument')
    )
      closeness += 0.3;
    if (this.graveyard.filter((card) => card.isInstantOrSorcery).length >= 8)
      closeness += 0.2;
    if (
      this.landsOnBattlefield().length +
        this.battlefield.filter((permanent) => permanent.card.rock).length >=
      8
    )
      closeness += 0.2;
    return Math.min(1, closeness);
  }

  override commanderCost(card: CardDef, cost: Cost): Cost {
    return card.name === GALE
      ? cost.withGeneric(cost.generic + 2 * this.galeCasts)
      : cost;
  }
  override onCommanderCast(card: CardDef): void {
    if (card.name === GALE) this.galeCasts += 1;
  }

  override landWant(card: CardDef): [number, Cost] {
    let score = card.isInstantOrSorcery
      ? this.instantOrSorceryDevValue(card)
      : permScore(card.name, 30);
    let cost = this.effectiveCost(card);
    if (card.name === GALE) {
      cost = new Cost(cost.generic + 2 * this.galeCasts, cost.blue);
      score = 95;
    }
    return [score, cost];
  }
  override landBias(card: CardDef): number {
    return card.name === 'Jidoor, Aristocratic Capital' ? -1 : 0;
  }

  override startTurn(): void {
    super.startTurn();
    this.guildmageActivations = 0;
    this.emetSelchUsed = false;
    this.konradActivations = 0;
  }
  override resolveOther(
    card: CardDef,
    _fromGraveyard: boolean,
    _mode: string | null,
  ): void {
    return resolveGaleSpell(this, card, _fromGraveyard, _mode);
  }

  buildKillSearchState(
    nextTurn = false,
    add: string[] = [],
    remove: string[] = [],
  ): KillSearchState {
    return buildKillSearchState(this, nextTurn, add, remove);
  }

  /** Apply opponent events (Konrad triggers, Windfall, combat damage) to the real game. */
  applyOpponentEvents(events: number[]): void {
    const state = buildKillSearchState(this);
    state.resolveOpponentEvents(events);
    this.life = state.opponentLife;
    this.opponentLibrarySizes = state.opponentLibrary;
    this.opponentGraveyardSizes = state.opponentGraveyard;
    this.opponentCreatureAccumulator = state.opponentCreatureAccumulator;
  }

  // ---------------------------------------------------------------- what the AI wants
  override cardValue(card: CardDef): number {
    const name = card.name;
    if (card.land !== null) {
      const manaAndLands = this.manaSources() + this.countLandsHand();
      return manaAndLands <= 3
        ? 80
        : manaAndLands <= 6
          ? 60
          : manaAndLands <= 8
            ? 42
            : 12;
    }
    if (COMBO_PERMS.has(name) || COMBO_SORC.has(name)) {
      if (this.isOnBattlefield(name)) return 10;
      return this.hand.some((candidate) => candidate.name === name) ? 30 : 70;
    }
    if (Facts.COUNTERS.has(name)) return this.hasCounterInHand() ? 38 : 58;
    if (Facts.TUTORS.has(name)) return 66;
    if (name === 'Sol Ring') return 85;
    if (card.rock) return this.manaSources() < 6 ? 60 : 20;
    if (
      Facts.REDUCE_INSTANT_SORCERY_COST.has(name) ||
      Facts.REDUCE_NONCREATURE.has(name) ||
      Facts.REDUCE_BLUE.has(name) ||
      ENGINES.has(name)
    )
      return this.isOnBattlefield(name) ? 15 : 55;
    if (Facts.RITUALS.has(name)) return 42;
    if (name in Facts.DRAW_SPELLS) return 30 + 6 * Facts.DRAW_SPELLS[name];
    if (card.mdfcLand) return 50;
    return 25;
  }

  override discardValue(card: CardDef): number {
    let value = this.cardValue(card);
    if (card.isInstantOrSorcery && this.isOnBattlefield(GALE)) value -= 15;
    return value;
  }
  override tutorTarget(
    allowed: (card: CardDef) => boolean,
    toTop: boolean,
    spent: string | null = null,
    rampOk = false,
  ): CardDef | null {
    return chooseTutorTarget(this, allowed, toTop, spent, rampOk);
  }

  override instantOrSorceryDevValue(
    card: CardDef,
    fromGraveyard = false,
  ): number {
    const name = card.name;
    if (
      COMBO_SORC.has(name) ||
      Facts.COUNTERS.has(name) ||
      Facts.RITUALS.has(name)
    )
      return 0;
    if (name === 'See the Truth') return fromGraveyard ? 62 : 42;
    if (name in Facts.DRAW_SPELLS) {
      const value = 38 + 8 * Facts.DRAW_SPELLS[name];
      if (name === 'Windfall' && this.hand.length > 3) {
        if (!this.isOnBattlefield(GALE)) return 0;
        // with Gale out, discarded instants/sorceries stay castable from the graveyard,
        // so Windfall only really loses the permanents in hand
        const lost = this.hand.filter(
          (candidate) =>
            candidate !== card &&
            !candidate.isInstantOrSorcery &&
            candidate.land === null &&
            this.cardValue(candidate) >= 55,
        ).length;
        const binned = this.hand.filter(
          (candidate) => candidate !== card && candidate.isInstantOrSorcery,
        ).length;
        return lost === 0 ? Math.min(80, 60 + 4 * binned) : lost === 1 ? 45 : 0;
      }
      if (name === 'Insatiable Avarice') return 0;
      return value;
    }
    if (Facts.TUTORS.has(name)) return 72;
    if (name === 'Unearth')
      return this.graveyard.some(
        (candidate) =>
          candidate.isCreature &&
          candidate.manaValue <= 3 &&
          candidate.name in PERM_SCORE,
      )
        ? 60
        : 0;
    if (name === 'Snap') return 20;
    if (!card.known) return 15;
    return 0;
  }
  candidates(main2: boolean): Candidate[] {
    return buildCandidates(this, main2);
  }

  override canTapForEnergy(permanent: Permanent): boolean {
    return !(
      permanent.card.name === 'The Mindskinner' &&
      !permanent.sick &&
      !this.attacked
    ); // it would rather attack (Gale never does)
  }

  override castRitual(card: CardDef): boolean {
    return castWithGaleRecast(this, card);
  }

  /** Rough value of a position when no kill is in sight (higher is better). */
  override positionValue(): number {
    const state = buildKillSearchState(this, true);
    let value = 0;
    const pool = state.pool;
    value += 35 * Math.min(10, pool.U + pool.B + pool.A + pool.C + pool.S);
    value +=
      25 *
        (state.reductionInstantSorcery +
          state.reductionNoncreature +
          state.reductionBlue) +
      12 * state.reductionFromGraveyard;
    if (state.hasGale) {
      value += 150;
      value +=
        6 *
        this.graveyard.filter(
          (card) =>
            card.isInstantOrSorcery &&
            this.instantOrSorceryDevValue(card, true) > 0,
        ).length;
    }
    const have = new Set([
      ...this.hand.map((card) => card.name),
      ...this.battlefield.map((permanent) => permanent.card.name),
    ]);
    if (state.hasGale || this.command.length)
      for (const candidate of this.graveyard)
        if (candidate.isInstantOrSorcery) have.add(candidate.name);
    const miss = Math.min(
      ...PACKAGES.map(
        (pkg) =>
          pkg.filter((req) => ![...req].some((name) => have.has(name))).length,
      ),
    );
    value += miss === 0 ? 450 : miss === 1 ? 220 : miss === 2 ? 70 : 0;
    // engines / creatures on the battlefield are worth at least as much as in hand
    value +=
      0.6 *
      this.battlefield
        .filter((permanent) => permanent.land === null && !permanent.card.rock)
        .reduce(
          (total, permanent) => total + permScore(permanent.card.name, 0),
          0,
        );
    value +=
      0.4 * this.hand.reduce((total, card) => total + this.cardValue(card), 0);
    if (this.hasCounterInHand()) value += 40;
    return value;
  }

  override combat(): void {
    const permanent = this.findPermanent('The Mindskinner');
    if (permanent && !permanent.sick && !this.attacked) {
      this.attacked = true;
      const target = buildKillSearchState(this).biggestLibraryOpponent();
      if (target !== null) {
        this.applyOpponentEvents([OPPONENT_EVENT.DMG, target, 10]);
        this.say(
          'Mindskinner attacks: opp libraries',
          `[${this.opponentLibrarySizes.join(', ')}]`,
        );
      }
    }
    if (this.inArena()) {
      // a pod: the other creatures attack when no blocker can stop or kill them (in a goldfish game Gale never attacks)
      const pool = this.creatures().filter(
        (candidate) =>
          candidate.card.name !== 'The Mindskinner' &&
          !candidate.tapped &&
          !candidate.sick &&
          this.power(candidate) > 0 &&
          !this.manaSourceKind(candidate, true),
      );
      if (pool.length) this.arenaCombat(pool);
    }
  }
}
