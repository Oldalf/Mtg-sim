/** The cards of the Sam & Frodo deck that have rules of their own, and the facts about them. */
import * as C from '../../engine/cards';
import { CardDef, makeToken } from '../../engine/cards';

export const FRODO = 'Frodo, Adventurous Hobbit';
export const SAM = 'Sam, Loyal Attendant';
export const GOLLUM = 'Gollum, Obsessed Stalker';
/** Archidekt's Ring card: its counter = how many times the Ring has tempted us. */
export const RING_TRACKER = 'The Ring // The Ring Tempts You';

function artifactToken(
  name: string,
  creature = false,
  power = 0,
  toughness = 0,
): CardDef {
  return new CardDef(name, {
    name,
    type_line: `Token Artifact${creature ? ' Creature' : ''} — ${name}`,
    token: true,
    power: creature ? String(power) : null,
    toughness: creature ? String(toughness) : null,
  } as never);
}
export const FOOD = artifactToken('Food');
export const TREASURE = artifactToken('Treasure');
export const CLUE = artifactToken('Clue');
export const TOK = {
  halfling: makeToken('Halfling', 1, 1, 'white'),
  soldier: makeToken('Soldier', 1, 1, 'white', ['lifelink']),
  cat: makeToken('Cat', 1, 1, 'white'),
  goat: makeToken('Goat', 0, 1, 'white'),
  bird: makeToken('Bird', 3, 3, 'white', ['flying']),
  servo: artifactToken('Servo', true, 1, 1),
};
export const ART_TOKENS = new Set([FOOD, TREASURE, CLUE]);

/** How much we want each card on the battlefield (casting order, discards, the planner's score). */
export const VALUE: Record<string, number> = {
  'Sol Ring': 100,
  [SAM]: 90,
  'Sanguine Bond': 88,
  [FRODO]: 84,
  'Arcane Signet': 80,
  'Mirkwood Bats': 80,
  'Marionette Apprentice': 78,
  'Popular Egotist': 76,
  'Susurian Voidborn': 76,
  'Peregrin Took': 76,
  'Academy Manufactor': 75,
  'The Notary Hobbits': 75,
  'Prosperous Innkeeper': 74,
  'Marionette Master': 72,
  'Tireless Provisioner': 72,
  'Tippy-Toe, Terrific Partner': 72,
  'Lobelia, Defender of Bag End': 70,
  'Umbral Collar Zealot': 68,
  "Witch's Oven": 66,
  'Cauldron Familiar': 66,
  'Rosie Cotton of South Lane': 64,
  'Belladonna Took': 64,
  'Pristine Talisman': 64,
  'Birds of Paradise': 64,
  'Prize Pig': 62,
  'Cat Collector': 62,
  'Merry, Warden of Isengard': 62,
  'Gollum, Obsessed Stalker': 60,
  'Mentor of the Meek': 60,
  'Nuka-Cola Vending Machine': 58,
  'Rapacious Guest': 58,
  'Gwaihir, Greatest of the Eagles': 58,
  "Commander's Sphere": 58,
  'Chromatic Lantern': 58,
  'Gilded Goose': 56,
  'Elanor Gardner': 56,
  'Unlucky Cabbage Merchant': 54,
  'The Gaffer': 54,
  'Dawn of Hope': 54,
  'Well of Lost Dreams': 52,
  'Of Herbs and Stewed Rabbit': 52,
  'Savvy Hunter': 52,
  'Trading Post': 50,
  'Meriadoc Brandybuck': 48,
  'Pippin, Warden of Isengard': 48,
  'Farmer Cotton': 60,
  'Shire Shirriff': 40,
  Cultivate: 55,
  Farseek: 55,
  Harmonize: 58,
  "Night's Whisper": 52,
  'Second Harvest': 50,
  'Crypt Incursion': 30,
};
/** Removal: no targets in a goldfish game (held; the first cards to discard). */
export const HOLD = new Set([
  'Anguished Unmaking',
  'Dusk',
  'Fell the Mighty',
  'Go for the Throat',
  'Mortify',
  'Path to Exile',
  'Swords to Plowshares',
  'Toxic Deluge',
  'Supper for Spiders',
]);
export const RAMP_EARLY = new Set([
  'Arcane Signet',
  'Birds of Paradise',
  'Prize Pig',
  'Gilded Goose',
  "Commander's Sphere",
  'Chromatic Lantern',
  'Pristine Talisman',
  'Cultivate',
  'Farseek',
  'Prosperous Innkeeper',
  'Tireless Provisioner',
]);
export const SAGA = 'Of Herbs and Stewed Rabbit';
/** Removal we point at our own Rapacious Guest (it drains its power when it leaves), best first:
 *  Swords gains us that much life, Path gives a basic land (landfall), Anguished Unmaking costs 3 life. */
export const OWN_KILL = [
  'Swords to Plowshares',
  'Path to Exile',
  'Go for the Throat',
  'Mortify',
  'Anguished Unmaking',
];
export const OWN_KILL_EXILES = new Set([
  'Swords to Plowshares',
  'Path to Exile',
  'Anguished Unmaking',
]);

export const HALFLING_CACHE = new Map<CardDef, boolean>();
export function isHalfling(card: CardDef): boolean {
  let isHalflingCard = HALFLING_CACHE.get(card);
  if (isHalflingCard === undefined) {
    isHalflingCard =
      card === TOK.halfling ||
      (C.db()[card.name]?.type_line ?? '').includes('Halfling');
    HALFLING_CACHE.set(card, isHalflingCard);
  }
  return isHalflingCard;
}

// every card this file has rules for (lands, rocks and plain draw spells are engine facts)
C.registerKnown([...Object.keys(VALUE), ...HOLD, FRODO, SAM, 'Dusk // Dawn']);

export const BASIC_COL: Record<string, string> = {
  Plains: 'W',
  Swamp: 'B',
  Forest: 'G',
  Island: 'U',
  Mountain: 'R',
};
