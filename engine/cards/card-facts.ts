/**
 * Card facts that hold in any deck: what a land or rock taps for, which cards reduce costs, which cards are counters,
 * tutors or draw spells. A deck's *roles* (its combo pieces, engines, priorities) live in its own folder and are
 * registered with registerKnown (cards.ts) so the engine knows it has rules for them.
 */

/**
 * mana: W / U / B / R / G (one colour) / A (either of the deck's colours) / C / F (filter: pay 1,
 *       get U+B) / UB, GU (both colours) / "" (none)
 * etb:  untapped | tapped | catacomb (needs an Island/Swamp) | hollow (needs 2 basics)
 */
export interface LandInfo {
  mana: string;
  etb?: string;
  island?: boolean;
  swamp?: boolean;
  forest?: boolean;
  plains?: boolean;
  mountain?: boolean;
  basic?: boolean;
  special?: string; // bounce | wilds
  cycling?: number;
  /** "Enters tapped unless ...", read from the card text: check:forest,island = you control a land of one of
   *  those types; fast = two or fewer other lands; slow = two or more other lands; basics2 = two or more basic
   *  lands (battle lands). Game.entersTapped checks it. */
  cond?: string;
  /** The colours that cost 1 life when this land taps for them ("{T}: Add {G} or {U}. This land deals 1 damage to
   *  you." = "GU"; a pain land's {C} ability is free). */
  pain?: string;
  /** It has a free "{T}: Add {C}." ability (pain lands, Tainted Wood). */
  colourless?: boolean;
  /** Its coloured mana needs a land with this type or subtype ("Activate only if you control a Swamp": swamp). */
  colourIf?: string;
  /** "When this land enters, scry 1." */
  scry?: boolean;
}

export const LANDS: Record<string, LandInfo> = {
  Island: { mana: 'U', island: true, basic: true },
  Swamp: { mana: 'B', swamp: true, basic: true },
  Forest: { mana: 'G', forest: true, basic: true },
  Plains: { mana: 'W', plains: true, basic: true },
  Mountain: { mana: 'R', mountain: true, basic: true },
  'Command Tower': { mana: 'A' },
  'Darkwater Catacombs': { mana: 'F' },
  'Dimir Aqueduct': { mana: 'UB', etb: 'tapped', special: 'bounce' },
  'Drowned Catacomb': { mana: 'A', etb: 'catacomb' },
  'Evolving Wilds': { mana: '', special: 'wilds' },
  'Terramorphic Expanse': { mana: '', special: 'wilds' },
  'Simic Growth Chamber': { mana: 'GU', etb: 'tapped', special: 'chamber' }, // returns a land to hand as it enters
  'Guildless Commons': { mana: 'C2', etb: 'tapped', special: 'chamber' },
  'Fabled Passage': { mana: '', special: 'wilds' }, // (the basic enters untapped with four or more lands)
  'Myriad Landscape': { mana: 'C', etb: 'tapped', special: 'myriad' }, // {2}, T, sac: two basics of one type, tapped
  'Exotic Orchard': { mana: 'A' },
  'Fetid Pools': {
    mana: 'A',
    etb: 'tapped',
    island: true,
    swamp: true,
    cycling: 2,
  },
  'Reliquary Tower': { mana: 'C' },
  'Sunken Hollow': { mana: 'A', etb: 'hollow', island: true, swamp: true },
  "Thespian's Stage": { mana: 'C' },
  'Underground River': { mana: 'A', pain: 'UB', colourless: true },
  'Jidoor, Aristocratic Capital': { mana: 'U', etb: 'tapped' }, // front face; Overture is the adventure
  // Codie (5 colours): three-colour lands make exactly their colours ("W/U/B")
  "Raffine's Tower": {
    mana: 'W/U/B',
    etb: 'tapped',
    island: true,
    swamp: true,
    plains: true,
    cycling: 3,
  },
  "Spara's Headquarters": {
    mana: 'G/W/U',
    etb: 'tapped',
    island: true,
    forest: true,
    plains: true,
    cycling: 3,
  },
  "Ziatora's Proving Ground": {
    mana: 'B/R/G',
    etb: 'tapped',
    swamp: true,
    mountain: true,
    forest: true,
    cycling: 3,
  },
  'Field of the Dead': { mana: 'C', etb: 'tapped' },
  'Gemstone Caverns': { mana: 'C' },
  'Horizon of Progress': { mana: 'A', pain: 'WUBRG' }, // one mana of any type a land you control could produce, 1 life
  "Minamo, School at Water's Edge": { mana: 'U' },
  'Yavimaya, Cradle of Growth': { mana: 'G', forest: true },
  'Volatile Fault': { mana: 'C' },
  'Maze of Ith': { mana: '' },
  'Glacial Chasm': { mana: '', special: 'chasm' }, // never played by the AI (creatures can't attack, 2 life a turn)
};
/** Modal double-faced spells that may be played as a land instead. */
export const MDFC_LAND_BACK: Record<string, LandInfo> = {
  'Waterlogged Teachings': { mana: 'A', etb: 'tapped' },
};
/** card name: [spell name, cost, effect key] */
export const ADVENTURE: Record<string, [string, string, string]> = {
  'Jidoor, Aristocratic Capital': ['Overture', '{4}{U}{U}', 'mill_half_one'],
};
/** Mana rocks: C2 / C / A / F */
export const ROCKS: Record<string, string> = {
  'Sol Ring': 'C2',
  'Arcane Signet': 'A',
  'Dimir Signet': 'F',
  'Fellwar Stone': 'A',
  'Talisman of Dominance': 'A',
  "Bender's Waterskin": 'A',
  "Commander's Sphere": 'A',
  'Chromatic Lantern': 'A',
  'Pristine Talisman': 'C',
};

