/**
 * The "Mike" deck's AI (Vnwxt, Verbose Host: mono-blue card draw, bracket 2-3): the rules of its cards,
 * what it wants to do each turn, and the rules agreed for this deck (see PLAN.md).
 *
 * Files:
 *   cards.ts       the card names and the facts about them (values, the marks on permanents, tokens)
 *   game.ts        this file: MikeGame, its state, win checks, drawing, speed, combat and spells
 *   candidates.ts  everything the AI may do now, with a score each (cards in hand and abilities)
 *   actions.ts     what some abilities do when the AI picks them
 *
 * Wins (any of them ends the game):
 *   - mill: draw from an empty library with Laboratory Maniac or Jace, Wielder of Mysteries on the battlefield;
 *   - Twenty-Toed Toad attacks with twenty or more cards in hand (or twenty counters);
 *   - all three opponents at 0 life (40 each): Psychosis Crawler pings per draw, combat, Krakens, Hand of Vecna...
 * Second measure: first opponent dead.
 * Drawing: Vnwxt at max speed and Teferi's Ageless Insight double draws; every card drawn feeds the payoffs
 * (Crawler, Ominous Seas, Skymage, Oneirophage, Messenger, Mystic, Krang...). Drawing from an empty library
 * follows the replacement effects: win (Maniac / Jace), Ormos counters, Living Conundrum skips, else we lose.
 * The AI only draws its last cards when it is safe (a win piece or Conundrum / Ormos on the battlefield).
 * Combat: flyers and unblockable creatures connect, half the ground attackers are blocked (engine rules).
 * The game itself (mana, zones, casting, turns) is the shared engine in engine/game-core.ts.
 */
import * as C from '../../engine/cards';
import {
  AMONKHET_RACEWAY,
  AQUEOUS_FORM,
  AVISHKAR_RACEWAY,
  ROIL_CARTOGRAPHER,
  LIVING_CONUNDRUM,
  COUNTERSPELLS,
  PSYCHOSIS_CRAWLER,
  WATER_CRYSTAL,
  FBLTHP,
  FOLIO_OF_FANCIES,
  HOLD,
  DRAW_SPELLS_WORTH_COPYING,
  SLICK_IMITATOR,
  JACE,
  LOOTER_IL_KOR,
  KRANG,
  LABORATORY_MANIAC,
  EMRAKULS_MESSENGER,
  MURAGANDA_RACEWAY,
  MISCHIEVOUS_MYSTIC,
  MARK_AQUEOUS_FORM,
  MARK_ATOMIC_MICROSIZER,
  MARK_NERD_RAGE,
  MARK_UNBLOCKABLE_THIS_TURN,
  MARK_HAND_OF_VECNA,
  NERD_RAGE,
  ONEIROPHAGE,
  ORMOS_ARCHIVE_KEEPER,
  MYSTIC_SANCTUARY,
  OMINOUS_SEAS,
  AURORA_SHIFTER,
  SHORELINE_LOOTER,
  CLINQUANT_SKYMAGE,
  TEFERIS_AGELESS_INSIGHT,
  TWENTY_TOED_TOAD,
  TOK,
  UNBLOCKABLE,
  VALUE,
  HAND_OF_VECNA,
  VNWXT,
  WIZARD_CLASS,
} from './cards';
import { buildCandidates } from './candidates';
import { CardDef, Cost } from '../../engine/cards';
import {
  Candidate,
  Evasion,
  Permanent,
  WinAttempt,
  Zone,
} from '../../engine/game-types';
import { GameWithoutKillSearch } from '../../engine/game';
import { firstMax, firstMin } from '../../engine/lists';
import { MulliganRule } from '../../engine/mulligan';
import { MULLIGAN } from './mulligan';

export class MikeGame extends GameWithoutKillSearch {
  override mulliganRule(): MulliganRule | null {
    return this.config.smart_mulligan ? MULLIGAN : null;
  }
  override colors = ['U'];

  speed = 0; // 0 = no speed yet, 1-4
  speedUpTurn = false; // speed already rose this turn
  opponentLostLifeThisTurn = false; // an opponent lost life this turn
  drawsThisTurn = 0; // cards drawn this turn
  drawStepOpen = false; // the first draw of the draw step hasn't happened yet
  energyCounters = 0; // energy counters
  inCombat = false;
  vecnaX = 0; // Hand of Vecna's X, set at the beginning of combat
  nerdRageAttackedThisTurn = false; // an attack with Nerd Rage's creature this turn
  shifterCopy: CardDef | null = null; // what Aurora Shifter became a copy of
  milled = false; // won by drawing from an empty library
  toadWon = false;
  winHow: string | null = null;
  emptiedTurn: number | null = null; // the turn our library first hit zero
  emptiedSafe = false; // ...with a win piece, Conundrum or Ormos out
  drakeCopies = 0; // Thunderclap Drake: copies of the next instant or sorcery this turn
  crawlerDrain = 0; // life drained by Psychosis Crawler triggers
  commanderCasts = 0;
  // ---- measures for --diag (they change nothing in the game)
  vnwxtOut: number | null = null;
  maxSpeedTurn: number | null = null;
  handEnd: number[] = [];
  libEnd: number[] = [];
  drawsByTurn: number[] = [];
  castsByTurn: number[] = [];

