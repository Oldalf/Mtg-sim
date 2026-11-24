/**
 * Meren's sacrifice choices: how much we mind losing a creature, the order we sacrifice in, the choices for Disciple
 * of Bolas, D'Ghor Bloodletter, the draw spells and Greater Good, and the outlets (free creature outlets, High Market,
 * Evolutionary Leap, Vampiric Rites). MerenGame's methods of the same names call these.
 */
import type { MerenGame } from './game';
import {
  DEATH_VALUE,
  DISCIPLE_CARD_WORTH,
  DGHOR_BLOODLETTER_MANA_VALUE,
  EDICT_ETB,
  ENTER_AGAIN,
  FREE_OUTLETS,
  GREATER_GOOD_MIN_LIBRARY,
  GREATER_GOOD_MIN_POWER,
  MANA_ELVES,
  MEREN,
  SHRINK_KILLS_AT_LEAST,
} from './cards';
import { activateVampiricRites } from './actions';
import {
  EVOLUTIONARY_LEAP,
  HIGH_MARKET,
  sacrificeToEvolutionaryLeap,
  sacrificeToHighMarket,
} from '../../engine/game/sacrifice-outlets';
import { Cost } from '../../engine/cards/cards';
import { CLUE, TREASURE } from '../../engine/cards/tokens';
import { Permanent } from '../../engine/game/game-types';
import { firstMax, sortDesc } from '../../engine/util/lists';

/** Our creatures in the order we'd sacrifice them (cheapest loss first). */
/** How much we mind sacrificing this creature (low = a good one to sacrifice). */
export function howMuchWeMindSacrificing(
  game: MerenGame,
  permanent: Permanent,
): number {
  if (game.isStolen(permanent)) return 80;
  if (permanent.token) return 5 + game.power(permanent);
  if (DEATH_VALUE.has(permanent.card.name) && game.isOnBattlefield(MEREN))
    return 10;
  if (MANA_ELVES.has(permanent.card.name) && game.turn >= 5) return 15;
  if (
    EDICT_ETB.has(permanent.card.name) ||
    permanent.card.name === 'Satyr Wayfinder' ||
    permanent.card.name === 'Studious First-Year'
  )
    return 20;
  return game.battlefieldValue(permanent.card);
}

export function creaturesInSacrificeOrder(
  game: MerenGame,
  exclude: Permanent[] = [],
): Permanent[] {
  return sortDesc(
    game
      .creatures()
      .filter(
        (permanent) =>
          !exclude.includes(permanent) &&
          permanent.card.name !== MEREN &&
          permanent.card.name !== 'Spore Frog' &&
          permanent.card.name !== 'Twilight Diviner',
      ),
    (permanent) => -game.sacrificeCost(permanent),
  );
}

/** Disciple of Bolas sacrifices for the most cards: power is cards and life; a creature whose death is worth
 *  something, or whose enter trigger Meren can give us again this turn, is a good one to lose. */
export function discipleSacrificeChoice(
  game: MerenGame,
  disciple: Permanent,
): Permanent | null {
  const choices = game.sacrificeOrder([disciple]);
  if (!choices.length) return null;
  const merenOut = game.isOnBattlefield(MEREN);
  const worth = (permanent: Permanent) => {
    const comesBackThisTurn =
      merenOut &&
      !permanent.token &&
      permanent.card.manaValue <= game.experienceCounters + 1;
    const triggerBonus =
      merenOut &&
      (DEATH_VALUE.has(permanent.card.name) ||
        (comesBackThisTurn && ENTER_AGAIN.has(permanent.card.name)))
        ? 15
        : 0;
    return (
      DISCIPLE_CARD_WORTH * game.power(permanent) +
      triggerBonus -
      game.sacrificeCost(permanent)
    );
  };
  return firstMax(choices, worth);
}

/** D'Ghor Bloodletter's mode in a pod: -1/-1 to all other creatures (true) or the edict. The -1/-1 when it kills
 *  enough opposing creatures now, or when Meren can bring it back at our end step for a second -1/-1 that would. */
