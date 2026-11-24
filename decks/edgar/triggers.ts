/** What happens when a permanent enters the battlefield, dies, or attacks: the triggers of Edgar's cards. */
import { ELDRAZI_SPAWN, TREASURE } from '../../engine/cards/tokens';
import {
  BARON_BERTRAM,
  EDGAR,
  EVERETH,
  LEGIONS_LANDING,
  TOKENS,
  isVampire,
} from './cards';
import type { EdgarGame } from './game';
import { Cost } from '../../engine/cards/cards';
import { Permanent, Zone } from '../../engine/game/game-types';
import { firstMax } from '../../engine/util/lists';

// ================================================================ entering the battlefield
export function onPermanentEntered(
  game: EdgarGame,
  permanent: Permanent,
  from: Zone,
): void {
  triggerWelcomingVampire(game, permanent);
  triggerBaronBertram(game, permanent);
  resolveEntersEffect(game, permanent, from);
}

/** Welcoming Vampire: another creature with power 2 or less enters: draw a card (once each turn). */
function triggerWelcomingVampire(game: EdgarGame, entered: Permanent): void {
  if (
    game.welcomingVampireUsed ||
    !entered.card.isCreature ||
    game.power(entered) > 2
  )
    return;
  const welcomingVampire = game.findPermanent('Welcoming Vampire');
  if (!welcomingVampire || welcomingVampire === entered) return;
  game.welcomingVampireUsed = true;
  game.draw(1);
}

/** Baron Bertram Graywater: tokens enter: make a 1/1 lifelink Vampire (once each turn). */
function triggerBaronBertram(game: EdgarGame, entered: Permanent): void {
  if (!entered.token || game.baronBertramUsed) return;
  if (!game.isOnBattlefield(BARON_BERTRAM)) return;
  game.baronBertramUsed = true;
  game.createTokens(TOKENS.lifelinkVampire);
}

/** The enters-the-battlefield effect of the permanent itself. */
function resolveEntersEffect(
  game: EdgarGame,
  permanent: Permanent,
  from: Zone,
): void {
  const wasCast = from === 'hand' || from === 'command';
  switch (permanent.card.name) {
    case LEGIONS_LANDING:
      game.createTokens(TOKENS.lifelinkVampire);
      break;
    case 'Gas Guzzler':
      permanent.tapped = true;
      break;
    case 'Emeritus of Woe':
      if (wasCast) game.prepared.add(permanent);
      break;
    case 'Forerunner of the Legion':
      game.doTutor((card) => isVampire(card) && card.land === null, true);
      break;
  }
}

// ================================================================ dying
/** Everything that triggers when a permanent leaves the battlefield dying or sacrificed. The permanent is already gone,
 *  so its own "this creature dies" triggers are looked at too. */
export function onPermanentDied(game: EdgarGame, dead: Permanent): void {
  const card = dead.card;
  const wasCreature = card.isCreature;
  if (wasCreature) game.creaturesDiedThisTurn++;
  const wasArtifact = card.types.has('artifact');
  const triggerSources = [...game.battlefield, dead];
  for (const source of triggerSources) {
    const isDeadItself = source === dead;
    switch (source.card.name) {
      case 'Blood Artist':
        if (wasCreature) game.drainOne(1);
        break;
      case 'Vengeful Bloodwitch':
        if (wasCreature) game.drainOne(1);
        break;
      case 'Susurian Voidborn':
        if (wasCreature || wasArtifact) game.drainOne(1);
        break;
      case 'Cruel Celebrant':
        if (wasCreature) game.drainAllOpponents(1);
        break;
      case 'Cordial Vampire':
        if (wasCreature) addCounterToEachVampire(game);
        break;
      case 'Elenda, the Dusk Rose':
        if (!isDeadItself && wasCreature) source.counters += 1;
        break;
      case 'Pitiless Plunderer':
        if (!isDeadItself && wasCreature) game.createTokens(TREASURE);
        break;
      case 'Pawn of Ulamog':
        if (wasCreature && !dead.token) game.createTokens(ELDRAZI_SPAWN);
        break;
      case 'Carmen, Cruel Skymarcher':
        if (game.isSacrificing && !isDeadItself) {
          source.counters += 1;
          game.gainLife(1);
        }
        break;
      case 'Mayhem Devil':
        if (game.isSacrificing) pingOpponent(game);
        break;
    }
  }
  resolveDeathEffect(game, dead);
}

