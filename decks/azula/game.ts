/**
 * Fire Lord Azula's deck (Friend 3's Grixis spells deck, bracket 4, pod-only): the rules of its own cards.
 * The win, combat, values and the planner's score come from the engine's CreatureDeckGame. The engine also does
 * firebending (firebending.ts: an attacker's {R} before the attack triggers), spell copies and magecraft
 * (spell-copies.ts: Twinning Staff, Storm-Kiln Artist, Archmage Emeritus, Veyran), the counterspells (answers.ts:
 * Force of Will and Fierce Guardianship free when allowed) and Rhystic Study.
 *
 * Files: cards.ts (names, values), game.ts (this file), spells.ts (what our spells do), combos.ts (the ten
 * combos), candidates.ts (what the AI may do now).
 *
 * The deck attacks with Azula and casts its spells during combat: she copies each one (firebending pays for the
 * first). Storm of Saruman, Prismari, Arcane Bombardment, Mysterious Stranger and Torrential Gearhulk give more
 * copies and free casts. It wins with one of ten infinite combos (combos.ts) and a finisher, or by damage.
 */
import {
  ARCANE_BOMBARDMENT,
  AZULA,
  EQUIPMENT,
  FATED_FIREPOWER,
  FINISHERS,
  FIREBENDER_ASCENSION,
  FIREBENDING_SOLDIER,
  FLASH_FOR_ALL,
  HOLD,
  MINDSPLICE_APPARATUS,
  MYSTERIOUS_STRANGER,
  OZAI,
  PRISMARI,
  SOZINS_COMET,
  STORM_KILN_ARTIST,
  STORM_OF_SARUMAN,
  TORRENTIAL_GEARHULK,
  VALUE,
  VIVI,
  WEARS_BOOTS,
  WEARS_CLOAK,
  WEARS_GREAVES,
  WIZARDS_OF_THAY,
} from './cards';
import { buildCandidates } from './candidates';
import { ComboWin, missingComboPiece } from './combos';
import { resolveAzulaSpell } from './spells';
import { CardDef, Cost } from '../../engine/cards/cards';
import {
  Candidate,
  Permanent,
  WinAttempt,
  Zone,
  emptyPool,
} from '../../engine/game/game-types';
import { Answer } from '../../engine/game/answers';
import { CreatureDeckGame } from '../../engine/game/creature-deck';
import type { TurnStep } from '../../engine/game/game-core';
import { printedFirebending } from '../../engine/game/firebending';
import { copySpell } from '../../engine/game/spell-copies';
import { firstMax } from '../../engine/util/lists';

export class AzulaGame extends CreatureDeckGame {
  override colors = ['U', 'B', 'R'];
  readonly values = VALUE;

  /** Azula was declared as an attacker this combat: each spell we cast is copied. */
  isAzulaAttacking = false;
  /** The X we chose for the X spell being cast (its copies have the same X). */
  chosenX = 0;
  /** The turn we cast Sozin's Comet: each creature has firebending 5. */
  sozinsCometTurn = -1;
  /** Firebender Ascension's quest counters (the list has one Ascension). */
  firebenderQuestCounters = 0;
  /** Mindsplice Apparatus's oil counters, over all of them: each makes instants and sorceries cost {1} less. */
  mindspliceOilCounters = 0;
  /** Arcane Bombardment's exiled cards (one Bombardment in the list); it triggers on the first spell each turn. */
  cardsExiledWithBombardment: CardDef[] = [];
  hasBombardmentTriggeredThisTurn = false;
  /** Jeska's Will's exiled cards we may play this turn (in hand until the end of the turn). */
  cardsPlayableThisTurnOnly: CardDef[] = [];
  /** Sea Gate Restoration: no maximum hand size for the rest of the game. */
  hasSeaGateRestorationResolved = false;
  /** The combo we went off with this turn (for the pod's answers). */
  comboWin: ComboWin | null = null;
  /** We are casting an answer on another player's turn: none of our "whenever you cast" copies apply. */
  isCastingAnswer = false;

