/**
 * One goldfish game, played by a heuristic AI. The rules part of the engine, shared by every deck.
 * (game.ts adds what a pod game needs on top of this: real opponents, blockers, removal and counterspells.)
 *
 * The engine knows the rules a deck relies on: zones, mana and lands, casting, cost reducers,
 * draw / scry / tutor effects of common cards, the turn loop, mulligans, and the turn planner
 * (it tries its best few plays on copies of the game and keeps the best one).
 *
 * Reading order (one section per banner below):
 *   state and helpers -> mana -> zones and drawing -> effects of common cards -> creatures -> life and damage
 *   -> casting -> lands -> choosing what to do (candidates, the turn planner) -> the turn -> deck hooks -> combat.
 * This class keeps the state, the hooks and every method a deck calls; the larger bodies live in topic files as
 * functions that take the game (ENGINE.md, "How the game class is split"): mana-payment.ts, common-spells.ts,
 * land-play.ts, planner.ts, kill-line.ts (checkKill), turn.ts, goldfish-combat.ts.
 *
 * A turn (takeTurn): startTurn, upkeep, draw, playLand, developWin (cast things until nothing is worth doing; each
 * step first checks for a kill), combat, developWin again (second main phase), endTurn.
 * develop() asks the deck for its candidates() (everything it may do now with a score), keeps the ones we can pay
 * for, and lets the planner pick between the best few by playing them out on copies of the game.
 *
 * A deck subclasses Game (see decks/goldfish/index.ts for the smallest one, decks/gale for a full one) and fills in:
 *   must have:    buildKillSearchState / killSearchStateKey / killSearch (or extend GameWithoutKillSearch), candidates
 *   what it wants: cardValue, discardValue, instantOrSorceryDevValue, tutorTarget, positionValue, landWant, landBias
 *   card effects: resolveOther, castTriggers, beforeDraw, onToGraveyard, onEnter, onDies, onLandEnter, powerBonus,
 *                 toughnessBonus, upkeep, endStep, commanderCost, onCommanderCast
 *   combat:       canAttack, fogBlocker, evasive, winsWith, onAttack, onCombatDamage (or combat() itself)
 *   setup:        initDeck, mulliganRule, diag (numbers to report per game)
 */
import * as C from '../cards/cards';
import * as Facts from '../cards/card-facts';
import { Cost, CardDef } from '../cards/cards';
import { CLUE, ELDRAZI_SPAWN, TREASURE } from '../cards/tokens';
import { Rng } from '../util/rng';
import { MulliganRule } from './mulligan';
import {
  beginNextTurn,
  developUntilTheWinStands,
  drawOpeningHand,
  moveToStep,
  playTurn,
  startOurTurn,
} from './turn';
import { formatLogPart, formatList } from './log-format';
import {
  EventKind,
  GameEvent,
  buildEvent,
  cardNamesAmong,
  CardMove,
  ManaPaid,
  PlayerCounters,
} from '../game-log/game-log';
import { CardZone, MoveRecorder } from '../game-log/game-log-moves';
import { firstMax, firstMin, removeOrThrow, sortDesc } from '../util/lists';
import {
  Candidate,
  CardListZone,
  Config,
  KillSearcher,
  KillStep,
  LogBoardView,
  ManaPool,
  Permanent,
  Zone,
  emptyPool,
} from './game-types';
import { adoptKillLineCopyAsTheGame, checkForKill } from './kill-line';
import {
  BlinkedCard,
  resolveBlinkSpell,
  returnBlinkedCards,
  returnCardsBlinkedInOpponentTurn,
} from './blink';
import {
  Dungeon,
  DungeonPosition,
  DungeonRoom,
  bestRoom,
  ventureIntoDungeon,
} from './dungeons';
import { PaymentRecord } from './search-mana';
import {
  resolveCardSelection,
  resolveManaOrTutor,
  untapBestLands,
} from './common-spells';
import { triggerOnOpponentCast } from './opponent-cast-triggers';
import { enterTriggerCount } from './trigger-doublers';
import { resolveGraveyardCopySpell } from './spell-copies';
import { playGoldfishCombat } from './goldfish-combat';
import {
  castAndActivateWishclaw,
  castAndResolveInstantOrSorcery,
  castCardsExiledWithRebound,
  castPermanentSpell,
  castWithFlashback,
  cycleCard,
  transmuteCard,
  triggerOnInstantOrSorceryCast,
} from './casting';
import {
  putOpeningHandLeylineOntoBattlefield,
  resolveFlashSpell,
} from './instant-speed';
import {
  clueSacrificed,
  drawWhenCreatureDies,
  landfallOfCommonCards,
  resolveSacrificeDrawSpell,
} from './card-draw';
import {
  deathTriggerOfCommonCard,
  enterTriggerOfCommonCard,
  upkeepOfCommonCards,
} from './common-permanents';
import { resolveLandSearch } from './land-search';
import { reanimateAsAuraEnters, resolveReanimationSpell } from './reanimation';
import {
  manaSourceKindOf,
  payCost,
  tapForMana,
  whatPoolIsShortOf,
} from './mana-payment';
import { entersTappedByItsText, playBestLand } from './land-play';
import {
  developTurn,
  moveRockFirst,
  planBestOption,
  ritualCandidatesThatHelp,
} from './planner';

/** What a payment changes, to try one and undo it: the pool, which permanents are tapped, how many payments the log has
 *  noted (an undone payment is not logged), and what a committed payment adds: the mana spent, and the life a pain
 *  land costs (which could even kill us). */
interface Snap {
  pool: ManaPool;
  tapped: boolean[];
  paymentsLogged: number;
  myLife: number;
  died: boolean;
  spent: number;
}
/** The steps of a turn the engine tells apart (untap has no step: nothing happens in it; cleanup is part of endTurn). */
export type TurnStep = 'upkeep' | 'draw' | 'main1' | 'combat' | 'main2' | 'end';
/** What the game log calls each zone (Archidekt's names). */
const LOG_ZONE: Record<CardListZone, CardZone> = {
  library: 'library',
  hand: 'hand',
  graveyard: 'graveyard',
  exile: 'exile',
  command: 'commandZone',
};