  override clone(): this {
    const copy = super.clone();
    copy.handEnd = this.handEnd.slice();
    copy.libEnd = this.libEnd.slice();
    copy.drawsByTurn = this.drawsByTurn.slice();
    copy.castsByTurn = this.castsByTurn.slice();
    return copy;
  }

  // ================================================================ helpers
  /** Permanents with this name, counting Aurora Shifter if it is a copy of it. */
  countOnBattlefield(name: string): number {
    let count = 0;
    for (const permanent of this.battlefield) {
      if (permanent.card.name === name) count++;
      else if (
        permanent.card.name === AURORA_SHIFTER &&
        this.shifterCopy?.name === name
      )
        count++;
    }
    return count;
  }
  drawTriggerMultiplier(): number {
    return this.countOnBattlefield(KRANG) > 0 ? 2 : 1;
  }
  hasNoMaximumHandSize(): boolean {
    return (
      this.isOnBattlefield(VNWXT) ||
      this.isOnBattlefield('Thought Vessel') ||
      this.isOnBattlefield('Reliquary Tower') ||
      this.isOnBattlefield(WIZARD_CLASS) ||
      this.isOnBattlefield('Body of Knowledge') ||
      this.isOnBattlefield(FOLIO_OF_FANCIES)
    );
  }
  /** Effective card of a permanent (Aurora Shifter may be a copy of something). */
  effectiveCard(permanent: Permanent): CardDef {
    return permanent.card.name === AURORA_SHIFTER && this.shifterCopy
      ? this.shifterCopy
      : permanent.card;
  }

  // ================================================================ the win conditions
  override areOpponentsBeaten(): boolean {
    return this.milled || this.toadWon || super.areOpponentsBeaten();
  }
  toadReady(): boolean {
    return this.battlefield.some(
      (permanent) =>
        permanent.card.name === TWENTY_TOED_TOAD &&
        !permanent.sick &&
        !permanent.tapped &&
        (this.hand.length >= 20 || permanent.counters >= 20),
    );
  }
  /** Our counterspells: Negate, Refute, Spell Pierce, Spell Syphon and Aether Spike (the engine only knows a few). */
  override hasCounterInHand(): boolean {
    return this.hand.some((card) => COUNTERSPELLS.has(card.name));
  }
  /** A pod: a mill win needs Laboratory Maniac or Jace on the battlefield, the Toad win needs the Toad: removing it in
   *  response stops the win. A counterspell with two mana open answers one removal spell (Siren Stormtamer: Game.podShield). */
  override winAttempt(): WinAttempt | null {
    const perms =
      this.winHow === 'mill'
        ? [LABORATORY_MANIAC, JACE].filter((name) => this.isOnBattlefield(name))
        : this.winHow === 'Toad'
          ? [TWENTY_TOED_TOAD]
          : [];
    if (!perms.length) return null;
    const backup = this.hasCounterInHand() && this.availMana() >= 2 ? 1 : 0;
    return { spells: [], perms, backup };
  }
  /** A pod: the win was stopped (the Maniac / Jace / Toad removed in response). A mill win: the draw from the empty
   *  library still happens, now without the win piece (Living Conundrum or Ormos may save us). */
  override podWinStopped(): void {
    super.podWinStopped();
    const mill = this.milled;
    this.milled = this.toadWon = false;
    this.winHow = null;
    if (mill && !this.library.length) this.drawOne();
  }
  /** How close to winning the others think we are: a win piece out and a small library, or a Toad near twenty. */
  override podClose(): number {
    const piece =
      this.isOnBattlefield(LABORATORY_MANIAC) || this.isOnBattlefield(JACE);
    const lib = this.library.length;
    let closeness = piece
      ? lib <= 15
        ? 1
        : lib <= 35
          ? 0.6
          : 0.3
      : lib <= 15
        ? 0.3
        : 0;
    const toad = this.findPermanent(TWENTY_TOED_TOAD);
    if (toad)
      closeness = Math.max(
        closeness,
        Math.min(1, Math.max(toad.counters, this.hand.length) / 20),
      );
    return closeness;
  }
  override checkKill(): number {
    if (this.died) return 2;
    if (!this.milled && !this.toadWon && this.toadReady()) {
      this.toadWon = true;
      this.winHow = 'Toad';
    }
    if (this.areOpponentsBeaten()) {
      if (this.winHow === null)
        this.winHow =
          this.crawlerDrain * 2 >= this.damageDealt ? 'Crawler' : 'combat';
      if (this.unprotectedKillTurn === null) {
        this.unprotectedKillTurn = this.turn;
        this.protectedKillTurn =
          this.hasCounterInHand() && this.availMana() >= 2 ? this.turn : null;
        this.say(
          `WIN (${this.winHow ?? 'damage'}): ${this.describeOpponentLife()}, hand ${this.hand.length}, library ${this.library.length}`,
        );
      }
      return 2;
    }
    return 0;
  }
  override play(): [number | null, number | null] {
    super.play();
    this.noteTurnEnd();
    return [
      this.died ? null : this.unprotectedKillTurn,
      this.firstOpponentDeadTurn,
    ];
  }
  // ---------------------------------------------------------------- log analyzer hooks
  /** Pontus keeps two trackers in Archidekt's misc zone: "Start Your Engines! // Max Speed" (its +1/+1 counters = speed) and
   *  "Energy Reserve" (its Charge counters = energy). Lore counters on Vnwxt and Hand of Vecna mean the Hand is equipped to Vnwxt. */
  override syncFromLog(board: { trackers: Record<string, number> }): void {
    this.speed = board.trackers['Start Your Engines! // Max Speed'] ?? 0;
    this.energyCounters = board.trackers['Energy Reserve'] ?? 0;
    const hand = this.findPermanent(HAND_OF_VECNA),
      permanent = this.findPermanent(VNWXT);
    if (hand && permanent && hand.counters > 0)
      permanent.marks |= MARK_HAND_OF_VECNA;
    if (hand) hand.counters = 0;
    if (permanent) permanent.counters = 0;
  }
  override logToken(name: string): CardDef | null {
    const lowerCaseName = name.toLowerCase();
    if (lowerCaseName.includes('kraken')) return TOK.kraken;
    if (lowerCaseName.includes('spawn')) return TOK.spawn;
    if (lowerCaseName.includes('faerie')) return TOK.faerie;
    // a marker named after a card (Aurora Shifter's copy of Psychosis Crawler): a token copy of that creature
    const cardData = C.cardDatabase()[name];
    return cardData && (cardData.type_line ?? '').includes('Creature')
      ? C.get(name)
      : null;
  }

