/**
 * The Gale deck's AI: what it wants to do each turn, and the rules of the cards only it uses.
 * The game itself (mana, zones, casting, turns, planner) is the shared engine in engine/game/game-core.ts.
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
import * as C from '../../engine/cards/cards';
import * as Facts from '../../engine/cards/card-facts';
import {
  COMBO_PERMS,
  COMBO_SORC,
  ENGINES,
  GALE,
  PACKAGES,
  PERM_SCORE,
  isUnearthLike,
  permScore,
  unearthMaxManaValue,
} from './roles';
import {
  GaleKillStep,
  KillSearchState,
  OPPONENT_EVENT,
  Op,
} from './kill-state';
import { playGaleKillStep } from './kill-play';
import { finisherReachable, search } from './kills';
import { chooseTutorTarget } from './tutoring';
import {
  buildCandidates,
  buildOpponentsEndStepCandidates,
  castWithGaleRecast,
} from './candidates';
import { BORNE_UPON_A_WIND, QUICKEN } from '../../engine/game/instant-speed';
import { buildKillSearchState } from './snapshot';
import { chooseGiftsUngivenPile, resolveUnearth } from './spells';
import { CardDef, Cost } from '../../engine/cards/cards';
import {
  Candidate,
  KillSearcher,
  KillStep,
  LogBoardView,
  Permanent,
  WinAttempt,
} from '../../engine/game/game-types';
import { Game } from '../../engine/game/game';
import { MulliganRule } from '../../engine/game/mulligan';
import { MULLIGAN } from './mulligan';

const AETHERIZE = 'Aetherize';

/** The engine's ranks of a black and a blue source for a generic cost (RANK.N in game-core.ts): black is tapped first. */
const RANK_OF_BLACK_FOR_GENERIC = 3;
const RANK_OF_BLUE_FOR_GENERIC = 4;

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
    return { ...state.mana.manaWithAllLandsTapped() };
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
  }
  override addLandToKillSearchState(state: KillSearchState): void {
    state.mana.addLand({
      kind: 'A',
      isIsland: false,
      isSwamp: false,
      isLand: true,
    });
  }

  // ---------------------------------------------------------------- the engine's cards, through Gale's opponents
  /** Syr Konrad's damage goes through the kill search's opponents (The Mindskinner turns it into mill). */
  override dealDamageToEachOpponent(amount: number): void {
    this.applyOpponentEvents([OPPONENT_EVENT.KONRAD, -1, amount]);
  }
  /** A goldfish opponent's hand: config opp_hand_size. */
  override goldfishOpponentHandSize(): number {
    return this.config.opp_hand_size as number;
  }
  /** Windfall: the opponents' discards go to their graveyards (Konrad, Gray Merchant's copies count them). */
  override opponentsWheelTheirHands(ourHandSize: number): number {
    const opponentHandSize = this.goldfishOpponentHandSize();
    if (this.inArena()) {
      const events: number[] = [];
      for (let i = 0; i < this.life.length; i++)
        events.push(OPPONENT_EVENT.PUTGY, i, opponentHandSize);
      this.applyOpponentEvents(events);
      return super.opponentsWheelTheirHands(ourHandSize);
    }
    // the goldfish opponents discard their hands and draw as many as the biggest hand, as the kill search counts it
    const cardsDrawn = Math.max(ourHandSize, opponentHandSize);
    this.applyOpponentStep(['windfall', opponentHandSize, cardsDrawn]);
    return cardsDrawn;
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
        if (target.isSorcery) this.nextSorceryHasFlash = false; // Quicken's flash is for one sorcery
        this.say('  Gale recasts', target);
        this.spellsCast += 1;
        this.onCastInstantOrSorcery(true);
        this.podAnnounceCast(target);
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
    if (this.turn > 0) this.recordEndOfTurnMeasures();
    super.startTurn();
    this.guildmageActivations = 0;
    this.emetSelchUsed = false;
    this.konradActivations = 0;
  }
  override resolve(
    card: CardDef,
    fromGraveyard = false,
    mode: string | null = null,
  ): void {
    // Gale's own Unearth, not the engine's: it picks by the kill line's roles and triggers Syr Konrad
    if (isUnearthLike(card.name)) resolveUnearth(this, card.name);
    else super.resolve(card, fromGraveyard, mode);
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
    this.takeOpponentsFrom(state);
  }

  /** A kill line's step that touches the opponents, by the kill search's rules (KillSearchState.applyOpponentStep). */
  applyOpponentStep(step: Op): void {
    const state = buildKillSearchState(this);
    state.applyOpponentStep(step);
    this.takeOpponentsFrom(state);
  }

  /** A kill line's mill, drain or poison spell resolves: what it does to the opponents, by the kill search's rules. */
  applyKillSpellToOpponents(name: string, variant: string): void {
    const state = buildKillSearchState(this);
    state.resolveSpell(name, variant);
    this.takeOpponentsFrom(state);
  }

  private takeOpponentsFrom(state: KillSearchState): void {
    this.life = state.opponentLife;
    this.opponentLibrarySizes = state.opponentLibrary;
    this.opponentGraveyardSizes = state.opponentGraveyard;
    this.opponentCreatureAccumulator = state.opponentCreatureAccumulator;
    this.poison = state.opponentPoison;
  }

  // ---------------------------------------------------------------- kill lines played for real (kill-play.ts)
  override playsKillLines(): boolean {
    return true;
  }
  override playKillStep(step: KillStep): string | null {
    return playGaleKillStep(this, step as GaleKillStep);
  }
  /** A kill line that fails is tried again with other tapping orders: Islands / Swamps kept for a High Tide / Muck
   *  or not (orders 0 and 2 keep them), and black or blue lands first for generic costs (orders 2 and 3: blue). */
  override killLineTappingOrders(): number {
    return 4;
  }
  override rankAdjust(short: string, kind: string, rank: number): number {
    if (!this.isPlayingKillLine || this.killLineTappingOrder < 2) return rank;
    if (short === 'N' && kind === 'U') return RANK_OF_BLACK_FOR_GENERIC;
    if (short === 'N' && kind === 'B') return RANK_OF_BLUE_FOR_GENERIC;
    return rank;
  }
  /** While a kill line with a High Tide (Bubbling Muck) still to resolve is played, Islands (Swamps) are tapped last:
   *  the search counts on them getting the bonus. */
  override avoidsSource(permanent: Permanent): boolean {
    if (
      !this.isPlayingKillLine ||
      this.killLineTappingOrder % 2 === 1 ||
      permanent.land === null
    )
      return false;
    const needs = this.cardsTheKillLineNeeds;
    return (
      (this.highTidesThisTurn === 0 &&
        needs.has('High Tide') &&
        this.islandTyped(permanent)) ||
      (this.muck === 0 &&
        needs.has('Bubbling Muck') &&
        this.swampTyped(permanent))
    );
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
    if (name === AETHERIZE && this.isPodGame()) return 58;
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

  override giftsUngivenPile(): {
    searched: CardDef[];
    toGraveyard: CardDef[];
  } {
    return chooseGiftsUngivenPile(this);
  }

  override instantOrSorceryDevValue(
    card: CardDef,
    fromGraveyard = false,
  ): number {
    const name = card.name;
    if (
      COMBO_SORC.has(name) ||
      Facts.COUNTERS.has(name) ||
      Facts.RITUALS.has(name) ||
      name === QUICKEN ||
      name === BORNE_UPON_A_WIND // kept to give a sorcery flash (instant-speed.ts)
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
    if (isUnearthLike(name))
      return this.graveyard.some(
        (candidate) =>
          candidate.isCreature &&
          candidate.manaValue <= unearthMaxManaValue(name) &&
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
  override opponentsEndStepCandidates(): Candidate[] {
    return buildOpponentsEndStepCandidates(this);
  }

  /** Mana kept untapped on our turn: in a pod by the pod's rule; in a goldfish game with hold_counter on, the
   *  cheapest counterspell's once Gale is out (a kill is still taken: develop looks for it first). */
  override podReserve(): number {
    if (this.inArena()) {
      const aetherize = this.hand.find((card) => card.name === AETHERIZE);
      return aetherize && this.isInDanger()
        ? Math.max(super.podReserve(), this.answerCost(aetherize).manaValue)
        : super.podReserve();
    }
    if (!this.config.hold_counter || !this.isOnBattlefield(GALE)) return 0;
    // Bender's Waterskin untaps in each other player's untap step: it pays for one mana of the counterspell even
    // when we tapped it on our own turn (Pontus)
    const waterskinMana = this.isOnBattlefield("Bender's Waterskin") ? 1 : 0;
    return Math.max(0, this.cheapestAnswerManaValue() - waterskinMana);
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
    const pool = state.mana.manaWithAllLandsTapped();
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
    const miss = this.fewestMissingPackagePieces(
      state.hasGale || this.command.length > 0,
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

  /** How many pieces the closest combo package still lacks (hand and battlefield; the graveyard's instants and sorceries
   *  too when Gale can recast them). */
  fewestMissingPackagePieces(countsGraveyard: boolean): number {
    const have = new Set([
      ...this.hand.map((card) => card.name),
      ...this.battlefield.map((permanent) => permanent.card.name),
    ]);
    if (countsGraveyard)
      for (const candidate of this.graveyard)
        if (candidate.isInstantOrSorcery) have.add(candidate.name);
    return Math.min(
      ...PACKAGES.map(
        (pkg) =>
          pkg.filter((req) => ![...req].some((name) => have.has(name))).length,
      ),
    );
  }

  // ---------------------------------------------------------------- measures for --diag (they change nothing in the game)
  galeOutTurn: number | null = null; // the first turn that ended with Gale on the battlefield
  packageReadyTurn: number | null = null; // the first turn that ended with a whole combo package at hand
  untappedManaSourcesByTurn: number[] = []; // lands and rocks left untapped at the end of each turn (instant-speed mana)
  missingAtTurn6: number | null = null; // no kill by the end of turn 6: 1 no Gale, 2 Gale but a package piece missing, 3 both there

  private recordEndOfTurnMeasures(): void {
    const hasGale = this.isOnBattlefield(GALE);
    const isPackageReady =
      this.fewestMissingPackagePieces(hasGale || this.command.length > 0) === 0;
    if (hasGale && this.galeOutTurn === null) this.galeOutTurn = this.turn;
    if (isPackageReady && this.packageReadyTurn === null)
      this.packageReadyTurn = this.turn;
    this.untappedManaSourcesByTurn[this.turn] = this.battlefield.filter(
      (permanent) =>
        !permanent.tapped && this.manaSourceKind(permanent) !== null,
    ).length;
    if (this.turn === 6 && this.unprotectedKillTurn === null)
      this.missingAtTurn6 = !hasGale ? 1 : !isPackageReady ? 2 : 3;
  }

  override diag(): Record<string, number | null> {
    // the game stops on the turn it wins, before that turn's end is recorded
    if (this.turn > 0) this.recordEndOfTurnMeasures();
    const untappedOnTurn = (turn: number) =>
      this.untappedManaSourcesByTurn[turn] ?? null;
    return {
      galeOut: this.galeOutTurn,
      packageReady: this.packageReadyTurn,
      untapped3: untappedOnTurn(3),
      untapped4: untappedOnTurn(4),
      untapped5: untappedOnTurn(5),
      untapped6: untappedOnTurn(6),
      missingAtTurn6: this.missingAtTurn6,
      opponentsEndStepCasts: this.opponentsEndStepCasts,
    };
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
    // Gale's other creatures never attack (Pontus, 2026-11-18): they stay home as blockers. Creatures that must attack
    // (goad, Thantis) are sent by the engine after combat (attackWithForcedCreatures).
  }

  // ---------------------------------------------------------------- the pod: staying alive (Pontus, 2026-11-18)
  /** In a pod: would the biggest opposing board leave us at chump_life or less next turn, with our creatures
   *  blocking? Then Gale counters threats and keeps mana for Aetherize. */
  isInDanger(): boolean {
    return (
      this.isPodGame() &&
      this.myLife - this.biggestAttackNextTurn() <=
        ((this.config.chump_life as number) ?? 10)
    );
  }
  /** While in danger, an opponent's creature spell or big spell is worth a counterspell too. */
  override podWantsToCounter(
    spell: CardDef,
    weight: number,
    casterIsBiggestThreat: boolean,
    counterspellsHeld: number,
    settings: { counterAtWeight: number; counterAnyWeight: number },
  ): boolean {
    if (
      super.podWantsToCounter(
        spell,
        weight,
        casterIsBiggestThreat,
        counterspellsHeld,
        settings,
      )
    )
      return true;
    return (
      this.isInDanger() &&
      (spell.isCreature || weight >= settings.counterAtWeight)
    );
  }
}