export abstract class GameCore<S = unknown> {
  killNow = false;
  inRollout = false;
  seen4: Set<string> | null = null;
  /** The game's log (only filled when `verbose` is on). */
  log: GameEvent[] = [];
  /** Works out the card moves for the log. Only the real game with the log on has one (not the planner's copies). */
  moveRecorder: MoveRecorder | null = null;
  /** Which player of the log we are (a pod sets it; a goldfish game has one player). */
  playerInLog = 0;
  /** Zone changes that did not go through takeCard / putCard and the like, each with the turn and the log line
   *  it was found at (only with the log on). A test reads this to point at the code that made them. */
  unrecordedCardMoves: string[] = [];
  library: CardDef[];
  command: CardDef[];
  /** Our commanders' names (this.command only holds the ones in the command zone right now). */
  commanderNames: string[] = [];
  hand: CardDef[] = [];
  graveyard: CardDef[] = [];
  exile: CardDef[] = [];
  /** Cards blinked "until the next end step", waiting in exile (blink.ts). */
  cardsReturningAtEndStep: BlinkedCard[] = [];
  /** Cards exiled by rebound, cast again at our next upkeep. */
  reboundCards: CardDef[] = [];
  /** The dungeon and room we are in (dungeons.ts); null when in none. */
  dungeonPosition: DungeonPosition | null = null;
  completedDungeons = 0;
  /** Do we have the initiative? (In a pod the table keeps one holder.) */
  hasInitiative = false;
  battlefield: Permanent[] = [];
  /** Cards another player owns that left our battlefield and are on their way to a zone (see putCard). */
  cardsGoingToTheirOwner: { card: CardDef; owner: GameCore<unknown> }[] = [];
  pool: ManaPool = emptyPool();
  /** The deck's colours: what an "either colour" source (Command Tower, a dual land) makes. */
  colors: string[] = ['U', 'B'];
  turn = 0;
  /** Which step of our turn we are in (see enterStep). Before the first turn it is the first thing a turn does. */
  step: TurnStep = 'upkeep';
  life: number[];
  opponentLibrarySizes: number[];
  opponentGraveyardSizes: number[];
  poison: number[];
  myLife = 40;
  /** How many permanents were sacrificed to cast the spell that is resolving (card-draw.ts). */
  spellSacrifices = 0;
  unprotectedKillTurn: number | null = null;
  protectedKillTurn: number | null = null;
  caseSolved = false;
  onPlay: boolean;
  lastKey: string | null = null;
  highTidesThisTurn = 0; // High Tides resolved this turn
  muck = 0; // Bubbling Mucks resolved this turn
  /** Energybending resolved this turn: every land is every basic land type. */
  isEnergybendingActive = false;
  /** Our energy ({E}) and experience counters. Changed through gainEnergy / payEnergy / gainExperience; every
   *  log line carries them, as it carries life. */
  energyCounters = 0;
  experienceCounters = 0;
  spellsCast = 0;
  isCast = 0;
  attacked = false;
  firstDrawDone = false;
  wallUsed = false;
  /** Instant speed on the opponents' turns (engine/game/instant-speed.ts): we are in that window now, sorceries
   *  have flash this turn (Borne Upon a Wind, Emergence Zone), the next sorcery has flash (Quicken), and how many
   *  spells the windows cast in this game (for --diag). */
  isInOpponentsTurn = false;
  sorceriesHaveFlashThisTurn = false;
  nextSorceryHasFlash = false;
  opponentsEndStepCasts = 0;
  /** Cards in exile on an adventure: their permanent half may be cast from there (sacrifice-outlets.ts). */
  cardsOnAdventure: CardDef[] = [];
  /** Copies to make of the next instant or sorcery we cast this turn (Thunderclap Drake, spell-copies.ts). */
  copiesOfNextInstantOrSorcery = 0;
  landPlayed = false;
  /** Pain damage of the lands tapped by the payment in progress (dealt when pay() commits). */
  painTaps = 0;
  /** Mana paid so far in the game (spells and abilities), and the total at the end of each turn (for diag()). */
  spent = 0;
  spentEnd: number[] = [];
  /** Total life opponents have lost (damage, drains). */
  damageDealt = 0;
  /** The turn the first opponent died (null = none yet). */
  firstOpponentDeadTurn: number | null = null;
  /** We lost: our life reached 0. */
  died = false;

  /**
   * mode "any": go for the first kill found.  mode "protected": only go when a counterspell can
   * back the kill up, and meanwhile never take an action that breaks an available kill.
   */
  constructor(
    commanders: string[],
    library: string[],
    public rng: Rng,
    public config: Config,
    public verbose = false,
    public mode: 'any' | 'protected' = 'any',
  ) {
    this.library = library.map((cardName) => C.get(cardName));
    rng.shuffle(this.library);
    this.command = commanders.map((cardName) => C.get(cardName));
    this.commanderNames = commanders.slice();
    const opponentCount = config.opponents as number;
    this.life = new Array(opponentCount).fill(config.opp_life);
    this.opponentLibrarySizes = new Array(opponentCount).fill(
      config.opp_library,
    );
    this.opponentGraveyardSizes = new Array(opponentCount).fill(0);
    this.poison = new Array(opponentCount).fill(0);
    this.onPlay = rng.random() < (config.on_play_chance as number);
    if (verbose) this.moveRecorder = new MoveRecorder(this);
    this.initDeck();
  }

  /** Deck-specific state (a deck's Game subclass overrides this). */
  initDeck(): void {}

  /** A copy of the game: lists and permanents are copied, the random numbers continue the same. */
  clone(): this {
    const copy = Object.create(Object.getPrototypeOf(this)) as this;
    for (const fieldName of Object.keys(this)) {
      const fieldValue = (this as Record<string, unknown>)[fieldName];
      (copy as Record<string, unknown>)[fieldName] = Array.isArray(fieldValue)
        ? fieldValue.slice()
        : fieldValue;
    }
    copy.battlefield = this.battlefield.map((permanent) => permanent.copy());
    copy.pool = { ...this.pool };
    copy.rng = this.rng.clone();
    copy.moveRecorder = null;
    copy.killLineCopy = null;
    return copy;
  }

  /** Adds a line to the log: text, cards and lists of cards, joined by spaces. */
  say(...parts: unknown[]): void {
    this.sayEvent('note', ...parts);
  }

  /** A log line of a known kind (a land, a cast, an attack, the win...). */
  sayEvent(kind: EventKind, ...parts: unknown[]): void {
    if (!this.verbose) return;
    const event = buildEvent(
      kind,
      this.turn,
      parts.map(formatLogPart).join(' '),
      cardNamesAmong(parts),
      [this.myLife, ...this.life],
      this.playerCountersForLog(),
    );
    event.moves = this.collectCardMoves(kind === 'turn-end', event.text);
    if (kind !== 'turn-start' && this.paymentsForLog.length)
      event.paidWith = this.paymentsForLog;
    this.paymentsForLog = [];
    const pool = this.poolAsSymbols();
    if (pool) event.pool = pool;
    this.log.push(event);
  }

  /** The sources tapped by committed payments since the last log line (only kept while the log is on). */
  paymentsForLog: ManaPaid[] = [];

  /** The floating mana as mana symbols ("UUB"), empty when the pool is empty. */
  poolAsSymbols(): string {
    let symbols = '';
    for (const [kind, amount] of Object.entries(this.pool))
      symbols += kind.repeat(Math.max(0, amount));
    return symbols;
  }

  /** The counters on the players for a log line, in the order of its life totals: ours, then the opponents'
   *  (poison). */
  playerCountersForLog(): PlayerCounters[] {
    return [
      { energy: this.energyCounters, experience: this.experienceCounters },
      ...this.poison.map((poison) => ({ poison })),
    ];
  }

  /** The card moves since the last log line (see game-log-moves.ts). isEndOfTurn: cards that left a zone and
   *  went nowhere are written as exiled. */
  collectCardMoves(isEndOfTurn = false, logLine?: string): CardMove[] {
    const recorder = this.moveRecorder;
    if (recorder === null) return [];
    const moves = recorder.collectMoves(this, this.playerInLog, isEndOfTurn);
    if (recorder.unrecordedChanges.length) {
      const foundAt = logLine ?? this.log[this.log.length - 1]?.text ?? '';
      for (const change of recorder.unrecordedChanges)
        this.unrecordedCardMoves.push(
          `T${this.turn} "${foundAt.trim()}": ${change}`,
        );
      recorder.unrecordedChanges = [];
    }
    return moves;
  }

  /** Puts what changed since the last log line on that line. Called between the actions of a turn, so that the
   *  moves of one action (a land entering after "play land") are not shown under the next one. */
  logCardMovesSoFar(): void {
    if (this.moveRecorder === null) return;
    const lastEvent = this.log[this.log.length - 1];
    if (lastEvent) lastEvent.moves.push(...this.collectCardMoves());
  }

  /** How a log line names opponent `slot`. A pod gives the player's name (see Game.opponentNames). */
  opponentName(slot: number): string {
    return `opponent ${slot + 1}`;
  }

  /** The opponents' life for a log line. */
  describeOpponentLife(): string {
    return `opp life [${this.life.join(', ')}]`;
  }

  /** A log line worth jumping to when reading the game. */
  sayHighlight(...parts: unknown[]): void {
    if (!this.verbose) return;
    this.sayEvent('note', ...parts);
    this.log[this.log.length - 1].isHighlight = true;
  }

  // ================================================================ helpers
  isOnBattlefield(name: string): boolean {
    for (const permanent of this.battlefield)
      if (permanent.card.name === name) return true;
    return false;
  }