  override startTurn(): void {
    super.startTurn();
    this.isAzulaAttacking = false;
    this.hasBombardmentTriggeredThisTurn = false;
    this.comboWin = null;
  }

  // ================================================================ what the combos and candidates ask
  cardInHand(name: string): CardDef | undefined {
    return this.hand.find((card) => card.name === name);
  }

  azula(): Permanent | null {
    return this.findPermanent(AZULA);
  }

  /** Is Azula on the battlefield and able to attack this turn (haste from Lightning Greaves or Swiftfoot Boots)? */
  canAzulaAttack(): boolean {
    const azula = this.azula();
    return azula !== null && !this.attacked && this.canAttack(azula);
  }

  /** May we cast a sorcery now: in a main phase, or in combat with something that gives sorceries flash. */
  canCastSorceryNow(): boolean {
    if (this.step !== 'combat') return true;
    return (
      this.isOnBattlefield(WIZARDS_OF_THAY) ||
      [...FLASH_FOR_ALL].some((name) => this.isOnBattlefield(name))
    );
  }

  /** May we cast this card now (its timing: instants and flash any time, the rest in a main phase or with flash
   *  from Leyline of Anticipation, High Fae Trickster, Valley Floodcaller or Wizards of Thay)? */
  canCastNow(card: CardDef): boolean {
    return this.step !== 'combat' || this.canCastInCombat(card);
  }

  /** May we cast this card during combat (Scarring Memories: while Azula attacks)? */
  canCastInCombat(card: CardDef): boolean {
    if (card.isInstant || card.keywords.has('flash')) return true;
    if (this.isOnBattlefield('Leyline of Anticipation')) return true;
    if (this.isOnBattlefield('High Fae Trickster')) return true;
    if (!card.isCreature && this.isOnBattlefield('Valley Floodcaller'))
      return true;
    if (card.isSorcery && this.isOnBattlefield(WIZARDS_OF_THAY)) return true;
    // Scarring Memories: flash while a legendary creature of ours attacks
    return (
      card.name === 'Scarring Memories' &&
      (this.isAzulaAttacking || this.step !== 'combat')
    );
  }

  /** The most cards an opponent holds (a goldfish opponent: config opp_hand). */
  mostCardsInAnOpponentsHand(): number {
    let most = 0;
    for (let slot = 0; slot < this.life.length; slot++)
      if (this.isOpponentAlive(slot))
        most = Math.max(
          most,
          this.inArena()
            ? this.arena!.handSize(this, slot)
            : (this.config.opp_hand as number),
        );
    return most;
  }

  /** The tapped lands the opponents control in all (goldfish: config opp_tapped_per_turn a turn). */
  opponentsTappedLands(): number {
    if (!this.inArena())
      return Math.round(
        (this.config.opp_tapped_per_turn as number) * this.turn,
      );
    let total = 0;
    for (let slot = 0; slot < this.life.length; slot++)
      if (this.isOpponentAlive(slot))
        total += this.arena!.tappedLands(this, slot);
    return total;
  }

  /** What an opponent can give up to Torment of Hailfire: its hand and its creatures (goldfish: config opp_hand). */
  cardsAndPermanentsOfOpponent(slot: number): number {
    if (!this.inArena()) return this.config.opp_hand as number;
    return (
      this.arena!.handSize(this, slot) + this.arena!.board(this, slot).length
    );
  }

  /** Our lands that can make {U}. */
  landsThatMakeBlue(): number {
    return this.landsOnBattlefield().filter((land) => {
      const kind = this.manaSourceKind(land, true) ?? '';
      return kind === 'A' || kind.includes('U');
    }).length;
  }

