/** Everything Azula's AI may do now, with a score each (higher first). A ready combo comes first. In the first
 *  main phase, when Azula will attack, the instants and flash cards wait for combat: there she copies each one. */
import {
  BIG_SCORE,
  BREATH_OF_MALFEGOR,
  DEMAND_ANSWERS,
  ELECTRODOMINANCE,
  EQUIPMENT,
  FATED_FIREPOWER,
  FRANTIC_SEARCH,
  HOLD,
  JESKAS_WILL,
  LIGHTNING_BOLT,
  SCARRING_MEMORIES,
  SEA_GATE_RESTORATION,
  SOZINS_COMET,
  UNEXPECTED_WINDFALL,
} from './cards';
import { findComboWin, goOffWithCombo, missingComboPiece } from './combos';
import type { AzulaGame } from './game';
import { CardDef, Cost } from '../../engine/cards/cards';
import { Candidate } from '../../engine/game/game-types';
import { firstMin } from '../../engine/util/lists';

/** Adds one thing the AI may do: its score, what it costs, whether it is an instant or sorcery, and how to do it. */
type AddCandidate = (
  score: number,
  cost: Cost,
  isInstantOrSorcery: boolean,
  action: () => boolean,
  rockCard?: CardDef,
) => void;

/** A spell cast while Azula attacks is copied: worth this much more than in a main phase. */
const COPIED_BONUS = 15;

export function buildCandidates(game: AzulaGame, main2: boolean): Candidate[] {
  const candidates: Candidate[] = [];
  const add: AddCandidate = (score, cost, isInstantOrSorcery, action, rock) =>
    candidates.push({ score, cost, isInstantOrSorcery, action, rock });

  addComboCandidate(game, add);
  if (game.step !== 'combat')
    for (const commander of game.command.slice())
      add(
        95,
        game.commanderCost(commander, game.effectiveCost(commander)),
        false,
        () => game.castPerm(commander, true),
      );
  // in the first main phase the instants and flash cards wait for Azula's attack
  const waitsForCombat =
    !main2 && game.step !== 'combat' && game.canAzulaAttack();
  const seenNames = new Set<string>();
  for (const card of game.hand.slice()) {
    if (seenNames.has(card.name) || card.land !== null) continue;
    seenNames.add(card.name);
    if (!game.canCastNow(card)) continue;
    if (waitsForCombat && game.canCastInCombat(card)) continue;
    addHandCardCandidate(game, card, main2, add);
  }
  if (!main2 && game.step !== 'combat') addEquipCandidates(game, add);
  return candidates;
}

/** A combo that can go off now and reach a finisher: always first (its cost is checked by findComboWin). */
function addComboCandidate(game: AzulaGame, add: AddCandidate): void {
  const win = findComboWin(game);
  if (win) add(1000, new Cost(), true, () => goOffWithCombo(game, win));
}

function addHandCardCandidate(
  game: AzulaGame,
  card: CardDef,
  main2: boolean,
  add: AddCandidate,
): void {
  const cost = game.effectiveCost(card);
  const bonus = game.isAzulaAttacking ? COPIED_BONUS : 0;
  const cast = () => game.castInstantOrSorcery(card);
  switch (card.name) {
    case BIG_SCORE:
    case UNEXPECTED_WINDFALL:
      if (game.hand.length >= 2 && game.hand.length <= 6)
        add(50 + bonus, cost, true, () => castDiscarding(game, card));
      return;
    case DEMAND_ANSWERS:
      if (game.hand.length <= 6)
        add(45 + bonus, cost, true, () => castDemandAnswers(game, card));
      return;
    case FRANTIC_SEARCH:
      add(40 + bonus, cost, true, cast);
      return;
    case JESKAS_WILL:
      if (game.controlsCommander() && game.hand.length <= 5)
        add(60 + bonus, cost, true, cast);
      return;
    case SEA_GATE_RESTORATION:
      add(65 + bonus, cost, true, cast);
      return;
    case SOZINS_COMET:
      // before combat, with Azula and another creature to attack: five {R} each
      if (!main2 && game.step !== 'combat' && attackersAvailable(game) >= 2)
        add(55, cost, true, cast);
      return;
    case 'Waterlogged Teachings':
      if (missingComboPiece(game, (other) => other.isInstant))
        add(75, cost, true, cast);
      else if (main2) add(30, cost, true, cast);
      return;
    case LIGHTNING_BOLT:
    case BREATH_OF_MALFEGOR:
    case SCARRING_MEMORIES:
    case ELECTRODOMINANCE:
      addBurnCandidate(game, card, main2, add);
      return;
    case FATED_FIREPOWER:
      addXSpellCandidate(game, card, 2, game.battlefieldValue(card), add, () =>
        game.castPerm(card),
      );
      return;
  }
  if (HOLD.has(card.name)) return;
  if (card.isInstantOrSorcery) {
    add(30 + bonus, cost, true, cast);
    return;
  }
  // a nonlegendary permanent cast while Azula attacks is copied as a token
  const copyBonus = card.types.has('legendary') ? 0 : bonus;
  add(
    game.battlefieldValue(card) + copyBonus,
    cost,
    false,
    () => game.castPerm(card),
    card.rock ? card : undefined,
  );
}