  /** How many permanents of ours have this name. */
  countOnBattlefield(name: string): number {
    return this.battlefield.filter((permanent) => permanent.card.name === name)
      .length;
  }

  findPermanent(name: string): Permanent | null {
    for (const permanent of this.battlefield)
      if (permanent.card.name === name) return permanent;
    return null;
  }

  landsOnBattlefield(): Permanent[] {
    return this.battlefield.filter((permanent) => permanent.land !== null);
  }

  countLandsHand(): number {
    return this.hand.filter((card) => card.land !== null).length;
  }

  manaSources(): number {
    return (
      this.battlefield.filter((permanent) =>
        this.manaSourceKind(permanent, true),
      ).length + (this.isOnBattlefield('Sol Ring') ? 1 : 0)
    );
  }

  hasCounterInHand(): boolean {
    return this.hand.some((card) => Facts.COUNTERS.has(card.name));
  }

  instantOrSorceryCostReduction(permanents = this.battlefield): number {
    let reduction = 0;
    for (const permanent of permanents) {
      if (Facts.REDUCE_INSTANT_SORCERY_COST.has(permanent.card.name))
        reduction++;
      if (permanent.card.name === 'Curious Homunculus' && permanent.transformed)
        reduction++;
    }
    return reduction;
  }

  effectiveCost(
    card: CardDef,
    base: Cost | null = null,
    fromGraveyard = false,
  ): Cost {
    // Omniscience: spells from hand are free (an X spell then has X = 0, so it is cast with its X paid normally)
    if (
      base === null &&
      !fromGraveyard &&
      this.isOnBattlefield('Omniscience') &&
      this.hand.includes(card)
    )
      return new Cost();
    const cost = base ?? card.cost;
    let reduction = 0;
    if (card.isInstantOrSorcery)
      reduction += this.instantOrSorceryCostReduction();
    if (!card.isCreature)
      for (const permanent of this.battlefield)
        if (Facts.REDUCE_NONCREATURE.has(permanent.card.name)) reduction++;
    if (cost.blue || cost.hybrid)
      for (const otherPermanent of this.battlefield)
        if (Facts.REDUCE_BLUE.has(otherPermanent.card.name)) reduction++;
    if (fromGraveyard)
      for (const anotherPermanent of this.battlefield)
        if (Facts.REDUCE_FROM_GRAVEYARD_BY_2.has(anotherPermanent.card.name))
          reduction += 2;
    if (card.name === 'Focus the Mind' && this.spellsCast > 0) reduction += 2;
    return cost.withGeneric(Math.max(0, cost.generic - reduction));
  }

  // ================================================================ mana (mana-payment.ts)
  /** What kind of mana a permanent makes now (a colour, A = either of the deck's colours, C<n>, ...), or null. */
  manaSourceKind(
    permanent: Permanent,
    ignoreSick = false,
    ignoreEnergybending = false,
  ): string | null {
    return manaSourceKindOf(this, permanent, ignoreSick, ignoreEnergybending);
  }

  islandTyped(permanent: Permanent): boolean {
    return (
      permanent.land !== null &&
      (!!permanent.land.island || this.isEnergybendingActive)
    );
  }

  swampTyped(permanent: Permanent): boolean {
    return (
      permanent.land !== null &&
      (!!permanent.land.swamp || this.isEnergybendingActive)
    );
  }

  /** What the pool is still short of to pay cost (null = enough). With mutate, pays it. */
  short(
    cost: Cost,
    isInstantOrSorcery: boolean,
    mutate = false,
  ): string | null {
    return whatPoolIsShortOf(this, cost, isInstantOrSorcery, mutate);
  }

  /** Which source to tap first for a generic cost (N) can be adjusted by a deck: lower = tapped first. */
  rankAdjust(_short: string, _kind: string, rank: number): number {
    return rank;
  }

  /** While a kill line is played, a deck may keep a source for later: it is tapped only when no other will do. */
  avoidsSource(_permanent: Permanent): boolean {
    return false;
  }

  /** Taps a source for the mana we are short of (a colour, H = hybrid, N = generic) and adds it to the pool. */
  tap(permanent: Permanent, short: string): void {
    tapForMana(this, permanent, short);
  }

  takeSnapshot(): Snap {
    return {
      pool: { ...this.pool },
      tapped: this.battlefield.map((permanent) => permanent.tapped),
      paymentsLogged: this.paymentsForLog.length,
      myLife: this.myLife,
      died: this.died,
      spent: this.spent,
    };
  }

  restore(snapshot: Snap): void {
    this.pool = { ...snapshot.pool };
    this.paymentsForLog.length = Math.min(
      this.paymentsForLog.length,
      snapshot.paymentsLogged,
    );
    const permanentCount = Math.min(
      this.battlefield.length,
      snapshot.tapped.length,
    );
    for (let i = 0; i < permanentCount; i++)
      this.battlefield[i].tapped = snapshot.tapped[i];
    this.myLife = snapshot.myLife;
    this.died = snapshot.died;
    this.spent = snapshot.spent;
  }

  /** Treasures and Eldrazi Spawn: mana sources that are sacrificed for their mana. */
  isExpendableManaSource(permanent: Permanent): boolean {
    return permanent.card === TREASURE || permanent.card === ELDRAZI_SPAWN;
  }

  /** While true, Treasures and Eldrazi Spawn are not mana sources (manaSourceKind gives null). */
  isKeepingExpendableManaBack = false;

  /** Runs a test that pays for real and then restores a snapshot (a restore can't bring back a sacrificed Treasure),
   *  so Treasures and Eldrazi Spawn are kept out of it. */
  withoutExpendableMana<T>(test: () => T): T {
    const wasKeepingThemBack = this.isKeepingExpendableManaBack;
    this.isKeepingExpendableManaBack = true;
    try {
      return test();
    } finally {
      this.isKeepingExpendableManaBack = wasKeepingThemBack;
    }
  }

  /** Pays a cost (mana-payment.ts): taps sources into the pool and pays from it. Treasures and Eldrazi Spawn are
   *  spent last. commit = false only tests it (everything is undone). */
  pay(cost: Cost, isInstantOrSorcery = false, commit = true): boolean {
    return payCost(this, cost, isInstantOrSorcery, commit);
  }

  /** What a search planned for the step being played: the sources it tapped for each cost, in order, and the lands
   *  an untap effect untapped (engine/game/search-mana.ts). A deck sets it for a step and clears it after. */
  plannedPayments: PaymentRecord[] = [];

  /** What the last committed payment tapped, and what each source added to the pool ("U", "UB"). */
  lastPayment: { source: Permanent; made: string }[] = [];

  canPay(cost: Cost, isInstantOrSorcery = false): boolean {
    return this.pay(cost, isInstantOrSorcery, false);
  }

  areOpponentsBeaten(): boolean {
    for (let i = 0; i < this.life.length; i++)
      if (!(
        this.life[i] <= 0 ||
        this.opponentLibrarySizes[i] <= 0 ||
        this.poison[i] >= 10
      ))
        return false;
    return true;
  }

  /** Looks for a kill at this step of the turn and, for a deck that plays its lines, plays the one found on a copy
   *  (kill-line.ts). Returns 2 when we win now, 1 when a kill was found that we don't take yet, 0 when none. */
  checkKill(): number {
    return checkForKill(this);
  }

  // ================================================================ zones / drawing
  // Every zone change goes through the functions below, so that the game log can record it at that moment.
  // A card that was taken and not put anywhere yet is on its way (a spell that is resolving).

  /** Takes a card out of a zone (it must be there). Put it somewhere with putCard. */
  takeCard(card: CardDef, fromZone: CardListZone): void {
    removeOrThrow(this[fromZone], card);
    this.moveRecorder?.noteCardLeft(card, LOG_ZONE[fromZone]);
  }

