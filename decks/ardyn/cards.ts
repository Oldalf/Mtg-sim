/** Ardyn, the Usurper's deck: card names, values, the Demon check. The rules are in game.ts. */
import * as C from '../../engine/cards/cards';
import { CardDef, hasCreatureType } from '../../engine/cards/cards';

export const ARDYN = 'Ardyn, the Usurper';
export const ROAMING_THRONE = 'Roaming Throne';
export const BLOODLETTER = 'Bloodletter of Aclazotz';
export const EXQUISITE_BLOOD = 'Exquisite Blood';
export const VILIS = 'Vilis, Broker of Blood';

/** Starscourge's token copies: 5/5 black Demons named after the card they copy (so their own triggers work). */
export const STARSCOURGE_COPIES = new WeakSet<CardDef>();

export function isDemon(card: CardDef): boolean {
  return STARSCOURGE_COPIES.has(card) || hasCreatureType(card, 'Demon');
}

/** How much the AI wants each card on the battlefield (the rest: 40 for a creature, 30 otherwise). */
export const VALUE: Record<string, number> = {
  [ARDYN]: 95,
  'Sol Ring': 90,
  'Arcane Signet': 75,
  'Jet Medallion': 72,
  "Bontu's Monument": 74,
  "Urza's Incubator": 74,
  "Herald's Horn": 70,
  'Heartless Summoning': 60,
  'Ancient Cellarspawn': 72,
  'Crypt Ghast': 80,
  'Nirkana Revenant': 78,
  'Gauntlet of Power': 76,
  'Caged Sun': 74,
  'Throne of Eldraine': 70,
  'Magus of the Coffers': 55,
  'The Soul Stone': 60,
  'Thought Vessel': 60,
  [ROAMING_THRONE]: 80,
  [BLOODLETTER]: 82,
  [EXQUISITE_BLOOD]: 78,
  'Bloodthirsty Conqueror': 80,
  [VILIS]: 84,
  'Gray Merchant of Asphodel': 82,
  'Rune-Scarred Demon': 84,
  'Burning-Rune Demon': 78,
  'Demonlord Belzenlok': 78,
  'Archfiend of Despair': 84,
  'Bloodgift Demon': 76,
  'Indulgent Tormentor': 74,
  'Harvester of Souls': 72,
  'Sheoldred, Whispering One': 80,
  'Lord of the Void': 74,
  'Reaper from the Abyss': 72,
  'Archfiend of Depravity': 74,
  'Valgavoth, Terror Eater': 80,
  'Ob Nixilis, Unshackled': 72,
  "K'rrik, Son of Yawgmoth": 66,
  "Taborax, Hope's Demise": 58,
  Venomcrawler: 56,
  'Disciple of Bolas': 55,
  'Sower of Discord': 70,
  'Rakshasa Debaser': 70,
  'Phyrexian Arena': 70,
  'Unholy Annex': 72,
  'Solemn Simulacrum': 62,
  'Burnished Hart': 45,
  'Blood Speaker': 45,
  'Varragoth, Bloodsky Sire': 45,
  'Liliana of the Dark Realms': 55,
  'Expedition Map': 30,
};

/** Cards never cast in a goldfish game: removal (the pod uses it as answers). */
export const HOLD = new Set([
  'Fell the Profane',
  'Defile',
  'Flare of Malice',
  'Saw in Half',
  "Sheoldred's Edict",
  'Soul Shatter',
  'Blasphemous Edict',
  'Kindred Dominance',
  'Malakir Rebirth',
  'Dark Ritual', // the engine's ritual candidates use it
]);

// (not the rocks: the engine finds a rock by its text only when no deck claims the card)
const ROCKS_BY_TEXT = new Set(['Thought Vessel', 'The Soul Stone']);
C.registerKnown([
  ...Object.keys(VALUE).filter((name) => !ROCKS_BY_TEXT.has(name)),
  ...HOLD,
  'Will of the Abzan',
  'Demonic Counsel',
]);
