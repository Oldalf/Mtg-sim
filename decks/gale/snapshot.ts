import * as C from '../../engine/cards';
import * as Facts from '../../engine/card-facts';
import { GALE } from './roles';
import { FODDER_EXCLUDE, KillSearchState } from './kill-state';
import type { GaleGame } from './game';

// ---------------------------------------------------------------- the kill search's snapshot
/**
 * The state the kill search starts from: our mana, hand, graveyard and board, and the opponents.
 * nextTurn: the position at the start of our next turn (everything untaps, a land drop is available).
 * add / remove: cards that would be in / out of the hand (a tutor target, the card being tutored with).
 */
export function buildKillSearchState(
  game: GaleGame,
  nextTurn = false,
  add: string[] = [],
  remove: string[] = [],
): KillSearchState {
  const state = new KillSearchState();
  addManaAndLands(game, state, nextTurn, add, remove);
  addGraveyardAndHand(game, state, add, remove);
  addBoard(game, state, nextTurn);
  addCostReductions(game, state);
  addOpponents(game, state, nextTurn);
  return state;
}

/** The mana pool, High Tide / Muck counts, the lands and the mana from outside our lands. */
function addManaAndLands(
  game: GaleGame,
  state: KillSearchState,
  nextTurn: boolean,
  add: string[],
  remove: string[],
): void {
  const pool = { U: 0, B: 0, A: 0, C: 0, S: 0 };
  if (!nextTurn) {
    pool.U += game.pool.U;
    pool.B += game.pool.B;
    pool.C += game.pool.C;
    pool.S += game.pool.S;
  }
  const highTides = nextTurn ? 0 : game.highTidesThisTurn;
  const mucks = nextTurn ? 0 : game.muck;
  const energy = game.energy && !nextTurn;
  let islandsForHighTide = 0;
  let swampsForMuck = 0;
  let lands = 0;
  let free = nextTurn ? 0 : game.pool.U + game.pool.B;
  let freeColourless = nextTurn ? 0 : game.pool.C;
  const landMix = [0, 0, 0, 0]; // dual, island-only, swamp-only, other: all lands, tapped or not
  for (const permanent of game.battlefield) {
    if (permanent.land !== null) {
      const isIsland = !!permanent.land.island || energy;
      const isSwamp = !!permanent.land.swamp || energy;
      landMix[isIsland && isSwamp ? 0 : isIsland ? 1 : isSwamp ? 2 : 3] += 1;
    }
    const kind = game.manaSourceKind(permanent, nextTurn);
    if (kind === null || (permanent.tapped && !nextTurn)) continue;
    if (kind === 'U' || kind === 'B' || kind === 'C' || kind === 'S')
      pool[kind] += 1;
    else if (kind === 'A' || kind === 'F') pool.A += 1;
    else if (kind === 'UB') {
      pool.U += 1;
      pool.B += 1;
    } else if (kind === 'C2') pool.C += 2;
    if (permanent.land === null && ['U', 'B', 'A', 'F', 'UB'].includes(kind))
      free += kind === 'UB' ? 2 : 1;
    else if (permanent.land === null && (kind === 'C' || kind === 'C2'))
      freeColourless += kind === 'C2' ? 2 : 1;
    if (permanent.land !== null) {
      lands += 1;
      if (permanent.land.island || energy) {
        islandsForHighTide += 1;
        pool.U += highTides;
      }
      if (permanent.land.swamp || energy) {
        swampsForMuck += 1;
        pool.B += mucks;
      }
    }
  }
  // next turn a land from hand makes one more mana
  if (
    nextTurn &&
    handAfterChanges(game, add, remove).some(
      (name) => C.get(name).land !== null,
    )
  ) {
    pool.A += 1;
    lands += 1;
    landMix[3] += 1;
  }
  state.pool = pool;
  state.islandsForHighTide = islandsForHighTide;
  state.swampsForMuck = swampsForMuck;
  state.highTides = highTides;
  state.bubblingMucks = mucks;
  state.landCount = lands;
  state.landMix = landMix;
  state.coloursFromOutsideLands = free;
  state.colourlessFromOutsideLands = freeColourless;
}

/** The hand's card names, with the cards in `remove` taken out and the cards in `add` put in. */
function handAfterChanges(
  game: GaleGame,
  add: string[],
  remove: string[],
): string[] {
  const hand = game.hand.map((card) => card.name);
  for (const name of remove) {
    const index = hand.indexOf(name);
    if (index >= 0) hand.splice(index, 1);
  }
  hand.push(...add);
  return hand;
}