  /** Takes a card out of a zone if it is there. Returns whether it was. */
  takeCardIfThere(card: CardDef, fromZone: CardListZone): boolean {
    if (!this[fromZone].includes(card)) return false;
    this.takeCard(card, fromZone);
    return true;
  }

  /** Takes the card at a position of a zone's list (0 = the first; in the library: the top). */
  takeCardAt(fromZone: CardListZone, index: number): CardDef {
    const [card] = this[fromZone].splice(index, 1);
    if (card === undefined)
      throw new Error(`no card at position ${index} of ${fromZone}`);
    this.moveRecorder?.noteCardLeft(card, LOG_ZONE[fromZone]);
    return card;
  }

  /** Takes every card out of a zone, in the order of its list. */
  takeAllCards(fromZone: CardListZone): CardDef[] {
    const cards = this[fromZone].splice(0);
    if (this.moveRecorder)
      for (const card of cards)
        this.moveRecorder.noteCardLeft(card, LOG_ZONE[fromZone]);
    return cards;
  }

  /** Puts a card into a zone, at the end of its list (in the library: on the bottom). A card another player owns
   *  goes to that player's zone instead. */
  putCard(card: CardDef, toZone: CardListZone): void {
    if (this.sendToItsOwner(card, toZone)) return;
    this[toZone].push(card);
    this.moveRecorder?.noteCardArrived(card, LOG_ZONE[toZone]);
  }

  /** If this card left our battlefield and another player owns it, it goes to that player's zone. A copy of the
   *  game (the planner's, a kill check's) keeps it, so that it never touches the owner's real game. */
  private sendToItsOwner(card: CardDef, toZone: CardListZone): boolean {
    const index = this.cardsGoingToTheirOwner.findIndex(
      (goingHome) => goingHome.card === card,
    );
    if (index < 0) return false;
    const [{ owner }] = this.cardsGoingToTheirOwner.splice(index, 1);
    if (!this.inArena()) return false;
    this.moveRecorder?.noteCardGivenAway(card);
    owner.receiveOwnCard(card, toZone);
    return true;
  }

  /** One of our cards that another player controlled comes back to a zone of ours. A commander goes to the
   *  command zone (its owner's choice). */
  receiveOwnCard(card: CardDef, toZone: CardListZone): void {
    const zone = this.commanderNames.includes(card.name) ? 'command' : toZone;
    this[zone].push(card);
    this.moveRecorder?.noteCardFromOtherPlayer(card, LOG_ZONE[zone]);
  }

  /** Another player gains control of a permanent of ours (or one we control goes back to its owner). It keeps its
   *  owner, it is summoning sick for its new controller, and it does not enter (no enter triggers). */
  giveControlTo(permanent: Permanent, newController: GameCore<unknown>): void {
    removeOrThrow(this.battlefield, permanent);
    this.moveRecorder?.notePermanentGivenAway(permanent);
    if (permanent.owner === null) permanent.owner = this;
    else if (permanent.owner === newController) permanent.owner = null;
    permanent.sick = permanent.card.isCreature;
    newController.battlefield.push(permanent);
    if (permanent.token)
      newController.moveRecorder?.noteCardArrived(
        permanent.card,
        'battlefield',
        true,
      );
    else
      newController.moveRecorder?.noteCardFromOtherPlayer(
        permanent.card,
        'battlefield',
      );
  }

  /** Puts cards into a zone, at the end of its list, in the order given. */
  putCards(cards: CardDef[], toZone: CardListZone): void {
    for (const card of cards) this.putCard(card, toZone);
  }

  /** Takes a card out of one zone and puts it at the end of another. */
  moveCard(card: CardDef, fromZone: CardListZone, toZone: CardListZone): void {
    this.takeCard(card, fromZone);
    this.putCard(card, toZone);
  }

  /** Takes the top cards of the library (fewer if it runs out), top card first. */
  takeTopCardsOfLibrary(count: number): CardDef[] {
    const cards = this.library.splice(0, count);
    if (this.moveRecorder)
      for (const card of cards) this.moveRecorder.noteCardLeft(card, 'library');
    return cards;
  }

  /** Puts cards on top of the library; the first one ends up on top. */
  putCardsOnTopOfLibrary(cards: CardDef[]): void {
    this.library.unshift(...cards);
    if (this.moveRecorder)
      for (const card of cards)
        this.moveRecorder.noteCardArrived(card, 'library');
  }

  /** Puts a permanent onto the battlefield (a token comes from nowhere, a card from where it was taken). */
  putOntoBattlefield(permanent: Permanent): void {
    this.battlefield.push(permanent);
    this.moveRecorder?.noteCardArrived(
      permanent.card,
      'battlefield',
      permanent.token,
    );
  }

  /** Takes a permanent off the battlefield (it must be there). A token is gone; put a card somewhere with putCard. */
  takeFromBattlefield(permanent: Permanent): void {
    removeOrThrow(this.battlefield, permanent);
    this.moveRecorder?.notePermanentLeft(permanent);
    if (permanent.owner !== null && !permanent.token)
      this.cardsGoingToTheirOwner.push({
        card: permanent.card,
        owner: permanent.owner,
      });
  }

  /** Takes a permanent off the battlefield if it is there. Returns whether it was. */
  takeFromBattlefieldIfThere(permanent: Permanent): boolean {
    if (!this.battlefield.includes(permanent)) return false;
    this.takeFromBattlefield(permanent);
    return true;
  }

  toGraveyard(card: CardDef, _fromLibrary = false): void {
    this.putCard(card, 'graveyard');
    this.onToGraveyard(card);
  }

  /** Draws cards. `_source` names the card that makes us draw (a deck may count what each card gives it). */
  draw(count = 1, _source: string | null = null): void {
    for (let i = 0; i < count; i++) {
      if (!this.library.length) return;
      this.beforeDraw();
      this.firstDrawDone = true;
      this.putCard(this.takeTopCardsOfLibrary(1)[0], 'hand');
    }
  }

  /** Discards cards, the ones we want least first. `_source` names the card that makes us discard. */
  discard(count: number, _source: string | null = null): void {
    for (let i = 0; i < count; i++) {
      if (!this.hand.length) return;
      const card = firstMin(
        this.hand,
        (otherCard) =>
          this.discardValue(otherCard) +
          (this.cardsTheKillLineNeeds.has(otherCard.name) ? 1000 : 0),
      );
      this.takeCard(card, 'hand');
      this.toGraveyard(card);
      this.say('discard', card);
    }
  }

  scry(count: number, surveil = false): void {
    const top = this.takeTopCardsOfLibrary(count);
    const keep: CardDef[] = [],
      away: CardDef[] = [];
    for (const card of top)
      ((surveil ? this.discardValue(card) : this.cardValue(card)) >= 40
        ? keep
        : away
      ).push(card);
    sortDesc(keep, (card) => this.cardValue(card));
    this.putCardsOnTopOfLibrary(keep);
    for (const otherCard of away) {
      if (surveil) this.toGraveyard(otherCard);
      else this.putCard(otherCard, 'library');
    }
  }

  shuffle(): void {
    this.rng.shuffle(this.library);
  }

  doTutor(
    allowed: (card: CardDef) => boolean,
    toTop: boolean,
    spentCard: string | null = null,
  ): void {
    const otherCard = this.tutorTarget(allowed, toTop, spentCard, true);
    if (otherCard === null) return;
    this.takeCard(otherCard, 'library');
    this.shuffle();
    if (toTop) this.putCardsOnTopOfLibrary([otherCard]);
    else this.putCard(otherCard, 'hand');
    this.say('tutor ->', otherCard, toTop ? '(top)' : '');
  }