  override diag(): Record<string, number | null> {
    const upTo = (lastTurn: number) =>
      this.castsByTurn
        .slice(1, lastTurn + 1)
        .reduce((total, value) => total + (value ?? 0), 0);
    const drawsUpToTurn = (lastTurn: number) =>
      this.drawsByTurn
        .slice(1, lastTurn + 1)
        .reduce((total, value) => total + (value ?? 0), 0);
    return {
      vnwxtOut: this.vnwxtOut,
      maxSpeed: this.maxSpeedTurn,
      spent5: this.spentEnd[5] ?? null,
      spent6: this.spentEnd[6] ?? null,
      hand6: this.handEnd[6] ?? null,
      hand8: this.handEnd[8] ?? null,
      draws6: drawsUpToTurn(6),
      draws8: drawsUpToTurn(8),
      casts5: upTo(5),
      lib8: this.libEnd[8] ?? null,
      died: this.died ? 1 : 0,
      emptied: this.emptiedTurn !== null ? 1 : 0,
      emptiedSafe: this.emptiedTurn !== null && this.emptiedSafe ? 1 : 0,
      backup: this.protectedKillTurn !== null ? 1 : 0,
      how:
        this.winHow === 'mill'
          ? 1
          : this.winHow === 'Toad'
            ? 2
            : this.winHow === 'Crawler'
              ? 3
              : this.winHow
                ? 4
                : null,
    };
  }
  noteTurnEnd(): void {
    this.handEnd[this.turn] = this.hand.length;
    this.libEnd[this.turn] = this.library.length;
    this.drawsByTurn[this.turn] = this.drawsThisTurn;
    this.castsByTurn[this.turn] = this.spellsCast;
  }

  // ================================================================ speed
  override damageOpponent(i: number, amount: number): number {
    const lost = super.damageOpponent(i, amount);
    if (lost > 0) this.noteOpponentLostLife();
    return lost;
  }
  noteOpponentLostLife(): void {
    this.opponentLostLifeThisTurn = true;
    if (this.speed >= 1 && this.speed < 4 && !this.speedUpTurn) {
      this.speedUpTurn = true;
      this.speed += 1;
      if (this.speed === 4 && this.maxSpeedTurn === null)
        this.maxSpeedTurn = this.turn;
    }
  }
  startEngines(): void {
    if (this.speed === 0) this.speed = 1;
  }
  /** Speed pods: opponents lose life on our turn from the table itself (config speed_free). */
  applyTableLifeLoss(): void {
    if (this.config.speed_free && !this.opponentLostLifeThisTurn)
      this.noteOpponentLostLife();
  }

