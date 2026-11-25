/**
 * The Aesi deck's AI (Simic "reverse landfall", bracket 3): the rules of its cards, what it wants to do
 * each turn, the loop solver, and the rules agreed for this deck (see PLAN.md).
 *
 * Files:
 *   cards.ts       the card names and the facts about them (values, which cards ramp, the moonfolk table...)
 *   game.ts        this file: AesiGame, its state, mana and the turn steps
 *   land-drops.ts  which way and which land goes onto the battlefield, and a land entering
 *   combat.ts      the attacks and the Siege
 *   loops.ts       the loop solver: finds the loops on the battlefield, applies them and looks for a win
 *   candidates.ts  everything the AI may do now, with a score each (cast, play a land, abilities)
 *   actions.ts     what the abilities do when the AI picks them
 *   spells.ts      what the ramp and utility spells do when they resolve
 *
 * Win: all three opponents out (40 life each, or their 92-card library milled to 0; a milled-out
 * opponent counts on the turn we empty it). Second measure: first opponent out.
 * Land drops: 1 + Aesi, Azusa (2), Loot, Case of the Locked Hothouse, Druid Class level 2, plus this
 * turn's Explore / Summer Bloom / Azusa's Many Journeys. "{T}: put a land" creatures, Patron of the
 * Moon and Kodama don't use a drop.
 * Loops are shortcut (as you'd demonstrate them at the table): findLoops() finds them, solveLoops()
 * applies the result (draw the library, dump the lands, cast what helps, look for the win).
 * Endless flyers / snakes and 10+ Eternal Dominion copies win on the next turn (tokens are
 * summoning sick). Attacks: flyers whenever they can, ground creatures only if it kills the table
 * (half of them blocked). No crackback.
 */
import {
  AESI,
  BSZ,
  BUDOKA,
  CASE,
  COBRA,
  DOMINION,
  DRUID,
  ELVES,
  FETCHES_TWO,
  HARU,
  HOLD,
  INVASION,
  KHALNI,
  KIRI,
  KODAMA,
  MELOKU,
  MINDSWEEPER,
  OMNI,
  PATRON,
  PUTTERS,
  RAFT,
  RAMP,
  REDUCERS,
  RETREAT,
  REVOLT,
  SAGA,
  SIEGE_DEFENSE,
  SKYCLAVE,
  SPIRITS,
  STOLEN_LAND,
  SWARM,
  TATYOVA,
  TOK,
  UYO,
  UYO_COPY,
  VALUE,
} from './cards';
import { findLoops, solveLoops } from './loops';
import type { Loops } from './loops';
import { buildCandidates, chooseLandTutorTarget } from './candidates';
import { resolveAesiSpell } from './spells';
import { attackAsAesi, attackTheSiege, defeatTheSiege } from './combat';
import {
  entersUntapped,
  creaturesReadyToPutALand,
  wayToPutALand,
  landToPut,
  colourWeWant,
  putLandThatWay,
  playLandsFromTopWithCase,
  putLandOntoBattlefield,
  returnLandForGrowthChamber,
} from './land-drops';
import * as C from '../../engine/cards/cards';
import { CardDef, Cost, makeToken } from '../../engine/cards/cards';
import {
  Candidate,
  CardListZone,
  KillSearcher,
  LogBoardView,
  Permanent,
  WinAttempt,
  Zone,
} from '../../engine/game/game-types';
import { Game } from '../../engine/game/game';
import { firstMax, removeIfPresent } from '../../engine/util/lists';
import { fetchLand } from '../../engine/game/land-search';
import { MulliganRule } from '../../engine/game/mulligan';
import { MULLIGAN } from './mulligan';

export type Way =
  | { kind: 'drop' }
  | { kind: 'putter'; permanent: Permanent }
  | { kind: 'patron' };