  /** The instant or sorcery in hand a combo casts first to copy (not one of `used`): a finisher if we can pay it
   *  with `extraCost`, else the cheapest we can. `maxColouredPips` limits its coloured mana. */
  chooseSpellToCopy(
    used: CardDef[],
    extraCost: Cost,
    maxColouredPips = 99,
  ): CardDef | null {
    const options = this.hand.filter(
      (card) =>
        card.isInstantOrSorcery &&
        !used.includes(card) &&
        this.answer(card)?.kind !== 'counter' &&
        (card.isInstant || this.canCastSorceryNow()) &&
        colouredPips(card.cost) <= maxColouredPips &&
        this.canPay(this.effectiveCost(card).plus(extraCost), true),
    );
    if (!options.length) return null;
    const finisher = options.find((card) => FINISHERS.has(card.name));
    if (finisher) return finisher;
    return options.reduce((cheapest, card) =>
      card.manaValue < cheapest.manaValue ? card : cheapest,
    );
  }

  /** The largest X we can pay for this X spell now. */
  largestX(card: CardDef): number {
    const cost = this.effectiveCost(card);
    let x = 0;
    while (x < 30 && this.canPay(cost.withGeneric(cost.generic + x + 1), true))
      x++;
    return x;
  }

  // ================================================================ casting: copies and free casts
  /** Every spell we cast passes here (the engine announces it to a pod): Vivi pings; Azula, Storm of Saruman and
   *  Prismari copy it; Arcane Bombardment casts its exiled cards again. */
  override podAnnounceCast(card: CardDef): void {
    super.podAnnounceCast(card);
    if (!card.isCreature) this.viviPings();
    if (this.isCastingAnswer) return;
    if (this.isAzulaAttacking) {
      this.say(`  ${AZULA} copies`, card);
      copySpell(this, card);
    }
    if (this.spellsCast === 2) {
      // counted once: a token copy of Storm of Saruman entering now doesn't copy this spell
      const storms = this.countOnBattlefield(STORM_OF_SARUMAN);
      for (let i = 0; i < storms; i++) this.copyAsNonlegendary(card);
    }
    if (card.isInstantOrSorcery && this.isOnBattlefield(PRISMARI)) {
      const stormCount = this.spellsCast - 1;
      if (stormCount > 0) {
        this.say(`  storm (${PRISMARI}): ${stormCount}`);
        copySpell(this, card, stormCount);
      }
    }
    if (card.isInstantOrSorcery) this.arcaneBombardmentTriggers();
  }

  /** Storm of Saruman's copy "isn't legendary": a legendary creature's copy stays. */
  copyAsNonlegendary(card: CardDef): void {
    if (card.isInstantOrSorcery || !card.types.has('legendary')) {
      copySpell(this, card);
      return;
    }
    this.say(`  token copy of`, card, '(not legendary)');
    this.enter(card, 'token', { token: true });
  }

  /** Vivi Ornitier: a noncreature spell puts a +1/+1 counter on it and deals 1 damage to each opponent. */
  viviPings(): void {
    for (const vivi of this.battlefield) {
      if (vivi.card.name !== VIVI) continue;
      vivi.counters += 1;
      this.drainEach(1);
    }
  }

  /** Arcane Bombardment (the first instant or sorcery each turn): exile a random instant or sorcery from our
   *  graveyard, then cast a copy of each card it has exiled, free. */
  arcaneBombardmentTriggers(): void {
    if (
      this.hasBombardmentTriggeredThisTurn ||
      !this.isOnBattlefield(ARCANE_BOMBARDMENT)
    )
      return;
    this.hasBombardmentTriggeredThisTurn = true;
    const spells = this.graveyard.filter((card) => card.isInstantOrSorcery);
    if (spells.length) {
      const exiled = spells[Math.floor(this.rng.random() * spells.length)];
      this.moveCard(exiled, 'graveyard', 'exile');
      this.cardsExiledWithBombardment.push(exiled);
    }
    for (const card of this.cardsExiledWithBombardment.slice())
      this.castCopyWithoutPaying(card, ARCANE_BOMBARDMENT);
  }

