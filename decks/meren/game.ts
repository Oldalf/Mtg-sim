/**
 * The Meren of Clan Nel Toth deck's AI (Golgari reanimator): the rules of its cards, what it wants to
 * do each turn, Meren's end-step loop, and the goldfish combat rules agreed for this deck (see PLAN.md).
 *
 * Files:
 *   cards.ts       the card names and the facts about them (values, which creatures do what)
 *   game.ts        this file: MerenGame, its state, turn steps, combat and tutors
 *   triggers.ts    what happens when a permanent enters the battlefield or dies
 *   candidates.ts  everything the AI may do now, with a score each
 *   actions.ts     what the abilities and spells do when the AI picks them
 *
 * Win: 2 opponents dead, or config.win_damage damage dealt in total. Second measure: first opponent dead.
 * The win check, the two numbers and goldfish combat are the engine's CreatureDeckGame (engine/game/creature-deck.ts).
 * The game itself (mana, zones, casting, turns, combat) is the shared engine in engine/game/game-core.ts.
 */
import {
  DEATH_VALUE,
  DISCIPLE_CARD_WORTH,
  DGHOR_BLOODLETTER,
  DISCARD_CARDS,
  DRAW_CARDS,
  DRAW_SOURCE_COUNTS_FOR,
  DGHOR_BLOODLETTER_MANA_VALUE,
  EDICT_ETB,
  ENTER_AGAIN,
  FREE_OUTLETS,
  GRAY_MERCHANT,
  GREATER_GOOD_MIN_LIBRARY,
  GREATER_GOOD_MIN_POWER,
  PLUMB_LIFE_FLOOR,
  STOLEN_MARK,
  SURPLUS_LANDS,
  PLUMB_MOST,
  HOLD,
  MANA_ELVES,
  MEREN,
  SHRINK_KILLS_AT_LEAST,
  TOKENS,
  VALUE,
} from './cards';
import { buildCandidates } from './candidates';
import {
  keepsJunjiForOpponentsTurn,
  playAtOpponentsEndStep,
  playsOnOpponentsTurns,
  resetOnceEachTurnAbilities,
} from './opponents-turns';
import { JUNJI } from './junji';
import { activateVampiricRites } from './actions';
import {
  EVOLUTIONARY_LEAP,
  HIGH_MARKET,
  PROMISE_OF_ACLAZOTZ,
  fiendArtisanBonus,
  isDemon,
  sacrificeToEvolutionaryLeap,
  sacrificeToHighMarket,
  sacrificeToPromiseOfAclazotz,
} from '../../engine/game/sacrifice-outlets';
import { onPermanentDied, onPermanentEntered } from './triggers';
import { CardDef, Cost } from '../../engine/cards/cards';
import { CLUE, TREASURE } from '../../engine/cards/tokens';
import {
  GREATER_GOOD,
  sacrificeToGreaterGood,
} from '../../engine/game/card-draw';
import {
  Candidate,
  LogBoardView,
  Permanent,
  Zone,
} from '../../engine/game/game-types';
import { CreatureDeckGame } from '../../engine/game/creature-deck';
import { upkeepOfCommonCards } from '../../engine/game/common-permanents';
import { firstMax, firstMin, sortDesc } from '../../engine/util/lists';
import { MulliganRule } from '../../engine/game/mulligan';
import { MULLIGAN } from './mulligan';

