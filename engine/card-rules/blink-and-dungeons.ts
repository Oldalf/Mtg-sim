/**
 * Blink engines and dungeon cards: what they do when they or our other permanents enter, leave, attack or connect, and
 * at the upkeeps and end step. Which creature a blink takes is the deck's choice (GameCore.blinkValue); the venture
 * rooms are the engine's (dungeons.ts).
 */
import {
  FLYING_BIRD,
  FOX,
  MOONFOLK,
  RAT,
  SHARD,
  SOLDIER,
} from '../cards/tokens';
import type { Answer, Hit } from '../game/answers';
import { blink, blinkBestCreature } from '../game/blink';
import { ventureIntoDungeon } from '../game/dungeons';
import { firstMax } from '../util/lists';
import type { CardRules } from './card-rules';

const NONLAND: Hit[] = ['creature', 'artifact', 'enchantment', 'planeswalker'];

/** Agent of Treachery's "gain control of target permanent", as the pod's removal (we don't use what we take). */
const AGENT_OF_TREACHERY_STEALS: Answer = {
  kind: 'removal',
  instant: false,
  hits: NONLAND,
  how: 'exile',
};

/** Aether Channeler's "return another target nonland permanent to its owner's hand". */
const BOUNCE_NONLAND_PERMANENT: Answer = {
  kind: 'removal',
  instant: false,
  hits: NONLAND,
  how: 'bounce',
};

/** Aether Channeler bounces instead of drawing only a permanent worth at least this much to its owner (an
 *  opponent's commander always counts: it costs 2 more next time). */
const CHANNELER_BOUNCE_MIN_VALUE = 60;

/** Aether Channeler makes the Bird instead of drawing with this many cards in hand. */
const CHANNELER_BIRD_HAND_SIZE = 6;

/** Airbender Ascension blinks at our end step with this many quest counters. */
const AIRBENDER_QUEST_COUNTERS = 4;

/** Genku's tokens, one of each a turn, in the order we take them. */
const GENKU_TOKENS = [FOX, MOONFOLK, RAT];

