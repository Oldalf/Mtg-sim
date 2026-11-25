/**
 * Hama Pashar's deck (William's Azorius blink and dungeon deck, pod-only): the rules of its own cards.
 * The win, combat, values and the planner's score come from the engine's CreatureDeckGame. The engine also does the
 * dungeons and the initiative (dungeons.ts: Hama Pashar and Dungeon Delver make rooms trigger again; "enters,
 * venture" and "enters, take the initiative" are read from the card text), blink (blink.ts: the blink spells,
 * Ephemerate's rebound, cards back at the end step) and the trigger doublers (Panharmonicon, Starfield Vocalist).
 *
 * Files: cards.ts (names, values, blink values), game.ts (this file), candidates.ts (what the AI may do now).
 *
 * The deck blinks its enter and leave triggers again and again, and with them ventures into the dungeon (Lost Mine
 * of Phandelver early: scry, tokens, drains, cards; the Undercity later through the initiative, past the Trap! room).
 * It controls the board by bouncing the opponents' permanents (Hullbreaker Horror, Aether Channeler, Avatar's Wrath)
 * and wins by combat (+1/+1 counters from the rooms and Cathars' Crusade, Midnight Pathlighter) or by the Trap!
 * room's 5 life, three times with Hama Pashar and Dungeon Delver. See primer.txt (the owner's) and PLAN.md.
 */
import {
  AETHER_CHANNELER,
  AGENT_OF_TREACHERY,
  AIRBENDER_ASCENSION,
  ALL_ABOARD,
  ANCESTRAL_RECALL,
  ARCHAEOMANCERS_MAP,
  BIRD,
  BLINK_VALUE,
  AVATARS_WRATH,
  BRAGO,
  CLOISTER_GARGOYLE,
  DELVERS_TORCH,
  DJINNI_WINDSEER,
  EMERITUS_OF_IDEATION,
  EPHARA,
  EPHEMERATE,
  EQUIPPED_WITH_TORCH,
  FOX,
  GENKU,
  GHOSTLY_FLICKER,
  HULLBREAKER_HORROR,
  KNIGHT_OF_THE_WHITE_ORCHID,
  KYKAR,
  LAEZELS_ACROBATICS,
  LAND_TAX,
  MIDNIGHT_PATHLIGHTER,
  MOMO,
  MOONFOLK,
  MORNINGTIDES_LIGHT,
  NADAAR,
  NIKO,
  OJI,
  PENSIVE_PROFESSOR,
  PREPARED,
  RASPUTIN,
  RAT,
  SHARD,
  SKYCOACH_CONDUCTOR,
  SMALLEST_BLINK_WORTH_IT,
  SOLDIER,
  SPIRIT,
  STARFIELD_SHEPHERD,
  THASSA,
  TOMB_OF_HORRORS_ADVENTURER,
  UNDERCELLAR_SWEEP,
  VALUE,
  WHITE_PLUME_ADVENTURER,
  YUAN_TI_MALISON,
} from './cards';
import { buildCandidates } from './candidates';
import { CardDef } from '../../engine/cards/cards';
import {
  Candidate,
  Evasion,
  Permanent,
  Zone,
} from '../../engine/game/game-types';
import type { TurnStep } from '../../engine/game/game-core';
import { Answer, Hit } from '../../engine/game/answers';
import { CreatureDeckGame } from '../../engine/game/creature-deck';
import {
  enterTriggerOfCommonCard,
  upkeepOfCommonCards,
} from '../../engine/card-rules/card-rules';
import { triggersOfCreatureEntering } from '../../engine/game/creature-enter-triggers';
import {
  BLINK_SPELLS,
  BlinkAnswer,
  blink,
  resolveBlinkSpell,
} from '../../engine/game/blink';
import { ventureIntoDungeon } from '../../engine/game/dungeons';
import { fetchLand } from '../../engine/game/land-search';
import { enterTriggerCount } from '../../engine/game/trigger-doublers';
import { firstMax } from '../../engine/util/lists';