export class MerenGame extends CreatureDeckGame {
  readonly values = VALUE;
  override mulliganRule(): MulliganRule | null {
    return this.config.smart_mulligan ? MULLIGAN : null;
  }
  override colors = ['B', 'G'];
  merenCasts = 0;
  // ---- measures for --diag (they change nothing in the game)
  merenOut: number | null = null; // the turn Meren first entered the battlefield
  permanentsAtTurnEnd: number[] = []; // nonland permanents (tokens too) at the end of turns 4-6
  reanimated = 0; // creature cards that came back from a graveyard to the battlefield (Meren, Unearth, Reanimate...)
  reanimatedAtTurnEnd: number[] = []; // ... at the end of turns 4-6
  experienceAtTurnEnd: number[] = []; // Meren's experience at the end of turns 4-6
  merenOnBattlefieldAtTurnEnd: boolean[] = []; // ... and whether Meren was on the battlefield then
  merenReturnsToHand = 0; // creature cards Meren returned to the hand (mana value above her experience)
  returnedToHandAtTurnEnd: number[] = []; // ... at the end of turns 4-6
  freeOutletAtTurnEnd: boolean[] = []; // a free sacrifice outlet on the battlefield at the end of turns 4-6
  cardsDrawn = 0; // cards drawn in the game (draw steps included, the opening hand not)
  cardsDrawnAtTurnEnd: number[] = []; // ... at the end of turns 4-8
  handAtTurnEnd: number[] = []; // cards in hand at the end of turns 4-8
  cardsDrawnBy: Record<string, number> = {}; // cards drawn, by the card that drew them
  cardsPlayed = new Set<string>(); // the cards cast or played from hand this game
  cardsDiscarded = 0; // cards discarded in the game
  cardsDiscardedBy: Record<string, number> = {}; // ... by the card that made us
  cardsMilled = 0; // cards from the library into the graveyard (mill, Buried Alive...)
  // at the end of turns 4-8: discarded, milled, cards left in the library, life
  discardedAtTurnEnd: number[] = [];
  milledAtTurnEnd: number[] = [];
  libraryAtTurnEnd: number[] = [];
  lifeAtTurnEnd: number[] = [];
  creatureCardsInGraveyardAtTurnEnd: number[] = []; // at the end of turns 5 and 6
  override diag(): Record<string, number | null> {
    const drawnWhenPlayed: Record<string, number | null> = {};
    for (const name of DRAW_CARDS)
      drawnWhenPlayed['drew:' + name] = this.cardsPlayed.has(name)
        ? this.cardsDrawnFor(name)
        : null;
    const netCards: Record<string, number | null> = {};
    // a card that makes us discard: the cards it drew minus the ones it made us discard
    for (const name of DISCARD_CARDS)
      netCards['net:' + name] = this.cardsPlayed.has(name)
        ? this.cardsDrawnFor(name) - (this.cardsDiscardedBy[name] ?? 0)
        : null;
    return {
      ...drawnWhenPlayed,
      ...netCards,
      discarded8: this.discardedAtTurnEnd[8] ?? null,
      milled8: this.milledAtTurnEnd[8] ?? null,
      library8: this.libraryAtTurnEnd[8] ?? null,
      life8: this.lifeAtTurnEnd[8] ?? null,
      graveyardCreatures5: this.creatureCardsInGraveyardAtTurnEnd[5] ?? null,
      graveyardCreatures6: this.creatureCardsInGraveyardAtTurnEnd[6] ?? null,
      merenOut: this.merenOut,
      spent5: this.spentEnd[5] ?? null,
      spent6: this.spentEnd[6] ?? null,
      perms5: this.permanentsAtTurnEnd[5] ?? null,
      perms6: this.permanentsAtTurnEnd[6] ?? null,
      reanim5: this.reanimatedAtTurnEnd[5] ?? null,
      reanim6: this.reanimatedAtTurnEnd[6] ?? null,
      exp5: this.experienceAtTurnEnd[5] ?? null,
      exp6: this.experienceAtTurnEnd[6] ?? null,
      merenOn5: Number(this.merenOnBattlefieldAtTurnEnd[5] ?? false),
      merenOn6: Number(this.merenOnBattlefieldAtTurnEnd[6] ?? false),
      toHand5: this.returnedToHandAtTurnEnd[5] ?? null,
      toHand6: this.returnedToHandAtTurnEnd[6] ?? null,
      outlet5: Number(this.freeOutletAtTurnEnd[5] ?? false),
      outlet6: Number(this.freeOutletAtTurnEnd[6] ?? false),
      drawn6: this.cardsDrawnAtTurnEnd[6] ?? null,
      drawn8: this.cardsDrawnAtTurnEnd[8] ?? null,
      hand8: this.handAtTurnEnd[8] ?? null,
      hand5: this.handAtTurnEnd[5] ?? null,
      hand6: this.handAtTurnEnd[6] ?? null,
    };
  }
  morbidUsed = false; // Morbid Opportunist: once each turn
  divinerUsed = false; // Twilight Diviner: once each turn
  leftThisTurn = false; // a nonland permanent left the battlefield this turn (Decode Transmissions' void)
  prepared = new Set<Permanent>(); // Studious First-Year / Grave Researcher can cast their spell copy
  lilianaUsed = false;
  gristUsed = false; // Grist: one loyalty ability per turn
  exileAtEnd: Permanent[] = []; // Puppeteer Clique's stolen creature
  sacAtEnd: Permanent[] = []; // Mobilize warriors

  // ---------------------------------------------------------------- log analyzer hooks
  override syncFromLog(board: LogBoardView): void {
    this.experienceCounters = board.trackers['Start Your Engines!'] ?? 0;
  }

  override logToken(name: string): CardDef | null {
    const lowerCaseName = name.toLowerCase();
    if (lowerCaseName.includes('demon') || lowerCaseName.includes('stolen'))
      return TOKENS.stolen; // Pontus plays stolen creatures as 5/5 Demons
    if (lowerCaseName.includes('insect')) return TOKENS.insect;
    if (lowerCaseName.includes('zombie')) return TOKENS.zombie;
    if (lowerCaseName.includes('goat')) return TOKENS.goat;
    if (lowerCaseName.includes('warrior')) return TOKENS.warrior;
    if (lowerCaseName.includes('beast')) return TOKENS.beast;
    return null;
  }

  /** Copies also need Meren's own references to permanents pointing at the copied permanents. */
  override clone(): this {
    const copy = super.clone();
    copy.cardsDrawnBy = { ...this.cardsDrawnBy };
    copy.cardsPlayed = new Set(this.cardsPlayed);
    copy.cardsDiscardedBy = { ...this.cardsDiscardedBy };
    const map = new Map(
      this.battlefield.map(
        (permanent, i) =>
          [permanent, copy.battlefield[i]] as [Permanent, Permanent],
      ),
    );
    const toCopy = (permanent: Permanent) => map.get(permanent) ?? permanent;
    copy.prepared = new Set([...this.prepared].map(toCopy));
    copy.exileAtEnd = this.exileAtEnd.map(toCopy);
    copy.sacAtEnd = this.sacAtEnd.map(toCopy);
    return copy;
  }

  /** The planner's score for a position with no win yet (higher is better). */
  override positionValue(): number {
    if (this.died) return -5000;
    let value = 0;
    // progress to the win: total damage, and the two opponents closest to dead
    value += 5 * Math.min(this.config.win_damage as number, this.damageDealt);
    const lives = this.life.slice().sort((first, second) => first - second);
    const start = this.config.opp_life as number;
    for (let i = 0; i < (this.config.win_dead as number); i++)
      value += 3 * (start - Math.max(0, lives[i]));
    // the board: attackers, Gray Merchant's devotion, Meren and her experience
    for (const permanent of this.creatures()) {
      if (permanent.card.name === 'Spore Frog') value += 25;
      else
        value +=
          7 * this.power(permanent) * (permanent.card.flying ? 1.5 : 1) +
          0.25 * this.battlefieldValue(permanent.card);
    }
    value += 10 * Math.min(12, this.devotion('B'));
    if (this.isOnBattlefield(MEREN))
      value += 90 + 12 * Math.min(8, this.experienceCounters);
    else value += 6 * Math.min(8, this.experienceCounters);
    for (const battlefieldPermanent of this.battlefield)
      if (
        battlefieldPermanent.land === null &&
        !battlefieldPermanent.isCreature
      )
        value += 0.4 * this.battlefieldValue(battlefieldPermanent.card);
    // resources: creature cards to bring back, mana, cards in hand
    value += 6 * Math.min(10, this.creaturesInGraveyard());
    value += 25 * Math.min(10, this.manaSources());
    value +=
      0.4 * this.hand.reduce((total, card) => total + this.cardValue(card), 0);
    // our life after the crackback that's coming
    const life = this.myLife - (this.fogUsed ? 0 : this.pendingCrackback);
    value +=
      life <= 0
        ? -3000
        : life < 20
          ? -10 * (20 - life)
          : 0.5 * Math.min(60, life - 20);
    return value;
  }

