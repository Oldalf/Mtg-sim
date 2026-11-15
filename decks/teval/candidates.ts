/** Everything Teval's AI may do now, with a score each (higher first). */
import { HOLD } from './cards';
import type { TevalGame } from './game';
import { CardDef, Cost } from '../../engine/cards/cards';
import { LAND_SEARCH, REANIMATION_SPELLS } from '../../engine/cards/card-facts';
import { Candidate, Permanent } from '../../engine/game/game-types';
import { fetchLand } from '../../engine/game/land-search';

/** Adds one thing the AI may do: its score, what it costs, whether it is an instant or sorcery, and how to do it. */
type AddCandidate = (
  score: number,
  cost: Cost,
  isInstantOrSorcery: boolean,
  action: () => boolean,
  rockCard?: CardDef,
) => void;

export function buildCandidates(game: TevalGame, main2: boolean): Candidate[] {
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
  const seenNames = new Set<string>();
  for (const card of game.hand.slice()) {
    if (seenNames.has(card.name) || card.land !== null || HOLD.has(card.name))
      continue;
    seenNames.add(card.name);
    addHandCardCandidate(game, card, add);
  }
  const fromGraveyard = game.creatureToCastFromGraveyard();
  if (fromGraveyard)
    add(
      game.battlefieldValue(fromGraveyard),
      game.effectiveCost(fromGraveyard),
      false,
      () => game.castCreatureFromGraveyard(fromGraveyard),
    );
  if (main2) addMainPhaseTwoAbilities(game, add);
  return candidates;
}

function addHandCardCandidate(
  game: TevalGame,
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
  if (LAND_SEARCH[card.name] || card.name === 'Growth Spiral') {
    add(game.manaSources() < 8 ? 80 : 20, cost, card.isInstantOrSorcery, cast);
    return;
  }
  const lands = game.graveyard.filter((candidate) => candidate.land !== null);
  switch (card.name) {
    case 'Demonic Tutor':
    case 'Vampiric Tutor':
      add(55, cost, true, cast);
      return;
    case 'Buried Alive':
      add(game.turn >= 3 ? 55 : 25, cost, true, cast);
      return;
    case 'Will of the Sultai':
      add(lands.length >= 2 ? 72 : 30, cost, true, cast);
      return;
    case 'Breach the Multiverse':
      add(75, cost, true, cast);
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
  game: TevalGame,
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
    const fodder = cheapestCreature(game);
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

function cheapestCreature(game: TevalGame): Permanent | null {
  const creatures = game.creatures();
  if (!creatures.length) return null;
  return creatures.reduce((first, second) =>
    game.battlefieldValue(second.card) < game.battlefieldValue(first.card)
      ? second
      : first,
  );
}

/** Second main phase: Sakura-Tribe Elder for a land, Phyrexian Reclamation for a creature (each makes Zombies). */
function addMainPhaseTwoAbilities(game: TevalGame, add: AddCandidate): void {
  const elder = game.findPermanent('Sakura-Tribe Elder');
  if (elder && game.library.some((card) => card.land?.basic))
    add(50, new Cost(), false, () => {
      game.sacrifice(elder);
      return fetchLand(game, 'basic', true) !== null;
    });
  if (
    game.isOnBattlefield('Phyrexian Reclamation') &&
    game.myLife > 15 &&
    game.bestCreatureInGraveyard()
  )
    add(45, Cost.parse('{1}{B}'), false, () => {
      if (!game.pay(Cost.parse('{1}{B}'), false)) return false;
      return game.returnCreatureToHand(2);
    });
}