/** The blink spells we keep mana open for, to save a creature from removal. (Lae'zel's Acrobatics, against a wipe, is
 *  cast with whatever mana is left: four mana held all game costs more than the wipes it answers.) */
const BLINK_DODGES = new Set([EPHEMERATE, GHOSTLY_FLICKER]);

const NONLAND: Hit[] = ['creature', 'artifact', 'enchantment', 'planeswalker'];

/** Agent of Treachery's "gain control of target permanent", as the pod's removal (we don't use what we take). */
const AGENT_OF_TREACHERY_STEALS: Answer = {
  kind: 'removal',
  instant: false,
  hits: NONLAND,
  how: 'exile',
};

/** Aether Channeler's and Hullbreaker Horror's "return target nonland permanent to its owner's hand". */
const BOUNCE_NONLAND_PERMANENT: Answer = {
  kind: 'removal',
  instant: false,
  hits: NONLAND,
  how: 'bounce',
};

/** Aether Channeler bounces instead of drawing only a permanent worth at least this much to its owner (an
 *  opponent's commander always counts: it costs 2 more next time). */
const CHANNELER_BOUNCE_MIN_VALUE = 60;

/** Avatar's Wrath (and Morningtide's Light for its shield) when the strongest opponent's creatures have this much
 *  power in all, and what we lose has at most half of it (the pod's rule for a board wipe). */
const BEHIND_ON_BOARD_POWER = 10;

/** Genku's tokens, one of each a turn, in the order we take them. */
const GENKU_TOKENS = [FOX, MOONFOLK, RAT];

export class DndGame extends CreatureDeckGame {
  override colors = ['W', 'U'];
  readonly values = VALUE;

  /** Airbender Ascension's quest counters (one Ascension: it is the only one in the list). */
  airbenderQuestCounters = 0;
  /** Rasputin's dream counters. */
  rasputinDreamCounters = 0;
  /** Genku's tokens made this turn (each kind once a turn). */
  genkuTokensThisTurn = 0;
  /** Ephara: did a creature enter under our control since the last upkeep (ours or an opponent's)? */
  hasCreatureEnteredSinceLastUpkeep = false;
  /** Morningtide's Light resolved: all damage to us is prevented until our next turn. */
  isDamagePreventedUntilOurTurn = false;
  /** While we cast a blink spell in an opponent's turn: what it saves (the engine's blink then uses it). */
  blinkAnswer: BlinkAnswer | null = null;

  override startTurn(): void {
    super.startTurn();
    this.genkuTokensThisTurn = 0;
    this.isDamagePreventedUntilOurTurn = false;
  }

  // ================================================================ enter
  /** Each enter trigger runs once more per doubler (Panharmonicon, Starfield Vocalist). */
  override onEnter(permanent: Permanent, _from: Zone): void {
    const card = permanent.card;
    // "enters prepared" and the counters it starts with are not triggers
    if (card.name === SKYCOACH_CONDUCTOR || card.name === EMERITUS_OF_IDEATION)
      permanent.marks |= PREPARED;
    if (card.name === AIRBENDER_ASCENSION) this.airbenderQuestCounters = 0;
    if (card.name === RASPUTIN) this.rasputinDreamCounters = 0;
    const triggerCount = enterTriggerCount(this, permanent);
    for (let i = 0; i < triggerCount; i++) {
      enterTriggerOfCommonCard(this, permanent);
      this.enterTrigger(permanent);
      // Cathars' Crusade, Radiant Solar
      triggersOfCreatureEntering(this, permanent);
    }
    if (this.isCreatureNow(permanent)) {
      this.hasCreatureEnteredSinceLastUpkeep = true;
      if (this.isOnBattlefield(AIRBENDER_ASCENSION))
        this.airbenderQuestCounters += triggerCount;
    }
  }