  // ================================================================ card values
  /** Lotleth Giant grows with the creature cards in our graveyard. */
  override battlefieldValue(card: CardDef): number {
    if (card.name === 'Lotleth Giant')
      return Math.min(95, 10 * this.creaturesInGraveyard());
    return super.battlefieldValue(card);
  }

  /** Spells in hand: cards we hold for later are worth little, the others a flat 45. */
  override cardValue(card: CardDef): number {
    if (card.land !== null || card.isCreature) return super.cardValue(card);
    if (HOLD.has(card.name)) return 20;
    return 45;
  }

  override discardValue(card: CardDef): number {
    // creature cards in the graveyard are fine: Meren and reanimation get them back
    return this.cardValue(card) - (card.isCreature ? 25 : 0);
  }

  /** What we least mind discarding to Greater Good: surplus lands, then creature cards (the graveyard is where Meren
   *  and reanimation work), most of all one Meren can return at once. (Surveil keeps using discardValue.) */
  greaterGoodDiscardValue(card: CardDef): number {
    if (card.land !== null)
      return this.landsOnBattlefield().length >= SURPLUS_LANDS
        ? 5
        : this.cardValue(card);
    if (!card.isCreature) return this.cardValue(card);
    const merenReturnsItAtOnce =
      this.isOnBattlefield(MEREN) &&
      card.manaValue <= this.experienceCounters + 1;
    return this.cardValue(card) - 25 - (merenReturnsItAtOnce ? 15 : 0);
  }

  creaturesInGraveyard(): number {
    return this.graveyard.filter((card) => card.isCreature).length;
  }

  override ritualsEnableSeveralPlays(): boolean {
    return this.config.ritual_several_plays === 1;
  }

  /** Rise of the Dark Realms: every creature card in the opponents' graveyards comes too. */
  override reanimateFromOtherGraveyards(): void {
    this.stealCreatures(Infinity);
  }

  /** Creature cards from the opponents' graveyards onto our battlefield (Sepulchral Primordial, Rise of the Dark Realms,
   *  Puppeteer Clique, Junji): in a pod the real cards, the ones we value most first (at most `perOpponent` from each
   *  graveyard, `total` in all). In a goldfish game there are no graveyards to look at: a vanilla 5/5 for each opponent,
   *  as an estimate (Pontus, 2026-11-19). */
  stealCreatures(perOpponent: number, total = Infinity): Permanent[] {
    const opponents = [...this.life.keys()].filter((slot) =>
      this.isOpponentAlive(slot),
    );
    const stolen: Permanent[] = [];
    if (!this.inArena()) {
      for (const _opponent of opponents.slice(0, total))
        stolen.push(this.enterAsStolen(TOKENS.stolen));
      return stolen;
    }
    const arena = this.arena!;
    const taken = new Map<number, number>();
    const options = opponents.flatMap((slot) =>
      arena
        .creatureCardsOfGraveyard(this, slot)
        .map((card) => ({ slot, card })),
    );
    options.sort(
      (first, second) =>
        this.battlefieldValue(second.card) - this.battlefieldValue(first.card),
    );
    for (const { slot, card } of options) {
      if (stolen.length >= total || (taken.get(slot) ?? 0) >= perOpponent)
        continue;
      taken.set(slot, (taken.get(slot) ?? 0) + 1);
      stolen.push(this.stealCreatureCard(slot, card));
    }
    return stolen;
  }

  /** A pod: this creature card from that opponent's graveyard onto our battlefield. */
  stealCreatureCard(slot: number, card: CardDef): Permanent {
    this.arena!.takeCreatureCardFromGraveyard(this, slot, card);
    return this.enterAsStolen(card);
  }

  private enterAsStolen(card: CardDef): Permanent {
    const permanent = this.enter(card, 'graveyard', { token: true });
    permanent.marks |= STOLEN_MARK;
    return permanent;
  }

  /** A creature we took from a graveyard or made a copy of (Breach the Multiverse): worth keeping, not fodder. */
  isStolen(permanent: Permanent): boolean {
    return (
      (permanent.marks & STOLEN_MARK) !== 0 || permanent.card === TOKENS.stolen
    );
  }

  override commanderCost(card: CardDef, cost: Cost): Cost {
    return card.name === MEREN
      ? cost.withGeneric(cost.generic + 2 * this.merenCasts)
      : cost;
  }
  override onCommanderCast(card: CardDef): void {
    if (card.name === MEREN) this.merenCasts++;
  }

  // ================================================================ zones
  millOurselves(count: number): void {
    for (let i = 0; i < count && this.library.length; i++)
      this.toGraveyard(this.takeTopCardsOfLibrary(1)[0], true);
  }

  /** A basic land from the library onto the battlefield tapped. */
  fetchBasic(): void {
    const want =
      this.landsOnBattlefield().filter(
        (permanent) => permanent.land!.mana === 'G',
      ).length <=
      this.landsOnBattlefield().filter(
        (permanent) => permanent.land!.mana === 'B',
      ).length
        ? 'Forest'
        : 'Swamp';
    const card =
      this.library.find((candidate) => candidate.name === want) ??
      this.library.find((candidate) => candidate.land?.basic) ??
      null;
    if (!card) return;
    this.takeCardIfThere(card, 'library');
    this.shuffle();
    const basicLand = new Permanent(card, card.land, true);
    basicLand.sick = false;
    this.putOntoBattlefield(basicLand);
    this.onLandEnter(basicLand, false);
  }

