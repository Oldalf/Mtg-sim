import { MELOKU, MINDSWEEPER, RETURNERS, TOK, UYO } from './cards';
import type { AesiGame } from './game';
import { CardDef, Cost, makeToken } from '../../engine/cards';
import { Permanent } from '../../engine/game-types';
import { firstMax, firstMin, removeIfPresent } from '../../engine/lists';

// ---------------------------------------------------------------- actions
export function bounceAndReplayLand(
  game: AesiGame,
  permanent: Permanent,
): boolean {
  const [abilityMana, , kind] = RETURNERS[permanent.card.name];
  const cost = game.abilityCost(new Cost(abilityMana));
  const basics = game
    .landsOnBattlefield()
    .filter((otherPermanent) => game.untappedLand(otherPermanent.card));
  if (!basics.length) return false;
  let land = basics.find((otherPermanent) => otherPermanent.tapped) ?? null;
  if (!land) {
    land = basics[0];
    if (game.manaSourceKind(land)) game.tap(land, 'N'); // float its mana first
  }
  if (!game.pay(cost)) return false;
  game.takeFromBattlefieldIfThere(land);
  game.putCard(land.card, 'hand');
  game.say(`${permanent.card.name.split(',')[0]}: return ${land.card.name}`);
  applyMoonfolkEffect(game, kind);
  return game.playLandVia(null, land.card);
}

export function applyMoonfolkEffect(game: AesiGame, kind: string): void {
  if (kind === 'token') game.enter(TOK.illusion, 'token', { token: true });
  else if (kind === 'loot') {
    game.draw(1);
    game.discard(1);
  } else if (kind === 'untap') {
    const otherPermanent = game
      .landsOnBattlefield()
      .find((permanent) => permanent.tapped && game.manaSourceKind(permanent));
    if (otherPermanent) otherPermanent.tapped = false;
  } else if (kind === 'mill') {
    let target: number | null = null;
    for (let i = 0; i < game.opponentLibrarySizes.length; i++)
      if (
        game.isOpponentAlive(i) &&
        (target === null ||
          game.opponentLibrarySizes[i] > game.opponentLibrarySizes[target])
      )
        target = i;
    if (target !== null) {
      game.opponentLibrarySizes[target] = Math.max(
        0,
        game.opponentLibrarySizes[target] - 2,
      );
      if (
        game.opponentLibrarySizes[target] === 0 &&
        game.firstOpponentDeadTurn === null
      )
        game.firstOpponentDeadTurn = game.turn;
    }
  }
}

export function melokuEndOfTurn(game: AesiGame): boolean {
  const otherPermanent = game
    .landsOnBattlefield()
    .find((permanent) => permanent.tapped && permanent.land!.basic);
  if (!otherPermanent || !game.pay(game.abilityCost(new Cost(1)))) return false;
  game.takeFromBattlefieldIfThere(otherPermanent);
  game.putCard(otherPermanent.card, 'hand');
  game.say(`Meloku: return ${otherPermanent.card.name} -> Illusion`);
  game.enter(TOK.illusion, 'token', { token: true });
  return true;
}

/** Moonfolk offering: the least useful moonfolk (not a loop piece). */
export function chooseOfferingFodder(game: AesiGame): Permanent | null {
  const keepers = new Set([MELOKU, UYO, MINDSWEEPER, 'Oboro Breezecaller']);
  const permanents = game.battlefield.filter(
    (permanent) =>
      RETURNERS[permanent.card.name] && !keepers.has(permanent.card.name),
  );
  return permanents.length
    ? firstMin(permanents, (permanent) => game.battlefieldValue(permanent.card))
    : null;
}

export function castPatronWithOffering(
  game: AesiGame,
  card: CardDef,
  permanent: Permanent,
  cost: Cost,
): boolean {
  if (!game.battlefield.includes(permanent) || !game.pay(cost)) return false;
  game.say(
    `moonfolk offering: sacrifice ${permanent.card.name} for Patron of the Moon`,
  );
  game.sacrifice(permanent);
  game.takeCardIfThere(card, 'hand');
  game.spellsCast += 1;
  game.enter(card);
  game.spiritCast();
  return true;
}