  /** The enter triggers of the deck's own cards (the engine's are in enterTriggerOfCommonCard). */
  enterTrigger(permanent: Permanent): void {
    switch (permanent.card.name) {
      case NIKO:
        this.createTokens(SHARD, 2);
        break;
      case OJI:
        this.gainLife(2);
        this.scry(2);
        break;
      case AETHER_CHANNELER:
        this.aetherChannelerChooses();
        break;
      case DJINNI_WINDSEER:
        this.scry(this.rollD20() >= 10 ? 2 : 1);
        break;
      case RASPUTIN:
        this.rasputinDreamCounters += this.countOpponentsAlive();
        break;
      case STARFIELD_SHEPHERD:
        this.starfieldShepherdSearches();
        break;
      case ARCHAEOMANCERS_MAP:
        fetchLand(this, 'plains', false, true);
        fetchLand(this, 'plains', false, true);
        break;
      case KNIGHT_OF_THE_WHITE_ORCHID:
        if (this.opponentHasMoreLands()) fetchLand(this, 'plains', false);
        break;
      case AGENT_OF_TREACHERY:
        if (this.inArena())
          this.arena!.snipe(
            this,
            AGENT_OF_TREACHERY_STEALS,
            AGENT_OF_TREACHERY,
          );
        break;
    }
  }

  /** Aether Channeler: in a pod, bounce an opponent's permanent worth it (the primer's control); else a card, or a
   *  flying Bird when the hand is full. */
  aetherChannelerChooses(): void {
    if (
      this.inArena() &&
      this.arena!.snipe(
        this,
        BOUNCE_NONLAND_PERMANENT,
        AETHER_CHANNELER,
        CHANNELER_BOUNCE_MIN_VALUE,
      )
    )
      return;
    if (this.hand.length >= 6) this.createTokens(BIRD);
    else this.draw(1);
  }

  /** A d20 (20 counts as 19: Djinni Windseer's scry 3 is not worth a rule of its own). */
  rollD20(): number {
    const roll = 1 + Math.floor(this.rng.random() * 20);
    this.say(`  d20: ${roll}`);
    return roll;
  }

  /** Starfield Shepherd: a basic Plains while we have fewer than five lands, else a creature card with mana value 1
   *  or less (Momo), to hand. */
  starfieldShepherdSearches(): void {
    const isShortOfLands =
      this.landsOnBattlefield().length + this.countLandsHand() < 5;
    const creature = this.library.find(
      (card) => card.isCreature && card.manaValue <= 1,
    );
    if (!creature || isShortOfLands) {
      fetchLand(this, 'plains', false, true);
      return;
    }
    this.takeCard(creature, 'library');
    this.shuffle();
    this.putCard(creature, 'hand');
    this.say('  search ->', creature);
  }

  /** "If an opponent controls more lands than you": we don't see the opponents' lands, so the opponent with the
   *  most is taken to have played a land each turn, plus one from turn 3 (at a table of four, someone ramps). */
  opponentHasMoreLands(): boolean {
    const mostLandsOfAnOpponent = this.turn + (this.turn >= 3 ? 1 : 0);
    return this.landsOnBattlefield().length < mostLandsOfAnOpponent;
  }

  // ================================================================ leave
  /** Momo's leave trigger; Genku makes a token when another nontoken permanent of ours leaves. */
  override onLeave(permanent: Permanent): void {
    if (permanent.card.name === MOMO) this.momoLeaves();
    if (
      !permanent.token &&
      this.isOnBattlefield(GENKU) &&
      this.genkuTokensThisTurn < GENKU_TOKENS.length
    ) {
      this.createTokens(GENKU_TOKENS[this.genkuTokensThisTurn]);
      this.genkuTokensThisTurn += 1;
    }
  }