  // ================================================================ drawing
  /** How many cards one "draw a card" event gives, with Vnwxt at max speed and Teferi's Ageless Insight. */
  cardsPerDrawEvent(exempt: boolean): number {
    const vnwxtAtMaxSpeed = this.speed >= 4 && this.isOnBattlefield(VNWXT);
    const hasTeferi = this.isOnBattlefield(TEFERIS_AGELESS_INSIGHT);
    if (vnwxtAtMaxSpeed)
      return (exempt ? 1 : hasTeferi ? 2 : 1) + (hasTeferi ? 2 : 1);
    return hasTeferi && !exempt ? 2 : 1;
  }
  override draw(count = 1): void {
    for (let i = 0; i < count && !this.milled && !this.died; i++) {
      const exempt = this.drawStepOpen;
      this.drawStepOpen = false;
      const drawsPerEvent = this.cardsPerDrawEvent(exempt);
      for (
        let drawNumber = 0;
        drawNumber < drawsPerEvent && !this.milled && !this.died;
        drawNumber++
      )
        this.drawOne();
    }
  }
  /** One card actually drawn (or the empty-library replacement). */
  drawOne(): void {
    if (!this.library.length) {
      if (
        this.countOnBattlefield(LABORATORY_MANIAC) > 0 ||
        this.isOnBattlefield(JACE)
      ) {
        this.milled = true;
        this.winHow = 'mill';
        this.say('draw from an empty library: WIN');
      } else if (this.countOnBattlefield(ORMOS_ARCHIVE_KEEPER) > 0) {
        const permanent = this.battlefield.find(
          (candidate) => candidate.card.name === ORMOS_ARCHIVE_KEEPER,
        )!;
        permanent.counters += 5;
      } else if (this.isOnBattlefield(LIVING_CONUNDRUM)) {
        // the draw is skipped
      } else {
        this.died = true;
        this.say('draw from an empty library: we lose');
      }
      return;
    }
    this.firstDrawDone = true;
    this.putCard(this.takeTopCardsOfLibrary(1)[0], 'hand');
    if (!this.library.length && this.emptiedTurn === null) {
      this.emptiedTurn = this.turn;
      this.emptiedSafe = this.isSafeToEmptyLibrary();
    }
    this.drawsThisTurn += 1;
    this.drawTriggers();
  }
  drawTriggers(): void {
    const triggerCount = this.drawTriggerMultiplier();
    const second = this.drawsThisTurn === 2;
    for (let triggerNumber = 0; triggerNumber < triggerCount; triggerNumber++) {
      const crawlers = this.countOnBattlefield(PSYCHOSIS_CRAWLER);
      if (crawlers) this.crawlerDrain += this.drainEach(crawlers);
      for (const permanent of this.battlefield) {
        const name = this.effectiveCard(permanent).name;
        if (name === CLINQUANT_SKYMAGE || name === ONEIROPHAGE)
          permanent.counters += 1;
      }
      const seas = this.findPermanent(OMINOUS_SEAS);
      if (seas) {
        seas.counters += 1;
        while (seas.counters >= 8) {
          seas.counters -= 8;
          this.createTokens(TOK.kraken, 1);
          this.say('Ominous Seas: an 8/8 Kraken');
        }
      }
      if (this.findPermanent(WIZARD_CLASS)?.counters === 3) {
        const counterRecipient = this.counterTarget();
        if (counterRecipient) counterRecipient.counters += 1;
      }
      if (second) {
        for (const battlefieldPermanent of this.battlefield.slice()) {
          const name = this.effectiveCard(battlefieldPermanent).name;
          if (name === EMRAKULS_MESSENGER) this.createTokens(TOK.spawn, 1);
          else if (name === MISCHIEVOUS_MYSTIC)
            this.createTokens(TOK.faerie, 1);
        }
      }
    }
    if (second) {
      for (const battlefieldPermanent of this.battlefield)
        if (battlefieldPermanent.card.name === KRANG)
          battlefieldPermanent.counters += triggerCount;
    }
  }
  /** The creature to put a +1/+1 counter on: an evasive attacker. */
  counterTarget(): Permanent | null {
    const permanents = this.creatures();
    if (!permanents.length) return null;
    return firstMax(
      permanents,
      (permanent) =>
        (this.evasive(permanent) ? 100 : 0) + this.power(permanent),
    );
  }
  /** Cards one effect would draw, counting the doublers (a rough count; each event is not the first of the draw step). */
  cardsDrawnBy(eventCount: number): number {
    return eventCount * this.cardsPerDrawEvent(false);
  }
  /** Cards drawn by a Windfall / Flux that discards k cards, with the Slick Imitator copy (it discards what was just drawn). */
  refillDraws(discardCount: number, flux: boolean): number {
    const first = this.cardsDrawnBy(
      flux ? discardCount + 1 : Math.max(discardCount, 7),
    );
    if (!this.imitatorReady() || this.availMana() < 1) return first;
    return first + this.cardsDrawnBy(flux ? first + 1 : first);
  }
  /** Is it safe to empty the library? A win piece, or Conundrum / Ormos, is on the battlefield. */
  isSafeToEmptyLibrary(): boolean {
    return (
      this.countOnBattlefield(LABORATORY_MANIAC) > 0 ||
      this.isOnBattlefield(JACE) ||
      this.isOnBattlefield(LIVING_CONUNDRUM) ||
      this.countOnBattlefield(ORMOS_ARCHIVE_KEEPER) > 0
    );
  }
  hasMillWinPiece(): boolean {
    return (
      this.countOnBattlefield(LABORATORY_MANIAC) > 0 ||
      this.isOnBattlefield(JACE)
    );
  }
  /** May the AI start an effect that draws k cards (events: k)? */
  mayDraw(events: number): boolean {
    if (this.isSafeToEmptyLibrary()) return true;
    return (
      this.library.length - this.cardsDrawnBy(events) >=
      (this.config.keep_library as number)
    );
  }
  /** The biggest number of draw events an effect may have (X spells). */
  maxDrawEvents(): number {
    if (this.isSafeToEmptyLibrary()) return 99;
    const per = this.cardsPerDrawEvent(false);
    return Math.max(
      0,
      Math.floor(
        (this.library.length - (this.config.keep_library as number)) / per,
      ),
    );
  }

