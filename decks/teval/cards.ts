/** Teval, the Balanced Scale's deck: card names, values, tokens. The rules are in game.ts. */
import * as C from '../../engine/cards/cards';
import { CardDef, hasCreatureType, makeToken } from '../../engine/cards/cards';

export const TEVAL = 'Teval, the Balanced Scale';
export const TORMOD = 'Tormod, the Desecrator';
export const TEVALS_JUDGMENT = "Teval's Judgment";
export const SIDISI_BROOD_TYRANT = 'Sidisi, Brood Tyrant';
export const COLOSSAL_GRAVE_REAVER = 'Colossal Grave-Reaver';
export const MULDROTHA = 'Muldrotha, the Gravetide';

export const TOKENS = {
  zombieDruid: makeToken('Zombie Druid', 2, 2, 'black'),
  zombie: makeToken('Zombie', 2, 2, 'black'),
  beast: makeToken('Beast', 4, 4, 'green'),
};

export function isZombie(card: CardDef): boolean {
  return hasCreatureType(card, 'Zombie');
}

/** How much the AI wants each card on the battlefield (the rest: 40 for a creature, 30 otherwise). */
export const VALUE: Record<string, number> = {
  [TEVAL]: 95,
  'Sol Ring': 90,
  'Arcane Signet': 75,
  'Chromatic Lantern': 70,
  'Midnight Clock': 55,
  'Sakura-Tribe Elder': 65,
  'Doubling Season': 82,
  'Parallel Lives': 78,
  [TORMOD]: 78,
  [TEVALS_JUDGMENT]: 80,
  [SIDISI_BROOD_TYRANT]: 80,
  [COLOSSAL_GRAVE_REAVER]: 82,
  [MULDROTHA]: 82,
  'The Scarab God': 84,
  'Endless Ranks of the Dead': 76,
  'Rampaging Baloths': 80,
  'Ob Nixilis, the Fallen': 80,
  'Tatyova, Benthic Druid': 74,
  'Aesi, Tyrant of Gyre Strait': 78,
  'Lumra, Bellow of the Woods': 80,
  "Multani, Yavimaya's Avatar": 74,
  'Nyxbloom Ancient': 80,
  'Sheoldred, Whispering One': 80,
  'Meren of Clan Nel Toth': 76,
  Six: 70,
  'Oversold Cemetery': 66,
  'Phyrexian Reclamation': 64,
  'Ripples of Undeath': 62,
  'Whip of Erebos': 66,
  'Beastmaster Ascension': 66,
  'Demolisher Spawn': 74,
  Wonder: 60,
  'Eternal Witness': 64,
  'Timeless Witness': 60,
  'Lost Monarch of Ifnir': 62,
  'Sidisi, Undead Vizier': 66,
  'Wilhelt, the Rotcleaver': 66,
  Gravecrawler: 40,
  'Underrealm Lich': 55,
  'Lier, Disciple of the Drowned': 55,
  'Ancient Greenwarden': 62,
  'Conduit of Worlds': 50,
  'Hedge Shredder': 50,
  Millikin: 55,
};

/** Cards never cast in a goldfish game: removal and resets (the pod uses removal as answers). */
export const HOLD = new Set([
  'Cyclonic Rift',
  'Damnation',
  "Day's Undoing",
  'Finale of Revelation',
]);

// (not the rocks: the engine finds a rock by its text only when no deck claims the card)
const ROCKS_BY_TEXT = new Set(['Midnight Clock', 'Millikin']);
C.registerKnown([
  ...Object.keys(VALUE).filter((name) => !ROCKS_BY_TEXT.has(name)),
  ...HOLD,
  'Growth Spiral',
  'Demonic Tutor',
  'Vampiric Tutor',
  'Buried Alive',
  'Will of the Sultai',
  'Breach the Multiverse',
]);
