/**
 * The Sam & Frodo deck's AI (Abzan tokens / aristocrats): the rules of its cards, what it wants to do
 * each turn, and the rules agreed for this deck (see PLAN.md).
 *
 * Files:
 *   cards.ts       the card names and the facts about them (values, token definitions, Halfling check)
 *   game.ts        this file: SamFrodoGame, its state, life gain, tokens, sacrifice values, mana and turn steps
 *   triggers.ts    Farmer Cotton's enter trigger and the death triggers (the other cards' rules are the engine's:
 *                  engine/card-rules/tokens-and-life-gain.ts, landfall.ts)
 *   candidates.ts  everything the AI may do now, with a score each
 *   actions.ts     what the abilities do when the AI picks them
 *   combat.ts      goldfish combat, pod combat and the all-in attack
 *
 * Win: all three opponents at 0 life (40 each). Second measure: first opponent dead.
 * Single-target drains ("target opponent loses ...") go to the opponent with the most life, so all
 * three go down together and "each opponent" drains never hit a dead player.
 * Attacks: only Frodo (for the Ring and its card draw) and Gollum (for its end-step drain), unless
 * attacking with everything kills the table. No crackback (those attacks are tiny).
 * The win check, the two numbers and card values are the engine's CreatureDeckGame (engine/game/creature-deck.ts).
 * The game itself (mana, zones, casting, turns) is the shared engine in engine/game/game-core.ts.
 */
import { TREASURE } from '../../engine/cards/tokens';
import {
  AGENT_OF_THE_IRON_THRONE,
  CLUE,
  FOOD,
  FRODO,
  GOLLUM,
  HOLD,
  OWN_KILL,
  OWN_KILL_EXILES,
  RAMP_EARLY,
  RING_TRACKER,
  SAM,
  TOK,
  VALUE,
  isHalfling,
} from './cards';
import { buildCandidates } from './candidates';
import { finishWithMasterDrain } from './drain-finish';
import { playCombat } from './combat';
import { farmerCottonEnters, onPermanentDied } from './triggers';
import { endStepTriggerOf } from '../../engine/card-rules/card-rules';
import { CardDef, Cost } from '../../engine/cards/cards';
import {
  Candidate,
  Evasion,
  Permanent,
  Zone,
} from '../../engine/game/game-types';
import { CreatureDeckGame } from '../../engine/game/creature-deck';
import { firstMax } from '../../engine/util/lists';
import { fetchLand } from '../../engine/game/land-search';
import { MulliganRule } from '../../engine/game/mulligan';
import { MULLIGAN } from './mulligan';

type Phase = 'main1' | 'combat' | 'main2' | 'end';

const GWAIHIR = 'Gwaihir, Greatest of the Eagles';

/** orderSimultaneousTriggers: later numbers resolve later (the rest: 0). Gaining life: Cat Collector, Sanguine Bond,
 *  Prize Pig, Dawn of Hope, Well of Lost Dreams; a creature entering: Merry, Belladonna Took, Prosperous Innkeeper,
 *  Mentor of the Meek. */
const TRIGGER_ORDER: Record<string, number> = {
  'Cat Collector': 1,
  'Sanguine Bond': 2,
  'Prize Pig': 3,
  'Dawn of Hope': 4,
  'Well of Lost Dreams': 5,
  'Merry, Warden of Isengard': 6,
  'Belladonna Took': 7,
  'Prosperous Innkeeper': 8,
  'Mentor of the Meek': 9,
};

export class SamFrodoGame extends CreatureDeckGame {
  readonly values = VALUE;
  override mulliganRule(): MulliganRule | null {
    return this.config.smart_mulligan ? MULLIGAN : null;
  }
  override colors = ['W', 'B', 'G'];
  phase: Phase = 'main1';
  ringTempts = 0; // the Ring tempted us (Frodo is always the Ring-bearer)
  gollumHit: boolean[] = new Array(this.life.length).fill(false); // opponents dealt combat damage by Gollum this game
  farmerCottonX = 0; // X for Farmer Cotton while it enters
  allInWin = false; // the win came from an all-in attack (for the stats)

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
  /** The engine's "target opponent" (Sanguine Bond, Marionette Master, Rapacious Guest...): the one with the most
   *  life. */
  override chooseTargetOpponent(): number | null {
    return this.opponentWithMostLife();
  }