  // ================================================================ evasion and power
  override evasive(permanent: Permanent): boolean {
    const card = this.effectiveCard(permanent);
    return (
      card.flying ||
      UNBLOCKABLE.has(card.name) ||
      (permanent.marks & (MARK_AQUEOUS_FORM | MARK_UNBLOCKABLE_THIS_TURN)) !== 0
    );
  }
  override evasion(permanent: Permanent): Evasion {
    const card = this.effectiveCard(permanent);
    if (
      UNBLOCKABLE.has(card.name) ||
      (permanent.marks & (MARK_AQUEOUS_FORM | MARK_UNBLOCKABLE_THIS_TURN)) !== 0
    )
      return 'unblockable';
    return card.flying ? 'flying' : 'none';
  }
  override powerBonus(permanent: Permanent): number {
    const card = this.effectiveCard(permanent);
    let bonus = card.power - permanent.card.power;
    if (card.name === PSYCHOSIS_CRAWLER || card.name === 'Body of Knowledge')
      bonus += this.hand.length;
    if (permanent.card.name === LIVING_CONUNDRUM && !this.library.length)
      bonus += 8;
    if (permanent.marks & MARK_HAND_OF_VECNA && this.inCombat)
      bonus += this.vecnaX;
    if (permanent.marks & MARK_NERD_RAGE && this.nerdRageAttackedThisTurn)
      bonus += 10;
    if (permanent.marks & MARK_ATOMIC_MICROSIZER) bonus += 1;
    return bonus;
  }
  override toughnessBonus(permanent: Permanent): number {
    const card = this.effectiveCard(permanent);
    let bonus = card.toughness - permanent.card.toughness;
    if (card.name === PSYCHOSIS_CRAWLER || card.name === 'Body of Knowledge')
      bonus += this.hand.length;
    if (permanent.card.name === LIVING_CONUNDRUM && !this.library.length)
      bonus += 5;
    if (permanent.marks & MARK_HAND_OF_VECNA && this.inCombat)
      bonus += this.vecnaX;
    return bonus;
  }
  override canAttack(permanent: Permanent): boolean {
    if (
      permanent.card.name === VNWXT &&
      !(permanent.marks & MARK_HAND_OF_VECNA)
    )
      return false;
    return super.canAttack(permanent);
  }

