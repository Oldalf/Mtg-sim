/** Everything Ardyn's AI may do now, with a score each (higher first). */
import { HOLD } from './cards';
import type { ArdynGame } from './game';
import { CardDef, Cost } from '../../engine/cards/cards';
import { REANIMATION_SPELLS } from '../../engine/cards/card-facts';
import { Candidate } from '../../engine/game/game-types';

/** Adds one thing the AI may do: its score, what it costs, whether it is an instant or sorcery, and how to do it. */
type AddCandidate = (
  score: number,
  cost: Cost,
  isInstantOrSorcery: boolean,
  action: () => boolean,
  rockCard?: CardDef,
) => void;

export function buildCandidates(game: ArdynGame, _main2: boolean): Candidate[] {
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
  return candidates;
}

function addHandCardCandidate(
  game: ArdynGame,
  card: CardDef,
  add: AddCandidate,
): void {
  const cost = game.effectiveCost(card);
  const reanimation = REANIMATION_SPELLS[card.name];
  if (reanimation) {
    // only with a creature worth bringing back (Rise of the Dark Realms: several)
    const creaturesInGraveyard = game.graveyard.filter(
      (candidate) => candidate.isCreature,
    );
    const best = game.bestCreatureInGraveyard();
    if (!best) return;
    const score =
      reanimation.count === 'all'
        ? creaturesInGraveyard.length >= 3
          ? 88
          : 0
        : Math.min(90, game.battlefieldValue(best));
    if (score > 0)
      add(score, cost, card.isInstantOrSorcery, () =>
        card.isInstantOrSorcery
          ? game.castInstantOrSorcery(card)
          : game.castPerm(card),
      );
    return;
  }
  if (card.isInstantOrSorcery) {
    const cast = () => game.castInstantOrSorcery(card);
    if (card.name === 'Will of the Abzan')
      add(game.bestCreatureInGraveyard() ? 70 : 25, cost, true, cast);
    else if (card.name === 'Demonic Counsel') add(55, cost, true, cast);
    else add(30, cost, true, cast);
    return;
  }
  add(
    game.battlefieldValue(card),
    cost,
    false,
    () => game.castPerm(card),
    card.rock ? card : undefined,
  );
}
