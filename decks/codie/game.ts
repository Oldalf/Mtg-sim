/**
 * The "Codie" deck's AI (Codie, Vociferous Codex: five-colour spells combo, bracket 4): the rules of its cards,
 * what it does each turn, and the kill / loop solver (see PLAN.md).
 *
 * Files:
 *   cards.ts           the card names and the facts about them (values, land fetchers, backup spells)
 *   game.ts            this file: CodieGame, its state, hooks and turn steps
 *   candidates.ts      what the AI may do while it develops its mana and finds pieces
 *   spells.ts          what the spells do when they resolve, land fetching and tutoring
 *   solver.ts          the kill search: tries moves on copies of the game until a finisher kills
 *   solver-actions.ts  the moves of the solver (rituals, tutors, Reiterate loops, Flashback, Vault, Ad Nauseam)
 *   finishers.ts       the kill itself: the cheapest X spell with copies, and whether a counterspell backs it up
 *
 * Win: all three opponents dead (40 life each) with an X spell: Exsanguinate, Crackle with Power or Torment of
 * Hailfire, possibly copied (Reiterate, Return the Favor). The AI develops its mana and finds pieces; the solver
 * (findKillLine()) looks for a line that kills this turn from the current hand, board and mana, and counts the win
 * with backup when a counterspell / protection spell is still castable afterwards.
 * Loops: Reiterate (buyback) on a spell that makes more than it costs to copy (Jeska's Will, Mana Geyser,
 * Brass's Bounty) is not played out: the solver recognises it and adds a big pile of that mana ("bottomless").
 * Codie cannot cast permanent spells; it taps for five mana for four and its free-spell trigger is not modelled.
 */
import {
  AD_NAUSEAM,
  BACKUP,
  BRASS_BOUNTY,
  CODIE,
  DEMONIC_TUTOR,
  EXSANGUINATE,
  FINISHERS,
  MANA_GEYSER,
  HOLD,
  MANA_SPELLS,
  REITERATE,
  TEFERIS_PROTECTION,
  TORMENT_OF_HAILFIRE,
  TREASURE,
  VALUE,
  JESKAS_WILL,
} from './cards';
import { buildCandidates } from './candidates';
import {
  chooseTutorTarget,
  fetchCardFromLibrary,
  resolveCodieSpell,
} from './spells';
import { findKillLine } from './solver';
import { beginReiterateLoop, manaPerLoopCopy } from './solver-actions';
import { CardDef, Cost } from '../../engine/cards';
import { Cand, KillSearcher, Perm } from '../../engine/game-types';
import { Game } from '../../engine/game';
import { removeIfPresent } from '../../engine/lists';
import { MulliganRule } from '../../engine/mulligan';
import { MULLIGAN } from './mulligan';

export class CodieGame extends Game<CodieGame> {
  override mulliganRule(): MulliganRule | null {
    return this.cfg.smart_mulligan ? MULLIGAN : null;
  }
  override colors = ['W', 'U', 'B', 'R', 'G'];
  commanderCasts = 0;
  loopUsed: string | null = null; // the loop the solver used on the way to the kill
  winLine: string[] = []; // the kill line (for the trace)
  lines = 0; // solver calls (for the stats)
  digAll = false; // a Jeska's Will loop with Codie out: every copy also exiles three cards we may play, so the whole library is within reach
  suspended: number[] = []; // Profane Tutor suspended: turns left
  knownTop = 0; // cards on top of the library the player knows (a tutor to the top, Lim-Dul's Vault): a draw spell may then be used in the kill search
  libraryInHand = false; // Ad Nauseam + Teferi's Protection drew the library
  nextTurn = false; // this copy is the next turn of a solver line
  nextTurnKillFound = false; // the kill the solver found is on the next turn
  codieArmed = 0; // Codie activations whose free-spell trigger is waiting for the next spell this turn
  seenBy7 = new Set<string>(); // cards that were in hand at some point up to turn 7 (for --diag)
  mana7 = 0;
  lands7 = 0;

