/**
 * The board rebuilt from an Archidekt playtest log (used by analyze.ts): hand, battlefield, graveyard, exile, the
 * stack, the draw order, and an estimate of the floating mana. It can turn itself into a Game for the deck's kill finder.
 */
import * as fs from 'fs';
import * as C from './cards';
import { Cost } from './cards';
import { Config, Perm, emptyPool } from './game-types';
import { Game } from './game';
import { Rng } from './rng';
import { Deck } from './runner';

/** One line of the log: the turn, the card, and what happened to it ("moved hand => battlefield", "tapped", ...). */
export type LogEvent = [number, string, string];

/** A permanent on the logged battlefield. */
export type BoardPermanent = {
  name: string;
  tapped: boolean;
  sick: boolean;
  counters: number;
  flipped?: boolean;
  token?: boolean;
};

/** Floating mana. A = either colour (Signet, Hollow...), S = only for instants and sorceries. */
type FloatingMana = { U: number; B: number; A: number; C: number; S: number };

/** A Game built from the board; floatA is the floating mana of either colour. */
export type BoardGame = Game<unknown> & { floatA?: number };

/** The front face of a double-faced card name ("Front // Back"). */
const frontFace = (name: string) => name.split(' // ')[0].trim();

/** Reads the log file: lines like "T3; Gale, Waterdeep Prodigy; moved commandZone => battlefield". */
export function parseLog(file: string): LogEvent[] {
  const events: LogEvent[] = [];
  for (const rawLine of fs.readFileSync(file, 'utf-8').split(/\r?\n/)) {
    const match = /^T(\d+);\s*(.+?);\s*(.+)$/.exec(rawLine.trim());
    if (!match) continue;
    // T0 (before the first "next turn") is turn 1
    events.push([
      Math.max(1, parseInt(match[1], 10)),
      frontFace(match[2]),
      match[3].trim(),
    ]);
  }
  return events;
}

/** Zones rebuilt from the log. */
export class Board {
  hand: string[] = [];
  graveyard: string[] = [];
  exile: string[] = [];
  stack: string[] = [];
  /** Trackers the player keeps in Archidekt's misc zone (e.g. Meren's experience as "Start Your Engines!"): value. */
  trackers: Record<string, number> = {};
  command: string[];
  battlefield: BoardPermanent[] = [];
  /** Cards in the order they left the library. */
  drawOrder: string[] = [];
  landPlayed = false;
  /** Lands put onto the battlefield from hand this turn (land drops and "put a land" abilities alike). */
  landsFromHand = 0;
  attacked = false;
  highTides = 0;
  mucks = 0;
  energy = false;
  spellsCast = 0;
  /** Commander -> times cast (commander tax). */
  commanderCasts = new Map<string, number>();
  /** Dark Ritual +1/+1 counters: the player's own floating-B record. */
  ritualCounter: number | null = null;
  pool!: FloatingMana;
  /** The mana of a cast that the pool couldn't cover yet. */
  owed: Cost | null = null;

  constructor(
    commanders: string[],
    public deckCards: string[],
    private deck: Deck,
  ) {
    this.command = commanders.slice();
    this.resetPool();
  }

  // ================================================================ floating mana estimate
  // The log has taps but no mana pool. Each tap adds what the permanent makes (with High Tide / Muck
  // bonuses at that moment); each spell cast pays its cost (after reducers). A cost the pool can't
  // cover yet is owed and paid by the next taps, because the log sometimes lists a spell before the
  // taps that paid for it. The pool empties at a new turn and at combat (a creature that isn't a
  // mana source taps = it attacks). Not in the log, so not subtracted: activated abilities
  // (Guildmage, Konrad, Monument), kicker and X. The estimate can be too high after those.
  resetPool(): void {
    this.pool = { U: 0, B: 0, A: 0, C: 0, S: 0 };
    this.owed = null;
  }

  /** Takes up to `amount` mana from the pool, kinds in the given order. Returns what could not be taken. */
  private takeFromPool(kinds: (keyof FloatingMana)[], amount: number): number {
    let missing = amount;
    for (const kind of kinds) {
      const taken = Math.min(this.pool[kind], missing);
      this.pool[kind] -= taken;
      missing -= taken;
    }
    return missing;
  }