  // ================================================================ entering
  override onEnter(permanent: Permanent, _from: Zone): void {
    const name = permanent.card.name;
    if (name === VNWXT) {
      this.startEngines();
      if (this.vnwxtOut === null) this.vnwxtOut = this.turn;
    } else if (name === SLICK_IMITATOR) this.startEngines();
    else if (name === WIZARD_CLASS) permanent.counters = 1;
    else if (name === NERD_RAGE && !permanent.token) {
      this.draw(2);
      this.attach(MARK_NERD_RAGE);
    } else if (name === AQUEOUS_FORM) this.attach(MARK_AQUEOUS_FORM);
    else if (name === JACE) permanent.counters = 4;
  }
  /** Put an Aura on our best attacker. */
  attach(mark: number): void {
    const permanent = this.counterTarget();
    if (permanent) permanent.marks |= mark;
  }
  override entersTapped(card: CardDef): boolean {
    if (card.name === MYSTIC_SANCTUARY)
      return (
        this.landsOnBattlefield().filter((permanent) => permanent.land?.island)
          .length < 3
      );
    return super.entersTapped(card);
  }
  override onLandEnter(permanent: Permanent, gone: boolean): void {
    const name = permanent.card.name;
    if (
      name === AVISHKAR_RACEWAY ||
      name === MURAGANDA_RACEWAY ||
      name === AMONKHET_RACEWAY
    )
      this.startEngines();
    if (this.isOnBattlefield(ROIL_CARTOGRAPHER) && !gone)
      this.energyCounters += this.countOnBattlefield(ROIL_CARTOGRAPHER);
    if (name === MYSTIC_SANCTUARY && !permanent.tapped) {
      const order = [
        'Pull from Tomorrow',
        'Treasure Cruise',
        'Brainstorm',
        'Windfall',
        'Frantic Search',
        'Consider',
      ];
      const card = order
        .map((name) =>
          this.graveyard.find((candidate) => candidate.name === name),
        )
        .find((found) => found !== undefined);
      if (card) {
        this.takeCardIfThere(card, 'graveyard');
        this.putCardsOnTopOfLibrary([card]);
        this.say('Mystic Sanctuary: put', card, 'on top');
      }
    }
  }
  override onDies(permanent: Permanent): void {
    if (permanent.card.name === AURORA_SHIFTER) this.shifterCopy = null;
  }

  // ================================================================ mana
  override manaSourceKind(
    permanent: Permanent,
    ignoreSick = false,
  ): string | null {
    if (permanent.card === TOK.spawn) return 'C';
    if (permanent.card.name === MURAGANDA_RACEWAY && this.speed >= 4)
      return 'C2';
    return super.manaSourceKind(permanent, ignoreSick);
  }
  /** A Spawn that was tapped for mana is gone (sacrificed). Done later, not inside pay(): the engine pays
   *  speculatively and restores the tapped flags afterwards, which can not bring a sacrificed token back. */
  purgeSpawns(): void {
    for (const permanent of this.battlefield.slice())
      if (permanent.card === TOK.spawn && permanent.tapped)
        this.dies(permanent);
  }
  override effectiveCost(
    card: CardDef,
    base: Cost | null = null,
    fromGraveyard = false,
  ): Cost {
    const cost = super.effectiveCost(card, base, fromGraveyard);
    if (card.isBlue && this.isOnBattlefield(WATER_CRYSTAL) && cost.generic > 0)
      return cost.withGeneric(cost.generic - 1);
    return cost;
  }
  override onCommanderCast(_card: CardDef): void {
    this.commanderCasts += 1;
  }
  override commanderCost(_card: CardDef, cost: Cost): Cost {
    return cost.withGeneric(cost.generic + 2 * this.commanderCasts);
  }
  /** Mana we could pay now (without the pool). */
  availMana(): number {
    let mana = this.pool.U + this.pool.C + this.pool.S;
    for (const permanent of this.battlefield) {
      if (permanent.tapped) continue;
      const kind = this.manaSourceKind(permanent);
      if (kind === null) continue;
      mana += kind === 'C2' ? 2 : 1;
    }
    return mana;
  }
  maxAffordableX(extra: number, per = 1): number {
    let affordableX = 0;
    while (
      affordableX < 30 &&
      this.canPay(new Cost(per * (affordableX + 1) + extra))
    )
      affordableX++;
    return affordableX;
  }

  // ================================================================ card values
  value(card: CardDef): number {
    return VALUE[card.name] ?? (card.isCreature ? 40 : 30);
  }
  override cardValue(card: CardDef): number {
    if (card.land !== null) {
      const manaAndLands = this.manaSources() + this.countLandsHand();
      return manaAndLands <= 4
        ? 80
        : manaAndLands <= 7
          ? 55
          : manaAndLands <= 9
            ? 35
            : 18;
    }
    if (HOLD.has(card.name)) return 28;
    return this.value(card);
  }