  /** The basic land we'd fetch: a Forest when we have no more Forests than Swamps, else a Swamp. */
  override chooseLandToFetch(candidates: CardDef[], _toHand: boolean): CardDef {
    const want =
      this.landsOnBattlefield().filter(
        (permanent) => permanent.land!.mana === 'G',
      ).length <=
      this.landsOnBattlefield().filter(
        (permanent) => permanent.land!.mana === 'B',
      ).length
        ? 'Forest'
        : 'Swamp';
    return candidates.find((card) => card.name === want) ?? candidates[0];
  }

  /** Eternal Witness: the card we want most, a noncreature first (Meren brings creatures back anyway). */
  override returnToHandValue(card: CardDef): number {
    return this.cardValue(card) + (card.isCreature ? 0 : 10);
  }

  /** Our creatures in the order we'd sacrifice them (cheapest loss first). */
  /** How much we mind sacrificing this creature (low = a good one to sacrifice). */
  sacrificeCost(permanent: Permanent): number {
    if (this.isStolen(permanent)) return 80;
    if (permanent.token) return 5 + this.power(permanent);
    if (DEATH_VALUE.has(permanent.card.name) && this.isOnBattlefield(MEREN))
      return 10;
    if (MANA_ELVES.has(permanent.card.name) && this.turn >= 5) return 15;
    if (
      EDICT_ETB.has(permanent.card.name) ||
      permanent.card.name === 'Satyr Wayfinder' ||
      permanent.card.name === 'Studious First-Year'
    )
      return 20;
    return this.battlefieldValue(permanent.card);
  }

  sacrificeOrder(exclude: Permanent[] = []): Permanent[] {
    return sortDesc(
      this.creatures().filter(
        (permanent) =>
          !exclude.includes(permanent) &&
          permanent.card.name !== MEREN &&
          permanent.card.name !== 'Spore Frog' &&
          permanent.card.name !== 'Twilight Diviner',
      ),
      (permanent) => -this.sacrificeCost(permanent),
    );
  }

  /** Creatures we are happy to sacrifice for value (Priest of Forgotten Gods, Village Rites, Wight of the
   *  Reliquary): tokens, creatures whose death is worth something, and the cheap ones Meren can bring back. */
  expendableCreatures(exclude: Permanent[] = []): Permanent[] {
    return this.sacrificeOrder(exclude).filter(
      (candidate) =>
        candidate.token ||
        DEATH_VALUE.has(candidate.card.name) ||
        this.battlefieldValue(candidate.card) < 50,
    );
  }

  /** Disciple of Bolas sacrifices for the most cards: power is cards and life; a creature whose death is worth
   *  something, or whose enter trigger Meren can give us again this turn, is a good one to lose. */
  chooseDiscipleSacrifice(disciple: Permanent): Permanent | null {
    const choices = this.sacrificeOrder([disciple]);
    if (!choices.length) return null;
    const merenOut = this.isOnBattlefield(MEREN);
    const worth = (permanent: Permanent) => {
      const comesBackThisTurn =
        merenOut &&
        !permanent.token &&
        permanent.card.manaValue <= this.experienceCounters + 1;
      const triggerBonus =
        merenOut &&
        (DEATH_VALUE.has(permanent.card.name) ||
          (comesBackThisTurn && ENTER_AGAIN.has(permanent.card.name)))
          ? 15
          : 0;
      return (
        DISCIPLE_CARD_WORTH * this.power(permanent) +
        triggerBonus -
        this.sacrificeCost(permanent)
      );
    };
    return firstMax(choices, worth);
  }

  /** D'Ghor Bloodletter's mode in a pod: -1/-1 to all other creatures (true) or the edict. The -1/-1 when it kills
   *  enough opposing creatures now, or when Meren can bring it back at our end step for a second -1/-1 that would. */
  shouldShrinkWithBloodletter(): boolean {
    if (this.podCreaturesShrinkWouldKill(1) >= SHRINK_KILLS_AT_LEAST)
      return true;
    // the outlet must live through the first -1/-1 (Viscera Seer and Carrion Feeder are 1/1s)
    const outlet = this.findFreeSacrificeOutlet();
    const canLoopAtEndStep =
      this.isOnBattlefield(MEREN) &&
      outlet !== null &&
      this.toughness(outlet) > 1 &&
      this.experienceCounters + 1 >= DGHOR_BLOODLETTER_MANA_VALUE;
    return (
      canLoopAtEndStep &&
      this.podCreaturesShrinkWouldKill(2) >= SHRINK_KILLS_AT_LEAST
    );
  }

  /** What to sacrifice for a draw spell: a creature we don't mind losing, else (when the spell allows it) a Treasure,
   *  then a Clue. */
  chooseSacrificeForDraw(artifactAllowed: boolean): Permanent | null {
    const creature = this.expendableCreatures()[0];
    if (creature || !artifactAllowed) return creature ?? null;
    for (const token of [TREASURE, CLUE]) {
      const artifact = this.battlefield.find(
        (permanent) => permanent.card === token,
      );
      if (artifact) return artifact;
    }
    return null;
  }

  /** Plumb the Forbidden: the creatures we don't mind losing (up to a few), each is a card for 1 life: not below the
   *  life floor. */
  choosePlumbSacrifices(): Permanent[] {
    const room = Math.max(0, this.myLife - PLUMB_LIFE_FLOOR - 1);
    return this.expendableCreatures().slice(0, Math.min(PLUMB_MOST, room));
  }

