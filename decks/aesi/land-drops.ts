/**
 * Aesi's land drops: which way a land goes onto the battlefield (a land drop, a "put a land" creature, Patron of the
 * Moon), which land and colour we want, Case of the Locked Hothouse playing lands from the top, a land entering (a fetch
 * land cracks at once, Simic Growth Chamber returns a land). AesiGame's methods of the same names call these.
 */
import type { AesiGame, Way } from './game';
import {
  BASIC_COL,
  BUDOKA,
  CASE,
  HOLD,
  PASSAGE,
  PATRON,
  PUTTERS,
  SKYCLAVE,
} from './cards';
import { findLoopPutter } from './loops';
import { castFromTopOfLibrary } from './actions';
import { CardDef, Cost } from '../../engine/cards/cards';
import { Permanent } from '../../engine/game/game-types';
import { firstMax } from '../../engine/util/lists';

/** Lands that come back untapped (basics, Reliquary Tower, Demolition Field): they pay for a loop. */
export function entersUntapped(game: AesiGame, card: CardDef): boolean {
  // (a fast land comes back tapped once there are three lands)
  return (
    card.land !== null &&
    card !== SKYCLAVE && // returned to hand it is a battle, not a land
    card.land.etb !== 'tapped' &&
    card.land.special !== 'wilds' &&
    card.land.special !== 'chamber' &&
    card.land.cond !== 'fast'
  );
}

export function creaturesReadyToPutALand(game: AesiGame): Permanent[] {
  const landCount = game.landsOnBattlefield().length;
  return game.battlefield.filter(
    (permanent) =>
      PUTTERS.has(permanent.card.name) &&
      !permanent.tapped &&
      !permanent.sick &&
      !(permanent.card.name === BUDOKA && permanent.transformed) &&
      (permanent.card.name !== BUDOKA || landCount < 30),
  );
}

/** How to get a land from hand onto the battlefield now, best first: a "put" creature when Retreat
 *  will untap it, else a land drop, else a put creature, else Patron of the Moon. */
export function wayToPutALand(game: AesiGame): Way | null {
  const permanents = game.readyPutters();
  // Budoka flips at 10 lands (losing the ability): use it last
  permanents.sort(
    (permanent, otherPermanent) =>
      +(permanent.card.name === BUDOKA) -
      +(otherPermanent.card.name === BUDOKA),
  );
  if (permanents.length && game.hasUntapper())
    return { kind: 'putter', permanent: permanents[0] };
  if (game.canDrop()) return { kind: 'drop' };
  if (permanents.length) return { kind: 'putter', permanent: permanents[0] };
  if (game.isOnBattlefield(PATRON) && game.canPay(new Cost(1)))
    return { kind: 'patron' };
  return null;
}

/** Which land from hand to play: a basic we need the colour of, fetch lands when the mana can wait. */
export function landToPut(game: AesiGame, lands: CardDef[]): CardDef {
  const want = game.wantColour();
  const needNow = game.needManaNow();
  const score = (card: CardDef): number => {
    const i = card.land!;
    let score = 0;
    if (i.special === 'wilds')
      score = needNow ? 2 : 7; // two landfall triggers, but the basic is tapped
    else if (i.special === 'chamber')
      score = game
        .landsOnBattlefield()
        .some((permanent) => permanent.land!.basic)
        ? needNow
          ? 1
          : 5
        : -5;
    else if (i.basic) score = 6 + (BASIC_COL[card.name] === want ? 1.5 : 0);
    else if (i.mana === 'A' || (i.mana.length === 3 && i.mana[1] === '/'))
      score = 7.5; // a dual land makes the colour we need
    else score = 3; // colourless lands
    if (
      i.special !== 'wilds' &&
      i.special !== 'chamber' &&
      game.entersTapped(card)
    )
      score += needNow ? -6 : 0.5;
    return score;
  };
  return firstMax(lands, score);
}

export function colourWeWant(game: AesiGame): string {
  let blueNeeded = 0,
    greenNeeded = 0;
  for (const card of [...game.hand, ...game.command]) {
    blueNeeded += card.cost.blue;
    greenNeeded += card.cost.green;
  }
  let blueSources = 0,
    greenSources = 0;
  for (const permanent of game.landsOnBattlefield()) {
    const kind = game.manaSourceKind(permanent, true) ?? '';
    if (kind === 'U' || kind === 'GU' || kind === 'FGU' || kind === 'A')
      blueSources++;
    if (kind === 'G' || kind === 'GU' || kind === 'FGU' || kind === 'A')
      greenSources++;
  }
  if (blueSources === 0 && blueNeeded) return 'U';
  if (greenSources === 0 && greenNeeded) return 'G';
  return (blueNeeded + 1) / (blueSources + 1) >=
    (greenNeeded + 1) / (greenSources + 1)
    ? 'U'
    : 'G';
}