/** Burn: while Azula attacks (copied), when it kills an opponent now, or late in a second main phase. */
function addBurnCandidate(
  game: AzulaGame,
  card: CardDef,
  main2: boolean,
  add: AddCandidate,
): void {
  const damage =
    card.name === BREATH_OF_MALFEGOR
      ? 5
      : card.name === ELECTRODOMINANCE
        ? 0
        : 3;
  let score = 0;
  if (game.isAzulaAttacking) score = 60 + 3 * damage;
  else if (killsAnOpponent(game, damage)) score = 80;
  else if (main2 && !game.isOnBattlefield('Fire Lord Azula')) score = 25;
  if (score === 0) return;
  if (card.name === ELECTRODOMINANCE) {
    addXSpellCandidate(game, card, 2, score, add, () =>
      game.castInstantOrSorcery(card),
    );
    return;
  }
  add(score, game.effectiveCost(card), true, () =>
    game.castInstantOrSorcery(card),
  );
}

function killsAnOpponent(game: AzulaGame, damage: number): boolean {
  const target = game.chooseTargetOpponent();
  return target !== null && damage > 0 && game.life[target] <= damage;
}

/** An X spell with the largest X we can pay (at least `smallestX`). */
function addXSpellCandidate(
  game: AzulaGame,
  card: CardDef,
  smallestX: number,
  score: number,
  add: AddCandidate,
  castIt: () => boolean,
): void {
  const x = game.largestX(card);
  if (x < smallestX) return;
  const cost = game.effectiveCost(card);
  add(score + x, cost.withGeneric(cost.generic + x), true, () => {
    if (!game.pay(new Cost(x), true)) return false;
    game.chosenX = x;
    return castIt();
  });
}

/** Big Score and Unexpected Windfall: discard our least wanted other card as we cast it. */
function castDiscarding(game: AzulaGame, card: CardDef): boolean {
  if (!game.canPay(game.effectiveCost(card), true)) return false;
  const others = game.hand.filter((other) => other !== card);
  if (!others.length) return false;
  const discarded = firstMin(others, (other) => game.discardValue(other));
  game.moveCard(discarded, 'hand', 'graveyard');
  game.say('  discard', discarded);
  return game.castInstantOrSorcery(card);
}

/** Demand Answers: sacrifice a Treasure if we have one, else discard our least wanted card. */
function castDemandAnswers(game: AzulaGame, card: CardDef): boolean {
  if (!game.canPay(game.effectiveCost(card), true)) return false;
  const treasure = game.battlefield.find(
    (permanent) => permanent.card.name === 'Treasure' && !permanent.tapped,
  );
  if (treasure) {
    game.sacrifice(treasure);
    return game.castInstantOrSorcery(card);
  }
  return castDiscarding(game, card);
}

/** Before combat: equipment onto Azula (haste from Greaves or Boots while she is summoning sick; protection). */
function addEquipCandidates(game: AzulaGame, add: AddCandidate): void {
  const azula = game.azula();
  if (!azula) return;
  for (const [name, equipment] of Object.entries(EQUIPMENT)) {
    if (!game.isOnBattlefield(name) || azula.marks & equipment.mark) continue;
    const givesHaste = name !== 'Whispersilk Cloak';
    const score = azula.sick && givesHaste ? 75 : 40;
    add(score, new Cost(equipment.cost), false, () => game.equipAzula(name));
  }
}

function attackersAvailable(game: AzulaGame): number {
  return game.creatures().filter((creature) => game.canAttack(creature)).length;
}