  /** Greater Good: the creature to sacrifice for the cards (power GREATER_GOOD_MIN_POWER or more):
   *  one we don't mind losing, or one Meren can bring back at once. */
  chooseGreaterGoodSacrifice(): Permanent | null {
    if (this.library.length < GREATER_GOOD_MIN_LIBRARY) return null;
    const choices = this.sacrificeOrder().filter(
      (creature) =>
        this.power(creature) >= GREATER_GOOD_MIN_POWER &&
        (this.expendableCreatures().includes(creature) ||
          (this.isOnBattlefield(MEREN) &&
            !creature.token &&
            creature.card.manaValue <= this.experienceCounters + 1)),
    );
    return choices.length
      ? firstMax(choices, (creature) => this.power(creature))
      : null;
  }

  /** Sacrifice this creature to the cheapest outlet we can use now: a free creature outlet (Viscera Seer may sacrifice
   *  itself, the others only another creature), High Market (once, it taps), then with mana left Evolutionary Leap
   *  ({G}: a creature card) and Vampiric Rites ({1}{B}: a card). False when none can take it. */
  sacrificeToOutlet(creature: Permanent): boolean {
    const freeOutlet = this.battlefield.find(
      (permanent) =>
        FREE_OUTLETS.includes(permanent.card.name) &&
        (permanent !== creature || permanent.card.name === 'Viscera Seer'),
    );
    if (freeOutlet) {
      this.sacrifice(creature);
      return true;
    }
    const highMarket = this.battlefield.find(
      (permanent) => permanent.card.name === HIGH_MARKET && !permanent.tapped,
    );
    if (highMarket) return sacrificeToHighMarket(this, highMarket, creature);
    if (
      this.isOnBattlefield(EVOLUTIONARY_LEAP) &&
      sacrificeToEvolutionaryLeap(this, creature)
    )
      return true;
    return (
      this.isOnBattlefield('Vampiric Rites') &&
      activateVampiricRites(this, creature)
    );
  }

  /** Could sacrificeToOutlet take a creature now (without doing it)? */
  hasOutletNow(): boolean {
    return (
      this.findFreeSacrificeOutlet() !== null ||
      this.battlefield.some(
        (permanent) => permanent.card.name === HIGH_MARKET && !permanent.tapped,
      ) ||
      (this.isOnBattlefield(EVOLUTIONARY_LEAP) &&
        this.canPay(Cost.parse('{G}'), false)) ||
      (this.isOnBattlefield('Vampiric Rites') &&
        this.canPay(Cost.parse('{1}{B}'), false))
    );
  }

  /** Promise of Aclazotz at our end step: sacrifice a token or a creature whose death is worth something (not a
   *  Demon), then populate. A nontoken one first, so the token copy has a token to copy. */
  private usePromiseOfAclazotz(): void {
    if (!this.isOnBattlefield(PROMISE_OF_ACLAZOTZ)) return;
    const choices = this.sacrificeOrder().filter(
      (permanent) =>
        !this.isStolen(permanent) &&
        !FREE_OUTLETS.includes(permanent.card.name) &&
        !isDemon(permanent.card) &&
        (permanent.token || DEATH_VALUE.has(permanent.card.name)),
    );
    const choice =
      choices.find((permanent) => !permanent.token) ?? choices[0] ?? null;
    if (choice) sacrificeToPromiseOfAclazotz(this, choice);
  }

  findFreeSacrificeOutlet(): Permanent | null {
    for (const name of FREE_OUTLETS) {
      const permanent = this.findPermanent(name);
      if (permanent) return permanent;
    }
    return null;
  }

  // ================================================================ triggers
  override onEnter(permanent: Permanent, from: Zone): void {
    if (!permanent.token) this.cardsPlayed.add(permanent.card.name);
    onPermanentEntered(this, permanent, from);
  }

  override onDies(permanent: Permanent): void {
    onPermanentDied(this, permanent);
  }

  override powerBonus(permanent: Permanent): number {
    return permanent.card.name === 'Wight of the Reliquary'
      ? this.creaturesInGraveyard()
      : fiendArtisanBonus(this, permanent);
  }
  override toughnessBonus(permanent: Permanent): number {
    return this.powerBonus(permanent);
  }

  /** Counts the cards drawn once the game is on, and which card drew them (for --diag). */
  override draw(count = 1, source: string | null = null): void {
    const libraryBefore = this.library.length;
    super.draw(count, source);
    if (this.turn < 1) return;
    const drawn = libraryBefore - this.library.length;
    this.cardsDrawn += drawn;
    if (source !== null)
      this.cardsDrawnBy[source] = (this.cardsDrawnBy[source] ?? 0) + drawn;
  }

  override discard(count: number, source: string | null = null): void {
    const handBefore = this.hand.length;
    if (source === GREATER_GOOD) this.discardForGreaterGood(count);
    else super.discard(count, source);
    const discarded = handBefore - this.hand.length;
    this.cardsDiscarded += discarded;
    if (source !== null)
      this.cardsDiscardedBy[source] =
        (this.cardsDiscardedBy[source] ?? 0) + discarded;
  }

  private discardForGreaterGood(count: number): void {
    for (let i = 0; i < count && this.hand.length; i++) {
      const card = firstMin(this.hand, (handCard) =>
        this.greaterGoodDiscardValue(handCard),
      );
      this.takeCard(card, 'hand');
      this.toGraveyard(card);
      this.say('discard', card);
    }
  }

  override toGraveyard(card: CardDef, fromLibrary = false): void {
    if (fromLibrary) this.cardsMilled++;
    super.toGraveyard(card, fromLibrary);
  }

  /** The cards a card has drawn this game (a Clue's draws are Tireless Tracker's). */
  cardsDrawnFor(name: string): number {
    return Object.entries(this.cardsDrawnBy)
      .filter(([source]) => (DRAW_SOURCE_COUNTS_FOR[source] ?? source) === name)
      .reduce((total, [, drawn]) => total + drawn, 0);
  }