  /** Pay a cost from the pool; whatever can't be paid yet is owed. */
  payFromPool(cost: Cost, isInstantOrSorcery = false): void {
    const pool = this.pool;
    const missingBlue = this.takeFromPool(['U', 'A'], cost.u);
    const missingBlack = this.takeFromPool(['B', 'A'], cost.b);
    let missingHybrid = 0;
    for (let i = 0; i < cost.h; i++)
      missingHybrid += this.takeFromPool(
        pool.U >= pool.B ? ['U', 'B', 'A'] : ['B', 'U', 'A'],
        1,
      );
    const [moreOfColour, lessOfColour]: (keyof FloatingMana)[] =
      pool.U >= pool.B ? ['U', 'B'] : ['B', 'U'];
    const missingGeneric = this.takeFromPool(
      [
        ...(isInstantOrSorcery ? ['S' as const] : []),
        'C',
        moreOfColour,
        lessOfColour,
        'A',
      ],
      cost.g,
    );
    if (missingBlue || missingBlack || missingHybrid || missingGeneric) {
      const alreadyOwed = this.owed ?? new Cost();
      this.owed = new Cost(
        alreadyOwed.g + missingGeneric,
        alreadyOwed.u + missingBlue,
        alreadyOwed.b + missingBlack,
        alreadyOwed.h + missingHybrid,
      );
    }
  }

  /** A permanent was tapped: add the mana it makes. */
  private addManaFromTap(card: string, permanent: BoardPermanent): void {
    const cardDef = C.get(card);
    const landInfo =
      cardDef.land ??
      (cardDef.mdfcLand && !cardDef.isIS ? cardDef.mdfcLand : null);
    let manaKind: string | null =
      landInfo !== null ? landInfo.mana : cardDef.rock;
    if (
      manaKind === null &&
      card === 'Curious Homunculus' &&
      !permanent.flipped
    )
      manaKind = 'S';
    const pool = this.pool;
    if (manaKind === null) {
      if (card === 'Wishclaw Talisman') this.payFromPool(new Cost(1));
      else if (cardDef.isCreature) this.resetPool(); // attacking: combat, mana from main phase 1 is gone
      return;
    }
    if (manaKind === 'F') {
      // filter (Dimir Signet, Darkwater Catacombs): pay 1, get UB
      this.payFromPool(new Cost(1));
      pool.U += 1;
      pool.B += 1;
    } else if (manaKind === 'UB') {
      pool.U += 1;
      pool.B += 1;
    } else if (manaKind === 'C2') pool.C += 2;
    else if (manaKind in pool) pool[manaKind as keyof FloatingMana] += 1;
    if (landInfo !== null) {
      if (landInfo.island || this.energy) pool.U += this.highTides;
      if (landInfo.swamp || this.energy) pool.B += this.mucks;
    }
    if (this.owed !== null) {
      const owedCost = this.owed;
      this.owed = null;
      this.payFromPool(owedCost);
    }
  }

  /** Estimated floating mana right now (nothing while a cost is still owed). */
  floating(): FloatingMana {
    if (this.owed !== null) return { U: 0, B: 0, A: 0, C: 0, S: 0 };
    const floating = { ...this.pool };
    if (this.ritualCounter !== null) floating.B = this.ritualCounter;
    return floating;
  }

  // ================================================================ events

  /** A card moves from one zone to another. */
  moveCard(card: string, from: string, to: string): void {
    const cardDef = C.get(card);
    if (
      from === 'battlefield' &&
      this.stack.includes(card) &&
      (to === 'graveyard' || to === 'exile')
    ) {
      // an instant/sorcery leaving the "stack" has resolved (or was countered: rare for these)
      if (card === 'High Tide') this.highTides += 1;
      else if (card === 'Bubbling Muck') this.mucks += 1;
      else if (card === 'Energybending') this.energy = true;
      else if (card === 'Dark Ritual') this.pool.B += 3;
    }
    // remove from the source
    const removeFrom = (zone: string[]) => zone.splice(zone.indexOf(card), 1);
    if (from === 'hand' && this.hand.includes(card)) removeFrom(this.hand);
    else if (from === 'graveyard' && this.graveyard.includes(card))
      removeFrom(this.graveyard);
    else if (from === 'exile' && this.exile.includes(card))
      removeFrom(this.exile);
    else if (from === 'commandZone' && this.command.includes(card))
      removeFrom(this.command);
    else if (from === 'battlefield') {
      if (this.stack.includes(card)) removeFrom(this.stack);
      else {
        const index = this.battlefield.findIndex((p) => p.name === card);
        if (index >= 0) {
          const [removed] = this.battlefield.splice(index, 1);
          if (removed.token) return; // a token that leaves the battlefield is gone
        }
      }
    } else if (from === 'library') this.drawOrder.push(card);
    // add to the destination
    if (to === 'hand') this.hand.push(card);
    else if (to === 'graveyard') this.graveyard.push(card);
    else if (to === 'exile') this.exile.push(card);
    else if (to === 'commandZone') this.command.push(card);
    else if (to === 'library') {
      // put back on top: it will be "drawn" again, so forget the earlier draw
      const index = this.drawOrder.lastIndexOf(card);
      if (index >= 0) this.drawOrder.splice(index, 1);
    } else if (to === 'battlefield') {
      if (cardDef.isIS) this.stack.push(card);
      else {
        if (
          (cardDef.land !== null || (cardDef.mdfcLand && from === 'hand')) &&
          from === 'hand'
        ) {
          this.landPlayed = true;
          this.landsFromHand += 1;
        }
        this.battlefield.push({
          name: card,
          tapped: false,
          sick: cardDef.isCreature,
          counters: 0,
        });
      }
    }
  }

