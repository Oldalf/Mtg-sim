/** Everything Thantis's AI may do now, with a score each (higher first). */
import { HOLD, RURIC_THAR } from './cards';
import type { ThantisGame } from './game';
import { CardDef, Cost } from '../../engine/cards/cards';
import { LAND_SEARCH, REANIMATION_SPELLS } from '../../engine/cards/card-facts';
import { Candidate } from '../../engine/game/game-types';
import { fetchLand } from '../../engine/game/land-search';

/** Adds one thing the AI may do: its score, what it costs, whether it is an instant or sorcery, and how to do it. */
type AddCandidate = (
  score: number,
  cost: Cost,
  isInstantOrSorcery: boolean,
  action: () => boolean,
  rockCard?: CardDef,
) => void;

/** With Ruric Thar out a noncreature spell costs us 6 life: not when that would leave us low. */
const LIFE_KEPT_AGAINST_RURIC_THAR = 12;

export function buildCandidates(
  game: ThantisGame,
  main2: boolean,
): Candidate[] {
  const candidates: Candidate[] = [];
  const add: AddCandidate = (score, cost, isInstantOrSorcery, action, rock) =>
    candidates.push({ score, cost, isInstantOrSorcery, action, rock });

  for (const commander of game.command.slice())
    add(
      95,
      game.commanderCost(commander, game.effectiveCost(commander)),
      false,
      () => game.castPerm(commander, true),
    );
  const isRuricTharHurting =
    game.isOnBattlefield(RURIC_THAR) &&
    game.myLife <= LIFE_KEPT_AGAINST_RURIC_THAR;
  const seenNames = new Set<string>();
  for (const card of game.hand.slice()) {
    if (seenNames.has(card.name) || card.land !== null || HOLD.has(card.name))
      continue;
    if (isRuricTharHurting && !card.isCreature) continue;
    seenNames.add(card.name);
    addHandCardCandidate(game, card, add);
  }
  if (main2) addSakuraTribeElderCandidate(game, add);
  return candidates;
}

function addHandCardCandidate(
  game: ThantisGame,
  card: CardDef,
  add: AddCandidate,
): void {
  const cost = game.effectiveCost(card);
  const cast = () =>
    card.isInstantOrSorcery
      ? game.castInstantOrSorcery(card)
      : game.castPerm(card);
  const reanimation = REANIMATION_SPELLS[card.name];
  if (reanimation) {
    addReanimationCandidate(game, card, cost, reanimation.count, add);
    return;
  }
  if (LAND_SEARCH[card.name]) {
    add(game.manaSources() < 8 ? 80 : 20, cost, card.isInstantOrSorcery, cast);
    return;
  }
  if (card.name === 'Buried Alive') {
    add(game.turn >= 3 ? 55 : 25, cost, true, cast);
    return;
  }
  if (card.isInstantOrSorcery) add(30, cost, true, cast);
  else
    add(
      game.battlefieldValue(card),
      cost,
      false,
      cast,
      card.rock ? card : undefined,
    );
}

/** Reanimation: only with a creature worth it (Rise of the Dark Realms: several; Victimize: a creature to sacrifice). */
function addReanimationCandidate(
  game: ThantisGame,
  card: CardDef,
  cost: Cost,
  count: number | 'all',
  add: AddCandidate,
): void {
  const best = game.bestCreatureInGraveyard();
  if (!best) return;
  const creaturesInGraveyard = game.graveyard.filter(
    (candidate) => candidate.isCreature,
  ).length;
  if (count === 'all') {
    if (creaturesInGraveyard >= 3)
      add(88, cost, true, () => game.castInstantOrSorcery(card));
    return;
  }
  const score = Math.min(90, game.battlefieldValue(best));
  if (card.name === 'Victimize') {
    const fodder = game
      .creatures()
      .sort(
        (first, second) =>
          game.battlefieldValue(first.card) -
          game.battlefieldValue(second.card),
      )[0];
    if (creaturesInGraveyard >= 2 && fodder)
      add(score, cost, true, () => {
        if (!game.canPay(cost, true)) return false;
        game.sacrifice(fodder);
        return game.castInstantOrSorcery(card);
      });
    return;
  }
  add(score, cost, card.isInstantOrSorcery, () =>
    card.isInstantOrSorcery
      ? game.castInstantOrSorcery(card)
      : game.castPerm(card),
  );
}

/** Second main phase: Sakura-Tribe Elder is sacrificed for a land. */
function addSakuraTribeElderCandidate(
  game: ThantisGame,
  add: AddCandidate,
): void {
  const elder = game.findPermanent('Sakura-Tribe Elder');
  if (elder && game.library.some((card) => card.land?.basic))
    add(50, new Cost(), false, () => {
      game.sacrifice(elder);
      return fetchLand(game, 'basic', true) !== null;
    });
}
