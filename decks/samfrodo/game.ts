/**
 * The Sam & Frodo deck's AI (Abzan tokens / aristocrats): the rules of its cards, what it wants to do
 * each turn, and the rules agreed for this deck (see PLAN.md).
 *
 * Files:
 *   cards.ts       the card names and the facts about them (values, token definitions, Halfling check)
 *   game.ts        this file: SamFrodoGame, its state, life gain, tokens, sacrifice values, mana and turn steps
 *   triggers.ts    what happens when a permanent enters, dies or a Food is sacrificed
 *   candidates.ts  everything the AI may do now, with a score each
 *   actions.ts     what the abilities do when the AI picks them
 *   combat.ts      goldfish combat, pod combat and the all-in attack
 *
 * Win: all three opponents at 0 life (40 each). Second measure: first opponent dead.
 * Single-target drains ("target opponent loses ...") go to the opponent with the most life, so all
 * three go down together and "each opponent" drains never hit a dead player.
 * Attacks: only Frodo (for the Ring and its card draw) and Gollum (for its end-step drain), unless
 * attacking with everything kills the table. No crackback (those attacks are tiny).
 * The game itself (mana, zones, casting, turns) is the shared engine in engine/game-core.ts.
 */
import {
  ART_TOKENS,
  BASIC_COL,
  CLUE,
  FOOD,
  FRODO,
  GOLLUM,
  HOLD,
  OWN_KILL,
  OWN_KILL_EXILES,
  RAMP_EARLY,
  RING_TRACKER,
  SAGA,
  SAM,
  TOK,
  TREASURE,
  VALUE,
  isHalfling,
} from './cards';
import { buildCandidates } from './candidates';
import { playCombat } from './combat';
import {
  onFoodSacrificed,
  onPermanentDied,
  onPermanentEntered,
} from './triggers';
import { CardDef, Cost } from '../../engine/cards';
import { Candidate, Evasion, Permanent, Zone } from '../../engine/game-types';
import { GameWithoutKillSearch } from '../../engine/game';
import { firstMax } from '../../engine/lists';
import { MulliganRule } from '../../engine/mulligan';
import { MULLIGAN } from './mulligan';

type Phase = 'main1' | 'combat' | 'main2' | 'end';

export class SamFrodoGame extends GameWithoutKillSearch {
  override mulliganRule(): MulliganRule | null {
    return this.config.smart_mulligan ? MULLIGAN : null;
  }
  override colors = ['W', 'B', 'G'];
  phase: Phase = 'main1';
  lifeGainedThisTurn = 0; // life gained this turn
  firstLifeGainHappened = false; // Cat Collector: first life gain this turn happened
  foodSacrificedThisTurn = false; // a Food was sacrificed this turn (Elanor)
  belladonnaTriggers = 0; // Belladonna Took: times its ability resolved this turn
  merryUsed = false; // Merry: once each turn
  ringTempts = 0; // the Ring tempted us (Frodo is always the Ring-bearer)
  gollumHit: boolean[] = new Array(this.life.length).fill(false); // opponents dealt combat damage by Gollum this game
  pigRibbonCounters = 0; // Prize Pig's ribbon counters
  farmerCottonX = 0; // X for Farmer Cotton while it enters
  allInWin = false; // the win came from an all-in attack (for the stats)

  // ================================================================ the win condition
  hasWon(): boolean {
    return (
      this.life.filter((life) => life <= 0).length >=
      (this.config.win_dead as number)
    );
  }
  override areOpponentsBeaten(): boolean {
    return this.hasWon();
  }
  override checkKill(): number {
    if (this.died) return 2;
    if (this.hasWon()) {
      if (this.unprotectedKillTurn === null) {
        this.unprotectedKillTurn = this.turn;
        this.say(`WIN: ${this.describeOpponentLife()}`);
      }
      return 2;
    }
    return 0;
  }
  override play(): [number | null, number | null] {
    super.play();
    return [
      this.died ? null : this.unprotectedKillTurn,
      this.firstOpponentDeadTurn,
    ];
  }
  // ---------------------------------------------------------------- log analyzer hooks
  override syncFromLog(board: { trackers: Record<string, number> }): void {
    this.ringTempts = board.trackers[RING_TRACKER] ?? 0;
  }
  override logToken(name: string): CardDef | null {
    const lowerCaseName = name.toLowerCase();
    if (lowerCaseName.includes('food')) return FOOD;
    if (lowerCaseName.includes('treasure')) return TREASURE;
    if (lowerCaseName.includes('clue')) return CLUE;
    if (lowerCaseName.includes('soldier')) return TOK.soldier;
    if (lowerCaseName.includes('halfling')) return TOK.halfling;
    if (lowerCaseName.includes('cat')) return TOK.cat;
    if (lowerCaseName.includes('goat')) return TOK.goat;
    if (lowerCaseName.includes('bird')) return TOK.bird;
    if (lowerCaseName.includes('servo')) return TOK.servo;
    return null;
  }