  // ================================================================ effects of common cards
  /** What a spell does when it resolves, for the cards the engine knows. Other cards go to the deck's resolveOther(). */
  resolve(
    card: CardDef,
    fromGraveyard = false,
    mode: string | null = null,
  ): void {
    if (resolveCardSelection(this, card, fromGraveyard, mode)) return;
    if (resolveSacrificeDrawSpell(this, card)) return;
    if (resolveManaOrTutor(this, card, mode)) return;
    if (resolveLandSearch(this, card)) return;
    if (resolveReanimationSpell(this, card)) return;
    if (resolveBlinkSpell(this, card)) return;
    if (resolveFlashSpell(this, card)) return;
    if (resolveGraveyardCopySpell(this, card, mode)) return;
    this.resolveOther(card, fromGraveyard, mode);
  }

  /** Untaps up to count tapped lands, the ones that make the most mana first (common-spells.ts). */
  untapLands(count: number): void {
    untapBestLands(this, count);
  }

  enter(
    card: CardDef,
    from: Zone = 'hand',
    options: { token?: boolean; tapped?: boolean } = {},
  ): Permanent {
    const permanent = new Permanent(card);
    if (options.token || card.isToken) permanent.token = true;
    if (options.tapped) permanent.tapped = true;
    this.putOntoBattlefield(permanent);
    if (card.name === 'Baleful Strix') this.draw(1);
    const untap = Facts.UNTAP_ON_ETB[card.name];
    if (untap)
      for (let i = 0; i < enterTriggerCount(this, permanent); i++)
        this.untapLands(untap);
    reanimateAsAuraEnters(this, card);
    this.onEnter(permanent, from);
    return permanent;
  }

  /** Put a creature card from our graveyard onto the battlefield. */
  reanimate(
    card: CardDef,
    options: { tapped?: boolean; counters?: number } = {},
  ): Permanent {
    this.takeCardIfThere(card, 'graveyard');
    const permanent = this.enter(card, 'graveyard', { tapped: options.tapped });
    if (options.counters) permanent.counters += options.counters;
    this.say('  reanimate', card);
    return permanent;
  }

  /** The creature card in our graveyard we'd most like back (by reanimationValue). */
  bestCreatureInGraveyard(
    isWanted: (card: CardDef) => boolean = () => true,
  ): CardDef | null {
    const cards = this.graveyard.filter(
      (card) => card.isCreature && isWanted(card),
    );
    return cards.length
      ? firstMax(cards, (card) => this.reanimationValue(card))
      : null;
  }

  /** Create n tokens (each one "enters" and triggers onEnter). */
  createTokens(
    card: CardDef,
    count = 1,
    options: { tapped?: boolean } = {},
  ): Permanent[] {
    const out: Permanent[] = [];
    for (let i = 0; i < count; i++)
      out.push(
        this.enter(card, 'token', { token: true, tapped: options.tapped }),
      );
    return out;
  }

  // ================================================================ creatures
  creatures(): Permanent[] {
    return this.battlefield.filter((permanent) =>
      this.isCreatureNow(permanent),
    );
  }

  /** A creature card is a creature, except a Theros god while our devotion is below what it needs ("As long as your
   *  devotion to blue is less than five, Thassa isn't a creature"). */
  isCreatureNow(permanent: Permanent): boolean {
    if (!permanent.card.isCreature) return false;
    const needed = C.devotionToBeCreature(permanent.card);
    if (needed === null) return true;
    let devotion = 0;
    for (const colour of needed.colours) devotion += this.devotion(colour);
    return devotion >= needed.atLeast;
  }

  power(permanent: Permanent): number {
    return Math.max(
      0,
      permanent.card.power +
        permanent.counters +
        permanent.powerMod +
        this.powerBonus(permanent),
    );
  }

  toughness(permanent: Permanent): number {
    return (
      permanent.card.toughness +
      permanent.counters +
      permanent.toughnessMod +
      this.toughnessBonus(permanent)
    );
  }

  /** A creature dies (destroyed or sacrificed): tokens are gone, cards go to the graveyard. */
  dies(permanent: Permanent): void {
    if (!this.battlefield.includes(permanent)) return;
    this.takeFromBattlefield(permanent);
    if (!permanent.token) this.toGraveyard(permanent.card);
    this.onDies(permanent);
    this.onLeave(permanent);
    this.podAnnounceDeath(permanent);
  }

  sacrifice(permanent: Permanent): void {
    this.say('sacrifice', permanent.card);
    this.dies(permanent);
    if (permanent.card === CLUE) clueSacrificed(this);
  }

  /** Devotion to a colour: its pips in the mana costs of our permanents (token copies count too). */
  devotion(colour: 'W' | 'U' | 'B' | 'R' | 'G'): number {
    const pip = { W: 'white', U: 'blue', B: 'black', R: 'red', G: 'green' }[
      colour
    ] as 'white' | 'blue' | 'black' | 'red' | 'green';
    let totalDevotion = 0;
    for (const permanent of this.battlefield)
      totalDevotion += permanent.card.cost[pip];
    return totalDevotion;
  }

  // ================================================================ life and damage
  /** Opponent i loses n life (damage or life loss). Returns the life actually lost. */
  damageOpponent(i: number, amount: number): number {
    if (amount <= 0 || this.life[i] <= 0) return 0;
    const lost = Math.min(amount, this.life[i]);
    this.life[i] -= amount;
    this.damageDealt += lost;
    if (this.life[i] <= 0 && this.firstOpponentDeadTurn === null)
      this.firstOpponentDeadTurn = this.turn;
    return lost;
  }

  /** Each opponent still alive loses n. Returns the total lost. */
  drainEach(amount: number): number {
    let totalLost = 0;
    for (let i = 0; i < this.life.length; i++)
      if (this.isOpponentAlive(i)) totalLost += this.damageOpponent(i, amount);
    return totalLost;
  }

  isOpponentAlive(i: number): boolean {
    return (
      this.life[i] > 0 &&
      this.opponentLibrarySizes[i] > 0 &&
      this.poison[i] < 10
    );
  }

  countOpponentsAlive(): number {
    let aliveCount = 0;
    for (let i = 0; i < this.life.length; i++)
      if (this.isOpponentAlive(i)) aliveCount++;
    return aliveCount;
  }

  /** The opponent to focus single-target damage on: the one closest to dead. */
  chooseTargetOpponent(): number | null {
    let best: number | null = null;
    for (let i = 0; i < this.life.length; i++)
      if (
        this.isOpponentAlive(i) &&
        (best === null || this.life[i] < this.life[best])
      )
        best = i;
    return best;
  }

  loseLife(amount: number): void {
    this.myLife -= amount;
    if (this.myLife <= 0 && !this.died) {
      this.died = true;
      this.sayEvent('out', 'we die');
    }
  }

  gainLife(amount: number): void {
    this.myLife += amount;
  }

  gainEnergy(amount: number): void {
    this.energyCounters += amount;
  }

  /** Pays {E} (the caller checked that we have enough). */
  payEnergy(amount: number): void {
    if (amount > this.energyCounters)
      throw new Error(
        `paying ${amount} energy with only ${this.energyCounters}`,
      );
    this.energyCounters -= amount;
  }

  gainExperience(amount = 1): void {
    this.experienceCounters += amount;
  }

  // ================================================================ casting
  castInstantOrSorcery(
    card: CardDef,
    fromGraveyard = false,
    base: Cost | null = null,
    mode: string | null = null,
    triggerOptions: Record<string, unknown> = {},
  ): boolean {
    return castAndResolveInstantOrSorcery(
      this,
      card,
      fromGraveyard,
      base,
      mode,
      triggerOptions,
    );
  }

  /** The upkeep triggers the game itself has: rebound, and the initiative (its holder ventures into Undercity). */
  upkeepTriggersOfTheGame(): void {
    this.castReboundCards();
    if (this.hasInitiative) ventureIntoDungeon(this, true);
  }

