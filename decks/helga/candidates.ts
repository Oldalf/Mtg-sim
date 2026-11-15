/** Everything Helga's AI may do now, with a score each (higher first). */
import { HOLD, RAMP_SPELLS } from './cards';
import type { HelgaGame } from './game';
import { CardDef, Cost } from '../../engine/cards/cards';
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

export function buildCandidates(game: HelgaGame, main2: boolean): Candidate[] {
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
  if (main2) addSakuraTribeElderCandidate(game, add);
  return candidates;
}

/** Casting a card from hand: ramp early, a big creature with Helga's mana when she can help. */
function addHandCardCandidate(
  game: HelgaGame,
  card: CardDef,
  add: AddCandidate,
): void {
  const cost = game.effectiveCost(card);
  if (card.isInstantOrSorcery) {
    const cast = () => game.castInstantOrSorcery(card);
    if (RAMP_SPELLS.has(card.name))
      add(game.manaSources() < 8 ? 80 : 20, cost, true, cast);
    else if (card.name === 'Become the Avalanche')
      add(30 + 10 * bigCreatureCount(game), cost, true, cast);
    else if (card.name === "Rishkar's Expertise")
      add(game.greatestPower() >= 4 ? 70 : 20, cost, true, cast);
    else add(30, cost, true, cast);
    return;
  }
  const value = game.battlefieldValue(card);
  add(
    value,
    cost,
    false,
    () => game.castPerm(card),
    card.rock ? card : undefined,
  );
  if (game.helgaManaFor(card) > 0)
    add(value + 3, game.costWithHelga(card), false, () =>
      game.castWithHelga(card),
    );
}

function bigCreatureCount(game: HelgaGame): number {
  return game.creatures().filter((permanent) => game.power(permanent) >= 4)
    .length;
}

/** Sakura-Tribe Elder: sacrifice it for a basic land (second main phase, after it could have blocked). */
function addSakuraTribeElderCandidate(
  game: HelgaGame,
  add: AddCandidate,
): void {
  const elder = game.findPermanent('Sakura-Tribe Elder');
  if (!elder || !game.library.some((card) => card.land?.basic)) return;
  add(50, new Cost(), false, () => {
    game.sacrifice(elder);
    return fetchLand(game, 'basic', true) !== null;
  });
}