  // ================================================================ turn steps
  override startTurn(): void {
    if (this.turn > 0) this.noteTurnEnd();
    this.purgeSpawns();
    super.startTurn();
    this.speedUpTurn = false;
    this.drakeCopies = 0;
    this.opponentLostLifeThisTurn = false;
    this.drawsThisTurn = 0;
    this.drawStepOpen = true;
    this.inCombat = false;
    this.nerdRageAttackedThisTurn = false;
    this.vecnaX = 0;
    for (const permanent of this.battlefield) {
      permanent.marks &= ~MARK_UNBLOCKABLE_THIS_TURN;
      permanent.exhausted = false;
    }
  }
  override playLand(): void {
    this.drawStepOpen = false;
    this.applyTableLifeLoss();
    super.playLand();
  }
  override develop(main2 = false): boolean {
    this.drawStepOpen = false;
    return super.develop(main2);
  }
  override endTurn(): void {
    this.endStep();
    const max = this.hasNoMaximumHandSize()
      ? 999
      : this.isOnBattlefield(TWENTY_TOED_TOAD)
        ? 20
        : 7;
    if (this.hand.length > max) this.discard(this.hand.length - max);
  }

  // ================================================================ combat
  override combat(): void {
    this.purgeSpawns();
    this.inCombat = true;
    this.vecnaX = this.hand.length;
    // beginning of combat
    for (const permanent of this.battlefield.slice()) {
      if (permanent.card.name === 'Loyal Drake' && this.isOnBattlefield(VNWXT))
        this.draw(1);
    }
    this.shifterCopyNow();
    if (this.checkKill() === 2) return;
    this.creatureCombat();
    this.checkKill();
  }
  /** Aurora Shifter: pay {E}{E} to become a copy of another creature (not legendary). */
  shifterCopyNow(): void {
    const permanent = this.findPermanent(AURORA_SHIFTER);
    if (!permanent || this.shifterCopy || this.energyCounters < 2) return;
    const want = [
      PSYCHOSIS_CRAWLER,
      LABORATORY_MANIAC,
      ONEIROPHAGE,
      CLINQUANT_SKYMAGE,
      'Kraken',
      EMRAKULS_MESSENGER,
      MISCHIEVOUS_MYSTIC,
    ];
    const pickable = this.battlefield.filter(
      (candidate) =>
        candidate !== permanent &&
        candidate.isCreature &&
        !candidate.card.types.has('legendary') &&
        want.includes(candidate.card.name),
    );
    if (!pickable.length) return;
    const target = firstMin(pickable, (candidate) =>
      want.indexOf(candidate.card.name),
    );
    this.energyCounters -= 2;
    this.shifterCopy = target.card;
    this.say('Aurora Shifter becomes a copy of', target.card);
  }
  override onAttack(attackers: Permanent[]): Permanent[] {
    const toad = attackers.find(
      (permanent) => permanent.card.name === TWENTY_TOED_TOAD,
    );
    if (
      attackers.some((permanent) => permanent.marks & MARK_NERD_RAGE) &&
      this.hand.length >= 10
    )
      this.nerdRageAttackedThisTurn = true;
    if (toad) {
      if (attackers.length >= 2) {
        toad.counters += 1;
        this.draw(1);
      }
      if (toad.counters >= 20 || this.hand.length >= 20) {
        this.toadWon = true;
        this.winHow = 'Toad';
      }
    }
    return [];
  }
  override onCombatDamage(connected: Permanent[], _damage: number): void {
    for (const permanent of connected) {
      const name = this.effectiveCard(permanent).name;
      if (name === SHORELINE_LOOTER) {
        this.draw(1);
        if (this.graveyard.length < 7) this.discard(1);
      } else if (name === LOOTER_IL_KOR) {
        this.draw(1);
        this.discard(1);
      } else if (name === AURORA_SHIFTER)
        this.energyCounters += this.power(permanent);
    }
    const fblthp = this.findPermanent(FBLTHP);
    if (fblthp && connected.length) {
      this.draw(2);
      if (!this.library.length && !this.died) {
        this.milled = true;
        this.winHow = 'mill';
      }
      this.takeFromBattlefieldIfThere(fblthp);
      this.putCard(fblthp.card, 'library');
      this.shuffle();
      this.say('Fblthp shuffles into the library');
    }
  }
  /** Our best creature to carry equipment and auras. */
  carrier(): Permanent | null {
    const permanents = this.creatures().filter(
      (permanent) =>
        this.evasive(permanent) ||
        this.effectiveCard(permanent).name === 'Kraken',
    );
    return permanents.length
      ? firstMax(
          permanents,
          (permanent) =>
            (this.evasive(permanent) ? 100 : 0) +
            permanent.card.manaValue +
            this.power(permanent),
        )
      : null;
  }
  candidates(main2: boolean): Candidate[] {
    return buildCandidates(this, main2);
  }

