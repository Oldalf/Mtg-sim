/**
 * Big creatures and what they do when cast, enter, attack or connect: the Eldrazi (cast triggers, annihilator),
 * Terastodon, Koma. Which permanents the removal takes in a pod is the pod's choice (podSnipeUpTo); which card a free
 * cast picks is the deck's (battlefieldValue).
 */
import type { CardDef } from '../cards/cards';
import { ELDRAZI, FLYING_ANGEL, KOMAS_COIL } from '../cards/tokens';
import type { Answer } from '../game/answers';
import type { CardRules } from './card-rules';

const EXILE_ANY_PERMANENT: Answer = {
  kind: 'removal',
  instant: false,
  hits: ['creature', 'artifact', 'enchantment', 'planeswalker'],
  how: 'exile',
};
const EXILE_ARTIFACT_OR_ENCHANTMENT: Answer = {
  kind: 'removal',
  instant: false,
  hits: ['artifact', 'enchantment'],
  how: 'exile',
};
/** The owner gets a 3/3 for each (the engine's token3; Terastodon's is a green Elephant). */
const DESTROY_NONCREATURE_PERMANENT: Answer = {
  kind: 'removal',
  instant: false,
  hits: ['artifact', 'enchantment', 'planeswalker'],
  how: 'destroy',
  gives: 'token3',
};

/** Terastodon only blows up a permanent worth this much: the owner gets a 3/3 for it. */
const TERASTODON_MINIMUM_TARGET_VALUE = 45;

/** Ulamog, the Defiler enters with counters equal to the greatest mana value in exile, after an opponent exiles the
 *  top half of their library. We do not look at that library: with about 50 cards exiled it is nearly always a
 *  6-drop or bigger. */
const DEFILER_COUNTERS_IN_A_POD = 6;

export const BIG_CREATURES: CardRules[] = [
  {
    names: ["Garruk's Uprising"],
    onEnter(game) {
      if (game.creatures().some((creature) => game.power(creature) >= 4))
        game.draw(1);
    },
    onAnotherOfOursEnters(game, _permanent, entered) {
      if (entered.card.isCreature && game.power(entered) >= 4) game.draw(1);
    },
    givesOurCreaturesKeywords() {
      return ['trample'];
    },
  },
  {
    names: ['Helga, Skittish Seer'],
    // (her mana, for big creature spells only, is the deck's: castWithHelga)
    onWeCast(game, permanent, spell) {
      if (!spell.isCreature || spell.manaValue < 4) return;
      game.draw(1);
      game.gainLife(1);
      game.addCounters(permanent, 1);
    },
  },
  {
    names: ['Kozilek, Butcher of Truth'],
    // CHECK WHEN ANOTHER DECK PLAYS IT: its graveyard shuffle is not modelled.
    whenCast(game) {
      game.draw(4);
    },
    annihilator() {
      return 4;
    },
  },
  {
    names: ['Kozilek, the Broken Reality'],
    // CHECK WHEN ANOTHER DECK PLAYS IT: we draw four for the two opponents' manifests (their 2/2s are not modelled);
    // "colourless" is a card without coloured pips, so every token counts (even a blue Koma's Coil).
    whenCast(game) {
      game.draw(4);
    },
    powerAndToughnessBonus(_game, permanent, creature) {
      return creature !== permanent && hasNoColouredPips(creature.card)
        ? { power: 3, toughness: 2 }
        : 0;
    },
  },
  {
    names: ['Desolation Twin'],
    whenCast(game) {
      game.createTokens(ELDRAZI);
    },
  },
  {
    names: ['Apex Devastator'],
    whenCast(game, spell) {
      for (let i = 0; i < 4; i++) game.cascade(spell.manaValue);
    },
  },
  {
    names: ['Ulamog, the Ceaseless Hunger'],
    // CHECK WHEN ANOTHER DECK PLAYS IT: its attack trigger (the defending player exiles twenty cards) is not modelled.
    whenCast(game, spell) {
      game.podSnipeUpTo(EXILE_ANY_PERMANENT, spell.name, 2, 0);
    },
  },
  {
    names: ['Ulamog, the Defiler'],
    // CHECK WHEN ANOTHER DECK PLAYS IT: its counters are a fixed 6 in a pod and none in a goldfish game (the opponent's
    // exiled half library is not looked at); its ward is not modelled.
    onEnter(game, permanent) {
      if (game.inArena())
        game.addCounters(permanent, DEFILER_COUNTERS_IN_A_POD);
    },
    annihilator(_game, permanent) {
      return permanent.counters;
    },
  },
  {
    names: ["Ulamog's Crusher", 'It That Betrays'],
    // CHECK WHEN ANOTHER DECK PLAYS IT: It That Betrays taking the opponents' sacrificed permanents is not modelled.
    annihilator() {
      return 2;
    },
  },
  {
    names: ['Terastodon'],
    // CHECK WHEN ANOTHER DECK PLAYS IT: it never destroys our own permanents (for the Elephants).
    onEnter(game, permanent) {
      game.podSnipeUpTo(
        DESTROY_NONCREATURE_PERMANENT,
        permanent.card.name,
        3,
        TERASTODON_MINIMUM_TARGET_VALUE,
      );
    },
  },
  {
    names: ['Angel of the Ruins'],
    onEnter(game, permanent) {
      game.podSnipeUpTo(
        EXILE_ARTIFACT_OR_ENCHANTMENT,
        permanent.card.name,
        2,
        0,
      );
    },
  },
  {
    names: ['Koma, World-Eater'],
    onCombatDamageToPlayer(game) {
      game.createTokens(KOMAS_COIL, 4);
    },
  },
  {
    names: ['Ohran Frostfang'],
    // CHECK WHEN ANOTHER DECK PLAYS IT: deathtouch for our attackers is not modelled.
    onOurCreatureDealsCombatDamage(game) {
      game.draw(1);
    },
  },
  {
    names: ['Ob Nixilis, the Ascended'],
    // CHECK WHEN ANOTHER DECK PLAYS IT: its enter trigger (destroy the opponents' tapped creatures) is not modelled, and
    // the Angel comes only at our end step (the card: each end step).
    onEndStep(game) {
      if (game.lifeGainedThisTurn > 0) game.createTokens(FLYING_ANGEL);
    },
  },
  {
    names: ['Stormsurge Kraken'],
    // CHECK WHEN ANOTHER DECK PLAYS IT: its draw when blocked is not modelled.
    powerAndToughnessBonus(game, permanent, creature) {
      return creature === permanent && game.controlsACommander() ? 2 : 0;
    },
  },
  {
    names: ["Akroma's Memorial"],
    // CHECK WHEN ANOTHER DECK PLAYS IT: only flying (not first strike, vigilance, trample, haste or protection).
    givesOurCreaturesKeywords() {
      return ['flying'];
    },
  },
  {
    names: ["Rishkar's Expertise"],
    // CHECK WHEN ANOTHER DECK PLAYS IT: the free spell is a permanent (the card: any spell).
    resolve(game) {
      game.draw(game.greatestPower());
      game.castFreePermanentFromHand(5);
    },
  },
];

function hasNoColouredPips(card: CardDef): boolean {
  const cost = card.cost;
  return (
    cost.white +
      cost.blue +
      cost.black +
      cost.red +
      cost.green +
      cost.hybrid ===
    0
  );
}