  /** Cast a copy of a card without paying (Arcane Bombardment, Mysterious Stranger, Torrential Gearhulk): it is
   *  cast, so it triggers what casting does (and Azula copies it). An X spell's copy has X = 0. */
  castCopyWithoutPaying(card: CardDef, source: string): void {
    this.sayEvent('cast', `cast ${card.name} (a free copy, from ${source})`);
    this.chosenX = 0;
    this.spellsCast += 1;
    if (card.isInstantOrSorcery) this.onCastInstantOrSorcery(false);
    this.podAnnounceCast(card);
    if (this.podCounters(card)) return;
    if (card.isInstantOrSorcery) this.resolve(card);
    else if (!card.types.has('legendary'))
      this.enter(card, 'token', { token: true });
  }

  /** Casting an answer on another player's turn (the pod): Vivi still pings, nothing copies it. */
  override podCast(card: CardDef): boolean {
    this.isCastingAnswer = true;
    try {
      return super.podCast(card);
    } finally {
      this.isCastingAnswer = false;
    }
  }

  override resolveOther(
    card: CardDef,
    fromGraveyard: boolean,
    mode: string | null,
  ): void {
    if (!resolveAzulaSpell(this, card))
      super.resolveOther(card, fromGraveyard, mode);
  }

  /** Mindsplice Apparatus's oil counters make instants and sorceries cheaper. */
  override instantOrSorceryCostReduction(): number {
    return super.instantOrSorceryCostReduction() + this.mindspliceOilCounters;
  }

  // ================================================================ enter
  override onEnter(permanent: Permanent, from: Zone): void {
    super.onEnter(permanent, from);
    switch (permanent.card.name) {
      case FIREBENDER_ASCENSION:
        this.firebenderQuestCounters = 0;
        this.createTokens(FIREBENDING_SOLDIER);
        break;
      case FATED_FIREPOWER:
        permanent.counters = this.chosenX; // its fire counters
        break;
      case MYSTERIOUS_STRANGER:
        this.mysteriousStrangerCasts();
        break;
      case TORRENTIAL_GEARHULK:
        this.torrentialGearhulkCasts();
        break;
      case 'Necron Deathmark':
        // destroy a creature (the pod's biggest threat's best); the mill is not modelled
        if (this.inArena())
          this.arena!.snipe(this, CREATURE_REMOVAL, 'Necron Deathmark');
        break;
    }
  }

  /** Mysterious Stranger: a random instant or sorcery from the graveyards, cast free. We see only our graveyard;
   *  in a pod another graveyard almost always has one too (the copy needs two exiled), so ours is cast. */
  mysteriousStrangerCasts(): void {
    const spells = this.graveyard.filter((card) => card.isInstantOrSorcery);
    if (!spells.length || !this.inArena()) return;
    const card = spells[Math.floor(this.rng.random() * spells.length)];
    this.moveCard(card, 'graveyard', 'exile');
    this.castCopyWithoutPaying(card, MYSTERIOUS_STRANGER);
  }

  /** Torrential Gearhulk: the best instant in our graveyard (not an answer: there is nothing to answer), cast
   *  free, then exiled. */
  torrentialGearhulkCasts(): void {
    const instants = this.graveyard.filter(
      (card) => card.isInstant && !this.answer(card),
    );
    if (!instants.length) return;
    const card = firstMax(instants, (instant) => this.cardValue(instant));
    this.moveCard(card, 'graveyard', 'exile');
    this.castCopyWithoutPaying(card, TORRENTIAL_GEARHULK);
  }

  override upkeep(): void {
    super.upkeep();
    this.mindspliceOilCounters += this.countOnBattlefield(MINDSPLICE_APPARATUS);
  }

  override endTurn(): void {
    for (const card of this.cardsPlayableThisTurnOnly)
      if (this.hand.includes(card)) this.moveCard(card, 'hand', 'exile');
    this.cardsPlayableThisTurnOnly = [];
    super.endTurn();
  }