export class AesiGame extends Game<AesiGame> {
  override mulliganRule(): MulliganRule | null {
    return this.config.smart_mulligan ? MULLIGAN : null;
  }
  override colors = ['G', 'U'];
  dropsUsed = 0; // land drops used this turn
  dropsBonus = 0; // extra drops for this turn only (Explore, Summer Bloom, the Saga)
  epic = false; // an epic spell resolved: no more spells for the rest of the game
  swarmCopies = 0; // Endless Swarm epic copies each upkeep
  dominionCopies = 0; // Eternal Dominion epic copies each upkeep
  infMana = false; // a loop gives endless mana this turn
  kodamaBusy = false; // a permanent is being put onto the battlefield by Kodama (it doesn't trigger Kodama)
  comboKey: string | null = null; // the loop solver skips a board it has already looked at
  footstepsExiled = false; // Beanstalk Giant on an adventure: castable from exile
  loopWinHow: string | null = null; // how the game was won (for the stats and the trace)
  revolt = false; // Nature's Revolt: all lands are 2/2 creatures
  affinity = false; // Natural Affinity this turn: all lands are 2/2 creatures
  awakened = false; // Sylvan Awakening until our next turn: our lands are 2/2 creatures with haste
  // ---- measures for --diag (they change nothing in the game)
  aesiOut: number | null = null; // the turn Aesi first entered the battlefield
  aesiDraw: number | null = null; // the first turn a land entered while Aesi was out (his first landfall draw)
  castsByTurn: number[] = []; // nonland spells cast in each turn
  landsEnd: number[] = []; // lands on the battlefield at the end of each turn
  locked = false; // every opponent's land bounced over and over (counts as a win with land_lock_win)

  /** Lands are creatures now (a land that entered this turn then can't tap for mana, unless it has haste). */
  landsCreatures(): boolean {
    return this.revolt || this.affinity || this.awakened;
  }
  /** A replayed land taps for mana this turn (not when it's a summoning-sick creature). */
  replayMana(): number {
    return this.landsCreatures() && !this.awakened ? 0 : 1;
  }
  override areOpponentsBeaten(): boolean {
    return this.locked || super.areOpponentsBeaten();
  }

  // ================================================================ the win condition
  override checkKill(): number {
    if (this.died) return 2;
    if (this.inArena() && !this.areOpponentsBeaten())
      this.podPre = [
        this.life.slice(),
        this.opponentLibrarySizes.slice(),
        this.poison.slice(),
      ];
    if (!this.areOpponentsBeaten()) solveLoops(this);
    if (this.areOpponentsBeaten()) {
      if (this.unprotectedKillTurn === null) {
        this.unprotectedKillTurn = this.turn;
        this.say(
          `WIN: ${this.describeOpponentLife()}, libraries [${this.opponentLibrarySizes.join(', ')}]`,
        );
      }
      return 2;
    }
    return 0;
  }
  override play(): [number | null, number | null] {
    super.play();
    this.castsByTurn[this.turn] = this.spellsCast;
    return [
      this.died ? null : this.unprotectedKillTurn,
      this.firstOpponentDeadTurn,
    ];
  }
  override diag(): Record<string, number | null> {
    const castsUpToTurn = (lastTurn: number) =>
      this.castsByTurn
        .slice(1, lastTurn + 1)
        .reduce((total, value) => total + (value ?? 0), 0);
    return {
      aesiOut: this.aesiOut,
      aesiDraw: this.aesiDraw,
      casts4: castsUpToTurn(4),
      casts5: castsUpToTurn(5),
      casts6: castsUpToTurn(6),
      spent4: this.spentEnd[4] ?? null,
      spent5: this.spentEnd[5] ?? null,
      spent6: this.spentEnd[6] ?? null,
      lands4: this.landsEnd[4] ?? null,
      lands5: this.landsEnd[5] ?? null,
      lands6: this.landsEnd[6] ?? null,
    };
  }
  libraryCardsToKeep(): number {
    return this.config.keep_library as number;
  }
  /** A pod: a loop win can be answered by countering its finisher (Blue Sun's Zenith, Endless Swarm, Eternal Dominion) or by
   *  removing a loop piece. A counterspell in hand answers one more (Kira and Soratami Rainshaper protect the creatures: Game.podShield). */
  override podWinStopped(): void {
    super.podWinStopped();
    this.loopWinHow = null;
  }
  /** How close to winning the others think we are: Retreat or a land-putter with an untapper, Aesi out, many lands. */
  override podClose(): number {
    let closeness = 0;
    if (this.isOnBattlefield(RETREAT) || this.isOnBattlefield(OMNI))
      closeness += 0.5;
    if (this.battlefield.some((permanent) => PUTTERS.has(permanent.card.name)))
      closeness += 0.2;
    if (this.isOnBattlefield(AESI)) closeness += 0.2;
    if (this.landsOnBattlefield().length >= 9) closeness += 0.2;
    return Math.min(1, closeness);
  }
  override winAttempt(): WinAttempt | null {
    const how = this.loopWinHow;
    if (!how) return null;
    const spells = [BSZ, SWARM, DOMINION].filter((name) => how.includes(name));
    const perms = [
      RETREAT,
      RAFT,
      OMNI,
      KODAMA,
      MELOKU,
      UYO,
      MINDSWEEPER,
      ...PUTTERS,
      KIRI,
      HARU,
      PATRON,
      COBRA,
      AESI,
    ].filter((name) => this.isOnBattlefield(name));
    const backup = this.hand.some(
      (card) => this.answer(card)?.kind === 'counter',
    )
      ? 1
      : 0;
    return { spells, perms, backup };
  }
  /** An opponent milled out (they lose at their next draw; counted now). */
  millOut(i: number): void {
    if (this.opponentLibrarySizes[i] <= 0) return;
    this.opponentLibrarySizes[i] = 0;
    if (this.firstOpponentDeadTurn === null)
      this.firstOpponentDeadTurn = this.turn;
  }
  millAll(how: string): void {
    for (let i = 0; i < this.opponentLibrarySizes.length; i++)
      if (this.isOpponentAlive(i)) this.millOut(i);
    this.loopWinHow = how;
    this.say('LOOP WIN: ' + how);
  }