  /** We take the initiative (an enter trigger, or combat damage to its holder): it is ours alone, and we venture
   *  into Undercity. */
  takeInitiative(): void {
    this.podTakeInitiative();
    this.hasInitiative = true;
    this.say('takes the initiative');
    ventureIntoDungeon(this, true);
  }

  /** Rebound: at our upkeep, the cards exiled with rebound are cast again for free, then go to the graveyard. */
  castReboundCards(): void {
    castCardsExiledWithRebound(this);
  }

  onCastInstantOrSorcery(fromGraveyard: boolean): void {
    triggerOnInstantOrSorceryCast(this, fromGraveyard);
  }

  castPerm(card: CardDef, fromCommand = false): boolean {
    return castPermanentSpell(this, card, fromCommand);
  }

  // ================================================================ lands
  /** Does this land enter tapped right now? It checks the card's real condition: lands that always enter tapped;
   *  snarls (a Forest or Island card in hand to reveal); check lands (control a land of those types); fast lands
   *  (two or fewer other lands); slow lands (two or more other lands); battle lands and Sunken Hollow (two or
   *  more basic lands). Evaluate it before the land is on the battlefield; a land in hand doesn't count itself. */
  entersTapped(card: CardDef): boolean {
    return entersTappedByItsText(this, card);
  }

  /** Plays the best land from hand, if we haven't played one this turn. */
  playLand(): void {
    playBestLand(this);
  }

  /** A land entered the battlefield under our control (landfall). gone = it was sacrificed right away (Evolving Wilds). */
  onLandEnter(_permanent: Permanent, _gone: boolean): void {
    landfallOfCommonCards(this);
  }

  // ================================================================ card actions
  flashback(card: CardDef): boolean {
    return castWithFlashback(this, card);
  }

  wishclaw(card: CardDef): boolean {
    return castAndActivateWishclaw(this, card);
  }

  transmute(card: CardDef): boolean {
    return transmuteCard(this, card);
  }

  /** Cycling: pay its cost ("Cycling {2}" in the text; {2} if the text doesn't say), discard it, draw a card. */
  cycle(card: CardDef): boolean {
    return cycleCard(this, card);
  }

  // ================================================================ choosing what to do
  /** Use a ritual only if it lets us cast something good we otherwise can't. (Tested without Treasures: the test
   *  pays for real and restores a snapshot.) */
  /** Is a ritual also worth casting when it lets us make one more smaller play (two creatures instead of one), not only
   *  one play we couldn't pay for? A deck says yes (planner.ts). */
  ritualsEnableSeveralPlays(): boolean {
    return false;
  }

  /** Rise of the Dark Realms: the creature cards in the other players' graveyards come too (a pod; a deck decides how). */
  reanimateFromOtherGraveyards(): void {}

  ritualCandidates(candidates: Candidate[]): Candidate[] {
    return this.withoutExpendableMana(() =>
      ritualCandidatesThatHelp(this, candidates),
    );
  }

  /** Cabal Ritual: {B}{B}{B}, or five with threshold (seven or more cards in the graveyard). */
  cabalMana(): number {
    return this.graveyard.length >= 7 ? 5 : 3;
  }

  /** Drain Power: a goldfish opponent has about one land per turn, and part of them (config.opp_lands_untapped,
   *  rounded down) is still untapped during our turn. */
  drainPowerMana(): number {
    return Math.floor(
      this.turn *
        ((this.config.opp_lands_per_turn as number) ?? 1) *
        ((this.config.opp_lands_untapped as number) ?? 1),
    );
  }

  /** Energy Tap: the untapped creature with the highest mana value that isn't a mana source and isn't about to
   *  attack (a deck can refine this). */
  energyTapTarget(): Permanent | null {
    const permanents = this.battlefield.filter(
      (permanent) =>
        permanent.card.isCreature &&
        !permanent.tapped &&
        !this.manaSourceKind(permanent, true) &&
        this.canTapForEnergy(permanent),
    );
    return permanents.length
      ? firstMax(permanents, (permanent) => permanent.card.manaValue)
      : null;
  }

  canTapForEnergy(permanent: Permanent): boolean {
    return true;
  }

  /** How a ritual from ritualCandidates is cast (a deck may add its cast triggers). */
  castRitual(card: CardDef): boolean {
    return this.castInstantOrSorcery(card);
  }

  orderedCandidates(main2: boolean): Candidate[] {
    const candidates = this.candidates(main2);
    candidates.push(...this.ritualCandidates(candidates));
    sortDesc(candidates, (candidate) => candidate.score);
    moveRockFirst(this, candidates);
    return candidates;
  }

  // ---------------------------------------------------------------- turn planner
  /** Try each option on a copy of the game (library re-shuffled, so no peeking at draws), finish the
   *  turn greedily, and score where it ends up. Returns the best index. */
  plan(options: number[], main2: boolean): number {
    return planBestOption(this, options, main2);
  }

  /** Do the best thing we can pay for, again and again, checking for a kill before each (planner.ts). Returns true
   *  when the game is won. */
  develop(main2 = false): boolean {
    return developTurn(this, main2);
  }

  // ================================================================ turn
  /** The deck's mulligan rule (engine/game/mulligan.ts), or null for the default: keep 2 to 5 lands. */
  mulliganRule(): MulliganRule | null {
    return null;
  }

  /** Draws the opening hand with its mulligans (turn.ts). */
  mulligan(): void {
    drawOpeningHand(this);
  }

  startTurn(): void {
    startOurTurn(this);
  }

  /** Our next turn begins: the turn number moves on, the opponents have each drawn a card, everything untaps, the
   *  pool empties and this turn's flags reset (a new land drop, no spells cast yet). startTurn does it, and so does
   *  copyAtNextTurn for a search. A deck with per-turn state of its own that a search reads resets it here. */
  beginNewTurn(): void {
    beginNextTurn(this);
  }

  /** A quiet copy of the game for a search to play moves on: no log, and it never plays kill lines of its own. */
  copyForSearch(): this {
    const copy = this.clone();
    copy.verbose = false;
    copy.inRollout = true;
    copy.log = [];
    return copy;
  }

  /** copyForSearch at the start of our next turn (beginNewTurn; no upkeep or draw yet). */
  copyAtNextTurn(): this {
    const copy = this.copyForSearch();
    copy.beginNewTurn();
    return copy;
  }

  /** Moves the turn on to `step`. Mana left in the pool is lost (rule 106.4: it empties at the end of each step
   *  and phase). Lost mana usually means the AI wasted it, so the log says so. */
  enterStep(step: TurnStep): void {
    moveToStep(this, step);
  }

  /** Deck hook: something happens at the start of a step (e.g. mana added to the pool). */
  onEnterStep(_step: TurnStep): void {}

  /** The pod calls this at the end of another player's turn (blink.ts). */
  returnBlinkedCardsAtOpponentEndStep(): void {
    returnCardsBlinkedInOpponentTurn(this);
  }

  endTurn(): void {
    returnBlinkedCards(this);
    this.endStep();
    if (this.isCast >= 4 && this.isOnBattlefield('Case of the Ransacked Lab'))
      this.caseSolved = true;
    if (this.hand.length > 7 && !this.hasNoMaximumHandSize())
      this.discard(this.hand.length - 7);
  }

  /** Do we skip the discard to seven at the end of the turn? (A deck adds its own cards.) */
  hasNoMaximumHandSize(): boolean {
    return (
      this.isOnBattlefield('Reliquary Tower') ||
      this.isOnBattlefield('Thought Vessel') ||
      this.isOnBattlefield('Decanter of Endless Water') ||
      this.isOnBattlefield('Graceful Adept')
    );
  }

  /** Before the first turn: the opening hand and mulligans. */
  setup(): void {
    this.isEnergybendingActive = false;
    this.highTidesThisTurn = this.muck = 0;
    this.spellsCast = 0;
    this.mulligan();
    this.say('opening hand', formatList(this.hand.map((card) => card.name)));
    putOpeningHandLeylineOntoBattlefield(this);
  }

