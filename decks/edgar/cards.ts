/** The cards of the Edgar Markov deck that have rules of their own, and the facts about them. */
import * as C from '../../engine/cards/cards';
import {
  CardDef,
  makeArtifactToken,
  makeToken,
} from '../../engine/cards/cards';

export const EDGAR = 'Edgar Markov';
export const YAHENNI = 'Yahenni, Undying Partisan';
export const PITILESS_PONTIFF = 'Pitiless Pontiff';
export const EVERETH = 'Evereth, Viceroy of Plunder';
export const BLOODLINE_KEEPER = 'Bloodline Keeper';
export const VANQUISHERS_BANNER = "Vanquisher's Banner";
export const BARON_BERTRAM = 'Baron Bertram Graywater';
export const LEGIONS_LANDING = "Legion's Landing";
export const SKULLCLAMP = 'Skullclamp';
export const NINE_LIVES_FAMILIAR = 'Nine-Lives Familiar';

export const TOKENS = {
  /** Edgar's eminence and Bloodline-less Vampire tokens: no lifelink. */
  vampire: makeToken('Vampire', 1, 1, 'black'),
  /** Preacher of the Schism, Legion's Landing, Baron Bertram, Elenda. */
  lifelinkVampire: makeToken('Vampire', 1, 1, 'white', ['lifelink']),
  /** Bloodline Keeper's tokens. */
  flyingVampire: makeToken('Vampire', 2, 2, 'black', ['flying']),
  shapeshifter: makeToken('Shapeshifter', 3, 2),
  army: makeToken('Zombie Army', 0, 0, 'black'),
  servo: makeArtifactToken('Servo', 1, 1),
};

/** Other Vampires you control get +1/+1. */
export const VAMPIRE_LORDS = new Set([
  'Legion Lieutenant',
  'Markov Baron',
  'Stromkirk Captain',
  'Captivating Vampire',
]);

/** How much we want each card on the battlefield (casting order, discards, the planner's score). */
export const VALUE: Record<string, number> = {
  'Sol Ring': 100,
  [EDGAR]: 95,
  'Blood Artist': 86,
  [EVERETH]: 84,
  'Cruel Celebrant': 82,
  [SKULLCLAMP]: 82,
  [BLOODLINE_KEEPER]: 82,
  'Arcane Signet': 80,
  'Vengeful Bloodwitch': 80,
  'Susurian Voidborn': 80,
  'Cordial Vampire': 78,
  'Legion Lieutenant': 78,
  'Stromkirk Captain': 76,
  'Markov Baron': 76,
  'Marionette Apprentice': 76,
  'Elenda, the Dusk Rose': 74,
  [BARON_BERTRAM]: 72,
  'Preacher of the Schism': 72,
  "Commander's Sphere": 70,
  'Fellwar Stone': 70,
  'Viscera Seer': 70,
  'Arnyn, Deathbloom Botanist': 70,
  'Mayhem Devil': 70,
  'Carmen, Cruel Skymarcher': 70,
  'Captivating Vampire': 70,
  "Ashnod's Altar": 66,
  'Phyrexian Altar': 66,
  'Vampire Nighthawk': 66,
  'Welcoming Vampire': 66,
  'Emeritus of Woe': 66,
  'Phyrexian Arena': 66,
  [LEGIONS_LANDING]: 64,
  'Indulgent Aristocrat': 64,
  'Black Market Connections': 62,
  'Pitiless Plunderer': 62,
  'Pawn of Ulamog': 62,
  'Forerunner of the Legion': 62,
  'Sceptre of Eternal Glory': 60,
  [NINE_LIVES_FAMILIAR]: 60,
  'Pitiless Pontiff': 58,
  'Scheming Silvertongue': 58,
  'Vampiric Rites': 55,
  'Vampire Gourmand': 55,
  'Keen Duelist': 55,
  'Master of Dark Rites': 55,
  'Clavileño, First of the Blessed': 55,
  'Vampire of the Dire Moon': 50,
  'Falkenrath Pit Fighter': 48,
  [VANQUISHERS_BANNER]: 48,
  'Gas Guzzler': 45,
  'Dreadhorde Invasion': 40,
};

/** Removal and cards that do nothing in a goldfish game (never cast, the first to discard). */
export const HOLD = new Set([
  'Swords to Plowshares',
  'Feed the Swarm',
  'New Blood',
  'Kindred Dominance',
  'Blasphemous Act',
  'Saw in Half',
  'Culling the Weak',
  'Songs of the Damned',
]);

const vampireCache = new Map<CardDef, boolean>();
/** Is this card or token a Vampire? (The engine's type set only holds card types, not subtypes.) */
export function isVampire(card: CardDef): boolean {
  let isVampireCard = vampireCache.get(card);
  if (isVampireCard === undefined) {
    isVampireCard = card.isToken
      ? card.name === 'Vampire'
      : (C.cardDatabase()[card.name]?.type_line ?? '').includes('Vampire');
    vampireCache.set(card, isVampireCard);
  }
  return isVampireCard;
}

// every card this file has rules for (lands, rocks and plain draw spells are engine facts)
C.registerKnown([
  ...Object.keys(VALUE),
  ...HOLD,
  'Corrupted Conviction',
  'Diabolic Intent',
  'Beseech the Mirror',
  'Dark Ritual',
]);