  /** Sea Gate Restoration too. */
  override hasNoMaximumHandSize(): boolean {
    return this.hasSeaGateRestorationResolved || super.hasNoMaximumHandSize();
  }

  // ================================================================ combat
  /** Azula's attack: her firebending (the engine's) pays for spells cast now, and she copies each one. Sozin's
   *  Comet gives each attacker firebending 5; Firebender Ascension copies a firebending trigger from its fourth
   *  quest counter. Then we cast what we held for combat (candidates.ts), a combo first if one is ready. */
  override onAttack(attackers: Permanent[]): Permanent[] {
    for (const attacker of attackers) {
      if (this.sozinsCometTurn === this.turn) {
        this.pool.R += 5;
        this.say(`  firebending 5 (${SOZINS_COMET}):`, attacker.card);
      }
      const firebending = printedFirebending(attacker.card);
      if (firebending > 0 && this.isOnBattlefield(FIREBENDER_ASCENSION)) {
        this.firebenderQuestCounters += 1;
        if (this.firebenderQuestCounters >= 4) {
          this.pool.R += firebending;
          this.say(`  ${FIREBENDER_ASCENSION} copies firebending`);
        }
      }
    }
    if (attackers.some((attacker) => attacker.card.name === AZULA)) {
      this.isAzulaAttacking = true;
      this.developWin(false);
    }
    return [];
  }

  /** Azula's copies end with combat. Ozai: mana we would lose becomes red instead (it stays in the pool). */
  override enterStep(step: TurnStep): void {
    const unspent = Object.values(this.pool).reduce(
      (total, amount) => total + amount,
      0,
    );
    const keepsMana = unspent > 0 && this.isOnBattlefield(OZAI);
    if (keepsMana) this.pool = emptyPool();
    super.enterStep(step);
    if (keepsMana) this.pool.R += unspent;
  }

  override onEnterStep(step: TurnStep): void {
    if (step !== 'combat') this.isAzulaAttacking = false;
  }

  /** Lightning Greaves and Swiftfoot Boots give haste. */
  override canAttack(permanent: Permanent): boolean {
    if (permanent.sick && permanent.marks & (WEARS_GREAVES | WEARS_BOOTS)) {
      permanent.sick = false;
      const canAttack = super.canAttack(permanent);
      permanent.sick = true;
      return canAttack;
    }
    return super.canAttack(permanent);
  }

  /** A pod: Azula attacks whenever we hold something to cast during combat (her copies are the point). */
  override mustAttack(creature: Permanent): boolean {
    if (
      creature.card.name === AZULA &&
      this.config.azula_attacks_to_cast !== false &&
      this.hasSomethingToCastInCombat()
    )
      return true;
    return super.mustAttack(creature);
  }

  hasSomethingToCastInCombat(): boolean {
    return this.hand.some(
      (card) =>
        card.land === null &&
        (!HOLD.has(card.name) || FINISHERS.has(card.name)) &&
        (card.isInstant || card.keywords.has('flash')),
    );
  }

  /** Whispersilk Cloak: Azula can't be blocked. */
  override evasive(permanent: Permanent): boolean {
    if (permanent.marks & WEARS_CLOAK) return true;
    return super.evasive(permanent);
  }

  /** Lightning Greaves and Whispersilk Cloak (shroud) and Swiftfoot Boots (hexproof): the others can't target Azula. */
  override podCanTarget(permanent: Permanent, answer: Answer): boolean {
    if (permanent.marks & (WEARS_GREAVES | WEARS_BOOTS | WEARS_CLOAK))
      return false;
    return super.podCanTarget(permanent, answer);
  }

  /** Equip: the equipment goes on Azula. */
  equipAzula(equipmentName: string): boolean {
    const azula = this.azula();
    const equipment = EQUIPMENT[equipmentName];
    if (!azula || azula.marks & equipment.mark) return false;
    if (!this.pay(new Cost(equipment.cost))) return false;
    azula.marks |= equipment.mark;
    this.say(`  equip ${equipmentName} ->`, azula.card);
    return true;
  }