  // ================================================================ spells
  override resolve(
    card: CardDef,
    fromGraveyard = false,
    mode: string | null = null,
  ): void {
    const name = card.name;
    if (name === 'Tune the Narrative') {
      this.draw(1);
      this.energyCounters += 2;
    } else if (name === 'Flux') {
      const all =
        this.isSafeToEmptyLibrary() &&
        this.refillDraws(this.hand.length, true) >= this.library.length;
      const bad = all
        ? this.hand.slice()
        : this.hand
            .filter(
              (candidate) =>
                candidate !== card &&
                (candidate.land !== null || HOLD.has(candidate.name)),
            )
            .sort(
              (first, second) => this.cardValue(first) - this.cardValue(second),
            )
            .slice(0, 4);
      for (const discardedCard of bad) {
        this.takeCardIfThere(discardedCard, 'hand');
        this.toGraveyard(discardedCard);
      }
      this.draw(bad.length + 1);
    } else if (name === 'Windfall') {
      const handSize = this.hand.length;
      for (const card of this.takeAllCards('hand')) this.toGraveyard(card);
      this.draw(
        this.inArena()
          ? this.arena!.wheel(this, handSize)
          : Math.max(handSize, 7),
      );
    } else if (name === 'Pull from Tomorrow') {
      const xValue = parseInt((mode ?? 'x=0').slice(2), 10);
      this.draw(xValue);
      this.discard(1);
    } else if (name === 'Frantic Search') {
      this.draw(2);
      this.discard(2);
      this.untapLands(3);
    } else super.resolve(card, fromGraveyard, mode);
  }
  /** Slick Imitator at max speed: {1}, sacrifice it: copy a spell we cast (a copy of a draw spell draws again). */
  imitatorReady(): boolean {
    return this.speed >= 4 && this.isOnBattlefield(SLICK_IMITATOR);
  }
  imitate(card: CardDef, mode: string | null): void {
    const permanent = this.findPermanent(SLICK_IMITATOR);
    if (!permanent || this.speed < 4 || !this.pay(new Cost(1), true)) return;
    this.dies(permanent);
    this.say('Slick Imitator copies', card);
    this.resolve(card, false, mode);
  }
  override castInstantOrSorcery(
    card: CardDef,
    fromGraveyard = false,
    base: Cost | null = null,
    mode: string | null = null,
    triggerOptions: Record<string, unknown> = {},
  ): boolean {
    if (
      !super.castInstantOrSorcery(
        card,
        fromGraveyard,
        base,
        mode,
        triggerOptions,
      )
    )
      return false;
    if (DRAW_SPELLS_WORTH_COPYING.has(card.name)) {
      for (let i = 0; i < this.drakeCopies; i++)
        this.resolve(card, false, mode);
      if (this.drakeCopies)
        this.say(
          'Thunderclap Drake: ' +
            this.drakeCopies +
            ' cop' +
            (this.drakeCopies > 1 ? 'ies' : 'y') +
            ' of',
          card,
        );
      this.drakeCopies = 0;
      this.imitate(card, mode);
    }
    return true;
  }
  override castPerm(card: CardDef, fromCommand = false): boolean {
    const wasCast = super.castPerm(card, fromCommand);
    if (wasCast) {
      // Pensive Professor: Increment (not modelled); Thunderclap Drake etc. are plain creatures here
    }
    return wasCast;
  }

  // ================================================================ the planner's score
  override positionValue(): number {
    if (this.died) return -5000;
    this.purgeSpawns();
    let value = 0;
    const start = this.config.opp_life as number;
    for (const life of this.life)
      value += 3 * (start - Math.max(0, life)) + (life <= 0 ? 40 : 0);
    value += 12 * this.speed;
    value += 18 * Math.min(10, this.manaSources());
    value +=
      3 * this.hand.length +
      0.3 * this.hand.reduce((total, card) => total + this.cardValue(card), 0);
    for (const permanent of this.battlefield) {
      if (permanent.land !== null) continue;
      if (permanent.token) {
        value +=
          permanent.card === TOK.spawn ? 3 : 4 + 2 * this.power(permanent);
        continue;
      }
      value += 0.8 * this.value(permanent.card) + 2 * permanent.counters;
      if (this.evasive(permanent)) value += 2 * this.power(permanent);
    }
    const seas = this.findPermanent(OMINOUS_SEAS);
    if (seas) value += 3 * seas.counters;
    // the mill: progress is good only when it is safe (a win piece on the battlefield)
    const lib = this.library.length;
    if (this.hasMillWinPiece()) value += 120 + 2 * (60 - lib);
    else if (this.isSafeToEmptyLibrary())
      value += 2 * Math.max(0, 40 - lib) * 0.5;
    else if (lib < (this.config.keep_library as number) + 2) value -= 150;
    if (this.isOnBattlefield(TWENTY_TOED_TOAD))
      value += 6 * Math.max(0, this.hand.length - 8);
    if (this.countOnBattlefield(PSYCHOSIS_CRAWLER) && this.cardsDrawnBy(1) > 1)
      value += 25;
    return value;
  }
}