  /** Momo: a +1/+1 counter on our best creature, or scry 2 when we have none (the Food is never the best). */
  momoLeaves(): void {
    const creatures = this.creatures();
    if (creatures.length)
      firstMax(creatures, (creature) => this.power(creature)).counters += 1;
    else this.scry(2);
  }

  // ================================================================ blink
  /** How much we want this permanent blinked: its enter trigger (BLINK_VALUE), plus a token when Genku is out, less
   *  the +1/+1 counters it would lose (Cathars' Crusade and the rooms pile them up). */
  override blinkValue(permanent: Permanent): number {
    if (permanent.token || permanent.owner !== null) return -1;
    let value = BLINK_VALUE[permanent.card.name] ?? 0;
    if (
      permanent.card.name === SKYCOACH_CONDUCTOR &&
      !(permanent.marks & PREPARED)
    )
      value += 4; // it comes back prepared
    if (
      permanent.card.name === EMERITUS_OF_IDEATION &&
      !(permanent.marks & PREPARED)
    )
      value += 6;
    if (
      value > 0 &&
      this.isOnBattlefield(GENKU) &&
      permanent.card.name !== GENKU
    )
      value += 2;
    return value - permanent.counters;
  }

  /** Our creature most worth blinking (above 0), or null. */
  bestCreatureToBlink(
    isAllowed: (creature: Permanent) => boolean = () => true,
  ): Permanent | null {
    const options = this.creatures().filter(
      (creature) => this.blinkValue(creature) > 0 && isAllowed(creature),
    );
    return options.length
      ? firstMax(options, (creature) => this.blinkValue(creature))
      : null;
  }

  /** Blinks our best creature (Oji, Thassa, Airbender Ascension, All Aboard). Returns false if none is worth it. */
  blinkBestCreature(
    isAllowed: (creature: Permanent) => boolean = () => true,
  ): boolean {
    const creature = this.bestCreatureToBlink(isAllowed);
    if (!creature) return false;
    blink(this, creature);
    return true;
  }

  /** Is this creature worth a blink spell to save it from removal? Our commander, or one with an enter trigger. */
  isWorthSaving(creature: Permanent): boolean {
    return this.isCommander(creature) || this.blinkValue(creature) > 0;
  }

  /** An opponent aims removal at one of our creatures: Ephemerate or Ghostly Flicker in hand, with the mana open,
   *  blinks that creature and the removal misses it. */
  override podShield(permanent: Permanent): string | null {
    const shield = super.podShield(permanent);
    if (shield) return shield;
    if (
      !permanent.card.isCreature ||
      permanent.token ||
      !this.isWorthSaving(permanent)
    )
      return null;
    const spell = this.hand.find(
      (card) => card.name === EPHEMERATE || card.name === GHOSTLY_FLICKER,
    );
    return spell && this.castBlinkInAnswer(spell, [permanent])
      ? spell.name
      : null;
  }

  /** Mana to keep open for an answer: also the cost of the cheapest blink spell in hand that can save a creature from removal. */
  override podReserve(): number {
    const answerReserve = super.podReserve();
    if (!this.isHoldingManaForAnswers()) return answerReserve;
    const costs = this.hand
      .filter((card) => BLINK_DODGES.has(card.name))
      .map((card) => this.effectiveCost(card).manaValue);
    if (answerReserve > 0) costs.push(answerReserve);
    return costs.length ? Math.min(...costs) : 0;
  }

  /** An opponent's board wipe will kill our creatures: Lae'zel's Acrobatics exiles them until the end step. Worth it
   *  for our commander, or when what we save has enter triggers worth blinking. */
  override podAnswerWipe(dying: Permanent[], _destroys: boolean): Permanent[] {
    const nontokens = dying.filter(
      (creature) => !creature.token && creature.owner === null,
    );
    const valueSaved = nontokens.reduce(
      (total, creature) => total + Math.max(0, this.blinkValue(creature)),
      0,
    );
    const spell = this.hand.find((card) => card.name === LAEZELS_ACROBATICS);
    if (
      spell &&
      (valueSaved >= SMALLEST_BLINK_WORTH_IT ||
        nontokens.some((creature) => this.isCommander(creature)))
    )
      this.castBlinkInAnswer(spell, nontokens);
    return [];
  }