  // ================================================================ tokens
  /** The best creature for a +1/+1 counter: Marionette Master (its power is the drain), Rapacious Guest, Frodo. */
  override creatureForCounter(
    exclude: Permanent | null = null,
  ): Permanent | null {
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

  /** Sam and Frodo on the battlefield (Agent of the Iron Throne gives each of them its drain). */
  commandersOnBattlefield(except: Permanent | null = null): number {
    return this.battlefield.filter(
      (permanent) =>
        permanent !== except &&
        (permanent.card.name === SAM || permanent.card.name === FRODO),
    ).length;
  }

  halflingCount(): number {
    return this.creatures().filter((permanent) => isHalfling(permanent.card))
      .length;
  }
  /** The engine's enter triggers, then Farmer Cotton's (its X is ours). */
  override onEnter(permanent: Permanent, from: Zone): void {
    super.onEnter(permanent, from);
    if (permanent.card.name === 'Farmer Cotton') farmerCottonEnters(this);
  }

  /** Our order for triggers that happen together (later numbers later; the rest first, in battlefield order): what
   *  gaining life and a creature entering trigger. */
  override orderSimultaneousTriggers(permanents: Permanent[]): Permanent[] {
    return permanents
      .map((permanent, index) => ({ permanent, index }))
      .sort(
        (first, second) =>
          (TRIGGER_ORDER[first.permanent.card.name] ?? 0) -
            (TRIGGER_ORDER[second.permanent.card.name] ?? 0) ||
          first.index - second.index,
      )
      .map(({ permanent }) => permanent);
  }

  /** Dawn of Hope, Well of Lost Dreams and Mentor of the Meek draw for mana outside the first main phase (there the
   *  mana goes to spells). */
  override paysToDraw(_sourceName: string): boolean {
    return this.phase !== 'main1';
  }

  /** Shire Shirriff: in a pod our worst spare token (for its exile); in a goldfish game one worth sacrificing. */
  override tokenToSacrificeFor(_sourceName: string): Permanent | null {
    const spare = this.spareSacrifices();
    if (this.inArena())
      return spare.find((candidate) => candidate.token) ?? null;
    return (
      spare.find(
        (candidate) => candidate.token && this.sacrificeValue(candidate) >= 3,
      ) ?? null
    );
  }

  // ================================================================ leaving
  override sacrifice(permanent: Permanent): void {
    if (!this.battlefield.includes(permanent)) return;
    super.sacrifice(permanent); // -> dies -> onDies, then the sacrifice and Food triggers
  }
  override onDies(permanent: Permanent): void {
    return onPermanentDied(this, permanent);
  }

  /** Opponents' total life loss if this permanent were sacrificed now (the payoffs on the battlefield). */
  /** Crypt Incursion's target: the graveyard with the most creature cards (3 life each). Ours (slot null), or in a pod
   *  an opponent's when it has more: that also hurts a graveyard deck. */
  cryptIncursionTarget(): { slot: number | null; creatureCards: number } {
    let best: { slot: number | null; creatureCards: number } = {
      slot: null,
      creatureCards: this.graveyard.filter((card) => card.isCreature).length,
    };
    if (!this.isPodGame()) return best;
    for (let slot = 0; slot < this.life.length; slot++) {
      if (!this.isOpponentAlive(slot)) continue;
      const creatureCards = this.arena!.creatureCardsInGraveyard(this, slot);
      if (creatureCards > best.creatureCards) best = { slot, creatureCards };
    }
    return best;
  }
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
      else if (name === AGENT_OF_THE_IRON_THRONE && (art || cre))
        total += alive * this.commandersOnBattlefield(permanent);
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

  // ================================================================ mana
  override manaSourceKind(
    permanent: Permanent,
    ignoreSick = false,
  ): string | null {
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

  /** Sources with a side effect when tapped for mana: Gilded Goose eats a Food, Pristine Talisman gains 1 life.
   *  (The engine sacrifices a Treasure.) */
  override pay(cost: Cost, isInstantOrSorcery = false, commit = true): boolean {
    if (!commit) return super.pay(cost, isInstantOrSorcery, false);
    const before = this.battlefield.filter((permanent) => !permanent.tapped);
    if (!super.pay(cost, isInstantOrSorcery, true)) return false;
    for (const tappedSource of before) {
      if (!tappedSource.tapped) continue;
      if (tappedSource.card.name === 'Gilded Goose') {
        const food = this.foodsOnBattlefield()[0];
        if (food) this.sacrifice(food);
      } else if (tappedSource.card.name === 'Pristine Talisman')
        this.gainLife(1);
    }
    return true;
  }

  // ================================================================ card values
  /** Lands are worth a little less than in other creature decks once we have six mana or more. */
  override readonly landValues: readonly [number, number, number, number] = [
    80, 60, 35, 12,
  ];

  /** Cards we hold for later are worth little in hand, and early ramp is worth little once we have 7 mana. */
  override cardValue(card: CardDef): number {
    if (card.land !== null) return super.cardValue(card);
    if (HOLD.has(card.name)) return 10;
    if (RAMP_EARLY.has(card.name) && this.manaSources() >= 7) return 25;
    return super.cardValue(card);
  }
  /** Eternal Witness: in a pod, removal is worth getting back (it is held, so worth little in a goldfish game). */
  override returnToHandValue(card: CardDef): number {
    if (this.isPodGame() && HOLD.has(card.name)) return 70;
    return this.cardValue(card);
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
  }

  override develop(main2 = false): boolean {
    this.phase = main2 ? 'main2' : 'main1';
    if (main2 && this.config.drain_finish && finishWithMasterDrain(this))
      return true;
    return super.develop(main2);
  }

  /** The engine's end step triggers, with Gollum's drain after Gwaihir's Birds (they enter first: the life they give
   *  counts) and before the others (Elanor's land would bring more tokens and life). */
  override endStep(): void {
    this.phase = 'end';
    for (const permanent of this.battlefield.slice())
      if (permanent.card.name === GWAIHIR) endStepTriggerOf(this, permanent);
    const gainedThisTurn = this.lifeGainedThisTurn;
    if (this.isOnBattlefield(GOLLUM) && gainedThisTurn > 0)
      for (let i = 0; i < this.life.length; i++)
        if (this.gollumHit[i] && this.isOpponentAlive(i))
          this.damageOpponent(i, gainedThisTurn);
    for (const permanent of this.battlefield.slice())
      if (permanent.card.name !== GWAIHIR) endStepTriggerOf(this, permanent);
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
    if (name === 'Cultivate') {
      fetchLand(this, 'basic', true);
      fetchLand(this, 'basic', true, true);
    } else if (name === 'Farseek') fetchLand(this, 'types', true);
    else if (name === 'Crypt Incursion') {
      const target = this.cryptIncursionTarget();
      if (target.slot !== null) {
        // (a planner copy only counts the life: the cards are another player's)
        const exiled = this.inArena()
          ? this.arena!.exileCreaturesFromGraveyard(this, target.slot, name)
          : target.creatureCards;
        this.gainLife(3 * exiled);
      } else {
        const cards = this.graveyard.filter(
          (candidate) => candidate.isCreature,
        );
        for (const card of cards) this.takeCard(card, 'graveyard');
        this.putCards(cards, 'exile');
        this.gainLife(3 * cards.length);
      }
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
        else if (name === 'Path to Exile') fetchLand(this, 'basic', true);
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