  override clone(): this {
    const copy = super.clone();
    copy.suspended = this.suspended.slice();
    return copy;
  }
  /** Suspended Profane Tutor arrives: a free tutor. Mana Drain (flat option): 2 to 5 colourless from an opponent's spell. */
  override upkeep(): void {
    if (this.suspended.length) {
      this.suspended = this.suspended.map((turnsLeft) => turnsLeft - 1);
      const due = this.suspended.filter((turnsLeft) => turnsLeft <= 0).length;
      this.suspended = this.suspended.filter((turnsLeft) => turnsLeft > 0);
      for (let i = 0; i < due; i++) {
        this.say('Profane Tutor arrives');
        fetchCardFromLibrary(this, chooseTutorTarget(this), false);
      }
    }
    if (this.cfg.mana_drain_flat && this.turn >= 2) {
      const card = this.cardInHand('Mana Drain');
      if (card) {
        removeIfPresent(this.hand, card);
        this.gy.push(card);
        this.pool.C += 2 + Math.floor(this.rng.random() * 4);
      }
    }
  }
  override startTurn(): void {
    super.startTurn();
    const decayPerTurn = this.cfg.opp_decay as number;
    if (decayPerTurn > 0)
      for (let i = 0; i < this.life.length; i++)
        this.life[i] = Math.min(
          this.life[i],
          Math.max(
            10,
            (this.cfg.opp_life as number) - decayPerTurn * (this.turn - 1),
          ),
        );
  }
  /** Torment of Hailfire: how many times each opponent pays (sacrifice / discard) before losing life. */
  tormentPayments(): number {
    return this.cfg.opp_payments_decay
      ? Math.max(1, 7 - (this.turn - 1))
      : (this.cfg.opp_payments as number);
  }
  override diag(): Record<string, number | null> {
    const had = (names: string[]) =>
      names.some((name) => this.seenBy7.has(name)) ? 1 : 0;
    return {
      loop: this.loopUsed ? 1 : 0,
      died: this.died ? 1 : 0,
      reit7: had([REITERATE]),
      loopPiece7: had([JESKAS_WILL, MANA_GEYSER, BRASS_BOUNTY]),
      fin7: had(FINISHERS),
      tutor7: had([DEMONIC_TUTOR, 'Vampiric Tutor', 'Personal Tutor']),
      mana7: this.mana7,
      lands7: this.lands7,
      all3:
        had([REITERATE]) &&
        had([JESKAS_WILL, MANA_GEYSER, BRASS_BOUNTY]) &&
        had(FINISHERS)
          ? 1
          : 0,
    };
  }

  // ================================================================ rules of the cards
  opponentHandSize(): number {
    return this.cfg.opp_hand as number;
  }
  opponentTappedLands(): number {
    const fixed = this.cfg.opp_tapped_lands as number;
    return fixed > 0
      ? fixed
      : Math.round((this.cfg.opp_tapped_per_turn as number) * this.turn);
  }
  inHand(name: string): boolean {
    return this.hand.some((card) => card.name === name);
  }
  cardInHand(name: string): CardDef | undefined {
    return this.hand.find((card) => card.name === name);
  }
  override commanderCost(_cd: CardDef, cost: Cost): Cost {
    return cost.withGeneric(cost.g + 2 * this.commanderCasts);
  }
  override onCommanderCast(_cd: CardDef): void {
    this.commanderCasts += 1;
  }
  /** Generic costs: tap colourless, then green and white lands first; keep red (Reiterate), black (the finishers) and blue (counters). */
  override rankAdjust(short: string, kind: string, rank: number): number {
    if (short !== 'N') return rank;
    const order: Record<string, number> = {
      C: 2,
      G: 3,
      W: 3.2,
      U: 3.4,
      R: 4.2,
      B: 4.4,
    };
    const base = order[kind];
    if (base === undefined) return rank;
    if (!this.keepColours().has(kind)) return base;
    // a colour we still need: tap the one we have the most sources of first (keep the single Plains, spend the Mountains)
    const sourceCount = this.bf.filter(
      (permanent) =>
        !permanent.tapped &&
        permanent.land !== null &&
        this.srcKind(permanent) === kind,
    ).length;
    return 6 + 1 / Math.max(1, sourceCount);
  }
  /** Colours the cards in hand still need (so generic costs are paid with the other colours). */
  keepColours(): Set<string> {
    const colours = new Set<string>(['R']);
    for (const card of this.hand) {
      const name = card.name;
      if (
        name === EXSANGUINATE ||
        name === TORMENT_OF_HAILFIRE ||
        name === DEMONIC_TUTOR ||
        name === 'Vampiric Tutor' ||
        name === 'Dark Ritual' ||
        name === AD_NAUSEAM
      )
        colours.add('B');
      if (name === AD_NAUSEAM) colours.add('W'); // Ad Nauseam comes with Teferi's Protection ({2}{W})
      const backup = BACKUP[name];
      if (backup)
        for (const col of backup[0].match(/[WUBRG]/g) ?? []) colours.add(col);
      if (name === TEFERIS_PROTECTION) colours.add('W');
    }
    return colours;
  }
  override srcKind(permanent: Perm, ignoreSick = false): string | null {
    if (permanent.cd === TREASURE) return 'A';
    return super.srcKind(permanent, ignoreSick);
  }
  /** A Treasure that was tapped for mana is gone (done outside pay(): the engine pays speculatively). */
  purgeTreasures(): void {
    for (const permanent of this.bf.slice())
      if (permanent.cd === TREASURE && permanent.tapped)
        this.bf.splice(this.bf.indexOf(permanent), 1);
  }
  override ritualCandidates(_cands: Cand[]): Cand[] {
    return [];
  }