  /** Casts a blink spell from hand in an opponent's turn, blinking exactly these permanents. False if we can't pay. */
  castBlinkInAnswer(spell: CardDef, saved: Permanent[]): boolean {
    if (!this.canPay(this.effectiveCost(spell), true)) return false;
    this.blinkAnswer = { targets: saved };
    try {
      return this.castInstantOrSorcery(spell);
    } finally {
      this.blinkAnswer = null;
    }
  }

  /** Brago: each nonland permanent of ours worth blinking. */
  bragoBlinks(): void {
    const permanents = this.battlefield.filter(
      (permanent) => permanent.land === null && this.blinkValue(permanent) > 0,
    );
    for (const permanent of permanents) blink(this, permanent);
  }

  // ================================================================ spells we cast
  /** Every spell we cast passes here (the engine announces it to a pod): Pensive Professor, Hullbreaker Horror,
   *  Kykar, and on our second spell of the turn Oji and Tomb of Horrors Adventurer. */
  override podAnnounceCast(card: CardDef): void {
    super.podAnnounceCast(card);
    this.pensiveProfessorGrows(card);
    this.hullbreakerBounces();
    if (!card.isCreature) this.kykarTriggers();
    if (this.spellsCast !== 2) return;
    if (this.isOnBattlefield(OJI)) this.blinkBestCreature();
    for (
      let i = 0;
      i < this.countOnBattlefield(TOMB_OF_HORRORS_ADVENTURER);
      i++
    )
      this.copySpell(card, this.completedDungeons > 0 ? 2 : 1);
  }

  /** Pensive Professor (increment): a spell with more mana spent than its power or toughness gives it a +1/+1
   *  counter, and the counter draws a card. (The mana spent is taken as the spell's mana value.) */
  pensiveProfessorGrows(card: CardDef): void {
    for (const professor of this.battlefield.slice()) {
      if (professor.card.name !== PENSIVE_PROFESSOR) continue;
      const smaller = Math.min(
        this.power(professor),
        this.toughness(professor),
      );
      if (card.manaValue <= smaller) continue;
      professor.counters += 1;
      this.draw(1);
    }
  }

  /** Hullbreaker Horror, in a pod: each spell we cast returns the opponents' best nonland permanent to its owner's
   *  hand. (Returning a spell, or our own permanent to cast again, is not modelled.) */
  hullbreakerBounces(): void {
    if (!this.inArena()) return;
    for (let i = 0; i < this.countOnBattlefield(HULLBREAKER_HORROR); i++)
      this.arena!.snipe(this, BOUNCE_NONLAND_PERMANENT, HULLBREAKER_HORROR);
  }

  /** Kykar (a noncreature spell cast): blink another creature until the end step, or a 1/1 flying Spirit. Before
   *  combat only a creature that can't attack anyway is blinked (it would miss the attack). */
  kykarTriggers(): void {
    for (const kykar of this.battlefield.slice()) {
      if (kykar.card.name !== KYKAR) continue;
      const isBeforeCombat = this.step === 'main1' && !this.attacked;
      const creature = this.bestCreatureToBlink(
        (other) =>
          other !== kykar &&
          this.blinkValue(other) >= SMALLEST_BLINK_WORTH_IT &&
          (!isBeforeCombat || !this.canAttack(other)),
      );
      if (creature)
        blink(this, creature, {
          returnsAtEndStep: true,
          inOpponentTurn: !!this.blinkAnswer,
        });
      else this.createTokens(SPIRIT);
    }
  }