  override clone(): this {
    const copy = super.clone();
    copy.gollumHit = this.gollumHit.slice();
    return copy;
  }

  // ================================================================ drains
  /** "Target opponent": the one with the most life (keeps the three even). */
  opponentWithMostLife(): number | null {
    let best: number | null = null;
    for (let i = 0; i < this.life.length; i++)
      if (
        this.isOpponentAlive(i) &&
        (best === null || this.life[i] > this.life[best])
      )
        best = i;
    return best;
  }
  drainTargetOpponent(amount: number): void {
    const target = this.opponentWithMostLife();
    if (target !== null && amount > 0) this.damageOpponent(target, amount);
  }

  override gainLife(amount: number): void {
    if (amount <= 0) return;
    super.gainLife(amount);
    this.lifeGainedThisTurn += amount;
    if (!this.firstLifeGainHappened) {
      this.firstLifeGainHappened = true;
      for (const permanent of this.battlefield.filter(
        (candidate) => candidate.card.name === 'Cat Collector',
      ))
        if (this.battlefield.includes(permanent)) this.makeTokens([TOK.cat]);
    }
    for (const battlefieldPermanent of this.battlefield)
      if (battlefieldPermanent.card.name === 'Sanguine Bond')
        this.drainTargetOpponent(amount);
    const pig = this.findPermanent('Prize Pig');
    if (pig) {
      this.pigRibbonCounters += amount;
      if (this.pigRibbonCounters >= 3) {
        this.pigRibbonCounters = 0;
        pig.tapped = false;
      }
    }
    if (this.phase !== 'main1') {
      if (this.isOnBattlefield('Dawn of Hope') && this.pay(new Cost(2))) {
        this.say('Dawn of Hope: pay 2, draw');
        this.draw(1);
      }
      if (this.isOnBattlefield('Well of Lost Dreams')) {
        let payableAmount = 0;
        while (
          payableAmount < amount &&
          this.canPay(new Cost(payableAmount + 1))
        )
          payableAmount++;
        if (payableAmount > 0 && this.pay(new Cost(payableAmount))) {
          this.say(`Well of Lost Dreams: draw ${payableAmount}`);
          this.draw(payableAmount);
        }
      }
    }
  }

  // ================================================================ tokens
  /** Create tokens as one event: Peregrin Took and Tippy-Toe add a Food each, Academy Manufactor turns each
   *  Food / Clue / Treasure into one of each. Then each token enters (and "create" triggers fire). */
  makeTokens(cds: CardDef[], options: { tapped?: boolean } = {}): Permanent[] {
    if (!cds.length) return [];
    const list = cds.slice();
    if (this.isOnBattlefield('Peregrin Took')) list.push(FOOD);
    if (this.isOnBattlefield('Tippy-Toe, Terrific Partner')) list.push(FOOD);
    const all = this.isOnBattlefield('Academy Manufactor')
      ? list.flatMap((card) =>
          ART_TOKENS.has(card) ? [FOOD, CLUE, TREASURE] : [card],
        )
      : list;
    const out: Permanent[] = [];
    for (const tokenCard of all) {
      const permanent = this.enter(tokenCard, 'token', {
        token: true,
        tapped: options.tapped,
      });
      out.push(permanent);
      // "whenever you create a token"
      for (const battlefieldPermanent of this.battlefield.slice()) {
        if (battlefieldPermanent.card.name === 'Mirkwood Bats')
          this.drainEach(1);
        else if (
          battlefieldPermanent.card.name === 'Rosie Cotton of South Lane'
        ) {
          const counterRecipient = this.bestCounterTarget(battlefieldPermanent);
          if (counterRecipient) counterRecipient.counters += 1;
        }
      }
    }
    return out;
  }