  // ---------------------------------------------------------------- kill search (only for the log analyzer)
  /** A copy of the game to run the loop solver on (nextTurn: untapped, a fresh land drop). */
  buildKillSearchState(nextTurn = false): AesiGame {
    const copy = nextTurn ? this.copyAtNextTurn() : this.copyForSearch();
    copy.verbose = true; // the solver's log is the kill line
    copy.comboKey = null;
    return copy;
  }
  killSearchStateKey(): string {
    return '';
  }
  override addLandToKillSearchState(game: AesiGame): void {
    game.dropsUsed = Math.max(0, game.dropsUsed - 1);
  }
  override addManaToKillSearchState(game: AesiGame, amount: number): void {
    game.pool.G += amount;
  }
  killSearch(): KillSearcher<AesiGame> {
    const killSearcher: KillSearcher<AesiGame> = {
      lastLine: null,
      lastLineProbability: null,
      bestMiss: null,
      minChance: 1,
      search: (game: AesiGame) => {
        const lives = game.areOpponentsBeaten();
        game.comboSolve();
        killSearcher.lastLine = game.log.map((event) => ({
          kind: 'logged',
          text: event.text,
        }));
        if (!lives && game.areOpponentsBeaten()) return 1;
        if (
          game.battlefield.some(
            (permanent) =>
              permanent.card === TOK.illusionArmy ||
              permanent.card === TOK.snakeArmy,
          ) ||
          game.dominionCopies >= (game.config.dominion_win as number)
        ) {
          killSearcher.lastLine.push({
            kind: 'logged',
            text: '(wins on the next turn)',
          });
          return 1;
        }
        return 0;
      },
    };
    return killSearcher;
  }
  override syncFromLog(board: LogBoardView): void {
    this.dropsUsed = Math.min(board.landsFromHand, this.dropsAllowed());
    for (const permanent of this.battlefield) {
      if (permanent.card.name === DRUID)
        permanent.counters = Math.max(1, permanent.counters);
      if (permanent.card.name === SAGA)
        permanent.counters = Math.max(1, permanent.counters);
    }
  }
  override logToken(name: string): CardDef | null {
    const lowerCaseName = name.toLowerCase();
    if (lowerCaseName.includes('illusion')) return TOK.illusion;
    if (lowerCaseName.includes('snake')) return TOK.snake;
    if (lowerCaseName.includes('elemental'))
      return makeToken(
        'Elemental',
        this.landsOnBattlefield().length,
        this.landsOnBattlefield().length,
        'green',
      );
    return null; // Blue Sun's Zenith copies and other markers
  }