  /** Tomb of Horrors Adventurer: copies of our second spell. A permanent's copy is a token (not a legendary one: it
   *  would die to the legend rule). */
  copySpell(card: CardDef, copies: number): void {
    for (let i = 0; i < copies; i++) {
      if (card.isInstantOrSorcery) {
        this.say('  copy of', card.name);
        this.resolve(card);
      } else if (!card.types.has('legendary')) {
        this.say('  token copy of', card.name);
        this.enter(card, 'token', { token: true });
      }
    }
  }

  /** Skycoach Conductor (All Aboard) and Emeritus of Ideation (Ancestral Recall): cast a copy of the prepared spell.
   *  The creature is no longer prepared. */
  castPreparedSpell(creature: Permanent, spell: CardDef): boolean {
    if (!(creature.marks & PREPARED) || !this.pay(spell.cost, true))
      return false;
    creature.marks &= ~PREPARED;
    // (the creature's name as text: it is not the card cast)
    this.sayEvent(
      'cast',
      `cast ${spell.name} (a copy, from ${creature.card.name})`,
    );
    this.spellsCast += 1;
    this.onCastInstantOrSorcery(false);
    this.podAnnounceCast(spell);
    if (!this.podCounters(spell)) this.resolve(spell);
    return true;
  }

  /** Morningtide's Light: the engine blinks our creatures (blink.ts); here its shield, "until your next turn, prevent
   *  all damage that would be dealt to you". (Exiling the opponents' creatures too is not modelled.) */
  override resolve(
    card: CardDef,
    fromGraveyard = false,
    mode: string | null = null,
  ): void {
    if (this.blinkAnswer && BLINK_SPELLS[card.name]) {
      resolveBlinkSpell(this, card, this.blinkAnswer);
      return;
    }
    if (card.name === MORNINGTIDES_LIGHT) {
      this.isDamagePreventedUntilOurTurn = true;
      this.say('  all damage to us is prevented until our next turn');
    }
    super.resolve(card, fromGraveyard, mode);
  }

  override resolveOther(
    card: CardDef,
    fromGraveyard: boolean,
    mode: string | null,
  ): void {
    if (card === ALL_ABOARD)
      this.blinkBestCreature(
        (creature) => creature.card.name !== SKYCOACH_CONDUCTOR,
      );
    else if (card === ANCESTRAL_RECALL) this.draw(3);
    else if (card.name === AVATARS_WRATH) this.avatarsWrathResolves();
    else super.resolveOther(card, fromGraveyard, mode);
  }

  /** A pod attack on us: Morningtide's Light's shield prevents the damage. */
  override fogPrevent(_damage: number, _isLethal: boolean): boolean {
    return this.isDamagePreventedUntilOurTurn;
  }

  // ================================================================ Avatar's Wrath (a pod only)
  /** The power of the strongest opponent's creatures (0 outside a pod: a goldfish opponent has none). */
  strongestOpponentBoardPower(): number {
    if (!this.inArena()) return 0;
    let strongest = 0;
    for (let slot = 0; slot < this.life.length; slot++) {
      if (this.life[slot] <= 0) continue;
      const power = this.arena!.board(this, slot).reduce(
        (total, creaturePower) => total + creaturePower,
        0,
      );
      strongest = Math.max(strongest, power);
    }
    return strongest;
  }

  /** The creature Avatar's Wrath spares: our strongest. */
  creatureToKeepFromWrath(): Permanent | null {
    const creatures = this.creatures();
    return creatures.length
      ? firstMax(creatures, (creature) => this.power(creature))
      : null;
  }