  /** The best creature for a +1/+1 counter: Marionette Master (its power is the drain), Rapacious Guest, Frodo. */
  bestCounterTarget(exclude: Permanent | null = null): Permanent | null {
    const permanents = this.creatures().filter(
      (permanent) => permanent !== exclude,
    );
    if (!permanents.length) return null;
    const pri = (permanent: Permanent) =>
      permanent.card.name === 'Marionette Master'
        ? 5
        : permanent.card.name === 'Rapacious Guest'
          ? 4
          : permanent.card.name === FRODO
            ? 3
            : permanent.card.name === GOLLUM
              ? 2
              : permanent.token
                ? 0
                : 1;
    return firstMax(permanents, pri);
  }

  foodsOnBattlefield(): Permanent[] {
    return this.battlefield.filter((permanent) => permanent.card === FOOD);
  }

  halflingCount(): number {
    return this.creatures().filter((permanent) => isHalfling(permanent.card))
      .length;
  }
  override onEnter(permanent: Permanent, _from: Zone): void {
    return onPermanentEntered(this, permanent, _from);
  }

  // ================================================================ leaving
  override sacrifice(permanent: Permanent): void {
    if (!this.battlefield.includes(permanent)) return;
    const food = permanent.card === FOOD;
    super.sacrifice(permanent); // -> dies -> onDies
    for (const battlefieldPermanent of this.battlefield) {
      if (battlefieldPermanent.card.name === 'Popular Egotist') {
        this.drainTargetOpponent(1);
        this.gainLife(1);
      } else if (
        battlefieldPermanent.card.name === 'Mirkwood Bats' &&
        permanent.token
      )
        this.drainEach(1);
    }
    if (food) onFoodSacrificed(this);
  }
  override onDies(permanent: Permanent): void {
    return onPermanentDied(this, permanent);
  }

  /** Opponents' total life loss if this permanent were sacrificed now (the payoffs on the battlefield). */
  sacrificeValue(permanent: Permanent): number {
    const key = permanent.token
      ? permanent.card === FOOD
        ? 'F'
        : permanent.card === TREASURE
          ? 'T'
          : permanent.card === CLUE
            ? 'L'
            : 't' +
              +permanent.isCreature +
              +permanent.card.types.has('artifact')
      : null;
    if (key !== null && this.sacrificeValueCache) {
      const cached = this.sacrificeValueCache.get(key);
      if (cached !== undefined) return cached;
    }
    const value = this.computeSacrificeValue(permanent);
    if (key !== null && this.sacrificeValueCache)
      this.sacrificeValueCache.set(key, value);
    return value;
  }
  sacrificeValueCache: Map<string, number> | null = null;
  manaSourcesCache: number | null = null;
  override manaSources(): number {
    return this.manaSourcesCache ?? super.manaSources();
  }

  computeSacrificeValue(permanent: Permanent): number {
    const alive = this.countOpponentsAlive();
    const art = permanent.card.types.has('artifact'),
      cre = permanent.card.isCreature;
    const bond = this.battlefield.filter(
      (candidate) => candidate.card.name === 'Sanguine Bond',
    ).length;
    let total = 0;
    for (const battlefieldPermanent of this.battlefield) {
      if (battlefieldPermanent === permanent) continue;
      const name = battlefieldPermanent.card.name;
      if (name === 'Popular Egotist') total += 1 + bond;
      else if (name === 'Mirkwood Bats' && permanent.token) total += alive;
      else if (name === 'Marionette Apprentice' && (art || cre)) total += alive;
      else if (name === 'Marionette Master' && art)
        total += this.power(battlefieldPermanent);
      else if (name === 'Susurian Voidborn' && (art || cre)) total += 1 + bond;
    }
    return total;
  }