export const BLINK_AND_DUNGEONS: CardRules[] = [
  {
    names: ['Niko, Light of Hope'],
    // (its {2},{T} blink of a creature the Shards copy is the deck's)
    onEnter(game) {
      game.createTokens(SHARD, 2);
    },
  },
  {
    names: ['Oji, the Exquisite Blade'],
    // (its blink on our second spell each turn is the deck's: the engine has cast triggers for permanent spells only)
    onEnter(game) {
      game.gainLife(2);
      game.scry(2);
    },
  },
  {
    names: ['Aether Channeler'],
    // CHECK WHEN ANOTHER DECK PLAYS IT: the mode is fixed (the deck does not choose it): in a pod, bounce an
    // opponent's permanent worth it; else a Bird with a full hand, else a card. Our own permanents are never returned.
    onEnter(game, permanent) {
      if (
        game.podSnipeUpTo(
          BOUNCE_NONLAND_PERMANENT,
          permanent.card.name,
          1,
          CHANNELER_BOUNCE_MIN_VALUE,
        ) > 0
      )
        return;
      if (game.hand.length >= CHANNELER_BIRD_HAND_SIZE)
        game.createTokens(FLYING_BIRD);
      else game.draw(1);
    },
  },
  {
    names: ['Djinni Windseer'],
    // CHECK WHEN ANOTHER DECK PLAYS IT: a 20 scries 2, not 3.
    onEnter(game) {
      game.scry(game.rollD20() >= 10 ? 2 : 1);
    },
  },
  {
    names: ['Agent of Treachery'],
    // CHECK WHEN ANOTHER DECK PLAYS IT: in a pod it takes the opponents' best permanent as removal (we don't use what
    // we take); its end step draw is not modelled.
    onEnter(game, permanent) {
      game.podSnipe(AGENT_OF_TREACHERY_STEALS, permanent.card.name);
    },
  },
  {
    names: ['Momo, Playful Pet'],
    // CHECK WHEN ANOTHER DECK PLAYS IT: the mode is fixed (the deck does not choose it): a +1/+1 counter on our
    // strongest creature, or scry 2 without one. The Food is not modelled.
    onLeaves(game) {
      const creatures = game.creatures();
      if (creatures.length)
        firstMax(creatures, (creature) => game.power(creature)).counters += 1;
      else game.scry(2);
    },
  },
  {
    names: ['Genku, Future Shaper'],
    // CHECK WHEN ANOTHER DECK PLAYS IT: the token order is fixed (Fox, Moonfolk, Rat); its {3}{W}{U} is the deck's.
    onAnotherOfOursLeaves(game, _permanent, left) {
      if (left.token) return;
      for (const token of GENKU_TOKENS)
        if (game.useOnceEachTurn(`Genku: ${token.name}`)) {
          game.createTokens(token);
          return;
        }
    },
  },
  {
    names: ['Ephara, God of the Polis'],
    // CHECK WHEN ANOTHER DECK PLAYS IT: a creature entering since the last upkeep counts (the card: last turn), and
    // so does Ephara itself when it enters as a creature.
    onUpkeep(game) {
      if (game.hasCreatureEnteredSinceLastUpkeep) game.draw(1);
    },
    onOpponentUpkeep(game) {
      if (game.hasCreatureEnteredSinceLastUpkeep) game.draw(1);
    },
  },
  {
    names: ['White Plume Adventurer'],
    // (its enter trigger, take the initiative, is read from the card text)
    onOpponentUpkeep(game) {
      const tapped = game.creatures().filter((creature) => creature.tapped);
      if (!tapped.length) return;
      if (game.completedDungeons > 0)
        for (const creature of tapped) creature.tapped = false;
      else firstMax(tapped, (creature) => game.power(creature)).tapped = false;
    },
  },
  {
    names: ['Thassa, Deep-Dwelling'],
    // CHECK WHEN ANOTHER DECK PLAYS IT: its {3}{U} tap ability is not modelled.
    onEndStep(game, permanent) {
      blinkBestCreature(game, (creature) => creature !== permanent);
    },
  },
  {
    names: ['Airbender Ascension'],
    // CHECK WHEN ANOTHER DECK PLAYS IT: its airbend on entering is not modelled, and a counter doubler does not double
    // the quest counters.
    onAnotherOfOursEnters(game, permanent, entered) {
      if (game.isCreatureNow(entered))
        permanent.otherCounters = (permanent.otherCounters ?? 0) + 1;
    },
    onEndStep(game, permanent) {
      if ((permanent.otherCounters ?? 0) >= AIRBENDER_QUEST_COUNTERS)
        blinkBestCreature(game);
    },
  },
  {
    names: ['Brago, King Eternal'],
    onCombatDamageToPlayer(game) {
      const permanents = game.battlefield.filter(
        (permanent) =>
          permanent.land === null && game.blinkValue(permanent) > 0,
      );
      for (const permanent of permanents) blink(game, permanent);
    },
  },
  {
    names: ['Yuan-Ti Malison'],
    // CHECK WHEN ANOTHER DECK PLAYS IT: "can't be blocked as long as it's attacking alone" is not modelled.
    onCombatDamageToPlayer(game) {
      ventureIntoDungeon(game);
    },
  },
  {
    names: ['Midnight Pathlighter'],
    // CHECK WHEN ANOTHER DECK PLAYS IT: "can't be blocked except by legendary creatures" is the DnD deck's evasion.
    onOurCreaturesDealCombatDamage(game) {
      ventureIntoDungeon(game);
    },
  },
  {
    names: ['Nadaar, Selfless Paladin'],
    // (its enter venture is read from the card text)
    onAttacks(game) {
      ventureIntoDungeon(game);
    },
    powerAndToughnessBonus(game, permanent, creature) {
      return creature !== permanent && game.completedDungeons > 0 ? 1 : 0;
    },
  },
  {
    names: ['Undercellar Sweep'],
    // CHECK WHEN ANOTHER DECK PLAYS IT: only our own initiative counts (the card: also the attacked player's).
    onWeAttack(game) {
      if (!game.hasInitiative) return;
      return game.createTokens(SOLDIER, 2, { tapped: true });
    },
  },
];
