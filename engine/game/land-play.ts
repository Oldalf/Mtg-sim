/**
 * Lands: whether a land enters tapped by its real text, which land to play this turn and playing it (Evolving Wilds
 * is cracked at once, a bounce land returns a land). GameCore's entersTapped and playLand call these. A deck steers
 * the choice with landWant and landBias, and hears of every land with onLandEnter (landfall).
 */
import { CardDef } from '../cards/cards';
import { LandInfo } from '../cards/card-facts';
import type { GameCore } from './game-core';
import { Permanent } from './game-types';
import { COLOURS } from './mana-payment';
import { firstMax } from '../util/lists';

const BASIC_OF: Record<string, string> = {
  W: 'Plains',
  U: 'Island',
  B: 'Swamp',
  R: 'Mountain',
  G: 'Forest',
};

/** How good a land that makes this kind of mana is to play (A = any colour, UB = blue and black, F = fetch land). */
const LAND_MANA_SCORE: Record<string, number> = {
  A: 6,
  UB: 7,
  F: 4,
  U: 5,
  B: 5,
  G: 5,
  W: 5,
  R: 5,
  C: 3,
  '': 4,
};

/** A land card's land side (a modal double-faced card has it on the back). */
const landInfoOf = (card: CardDef): LandInfo => (card.land ?? card.mdfcLand)!;

/** Does this land enter tapped right now, by its text? (See GameCore.entersTapped.) */
export function entersTappedByItsText(game: GameCore, card: CardDef): boolean {
  const landInfo = (card.land ?? card.mdfcLand)!;
  const etbRule = landInfo.etb ?? 'untapped';
  if (etbRule === 'tapped') return true;
  const flag = (land: LandInfo | null, landType: string) =>
    !!(land && (land as unknown as Record<string, boolean>)[landType]);
  const lands = game.landsOnBattlefield();
  if (etbRule === 'catacomb')
    return !lands.some(
      (permanent) =>
        permanent.land && (permanent.land.island || permanent.land.swamp),
    );
  if (etbRule === 'hollow')
    return (
      lands.filter((permanent) => permanent.land && permanent.land.basic)
        .length < 2
    );
  if (etbRule.startsWith('reveal:')) {
    const types = etbRule.slice(7).split(',');
    return !game.hand.some(
      (otherCard) =>
        otherCard !== card &&
        otherCard.land !== null &&
        types.some((landType) => flag(otherCard.land, landType)),
    );
  }
  const cond = landInfo.cond;
  if (!cond) return false;
  if (cond.startsWith('check:')) {
    const types = cond.slice(6).split(',');
    return !lands.some((permanent) =>
      types.some((landType) => flag(permanent.land, landType)),
    );
  }
  if (cond === 'fast') return lands.length > 2;
  if (cond === 'slow') return lands.length < 2;
  if (cond === 'basics2')
    return (
      lands.filter((permanent) => permanent.land && permanent.land.basic)
        .length < 2
    );
  return false;
}

/** Plays the best land from hand, if we haven't played one this turn (or it is an additional land drop: Explore). */
export function playBestLand(game: GameCore, isAdditionalDrop = false): void {
  if (game.landPlayed && !isAdditionalDrop) return;
  const lands = landsWeCouldPlay(game);
  if (!lands.length) return;
  const landsOnBattlefield = game.landsOnBattlefield().length;
  const needManaNow = needsManaThisTurn(game);

  const land = firstMax(lands, (candidate) =>
    scoreLandToPlay(game, candidate, landsOnBattlefield, needManaNow),
  );
  game.takeCard(land, 'hand');
  game.landPlayed = true;
  const landInfo = { ...landInfoOf(land) };
  if (landInfo.special === 'wilds') {
    crackEvolvingWilds(game, land, landInfo);
    return;
  }
  const permanent = new Permanent(land, landInfo, landEntersTapped(game, land));
  permanent.sick = false;
  game.sayEvent(
    'land',
    'play land',
    land.land !== null ? land : 'Inundated Archive (MDFC)',
    permanent.tapped ? '(tapped)' : '',
  );
  if (landInfo.special === 'bounce') returnLandToHand(game);
  game.putOntoBattlefield(permanent);
  game.onLandEnter(permanent, false);
}

/** The lands in hand. A land-on-the-back-side card counts only when we have no real land and few lands out. */
function landsWeCouldPlay(game: GameCore): CardDef[] {
  const lands = game.hand.filter((card) => card.land !== null);
  const mdfcLands = game.hand.filter((card) => card.mdfcLand);
  if (!lands.length && mdfcLands.length && game.landsOnBattlefield().length < 5)
    return mdfcLands;
  return lands;
}

function landEntersTapped(game: GameCore, land: CardDef): boolean {
  return game.entersTapped(land) || landInfoOf(land).special === 'wilds';
}

/** Would a land that enters untapped let us cast a spell we want this turn? (Then a tapped land is bad.) */
function needsManaThisTurn(game: GameCore): boolean {
  const manaAvailable =
    game.battlefield.filter(
      (permanent) => !permanent.tapped && game.manaSourceKind(permanent),
    ).length +
    game.pool.U +
    game.pool.B +
    game.pool.C +
    game.pool.S;
  for (const card of [...game.hand, ...game.command]) {
    if (card.land !== null) continue;
    // only spells the AI would actually cast proactively (not counters, rituals, combo sorceries)
    const [wantScore, cost] = game.landWant(card);
    if (wantScore >= 50 && cost.manaValue === manaAvailable + 1) return true;
  }
  return false;
}