  // ================================================================ land drops and land puts
  dropsAllowed(): number {
    let drops = 1 + this.dropsBonus;
    for (const permanent of this.battlefield) {
      const name = permanent.card.name;
      if (name === AESI || name === 'Loot, Exuberant Explorer' || name === CASE)
        drops += 1;
      else if (name === 'Azusa, Lost but Seeking') drops += 2;
      else if (name === DRUID && permanent.counters >= 2) drops += 1;
    }
    return drops;
  }
  canDrop(): boolean {
    return this.dropsUsed < this.dropsAllowed();
  }
  landsInHand(): CardDef[] {
    return this.hand.filter((card) => card.land !== null);
  }
  /** Lands that come back untapped (basics, Reliquary Tower, Demolition Field): they pay for a loop. */
  untappedLand(card: CardDef): boolean {
    return entersUntapped(this, card);
  }
  readyPutters(): Permanent[] {
    return creaturesReadyToPutALand(this);
  }
  /** How to get a land from hand onto the battlefield now, best first: a "put" creature when Retreat
   *  will untap it, else a land drop, else a put creature, else Patron of the Moon. */
  landWay(): Way | null {
    return wayToPutALand(this);
  }
  /** Which land from hand to play: a basic we need the colour of, fetch lands when the mana can wait. */
  chooseLand(lands: CardDef[]): CardDef {
    return landToPut(this, lands);
  }
  /** A spell in hand we could cast with one more mana. */
  needManaNow(): boolean {
    const avail = this.availMana();
    return [...this.hand, ...this.command].some(
      (card) =>
        card.land === null &&
        !HOLD.has(card.name) &&
        this.effectiveCost(card).manaValue === avail + 1,
    );
  }
  wantColour(): string {
    return colourWeWant(this);
  }

  /** Play one land from hand (the best way, or the given one). */
  playLandVia(
    way: Way | null = null,
    otherCard: CardDef | null = null,
  ): boolean {
    return putLandThatWay(this, way, otherCard);
  }
  override playLand(): void {
    this.caseTop();
    this.playLandVia();
  }
  override develop(main2 = false): boolean {
    this.caseTop();
    return super.develop(main2);
  }
  /** Case of the Locked Hothouse solved: play lands and cast creatures / enchantments from the top of the
   *  library. (A fixed step, not a choice: the planner's copies shuffle the library, so their choices
   *  mustn't depend on the top card.) */
  caseTop(): void {
    playLandsFromTopWithCase(this);
  }

  /** A land enters from hand or library. Fetch lands crack at once (two landfall triggers, the basic
   *  enters tapped). Simic Growth Chamber returns a land. */
  putLand(
    card: CardDef,
    from: 'hand' | 'library',
    how: string,
    tapped = false,
  ): Permanent | null {
    return putLandOntoBattlefield(this, card, from, how, tapped);
  }
  /** Simic Growth Chamber: return a land (a tapped basic; tap an untapped one for mana first). */
  chamberBounce(self: Permanent): void {
    returnLandForGrowthChamber(this, self);
  }
  /** Search the library for a basic land (only = Forest or Island; the colour we need if not given). The engine
   *  does the search; chooseLandToFetch picks the land. */
  fetchBasic(
    options: { tapped?: boolean; toHand?: boolean; only?: string } = {},
  ): boolean {
    const kind =
      options.only === 'Forest'
        ? 'forest'
        : options.only === 'Island'
          ? 'types'
          : 'basic';
    return fetchLand(this, kind, !!options.tapped, !!options.toHand) !== null;
  }
  /** The land enters before the shuffle (landfall draws come from the unshuffled library) and counts as having
   *  entered this turn (matters only when lands are creatures). */
  override putSearchedLand(land: CardDef, tapped: boolean): void {
    const permanent = new Permanent(land, land.land, tapped);
    permanent.sick = true;
    this.putOntoBattlefield(permanent);
    this.onLandEnter(permanent, false);
    this.shuffle();
  }
  /** The basic of the colour we need, else any basic. */
  override chooseLandToFetch(candidates: CardDef[], _toHand: boolean): CardDef {
    const wantedBasic = this.wantColour() === 'U' ? 'Island' : 'Forest';
    return (
      candidates.find((card) => card.name === wantedBasic) ??
      candidates.find((card) => card.land?.basic) ??
      candidates[0]
    );
  }

