import * as C from '../../engine/cards/cards';
import * as Facts from '../../engine/cards/card-facts';
import { GALE } from './roles';
import { FODDER_EXCLUDE, KillSearchState } from './kill-state';
import type { LandClass } from './kill-state';
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

/** The mana already made (rocks, floating mana), the High Tide / Muck counts and the untapped lands by kind. */
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
  const isEnergybent = game.isEnergybendingActive && !nextTurn;
  const landClasses: LandClass[] = [];
  const allLands: number[] = [];
  const untappedLands: number[] = [];
  const countLand = (landClass: LandClass, isUntapped: boolean): void => {
    let index = landClasses.findIndex(
      (existing) =>
        existing.kind === landClass.kind &&
        existing.isIsland === landClass.isIsland &&
        existing.isSwamp === landClass.isSwamp &&
        existing.isLand === landClass.isLand,
    );
    if (index < 0) {
      index = landClasses.length;
      landClasses.push(landClass);
      allLands.push(0);
      untappedLands.push(0);
    }
    allLands[index] += 1;
    if (isUntapped) untappedLands[index] += 1;
  };
  for (const permanent of game.battlefield) {
    const kind = game.manaSourceKind(permanent, nextTurn);
    if (kind === null) continue;
    const isUntapped = nextTurn || !permanent.tapped;
    if (permanent.land !== null) {
      countLand(
        {
          kind,
          isIsland: !!permanent.land.island,
          isSwamp: !!permanent.land.swamp,
          isLand: true,
        },
        isUntapped,
      );
    } else if (kind === 'S') {
      if (isUntapped) pool.S += 1; // only pays for instants and sorceries
    } else {
      // a rock or a mana creature: it stays untapped until a payment needs it (a filter Signet is fed a mana then)
      countLand(
        { kind, isIsland: false, isSwamp: false, isLand: false },
        isUntapped,
      );
    }
  }
  // next turn a land from hand makes one more mana
  if (
    nextTurn &&
    handAfterChanges(game, add, remove).some(
      (name) => C.get(name).land !== null,
    )
  )
    countLand(
      { kind: 'A', isIsland: false, isSwamp: false, isLand: true },
      true,
    );
  state.pool = pool;
  state.highTides = nextTurn ? 0 : game.highTidesThisTurn;
  state.bubblingMucks = nextTurn ? 0 : game.muck;
  state.isEnergybent = isEnergybent;
  state.landClasses = landClasses;
  state.allLands = allLands;
  state.untappedLands = untappedLands;
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
      Facts.REDUCE_FROM_GRAVEYARD_BY_2.has(permanent.card.name),
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