/** The hand, the instants and sorceries in the graveyard (Gale targets), and the creatures in it. */
function addGraveyardAndHand(
  game: GaleGame,
  state: KillSearchState,
  add: string[],
  remove: string[],
): void {
  state.hand = handAfterChanges(game, add, remove).sort();
  state.graveyardSpells = game.graveyard
    .filter((card) => card.isInstantOrSorcery)
    .map((card) => card.name)
    .sort();
  state.graveyardCreatures = game.graveyard
    .filter((card) => card.isCreature)
    .map((card) => card.name)
    .sort();
}

/** Which combo permanents are out and can be used, and the creatures on the battlefield. */
function addBoard(
  game: GaleGame,
  state: KillSearchState,
  nextTurn: boolean,
): void {
  state.hasGale = game.isOnBattlefield(GALE);
  state.hasGuildmage = game.isOnBattlefield('Duskmantle Guildmage');
  state.guildmageActivations = nextTurn ? 0 : game.guildmageActivations;
  state.hasMindcrank = game.isOnBattlefield('Mindcrank');
  state.hasKonrad = game.isOnBattlefield('Syr Konrad, the Grim');
  const mindskinner = game.findPermanent('The Mindskinner');
  state.hasMindskinner = mindskinner !== null;
  state.mindskinnerCanAttack =
    mindskinner !== null && (nextTurn || (!mindskinner.sick && !game.attacked));
  const monument = game.findPermanent('Riverchurn Monument');
  state.hasMonument = monument !== null && (nextTurn || !monument.tapped);
  state.monumentCanExhaust = monument !== null && !monument.exhausted;
  state.hasEmetSelch = game.isOnBattlefield('Emet-Selch of the Third Seat');
  state.emetSelchUsed = nextTurn ? false : game.emetSelchUsed;
  state.opponentLostLife = false;
  const creatures = game.battlefield.filter(
    (permanent) => permanent.card.isCreature,
  );
  state.creatureCount = creatures.length;
  state.sacrificeFodder = creatures.filter(
    (permanent) =>
      permanent.card.power >= 2 && !FODDER_EXCLUDE.has(permanent.card.name),
  ).length;
  // Energy Tap targets: untapped creatures that aren't mana sources (Mindskinner only if it can't attack anyway)
  state.energyTapTargets = game.battlefield
    .filter(
      (permanent) =>
        permanent.card.isCreature &&
        (nextTurn || !permanent.tapped) &&
        !game.manaSourceKind(permanent, true) &&
        !(
          permanent.card.name === 'The Mindskinner' &&
          state.mindskinnerCanAttack
        ),
    )
    .map((permanent) => permanent.card.manaValue)
    .sort((first, second) => second - first);
}

/** How much cheaper the cost reducers on the battlefield make our spells. */
function addCostReductions(game: GaleGame, state: KillSearchState): void {
  state.reductionInstantSorcery = game.instantOrSorceryCostReduction();
  state.reductionNoncreature = game.battlefield.filter((permanent) =>
    Facts.REDUCE_NONCREATURE.has(permanent.card.name),
  ).length;
  state.reductionBlue = game.battlefield.filter((permanent) =>
    Facts.REDUCE_BLUE.has(permanent.card.name),
  ).length;
  state.reductionFromGraveyard =
    2 *
    game.battlefield.filter((permanent) =>
      Facts.REDUCE_FROM_GY2.has(permanent.card.name),
    ).length;
}

/** The opponents' life, libraries, graveyards and poison, and what we assume about their decks. */
function addOpponents(
  game: GaleGame,
  state: KillSearchState,
  nextTurn: boolean,
): void {
  state.opponentLife = game.life.slice();
  state.opponentLibrary = game.opponentLibrarySizes.map((size) =>
    Math.max(0, size - (nextTurn && size > 0 ? 1 : 0)),
  );
  state.opponentGraveyard = game.opponentGraveyardSizes.slice();
  state.opponentPoison = game.poison.slice();
  state.opponentCreatureAccumulator = game.opponentCreatureAccumulator.slice();
  state.ownLibrarySize = game.library.length;
  state.ownCreatureAccumulator = 0;
  state.ownCreatureDensity = game.library.length
    ? game.library.filter((card) => card.isCreature).length /
      game.library.length
    : 0;
  state.opponentCreatureDensity = game.config.opp_creature_density as number;
  state.opponentHandSize = game.config.opp_hand_size as number;
  state.opponentCreaturesOnBoard = game.config.opp_creatures_on_board as number;
  state.opponentLandCount = Math.floor(
    (game.turn + (nextTurn ? 1 : 0)) *
      ((game.config.opp_lands_per_turn as number) ?? 1) *
      ((game.config.opp_lands_untapped as number) ?? 1),
  );
  state.graveyardNonSpellCount = game.graveyard.filter(
    (card) => !card.isInstantOrSorcery,
  ).length;
}