  // ================================================================ landfall and enter triggers
  override onLandEnter(permanent: Permanent, _gone: boolean): void {
    if (this.aesiDraw === null && this.isOnBattlefield(AESI))
      this.aesiDraw = this.turn;
    if (permanent.land?.scry && !_gone) this.scry(1); // Temple of Mystery
    for (const otherPermanent of this.battlefield.slice()) {
      const name = otherPermanent.card.name;
      if (name === AESI && this.library.length > this.libraryCardsToKeep())
        this.draw(1);
      else if (name === COBRA) {
        if (this.pool.U <= this.pool.G) this.pool.U += 1;
        else this.pool.G += 1;
      } else if (name === DRUID) this.gainLife(1);
      else if (name === KHALNI) otherPermanent.counters += 1;
      else if (name === RETREAT) this.retreat(true);
      else if (name === RAFT) this.retreat(false);
      else if (
        name === TATYOVA &&
        this.library.length > this.libraryCardsToKeep()
      )
        this.draw(1);
    }
    if (!this.kodamaBusy) this.kodamaTrigger(permanent.card.manaValue);
  }
  /** Retreat or Elven Raft-Steerer on a landfall: Retreat's tap/untap mode, and Retreat alone can scry. */
  hasUntapper(): boolean {
    return this.isOnBattlefield(RETREAT) || this.isOnBattlefield(RAFT);
  }
  /** Retreat to Coralhelm: untap a tapped "put" creature (if there's a land to put), Dokai or Loot; else scry 1
   *  (Retreat only). */
  retreat(scry: boolean): void {
    const tapped = this.battlefield.filter(
      (permanent) =>
        permanent.tapped && !permanent.sick && permanent.card.isCreature,
    );
    const lands = this.landsInHand().length > 0;
    const otherPermanent =
      tapped.find(
        (permanent) =>
          PUTTERS.has(permanent.card.name) &&
          !(permanent.card.name === BUDOKA && permanent.transformed) &&
          lands,
      ) ??
      tapped.find(
        (permanent) => permanent.card.name === BUDOKA && permanent.transformed,
      ) ??
      tapped.find(
        (permanent) => permanent.card.name === 'Loot, Exuberant Explorer',
      );
    if (otherPermanent) otherPermanent.tapped = false;
    else if (this.landsCreatures()) {
      // lands are creatures: untap a tapped land that can tap for mana again
      const anotherPermanent = this.landsOnBattlefield().find(
        (permanent) =>
          permanent.tapped &&
          (!permanent.sick || this.awakened) &&
          this.manaSourceKind(permanent, true),
      );
      if (anotherPermanent) anotherPermanent.tapped = false;
      else if (scry) this.scry(1);
    } else if (scry) this.scry(1);
  }
  /** Kodama of the East Tree: another permanent entered (not put by Kodama): put a permanent card with
   *  equal or lesser mana value from hand onto the battlefield. */
  kodamaTrigger(manaValue: number): void {
    if (!this.isOnBattlefield(KODAMA)) return;
    const perms = this.hand.filter(
      (card) =>
        card.manaValue <= manaValue &&
        (card.land !== null ||
          card.name === INVASION || // a battle
          card.types.has('creature') ||
          card.types.has('artifact') ||
          card.types.has('enchantment')),
    );
    if (!perms.length) return;
    const nonland = perms.filter((card) => card.land === null);
    const otherCard = nonland.length
      ? firstMax(nonland, (card) => this.battlefieldValue(card))
      : this.chooseLand(perms);
    this.kodamaBusy = true;
    try {
      if (otherCard.land !== null)
        this.putLand(otherCard, 'hand', 'Kodama puts');
      else {
        this.takeCardIfThere(otherCard, 'hand');
        this.say('Kodama puts', otherCard);
        this.enter(otherCard);
      }
    } finally {
      this.kodamaBusy = false;
    }
  }

  override onEnter(permanent: Permanent, _from: Zone): void {
    const name = permanent.card.name;
    if (name === AESI && this.aesiOut === null) this.aesiOut = this.turn;
    if (name === HARU && !permanent.token) this.draw(1);
    if (name === ELVES && !permanent.token)
      this.fetchBasic({ only: 'Forest' }); // untapped
    else if (name === DRUID || name === SAGA) permanent.counters = 1;
    if (name === SAGA) this.dropsBonus += 1; // chapter I: an additional land this turn
    if (name === REVOLT) this.revolt = true;
    if (name === INVASION && !permanent.token) {
      permanent.counters = SIEGE_DEFENSE; // (a battle: its defense counters)
      this.fetchBasic({ tapped: true });
      this.fetchBasic({ tapped: true });
    }
    if (!this.kodamaBusy && permanent.land === null && name !== KODAMA)
      this.kodamaTrigger(permanent.card.manaValue);
  }

