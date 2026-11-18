/**
 * Spells whose rules hold in any deck: draw, scry and "look at the top cards" spells, rituals, untap spells and
 * tutors. GameCore.resolve asks these first; a card they don't know goes on to the other topic files and then to the
 * deck's resolveOther. Which card to keep or fetch is the deck's choice (cardValue, discardValue, tutorTarget).
 */
import * as Facts from '../cards/card-facts';
import * as C from '../cards/cards';
import { CardDef } from '../cards/cards';
import type { GameCore } from './game-core';
import { Permanent } from './game-types';
import { UNTAP, isSourceOfClass } from './search-mana';
import { firstMin, sortDesc } from '../util/lists';

/** Draw, scry and "look at the top cards" spells. Returns false if this isn't one of them. */
export function resolveCardSelection(
  game: GameCore,
  otherCard: CardDef,
  fromGraveyard: boolean,
): boolean {
  switch (otherCard.name) {
    case 'Brainstorm': {
      game.draw(3);
      for (let i = 0; i < Math.min(2, game.hand.length); i++) {
        const card = firstMin(
          game.hand,
          (anotherCard) =>
            game.cardValue(anotherCard) +
            (game.cardsTheKillLineNeeds.has(anotherCard.name) ? 1000 : 0),
        );
        game.takeCard(card, 'hand');
        game.putCardsOnTopOfLibrary([card]);
      }
      return true;
    }
    case 'Consider':
      game.scry(1, true);
      game.draw(1);
      return true;
    case 'Opt':
      game.scry(1);
      game.draw(1);
      return true;
    case 'Chart a Course':
      game.draw(2);
      if (!game.attacked) game.discard(1);
      return true;
    case 'Read the Bones':
      game.scry(2);
      game.draw(2);
      game.myLife -= 2;
      return true;
    case 'Pieces of the Puzzle':
    case 'Fact or Fiction':
      resolveTopFiveSplit(game, otherCard.name);
      return true;
    case 'Ponder':
      ponder(game);
      return true;
    case 'Preordain':
      game.scry(2);
      game.draw(1);
      return true;
    case 'Deep Analysis':
    case "Night's Whisper":
    case "Archmage's Charm":
      game.draw(2);
      return true;
    case 'Diresight':
      game.scry(2, true);
      game.draw(2);
      return true;
    case 'Stock Up':
      stockUp(game);
      return true;
    case 'See the Truth':
      seeTheTruth(game, fromGraveyard);
      return true;
    case 'Energybending':
      game.isEnergybendingActive = true;
      game.draw(1);
      return true;
    case 'Focus the Mind':
      game.draw(3);
      game.discard(1);
      return true;
    case 'Frantic Search':
      game.draw(2);
      game.discard(2);
      game.untapLands(3);
      return true;
    default:
      return false;
  }
}

/** Look at the top three: shuffle them away if none is good, otherwise put them back best first. Then draw. */
function ponder(game: GameCore): void {
  const top = game.library.slice(0, 3);
  if (top.length && Math.max(...top.map((card) => game.cardValue(card))) < 40)
    game.shuffle();
  else {
    game.takeTopCardsOfLibrary(3);
    sortDesc(top, (card) => game.cardValue(card));
    game.putCardsOnTopOfLibrary(top);
  }
  game.draw(1);
}

/** Take the two best of the top five; the rest go to the bottom. */
function stockUp(game: GameCore): void {
  const top = game.takeTopCardsOfLibrary(5);
  sortDesc(top, (card) => game.cardValue(card));
  for (const card of top.slice(0, 2)) game.putCard(card, 'hand');
  for (const card of top.slice(2)) game.putCard(card, 'library');
}

/** Look at the top three: from the graveyard all go to hand, otherwise the best one does and the rest go to the bottom. */
function seeTheTruth(game: GameCore, fromGraveyard: boolean): void {
  const top = game.takeTopCardsOfLibrary(3);
  if (fromGraveyard || !top.length)
    for (const card of top) game.putCard(card, 'hand');
  else {
    sortDesc(top, (card) => game.cardValue(card));
    game.putCard(top[0], 'hand');
    for (const card of top.slice(1)) game.putCard(card, 'library');
  }
}

/** Looks at the top five cards and keeps some in hand, the rest go to the graveyard. */
function resolveTopFiveSplit(
  game: GameCore,
  spell: 'Pieces of the Puzzle' | 'Fact or Fiction',
): void {
  const top = game.takeTopCardsOfLibrary(5);
  let keep: CardDef[];
  if (spell === 'Pieces of the Puzzle') {
    // up to two instants/sorceries to hand, the rest to the graveyard
    keep = sortDesc(
      top.filter((card) => card.isInstantOrSorcery),
      (card) => game.cardValue(card),
    ).slice(0, 2);
  } else {
    // opponent splits: the best card alone vs the other four
    sortDesc(top, (card) => game.cardValue(card));
    const rest = top.slice(1);
    keep =
      top.length &&
      game.cardValue(top[0]) >
        rest.reduce((total, card) => total + game.cardValue(card), 0) * 0.6
        ? top.slice(0, 1)
        : rest;
  }
  for (const card of top) {
    if (keep.includes(card)) game.putCard(card, 'hand');
    else game.toGraveyard(card, true);
  }
}