  /** One full turn of ours. Returns true when the game ended in it (a win, or we lost). A pod plays the decks' turns in seat order. */
  takeTurn(): boolean {
    return playTurn(this);
  }

  /** develop(), but in a pod a declared win may be answered: then the turn goes on without the card it was stopped at. */
  developWin(main2 = false): boolean {
    return developUntilTheWinStands(this, main2);
  }

  /** The win stands: the copy the kill line was played on becomes the game, with its log and card moves. */
  adoptKillLineCopy(): void {
    adoptKillLineCopyAsTheGame(this);
  }

  /** Play the game. Returns [first turn with any kill, first turn with a kill + counter backup]. */
  play(): [number | null, number | null] {
    this.setup();
    const maxTurn = this.config.max_turn as number;
    while (this.turn < maxTurn) if (this.takeTurn()) break;
    this.logCardMovesSoFar();
    return [this.unprotectedKillTurn, this.protectedKillTurn];
  }

  // ================================================================ deck hooks
  /** The snapshot of this game that the deck's kill search works on. */
  abstract buildKillSearchState(
    nextTurn?: boolean,
    add?: string[],
    remove?: string[],
  ): S;
  /** A de-duplication key of a snapshot (the main kill check skips a search if nothing changed). */
  abstract killSearchStateKey(state: S): string;
  /** The snapshot's mana pool (for the verbose log). */
  killSearchStatePool(_state: S): Record<string, number> {
    return {};
  }
  /** Cheap pre-filter: is a kill conceivable at all? */
  killReachable(_state: S): boolean {
    return true;
  }
  abstract killSearch(): KillSearcher<S>;
  /** Everything the AI may do now. */
  abstract candidates(main2: boolean): Candidate[];
  /** What the AI may cast at instant speed at the end of the opponents' turns (engine/game/instant-speed.ts). */
  opponentsEndStepCandidates(): Candidate[] {
    return [];
  }

  /** How much we want this card in hand (used for discards, scry, tutors, mulligans). */
  cardValue(card: CardDef): number {
    return card.land !== null ? 60 : 30;
  }
  discardValue(card: CardDef): number {
    return this.cardValue(card);
  }
  instantOrSorceryDevValue(_card: CardDef, _fromGraveyard = false): number {
    return 0;
  }
  tutorTarget(
    allowed: (card: CardDef) => boolean,
    _toTop: boolean,
    _spent: string | null = null,
    _rampOk = false,
  ): CardDef | null {
    const candidates = this.library.filter(allowed);
    return candidates.length
      ? firstMax(candidates, (card) => this.cardValue(card))
      : null;
  }
  /** Rough value of a position when no kill is in sight (higher is better). */
  positionValue(): number {
    return 0;
  }
  /** Attack (the default goldfish deals no combat damage). */
  combat(): void {}
  /** Something entered the battlefield (ETB triggers, "whenever a creature enters"). */
  onEnter(permanent: Permanent, _from: Zone): void {
    enterTriggerOfCommonCard(this, permanent);
  }
  /** A permanent of ours left the battlefield: it died, was blinked, or an opponent removed it ("leaves the
   *  battlefield" triggers). It's already off the battlefield. */
  onLeave(_permanent: Permanent): void {}
  /** Which dungeon "venture into the dungeon" enters when we are in none. */
  chooseDungeon(_dungeons: Dungeon[]): string {
    return 'Lost Mine of Phandelver';
  }
  /** Which room to move to (the rooms the current one leads to). Default: the one worth the most. */
  chooseDungeonRoom(rooms: DungeonRoom[]): DungeonRoom {
    return bestRoom(rooms);
  }
  /** How much we want this permanent blinked (its enter trigger again). Only one above 0 is chosen by a blink
   *  spell that picks; a token is never worth it (it would be gone). Decks override it for their own cards. */
  blinkValue(permanent: Permanent): number {
    if (permanent.token) return -1;
    return permanent.card.isCreature ? permanent.card.manaValue : 0;
  }
  /** A creature died (death triggers). It's already off the battlefield (and in the graveyard if a card). */
  onDies(permanent: Permanent): void {
    deathTriggerOfCommonCard(this, permanent);
    if (permanent.card.isCreature) drawWhenCreatureDies(this, permanent);
  }
  /** Extra power / toughness from static effects (e.g. +1/+1 per creature card in the graveyard). */
  powerBonus(permanent: Permanent): number {
    return 0;
  }
  toughnessBonus(permanent: Permanent): number {
    return 0;
  }
  /** At the beginning of our end step (before cleanup). */
  endStep(): void {}
  /** At the beginning of our upkeep (before the draw). */
  upkeep(): void {
    upkeepOfCommonCards(this);
  }
  /** At the beginning of another player's upkeep (for "each upkeep" triggers). Goldfish opponents take their turns
   *  between ours; a pod calls this for real turns. */
  opponentUpkeep(): void {}
  /** At the end step of another player's turn: what we do at instant speed there (sacrifice outlets, "once each turn"
   *  abilities that are fresh again). Goldfish opponents take their turns between ours; a pod calls this for real turns. */
  opponentEndStep(): void {}

  // ================================================================ goldfish combat for creature decks
  /** Can this creature attack now? (A deck may keep some home, e.g. Spore Frog.) */
  canAttack(permanent: Permanent): boolean {
    return (
      permanent.card.isCreature &&
      !permanent.tapped &&
      (!permanent.sick || permanent.card.haste) &&
      this.power(permanent) > 0
    );
  }

  /** A creature that stays home and stops all combat damage to us (Spore Frog), or null. */
  fogBlocker(): Permanent | null {
    return null;
  }

  /** Would this much extra damage win the game? (Default: every opponent dead.) */
  winsWith(damage: number): boolean {
    let left = damage;
    for (let i = 0; i < this.life.length; i++)
      if (this.isOpponentAlive(i)) left -= this.life[i];
    return left >= 0;
  }

  /** Attack triggers, called with the attackers before damage. Returns creatures that join the attack
   *  (e.g. tokens put onto the battlefield tapped and attacking); they count for blocking too. */
  onAttack(_attackers: Permanent[]): Permanent[] {
    return [];
  }

  /** Goldfish combat for creature decks (goldfish-combat.ts): fliers connect, opponents block half of the others,
   *  and the biggest attack that keeps us above config.combat_safety life after crackback; in a pod, arenaCombat. */
  creatureCombat(): void {
    playGoldfishCombat(this);
  }

  /** Can this attacker not be blocked (flying, shadow, "can't be blocked")? Decks override it. */
  evasive(permanent: Permanent): boolean {
    return permanent.card.flying;
  }
  /** After combat damage: the attackers that connected and the total damage dealt. */
  onCombatDamage(_connected: Permanent[], _damage: number): void {}