  // ================================================================ damage
  /** Fated Firepower: damage to an opponent from our sources is increased by its fire counters. */
  override damageOpponent(i: number, amount: number): number {
    let fireCounters = 0;
    for (const permanent of this.battlefield)
      if (permanent.card.name === FATED_FIREPOWER)
        fireCounters += permanent.counters;
    return super.damageOpponent(i, amount > 0 ? amount + fireCounters : amount);
  }

  /** Life loss, not damage (Torment of Hailfire, Scarring Memories): Fated Firepower doesn't add to it. */
  opponentLosesLife(i: number, amount: number): number {
    return super.damageOpponent(i, amount);
  }

  // ================================================================ the combo win and the pod
  /** A combo reached its finisher: every opponent dies (the pod may still answer it). */
  killEveryOpponent(win: ComboWin): void {
    this.podPre = [
      this.life.slice(),
      this.opponentLibrarySizes.slice(),
      this.poison.slice(),
    ];
    this.comboWin = win;
    for (let slot = 0; slot < this.life.length; slot++)
      if (this.isOpponentAlive(slot))
        this.opponentLosesLife(slot, this.life[slot]);
  }

  /** A pod: the combo is answered by countering one of its spells (or the finisher), or by removing a piece. */
  override winAttempt(): WinAttempt | null {
    const win = this.comboWin;
    if (!win) return null;
    const spells = win.spells.map((card) => card.name);
    if (win.buyback) spells.push(win.buyback.name);
    if (FINISHERS.has(win.finisher)) spells.push(win.finisher);
    const perms = [...win.permanents, win.finisher].filter((name) =>
      this.isOnBattlefield(name),
    );
    const backup = this.hand.some(
      (card) => this.answer(card)?.kind === 'counter',
    )
      ? 1
      : 0;
    return { spells, perms, backup };
  }

  override podWinStopped(): void {
    super.podWinStopped();
    this.comboWin = null;
  }

  /** How close to winning the others think we are: Azula and the combo engines on the battlefield, or the power. */
  override podClose(): number {
    let closeness = 0;
    if (this.isOnBattlefield(AZULA)) closeness += 0.3;
    if (this.isOnBattlefield(STORM_KILN_ARTIST)) closeness += 0.3;
    if (this.isOnBattlefield(PRISMARI)) closeness += 0.2;
    if (this.isOnBattlefield(VIVI)) closeness += 0.2;
    if (this.isOnBattlefield(STORM_OF_SARUMAN)) closeness += 0.1;
    if (this.isOnBattlefield(ARCANE_BOMBARDMENT)) closeness += 0.1;
    return Math.min(1, Math.max(super.podClose(), closeness));
  }

  /** Tutors (Waterlogged Teachings) fetch the one card a combo still lacks, if any. */
  override tutorTarget(
    allowed: (card: CardDef) => boolean,
    toTop: boolean,
    spent: string | null = null,
    rampOk = false,
  ): CardDef | null {
    return (
      missingComboPiece(this, allowed) ??
      super.tutorTarget(allowed, toTop, spent, rampOk)
    );
  }

  /** The planner: the engines that make the combos and the copies are worth something before they show. */
  override positionValue(): number {
    let value = super.positionValue();
    for (const name of [STORM_KILN_ARTIST, PRISMARI, STORM_OF_SARUMAN])
      if (this.isOnBattlefield(name)) value += 20;
    return value;
  }

  candidates(main2: boolean): Candidate[] {
    return buildCandidates(this, main2);
  }
}

/** Necron Deathmark's enter trigger, as the pod's removal. */
const CREATURE_REMOVAL: Answer = {
  kind: 'removal',
  instant: false,
  hits: ['creature'],
  how: 'destroy',
};

function colouredPips(cost: Cost): number {
  return (
    cost.white + cost.blue + cost.black + cost.red + cost.green + cost.hybrid
  );
}