  // ================================================================ mana
  reduction(): number {
    let total = 0;
    for (const permanent of this.battlefield)
      total += REDUCERS[permanent.card.name] ?? 0;
    return total;
  }
  /** An activated ability of one of our creatures, after Familiar / Training Grounds / Heartstone. */
  abilityCost(cost: Cost): Cost {
    const coloured = cost.manaValue - cost.generic;
    const generic = Math.max(
      coloured > 0 ? 0 : 1,
      cost.generic - this.reduction(),
    );
    return cost.withGeneric(generic);
  }
  /** Untapped mana right now (roughly: each source counts what it makes). */
  availMana(): number {
    if (this.infMana) return 99;
    let mana =
      this.pool.U +
      this.pool.G +
      this.pool.C +
      this.pool.B +
      this.pool.W +
      this.pool.R;
    for (const permanent of this.battlefield) {
      if (permanent.tapped) continue;
      const kind = this.manaSourceKind(permanent);
      if (kind === null) continue;
      mana += kind === 'C2' || kind === 'GU' ? 2 : 1;
    }
    return mana;
  }
  override manaSourceKind(
    permanent: Permanent,
    ignoreSick = false,
  ): string | null {
    if (
      permanent.land !== null &&
      permanent.sick &&
      !ignoreSick &&
      (this.revolt || this.affinity) &&
      !this.awakened
    )
      return null;
    return super.manaSourceKind(permanent, ignoreSick);
  }
  override pay(cost: Cost, isInstantOrSorcery = false, commit = true): boolean {
    if (this.infMana) return true;
    return super.pay(cost, isInstantOrSorcery, commit);
  }
  override castPerm(card: CardDef, fromCommand = false): boolean {
    if (this.epic) return false;
    const wasCast = super.castPerm(card, fromCommand);
    if (wasCast && SPIRITS.has(card.name)) this.spiritCast();
    return wasCast;
  }
  override castInstantOrSorcery(
    card: CardDef,
    fromGraveyard = false,
    base: Cost | null = null,
    mode: string | null = null,
    triggers: Record<string, unknown> = {},
  ): boolean {
    if (this.epic) return false;
    return super.castInstantOrSorcery(
      card,
      fromGraveyard,
      base,
      mode,
      triggers,
    );
  }
  /** A Spirit was cast: Haru-Onna and Kiri-Onna may return to hand (only worth it with Omniscience). */
  spiritCast(): void {}

  // ================================================================ card values
  override battlefieldValue(card: CardDef): number {
    return VALUE[card.name] ?? (card.isCreature ? 40 : 30);
  }
  override cardValue(card: CardDef): number {
    if (card.land !== null) {
      // lands stay good: every one is a landfall draw; less so once the hand has more than we can play
      const spare = this.countLandsHand() - this.dropsAllowed();
      return spare <= 0 ? 70 : spare <= 2 ? 50 : 30;
    }
    if (HOLD.has(card.name)) return 10;
    if (RAMP.has(card.name) && this.landsOnBattlefield().length >= 10)
      return 30;
    return this.battlefieldValue(card);
  }

  // ================================================================ turn steps
  override startTurn(): void {
    if (this.turn > 0) this.castsByTurn[this.turn] = this.spellsCast; // (the base class resets it)
    super.startTurn();
  }
  override beginNewTurn(): void {
    super.beginNewTurn();
    this.dropsUsed = 0;
    this.dropsBonus = 0;
    this.infMana = false;
    this.comboKey = null;
    this.affinity = false;
    this.awakened = false; // Sylvan Awakening lasts until our next turn
    this.lastLoopSay = '';
  }