  // ================================================================ hooks for pod games (game.ts fills them in)
  // A goldfish game has no other players, so these do nothing. Game (game.ts) overrides them with the pod rules.
  /** Are we the real game of a player in a pod (not a planner copy, not a goldfish game)? */
  inArena(): boolean {
    return false;
  }
  /** We found a kill without counter backup: go for it now? (a pod's policy may say wait) */
  podAllowsKill(): boolean {
    return true;
  }
  /** We cast this spell: does an opponent counter it? */
  podCounters(_card: CardDef): boolean {
    return false;
  }
  /** We take the initiative: in a pod, every other player loses it. */
  podTakeInitiative(): void {}
  /** Dungeon rooms that only hit an opponent's creature (a pod only: a goldfish game has no one to target). */
  podGoadBestCreature(): void {}
  podWeakenBestCreature(_powerLoss: number): void {}
  podStopBestCreatureAttackingUs(): void {}
  /** -X/-X until end of turn to the opponents' creatures (ours too if `includeOwn`), a pod only. */
  podShrinkCreatures(
    _amount: number,
    _includeOwn: boolean,
    _except: Permanent | null,
    _sourceName: string,
  ): void {}
  /** How many opposing creatures a -X/-X would kill now (0 in a goldfish game). */
  podCreaturesShrinkWouldKill(_amount: number): number {
    return 0;
  }
  /** We cast this spell: tell the opponents, so their "whenever an opponent casts a spell" cards trigger (before
   *  any counterspell, as the trigger goes on the stack above the spell). */
  podAnnounceCast(_card: CardDef): void {}
  /** A creature of ours died: tell the other players, so their "whenever another creature dies" cards trigger. */
  podAnnounceDeath(_permanent: Permanent): void {}
  /** A creature of another player died (a pod only): Syr Konrad, Sangromancer. A deck overrides it. */
  onOtherPlayersCreatureDies(_permanent: Permanent): void {}
  /** Creatures attack us (a pod, after the attacker's removal answers): "whenever a creature attacks you" (Thantis). */
  onAttackedBy(_attackerCount: number): void {}
  /** An opponent cast this spell: run our triggers for it (see opponent-cast-triggers.ts). A deck may add its own. */
  onOpponentCast(spell: CardDef, caster: GameCore<unknown>): void {
    triggerOnOpponentCast(this, caster, spell);
  }
  /** We declared a win: do the others answer it (true = it was stopped)? */
  podAnswersWin(): boolean {
    return false;
  }
  /** Mana to leave untapped on our own turn for an instant-speed answer. */
  podReserve(): number {
    return 0;
  }
  /** A pod, after our second main phase: cast creatures as blockers if needed. */
  podDefence(): void {}
  /** After our combat: creatures that must attack and weren't sent attack now (a pod; goldfish games have none). */
  attackWithForcedCreatures(): void {}
  /** Pod combat for a group of our creatures: choose the opponent and the attackers, attack, deal the damage. */
  arenaCombat(
    _pool: Permanent[],
    _power?: (permanent: Permanent) => number,
    _toughness?: (permanent: Permanent) => number,
  ): void {}
  /** The steps of the kill the search found (Gale), for winAttempt(). */
  lastKillLine: string[] = [];
  /** The copy of the game the found kill line was played on, waiting to become the game when the win stands. */
  killLineCopy: this | null = null;
  /** The log's length when that copy was made (the copy's own lines come after it). */
  killLineLogLength = 0;
  /** Kill lines the search found that the real game could not play (a step could not be paid, or the end fell short). */
  killMisses = 0;
  /** Kill lines that only win on average and fell short with the real cards. */
  killChanceFails = 0;
  /** True while a found kill line is played (kill-line.ts): a deck may then choose the way its search chose. */
  isPlayingKillLine = false;
  /** While a kill line is played: which of the deck's tapping orders is tried (0 = the first). */
  killLineTappingOrder = 0;
  /** How many tapping orders a failed kill line is tried with (a deck reads killLineTappingOrder in avoidsSource
   *  and rankAdjust). */
  killLineTappingOrders(): number {
    return 1;
  }
  /** While a kill line is played: the cards it names. A discard (Frantic Search draws and discards) keeps them. */
  cardsTheKillLineNeeds = new Set<string>();
  /** Does this deck play its kill lines for real (playKillStep)? Otherwise the search's answer is the win. */
  playsKillLines(): boolean {
    return false;
  }
  /** Plays one step of a found kill line in this game. Returns null when done, or why it could not be done. */
  playKillStep(step: KillStep): string | null {
    return `the deck cannot play a "${step.kind}" step`;
  }
  /** Times we found a kill and didn't go for it (no counter backup, the deck's policy said wait). */
  podWaits = 0;
  /** Untapped mana sources. */
  openMana(): number {
    let count = 0;
    for (const permanent of this.battlefield)
      if (!permanent.tapped && this.manaSourceKind(permanent)) count++;
    return count;
  }

  /** Combat damage we'll take on the opponents' turns (applied at our next upkeep). */
  pendingCrackback = 0;
  /** We attacked relying on the fog blocker: it must be used (sacrificed) before our next turn. */
  fogUsed = false;
  onToGraveyard(_card: CardDef): void {}
  /** Replacement effects on a draw (e.g. look at the top cards first). */
  beforeDraw(): void {}
  /** A land taken from the library enters the battlefield, and the library is shuffled (engine/game/land-search.ts).
   *  By default shuffled first, so landfall draws come from the shuffled library. */
  putSearchedLand(land: CardDef, tapped: boolean): void {
    this.shuffle();
    const permanent = new Permanent(land, land.land, tapped);
    permanent.sick = false;
    this.putOntoBattlefield(permanent);
    this.onLandEnter(permanent, false);
  }
  /** Which land a land-search spell takes from these (engine/game/land-search.ts). By default the one that makes
   *  the deck's colour we have the fewest lands for. */
  chooseLandToFetch(candidates: CardDef[], _toHand: boolean): CardDef {
    const landsMaking = (colour: string) =>
      this.landsOnBattlefield().filter((permanent) =>
        C.landMakes(permanent.card, colour),
      ).length;
    const fewest = Math.min(...this.colors.map(landsMaking));
    const shortColours = this.colors.filter(
      (colour) => landsMaking(colour) === fewest,
    );
    return firstMax(
      candidates,
      (card) =>
        shortColours.filter((colour) => C.landMakes(card, colour)).length,
    );
  }
  /** The creature type named for Roaming Throne (engine/game/trigger-doublers.ts), or null. */
  roamingThroneType(): string | null {
    return null;
  }
  /** How much we want this card back from the graveyard to the hand (Eternal Witness). */
  returnToHandValue(card: CardDef): number {
    return this.cardValue(card);
  }
  /** Do we cast this free copy (Mizzix's Mastery: "you may cast the copy")? A deck says no to a copy that would hurt
   *  it (a Windfall that throws away the hand). */
  wantsToCastCopy(_card: CardDef): boolean {
    return true;
  }
  /** How much we want this creature back from the graveyard (reanimation spells). */
  reanimationValue(card: CardDef): number {
    return this.cardValue(card);
  }
  /** Effects of cards the engine doesn't know. */
  resolveOther(
    _card: CardDef,
    _fromGraveyard: boolean,
    _mode: string | null,
  ): void {}
  /** "Whenever you cast" triggers that resolve before the spell (e.g. Gale's recast). */
  castTriggers(
    _card: CardDef,
    _fromGraveyard: boolean,
    _trig: Record<string, unknown>,
  ): void {}
  /** Commander tax: {2} more for each earlier cast from the command zone. */
  commanderCost(card: CardDef, cost: Cost): Cost {
    const castCount = this.commandCasts.filter((x) => x === card.name).length;
    return castCount ? cost.withGeneric(cost.generic + 2 * castCount) : cost;
  }
  /** We cast a commander from the command zone (castPerm has already added it to commandCasts). */
  onCommanderCast(_card: CardDef): void {}
  /** The commanders we cast from the command zone this game, one entry per cast (castPerm adds them). */
  commandCasts: string[] = [];
  /** [how much we want to cast c, its cost], to decide if a tapped land costs us mana now. */
  landWant(card: CardDef): [number, Cost] {
    return [30, this.effectiveCost(card)];
  }
  landBias(_card: CardDef): number {
    return 0;
  }

  /** Per-game numbers a deck wants to report next to the win turn (see Deck.diagMetrics); read after play(). */
  diag(): Record<string, number | null> {
    return {};
  }

  // hooks for the log analyzer
  /** How the analyzer names a line that only wins with some probability. */
  chanceName = 'chain';
  syncFromLog(_board: LogBoardView): void {}
  /** What a token in an Archidekt log is (its name as the player typed it), or null to leave it out. */
  logToken(_name: string): CardDef | null {
    return null;
  }
  addManaToKillSearchState(_state: S, _n: number): void {}
  addLandToKillSearchState(_state: S): void {}
}