export function bloodletterShouldShrink(game: MerenGame): boolean {
  if (game.podCreaturesShrinkWouldKill(1) >= SHRINK_KILLS_AT_LEAST) return true;
  // the outlet must live through the first -1/-1 (Viscera Seer and Carrion Feeder are 1/1s)
  const outlet = game.findFreeSacrificeOutlet();
  const canLoopAtEndStep =
    game.isOnBattlefield(MEREN) &&
    outlet !== null &&
    game.toughness(outlet) > 1 &&
    game.experienceCounters + 1 >= DGHOR_BLOODLETTER_MANA_VALUE;
  return (
    canLoopAtEndStep &&
    game.podCreaturesShrinkWouldKill(2) >= SHRINK_KILLS_AT_LEAST
  );
}

/** What to sacrifice for a draw spell: a creature we don't mind losing, else (when the spell allows it) a Treasure,
 *  then a Clue. */
export function sacrificeForDrawSpell(
  game: MerenGame,
  artifactAllowed: boolean,
): Permanent | null {
  const creature = game.expendableCreatures()[0];
  if (creature || !artifactAllowed) return creature ?? null;
  for (const token of [TREASURE, CLUE]) {
    const artifact = game.battlefield.find(
      (permanent) => permanent.card === token,
    );
    if (artifact) return artifact;
  }
  return null;
}

/** Greater Good: the creature to sacrifice for the cards (power GREATER_GOOD_MIN_POWER or more):
 *  one we don't mind losing, or one Meren can bring back at once. */
export function greaterGoodSacrifice(game: MerenGame): Permanent | null {
  if (game.library.length < GREATER_GOOD_MIN_LIBRARY) return null;
  const choices = game
    .sacrificeOrder()
    .filter(
      (creature) =>
        game.power(creature) >= GREATER_GOOD_MIN_POWER &&
        (game.expendableCreatures().includes(creature) ||
          (game.isOnBattlefield(MEREN) &&
            !creature.token &&
            creature.card.manaValue <= game.experienceCounters + 1)),
    );
  return choices.length
    ? firstMax(choices, (creature) => game.power(creature))
    : null;
}

/** Sacrifice this creature to the cheapest outlet we can use now: a free creature outlet (Viscera Seer may sacrifice
 *  itself, the others only another creature), High Market (once, it taps), then with mana left Evolutionary Leap
 *  ({G}: a creature card) and Vampiric Rites ({1}{B}: a card). False when none can take it. */
export function sacrificeToCheapestOutlet(
  game: MerenGame,
  creature: Permanent,
): boolean {
  const freeOutlet = game.battlefield.find(
    (permanent) =>
      FREE_OUTLETS.includes(permanent.card.name) &&
      (permanent !== creature || permanent.card.name === 'Viscera Seer'),
  );
  if (freeOutlet) {
    game.sacrifice(creature);
    return true;
  }
  const highMarket = game.battlefield.find(
    (permanent) => permanent.card.name === HIGH_MARKET && !permanent.tapped,
  );
  if (highMarket) return sacrificeToHighMarket(game, highMarket, creature);
  if (
    game.isOnBattlefield(EVOLUTIONARY_LEAP) &&
    sacrificeToEvolutionaryLeap(game, creature)
  )
    return true;
  return (
    game.isOnBattlefield('Vampiric Rites') &&
    activateVampiricRites(game, creature)
  );
}

/** Could sacrificeToOutlet take a creature now (without doing it)? */
export function canSacrificeNow(game: MerenGame): boolean {
  return (
    game.findFreeSacrificeOutlet() !== null ||
    game.battlefield.some(
      (permanent) => permanent.card.name === HIGH_MARKET && !permanent.tapped,
    ) ||
    (game.isOnBattlefield(EVOLUTIONARY_LEAP) &&
      game.canPay(Cost.parse('{G}'), false)) ||
    (game.isOnBattlefield('Vampiric Rites') &&
      game.canPay(Cost.parse('{1}{B}'), false))
  );
}
