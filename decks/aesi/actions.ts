import { MELOKU, MINDSWEEPER, RETURNERS, TOK, UYO } from './cards';
import type { AesiGame } from './game';
import { CardDef, Cost, makeToken } from '../../engine/cards';
import { Perm } from '../../engine/game-types';
import { firstMax, firstMin, removeIfPresent } from '../../engine/lists';

// ---------------------------------------------------------------- actions
export function bounceAndReplayLand(game: AesiGame, permanent: Perm): boolean {
  const [abilityMana, , kind] = RETURNERS[permanent.cd.name];
  const cost = game.abilityCost(new Cost(abilityMana));
  const basics = game
    .landsBf()
    .filter((otherPermanent) => game.untappedLand(otherPermanent.cd));
  if (!basics.length) return false;
  let land = basics.find((otherPermanent) => otherPermanent.tapped) ?? null;
  if (!land) {
    land = basics[0];
    if (game.srcKind(land)) game.tap(land, 'N'); // float its mana first
  }
  if (!game.pay(cost)) return false;
  removeIfPresent(game.bf, land);
  game.hand.push(land.cd);
  game.say(`${permanent.cd.name.split(',')[0]}: return ${land.cd.name}`);
  applyMoonfolkEffect(game, kind);
  return game.playLandVia(null, land.cd);
}

export function applyMoonfolkEffect(game: AesiGame, kind: string): void {
  if (kind === 'token') game.enter(TOK.illusion, 'token', { token: true });
  else if (kind === 'loot') {
    game.draw(1);
    game.discard(1);
  } else if (kind === 'untap') {
    const otherPermanent = game
      .landsBf()
      .find((permanent) => permanent.tapped && game.srcKind(permanent));
    if (otherPermanent) otherPermanent.tapped = false;
  } else if (kind === 'mill') {
    let target: number | null = null;
    for (let i = 0; i < game.lib.length; i++)
      if (
        game.oppAlive(i) &&
        (target === null || game.lib[i] > game.lib[target])
      )
        target = i;
    if (target !== null) {
      game.lib[target] = Math.max(0, game.lib[target] - 2);
      if (game.lib[target] === 0 && game.firstOppDead === null)
        game.firstOppDead = game.turn;
    }
  }
}

export function melokuEndOfTurn(game: AesiGame): boolean {
  const otherPermanent = game
    .landsBf()
    .find((permanent) => permanent.tapped && permanent.land!.basic);
  if (!otherPermanent || !game.pay(game.abilityCost(new Cost(1)))) return false;
  removeIfPresent(game.bf, otherPermanent);
  game.hand.push(otherPermanent.cd);
  game.say(`Meloku: return ${otherPermanent.cd.name} -> Illusion`);
  game.enter(TOK.illusion, 'token', { token: true });
  return true;
}

/** Moonfolk offering: the least useful moonfolk (not a loop piece). */
export function chooseOfferingFodder(game: AesiGame): Perm | null {
  const keepers = new Set([MELOKU, UYO, MINDSWEEPER, 'Oboro Breezecaller']);
  const permanents = game.bf.filter(
    (permanent) =>
      RETURNERS[permanent.cd.name] && !keepers.has(permanent.cd.name),
  );
  return permanents.length
    ? firstMin(permanents, (permanent) => game.battlefieldValue(permanent.cd))
    : null;
}

export function castPatronWithOffering(
  game: AesiGame,
  card: CardDef,
  permanent: Perm,
  cost: Cost,
): boolean {
  if (!game.bf.includes(permanent) || !game.pay(cost)) return false;
  game.say(
    `moonfolk offering: sacrifice ${permanent.cd.name} for Patron of the Moon`,
  );
  game.sacrifice(permanent);
  removeIfPresent(game.hand, card);
  game.spellsCast += 1;
  game.enter(card);
  game.spiritCast();
  return true;
}

export function castFertileFootsteps(game: AesiGame, card: CardDef): boolean {
  if (!game.pay(Cost.parse('{2}{G}'), true)) return false;
  removeIfPresent(game.hand, card);
  game.exile.push(card);
  game.footstepsExiled = true;
  game.spellsCast += 1;
  game.say('cast Fertile Footsteps');
  game.fetchBasic();
  return true;
}

export function castBeanstalkGiant(game: AesiGame, card: CardDef): boolean {
  if (!game.pay(card.cost)) return false;
  removeIfPresent(game.exile, card);
  game.footstepsExiled = false;
  game.spellsCast += 1;
  game.say('cast Beanstalk Giant from exile');
  game.enter(card);
  return true;
}

export function castFromTopOfLibrary(game: AesiGame, card: CardDef): boolean {
  if (game.library[0] !== card || !game.pay(game.effCost(card))) return false;
  game.library.shift();
  game.spellsCast += 1;
  game.say('cast from the top (Case):', card);
  game.enter(card);
  return true;
}

export function sacrificeKhalni(game: AesiGame, permanent: Perm): boolean {
  game.sacrifice(permanent);
  game.say('Khalni Heart Expedition: two basics');
  game.fetchBasic({ tapped: true });
  game.fetchBasic({ tapped: true });
  return true;
}

export function useDemolitionField(game: AesiGame, permanent: Perm): boolean {
  if (!game.pay(new Cost(2))) return false;
  permanent.tapped = true;
  removeIfPresent(game.bf, permanent);
  game.gy.push(permanent.cd);
  game.say(
    "Demolition Field: destroy an opponent's nonbasic land, fetch a basic",
  );
  return game.fetchBasic();
}

export function levelUpDruidClass(
  game: AesiGame,
  permanent: Perm,
  cost: Cost,
): boolean {
  if (!game.pay(cost)) return false;
  permanent.counters += 1;
  game.say(`Druid Class: level ${permanent.counters}`);
  return true;
}

export function useLootDig(
  game: AesiGame,
  permanent: Perm,
  cost: Cost,
): boolean {
  if (!game.pay(cost)) return false;
  permanent.tapped = true;
  const top = game.library.splice(0, 6);
  const landCount = game.landsBf().length;
  const cards = top.filter(
    (card) =>
      card.isCreature &&
      card.mv <= landCount &&
      !(card.types.has('legendary') && game.onBf(card.name)),
  );
  const pick = cards.length
    ? firstMax(cards, (card) => game.battlefieldValue(card))
    : null;
  if (pick) removeIfPresent(top, pick);
  game.library.push(...top);
  game.say('Loot digs:', pick ?? 'nothing');
  if (pick) game.enter(pick, 'library');
  return true;
}

export function useDokai(game: AesiGame, permanent: Perm, cost: Cost): boolean {
  if (!game.pay(cost)) return false;
  permanent.tapped = true;
  const size = game.landsBf().length;
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
  removeIfPresent(game.hand, card);
  game.spellsCast += 1;
  game.say(`cast Blue Sun's Zenith (X=${xValue}) for us`);
  game.draw(xValue);
  game.library.push(card);
  game.shuffle();
  return true;
}