  /** Things we can sacrifice without losing anything we care about: tokens (Foods and Treasures kept as
   *  needed), worst first. */
  spareSacrifices(): Permanent[] {
    const foods = this.foodsOnBattlefield();
    const keepFood =
      (this.isOnBattlefield(SAM) ? 0 : 1) +
      (this.graveyard.some((card) => card.name === 'Cauldron Familiar')
        ? 1
        : 0);
    const keepTreasure = this.turn >= 7 ? 0 : 2;
    let foodLeft = foods.length - keepFood;
    let treasureLeft =
      this.battlefield.filter((permanent) => permanent.card === TREASURE)
        .length - keepTreasure;
    const out: Permanent[] = [];
    for (const battlefieldPermanent of this.battlefield) {
      if (!battlefieldPermanent.token) continue;
      if (battlefieldPermanent.card === FOOD) {
        if (foodLeft-- <= 0) continue;
      } else if (battlefieldPermanent.card === TREASURE) {
        if (treasureLeft-- <= 0) continue;
      } else if (battlefieldPermanent.card.name === 'The Notary Hobbits')
        continue;
      else if (battlefieldPermanent.card === TOK.bird) continue;
      out.push(battlefieldPermanent);
    }
    const rank = (permanent: Permanent) =>
      permanent.card === CLUE
        ? 0
        : permanent.card === TOK.goat
          ? 1
          : permanent.isCreature
            ? 2 + this.power(permanent)
            : permanent.card === FOOD
              ? 3
              : 4;
    return out.sort((first, second) => rank(first) - rank(second));
  }

  // ================================================================ lands
  override onLandEnter(permanent: Permanent, _gone: boolean): void {
    for (const battlefieldPermanent of this.battlefield.slice())
      if (battlefieldPermanent.card.name === 'Tireless Provisioner')
        this.makeTokens([this.manaSources() < 6 ? TREASURE : FOOD]);
    if (
      permanent.card.name === 'Graypelt Refuge' ||
      permanent.card.name === 'Scoured Barrens'
    )
      this.gainLife(1);
  }

  /** Put a basic land from the library onto the battlefield tapped (the colour we have least of). */
  putBasic(
    toHand = false,
    only: string[] = ['Plains', 'Swamp', 'Forest'],
  ): boolean {
    const source = (colour: string) =>
      this.landsOnBattlefield().filter((permanent) => {
        const kind = this.manaSourceKind(permanent, true) ?? '';
        return (
          kind === colour ||
          kind === 'A' ||
          (kind.length === 3 && kind.includes(colour))
        );
      }).length;
    const order = only
      .slice()
      .sort(
        (first, second) => source(BASIC_COL[first]) - source(BASIC_COL[second]),
      );
    for (const name of order) {
      const card = this.library.find((candidate) => candidate.name === name);
      if (!card) continue;
      this.takeCardIfThere(card, 'library');
      this.shuffle();
      if (toHand) this.putCard(card, 'hand');
      else {
        const landPermanent = new Permanent(card, card.land, true);
        landPermanent.sick = false;
        this.putOntoBattlefield(landPermanent);
        this.say('basic land onto the battlefield:', card);
        this.onLandEnter(landPermanent, false);
      }
      return true;
    }
    return false;
  }

  // ================================================================ mana
  override manaSourceKind(
    permanent: Permanent,
    ignoreSick = false,
  ): string | null {
    if (permanent.card === TREASURE) return 'A';
    const name = permanent.card.name;
    if (name === 'Gilded Goose')
      return (ignoreSick || !permanent.sick) && this.foodsOnBattlefield().length
        ? 'A'
        : null;
    if (name === 'The Notary Hobbits') {
      if (!ignoreSick && permanent.sick) return null;
      if (ignoreSick) return 'C1'; // (counting sources: any count will do)
      const halflingCount = this.halflingCount();
      return halflingCount > 0 ? `C${halflingCount}` : null;
    }
    if (permanent.land !== null && this.isOnBattlefield('Chromatic Lantern'))
      return 'A';
    return super.manaSourceKind(permanent, ignoreSick);
  }

