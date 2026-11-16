import { BLOODLINE_KEEPER, ELDRAZI_MONUMENT, EVERETH, HOLD } from './cards';
import {
  bloodlineKeeperTransformIsWorthIt,
  castBeseechTheMirror,
  castPreparedSpell,
  castWithSacrifice,
  chooseOutlet,
  clampToken,
  makeKeeperToken,
  preparedSpellCost,
  sacrificeOneSpare,
  sacrificeEverything,
  sacrificeTurnWins,
  skullclampToken,
  spareFodder,
  transformKeeper,
} from './actions';
import type { EdgarGame } from './game';
import { CardDef, Cost } from '../../engine/cards/cards';
import { Candidate } from '../../engine/game/game-types';

/** Adds one thing the AI may do: its score, what it costs, whether it is an instant or sorcery, and how to do it. */
type AddCandidate = (
  score: number,
  cost: Cost,
  isInstantOrSorcery: boolean,
  action: () => boolean,
  rockCard?: CardDef,
) => void;

/** Lower than any other play, so that Edgar is cast only when mana is left over. */
const COMMANDER_CAST_SCORE = 1;

/** Everything the AI may do now, with a score each (higher first). */
export function buildCandidates(game: EdgarGame, main2: boolean): Candidate[] {
  const candidates: Candidate[] = [];
  const add: AddCandidate = (score, cost, isInstantOrSorcery, action, rock) =>
    candidates.push({ score, cost, isInstantOrSorcery, action, rock });

  // the kill: sacrifice everything when that wins the game
  if (sacrificeTurnWins(game))
    add(99, new Cost(), false, () => {
      sacrificeEverything(game);
      return true;
    });

  // Edgar stays in the command zone: his eminence works there, no sorcery-speed removal or wipe reaches him and his
  // tax stays low. He is cast only with mana nothing else wants.
  for (const commander of game.command.slice())
    add(
      COMMANDER_CAST_SCORE,
      game.commanderCost(commander, game.effectiveCost(commander)),
      false,
      () => game.castPerm(commander, true),
    );
  const seenNames = new Set<string>();
  for (const card of game.hand.slice()) {
    if (seenNames.has(card.name) || card.land !== null) continue;
    seenNames.add(card.name);
    if (HOLD.has(card.name) || card.name === 'Dark Ritual') continue;
    addHandCardCandidate(game, card, add);
  }
  addPermanentAbilityCandidates(game, add);
  if (main2) addSacrificeCandidates(game, add);
  return candidates;
}

/** Casting a card from hand. */
function addHandCardCandidate(
  game: EdgarGame,
  card: CardDef,
  add: AddCandidate,
): void {
  const cost = game.effectiveCost(card);
  const fodder = spareFodder(game, [], true).find(
    (permanent) => permanent.card.name !== EVERETH,
  );
  switch (card.name) {
    case 'Corrupted Conviction':
      if (fodder && spareFodder(game).includes(fodder))
        add(55, cost, true, () => castWithSacrifice(game, card, fodder));
      return;
    case 'Diabolic Intent':
      if (fodder)
        add(game.turn >= 4 ? 52 : 25, cost, true, () =>
          castWithSacrifice(game, card, fodder),
        );
      return;
    case 'Beseech the Mirror': {
      const bargainFodder = game.battlefield.find(
        (permanent) => permanent.token && permanent.card.isCreature,
      );
      add(50, cost, true, () =>
        castBeseechTheMirror(game, card, bargainFodder ?? null),
      );
      return;
    }
    case 'Phyrexian Arena':
      add(game.myLife > 20 ? 66 : 10, cost, false, () => game.castPerm(card));
      return;
    case 'Black Market Connections':
      add(game.myLife > 20 ? 62 : 15, cost, false, () => game.castPerm(card));
      return;
    case 'Keen Duelist':
      // it costs us life every upkeep (the opponent's card is random)
      add(game.myLife > 30 ? 55 : 8, cost, false, () => game.castPerm(card));
      return;
    case ELDRAZI_MONUMENT:
      // it eats a creature each upkeep: only with tokens to feed it
      if (game.creatures().filter((creature) => creature.token).length >= 3)
        add(45, cost, false, () => game.castPerm(card));
      return;
    case 'Dreadhorde Invasion':
      add(game.myLife > 25 ? 40 : 10, cost, false, () => game.castPerm(card));
      return;
  }
  if (card.isInstantOrSorcery)
    add(30, cost, true, () => game.castInstantOrSorcery(card));
  else
    add(
      game.battlefieldValue(card),
      cost,
      false,
      () => game.castPerm(card),
      card.rock ? card : undefined,
    );
}

/** Abilities of permanents on the battlefield. */
function addPermanentAbilityCandidates(
  game: EdgarGame,
  add: AddCandidate,
): void {
  for (const permanent of game.battlefield) {
    const name = permanent.card.name;
    if (name === BLOODLINE_KEEPER) {
      if (!permanent.tapped && !permanent.sick)
        add(60, new Cost(), false, () => makeKeeperToken(game, permanent));
      if (!permanent.transformed && bloodlineKeeperTransformIsWorthIt(game))
        add(58, Cost.parse('{B}'), false, () =>
          transformKeeper(game, permanent),
        );
    }
    if (game.prepared.has(permanent))
      add(
        permanent.card.name === 'Emeritus of Woe' ? 56 : 54,
        preparedSpellCost(permanent),
        true,
        () => castPreparedSpell(game, permanent),
      );
  }
  const clampTarget = skullclampToken(game);
  if (clampTarget)
    add(75, new Cost(1), false, () => clampToken(game, clampTarget));
}

/** In the second main phase: sacrifice spare tokens for drain, counters or cards. */
function addSacrificeCandidates(game: EdgarGame, add: AddCandidate): void {
  const fodder = spareFodder(game)[0];
  if (!fodder) return;
  const outlet = chooseOutlet(game, fodder);
  if (!outlet) return;
  add(48, outlet.cost, false, () => sacrificeOneSpare(game));
}
