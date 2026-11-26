/**
 * Cards with attack triggers: a creature's own ("whenever this attacks") and our permanents' "whenever you attack".
 */
import { FIREBENDING_SOLDIER, LIFELINK_VAMPIRE } from '../cards/tokens';
import { printedFirebending } from '../game/firebending';
import { addCounterToEachVampire } from './aristocrats';
import type { GameCore } from '../game/game-core';
import type { CardRules } from './card-rules';

export const LEGIONS_LANDING = "Legion's Landing";

/** Firebender Ascension copies the firebending triggers from this many quest counters on. */
const FIREBENDER_QUEST_COUNTERS = 4;

export const ATTACK_TRIGGERS: CardRules[] = [
  {
    names: ['Shoreline Looter'],
    // (its evasion is the deck's)
    onCombatDamageToPlayer(game) {
      game.draw(1);
      if (game.graveyard.length < 7) game.discard(1);
    },
  },
  {
    names: ['Looter il-Kor'],
    onCombatDamageToPlayer(game) {
      game.draw(1);
      game.discard(1);
    },
  },
  {
    names: ['Firebender Ascension'],
    // CHECK WHEN ANOTHER DECK PLAYS IT: only printed firebending counts (not Sozin's Comet's), and a counter doubler
    // doesn't double the quest counters (Permanent.otherCounters).
    onEnter(game) {
      game.createTokens(FIREBENDING_SOLDIER);
    },
    onWeAttack(game, permanent, attackers) {
      for (const attacker of attackers) {
        const firebending = printedFirebending(attacker.card);
        if (firebending === 0) continue;
        permanent.otherCounters = (permanent.otherCounters ?? 0) + 1;
        if (permanent.otherCounters >= FIREBENDER_QUEST_COUNTERS) {
          game.pool.R += firebending;
          game.say(`  ${permanent.card.name} copies firebending`);
        }
      }
    },
  },
  {
    names: ['Archon of Cruelty'],
    // CHECK WHEN ANOTHER DECK PLAYS IT: the opponent's sacrifice and discard are not modelled.
    onEnter(game) {
      archonStrikes(game);
    },
    onAttacks(game) {
      archonStrikes(game);
    },
  },
  {
    names: ['Alesha, Who Laughs at Fate'],
    onAttacks(game, permanent) {
      game.addCounters(permanent, 1);
    },
    onEndStep(game, permanent) {
      // raid: a creature card with mana value up to her power comes back
      if (!game.attacked) return;
      const creature = game.bestCreatureInGraveyard(
        (card) => card.manaValue <= game.power(permanent),
      );
      if (creature) game.reanimate(creature);
    },
  },
  {
    names: ['Raph & Mikey, Troublemakers'],
    onAttacks(game) {
      // the first creature card from the top enters tapped and attacking
      const creature = game.revealUntilCreature();
      return creature
        ? [game.enter(creature, 'library', { tapped: true })]
        : [];
    },
  },
  {
    names: ['Glissa Sunslayer'],
    // CHECK WHEN ANOTHER DECK PLAYS IT: always the draw mode, above 5 life (its other modes are not modelled).
    onCombatDamageToPlayer(game) {
      if (game.myLife <= 5) return;
      game.draw(1);
      game.loseLife(1);
    },
  },
  {
    names: ['Thantis, the Warweaver'],
    // (all creatures attacking each combat is the pod's: makesAllCreaturesAttack)
    onCreaturesAttackUs(game, permanent, attackerCount) {
      game.addCounters(permanent, attackerCount);
    },
  },
  {
    names: ['Beastmaster Ascension'],
    onWeAttack(_game, permanent, attackers) {
      // a quest counter for each attacking creature (put on directly: as the deck had it, a doubler doesn't double them)
      permanent.counters += attackers.length;
    },
    powerAndToughnessBonus(_game, permanent) {
      return permanent.counters >= 7 ? 5 : 0;
    },
  },
  {
    names: ['Edgar Markov'],
    onAttacks(game) {
      addCounterToEachVampire(game);
    },
  },
  {
    names: ['Preacher of the Schism'],
    onAttacks(game) {
      // a Vampire when we attack the player with the most life (we assume the opponent with the most life), a card
      // (and 1 life) when we have the most life
      const mostOpponentLife = Math.max(...game.life);
      if (mostOpponentLife >= game.myLife) game.createTokens(LIFELINK_VAMPIRE);
      if (game.myLife >= mostOpponentLife) {
        game.draw(1);
        game.loseLife(1);
      }
    },
  },
  {
    names: ['Vampire Gourmand'],
    onAttacks(game, permanent) {
      // may sacrifice another creature (an untapped token) to draw a card
      const fodder = game
        .creatures()
        .find(
          (creature) =>
            creature !== permanent && creature.token && !creature.tapped,
        );
      if (!fodder) return;
      game.sacrifice(fodder);
      game.draw(1);
    },
  },
  {
    names: [LEGIONS_LANDING],
    onEnter(game) {
      game.createTokens(LIFELINK_VAMPIRE);
    },
    onWeAttack(game, permanent, attackers) {
      // becomes Adanto, the First Fort (a land that makes {W}) when we attack with three or more creatures
      if (attackers.length < 3 || permanent.transformed) return;
      permanent.transformed = true;
      game.say("  Legion's Landing transforms");
    },
  },
];

/** Archon of Cruelty: the target opponent loses 3 life, we draw a card and gain 3 life. */
function archonStrikes(game: GameCore): void {
  game.targetOpponentLosesLife(3);
  game.draw(1);
  game.gainLife(3);
}
