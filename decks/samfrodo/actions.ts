/** What gaining n more life this turn is worth (0 = nothing on the battlefield cares). */
import { FOOD, GOLLUM } from './cards';
import type { SamFrodoGame } from './game';
import { CardDef, Cost } from '../../engine/cards';
import { Perm } from '../../engine/game-types';
import { removeIfPresent } from '../../engine/lists';

export function valueOfGainingLife(game: SamFrodoGame, amount: number): number {
  let value = 0;
  const after = game.lifeGainedThisTurn + amount;
  for (const permanent of game.bf) {
    const name = permanent.cd.name;
    if (name === 'Sanguine Bond') value += 10 * amount;
    else if (name === GOLLUM)
      value +=
        10 *
        amount *
        game.gollumHit.filter((hit, i) => hit && game.oppAlive(i)).length;
    else if (
      (name === 'The Gaffer' || name === 'Gwaihir, Greatest of the Eagles') &&
      game.lifeGainedThisTurn < 3 &&
      after >= 3
    )
      value += 25;
    else if (
      name === 'Tippy-Toe, Terrific Partner' &&
      game.lifeGainedThisTurn === 0
    )
      value += 20;
    else if (name === 'Cat Collector' && !game.firstLifeGainHappened)
      value += 12;
    else if (name === 'Dawn of Hope' || name === 'Well of Lost Dreams')
      value += 10;
  }
  return value;
}

export function payAndActivate(
  game: SamFrodoGame,
  cost: Cost,
  effect: () => void,
): boolean {
  if (!game.pay(cost)) return false;
  effect();
  return true;
}

export function payTapAndActivate(
  game: SamFrodoGame,
  permanent: Perm,
  cost: Cost,
  effect: () => void,
): boolean {
  if (!game.pay(cost)) return false;
  permanent.tapped = true;
  effect();
  return true;
}

/** An artifact to sacrifice for value: a Clue, a spare Food or Treasure. */
export function artifactToSacrifice(game: SamFrodoGame): Perm | null {
  return (
    game
      .spareSacrifices()
      .find((permanent) => permanent.cd.types.has('artifact')) ?? null
  );
}

export function castFarmerCotton(
  game: SamFrodoGame,
  card: CardDef,
  xValue: number,
): boolean {
  if (!game.pay(card.cost.withGeneric(xValue))) return false;
  removeIfPresent(game.hand, card);
  game.spellsCast += 1;
  game.say(`cast Farmer Cotton (X=${xValue})`);
  game.farmerCottonX = xValue;
  game.enter(card);
  game.farmerCottonX = 0;
  return true;
}

export function returnCauldronFamiliar(
  game: SamFrodoGame,
  card: CardDef,
): boolean {
  const permanent = game.foodsOnBattlefield()[0];
  if (!permanent || !game.gy.includes(card)) return false;
  game.sacrifice(permanent);
  removeIfPresent(game.gy, card);
  game.say('Cauldron Familiar returns');
  game.enter(card, 'graveyard');
  return true;
}

export function activateWitchsOven(
  game: SamFrodoGame,
  permanent: Perm,
  victim: Perm,
): boolean {
  if (!game.bf.includes(victim)) return false;
  permanent.tapped = true;
  const big = game.toughness(victim) >= 4;
  game.say("Witch's Oven eats", victim.cd);
  game.sacrifice(victim);
  game.makeTokens(big ? [FOOD, FOOD] : [FOOD]);
  return true;
}

export function activateLobelia(
  game: SamFrodoGame,
  permanent: Perm,
  artifact: Perm,
): boolean {
  permanent.tapped = true;
  game.say('Lobelia: sacrifice', artifact.cd, '-> drain 2');
  game.sacrifice(artifact);
  game.drainEach(2);
  game.gainLife(2);
  return true;
}

export function activateTradingPost(
  game: SamFrodoGame,
  permanent: Perm,
  effect: () => void,
): boolean {
  if (!game.pay(new Cost(1))) return false;
  permanent.tapped = true;
  effect();
  return true;
}

export function sacrificeFoodsToDraw(
  game: SamFrodoGame,
  count: number,
): boolean {
  const permanents = game
    .spareSacrifices()
    .filter((permanent) => permanent.cd === FOOD)
    .slice(0, count);
  if (permanents.length < count) return false;
  for (const food of permanents) game.sacrifice(food);
  game.draw(1);
  return true;
}

export function activateShireTerrace(
  game: SamFrodoGame,
  permanent: Perm,
): boolean {
  if (!game.pay(new Cost(1))) return false;
  game.sacrifice(permanent);
  return game.putBasic();
}