/** How good a land is to play now (higher is better): its mana, the colour we need, and whether it enters tapped. */
function scoreLandToPlay(
  game: GameCore,
  land: CardDef,
  landsOnBattlefield: number,
  needManaNow: boolean,
): number {
  const info = landInfoOf(land);
  let score =
    LAND_MANA_SCORE[
      info.mana.length === 3 && info.mana[1] === '/' ? 'A' : (info.mana ?? '')
    ] ?? 3;
  if (
    info.mana.length === 1 &&
    COLOURS.includes(info.mana) &&
    info.mana === colourNeededFromNewLand(game)
  )
    score += 1.5;
  if (info.special === 'bounce') score = landsOnBattlefield >= 1 ? 8 : -5;
  if (landEntersTapped(game, land)) score += needManaNow ? -6 : 4;
  if (land.mdfcLand) score -= 3;
  score += game.landBias(land);
  return score;
}

/** The colour we most want the next land to make. */
function colourNeededFromNewLand(game: GameCore): string {
  if (
    game.colors.length === 2 &&
    game.colors[0] === 'U' &&
    game.colors[1] === 'B'
  )
    return colourNeededByBlueBlackDeck(game);
  return colourNeededByOtherDeck(game);
}

function colourNeededByBlueBlackDeck(game: GameCore): string {
  const sourcesOf = (kinds: string[]) =>
    game.battlefield.filter((permanent) =>
      kinds.includes(game.manaSourceKind(permanent, true) ?? ''),
    ).length;
  const blueSources = sourcesOf(['U', 'A', 'UB', 'F']);
  const blackSources = sourcesOf(['B', 'A', 'UB', 'F']);
  const blackNeeded = game.hand.some((card) => card.cost.black);
  return (blackSources === 0 && blackNeeded) ||
    (blueSources >= blackSources + 3 && blackNeeded)
    ? 'B'
    : 'U';
}

/** First, a colour that lets us cast a spell this turn with the new land (e.g. a turn-1 Llanowar Elves);
 *  otherwise the colour with the most pips in hand per source we already have. */
function colourNeededByOtherDeck(game: GameCore): string {
  const pipsOf: Record<string, (card: CardDef) => number> = {
    W: (card) => card.cost.white,
    U: (card) => card.cost.blue,
    B: (card) => card.cost.black,
    R: (card) => card.cost.red,
    G: (card) => card.cost.green,
  };
  const makesColour = (permanent: Permanent, colour: string) => {
    const kind = game.manaSourceKind(permanent, true) ?? '';
    return kind === colour || kind === 'A';
  };
  const manaWithNewLand =
    game.battlefield.filter(
      (permanent) => !permanent.tapped && game.manaSourceKind(permanent),
    ).length + 1;
  const castable = game.hand
    .filter(
      (card) =>
        card.land === null &&
        card.manaValue > 0 &&
        card.manaValue <= manaWithNewLand,
    )
    .sort(
      (first, second) =>
        second.manaValue - first.manaValue ||
        game.cardValue(second) - game.cardValue(first),
    );
  for (const spell of castable) {
    const coloursNeeded = game.colors.filter(
      (colour) => pipsOf[colour](spell) > 0,
    );
    const missing = coloursNeeded.filter(
      (colour) =>
        !game.battlefield.some((permanent) => makesColour(permanent, colour)),
    );
    if (missing.length === 1) return missing[0];
  }
  let bestColour = game.colors[0];
  let bestPipsPerSource = -1;
  for (const colour of game.colors) {
    const pips = game.hand.reduce((sum, card) => sum + pipsOf[colour](card), 0);
    const sources = game.battlefield.filter((permanent) => {
      const kind = game.manaSourceKind(permanent, true) ?? '';
      return (
        makesColour(permanent, colour) ||
        (kind.length === 2 && kind.includes(colour))
      );
    }).length;
    const pipsPerSource = pips / (sources + 1);
    if (pipsPerSource > bestPipsPerSource) {
      bestColour = colour;
      bestPipsPerSource = pipsPerSource;
    }
  }
  return bestColour;
}

/** Evolving Wilds: sacrifice it and put a basic land onto the battlefield tapped. */
function crackEvolvingWilds(
  game: GameCore,
  wilds: CardDef,
  wildsInfo: LandInfo,
): void {
  const colour = colourNeededFromNewLand(game);
  const basic =
    game.library.find((card) => card.name === BASIC_OF[colour]) ??
    game.library.find((card) => card.land && card.land.basic) ??
    null;
  game.putCard(wilds, 'graveyard');
  if (basic) {
    game.takeCard(basic, 'library');
    game.shuffle();
    const basicPermanent = new Permanent(basic, basic.land, true);
    game.putOntoBattlefield(basicPermanent);
    game.onLandEnter(new Permanent(wilds, wildsInfo), true);
    game.onLandEnter(basicPermanent, false);
  }
  game.sayEvent('land', 'play Evolving Wilds -> crack for', basic ?? 'None');
}

/** A land that returns another land to hand (a bounce land): returns the best one, preferring a nonbasic and a tapped
 *  one. An untapped one is tapped for mana first, so the mana isn't lost. */
function returnLandToHand(game: GameCore): void {
  const others = game.battlefield.filter(
    (permanent) => permanent.land !== null,
  );
  if (!others.length) return;
  others.sort(
    (first, second) =>
      +!first.land!.basic - +!second.land!.basic ||
      +!first.tapped - +!second.tapped,
  );
  const returned = others[0];
  if (!returned.tapped && game.manaSourceKind(returned))
    game.tap(returned, 'N');
  game.takeFromBattlefield(returned);
  game.putCard(returned.card, 'hand');
}