  override castInstantOrSorcery(
    card: CardDef,
    fromGraveyard = false,
    base: Cost | null = null,
    mode: string | null = null,
    triggerOptions: Record<string, unknown> = {},
  ): boolean {
    const isCast = super.castInstantOrSorcery(
      card,
      fromGraveyard,
      base,
      mode,
      triggerOptions,
    );
    if (isCast && !fromGraveyard) this.cardsPlayed.add(card.name);
    return isCast;
  }

  override onLandEnter(permanent: Permanent, gone: boolean): void {
    this.cardsPlayed.add(permanent.card.name);
    super.onLandEnter(permanent, gone);
  }

  // ================================================================ turn steps
  override startTurn(): void {
    if (this.turn >= 4 && this.turn <= 8) {
      this.cardsDrawnAtTurnEnd[this.turn] = this.cardsDrawn;
      this.handAtTurnEnd[this.turn] = this.hand.length;
      this.discardedAtTurnEnd[this.turn] = this.cardsDiscarded;
      this.milledAtTurnEnd[this.turn] = this.cardsMilled;
      this.libraryAtTurnEnd[this.turn] = this.library.length;
      this.lifeAtTurnEnd[this.turn] = this.myLife;
      this.creatureCardsInGraveyardAtTurnEnd[this.turn] =
        this.creaturesInGraveyard();
    }
    if (this.turn >= 4 && this.turn <= 6) {
      this.permanentsAtTurnEnd[this.turn] = this.battlefield.filter(
        (permanent) => permanent.land === null,
      ).length;
      this.reanimatedAtTurnEnd[this.turn] = this.reanimated;
      this.experienceAtTurnEnd[this.turn] = this.experienceCounters;
      this.merenOnBattlefieldAtTurnEnd[this.turn] = this.isOnBattlefield(MEREN);
      this.returnedToHandAtTurnEnd[this.turn] = this.merenReturnsToHand;
      this.freeOutletAtTurnEnd[this.turn] =
        this.findFreeSacrificeOutlet() !== null;
    }
    super.startTurn();
    this.morbidUsed =
      this.divinerUsed =
      this.leftThisTurn =
      this.gristUsed =
        false;
  }

  override upkeep(): void {
    // the opponents' turns happened: crackback, unless Spore Frog prevents it (then it's sacrificed)
    const frog = this.findPermanent('Spore Frog');
    if (frog && this.fogUsed) {
      this.say('Spore Frog prevents the crackback');
      this.sacrifice(frog);
    } else if (this.pendingCrackback > 0) {
      this.loseLife(this.pendingCrackback);
      this.say(
        `crackback: we take ${this.pendingCrackback}, life ${this.myLife}`,
      );
    }
    this.pendingCrackback = 0;
    this.fogUsed = false;
    upkeepOfCommonCards(this);
    this.makeOphiomancerSnake();
    for (const researcher of this.battlefield.filter(
      (permanent) => permanent.card.name === 'Grave Researcher',
    )) {
      this.scry(1, true);
      if (this.creaturesInGraveyard() >= 3) this.prepared.add(researcher);
    }
  }

  override opponentUpkeep(): void {
    if (playsOnOpponentsTurns(this)) resetOnceEachTurnAbilities(this);
    this.makeOphiomancerSnake();
  }

  override opponentEndStep(): void {
    if (playsOnOpponentsTurns(this)) playAtOpponentsEndStep(this);
  }

  /** Ophiomancer: at the beginning of each upkeep, a deathtouch Snake if we control none. */
  private makeOphiomancerSnake(): void {
    if (
      this.isOnBattlefield('Ophiomancer') &&
      !this.battlefield.some((permanent) => permanent.card === TOKENS.snake)
    )
      this.createTokens(TOKENS.snake);
  }

  override endStep(): void {
    for (const permanent of this.sacAtEnd)
      if (this.battlefield.includes(permanent)) this.sacrifice(permanent);
    this.sacAtEnd = [];
    for (const exiledPermanent of this.exileAtEnd) {
      if (this.takeFromBattlefieldIfThere(exiledPermanent))
        this.leftThisTurn = true;
    }
    this.exileAtEnd = [];
    if (this.isOnBattlefield(MEREN)) this.feedMerenAtEndStep();
    this.checkKill();
  }

  /** How much Meren wants to return this card at her end step with this much experience: its value when it comes back
   *  to the battlefield, much less when it can only go to the hand. */
  merenReturnScore(card: CardDef, experience: number): number {
    if (card.manaValue > experience) return this.battlefieldValue(card) * 0.4;
    if (
      card.name === DGHOR_BLOODLETTER &&
      this.podCreaturesShrinkWouldKill(1) >= SHRINK_KILLS_AT_LEAST
    )
      return 1000; // a pod: wipes the wide board
    return this.battlefieldValue(card);
  }

