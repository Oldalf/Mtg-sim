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
import { LandInfo } from '../cards/card-facts';
import { ELDRAZI_SPAWN, TREASURE } from '../cards/tokens';
import { Rng } from '../util/rng';
import { MulliganRule, DEFAULT_MULLIGAN, keepsHand } from './mulligan';
import { formatLogPart, formatList, formatPool } from './log-format';
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
  describeKillStep,
  emptyPool,
} from './game-types';
import { playKillLineOnCopy } from './kill-line';
import { BlinkedCard, resolveBlinkSpell, returnBlinkedCards } from './blink';
import {
  Dungeon,
  DungeonPosition,
  DungeonRoom,
  bestRoom,
  ventureIntoDungeon,
} from './dungeons';
import { PaymentRecord, UNTAP, isSourceOfClass } from './search-mana';
import { triggerOnOpponentCast } from './opponent-cast-triggers';
import { enterTriggerCount } from './trigger-doublers';
import { castInstantOrSorceryTriggers } from './spell-copies';
import { addFirebendingMana } from './firebending';
import {
  deathTriggerOfCommonCard,
  enterTriggerOfCommonCard,
  upkeepOfCommonCards,
} from './common-permanents';
import { resolveLandSearch } from './land-search';
import { reanimateAsAuraEnters, resolveReanimationSpell } from './reanimation';
import {
  couldOtherOrderHelp,
  couldPayAtAll,
  manaAdded,
  payBySearch,
} from './payment-search';

const COLOURS: readonly string[] = ['W', 'U', 'B', 'R', 'G'];
const BASIC_OF: Record<string, string> = {
  W: 'Plains',
  U: 'Island',
  B: 'Swamp',
  R: 'Mountain',
  G: 'Forest',
};
/** The pool, which permanents are tapped, and how many payments the log has noted (an undone payment is not logged). */
type Snap = [ManaPool, boolean[], number];
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

/** How good a land that makes this kind of mana is to play (A = any colour, UB = blue and black, F = fetch land). */
const LAND_MANA_SCORE: Record<string, number> = {
  A: 6,
  UB: 7,
  F: 4,
  U: 5,
  B: 5,
  G: 5,
  W: 5,
  R: 5,
  C: 3,
  '': 4,
};

/** A land card's land side (a modal double-faced card has it on the back). */
const landInfoOf = (card: CardDef): LandInfo => (card.land ?? card.mdfcLand)!;

/** Which mana source to tap first for what we're short of (a colour, H = hybrid, N = generic). */
const RANK: Record<string, Record<string, number>> = {
  U: { U: 0, UB: 1, A: 2, F: 3, FGU: 3 },
  B: { B: 0, UB: 1, A: 2, F: 3 },
  W: { W: 0, A: 2 },
  R: { R: 0, A: 2 },
  G: { G: 0, A: 2, FGU: 3 },
  H: { U: 0, B: 0, UB: 1, A: 2, F: 3 },
  N: {
    S: 0,
    C2: 1,
    C: 2,
    B: 3,
    U: 4,
    G: 4,
    W: 4,
    R: 4,
    UB: 5,
    A: 6,
    F: 7,
    FGU: 7,
  },
};