  /** Sources with a side effect when tapped for mana: Treasures are sacrificed, Gilded Goose eats a Food,
   *  Pristine Talisman gains 1 life. */
  override pay(cost: Cost, isInstantOrSorcery = false, commit = true): boolean {
    if (!commit) return super.pay(cost, isInstantOrSorcery, false);
    const before = this.battlefield.filter((permanent) => !permanent.tapped);
    if (!super.pay(cost, isInstantOrSorcery, true)) return false;
    for (const tappedSource of before) {
      if (!tappedSource.tapped) continue;
      if (tappedSource.card === TREASURE) this.sacrifice(tappedSource);
      else if (tappedSource.card.name === 'Gilded Goose') {
        const food = this.foodsOnBattlefield()[0];
        if (food) this.sacrifice(food);
      } else if (tappedSource.card.name === 'Pristine Talisman')
        this.gainLife(1);
    }
    return true;
  }

  // ================================================================ card values
  battlefieldValue(card: CardDef): number {
    return VALUE[card.name] ?? (card.isCreature ? 40 : 30);
  }
  override cardValue(card: CardDef): number {
    if (card.land !== null) {
      const manaAndLands = this.manaSources() + this.countLandsHand();
      return manaAndLands <= 3
        ? 80
        : manaAndLands <= 6
          ? 60
          : manaAndLands <= 8
            ? 35
            : 12;
    }
    if (HOLD.has(card.name)) return 10;
    if (RAMP_EARLY.has(card.name) && this.manaSources() >= 7) return 25;
    return this.battlefieldValue(card);
  }
  override discardValue(card: CardDef): number {
    return this.cardValue(card);
  }
  override discard(count: number): void {
    this.manaSourcesCache = super.manaSources();
    try {
      super.discard(count);
    } finally {
      this.manaSourcesCache = null;
    }
  }

  // ================================================================ turn steps
  // ---- measures for --diag (they change nothing in the game)
  permanentsAtTurnEnd: number[] = []; // nonland permanents (tokens too) at the end of turns 4-6
  override diag(): Record<string, number | null> {
    return {
      spent5: this.spentEnd[5] ?? null,
      spent6: this.spentEnd[6] ?? null,
      perms5: this.permanentsAtTurnEnd[5] ?? null,
      perms6: this.permanentsAtTurnEnd[6] ?? null,
    };
  }

  override startTurn(): void {
    if (this.turn >= 4 && this.turn <= 6)
      this.permanentsAtTurnEnd[this.turn] = this.battlefield.filter(
        (permanent) => permanent.land === null,
      ).length;
    super.startTurn();
    this.phase = 'main1';
    this.lifeGainedThisTurn = 0;
    this.firstLifeGainHappened =
      this.foodSacrificedThisTurn =
      this.merryUsed =
        false;
    this.belladonnaTriggers = 0;
  }

  override upkeep(): void {
    // the saga's next chapter (really after the draw step; close enough)
    for (const permanent of this.battlefield.filter(
      (candidate) => candidate.card.name === SAGA,
    )) {
      permanent.counters += 1;
      if (permanent.counters === 2) {
        this.draw(1);
        this.makeTokens([FOOD]);
      } else if (permanent.counters >= 3) {
        this.makeTokens(
          new Array(this.foodsOnBattlefield().length).fill(TOK.halfling),
        );
        this.sacrifice(permanent);
      }
    }
  }

  override develop(main2 = false): boolean {
    this.phase = main2 ? 'main2' : 'main1';
    return super.develop(main2);
  }

  override endStep(): void {
    this.phase = 'end';
    const gainedThisTurn = () => this.lifeGainedThisTurn;
    for (const permanent of this.battlefield.slice())
      if (
        permanent.card.name === 'Gwaihir, Greatest of the Eagles' &&
        gainedThisTurn() >= 3
      )
        this.makeTokens([TOK.bird]);
    if (this.isOnBattlefield(GOLLUM) && gainedThisTurn() > 0)
      for (let i = 0; i < this.life.length; i++)
        if (this.gollumHit[i] && this.isOpponentAlive(i))
          this.damageOpponent(i, gainedThisTurn());
    for (const battlefieldPermanent of this.battlefield.slice()) {
      const name = battlefieldPermanent.card.name;
      if (name === 'The Gaffer' && gainedThisTurn() >= 3) this.draw(1);
      else if (name === 'Tippy-Toe, Terrific Partner' && gainedThisTurn() > 0)
        this.draw(1);
      else if (name === 'Elanor Gardner' && this.foodSacrificedThisTurn)
        this.putBasic();
    }
    this.checkKill();
  }
  override combat(): void {
    return playCombat(this);
  }