  /** Fodder (Pontus, 2026-11-24): one creature sacrificed at Meren's end step when the experience counter of its death
   *  is free. Either she returns it at once (its mana value is at most her experience after its death, and nothing in
   *  the graveyard comes first): it is back, with its enter trigger again (Wood Elves, Satyr Wayfinder). Or its death
   *  lets her return a better card that would otherwise only go to the hand (mana value exactly her experience after
   *  the death, worth more than the creature). One a turn, since Meren returns one card. Off with --set
   *  end_step_fodder=0. */
  private sacrificeOneMerenReturnsAtOnce(): void {
    if (!this.hasOutletNow()) return;
    const experienceAfter = this.experienceCounters + 1;
    const graveyardCreatures = this.graveyard.filter((card) => card.isCreature);
    const bestInGraveyardAfter = graveyardCreatures.length
      ? firstMax(graveyardCreatures, (card) =>
          this.merenReturnScore(card, experienceAfter),
        )
      : null;
    const scoreAfter = bestInGraveyardAfter
      ? this.merenReturnScore(bestInGraveyardAfter, experienceAfter)
      : 0;
    // mana value exactly the new experience: before the death it could only have gone to the hand
    const unlocksBetterCard =
      bestInGraveyardAfter !== null &&
      bestInGraveyardAfter.manaValue === experienceAfter;
    const isFodder = (permanent: Permanent) =>
      !permanent.token &&
      !this.isStolen(permanent) &&
      !FREE_OUTLETS.includes(permanent.card.name) &&
      !(permanent.card.name === JUNJI && keepsJunjiForOpponentsTurn(this));
    const comesBackAtOnce = (permanent: Permanent) =>
      permanent.card.manaValue <= experienceAfter &&
      this.merenReturnScore(permanent.card, experienceAfter) >= scoreAfter;
    const isWorthLessThanUnlocked = (permanent: Permanent) =>
      unlocksBetterCard &&
      this.battlefieldValue(permanent.card) <
        this.battlefieldValue(bestInGraveyardAfter);
    const choices = this.sacrificeOrder().filter(
      (permanent) =>
        isFodder(permanent) &&
        (comesBackAtOnce(permanent) || isWorthLessThanUnlocked(permanent)),
    );
    const choice =
      choices.find(
        (permanent) =>
          comesBackAtOnce(permanent) && ENTER_AGAIN.has(permanent.card.name),
      ) ?? choices[0];
    if (!choice) return;
    this.say('sacrifice', choice.card, 'to feed Meren at once');
    this.sacrificeToOutlet(choice);
  }

  /** Feed Meren with a free sacrifice outlet, then return the best creature card from the graveyard. */
  feedMerenAtEndStep(): void {
    // Greater Good: a big creature Meren can return now, for cards and a full graveyard
    const toGreaterGood = this.isOnBattlefield(GREATER_GOOD)
      ? this.chooseGreaterGoodSacrifice()
      : null;
    if (toGreaterGood) sacrificeToGreaterGood(this, toGreaterGood);
    this.usePromiseOfAclazotz();
    // sacrifice tokens and creatures whose death is worth something: each one is an experience counter
    for (const permanent of this.sacrificeOrder()) {
      if (
        this.isStolen(permanent) ||
        FREE_OUTLETS.includes(permanent.card.name) ||
        (permanent.card.name === JUNJI && keepsJunjiForOpponentsTurn(this))
      )
        continue;
      if (permanent.token || DEATH_VALUE.has(permanent.card.name))
        if (!this.sacrificeToOutlet(permanent)) break;
    }
    // the Gray Merchant loop: sacrifice it and let Meren bring it back (drain again)
    const grayMerchant = this.findPermanent(GRAY_MERCHANT);
    if (grayMerchant && !grayMerchant.token && this.experienceCounters + 1 >= 5)
      this.sacrificeToOutlet(grayMerchant);
    // a pod: sacrifice D'Ghor Bloodletter so Meren brings it back for a second -1/-1 (it stacks this turn)
    const bloodletter = this.findPermanent(DGHOR_BLOODLETTER);
    if (
      bloodletter &&
      !bloodletter.token &&
      this.experienceCounters + 1 >= bloodletter.card.manaValue &&
      this.podCreaturesShrinkWouldKill(1) >= SHRINK_KILLS_AT_LEAST
    )
      this.sacrificeToOutlet(bloodletter);
    if (this.config.end_step_fodder !== 0)
      this.sacrificeOneMerenReturnsAtOnce();
    const candidates = this.graveyard.filter((card) => card.isCreature);
    if (!candidates.length) return;
    const best = firstMax(candidates, (card) =>
      this.merenReturnScore(card, this.experienceCounters),
    );
    if (best.manaValue <= this.experienceCounters) {
      this.say(`Meren (${this.experienceCounters} experience) returns`, best);
      this.reanimate(best);
    } else {
      this.takeCardIfThere(best, 'graveyard');
      this.putCard(best, 'hand');
      this.merenReturnsToHand++;
      this.say(
        `Meren (${this.experienceCounters} experience) returns to hand`,
        best,
      );
    }
  }

  // ================================================================ combat
  override canAttack(permanent: Permanent): boolean {
    return super.canAttack(permanent) && permanent.card.name !== 'Spore Frog';
  }
  override fogBlocker(): Permanent | null {
    return this.findPermanent('Spore Frog');
  }
  override onAttack(attackers: Permanent[]): Permanent[] {
    const extra: Permanent[] = [];
    for (const permanent of attackers) {
      if (permanent.card.name === 'Grave Titan')
        this.createTokens(TOKENS.zombie, 2);
      if (permanent.card.name === 'Avenger of the Fallen') {
        // Mobilize X: tapped and attacking 1/1s, sacrificed at the end step
        for (const warrior of this.createTokens(
          TOKENS.warrior,
          this.creaturesInGraveyard(),
          {
            tapped: true,
          },
        )) {
          extra.push(warrior);
          this.sacAtEnd.push(warrior);
        }
      }
    }
    return extra;
  }
  /** How close to winning the others think we are: Meren out, black devotion for Gray Merchant, a big graveyard. */
  override podClose(): number {
    let closeness = 0;
    if (this.isOnBattlefield(MEREN)) closeness += 0.3;
    if (this.devotion('B') >= 8) closeness += 0.3;
    if (this.creaturesInGraveyard() >= 8) closeness += 0.2;
    if (
      this.isOnBattlefield('Priest of Forgotten Gods') ||
      this.isOnBattlefield('Zulaport Cutthroat')
    )
      closeness += 0.2;
    return Math.min(1, closeness);
  }
  /** A pod: Spore Frog is the fog, not a blocker. */
  override blockValue(permanent: Permanent): number {
    return permanent.card.name === 'Spore Frog'
      ? 500
      : super.blockValue(permanent);
  }
  /** A pod: sacrifice Spore Frog to prevent all combat damage this turn, when the hit is lethal or big (config.fog_at). */
  override fogPrevent(damage: number, lethal: boolean): boolean {
    const frog = this.findPermanent('Spore Frog');
    if (!frog || (!lethal && damage < ((this.config.fog_at as number) ?? 6)))
      return false;
    this.sacrifice(frog);
    return true;
  }