/** Play one land from hand (the best way, or the given one). */
export function putLandThatWay(
  game: AesiGame,
  way: Way | null = null,
  otherCard: CardDef | null = null,
): boolean {
  const lands = game.landsInHand();
  if (!lands.length) return false;
  const chosenWay = way ?? game.landWay();
  if (!chosenWay) return false;
  if (chosenWay.kind === 'patron') {
    if (!game.pay(new Cost(1))) return false;
    const landsToPlay = lands
      .slice()
      .sort(
        (card, anotherCard) =>
          +(anotherCard.land!.special === 'wilds') -
          +(card.land!.special === 'wilds'),
      )
      .slice(0, 2);
    game.say('Patron of the Moon: two lands onto the battlefield tapped');
    for (const landToPlay of landsToPlay)
      if (game.hand.includes(landToPlay))
        game.putLand(landToPlay, 'hand', 'Patron', true);
    return true;
  }
  const land = otherCard ?? game.chooseLand(lands);
  if (chosenWay.kind === 'drop') game.dropsUsed += 1;
  else {
    chosenWay.permanent.tapped = true;
    if (
      chosenWay.permanent.card.name === BUDOKA &&
      game.landsOnBattlefield().length + 1 >= 10
    ) {
      chosenWay.permanent.transformed = true; // flips into Dokai, Weaver of Life
      game.say('Budoka Gardener flips (10 lands)');
    }
  }
  game.putLand(
    land,
    'hand',
    chosenWay.kind === 'drop'
      ? 'play land'
      : `${chosenWay.permanent.card.name.split(',')[0]} puts`,
  );
  return true;
}

/** Case of the Locked Hothouse solved: play lands and cast creatures / enchantments from the top of the
 *  library. (A fixed step, not a choice: the planner's copies shuffle the library, so their choices
 *  mustn't depend on the top card.) */
export function playLandsFromTopWithCase(game: AesiGame): void {
  const permanent = game.findPermanent(CASE);
  if (!permanent || !permanent.transformed) return;
  for (
    let i = 0;
    i < 20 && game.library.length > game.libraryCardsToKeep();
    i++
  ) {
    const top = game.library[0];
    if (top.land !== null && game.canDrop()) {
      game.dropsUsed += 1;
      game.putLand(top, 'library', 'play land from the top (Case)');
    } else if (
      !game.epic &&
      top.land === null &&
      (top.isCreature || top.types.has('enchantment')) &&
      !HOLD.has(top.name) &&
      game.battlefieldValue(top) >= 50 &&
      !(top.types.has('legendary') && game.isOnBattlefield(top.name)) &&
      game.canPay(game.effectiveCost(top))
    ) {
      castFromTopOfLibrary(game, top);
    } else return;
  }
}

/** A land enters from hand or library. Fetch lands crack at once (two landfall triggers, the basic
 *  enters tapped). Simic Growth Chamber returns a land. */
export function putLandOntoBattlefield(
  game: AesiGame,
  card: CardDef,
  from: 'hand' | 'library',
  how: string,
  tapped = false,
): Permanent | null {
  game.takeCardIfThere(card, from);
  return placeLand(game, card, how, tapped);
}

/** A land already taken from its zone enters (a land search took it from the library). */
export function placeLand(
  game: AesiGame,
  card: CardDef,
  how: string,
  tapped = false,
): Permanent | null {
  const landInfo = card.land!;
  if (landInfo.special === 'wilds') {
    game.putCard(card, 'graveyard');
    game.say(`${how}: ${card.name} (cracked)`);
    game.onLandEnter(new Permanent(card, landInfo), true);
    game.fetchBasic({
      tapped: !(card.name === PASSAGE && game.landsOnBattlefield().length >= 3),
    });
    return null;
  }
  const permanent = new Permanent(
    card,
    landInfo,
    tapped || game.entersTapped(card),
  );
  permanent.sick = true; // entered game turn (matters only when lands are creatures)
  game.putOntoBattlefield(permanent);
  game.say(`${how}: ${card.name}${permanent.tapped ? ' (tapped)' : ''}`);
  game.onLandEnter(permanent, false);
  if (landInfo.special === 'chamber') game.chamberBounce(permanent);
  return permanent;
}

/** Simic Growth Chamber: return a land (a tapped basic; tap an untapped one for mana first). */
export function returnLandForGrowthChamber(
  game: AesiGame,
  self: Permanent,
): void {
  const others = game
    .landsOnBattlefield()
    .filter(
      (permanent) =>
        permanent !== self && permanent.land!.special !== 'chamber',
    );
  let landToReturn: Permanent | null = null;
  const loop = game.hasUntapper() && findLoopPutter(game) !== null; // returning itself sets up the Retreat loop
  if (others.length && !loop) {
    landToReturn = firstMax(
      others,
      (permanent) =>
        (permanent.tapped ? 2 : 0) + (permanent.land!.basic ? 1 : 0),
    );
    if (!landToReturn.tapped && game.manaSourceKind(landToReturn))
      game.tap(landToReturn, 'N');
  } else landToReturn = self;
  game.takeFromBattlefieldIfThere(landToReturn);
  game.putCard(landToReturn.card, 'hand');
  game.say(`${self.card.name} returns`, landToReturn.card);
}