  /** How close to winning the others think we are: the Ring's tempts, Sam and Frodo out, a pile of Food. */
  override podClose(): number {
    let closeness = Math.min(0.5, this.ringTempts * 0.15);
    if (this.isOnBattlefield(SAM)) closeness += 0.2;
    if (this.isOnBattlefield(FRODO)) closeness += 0.2;
    if (this.foodsOnBattlefield().length >= 4) closeness += 0.1;
    return Math.min(1, closeness);
  }
  /** Skulk (Gollum) and the Ring-bearer (Frodo, once the Ring has tempted us): creatures with greater power can't block them. */
  override evasion(permanent: Permanent): Evasion {
    if (
      permanent.card.name === GOLLUM ||
      (permanent.card.name === FRODO && this.ringTempts >= 1)
    )
      return 'skulk';
    return super.evasion(permanent);
  }

  // ================================================================ what to do
  candidates(main2: boolean): Candidate[] {
    this.sacrificeValueCache = new Map();
    this.manaSourcesCache = super.manaSources();
    try {
      return buildCandidates(this, main2);
    } finally {
      this.sacrificeValueCache = null;
      this.manaSourcesCache = null;
    }
  }

  // ================================================================ spells
  override resolve(
    card: CardDef,
    fromGraveyard = false,
    mode: string | null = null,
  ): void {
    const name = card.name;
    if (name === "Night's Whisper") {
      this.draw(2);
      this.loseLife(2);
    } else if (name === 'Harmonize') this.draw(3);
    else if (name === 'Cultivate') {
      this.putBasic();
      this.putBasic(true);
    } else if (name === 'Farseek') this.putBasic(false, ['Plains', 'Swamp']);
    else if (name === 'Second Harvest')
      this.makeTokens(
        this.battlefield
          .filter((permanent) => permanent.token)
          .map((permanent) => permanent.card),
      );
    else if (name === 'Crypt Incursion') {
      const cards = this.graveyard.filter((candidate) => candidate.isCreature);
      for (const card of cards) this.takeCard(card, 'graveyard');
      this.putCards(cards, 'exile');
      this.gainLife(3 * cards.length);
    } else if (OWN_KILL.includes(name)) {
      const guest = this.findPermanent('Rapacious Guest');
      if (!guest) return;
      const power = this.power(guest);
      this.say(`${name} on our own Rapacious Guest (power ${power})`);
      if (OWN_KILL_EXILES.has(name)) {
        this.takeFromBattlefieldIfThere(guest);
        this.putCard(guest.card, 'exile');
        this.drainTargetOpponent(power); // leaves the battlefield: target opponent loses its power
        if (name === 'Swords to Plowshares') this.gainLife(power);
        else if (name === 'Path to Exile') this.putBasic();
        else this.loseLife(3);
      } else this.dies(guest); // destroyed: onDies drains its power (and the death triggers)
    } else super.resolve(card, fromGraveyard, mode);
  }

  // ================================================================ the planner's score
  override positionValue(): number {
    if (this.died) return -5000;
    this.manaSourcesCache = super.manaSources();
    try {
      return this.positionValueRaw();
    } finally {
      this.manaSourcesCache = null;
    }
  }

  positionValueRaw(): number {
    let value = 0;
    const start = this.config.opp_life as number;
    for (const life of this.life)
      value += 4 * (start - Math.max(0, life)) + (life <= 0 ? 40 : 0);
    for (const permanent of this.battlefield) {
      if (permanent.land !== null) continue;
      if (permanent.card === FOOD) value += 9;
      else if (permanent.card === TREASURE) value += 8;
      else if (permanent.card === CLUE) value += 7;
      else if (permanent.token) value += 6 + 2 * this.power(permanent);
      else
        value +=
          0.8 * this.battlefieldValue(permanent.card) + 2 * permanent.counters;
    }
    value += 22 * Math.min(10, this.manaSources());
    value +=
      0.4 * this.hand.reduce((total, card) => total + this.cardValue(card), 0);
    value +=
      12 * Math.min(4, this.ringTempts) +
      8 * this.gollumHit.filter((hit) => hit).length;
    value += this.myLife < 15 ? -10 * (15 - this.myLife) : 0;
    return value;
  }
}