  /** At the start of our second main phase in a pod, Avatar's Wrath when we are behind on board (the pod's rule for
   *  a wipe: the strongest opponent has 10 power or more, and what we lose has at most half of that). Outside the
   *  candidates, because the planner's copies have no opponents to see it work on. */
  override onEnterStep(step: TurnStep): void {
    super.onEnterStep(step);
    if (step !== 'main2' || !this.inArena()) return;
    const wrath = this.hand.find((card) => card.name === AVATARS_WRATH);
    if (!wrath || !this.canPay(this.effectiveCost(wrath), true)) return;
    const opponentPower = this.strongestOpponentBoardPower();
    const kept = this.creatureToKeepFromWrath();
    const powerWeLose = this.creatures()
      .filter((creature) => creature !== kept)
      .reduce((total, creature) => total + this.power(creature), 0);
    if (
      opponentPower >= BEHIND_ON_BOARD_POWER &&
      2 * powerWeLose <= opponentPower
    )
      this.castInstantOrSorcery(wrath);
  }

  /** Avatar's Wrath: our strongest creature stays, every other creature is airbended. The opponents' go back to
   *  hand (their {2} recast is counted as a full one), and so do ours (we cast them again: their enter triggers). */
  avatarsWrathResolves(): void {
    const kept = this.creatureToKeepFromWrath();
    if (this.inArena()) this.arena!.bounceAllCreatures(this, AVATARS_WRATH);
    for (const creature of this.creatures())
      if (creature !== kept) this.podRemove(creature, 'bounce');
  }

  // ================================================================ upkeep and end step
  override upkeep(): void {
    upkeepOfCommonCards(this);
    this.epharaDraws();
    if (this.isOnBattlefield(LAND_TAX) && this.opponentHasMoreLands())
      for (let i = 0; i < 3; i++) fetchLand(this, 'basic', false, true);
  }

  override opponentUpkeep(): void {
    super.opponentUpkeep();
    this.epharaDraws();
    this.whitePlumeUntaps();
  }

  /** Ephara: at each upkeep, a card if a creature entered under our control since the last one. */
  epharaDraws(): void {
    if (this.hasCreatureEnteredSinceLastUpkeep && this.isOnBattlefield(EPHARA))
      this.draw(1);
    this.hasCreatureEnteredSinceLastUpkeep = false;
  }

  /** White Plume Adventurer: at each opponent's upkeep, untap a creature of ours (all of them with a completed
   *  dungeon): they can block. */
  whitePlumeUntaps(): void {
    if (!this.isOnBattlefield(WHITE_PLUME_ADVENTURER)) return;
    const tapped = this.creatures().filter((creature) => creature.tapped);
    if (!tapped.length) return;
    if (this.completedDungeons > 0)
      for (const creature of tapped) creature.tapped = false;
    else firstMax(tapped, (creature) => this.power(creature)).tapped = false;
  }

  /** Thassa blinks another creature; Airbender Ascension with four quest counters blinks one. */
  override endStep(): void {
    if (this.isOnBattlefield(THASSA))
      this.blinkBestCreature((creature) => creature.card.name !== THASSA);
    if (
      this.isOnBattlefield(AIRBENDER_ASCENSION) &&
      this.airbenderQuestCounters >= 4
    )
      this.blinkBestCreature();
  }

  // ================================================================ combat
  /** Nadaar and Delver's Torch venture, Emeritus of Ideation prepares again, Undercellar Sweep makes two Soldiers
   *  attacking (when we have the initiative; an attacked opponent holding it is not modelled). */
  override onAttack(attackers: Permanent[]): Permanent[] {
    for (const attacker of attackers) {
      if (attacker.card.name === NADAAR) ventureIntoDungeon(this);
      if (attacker.marks & EQUIPPED_WITH_TORCH) ventureIntoDungeon(this);
      if (
        attacker.card.name === EMERITUS_OF_IDEATION &&
        !(attacker.marks & PREPARED) &&
        this.graveyard.length >= 8
      ) {
        for (const card of this.graveyard.slice(0, 8))
          this.moveCard(card, 'graveyard', 'exile');
        attacker.marks |= PREPARED;
      }
    }
    const joined: Permanent[] = [];
    if (this.hasInitiative)
      for (let i = 0; i < this.countOnBattlefield(UNDERCELLAR_SWEEP); i++)
        joined.push(...this.createTokens(SOLDIER, 2, { tapped: true }));
    return joined;
  }