  /** Search for Tomorrow, suspended: it comes out two upkeeps later (cast for free) and fetches a basic. */
  suspended: { card: CardDef; left: number }[] = [];
  override clone(): this {
    const copy = super.clone();
    copy.suspended = this.suspended.map((entry) => ({ ...entry }));
    return copy;
  }
  suspendSearch(card: CardDef): boolean {
    if (!this.pay(Cost.parse('{G}'), true)) return false;
    this.takeCardIfThere(card, 'hand');
    this.putCard(card, 'exile'); // suspended cards are in exile (the log needs it)
    this.suspended.push({ card: card, left: 2 });
    this.say('suspend Search for Tomorrow');
    return true;
  }
  override upkeep(): void {
    for (const entry of this.suspended.slice()) {
      if (--entry.left > 0) continue;
      removeIfPresent(this.suspended, entry);
      this.takeCardIfThere(entry.card, 'exile');
      this.say('Search for Tomorrow comes out of suspend');
      this.resolve(entry.card);
      this.putCard(entry.card, 'graveyard');
    }
    // epic copies (Endless Swarm makes a Snake for each card in hand; Eternal Dominion takes a card)
    if (this.dominionCopies >= (this.config.dominion_win as number)) {
      this.say(
        `Eternal Dominion: ${this.dominionCopies} copies take the opponents' best cards -> win`,
      );
      for (let i = 0; i < this.life.length; i++)
        if (this.isOpponentAlive(i)) this.damageOpponent(i, this.life[i]);
      this.loopWinHow = 'Eternal Dominion copies';
      return;
    }
    for (let i = 0; i < this.swarmCopies; i++)
      this.makeSnakes(this.hand.length);
    for (let i = 0; i < this.dominionCopies; i++) this.putStolenLand();
    // the Saga's next chapter (really after the draw step; close enough)
    for (const permanent of this.battlefield.filter(
      (otherPermanent) => otherPermanent.card.name === SAGA,
    )) {
      permanent.counters += 1;
      if (permanent.counters === 2) this.gainLife(3);
      else if (permanent.counters >= 3) permanent.transformed = true; // Likeness of the Seeker (a 3/3 nobody minds)
    }
    // Into the Wilds: a land on top goes onto the battlefield
    for (const _ of this.battlefield.filter(
      (permanent) => permanent.card.name === 'Into the Wilds',
    )) {
      const top = this.library[0];
      if (
        top &&
        top.land !== null &&
        this.library.length > this.libraryCardsToKeep()
      )
        this.putLand(top, 'library', 'Into the Wilds');
    }
  }

  /** Awakened Skyclave off the battlefield is the Invasion of Zendikar card again. */
  override putCard(card: CardDef, toZone: CardListZone): void {
    super.putCard(card === SKYCLAVE ? C.get(INVASION) : card, toZone);
  }

  putStolenLand(): void {
    const permanent = new Permanent(STOLEN_LAND, STOLEN_LAND.land);
    permanent.sick = false;
    this.putOntoBattlefield(permanent);
    this.say('Eternal Dominion takes a land');
    this.onLandEnter(permanent, false);
  }
  makeSnakes(count: number): void {
    if (count <= 0) return;
    if (count >= 40) {
      // a horde: one ground "army" (opponents block half of it)
      const permanent = this.enter(TOK.snake, 'token', { token: true });
      permanent.counters = Math.ceil(count / 2) - 1;
      this.say(`Endless Swarm: ${count} Snakes`);
      return;
    }
    for (let i = 0; i < count; i++)
      this.enter(TOK.snake, 'token', { token: true });
    this.say(`Endless Swarm: ${count} Snakes`);
  }

  override endTurn(): void {
    this.endStep();
    if (this.turn <= 6) {
      this.landsEnd[this.turn] = this.landsOnBattlefield().length;
    }
    if (this.hand.length > 7 && !this.hasNoMaximumHandSize())
      this.discard(this.hand.length - 7);
  }

  override endStep(): void {
    const permanent = this.findPermanent(CASE);
    if (
      permanent &&
      !permanent.transformed &&
      this.landsOnBattlefield().length >= 7
    ) {
      permanent.transformed = true;
      this.say('Case of the Locked Hothouse solved');
    }
  }

  // ================================================================ combat
  /** Flyers attack whenever they can; ground creatures only if attacking with everything kills the table
   *  (opponents block half of them, the biggest). No crackback. */
  override combat(): void {
    attackAsAesi(this);
  }
  /** Flyers attack Invasion of Zendikar first, the smallest ones until its defense is gone (the opponent
   *  protecting it can't block flyers in a goldfish game). Returns the power sent at it. */
  attackSiege(siege: Permanent, flyers: Permanent[]): number {
    return attackTheSiege(this, siege, flyers);
  }
  /** A defeated Siege is exiled and cast transformed: Awakened Skyclave enters as a land (a landfall trigger). */
  defeatSiege(siege: Permanent): void {
    defeatTheSiege(this, siege);
  }
  loops(): Loops {
    return findLoops(this);
  }