// cost reducers (+ Voracious Reader, the transformed Curious Homunculus)
export const REDUCE_INSTANT_SORCERY_COST = new Set([
  'Baral, Chief of Compliance',
  'Case of the Ransacked Lab',
  'Mocking Sprite',
  'Thunderclap Drake',
  'Wizards of Thay',
  'Archmage of Runes',
]);
export const REDUCE_NONCREATURE = new Set(['Geist of Saint Thalia']);
export const REDUCE_BLUE = new Set([
  'Nightscape Familiar',
  'Sapphire Medallion',
]);
export const REDUCE_FROM_GRAVEYARD_BY_2 = new Set([
  'Emet-Selch of the Third Seat',
]);

export const COUNTERS = new Set([
  "An Offer You Can't Refuse",
  'Arcane Denial',
  "Archmage's Charm",
  'Counterspell',
  'Dispel',
  'Mana Sculpt',
  'Unwind',
  'Muddle the Mixture',
  'Spell Pierce',
  'Rewind',
]);
/** Creatures that tap for mana (they can't tap the turn they arrive). */
export const MANA_CREATURES: Record<string, string> = {
  'Llanowar Elves': 'G',
  'Elvish Mystic': 'G',
  'Fyndhorn Elves': 'G',
  'Sylvan Caryatid': 'A',
  'Skull Prophet': 'A',
  'Birds of Paradise': 'A',
  'Prize Pig': 'A',
};
/** Creatures that untap lands when they enter (Peregrine Drake 5, Cloud of Faeries 2). */
export const UNTAP_ON_ETB: Record<string, number> = {
  'Peregrine Drake': 5,
  'Cloud of Faeries': 2,
};
export const TUTORS = new Set([
  'Diabolic Tutor',
  'Gifts Ungiven',
  'Insatiable Avarice',
  'Personal Tutor',
  'Solve the Equation',
  'Waterlogged Teachings',
  'Wishclaw Talisman',
]);
export const RITUALS = new Set([
  'Dark Ritual',
  'High Tide',
  'Bubbling Muck',
  'Cabal Ritual',
  'Energy Tap',
  'Drain Power',
]);

/** Instant / sorcery draw and selection: value = rough "cards gained". */
export const DRAW_SPELLS: Record<string, number> = {
  Brainstorm: 1.2,
  Consider: 1.0,
  Opt: 1.0,
  Ponder: 1.2,
  Preordain: 1.2,
  'Deep Analysis': 2.0,
  Diresight: 2.3,
  "Night's Whisper": 2.0,
  'Stock Up': 2.4,
  'See the Truth': 1.5,
  Energybending: 1.0,
  'Focus the Mind': 2.2,
  'Frantic Search': 1.0,
  Windfall: 2.0,
  'Insatiable Avarice': 2.5,
  'Prologue to Phyresis': 1.0, // cantrip; its poison counter stays, so casting it early sets up Expansion Algorithm
  'Chart a Course': 1.6,
  'Read the Bones': 2.0,
  'Pieces of the Puzzle': 2.0,
  'Fact or Fiction': 2.3,
  'Mission Briefing': 1.5, // surveil 2, then recast an instant/sorcery from the graveyard
};

export const KNOWN = new Set<string>([
  ...Object.keys(LANDS),
  ...Object.keys(MDFC_LAND_BACK),
  ...Object.keys(ROCKS),
  ...REDUCE_INSTANT_SORCERY_COST,
  ...REDUCE_NONCREATURE,
  ...REDUCE_BLUE,
  ...REDUCE_FROM_GRAVEYARD_BY_2,
  ...COUNTERS,
  ...TUTORS,
  ...Object.keys(DRAW_SPELLS),
  ...Object.keys(UNTAP_ON_ETB),
  ...Object.keys(MANA_CREATURES),
]);