  // ================================================================ spells
  override resolve(
    card: CardDef,
    fromGy = false,
    mode: string | null = null,
  ): void {
    if (!resolveCodieSpell(this, card)) super.resolve(card, fromGy, mode);
  }
  isStillAlive(): boolean {
    return !this.died;
  }
  override castPerm(card: CardDef, fromCommand = false): boolean {
    if (!fromCommand && card.name !== CODIE) return false; // Codie: no permanent spells (the Spirit Guides are only ever exiled)
    return super.castPerm(card, fromCommand);
  }
  override loseLife(amount: number): void {
    this.myLife -= amount;
    if (this.myLife <= 0 && !this.died) {
      this.died = true;
      this.say('we die');
    }
  }

  // ================================================================ what to do
  developmentValue(card: CardDef): number {
    return VALUE[card.name] ?? 20;
  }
  override cardValue(card: CardDef): number {
    if (card.land !== null) {
      const manaAndLands = this.manaSources() + this.countLandsHand();
      return manaAndLands <= 4
        ? 90
        : manaAndLands <= 7
          ? 70
          : manaAndLands <= 10
            ? 45
            : 20;
    }
    if (card.name === REITERATE) return 95;
    if (FINISHERS.includes(card.name)) return 80;
    if ([JESKAS_WILL, MANA_GEYSER, BRASS_BOUNTY].includes(card.name)) return 75;
    if (
      MANA_SPELLS.includes(card.name) ||
      card.name === 'Silence' ||
      card.name === "Orim's Chant"
    )
      return 60;
    if (HOLD.has(card.name)) return 50;
    return this.developmentValue(card);
  }
  /** Ad Nauseam is an instant: the AI casts it at the end of the turn (really the opponents' end step) with the mana it did not use,
   *  while life is high and the library big. No hand-size discard follows, so the whole pile is ours next turn. */
  override endTurn(): void {
    super.endTurn();
    const card = this.cardInHand(AD_NAUSEAM);
    if (
      card &&
      this.cfg.ad_end_step &&
      this.myLife >= 33 &&
      this.library.length > 30 &&
      this.canPay(this.effCost(card), true)
    )
      this.castIS(card);
  }
  override playLand(): void {
    // Glacial Chasm and Maze of Ith are never played (no mana, and Chasm sacrifices a land)
    const parked = this.hand.filter(
      (card) => card.name === 'Glacial Chasm' || card.name === 'Maze of Ith',
    );
    for (const parkedLand of parked) removeIfPresent(this.hand, parkedLand);
    super.playLand();
    this.hand.push(...parked);
  }
  override landBias(card: CardDef): number {
    if (card.name === 'Vesuva') return -2;
    if (card.name === 'Volatile Fault') return -3;
    return 0;
  }
  candidates(_main2: boolean): Cand[] {
    return buildCandidates(this, _main2);
  }

  // ================================================================ the planner's score
  override positionValue(): number {
    if (this.died) return -5000;
    this.purgeTreasures();
    let value = 0;
    value += 22 * Math.min(14, this.manaSources());
    value +=
      0.5 * this.hand.reduce((total, card) => total + this.cardValue(card), 0);
    if (this.onBf(CODIE)) value += 40;
    if (this.inHand(REITERATE)) value += 30;
    for (const name of [JESKAS_WILL, MANA_GEYSER, BRASS_BOUNTY])
      if (this.inHand(name)) value += 15;
    if (FINISHERS.some((name) => this.inHand(name))) value += 20;
    value += 3 * this.landsBf().filter((permanent) => !permanent.tapped).length;
    return value;
  }