/** Ranks for source kinds not in RANK: a two-colour land ("G/W"), n colourless ("C3"), {G}{U} ("GU"). */
function extraRank(short: string, sourceKind: string): number | null {
  if (sourceKind.length === 3 && sourceKind[1] === '/') {
    if (short === 'N') return 5.5;
    if (short === 'H')
      return sourceKind.includes('U') || sourceKind.includes('B') ? 1.5 : null;
    return sourceKind.includes(short) ? 1 : null;
  }
  if (/^[WUBRG](\/[WUBRG]){2}$/.test(sourceKind)) {
    // a three-colour land ("W/U/B")
    if (short === 'N') return 5.6;
    if (short === 'H')
      return sourceKind.includes('U') || sourceKind.includes('B') ? 1.6 : null;
    return sourceKind.includes(short) ? 1.2 : null;
  }
  if (/^C\d+$/.test(sourceKind)) return short === 'N' ? 0.5 : null;
  if (sourceKind === 'GU')
    return short === 'G' || short === 'U' ? 1 : short === 'N' ? 5 : null; // Simic Growth Chamber: both
  return null;
}

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

  instantOrSorceryCostReduction(): number {
    let reduction = 0;
    for (const permanent of this.battlefield) {
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

  // ================================================================ mana
  manaSourceKind(permanent: Permanent, ignoreSick = false): string | null {
    if (permanent.card === TREASURE)
      return this.isKeepingExpendableManaBack ? null : 'A';
    if (permanent.card === ELDRAZI_SPAWN)
      return this.isKeepingExpendableManaBack ? null : 'C';
    if (permanent.land !== null) {
      // Energybending: every land is also an Island and a Swamp, so it taps for either colour
      if (this.isEnergybendingActive && permanent.land.mana) return 'A';
      // "Activate only if you control a Swamp" (Tainted Wood): colourless without one
      const need = permanent.land.colourIf;
      if (
        need &&
        !this.battlefield.some(
          (otherPermanent) =>
            otherPermanent !== permanent &&
            otherPermanent.land !== null &&
            (otherPermanent.land as unknown as Record<string, boolean>)[need],
        )
      )
        return 'C';
      const landMana = permanent.land.mana;
      if (landMana.length === 3 && landMana[1] === '/')
        return this.colors.length <= 2 ? 'A' : landMana; // a two-colour land
      return landMana || null;
    }
    if (permanent.card.name === "Sarevok's Tome" && this.hasInitiative)
      return 'C2';
    if (permanent.card.rock) return permanent.card.rock;
    if (
      permanent.card.name === 'Curious Homunculus' &&
      !permanent.transformed &&
      (ignoreSick || !permanent.sick)
    )
      return 'S';
    const manaCreatureKind = Facts.MANA_CREATURES[permanent.card.name];
    if (manaCreatureKind && (ignoreSick || !permanent.sick))
      return manaCreatureKind;
    return null;
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
    const poolLeft = mutate ? this.pool : { ...this.pool };
    if (poolLeft.U < cost.blue) return 'U';
    poolLeft.U -= cost.blue;
    if (poolLeft.B < cost.black) return 'B';
    poolLeft.B -= cost.black;
    if (poolLeft.G < cost.green) return 'G';
    poolLeft.G -= cost.green;
    if (poolLeft.W < cost.white) return 'W';
    poolLeft.W -= cost.white;
    if (poolLeft.R < cost.red) return 'R';
    poolLeft.R -= cost.red;
    for (let hybridPip = 0; hybridPip < cost.hybrid; hybridPip++) {
      if (poolLeft.U >= poolLeft.B && poolLeft.U > 0) poolLeft.U -= 1;
      else if (poolLeft.B > 0) poolLeft.B -= 1;
      else return 'H';
    }
    let genericLeft = cost.generic;
    const order: (keyof ManaPool)[] = [
      ...(isInstantOrSorcery ? ['S' as const] : []),
      'C',
      ...(poolLeft.B >= poolLeft.U
        ? (['B', 'U'] as const)
        : (['U', 'B'] as const)),
      'G',
      'W',
      'R',
    ];
    for (const manaType of order) {
      const spent = Math.min(poolLeft[manaType], genericLeft);
      poolLeft[manaType] -= spent;
      genericLeft -= spent;
    }
    return genericLeft > 0 ? 'N' : null;
  }

  /** Which source to tap first for a generic cost (N) can be adjusted by a deck: lower = tapped first. */
  rankAdjust(_short: string, _kind: string, rank: number): number {
    return rank;
  }

  /** While a kill line is played (kill-line.ts): how much later than its rank a source is tapped. A source the deck
   *  keeps back (avoidsSource) comes last; with one of the shuffled tapping orders (after the deck's own) each source
   *  gets a fixed small change (0 to 4), the same for the same order, source and need. */
  private killLineRankChange(permanent: Permanent, short: string): number {
    let change = this.avoidsSource(permanent) ? 10 : 0;
    const shuffledOrder =
      this.killLineTappingOrder - this.killLineTappingOrders() + 1;
    if (shuffledOrder > 0) {
      const sourceIndex = this.battlefield.indexOf(permanent);
      const hash =
        (shuffledOrder * 7919 +
          sourceIndex * 104729 +
          short.charCodeAt(0) * 31) %
        1000;
      change += hash / 250;
    }
    return change;
  }

  /** While a kill line is played, a deck may keep a source for later: it is tapped only when no other will do. */
  avoidsSource(_permanent: Permanent): boolean {
    return false;
  }

  private pick(short: string, isInstantOrSorcery: boolean): Permanent | null {
    const rank = RANK[short];
    let best: Permanent | null = null,
      bestRank = 99;
    // what can feed a filter source: not the colour we are short of (it would only trade it for itself)
    const feed =
      this.pool.C +
      (short === 'U' ? 0 : this.pool.U) +
      (short === 'B' ? 0 : this.pool.B) +
      (short === 'G' ? 0 : this.pool.G);
    for (const permanent of this.battlefield) {
      if (permanent.tapped) continue;
      const sourceKind = this.manaSourceKind(permanent);
      if (sourceKind === null) continue;
      if (!(sourceKind in rank)) {
        let fallbackRank = extraRank(short, sourceKind);
        if (fallbackRank === null) continue;
        if (this.isPlayingKillLine)
          fallbackRank += this.killLineRankChange(permanent, short);
        if (fallbackRank < bestRank) {
          best = permanent;
          bestRank = fallbackRank;
        }
        continue;
      }
      if (sourceKind === 'S' && !isInstantOrSorcery) continue;
      if (Facts.isFilterKind(sourceKind) && feed < 1) continue;
      let adjustedRank = this.rankAdjust(short, sourceKind, rank[sourceKind]);
      if (this.isPlayingKillLine)
        adjustedRank += this.killLineRankChange(permanent, short);
      if (
        this.highTidesThisTurn &&
        this.islandTyped(permanent) &&
        (short === 'U' || short === 'N' || short === 'H')
      )
        adjustedRank -= 0.5;
      if (adjustedRank < bestRank) {
        best = permanent;
        bestRank = adjustedRank;
      }
    }
    return best;
  }

  /** A pain land: the colour we need costs 1 life, {C} (for generic costs) is free. The engine taps lands to test a
   *  payment and then undoes it, so the damage is only counted here (painTaps) and dealt when pay() commits. */
  private tapPain(permanent: Permanent, short: string): void {
    permanent.tapped = true;
    const land = permanent.land!;
    const pain = land.pain ?? '';
    const makes = (colour: string) => C.landMakes(permanent.card, colour);
    let colour: string | null = null;
    if (COLOURS.includes(short) && makes(short)) colour = short;
    else if (short === 'H') colour = ['U', 'B'].find(makes) ?? null;
    else {
      // a generic cost: colourless if the land can, else a colour that costs no life, else any
      if (land.colourless) {
        this.pool.C += 1;
        return;
      }
      colour =
        this.colors.find((colour) => makes(colour) && !pain.includes(colour)) ??
        this.colors.find(makes) ??
        null;
    }
    if (colour === null) {
      this.pool.C += 1;
      return;
    }
    this.pool[colour as keyof ManaPool] += 1;
    if (pain.includes(colour)) this.painTaps += 1;
  }

  tap(permanent: Permanent, short: string): void {
    if (permanent.land?.pain) {
      this.tapPain(permanent, short);
      return;
    }
    const sourceKind = this.manaSourceKind(permanent);
    permanent.tapped = true;
    const pool = this.pool;
    if (sourceKind === 'U') pool.U += 1;
    else if (sourceKind === 'B') pool.B += 1;
    else if (sourceKind === 'G') pool.G += 1;
    else if (sourceKind === 'W') pool.W += 1;
    else if (sourceKind === 'R') pool.R += 1;
    else if (sourceKind === 'A') {
      // either of the deck's colours: the one we're short of; for generic, black if the deck plays it
      if (COLOURS.includes(short)) pool[short as keyof ManaPool] += 1;
      else if (short === 'N')
        pool[
          (this.colors.includes('B') ? 'B' : this.colors[0]) as keyof ManaPool
        ] += 1;
      else
        pool[
          (this.colors.includes('U') ? 'U' : this.colors[0]) as keyof ManaPool
        ] += 1;
    } else if (sourceKind === 'UB') {
      pool.U += 1;
      pool.B += 1;
    } else if (sourceKind === 'GU') {
      pool.G += 1;
      pool.U += 1;
    } else if (sourceKind === 'C') pool.C += 1;
    else if (sourceKind === 'C2') pool.C += 2;
    else if (sourceKind !== null && /^C\d+$/.test(sourceKind))
      pool.C += parseInt(sourceKind.slice(1), 10);
    else if (sourceKind !== null && sourceKind.includes('/')) {
      // a two- or three-colour land ("G/W", "W/U/B"): the colour we're short of if it makes it, else its first colour
      const colour =
        sourceKind.includes(short) && COLOURS.includes(short)
          ? short
          : short === 'H' && sourceKind.includes('B')
            ? 'B'
            : sourceKind[0];
      pool[colour as keyof ManaPool] += 1;
    } else if (sourceKind === 'S') pool.S += 1;
    else if (sourceKind !== null && Facts.isFilterKind(sourceKind)) {
      // it is fed a mana from the pool: colourless first, never the colour we are short of if another will do
      const [firstColour, secondColour] = Facts.FILTER_COLOURS[sourceKind];
      const feedOrder =
        short === secondColour
          ? (['C', firstColour, secondColour] as const)
          : (['C', secondColour, firstColour] as const);
      for (const manaType of feedOrder)
        if (pool[manaType as keyof ManaPool] > 0) {
          pool[manaType as keyof ManaPool] -= 1;
          break;
        }
      pool[firstColour as keyof ManaPool] += 1;
      pool[secondColour as keyof ManaPool] += 1;
    }
    if (permanent.land !== null) {
      if (this.highTidesThisTurn && this.islandTyped(permanent))
        pool.U += this.highTidesThisTurn;
      if (this.muck && this.swampTyped(permanent)) pool.B += this.muck;
    }
  }

  takeSnapshot(): Snap {
    return [
      { ...this.pool },
      this.battlefield.map((permanent) => permanent.tapped),
      this.paymentsForLog.length,
    ];
  }

  restore(snapshot: Snap): void {
    this.pool = { ...snapshot[0] };
    this.paymentsForLog.length = Math.min(
      this.paymentsForLog.length,
      snapshot[2],
    );
    const permanentCount = Math.min(
      this.battlefield.length,
      snapshot[1].length,
    );
    for (let i = 0; i < permanentCount; i++)
      this.battlefield[i].tapped = snapshot[1][i];
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

  /** Pays a cost (payFromSources). Treasures and Eldrazi Spawn are spent last: only when lands, rocks and mana
   *  creatures are not enough. A committed payment sacrifices the ones it tapped; a tested one keeps them. */
  pay(cost: Cost, isInstantOrSorcery = false, commit = true): boolean {
    if (
      this.isKeepingExpendableManaBack ||
      !this.battlefield.some(
        (permanent) =>
          !permanent.tapped && this.isExpendableManaSource(permanent),
      )
    )
      return this.payFromSources(cost, isInstantOrSorcery, commit);
    const plannedPaymentsBefore = this.plannedPayments.slice();
    const isPaidWithoutThem = this.withoutExpendableMana(() =>
      this.payFromSources(cost, isInstantOrSorcery, commit),
    );
    if (isPaidWithoutThem) return true;
    this.plannedPayments = plannedPaymentsBefore; // the failed try used up this cost's plan
    const untappedBefore = this.battlefield.filter(
      (permanent) =>
        !permanent.tapped && this.isExpendableManaSource(permanent),
    );
    if (!this.payFromSources(cost, isInstantOrSorcery, commit)) return false;
    if (commit)
      for (const source of untappedBefore)
        if (source.tapped) this.sacrifice(source);
    return true;
  }

  /** Pays a cost: taps sources one by one into the pool (rules 601.2g-h, 605), then pays from the pool. The greedy
   *  order comes first (the best source for what we are short of); if it fails while the sources could pay at all,
   *  payment-search.ts tries other orders and colours. commit = false only tests it (everything is undone). */
  private payFromSources(
    cost: Cost,
    isInstantOrSorcery: boolean,
    commit: boolean,
  ): boolean {
    // undo = untap what this payment tapped and restore the pool (cheaper than a snapshot of a big board)
    const poolBefore = { ...this.pool };
    const tapped: Permanent[] = [];
    const made: string[] = [];
    const undo = () => {
      this.pool = poolBefore;
      for (const permanent of tapped) permanent.tapped = false;
      tapped.length = 0;
      made.length = 0;
      this.painTaps = 0;
    };
    this.painTaps = 0;
    const shortAtTheEnd = this.payGreedily(
      cost,
      isInstantOrSorcery,
      tapped,
      made,
      commit,
    );
    let isPaid = shortAtTheEnd === null;
    // Another order can only help when a source the greedy order tapped could have made the colour still missing
    // (short of generic mana, it has tapped every source it could).
    if (
      !isPaid &&
      shortAtTheEnd !== 'N' &&
      couldOtherOrderHelp(this, tapped, shortAtTheEnd!)
    ) {
      undo();
      this.pool = { ...poolBefore }; // the search changes the pool: keep poolBefore as it was
      isPaid =
        couldPayAtAll(this, cost, isInstantOrSorcery) &&
        payBySearch(this, cost, isInstantOrSorcery, tapped, made);
    }
    if (!isPaid) {
      undo();
      return false;
    }
    this.short(cost, isInstantOrSorcery, true);
    if (!commit) undo();
    else {
      this.spent += cost.manaValue;
      if (this.painTaps) this.loseLife(this.painTaps);
      this.lastPayment = tapped.map((source, i) => ({
        source,
        made: made[i],
      }));
      if (this.verbose)
        for (const part of this.lastPayment)
          this.paymentsForLog.push({
            card: part.source.card.logName,
            made: part.made,
          });
    }
    this.painTaps = 0;
    return true;
  }

  /** The greedy order: tap the best source for what we are short of until the pool holds the cost. Returns null when
   *  it does, else what it is still short of. What each source made is only noted for a payment that commits (the
   *  log reads it). */
  private payGreedily(
    cost: Cost,
    isInstantOrSorcery: boolean,
    tapped: Permanent[],
    made: string[],
    commit: boolean,
  ): string | null {
    const plannedSources = commit ? this.sourcesPlannedFor(cost) : [];
    for (;;) {
      const short = this.short(cost, isInstantOrSorcery);
      if (short === null) return null;
      let plannedSource: Permanent | undefined;
      while (plannedSources.length && !plannedSource) {
        const candidate = plannedSources.shift()!;
        if (!candidate.tapped) plannedSource = candidate;
      }
      const source =
        plannedSource ??
        this.pick(short, isInstantOrSorcery) ??
        this.filterSignetFeeder(short, isInstantOrSorcery);
      if (source === null) return short;
      if (commit) {
        const poolBefore = { ...this.pool };
        this.tap(source, short);
        made.push(manaAdded(poolBefore, this.pool));
      } else this.tap(source, short);
      tapped.push(source);
    }
  }

  /** A search that planned this payment (a kill line it paid for) names the sources to tap first, in order.
   *  Only the greedy order uses them; what is still short is paid the usual way. */
  sourcesPlannedFor(cost: Cost): Permanent[] {
    const index = this.plannedPayments.findIndex(
      (payment) => payment.cost === `${cost}`,
    );
    if (index < 0) return [];
    const [payment] = this.plannedPayments.splice(index, 1);
    const sources: Permanent[] = [];
    for (const landClass of payment.taps) {
      const source = this.battlefield.find(
        (permanent) =>
          !permanent.tapped &&
          !sources.includes(permanent) &&
          isSourceOfClass(this, permanent, landClass),
      );
      if (source) sources.push(source);
    }
    return sources;
  }

  /** What a search planned for the step being played: the sources it tapped for each cost, in order, and the lands
   *  an untap effect untapped (engine/game/search-mana.ts). A deck sets it for a step and clears it after. */
  plannedPayments: PaymentRecord[] = [];

  /** What the last committed payment tapped, and what each source added to the pool ("U", "UB"). */
  lastPayment: { source: Permanent; made: string }[] = [];

  /** Nothing can make what we are short of, but an untapped filter Signet could (it turns {1} into {U}{B}) if a mana
   *  were in the pool to feed it: the source to tap for that mana (as for a generic cost), or null. */
  private filterSignetFeeder(
    short: string,
    isInstantOrSorcery: boolean,
  ): Permanent | null {
    if (!['U', 'B', 'G', 'H', 'N'].includes(short)) return null;
    const canMakeShort = (kind: string) =>
      short === 'H' || short === 'N'
        ? kind === 'F'
        : Facts.FILTER_COLOURS[kind].includes(short);
    const hasUntappedFilterSignet = this.battlefield.some((permanent) => {
      const kind = this.manaSourceKind(permanent);
      return (
        !permanent.tapped &&
        kind !== null &&
        Facts.isFilterKind(kind) &&
        canMakeShort(kind)
      );
    });
    return hasUntappedFilterSignet ? this.pick('N', isInstantOrSorcery) : null;
  }

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

  checkKill(): number {
    if (
      this.protectedKillTurn !== null ||
      (this.mode === 'any' && this.unprotectedKillTurn !== null)
    )
      return 2;
    const killState = this.buildKillSearchState();
    const stateKey = this.killSearchStateKey(killState);
    if (stateKey === this.lastKey) return 0;
    this.lastKey = stateKey;
    if (!this.killReachable(killState)) return 0;
    const search = this.killSearch();
    let killLevel = search.search(
      killState,
      this.config.search_budget as number,
    );
    const isNewKill = this.unprotectedKillTurn === null || killLevel === 2;
    if (killLevel >= 1 && this.verbose && isNewKill) {
      this.say(
        `--- state: mana ${formatPool(this.killSearchStatePool(this.buildKillSearchState()))}, hand ${formatList(this.hand.map((card) => card.name))}`,
      );
      this.say(
        `--- battlefield ${formatList(this.battlefield.filter((permanent) => permanent.land === null).map((permanent) => permanent.name))}, ` +
          `lands ${this.landsOnBattlefield().length}, graveyard ${formatList(this.graveyard.map((card) => card.name))}`,
      );
      for (const step of search.lastLine ?? [])
        this.say('      > ' + describeKillStep(step));
    }
    this.killLineCopy = null;
    if (
      killLevel >= 1 &&
      isNewKill &&
      this.playsKillLines() &&
      !this.inRollout
    ) {
      // the line is played for real on a copy; it only counts if it wins there
      this.killLineLogLength = this.log.length;
      this.killLineCopy = playKillLineOnCopy(
        this,
        search.lastLine ?? [],
        search.lastLineProbability !== null,
      );
      if (this.killLineCopy === null) killLevel = 0;
    }
    if (killLevel >= 1)
      this.lastKillLine = (search.lastLine ?? []).map(describeKillStep);
    if (killLevel >= 1 && this.unprotectedKillTurn === null)
      this.unprotectedKillTurn = this.turn;
    if (killLevel === 2) this.protectedKillTurn = this.turn;
    this.killNow = killLevel >= 1;
    if (
      killLevel === 2 ||
      (killLevel === 1 && this.mode === 'any' && this.podAllowsKill())
    ) {
      // with a played line, the win is logged after its plays (on the copy that becomes the game)
      (this.killLineCopy ?? this).sayEvent(
        'win',
        'KILL -> WIN' +
          (killLevel === 2 ? ' (with counter backup)' : ' (no counter backup)'),
      );
      return 2;
    }
    this.killLineCopy = null;
    if (killLevel === 1) {
      this.podWaits++;
      this.sayHighlight(
        'kill available but no counter backup: keep the kill intact and look for protection',
      );
    }
    return killLevel;
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

  draw(count = 1): void {
    for (let i = 0; i < count; i++) {
      if (!this.library.length) return;
      this.beforeDraw();
      this.firstDrawDone = true;
      this.putCard(this.takeTopCardsOfLibrary(1)[0], 'hand');
    }
  }

  discard(count: number): void {
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
    if (this.resolveCardSelection(card, fromGraveyard)) return;
    if (this.resolveManaOrTutor(card, mode)) return;
    if (resolveLandSearch(this, card)) return;
    if (resolveReanimationSpell(this, card)) return;
    if (resolveBlinkSpell(this, card)) return;
    this.resolveOther(card, fromGraveyard, mode);
  }

  /** Draw, scry and "look at the top cards" spells. Returns false if this isn't one of them. */
  private resolveCardSelection(
    otherCard: CardDef,
    fromGraveyard: boolean,
  ): boolean {
    switch (otherCard.name) {
      case 'Brainstorm': {
        this.draw(3);
        for (let i = 0; i < Math.min(2, this.hand.length); i++) {
          const card = firstMin(this.hand, (anotherCard) =>
            this.cardValue(anotherCard),
          );
          this.takeCard(card, 'hand');
          this.putCardsOnTopOfLibrary([card]);
        }
        return true;
      }
      case 'Consider':
        this.scry(1, true);
        this.draw(1);
        return true;
      case 'Opt':
        this.scry(1);
        this.draw(1);
        return true;
      case 'Chart a Course':
        this.draw(2);
        if (!this.attacked) this.discard(1);
        return true;
      case 'Read the Bones':
        this.scry(2);
        this.draw(2);
        this.myLife -= 2;
        return true;
      case 'Pieces of the Puzzle':
      case 'Fact or Fiction':
        this.resolveTopFiveSplit(otherCard.name);
        return true;
      case 'Ponder':
        this.ponder();
        return true;
      case 'Preordain':
        this.scry(2);
        this.draw(1);
        return true;
      case 'Deep Analysis':
      case "Night's Whisper":
      case "Archmage's Charm":
        this.draw(2);
        return true;
      case 'Diresight':
        this.scry(2, true);
        this.draw(2);
        return true;
      case 'Stock Up':
        this.stockUp();
        return true;
      case 'See the Truth':
        this.seeTheTruth(fromGraveyard);
        return true;
      case 'Energybending':
        this.isEnergybendingActive = true;
        this.draw(1);
        return true;
      case 'Focus the Mind':
        this.draw(3);
        this.discard(1);
        return true;
      case 'Frantic Search':
        this.draw(2);
        this.discard(2);
        this.untapLands(3);
        return true;
      default:
        return false;
    }
  }

  /** Look at the top three: shuffle them away if none is good, otherwise put them back best first. Then draw. */
  private ponder(): void {
    const top = this.library.slice(0, 3);
    if (top.length && Math.max(...top.map((card) => this.cardValue(card))) < 40)
      this.shuffle();
    else {
      this.takeTopCardsOfLibrary(3);
      sortDesc(top, (card) => this.cardValue(card));
      this.putCardsOnTopOfLibrary(top);
    }
    this.draw(1);
  }

  /** Take the two best of the top five; the rest go to the bottom. */
  private stockUp(): void {
    const top = this.takeTopCardsOfLibrary(5);
    sortDesc(top, (card) => this.cardValue(card));
    for (const card of top.slice(0, 2)) this.putCard(card, 'hand');
    for (const card of top.slice(2)) this.putCard(card, 'library');
  }

  /** Look at the top three: from the graveyard all go to hand, otherwise the best one does and the rest go to the bottom. */
  private seeTheTruth(fromGraveyard: boolean): void {
    const top = this.takeTopCardsOfLibrary(3);
    if (fromGraveyard || !top.length)
      for (const card of top) this.putCard(card, 'hand');
    else {
      sortDesc(top, (card) => this.cardValue(card));
      this.putCard(top[0], 'hand');
      for (const card of top.slice(1)) this.putCard(card, 'library');
    }
  }

  /** Looks at the top five cards and keeps some in hand, the rest go to the graveyard. */
  private resolveTopFiveSplit(
    spell: 'Pieces of the Puzzle' | 'Fact or Fiction',
  ): void {
    const top = this.takeTopCardsOfLibrary(5);
    let keep: CardDef[];
    if (spell === 'Pieces of the Puzzle') {
      // up to two instants/sorceries to hand, the rest to the graveyard
      keep = sortDesc(
        top.filter((card) => card.isInstantOrSorcery),
        (card) => this.cardValue(card),
      ).slice(0, 2);
    } else {
      // opponent splits: the best card alone vs the other four
      sortDesc(top, (card) => this.cardValue(card));
      const rest = top.slice(1);
      keep =
        top.length &&
        this.cardValue(top[0]) >
          rest.reduce((total, card) => total + this.cardValue(card), 0) * 0.6
          ? top.slice(0, 1)
          : rest;
    }
    for (const card of top) {
      if (keep.includes(card)) this.putCard(card, 'hand');
      else this.toGraveyard(card, true);
    }
  }

  /** Rituals, untap spells and tutors. Returns false if this isn't one of them. */
  private resolveManaOrTutor(card: CardDef, mode: string | null): boolean {
    switch (card.name) {
      case 'Snap':
        this.untapLands(2);
        return true;
      case 'Dark Ritual':
        this.pool.B += 3;
        return true;
      case 'Cabal Ritual':
        this.pool.B += this.cabalMana();
        return true;
      case 'Drain Power':
        this.pool.C += this.drainPowerMana();
        return true;
      case 'Energy Tap': {
        const target = this.energyTapTarget();
        if (target) {
          target.tapped = true;
          this.pool.C += target.card.manaValue;
        }
        return true;
      }
      case 'High Tide':
        this.highTidesThisTurn += 1;
        return true;
      case 'Bubbling Muck':
        this.muck += 1;
        return true;
      case 'Diabolic Tutor':
        this.doTutor(() => true, false);
        return true;
      case 'Solve the Equation':
        this.doTutor((otherCard) => otherCard.isInstantOrSorcery, false);
        return true;
      case 'Personal Tutor':
        this.doTutor((otherCard) => otherCard.isSorcery, true);
        return true;
      case 'Waterlogged Teachings':
        this.doTutor((otherCard) => otherCard.isInstant, false);
        return true;
      case 'Insatiable Avarice':
        if (mode === 'tutor' || mode === 'both') this.doTutor(() => true, true);
        if (mode === 'draw' || mode === 'both') {
          this.draw(3);
          this.myLife -= 3;
        }
        return true;
      default:
        return false;
    }
  }

  untapLands(count: number): void {
    const tapped = this.battlefield.filter(
      (permanent) => permanent.land !== null && permanent.tapped,
    );
    // the lands that make the most first (High Tide's and Bubbling Muck's bonus), then one that makes two colours
    const manaMade = (permanent: Permanent) =>
      1 +
      (this.islandTyped(permanent) ? this.highTidesThisTurn : 0) +
      (this.swampTyped(permanent) ? this.muck : 0);
    const makesTwoColours = (permanent: Permanent) => {
      const kind = this.manaSourceKind(permanent) ?? '';
      return (
        kind === 'A' || kind === 'UB' || kind === 'GU' || kind.includes('/')
      );
    };
    const key = (permanent: Permanent) =>
      -2 * manaMade(permanent) + (makesTwoColours(permanent) ? 0 : 1);
    tapped.sort((first, second) => key(first) - key(second));
    for (const otherPermanent of this.landsToUntap(tapped, count))
      otherPermanent.tapped = false;
  }

  /** The lands an untap effect untaps, from the tapped ones best first. A deck that planned the untap (a kill line the
   *  search found) may name others. */
  landsToUntap(tappedLandsBestFirst: Permanent[], count: number): Permanent[] {
    const index = this.plannedPayments.findIndex(
      (payment) => payment.cost === UNTAP,
    );
    if (index < 0) return tappedLandsBestFirst.slice(0, count);
    const [payment] = this.plannedPayments.splice(index, 1);
    const chosen: Permanent[] = [];
    for (const landClass of payment.taps) {
      const land = tappedLandsBestFirst.find(
        (permanent) =>
          !chosen.includes(permanent) &&
          isSourceOfClass(this, permanent, landClass),
      );
      if (land) chosen.push(land);
    }
    // anything the plan didn't cover (the real game has other tapped lands) is untapped the usual way
    for (const land of tappedLandsBestFirst)
      if (
        chosen.length < Math.min(count, payment.taps.length) &&
        !chosen.includes(land)
      )
        chosen.push(land);
    return chosen;
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
    const cost = this.effectiveCost(card, base, fromGraveyard);
    if (!this.pay(cost, true)) return false;
    this.takeCard(card, fromGraveyard ? 'graveyard' : 'hand');
    this.sayEvent(
      'cast',
      'cast',
      card,
      fromGraveyard ? '(from graveyard)' : '',
      mode ? `[${mode}]` : '',
    );
    this.spellsCast += 1;
    this.onCastInstantOrSorcery(fromGraveyard);
    this.castTriggers(card, fromGraveyard, triggerOptions);
    this.podAnnounceCast(card);
    if (this.podCounters(card)) {
      this.putCard(card, fromGraveyard ? 'exile' : 'graveyard');
      return true;
    }
    this.resolve(card, fromGraveyard, mode);
    if (!fromGraveyard && card.keywords.has('rebound')) {
      // rebound: exiled as it resolves, cast again for free at our next upkeep
      this.putCard(card, 'exile');
      this.reboundCards = [...this.reboundCards, card];
    } else this.putCard(card, fromGraveyard ? 'exile' : 'graveyard');
    return true;
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
    const rebounding = this.reboundCards;
    if (!rebounding.length) return;
    this.reboundCards = [];
    for (const card of rebounding) {
      if (!this.exile.includes(card)) continue;
      this.takeCard(card, 'exile');
      this.sayEvent('cast', 'cast', card, '(rebound, free)');
      this.spellsCast += 1;
      this.onCastInstantOrSorcery(false);
      this.podAnnounceCast(card);
      this.resolve(card);
      this.putCard(card, 'graveyard');
    }
  }

  onCastInstantOrSorcery(fromGraveyard: boolean): void {
    this.isCast += 1;
    castInstantOrSorceryTriggers(this);
    for (const permanent of this.battlefield.slice()) {
      const cardName = permanent.card.name;
      if (cardName === 'Academy Wall' && !this.wallUsed) {
        this.wallUsed = true;
        this.draw(1);
        this.discard(1);
      } else if (cardName === 'Secrets of the Dead' && fromGraveyard)
        this.draw(1);
    }
    if (this.caseSolved && this.isOnBattlefield('Case of the Ransacked Lab'))
      this.draw(1);
  }

  castPerm(card: CardDef, fromCommand = false): boolean {
    let cost = this.effectiveCost(card);
    if (fromCommand) cost = this.commanderCost(card, cost);
    if (!this.pay(cost, false)) return false;
    if (fromCommand) {
      this.takeCard(card, 'command');
      this.onCommanderCast(card);
    } else this.takeCard(card, 'hand');
    this.spellsCast += 1;
    this.sayEvent('cast', 'cast', card);
    this.podAnnounceCast(card);
    if (this.podCounters(card)) {
      // countered: a commander goes back to the command zone (its tax still counts this cast)
      this.putCard(card, fromCommand ? 'command' : 'graveyard');
      return true;
    }
    this.enter(card);
    return true;
  }

  // ================================================================ lands
  /** Does this land enter tapped right now? It checks the card's real condition: lands that always enter tapped;
   *  snarls (a Forest or Island card in hand to reveal); check lands (control a land of those types); fast lands
   *  (two or fewer other lands); slow lands (two or more other lands); battle lands and Sunken Hollow (two or
   *  more basic lands). Evaluate it before the land is on the battlefield; a land in hand doesn't count itself. */
  entersTapped(card: CardDef): boolean {
    const landInfo = (card.land ?? card.mdfcLand)!;
    const etbRule = landInfo.etb ?? 'untapped';
    if (etbRule === 'tapped') return true;
    const flag = (land: LandInfo | null, landType: string) =>
      !!(land && (land as unknown as Record<string, boolean>)[landType]);
    const lands = this.landsOnBattlefield();
    if (etbRule === 'catacomb')
      return !lands.some(
        (permanent) =>
          permanent.land && (permanent.land.island || permanent.land.swamp),
      );
    if (etbRule === 'hollow')
      return (
        lands.filter((permanent) => permanent.land && permanent.land.basic)
          .length < 2
      );
    if (etbRule.startsWith('reveal:')) {
      const types = etbRule.slice(7).split(',');
      return !this.hand.some(
        (otherCard) =>
          otherCard !== card &&
          otherCard.land !== null &&
          types.some((landType) => flag(otherCard.land, landType)),
      );
    }
    const cond = landInfo.cond;
    if (!cond) return false;
    if (cond.startsWith('check:')) {
      const types = cond.slice(6).split(',');
      return !lands.some((permanent) =>
        types.some((landType) => flag(permanent.land, landType)),
      );
    }
    if (cond === 'fast') return lands.length > 2;
    if (cond === 'slow') return lands.length < 2;
    if (cond === 'basics2')
      return (
        lands.filter((permanent) => permanent.land && permanent.land.basic)
          .length < 2
      );
    return false;
  }

  /** Plays the best land from hand, if we haven't played one this turn. */
  playLand(): void {
    if (this.landPlayed) return;
    const lands = this.landsWeCouldPlay();
    if (!lands.length) return;
    const landsOnBattlefield = this.landsOnBattlefield().length;
    const needManaNow = this.needsManaThisTurn();

    const land = firstMax(lands, (candidate) =>
      this.scoreLandToPlay(candidate, landsOnBattlefield, needManaNow),
    );
    this.takeCard(land, 'hand');
    this.landPlayed = true;
    const landInfo = { ...landInfoOf(land) };
    if (landInfo.special === 'wilds') {
      this.crackEvolvingWilds(land, landInfo);
      return;
    }
    const permanent = new Permanent(
      land,
      landInfo,
      this.landEntersTapped(land),
    );
    permanent.sick = false;
    this.sayEvent(
      'land',
      'play land',
      land.land !== null ? land : 'Inundated Archive (MDFC)',
      permanent.tapped ? '(tapped)' : '',
    );
    if (landInfo.special === 'bounce') this.returnLandToHand();
    this.putOntoBattlefield(permanent);
    this.onLandEnter(permanent, false);
  }

  /** The lands in hand. A land-on-the-back-side card counts only when we have no real land and few lands out. */
  private landsWeCouldPlay(): CardDef[] {
    const lands = this.hand.filter((card) => card.land !== null);
    const mdfcLands = this.hand.filter((card) => card.mdfcLand);
    if (
      !lands.length &&
      mdfcLands.length &&
      this.landsOnBattlefield().length < 5
    )
      return mdfcLands;
    return lands;
  }

  private landEntersTapped(land: CardDef): boolean {
    return this.entersTapped(land) || landInfoOf(land).special === 'wilds';
  }

  /** Would a land that enters untapped let us cast a spell we want this turn? (Then a tapped land is bad.) */
  private needsManaThisTurn(): boolean {
    const manaAvailable =
      this.battlefield.filter(
        (permanent) => !permanent.tapped && this.manaSourceKind(permanent),
      ).length +
      this.pool.U +
      this.pool.B +
      this.pool.C +
      this.pool.S;
    for (const card of [...this.hand, ...this.command]) {
      if (card.land !== null) continue;
      // only spells the AI would actually cast proactively (not counters, rituals, combo sorceries)
      const [wantScore, cost] = this.landWant(card);
      if (wantScore >= 50 && cost.manaValue === manaAvailable + 1) return true;
    }
    return false;
  }

  /** How good a land is to play now (higher is better): its mana, the colour we need, and whether it enters tapped. */
  private scoreLandToPlay(
    land: CardDef,
    landsOnBattlefield: number,
    needManaNow: boolean,
  ): number {
    const info = landInfoOf(land);
    let score =
      LAND_MANA_SCORE[
        info.mana.length === 3 && info.mana[1] === '/' ? 'A' : (info.mana ?? '')
      ] ?? 3;
    if (
      info.mana.length === 1 &&
      COLOURS.includes(info.mana) &&
      info.mana === this.colourNeededFromNewLand()
    )
      score += 1.5;
    if (info.special === 'bounce') score = landsOnBattlefield >= 1 ? 8 : -5;
    if (this.landEntersTapped(land)) score += needManaNow ? -6 : 4;
    if (land.mdfcLand) score -= 3;
    score += this.landBias(land);
    return score;
  }

  /** The colour we most want the next land to make. */
  private colourNeededFromNewLand(): string {
    if (
      this.colors.length === 2 &&
      this.colors[0] === 'U' &&
      this.colors[1] === 'B'
    )
      return this.colourNeededByBlueBlackDeck();
    return this.colourNeededByOtherDeck();
  }

  private colourNeededByBlueBlackDeck(): string {
    const sourcesOf = (kinds: string[]) =>
      this.battlefield.filter((permanent) =>
        kinds.includes(this.manaSourceKind(permanent, true) ?? ''),
      ).length;
    const blueSources = sourcesOf(['U', 'A', 'UB', 'F']);
    const blackSources = sourcesOf(['B', 'A', 'UB', 'F']);
    const blackNeeded = this.hand.some((card) => card.cost.black);
    return (blackSources === 0 && blackNeeded) ||
      (blueSources >= blackSources + 3 && blackNeeded)
      ? 'B'
      : 'U';
  }

  /** First, a colour that lets us cast a spell this turn with the new land (e.g. a turn-1 Llanowar Elves);
   *  otherwise the colour with the most pips in hand per source we already have. */
  private colourNeededByOtherDeck(): string {
    const pipsOf: Record<string, (card: CardDef) => number> = {
      W: (card) => card.cost.white,
      U: (card) => card.cost.blue,
      B: (card) => card.cost.black,
      R: (card) => card.cost.red,
      G: (card) => card.cost.green,
    };
    const makesColour = (permanent: Permanent, colour: string) => {
      const kind = this.manaSourceKind(permanent, true) ?? '';
      return kind === colour || kind === 'A';
    };
    const manaWithNewLand =
      this.battlefield.filter(
        (permanent) => !permanent.tapped && this.manaSourceKind(permanent),
      ).length + 1;
    const castable = this.hand
      .filter(
        (card) =>
          card.land === null &&
          card.manaValue > 0 &&
          card.manaValue <= manaWithNewLand,
      )
      .sort(
        (first, second) =>
          second.manaValue - first.manaValue ||
          this.cardValue(second) - this.cardValue(first),
      );
    for (const spell of castable) {
      const coloursNeeded = this.colors.filter(
        (colour) => pipsOf[colour](spell) > 0,
      );
      const missing = coloursNeeded.filter(
        (colour) =>
          !this.battlefield.some((permanent) => makesColour(permanent, colour)),
      );
      if (missing.length === 1) return missing[0];
    }
    let bestColour = this.colors[0];
    let bestPipsPerSource = -1;
    for (const colour of this.colors) {
      const pips = this.hand.reduce(
        (sum, card) => sum + pipsOf[colour](card),
        0,
      );
      const sources = this.battlefield.filter((permanent) => {
        const kind = this.manaSourceKind(permanent, true) ?? '';
        return (
          makesColour(permanent, colour) ||
          (kind.length === 2 && kind.includes(colour))
        );
      }).length;
      const pipsPerSource = pips / (sources + 1);
      if (pipsPerSource > bestPipsPerSource) {
        bestColour = colour;
        bestPipsPerSource = pipsPerSource;
      }
    }
    return bestColour;
  }

  /** Evolving Wilds: sacrifice it and put a basic land onto the battlefield tapped. */
  private crackEvolvingWilds(wilds: CardDef, wildsInfo: LandInfo): void {
    const colour = this.colourNeededFromNewLand();
    const basic =
      this.library.find((card) => card.name === BASIC_OF[colour]) ??
      this.library.find((card) => card.land && card.land.basic) ??
      null;
    this.putCard(wilds, 'graveyard');
    if (basic) {
      this.takeCard(basic, 'library');
      this.shuffle();
      const basicPermanent = new Permanent(basic, basic.land, true);
      this.putOntoBattlefield(basicPermanent);
      this.onLandEnter(new Permanent(wilds, wildsInfo), true);
      this.onLandEnter(basicPermanent, false);
    }
    this.sayEvent('land', 'play Evolving Wilds -> crack for', basic ?? 'None');
  }

  /** A land that returns another land to hand (a bounce land): returns the best one, preferring a nonbasic and a tapped
   *  one. An untapped one is tapped for mana first, so the mana isn't lost. */
  private returnLandToHand(): void {
    const others = this.battlefield.filter(
      (permanent) => permanent.land !== null,
    );
    if (!others.length) return;
    others.sort(
      (first, second) =>
        +!first.land!.basic - +!second.land!.basic ||
        +!first.tapped - +!second.tapped,
    );
    const returned = others[0];
    if (!returned.tapped && this.manaSourceKind(returned))
      this.tap(returned, 'N');
    this.takeFromBattlefield(returned);
    this.putCard(returned.card, 'hand');
  }

  /** A land entered the battlefield under our control (landfall). gone = it was sacrificed right away (Evolving Wilds). */
  onLandEnter(permanent: Permanent, _gone: boolean): void {}

  // ================================================================ card actions
  flashback(card: CardDef): boolean {
    if (!this.pay(this.effectiveCost(card, new Cost(1, 1), true), true))
      return false;
    this.takeCard(card, 'graveyard');
    this.myLife -= 3;
    this.sayEvent('cast', 'flashback', card);
    this.spellsCast += 1;
    this.onCastInstantOrSorcery(true);
    this.podAnnounceCast(card);
    this.resolve(card, true);
    this.putCard(card, 'exile');
    return true;
  }

  wishclaw(card: CardDef): boolean {
    if (!this.pay(this.effectiveCost(card).plus(new Cost(1)), false))
      return false;
    this.takeCard(card, 'hand'); // it goes to an opponent
    this.say('Wishclaw Talisman (cast + activate)');
    this.doTutor(() => true, false);
    return true;
  }

  transmute(card: CardDef): boolean {
    if (!this.pay(new Cost(1, 2), false)) return false;
    this.moveCard(card, 'hand', 'graveyard');
    this.say('transmute', card.name);
    this.doTutor(
      (otherCard) =>
        otherCard.manaValue === card.manaValue && otherCard.land === null,
      false,
    );
    return true;
  }

  cycle(card: CardDef): boolean {
    if (!this.pay(new Cost(2))) return false;
    this.moveCard(card, 'hand', 'graveyard');
    this.say('cycle', card);
    this.draw(1);
    return true;
  }

  // ================================================================ choosing what to do
  /** Use a ritual only if it lets us cast something good we otherwise can't. (Tested without Treasures: the test
   *  pays for real and restores a snapshot.) */
  ritualCandidates(candidates: Candidate[]): Candidate[] {
    return this.withoutExpendableMana(() =>
      this.ritualCandidatesTested(candidates),
    );
  }

  private ritualCandidatesTested(candidates: Candidate[]): Candidate[] {
    const out: Candidate[] = [];
    const bestAffordable = () =>
      Math.max(
        0,
        ...candidates
          .filter((candidate) =>
            this.canPay(candidate.cost, candidate.isInstantOrSorcery),
          )
          .map((candidate) => candidate.score),
      );
    let affordableBest: number | null = null; // (worked out only if there is a ritual in hand)
    for (const card of this.hand) {
      const cardName = card.name;
      if (
        cardName !== 'Dark Ritual' &&
        cardName !== 'High Tide' &&
        cardName !== 'Cabal Ritual' &&
        cardName !== 'Drain Power' &&
        cardName !== 'Energy Tap'
      )
        continue;
      if (affordableBest === null) affordableBest = bestAffordable();
      const snapshot = this.takeSnapshot();
      if (!this.pay(this.effectiveCost(card), true)) {
        this.restore(snapshot);
        continue;
      }
      if (cardName === 'Dark Ritual') this.pool.B += 3;
      else if (cardName === 'High Tide') this.highTidesThisTurn += 1;
      else if (cardName === 'Cabal Ritual') this.pool.B += this.cabalMana();
      else if (cardName === 'Drain Power') this.pool.C += this.drainPowerMana();
      else this.pool.C += this.energyTapTarget()?.card.manaValue ?? 0;
      const gain = bestAffordable();
      if (cardName === 'High Tide') this.highTidesThisTurn -= 1;
      this.restore(snapshot);
      if (gain >= 60 && gain > affordableBest!)
        out.push({
          score: gain - 1,
          cost: this.effectiveCost(card),
          isInstantOrSorcery: true,
          action: () => this.castRitual(card),
        });
    }
    return out;
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

  /** If casting a mana rock first still leaves enough (with the rock's own mana) for the best play,
   *  move the rock to the front: e.g. Waterskin, tap it, then Scion with the rest. */
  rockFirst(candidates: Candidate[]): void {
    const top = candidates.find(
      (candidate) =>
        candidate.score > 0 &&
        this.canPay(candidate.cost, candidate.isInstantOrSorcery),
    );
    if (!top) return;
    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      if (candidate.score < 50 || !candidate.rock || candidate === top)
        continue;
      const snapshot = this.takeSnapshot();
      let topSpellPayable = false;
      this.withoutExpendableMana(() => {
        if (this.pay(candidate.cost, false)) {
          const permanent = new Permanent(candidate.rock!);
          this.battlefield.push(permanent);
          topSpellPayable = this.canPay(top.cost, top.isInstantOrSorcery);
          this.battlefield.pop();
        }
      });
      this.restore(snapshot);
      if (topSpellPayable) {
        candidates.splice(i, 1);
        candidates.unshift(candidate);
        return;
      }
    }
  }

  orderedCandidates(main2: boolean): Candidate[] {
    const candidates = this.candidates(main2);
    candidates.push(...this.ritualCandidates(candidates));
    sortDesc(candidates, (candidate) => candidate.score);
    this.rockFirst(candidates);
    return candidates;
  }

  // ---------------------------------------------------------------- turn planner
  /** Try each option on a copy of the game (library re-shuffled, so no peeking at draws), finish the
   *  turn greedily, and score where it ends up. Returns the best index. */
  plan(options: number[], main2: boolean): number {
    let best = options[0];
    let bestValue: number | null = null;
    const rolloutCount = (this.config.planner_rollouts as number) ?? 2;
    for (const index of options) {
      let totalValue: number | null = 0;
      for (let rolloutIndex = 0; rolloutIndex < rolloutCount; rolloutIndex++) {
        const rolloutCopy = this.clone();
        rolloutCopy.verbose = false;
        rolloutCopy.inRollout = true;
        rolloutCopy.mode = 'any';
        rolloutCopy.killNow = false;
        rolloutCopy.config = {
          ...this.config,
          search_budget: (this.config.planner_budget as number) ?? 600,
        };
        rolloutCopy.rng = new Rng(Math.floor(this.rng.random() * 4294967296));
        rolloutCopy.rng.shuffle(rolloutCopy.library);
        if (rolloutCopy.orderedCandidates(main2)[index].action() === false) {
          totalValue = null;
          break;
        }
        totalValue += rolloutCopy.rolloutValue(main2);
      }
      if (totalValue === null) continue;
      if (bestValue === null || totalValue > bestValue) {
        best = index;
        bestValue = totalValue;
      }
    }
    return best;
  }

  /** Finish this turn greedily, then play the next turn greedily (with random draws). Rollouts always
   *  play in "any" mode and score kills the same way in both modes, so the "any" and "protected"
   *  games make identical choices until the first kill appears (that's what lets the runner get both
   *  results from one game). */
  rolloutValue(main2: boolean): number {
    const killScore = (): number | null => {
      if (this.protectedKillTurn !== null) return 10000;
      if (this.unprotectedKillTurn !== null) return 9000;
      if (this.areOpponentsBeaten()) return 10000; // e.g. Mindskinner combat kill
      return null;
    };
    let won = this.develop(main2);
    if (!won && !main2) {
      this.enterStep('combat');
      this.combat();
      if (!this.areOpponentsBeaten()) {
        this.enterStep('main2');
        this.develop(true);
      }
    }
    let killResult = killScore();
    if (killResult !== null) return killResult;
    this.enterStep('end');
    this.endTurn();
    const valueAtTurnEnd = this.positionValue();
    if (this.turn >= (this.config.max_turn as number) + 1)
      return valueAtTurnEnd;
    this.startTurn();
    this.opponentUpkeep();
    this.enterStep('upkeep');
    this.upkeep();
    this.upkeepTriggersOfTheGame();
    this.enterStep('draw');
    this.draw(1);
    this.enterStep('main1');
    this.playLand();
    won = this.develop();
    if (!won) {
      this.enterStep('combat');
      this.combat();
      if (!this.areOpponentsBeaten()) {
        this.enterStep('main2');
        this.develop(true);
      }
    }
    killResult = killScore();
    if (killResult !== null) return killResult / 2 + 0.2 * valueAtTurnEnd;
    return valueAtTurnEnd + 0.3 * this.positionValue();
  }

  develop(main2 = false): boolean {
    for (let step = 0; step < 40; step++) {
      this.logCardMovesSoFar();
      if (this.checkKill() === 2) return true;
      const candidates = this.orderedCandidates(main2);
      const afford: number[] = [];
      const reserve = this.podReserve();
      candidates.forEach((candidate, i) => {
        if (
          candidate.score > 0 &&
          this.canPay(candidate.cost, candidate.isInstantOrSorcery) &&
          (reserve === 0 ||
            this.openMana() - candidate.cost.manaValue >= reserve)
        )
          afford.push(i);
      });
      if (!afford.length) return false;
      if (this.mode === 'protected' && this.killNow) {
        let done = false;
        for (const index of afford) {
          // try the action on a copy; keep it only if the kill survives
          const rolloutCopy = this.clone();
          // this copy becomes the game if the kill survives, so its moves are recorded
          rolloutCopy.moveRecorder =
            this.moveRecorder?.copy(
              this.battlefield,
              rolloutCopy.battlefield,
            ) ?? null;
          if (rolloutCopy.orderedCandidates(main2)[index].action() === false)
            continue;
          if (
            this.killSearch().search(
              rolloutCopy.buildKillSearchState(),
              this.config.search_budget as number,
            ) === 0
          )
            continue;
          const log = this.log;
          Object.assign(this, rolloutCopy);
          this.log = [...log, ...rolloutCopy.log.slice(log.length)];
          done = true;
          break;
        }
        if (!done) return false;
        continue;
      }
      let order = afford;
      if (
        this.config.planner &&
        !this.inRollout &&
        afford.length > 1 &&
        this.turn >= 2
      ) {
        const options = afford.slice(
          0,
          (this.config.planner_width as number) ?? 4,
        );
        const pick = this.plan(options, main2);
        order = [pick, ...afford.filter((i) => i !== pick)];
      }
      let done = false;
      for (const index of order) {
        if (candidates[index].action() !== false) {
          done = true;
          break;
        }
      }
      if (!done) return false;
    }
    return false;
  }

  // ================================================================ turn
  /** The deck's mulligan rule (engine/game/mulligan.ts), or null for the default: keep 2 to 5 lands. */
  mulliganRule(): MulliganRule | null {
    return null;
  }

  mulligan(): void {
    const rule = this.mulliganRule() ?? DEFAULT_MULLIGAN;
    const sizes = [7, 7, 6, 5];
    for (let attempt = 0; attempt < sizes.length; attempt++) {
      const size = sizes[attempt];
      for (const card of this.hand.slice())
        this.moveCard(card, 'hand', 'library');
      this.shuffle();
      for (const card of this.takeTopCardsOfLibrary(7))
        this.putCard(card, 'hand');
      if (
        size <= (rule.alwaysKeep ?? 5) ||
        keepsHand(rule, attempt, this.hand)
      ) {
        for (let i = 0; i < 7 - size; i++) {
          const card = firstMin(this.hand, (otherCard) =>
            this.cardValue(otherCard),
          );
          this.moveCard(card, 'hand', 'library');
        }
        return;
      }
    }
  }

  startTurn(): void {
    if (this.turn > 0) this.spentEnd[this.turn] = this.spent;
    this.turn += 1;
    for (const permanent of this.battlefield) {
      permanent.tapped = false;
      permanent.sick = false;
    }
    this.pool = emptyPool();
    this.highTidesThisTurn = this.muck = 0;
    this.isEnergybendingActive = false;
    this.spellsCast = this.isCast = 0;
    this.firstDrawDone = false;
    this.attacked = false;
    this.landPlayed = false;
    this.wallUsed = false;
    this.lastKey = null;
    if (this.turn > 1)
      this.opponentLibrarySizes = this.opponentLibrarySizes.map((x, i) =>
        this.life[i] > 0 ? Math.max(0, x - 1) : x,
      );
    for (const otherPermanent of this.battlefield) {
      if (
        otherPermanent.card.name === 'Curious Homunculus' &&
        !otherPermanent.transformed &&
        this.graveyard.filter((card) => card.isInstantOrSorcery).length >= 3
      ) {
        otherPermanent.transformed = true;
        this.say('Curious Homunculus transforms');
      }
    }
  }

  /** Moves the turn on to `step`. Mana left in the pool is lost (rule 106.4: it empties at the end of each step
   *  and phase). Lost mana usually means the AI wasted it, so the log says so. */
  enterStep(step: TurnStep): void {
    const manaLost = Object.values(this.pool).reduce(
      (total, amount) => total + amount,
      0,
    );
    if (manaLost > 0)
      this.say(
        `${manaLost} mana left in the pool is lost at the end of ${this.step}`,
      );
    this.pool = emptyPool();
    this.step = step;
    this.onEnterStep(step);
  }

  /** Deck hook: something happens at the start of a step (e.g. mana added to the pool). */
  onEnterStep(_step: TurnStep): void {}

  endTurn(): void {
    returnBlinkedCards(this);
    this.endStep();
    if (this.isCast >= 4 && this.isOnBattlefield('Case of the Ransacked Lab'))
      this.caseSolved = true;
    if (this.hand.length > 7 && !this.hasNoMaximumHandSize())
      this.discard(this.hand.length - 7);
  }

  /** Do we skip the discard to seven at the end of the turn? (Reliquary Tower; a deck adds its own cards.) */
  hasNoMaximumHandSize(): boolean {
    return this.isOnBattlefield('Reliquary Tower');
  }

  /** Before the first turn: the opening hand and mulligans. */
  setup(): void {
    this.isEnergybendingActive = false;
    this.highTidesThisTurn = this.muck = 0;
    this.spellsCast = 0;
    this.mulligan();
    this.say('opening hand', formatList(this.hand.map((card) => card.name)));
  }

  /** One full turn of ours. Returns true when the game ended in it (a win, or we lost). A pod plays the decks' turns in seat order. */
  takeTurn(): boolean {
    this.startTurn();
    this.sayEvent('turn-start');
    if (this.turn > 1 && !this.inArena()) this.opponentUpkeep();
    this.enterStep('upkeep');
    this.upkeep();
    this.upkeepTriggersOfTheGame();
    this.enterStep('draw');
    if (!(this.turn === 1 && this.onPlay)) this.draw(1);
    this.logCardMovesSoFar();
    this.enterStep('main1');
    this.playLand();
    if (this.developWin()) return true;
    this.logCardMovesSoFar();
    this.enterStep('combat');
    this.combat();
    this.attackWithForcedCreatures();
    this.logCardMovesSoFar();
    if (this.areOpponentsBeaten()) {
      if (this.unprotectedKillTurn === null)
        this.unprotectedKillTurn = this.turn;
      this.protectedKillTurn = this.turn;
      this.sayEvent('win', 'Opponents beaten in combat');
      return true;
    }
    this.lastKey = null;
    this.enterStep('main2');
    if (this.developWin(true)) return true;
    this.enterStep('end');
    if (this.inArena() && this.config.pod_defence !== false) this.podDefence();
    this.logCardMovesSoFar();
    this.endTurn();
    if (this.turn === 4) {
      // for the card ranking: every card seen by the end of turn 4
      this.seen4 = new Set(
        [...this.hand, ...this.graveyard, ...this.exile].map(
          (card) => card.name,
        ),
      );
      for (const permanent of this.battlefield)
        this.seen4.add(permanent.card.name);
    }
    this.sayEvent(
      'turn-end',
      'end: hand',
      formatList(this.hand.map((card) => card.name)),
    );
    return false;
  }

  /** develop(), but in a pod a declared win may be answered: then the turn goes on without the card it was stopped at. */
  developWin(main2 = false): boolean {
    for (let tries = 0; tries < 4; tries++) {
      if (!this.develop(main2)) return false;
      if (this.died || !this.podAnswersWin()) {
        this.adoptKillLineCopy();
        return true;
      }
      this.killLineCopy = null;
      this.unprotectedKillTurn = this.protectedKillTurn = null;
      this.killNow = false;
      this.lastKey = null;
    }
    return false;
  }

  /** The win stands: the copy the kill line was played on becomes the game, with its log and card moves. */
  adoptKillLineCopy(): void {
    const copy = this.killLineCopy;
    if (copy === null) return;
    const log = this.log;
    const logLengthAtCopy = this.killLineLogLength;
    // the kill was recorded on the game after the copy was made
    const { unprotectedKillTurn, protectedKillTurn, lastKillLine } = this;
    Object.assign(this, copy);
    Object.assign(this, {
      unprotectedKillTurn,
      protectedKillTurn,
      lastKillLine,
    });
    this.killLineCopy = null;
    this.log = [...log, ...copy.log.slice(logLengthAtCopy)];
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

  /**
   * Goldfish combat (rules agreed for creature decks):
   * - flying attackers always connect; of the others, opponents block half (rounded down), the biggest ones;
   * - crackback: we take back what we dealt, minus a third for each untapped creature kept home
   *   (none if a fog creature such as Spore Frog stays home; it is sacrificed before our next turn);
   * - if attacking with everything wins, do it; otherwise the biggest attack that keeps us above
   *   config.combat_safety life (default 10).
   * Damage goes to the opponent closest to dead first, the rest to the next one.
   */
  creatureCombat(): void {
    if (this.attacked) return;
    const candidates = this.creatures().filter((permanent) =>
      this.canAttack(permanent),
    );
    if (!candidates.length) return;
    if (this.inArena()) {
      this.arenaCombat(candidates);
      return;
    }
    const fog = this.fogBlocker();
    const pool = fog
      ? candidates.filter((permanent) => permanent !== fog)
      : candidates;
    pool.sort((first, second) => this.power(second) - this.power(first));
    const untappedOthers = (attacking: Set<Permanent>) =>
      this.creatures().filter(
        (permanent) => !permanent.tapped && !attacking.has(permanent),
      ).length;
    const connecting = (attackers: Permanent[]) => {
      const fly = attackers.filter((permanent) => this.evasive(permanent)),
        ground = attackers.filter((permanent) => !this.evasive(permanent));
      const blocked = Math.floor(ground.length / 2);
      // opponents block the biggest ground attackers
      const permanents = ground
        .slice()
        .sort((first, second) => this.power(second) - this.power(first))
        .slice(blocked);
      return [...fly, ...permanents];
    };
    const deal = (attackers: Permanent[]) =>
      connecting(attackers).reduce(
        (total, permanent) => total + this.power(permanent),
        0,
      );
    const crackback = (attackers: Permanent[], damage: number) => {
      if (fog) return 0;
      const home = untappedOthers(new Set(attackers));
      return Math.round(damage * Math.max(0, 1 - home / 3));
    };
    const safety = (this.config.combat_safety as number) ?? 10;
    let best: Permanent[] = [],
      bestDmg = 0;
    for (let attackerCount = 1; attackerCount <= pool.length; attackerCount++) {
      const attackers = pool.slice(0, attackerCount);
      const damage = deal(attackers);
      if (this.winsWith(damage)) {
        best = attackers;
        bestDmg = damage;
        break;
      } // a winning attack: always take it
      if (
        this.myLife - crackback(attackers, damage) > safety &&
        damage > bestDmg
      ) {
        best = attackers;
        bestDmg = damage;
      }
    }
    if (!best.length) return;
    this.attacked = true;
    for (const otherPermanent of best) otherPermanent.tapped = true;
    addFirebendingMana(this, best);
    const all = [...best, ...this.onAttack(best)].filter((permanent) =>
      this.battlefield.includes(permanent),
    );
    let damage = deal(all);
    const total = damage;
    while (damage > 0) {
      const targetIndex = this.chooseTargetOpponent();
      if (targetIndex === null) break;
      const hit = Math.min(damage, this.life[targetIndex]);
      this.damageOpponent(targetIndex, hit);
      damage -= hit;
    }
    this.onCombatDamage(connecting(all), total);
    this.pendingCrackback += crackback(best, total);
    if (fog) this.fogUsed = true;
    this.sayEvent(
      'attack',
      `attack with ${all.length} creature(s): ${total} damage, ${this.describeOpponentLife()}` +
        (fog
          ? ` (${fog.card.name} stays home)`
          : `, crackback ${crackback(best, total)}`),
    );
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
  onCommanderCast(card: CardDef): void {
    this.commandCasts.push(card.name);
  }
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