  setTapped(card: string, tapped: boolean): void {
    const permanent = this.battlefield.find(
      (p) => p.name === card && p.tapped !== tapped,
    );
    if (!permanent) return;
    permanent.tapped = tapped;
    if (tapped) this.addManaFromTap(card, permanent);
    if (tapped && card === 'The Mindskinner' && !permanent.sick)
      this.attacked = true;
    // tokens whose only tap ability sacrifices them (Food, Treasure): Archidekt doesn't log them leaving
    if (
      tapped &&
      permanent.token &&
      (this.deck.logSacOnTap ?? []).includes(card)
    )
      this.battlefield.splice(this.battlefield.indexOf(permanent), 1);
  }

  newTurn(): void {
    for (const permanent of this.battlefield) permanent.sick = false;
    this.landPlayed = false;
    this.landsFromHand = 0;
    this.attacked = false;
    this.highTides = this.mucks = 0;
    this.energy = false;
    this.spellsCast = 0;
    this.ritualCounter = null;
    this.resetPool();
  }

  /** A spell cast (costs mana): onto the battlefield/stack from hand, graveyard (Gale), command zone
   *  or exile. Lands and cards put onto the battlefield from the library aren't casts. */
  isCast(card: string, from: string, to: string): boolean {
    if (
      to !== 'battlefield' ||
      !['hand', 'graveyard', 'commandZone', 'exile'].includes(from)
    )
      return false;
    const cardDef = C.get(card);
    return (
      cardDef.isIS ||
      !(cardDef.land !== null || (cardDef.mdfcLand && from === 'hand'))
    );
  }

  /** Pays for a cast from the floating mana estimate. */
  payCast(card: string, from: string, turn: number, config: Config): void {
    const cardDef = C.get(card);
    const gameBeforeCast = this.toGame(turn, config); // cost reducers in play
    gameBeforeCast.spellsCast = this.spellsCast;
    let cost = gameBeforeCast.effCost(cardDef, null, from === 'graveyard');
    if (from === 'commandZone') {
      const earlierCasts = this.commanderCasts.get(card) ?? 0;
      cost = cost.withGeneric(cost.g + 2 * earlierCasts);
      this.commanderCasts.set(card, earlierCasts + 1);
    }
    this.payFromPool(cost, cardDef.isIS);
    this.spellsCast += 1;
  }

  /** The board as a Game, for the deck's kill finder. */
  toGame(turn: number, config: Config): BoardGame {
    const game = new this.deck.Game(
      this.command.slice(),
      this.deckCards,
      new Rng(0),
      config,
    ) as BoardGame;
    game.turn = turn;
    game.command = this.command.map((name) => C.get(name));
    game.hand = this.hand.map((name) => C.get(name));
    game.gy = this.graveyard.map((name) => C.get(name));
    game.exile = this.exile.map((name) => C.get(name));
    game.bf = [];
    for (const permanent of this.battlefield) {
      // tokens: the deck says what they are (e.g. Meren's "Demon" = a stolen 5/5); unknown ones are left out
      const cardDef = permanent.token
        ? game.logToken(permanent.name)
        : C.get(permanent.name);
      if (!cardDef) continue;
      const landInfo =
        cardDef.land ??
        (cardDef.mdfcLand && !cardDef.isIS ? cardDef.mdfcLand : null);
      const gamePermanent = new Perm(cardDef, landInfo, permanent.tapped);
      gamePermanent.sick = permanent.sick;
      gamePermanent.transformed = !!permanent.flipped;
      gamePermanent.token = !!permanent.token;
      gamePermanent.counters = permanent.counters;
      game.bf.push(gamePermanent);
    }
    const knownCards = [
      ...this.hand,
      ...this.graveyard,
      ...this.exile,
      ...this.command,
      ...this.stack,
      ...this.battlefield.filter((p) => !p.token).map((p) => p.name),
    ];
    const libraryNames = this.deckCards.slice();
    for (const name of knownCards) {
      const index = libraryNames.indexOf(name);
      if (index >= 0) libraryNames.splice(index, 1);
    }
    game.library = libraryNames.map((name) => C.get(name));
    game.lib = new Array(config.opponents as number).fill(
      (config.opp_library as number) - (turn - 1),
    );
    game.landPlayed = this.landPlayed;
    game.ht = this.highTides;
    game.muck = this.mucks;
    game.energy = this.energy;
    game.attacked = this.attacked;
    const floating = this.floating();
    game.pool = {
      ...emptyPool(),
      U: floating.U,
      B: floating.B,
      C: floating.C,
      S: floating.S,
    };
    game.floatA = floating.A;
    game.syncFromLog(this);
    return game;
  }
}