export function castFertileFootsteps(game: AesiGame, card: CardDef): boolean {
  if (!game.pay(Cost.parse('{2}{G}'), true)) return false;
  game.takeCardIfThere(card, 'hand');
  game.putCard(card, 'exile');
  game.footstepsExiled = true;
  game.spellsCast += 1;
  game.say('cast Fertile Footsteps');
  game.fetchBasic();
  return true;
}

export function castBeanstalkGiant(game: AesiGame, card: CardDef): boolean {
  if (!game.pay(card.cost)) return false;
  game.takeCardIfThere(card, 'exile');
  game.footstepsExiled = false;
  game.spellsCast += 1;
  game.say('cast Beanstalk Giant from exile');
  game.enter(card);
  return true;
}

export function castFromTopOfLibrary(game: AesiGame, card: CardDef): boolean {
  if (game.library[0] !== card || !game.pay(game.effectiveCost(card)))
    return false;
  game.takeTopCardsOfLibrary(1);
  game.spellsCast += 1;
  game.say('cast from the top (Case):', card);
  game.enter(card);
  return true;
}

export function sacrificeKhalni(game: AesiGame, permanent: Permanent): boolean {
  game.sacrifice(permanent);
  game.say('Khalni Heart Expedition: two basics');
  game.fetchBasic({ tapped: true });
  game.fetchBasic({ tapped: true });
  return true;
}

export function useDemolitionField(
  game: AesiGame,
  permanent: Permanent,
): boolean {
  if (!game.pay(new Cost(2))) return false;
  permanent.tapped = true;
  game.takeFromBattlefieldIfThere(permanent);
  game.putCard(permanent.card, 'graveyard');
  game.say(
    "Demolition Field: destroy an opponent's nonbasic land, fetch a basic",
  );
  return game.fetchBasic();
}

export function levelUpDruidClass(
  game: AesiGame,
  permanent: Permanent,
  cost: Cost,
): boolean {
  if (!game.pay(cost)) return false;
  permanent.counters += 1;
  game.say(`Druid Class: level ${permanent.counters}`);
  return true;
}

export function useLootDig(
  game: AesiGame,
  permanent: Permanent,
  cost: Cost,
): boolean {
  if (!game.pay(cost)) return false;
  permanent.tapped = true;
  const top = game.takeTopCardsOfLibrary(6);
  const landCount = game.landsOnBattlefield().length;
  const cards = top.filter(
    (card) =>
      card.isCreature &&
      card.manaValue <= landCount &&
      !(card.types.has('legendary') && game.isOnBattlefield(card.name)),
  );
  const pick = cards.length
    ? firstMax(cards, (card) => game.battlefieldValue(card))
    : null;
  if (pick) removeIfPresent(top, pick);
  game.putCards(top, 'library');
  game.say('Loot digs:', pick ?? 'nothing');
  if (pick) game.enter(pick, 'library');
  return true;
}

export function useDokai(
  game: AesiGame,
  permanent: Permanent,
  cost: Cost,
): boolean {
  if (!game.pay(cost)) return false;
  permanent.tapped = true;
  const size = game.landsOnBattlefield().length;
  game.enter(makeToken('Elemental', size, size, 'green'), 'token', {
    token: true,
  });
  game.say(`Dokai: a ${size}/${size} Elemental`);
  return true;
}

export function castZenithForSelf(
  game: AesiGame,
  card: CardDef,
  xValue: number,
): boolean {
  if (!game.pay(card.cost.withGeneric(xValue), true)) return false;
  game.takeCardIfThere(card, 'hand');
  game.spellsCast += 1;
  game.say(`cast Blue Sun's Zenith (X=${xValue}) for us`);
  game.draw(xValue);
  game.putCard(card, 'library');
  game.shuffle();
  return true;
}