/** Rituals, untap spells and tutors. Returns false if this isn't one of them. */
export function resolveManaOrTutor(
  game: GameCore,
  card: CardDef,
  mode: string | null,
): boolean {
  switch (card.name) {
    case 'Snap':
      game.untapLands(2);
      return true;
    case 'Dark Ritual':
      game.pool.B += 3;
      return true;
    case 'Cabal Ritual':
      game.pool.B += game.cabalMana();
      return true;
    case 'Drain Power':
      game.pool.C += game.drainPowerMana();
      return true;
    case 'Energy Tap': {
      const target = game.energyTapTarget();
      if (target) {
        target.tapped = true;
        game.pool.C += target.card.manaValue;
      }
      return true;
    }
    case 'Rain of Filth':
      sacrificeAllLandsForMana(game);
      return true;
    case 'High Tide':
      game.highTidesThisTurn += 1;
      return true;
    case 'Bubbling Muck':
      game.muck += 1;
      return true;
    case 'Diabolic Tutor':
    case 'Demonic Tutor':
      game.doTutor(() => true, false);
      return true;
    case 'Vampiric Tutor':
      game.doTutor(() => true, true);
      game.loseLife(2);
      return true;
    case 'Demonic Counsel':
      game.doTutor((otherCard) => C.hasCreatureType(otherCard, 'Demon'), false);
      return true;
    case 'Solve the Equation':
      game.doTutor((otherCard) => otherCard.isInstantOrSorcery, false);
      return true;
    case 'Personal Tutor':
      game.doTutor((otherCard) => otherCard.isSorcery, true);
      return true;
    case 'Waterlogged Teachings':
      game.doTutor((otherCard) => otherCard.isInstant, false);
      return true;
    case 'Merchant Scroll':
      game.doTutor(
        (otherCard) => otherCard.isInstant && otherCard.isBlue,
        false,
      );
      return true;
    case 'Insatiable Avarice':
      if (mode === 'tutor' || mode === 'both') game.doTutor(() => true, true);
      if (mode === 'draw' || mode === 'both') {
        game.draw(3);
        game.myLife -= 3;
      }
      return true;
    default:
      return false;
  }
}

/** Rain of Filth: tap each untapped land for its mana, then sacrifice every land for {B}. */
function sacrificeAllLandsForMana(game: GameCore): void {
  const lands = game.landsOnBattlefield();
  const filterKindOf = (land: Permanent): string | null => {
    const kind = game.manaSourceKind(land);
    return Facts.isFilterKind(kind) ? kind : null;
  };
  for (const land of lands)
    if (!land.tapped && filterKindOf(land) === null) game.tap(land, 'B');
  // a filter land last, fed a mana the others made (colourless, then its second colour, as the kill search counts)
  for (const land of lands) {
    const filterKind = filterKindOf(land);
    if (land.tapped || filterKind === null) continue;
    const [firstColour, secondColour] = Facts.FILTER_COLOURS[filterKind];
    const pool = game.pool as unknown as Record<string, number>;
    if (pool.C + pool[firstColour] + pool[secondColour] > 0)
      game.tap(land, firstColour);
  }
  for (const land of lands) {
    game.sacrifice(land);
    game.pool.B += 1;
  }
}

/** Untaps up to count tapped lands (see GameCore.untapLands). */
export function untapBestLands(game: GameCore, count: number): void {
  const tapped = game.battlefield.filter(
    (permanent) => permanent.land !== null && permanent.tapped,
  );
  // the lands that make the most first (High Tide's and Bubbling Muck's bonus), then one that makes two colours
  const manaMade = (permanent: Permanent) =>
    1 +
    (game.islandTyped(permanent) ? game.highTidesThisTurn : 0) +
    (game.swampTyped(permanent) ? game.muck : 0);
  const makesTwoColours = (permanent: Permanent) => {
    const kind = game.manaSourceKind(permanent) ?? '';
    return kind === 'A' || kind === 'UB' || kind === 'GU' || kind.includes('/');
  };
  const key = (permanent: Permanent) =>
    -2 * manaMade(permanent) + (makesTwoColours(permanent) ? 0 : 1);
  tapped.sort((first, second) => key(first) - key(second));
  for (const otherPermanent of landsToUntap(game, tapped, count))
    otherPermanent.tapped = false;
}

/** The lands an untap effect untaps, from the tapped ones best first. A search that planned the untap (a kill line it
 *  found, GameCore.plannedPayments) may name others. */
function landsToUntap(
  game: GameCore,
  tappedLandsBestFirst: Permanent[],
  count: number,
): Permanent[] {
  const index = game.plannedPayments.findIndex(
    (payment) => payment.cost === UNTAP,
  );
  if (index < 0) return tappedLandsBestFirst.slice(0, count);
  const [payment] = game.plannedPayments.splice(index, 1);
  const chosen: Permanent[] = [];
  for (const landClass of payment.taps) {
    const land = tappedLandsBestFirst.find(
      (permanent) =>
        !chosen.includes(permanent) &&
        isSourceOfClass(game, permanent, landClass),
    );
    if (land) chosen.push(land);
  }
  // anything the plan didn't cover (the real game has other tapped lands) is untapped the usual way
  for (const land of tappedLandsBestFirst)
    if (
      chosen.length < Math.min(count, payment.taps.length) &&
      !chosen.includes(land)
    )
      chosen.push(land);
  return chosen;
}