  // ================================================================ the kill solver
  override checkKill(): number {
    if (this.turn <= 7) {
      for (const card of this.hand) this.seenBy7.add(card.name);
      if (this.turn === 7) {
        this.mana7 = this.manaSources();
        this.lands7 = this.landsBf().length;
      }
    }
    if (this.died) return 2;
    const was = this.unprot;
    const result = super.checkKill();
    if (was === null && this.unprot !== null && this.nextTurnKillFound) {
      this.unprot = this.turn + 1;
      if (this.prot !== null) this.prot = this.turn + 1;
    }
    return result;
  }
  override play(): [number | null, number | null] {
    const [anyKillTurn, protectedKillTurn] = super.play();
    return [
      this.died ? null : anyKillTurn,
      this.died ? null : protectedKillTurn,
    ];
  }
  light(): CodieGame {
    const copy = this.clone();
    copy.verbose = false;
    copy.inRollout = true;
    copy.log = [];
    return copy;
  }
  lightKey(): string {
    const hand = this.hand
      .map((card) => card.name)
      .sort()
      .join(',');
    const open = this.bf.filter(
      (permanent) => !permanent.tapped && this.srcKind(permanent),
    ).length;
    return `${hand}|${open}|${this.landsBf().length}|${JSON.stringify(this.pool)}|${this.bf.filter((permanent) => permanent.cd === TREASURE).length}`;
  }
  /** A kill is conceivable at all: a finisher, a tutor or Ad Nauseam is in hand. */
  override killReachable(_st: CodieGame): boolean {
    const hasCard = (name: string) => this.inHand(name);
    return (
      FINISHERS.some(hasCard) ||
      hasCard(DEMONIC_TUTOR) ||
      hasCard(AD_NAUSEAM) ||
      hasCard('Vampiric Tutor') ||
      hasCard('Personal Tutor') ||
      hasCard('Bring to Light')
    );
  }
  killSearch(): KillSearcher<CodieGame> {
    const killSearcher: KillSearcher<CodieGame> = {
      lastLine: null,
      lastP: null,
      bestMiss: null,
      minChance: 1,
      search: (game: CodieGame) => {
        this.lines += 1;
        const line = findKillLine(game);
        if (!line) return 0;
        killSearcher.lastLine = line.steps;
        this.winLine = line.steps;
        this.nextTurnKillFound = !!line.nextTurn;
        if (line.steps.some((step) => step.startsWith('loop')))
          this.loopUsed = 'loop';
        return line.backup ? 2 : 1;
      },
    };
    return killSearcher;
  }
  searchedStates = new Set<string>();
  searchedNodeCount = 0;
  searchNodeLimit = 0;
  /** Mana we could pay right now (the pool and every untapped source). */
  availMana(): number {
    let mana =
      this.pool.U +
      this.pool.B +
      this.pool.C +
      this.pool.W +
      this.pool.R +
      this.pool.G;
    for (const permanent of this.bf) {
      if (permanent.tapped) continue;
      if (this.srcKind(permanent)) mana += 1;
    }
    return mana;
  }
  /** Codie's trigger: when we next cast a spell, exile cards from the top until an instant or sorcery with lesser mana value, cast it
   *  free; the other cards go to the bottom in a random order. The effects are the AI's own (rituals add mana, tutors fetch, ...). */
  override castTriggers(
    card: CardDef,
    _fromGy: boolean,
    _trig: Record<string, unknown>,
  ): void {
    while (this.codieArmed > 0) {
      this.codieArmed -= 1;
      const skipped: CardDef[] = [];
      let found: CardDef | null = null;
      while (this.library.length) {
        const exiledCard = this.library.shift()!;
        if (exiledCard.isIS && exiledCard.mv < card.mv) {
          found = exiledCard;
          break;
        }
        skipped.push(exiledCard);
      }
      this.rng.shuffle(skipped);
      this.library.push(...skipped);
      if (found) {
        this.say('Codie: free', found);
        const first = Cost.parse('{1}{R}{R}').plus(new Cost(3));
        if (
          [JESKAS_WILL, MANA_GEYSER, BRASS_BOUNTY].includes(found.name) &&
          this.inHand(REITERATE) &&
          manaPerLoopCopy(this, found.name)[0] >= 7 &&
          this.canPay(first, true)
        ) {
          this.say(
            `LOOP: free ${found.name} + Reiterate (buyback) -> bottomless`,
          );
          this.loopUsed = found.name;
          beginReiterateLoop(this, found.name, found, false, first);
          this.gy = this.gy.filter((candidate) => candidate !== found);
          this.gy.push(found);
          continue;
        }
        this.resolve(found);
        this.gy.push(found);
      }
    }
  }
}