  comboSolve(): boolean {
    return solveLoops(this);
  }

  /** Cast the most useful card for the loops that we can pay for (free with Omniscience). */
  /** Mana the solver keeps unspent so the loop that's going can keep going. */
  loopReserve = 0;
  lastLoopSay = '';

  /** The turn planner may pick any of its best few plays, but with aesi_first it never passes up casting Aesi. */
  override plan(options: number[], main2: boolean): number {
    if (this.config.aesi_first && this.command.length) {
      const candidates = this.orderedCandidates(main2);
      const i = options.find(
        (optionIndex) => candidates[optionIndex]?.score === 96,
      ); // (the commander's score; nothing else uses 96)
      if (i !== undefined) return i;
    }
    return super.plan(options, main2);
  }
  candidates(main2: boolean): Candidate[] {
    return buildCandidates(this, main2);
  }

  landTutorTarget(): CardDef | null {
    return chooseLandTutorTarget(this);
  }

  /** Uyo outside a loop: copy a ramp / draw spell (returning two lands we replay with spare drops). */
  override castTriggers(
    card: CardDef,
    _fromGraveyard: boolean,
    _trig: Record<string, unknown>,
  ): void {
    if (!UYO_COPY.has(card.name) || !this.isOnBattlefield(UYO) || this.epic)
      return;
    const basics = this.landsOnBattlefield().filter((permanent) =>
      this.untappedLand(permanent.card),
    );
    const replays =
      this.dropsAllowed() - this.dropsUsed + this.readyPutters().length;
    if (basics.length < 8 || !(FETCHES_TWO.has(card.name) || replays >= 2))
      return;
    const cost = this.abilityCost(new Cost(2));
    if (!this.pay(cost)) return;
    const landsToReturn = basics
      .sort(
        (permanent, otherPermanent) =>
          +otherPermanent.tapped - +permanent.tapped,
      )
      .slice(0, 2);
    for (const anotherPermanent of landsToReturn) {
      if (!anotherPermanent.tapped && this.manaSourceKind(anotherPermanent))
        this.tap(anotherPermanent, 'N'); // float its mana first
      this.takeFromBattlefieldIfThere(anotherPermanent);
      this.putCard(anotherPermanent.card, 'hand');
    }
    this.say(
      `Uyo copies ${card.name} (returning ${landsToReturn.map((permanent) => permanent.card.name).join(', ')})`,
    );
    this.resolve(card, false, 'copy');
  }

  // ================================================================ spells
  override resolve(
    card: CardDef,
    fromGraveyard = false,
    mode: string | null = null,
  ): void {
    if (!resolveAesiSpell(this, card, mode))
      super.resolve(card, fromGraveyard, mode);
  }

  // ================================================================ the planner's score
  override positionValue(): number {
    if (this.died) return -5000;
    let value = 0;
    const start = this.config.opp_life as number,
      startingLibrarySize = this.config.opp_library as number;
    for (let i = 0; i < this.life.length; i++) {
      value +=
        2 * (start - Math.max(0, this.life[i])) +
        0.5 * (startingLibrarySize - this.opponentLibrarySizes[i]);
      if (!this.isOpponentAlive(i)) value += 60;
    }
    if (
      this.battlefield.some(
        (permanent) =>
          permanent.card === TOK.illusionArmy ||
          permanent.card === TOK.snakeArmy,
      )
    )
      value += 3000;
    const landCount = this.landsOnBattlefield().length;
    value += 24 * Math.min(landCount, 12) + 6 * Math.max(0, landCount - 12);
    for (const otherPermanent of this.battlefield) {
      if (otherPermanent.land !== null) continue;
      if (otherPermanent.token) value += 4 + this.power(otherPermanent);
      else value += 0.8 * this.battlefieldValue(otherPermanent.card);
    }
    value += 10 * (this.dropsAllowed() - 1);
    value +=
      0.4 * this.hand.reduce((total, card) => total + this.cardValue(card), 0);
    if (this.command.length === 0) value += 20; // Aesi out
    return value;
  }
}