  /** A pod: keep mana open for an answer only while an opponent has a board worth answering (config.hold_opponent_power;
   *  0 = whenever we hold an answer, as every deck does). A slower deck spends the mana on its own turn otherwise. */
  override isHoldingManaForAnswers(): boolean {
    if (!super.isHoldingManaForAnswers()) return false;
    const minimumPower = (this.config.hold_opponent_power as number) ?? 0;
    if (minimumPower <= 0) return true;
    const arena = this.arena!;
    return this.life.some(
      (_life, slot) =>
        this.isOpponentAlive(slot) &&
        arena.board(this, slot).reduce((total, power) => total + power, 0) >=
          minimumPower,
    );
  }

  // ================================================================ tutors
  tutorPriorities(): string[] {
    const wantedNames: string[] = [];
    if (!this.findFreeSacrificeOutlet())
      wantedNames.push('Viscera Seer', 'Umbral Collar Zealot', 'Woe Strider');
    wantedNames.push(
      GRAY_MERCHANT,
      'Twilight Diviner',
      'Sepulchral Primordial',
      'Grave Titan',
      'Morbid Opportunist',
    );
    if (this.creaturesInGraveyard() >= 8) wantedNames.unshift('Lotleth Giant');
    return wantedNames;
  }

  override tutorTarget(
    allowed: (card: CardDef) => boolean,
    _toTop: boolean,
    _spent: string | null = null,
  ): CardDef | null {
    const candidates = this.library.filter(allowed);
    if (!candidates.length) return null;
    for (const name of this.tutorPriorities()) {
      const wantedCard = candidates.find(
        (card) =>
          card.name === name &&
          !this.isOnBattlefield(name) &&
          !this.hand.some((inHandCard) => inHandCard.name === name),
      );
      if (wantedCard) return wantedCard;
    }
    return firstMax(candidates, (card) => this.cardValue(card));
  }

  /** A card from the library into the graveyard (Vile Entomber, Buried Alive). */
  tutorToGraveyard(allowed: (card: CardDef) => boolean): void {
    const candidates = this.library.filter(
      (card) => allowed(card) && !this.graveyard.includes(card),
    );
    if (!candidates.length) return;
    const order = [
      GRAY_MERCHANT,
      'Sepulchral Primordial',
      'Lotleth Giant',
      'Grave Titan',
      'Protean Hulk',
      'Rune-Scarred Demon',
    ];
    const chosen =
      order
        .map((name) => candidates.find((card) => card.name === name))
        .find((card) => card) ??
      firstMax(candidates, (card) => this.battlefieldValue(card));
    this.takeCardIfThere(chosen, 'library');
    this.toGraveyard(chosen, true);
    this.shuffle();
  }

  // ================================================================ spells
  override resolveOther(
    card: CardDef,
    _fromGraveyard: boolean,
    mode: string | null,
  ): void {
    const name = card.name;
    if (name === 'Decode Transmissions') {
      this.draw(2, name);
      if (this.leftThisTurn) this.drainEach(2);
      else this.loseLife(2);
    } else if (name === 'Village Rites') this.draw(2, name);
    else if (name === 'Breach the Multiverse') {
      this.millOurselves(10);
      for (let i = 0; i < this.opponentLibrarySizes.length; i++)
        this.opponentLibrarySizes[i] = Math.max(
          0,
          this.opponentLibrarySizes[i] - 10,
        );
      const best = this.bestCreatureInGraveyard();
      if (best) this.reanimate(best);
      // a 5/5 copy of a creature in each graveyard
      for (let i = 0; i < this.countOpponentsAlive(); i++)
        this.enter(TOKENS.stolen, 'graveyard', { token: true }).marks |=
          STOLEN_MARK;
    } else if (name === 'Grisly Salvage') {
      const top = this.takeTopCardsOfLibrary(5);
      const keep = top.filter(
        (candidate) => candidate.isCreature || candidate.land !== null,
      );
      const kept = keep.length
        ? firstMax(keep, (candidate) => this.cardValue(candidate))
        : null;
      for (const otherCard of top)
        if (otherCard === kept) this.putCard(otherCard, 'hand');
        else this.toGraveyard(otherCard, true);
    } else if (name === 'Songs of the Damned')
      this.pool.B += this.creaturesInGraveyard();
    else if (name === 'Deadly Brew') {
      if (this.inArena()) this.arena!.edict(this, false);
      const permanent = this.sacrificeOrder()[0];
      if (permanent) {
        this.sacrifice(permanent);
        const back = this.graveyard.filter(
          (candidate) =>
            candidate !== permanent.card && candidate.land === null,
        );
        if (back.length) {
          const creature = firstMax(back, (candidate) =>
            this.cardValue(candidate),
          );
          this.takeCardIfThere(creature, 'graveyard');
          this.putCard(creature, 'hand');
        }
      }
    } else if (name === 'Buried Alive') {
      for (let copyNumber = 0; copyNumber < 3; copyNumber++)
        this.tutorToGraveyard((candidate) => candidate.isCreature);
    } else if (name === "Dina's Guidance") {
      if (mode === 'gy')
        this.tutorToGraveyard((candidate) => candidate.isCreature);
      else this.doTutor((candidate) => candidate.isCreature, false);
    }
  }
  candidates(main2: boolean): Candidate[] {
    return buildCandidates(this, main2);
  }
}