function addCounterToEachVampire(game: EdgarGame): void {
  for (const vampire of game.vampires()) vampire.counters += 1;
}

/** Mayhem Devil: 1 damage to the opponent closest to dead. */
function pingOpponent(game: EdgarGame): void {
  const target = game.chooseTargetOpponent();
  if (target !== null) game.damageOpponent(target, 1);
}

/** The "when this dies" effect of the dead permanent itself. */
function resolveDeathEffect(game: EdgarGame, dead: Permanent): void {
  switch (dead.card.name) {
    case 'Elenda, the Dusk Rose':
      game.createTokens(TOKENS.lifelinkVampire, game.power(dead));
      break;
    case EVERETH: {
      // may pay {1}{B/R}: damage equal to its power to each opponent
      const power = game.power(dead);
      if (power > 0 && game.pay(Cost.parse('{1}{B/R}'), false)) {
        game.say('  Evereth deals', String(power), 'to each opponent');
        game.withDamageSource('explosion', () =>
          game.drainAllOpponents(power, false),
        );
      }
      break;
    }
  }
}

// ================================================================ attacking
/** Attack triggers. Returns the creatures that join the attack (none). */
export function onPermanentAttacks(
  game: EdgarGame,
  attackers: Permanent[],
): Permanent[] {
  for (const attacker of attackers) {
    switch (attacker.card.name) {
      case EDGAR:
        addCounterToEachVampire(game);
        break;
      case 'Preacher of the Schism':
        triggerPreacher(game);
        break;
      case 'Vampire Gourmand':
        triggerGourmand(game, attacker);
        break;
      case 'Carmen, Cruel Skymarcher':
        triggerCarmen(game, attacker);
        break;
    }
  }
  if (attackers.length >= 3) transformLegionsLanding(game);
  return [];
}

/** Preacher of the Schism: a Vampire token when we attack the player with the most life (we assume the opponent
 *  with the most life), a card (and 1 life) when we have the most life. */
function triggerPreacher(game: EdgarGame): void {
  const mostOpponentLife = Math.max(...game.life);
  if (mostOpponentLife >= game.myLife)
    game.createTokens(TOKENS.lifelinkVampire);
  if (game.myLife >= mostOpponentLife) {
    game.draw(1);
    game.loseLife(1);
  }
}

/** Vampire Gourmand: sacrifice another creature (a token) to draw a card. */
function triggerGourmand(game: EdgarGame, gourmand: Permanent): void {
  const fodder = game
    .creatures()
    .find(
      (permanent) =>
        permanent !== gourmand && permanent.token && !permanent.tapped,
    );
  if (!fodder) return;
  game.sacrifice(fodder);
  game.draw(1);
}

/** Carmen: return a permanent card with mana value up to her power from the graveyard to the battlefield. */
function triggerCarmen(game: EdgarGame, carmen: Permanent): void {
  const power = game.power(carmen);
  const options = game.graveyard.filter(
    (card) =>
      card.land === null && !card.isInstantOrSorcery && card.manaValue <= power,
  );
  if (!options.length) return;
  const best = firstMax(options, (card) => game.battlefieldValue(card));
  game.takeCardIfThere(best, 'graveyard');
  game.enter(best, 'graveyard');
  game.say('  Carmen returns', best);
}

/** Legion's Landing becomes Adanto, the First Fort (a land that makes {W}) when we attack with three creatures. */
function transformLegionsLanding(game: EdgarGame): void {
  const landing = game.findPermanent(LEGIONS_LANDING);
  if (landing && !landing.transformed) {
    landing.transformed = true;
    game.say("  Legion's Landing transforms");
  }
}