  /** Brago blinks, Yuan-Ti Malison and Midnight Pathlighter venture. */
  override onCombatDamage(connected: Permanent[]): void {
    super.onCombatDamage(connected);
    if (!connected.length) return;
    for (const permanent of connected)
      if (permanent.card.name === YUAN_TI_MALISON) ventureIntoDungeon(this);
    if (this.isOnBattlefield(MIDNIGHT_PATHLIGHTER)) ventureIntoDungeon(this);
    if (connected.some((permanent) => permanent.card.name === BRAGO))
      this.bragoBlinks();
  }

  /** Does it fly now? Cloister Gargoyle flies once a dungeon is completed. */
  fliesNow(permanent: Permanent): boolean {
    return (
      permanent.card.flying ||
      (permanent.card.name === CLOISTER_GARGOYLE && this.completedDungeons > 0)
    );
  }

  /** Goldfish combat. Midnight Pathlighter: our creatures can't be blocked except by legendary creatures. Most
   *  opponents have a legendary commander, so one of them blocks our biggest ground creature; the rest get through. */
  override evasive(permanent: Permanent): boolean {
    if (this.fliesNow(permanent)) return true;
    if (!this.isOnBattlefield(MIDNIGHT_PATHLIGHTER)) return false;
    const groundCreatures = this.creatures().filter(
      (creature) => !this.fliesNow(creature),
    );
    return (
      firstMax(groundCreatures, (creature) => this.power(creature)) !==
      permanent
    );
  }

  /** Pod combat: with Midnight Pathlighter, only the opponents' legendary creatures may block our ground creatures. */
  override evasion(permanent: Permanent): Evasion {
    if (this.fliesNow(permanent)) return 'flying';
    return this.isOnBattlefield(MIDNIGHT_PATHLIGHTER) ? 'legendary' : 'none';
  }

  /** Nadaar (+1/+1 for the others once a dungeon is completed), Cloister Gargoyle (+3/+0), Delver's Torch (+1/+1). */
  override powerBonus(permanent: Permanent): number {
    let bonus = this.sharedBonus(permanent);
    if (permanent.card.name === CLOISTER_GARGOYLE && this.completedDungeons > 0)
      bonus += 3;
    return bonus;
  }

  override toughnessBonus(permanent: Permanent): number {
    return this.sharedBonus(permanent);
  }

  /** The +1/+1 bonuses: Nadaar's for the others, Delver's Torch's. */
  sharedBonus(permanent: Permanent): number {
    let bonus = 0;
    if (
      this.completedDungeons > 0 &&
      permanent.card.name !== NADAAR &&
      this.isOnBattlefield(NADAAR)
    )
      bonus += this.countOnBattlefield(NADAAR);
    if (permanent.marks & EQUIPPED_WITH_TORCH) bonus += 1;
    return bonus;
  }

  /** Delver's Torch: attach it to the creature that attacks best (it falls off a blinked creature). */
  isTorchAttached(): boolean {
    return this.battlefield.some(
      (permanent) => permanent.marks & EQUIPPED_WITH_TORCH,
    );
  }

  equipTorch(creature: Permanent): void {
    for (const permanent of this.battlefield)
      permanent.marks &= ~EQUIPPED_WITH_TORCH;
    creature.marks |= EQUIPPED_WITH_TORCH;
    this.say(`  equip ${DELVERS_TORCH} ->`, creature.card);
  }

  // ================================================================ the planner and the pod
  /** The dungeon's progress and the initiative are worth something before they show on the board. */
  override positionValue(): number {
    let value = super.positionValue();
    if (this.hasInitiative) value += 15;
    value += 8 * this.completedDungeons;
    if (this.dungeonPosition !== null) value += 3;
    return value;
  }

  candidates(main2: boolean): Candidate[] {
    return buildCandidates(this, main2);
  }
}
