/**
 * Hama Pashar's deck (William's Azorius blink and dungeon deck, pod-only): the rules of its own cards.
 * The win, combat, values and the planner's score come from the engine's CreatureDeckGame. The engine also does the
 * dungeons and the initiative (dungeons.ts: Hama Pashar and Dungeon Delver make rooms trigger again; "enters,
 * venture" and "enters, take the initiative" are read from the card text), blink (blink.ts: the blink spells,
 * Ephemerate's rebound, cards back at the end step) and the trigger doublers (Panharmonicon, Starfield Vocalist).
 *
 * Files: cards.ts (names, values, blink values), game.ts (this file), candidates.ts (what the AI may do now).
 *
 * The deck blinks its enter and leave triggers again and again, and with them ventures into the dungeon (mostly
 * Lost Mine of Phandelver: scry, tokens, drains, cards) or into the Undercity through the initiative. It wins by
 * combat: tokens, evasive creatures (Midnight Pathlighter) and the dungeon bonuses (Nadaar, Cloister Gargoyle).
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
  BRAGO,
  CLAIM_JUMPER,
  CLOISTER_GARGOYLE,
  DELVERS_TORCH,
  DJINNI_WINDSEER,
  EMERITUS_OF_IDEATION,
  EPHARA,
  EQUIPPED_WITH_TORCH,
  FOX,
  GENKU,
  KNIGHT_OF_THE_WHITE_ORCHID,
  LAND_TAX,
  MIDNIGHT_PATHLIGHTER,
  MOMO,
  MOONFOLK,
  NADAAR,
  NIKO,
  OJI,
  PENSIVE_PROFESSOR,
  PREPARED,
  RASPUTIN,
  RAT,
  SHARD,
  SKYCOACH_CONDUCTOR,
  SOLDIER,
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
import { Candidate, Permanent, Zone } from '../../engine/game/game-types';
import { Answer } from '../../engine/game/answers';
import { CreatureDeckGame } from '../../engine/game/creature-deck';
import {
  enterTriggerOfCommonCard,
  upkeepOfCommonCards,
} from '../../engine/game/common-permanents';
import { blink } from '../../engine/game/blink';
import { ventureIntoDungeon } from '../../engine/game/dungeons';
import { fetchLand } from '../../engine/game/land-search';
import { enterTriggerCount } from '../../engine/game/trigger-doublers';
import { firstMax } from '../../engine/util/lists';

/** Agent of Treachery's "gain control of target permanent", as the pod's removal (we don't use what we take). */
const AGENT_OF_TREACHERY_STEALS: Answer = {
  kind: 'removal',
  instant: false,
  hits: ['creature', 'artifact', 'enchantment', 'planeswalker'],
  how: 'exile',
};

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

  override startTurn(): void {
    super.startTurn();
    this.genkuTokensThisTurn = 0;
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
        // a card, or a flying Bird when the hand is full
        if (this.hand.length >= 6) this.createTokens(BIRD);
        else this.draw(1);
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
      case CLAIM_JUMPER:
        if (this.opponentHasMoreLands()) fetchLand(this, 'plains', true);
        if (this.opponentHasMoreLands()) fetchLand(this, 'plains', true);
        break;
      case AGENT_OF_TREACHERY:
        if (this.inArena()) this.arena!.snipe(this, AGENT_OF_TREACHERY_STEALS);
        break;
    }
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
  /** How much we want this permanent blinked: its enter trigger (BLINK_VALUE), plus a token when Genku is out. */
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
    return value;
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

  /** Brago: each nonland permanent of ours worth blinking. */
  bragoBlinks(): void {
    const permanents = this.battlefield.filter(
      (permanent) => permanent.land === null && this.blinkValue(permanent) > 0,
    );
    for (const permanent of permanents) blink(this, permanent);
  }

  // ================================================================ spells we cast
  /** Every spell we cast passes here (the engine announces it to a pod): Pensive Professor, and on our second spell
   *  of the turn Oji and Tomb of Horrors Adventurer. */
  override podAnnounceCast(card: CardDef): void {
    super.podAnnounceCast(card);
    this.pensiveProfessorGrows(card);
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
    else super.resolveOther(card, fromGraveyard, mode);
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

  /** Midnight Pathlighter: our creatures can't be blocked except by legendary creatures (counted as unblockable).
   *  Cloister Gargoyle flies once a dungeon is completed. */
  override evasive(permanent: Permanent): boolean {
    if (this.isOnBattlefield(MIDNIGHT_PATHLIGHTER)) return true;
    if (permanent.card.name === CLOISTER_GARGOYLE && this.completedDungeons > 0)
      return true;
    return super.evasive(permanent);
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
