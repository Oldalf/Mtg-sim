/**
 * Azula's ten combos (Commander Spellbook, "Agni Kai"; Pontus, 2026-11-16, PLAN.md B6). A check says whether the
 * pieces are here and the first round can be paid now. The loop is not played round by round: we pay for its first
 * round, log what it makes, and if it reaches a finisher every opponent dies (a declared win the pod may answer).
 *
 * A loop only wins with a finisher it can reach (Pontus's choice): Vivi Ornitier when the loop casts a spell each
 * round, or endless mana and a finisher spell (in hand, or in the library when the loop digs through it). The loops
 * that only copy (4, 5, 8, 9, 10) give endless mana only through Storm-Kiln Artist, so they need it out.
 */
import {
  ARCHMAGE_EMERITUS,
  ARCHMAGE_OF_RUNES,
  AZULA,
  FINISHERS,
  FRANTIC_SEARCH,
  JESKAS_WILL,
  MANA_GEYSER,
  NARSETS_REVERSAL,
  PRISMARI,
  REITERATE,
  REVERBERATE,
  SEETHING_SONG,
  STORM_KILN_ARTIST,
  TWINNING_STAFF,
  VIVI,
} from './cards';
import type { AzulaGame } from './game';
import { CardDef, Cost } from '../../engine/cards/cards';
import { spellTriggerCount } from '../../engine/game/spell-copies';

/** What a loop gives without end once it runs. */
export interface LoopOutput {
  /** Endless mana: red only (Jeska's Will, Mana Geyser), any colour (Treasures, lands untapped again), or none. */
  mana: 'red' | 'any' | null;
  /** A spell is cast again each round (Vivi pings, Archmage of Runes draws, Storm-Kiln Artist makes a Treasure). */
  castsEachRound: boolean;
  /** A spell is copied each round (Archmage Emeritus draws, Storm-Kiln Artist makes a Treasure). */
  copiesEachRound: boolean;
  /** The loop reaches the whole library (Frantic Search loots; Jeska's Will with a commander out exiles). */
  digsLibrary: boolean;
}

export interface ComboPlan {
  name: string;
  /** The cards from hand the first round casts; they go to the graveyard. */
  spells: CardDef[];
  /** Reiterate cast with buyback: cast too, but it comes back to hand. */
  buyback: CardDef | null;
  /** What the first round costs. */
  cost: Cost;
  /** The permanents it needs (an answer to one stops it). */
  permanents: string[];
  output: LoopOutput;
}

export interface ComboWin extends ComboPlan {
  /** The card that kills: a spell (in hand or found by the loop) or Vivi Ornitier. */
  finisher: string;
}

/** The ten combos, in Commander Spellbook's order. */
const COMBOS: ((game: AzulaGame) => ComboPlan | null)[] = [
  jeskasWillLoop,
  manaGeyserLoop,
  seethingSongLoop,
  twinningStaffLoop,
  reverberateReversalLoop,
  franticSearchLoop,
  stormKilnReversalLoop,
  reiterateReversalLoop,
  prismariReiterateLoop,
  prismariReverberateLoop,
];

/** The named cards each combo needs (in hand, on the battlefield, or Azula in the command zone), for tutors. */
const COMBO_PIECES: string[][] = [
  [JESKAS_WILL, REITERATE],
  [MANA_GEYSER, REITERATE],
  [STORM_KILN_ARTIST, SEETHING_SONG, REITERATE],
  [TWINNING_STAFF, NARSETS_REVERSAL, STORM_KILN_ARTIST],
  [NARSETS_REVERSAL, REVERBERATE, STORM_KILN_ARTIST],
  [AZULA, NARSETS_REVERSAL, FRANTIC_SEARCH],
  [AZULA, NARSETS_REVERSAL, STORM_KILN_ARTIST],
  [NARSETS_REVERSAL, REITERATE, STORM_KILN_ARTIST],
  [PRISMARI, REITERATE, STORM_KILN_ARTIST],
  [PRISMARI, REVERBERATE, STORM_KILN_ARTIST],
];

/** The card in the library a tutor may take that completes a combo (all its other pieces are here), or null. */
export function missingComboPiece(
  game: AzulaGame,
  allowed: (card: CardDef) => boolean,
): CardDef | null {
  const isHere = (name: string) =>
    game.cardInHand(name) !== undefined ||
    game.isOnBattlefield(name) ||
    game.command.some((card) => card.name === name);
  for (const pieces of COMBO_PIECES) {
    const missing = pieces.filter((name) => !isHere(name));
    if (missing.length !== 1) continue;
    const card = game.library.find(
      (libraryCard) => libraryCard.name === missing[0] && allowed(libraryCard),
    );
    if (card) return card;
  }
  return null;
}

/** The first combo we can go off with now and win, or null. */
export function findComboWin(game: AzulaGame): ComboWin | null {
  for (const combo of COMBOS) {
    const plan = combo(game);
    if (!plan || !game.canPay(plan.cost, true)) continue;
    const finisher = reachableFinisher(game, plan);
    if (finisher) return { ...plan, finisher };
  }
  return null;
}

/** Pays for the loop's first round and kills every opponent. False if it can't be paid. */
export function goOffWithCombo(game: AzulaGame, win: ComboWin): boolean {
  if (!game.pay(win.cost, true)) return false;
  for (const card of win.spells) game.moveCard(card, 'hand', 'graveyard');
  const staff = game.battlefield.find(
    (permanent) => permanent.card.name === TWINNING_STAFF && !permanent.tapped,
  );
  if (staff && win.permanents.includes(TWINNING_STAFF)) staff.tapped = true;
  game.sayEvent(
    'cast',
    `COMBO: ${win.name}: ${describeOutput(withEngines(game, win.output))}; finisher: ${win.finisher}`,
  );
  game.killEveryOpponent(win);
  return true;
}

// ================================================================ the ten combos
/** 1. Jeska's Will, then Reiterate with buyback copies it again and again: {R} for each card in the opponent's
 *  hand per copy, 6 per copy spent. Six cards break even, more is endless red. */
function jeskasWillLoop(game: AzulaGame): ComboPlan | null {
  return redRitualLoop(
    game,
    JESKAS_WILL,
    game.mostCardsInAnOpponentsHand(),
    game.controlsCommander(),
  );
}

/** 2. Mana Geyser and Reiterate with buyback: {R} for each tapped land the opponents control per copy. */
function manaGeyserLoop(game: AzulaGame): ComboPlan | null {
  return redRitualLoop(game, MANA_GEYSER, game.opponentsTappedLands(), false);
}

function redRitualLoop(
  game: AzulaGame,
  ritualName: string,
  redPerCopy: number,
  digsLibrary: boolean,
): ComboPlan | null {
  const ritual = game.cardInHand(ritualName);
  const reiterate = game.cardInHand(REITERATE);
  if (!ritual || !reiterate || !game.canCastSorceryNow() || redPerCopy < 6)
    return null;
  return {
    name: `Reiterate + ${ritualName}`,
    spells: [ritual],
    buyback: reiterate,
    cost: game.effectiveCost(ritual).plus(reiterateWithBuyback(game)),
    permanents: [],
    output: {
      mana: redPerCopy > 6 ? 'red' : null,
      castsEachRound: true,
      copiesEachRound: true,
      digsLibrary,
    },
  };
}

/** 3. Storm-Kiln Artist + Seething Song + Reiterate: each round makes {R}x5 and two Treasures for the 6 it costs. */
function seethingSongLoop(game: AzulaGame): ComboPlan | null {
  const song = game.cardInHand(SEETHING_SONG);
  const reiterate = game.cardInHand(REITERATE);
  if (!song || !reiterate || !game.isOnBattlefield(STORM_KILN_ARTIST))
    return null;
  const cost = game.effectiveCost(song).plus(reiterateWithBuyback(game));
  // casting Seething Song makes a Treasure first, which pays part of Reiterate
  const treasures = spellTriggerCount(game);
  return {
    name: 'Storm-Kiln Artist + Seething Song + Reiterate',
    spells: [song],
    buyback: reiterate,
    cost: cost.withGeneric(Math.max(0, cost.generic - treasures)),
    permanents: [STORM_KILN_ARTIST],
    output: copyLoop({ castsEachRound: true }),
  };
}

/** 4. Twinning Staff ({7}, tap) copies Narset's Reversal twice; each copy copies another and returns one. */
function twinningStaffLoop(game: AzulaGame): ComboPlan | null {
  const staff = game.battlefield.find(
    (permanent) => permanent.card.name === TWINNING_STAFF && !permanent.tapped,
  );
  const reversal = game.cardInHand(NARSETS_REVERSAL);
  if (!staff || !reversal || !game.isOnBattlefield(STORM_KILN_ARTIST))
    return null;
  const loopCost = game.effectiveCost(reversal).plus(new Cost(7));
  const other = game.chooseSpellToCopy([reversal], loopCost);
  if (!other) return null;
  return {
    name: "Twinning Staff + Narset's Reversal",
    spells: [other, reversal],
    buyback: null,
    cost: game.effectiveCost(other).plus(loopCost),
    permanents: [TWINNING_STAFF, STORM_KILN_ARTIST],
    output: copyLoop({}),
  };
}

/** 5. Narset's Reversal copies Reverberate and returns it; Reverberate copies its own copy, again and again. */
function reverberateReversalLoop(game: AzulaGame): ComboPlan | null {
  return reversalCopierLoop(game, REVERBERATE);
}

/** 8. The same with Reiterate (cast without buyback). */
function reiterateReversalLoop(game: AzulaGame): ComboPlan | null {
  return reversalCopierLoop(game, REITERATE);
}

function reversalCopierLoop(
  game: AzulaGame,
  copierName: string,
): ComboPlan | null {
  const reversal = game.cardInHand(NARSETS_REVERSAL);
  const copier = game.cardInHand(copierName);
  if (!reversal || !copier || !game.isOnBattlefield(STORM_KILN_ARTIST))
    return null;
  // the copier is cast twice: Narset's Reversal returns it to hand once
  const loopCost = game
    .effectiveCost(reversal)
    .plus(game.effectiveCost(copier))
    .plus(game.effectiveCost(copier));
  const other = game.chooseSpellToCopy([reversal, copier], loopCost);
  if (!other) return null;
  return {
    name: `Narset's Reversal + ${copierName}`,
    spells: [other, reversal, copier],
    buyback: null,
    cost: game.effectiveCost(other).plus(loopCost),
    permanents: [STORM_KILN_ARTIST],
    output: copyLoop({}),
  };
}

/** 6. Azula attacking, Narset's Reversal and Frantic Search: each round loots twice and untaps six lands for the
 *  five it costs, with up to three lands that make {U}{U}{U}. */
function franticSearchLoop(game: AzulaGame): ComboPlan | null {
  const search = game.cardInHand(FRANTIC_SEARCH);
  const reversal = game.cardInHand(NARSETS_REVERSAL);
  if (!game.isAzulaAttacking || !search || !reversal) return null;
  if (game.landsThatMakeBlue() < 3) return null;
  return {
    name: "Fire Lord Azula + Narset's Reversal + Frantic Search",
    spells: [search, reversal],
    buyback: null,
    cost: game.effectiveCost(search).plus(game.effectiveCost(reversal)),
    permanents: [AZULA],
    output: {
      mana: 'any',
      castsEachRound: true,
      copiesEachRound: true,
      digsLibrary: true,
    },
  };
}

/** 7. Azula attacking, Narset's Reversal and Storm-Kiln Artist: the Treasures from casting and copying another
 *  spell pay for Narset's Reversal, and each round makes more. The other spell has at most four coloured pips. */
function stormKilnReversalLoop(game: AzulaGame): ComboPlan | null {
  const reversal = game.cardInHand(NARSETS_REVERSAL);
  if (
    !game.isAzulaAttacking ||
    !reversal ||
    !game.isOnBattlefield(STORM_KILN_ARTIST)
  )
    return null;
  const other = game.chooseSpellToCopy([reversal], new Cost(), 4);
  if (!other) return null;
  return {
    name: "Fire Lord Azula + Narset's Reversal + Storm-Kiln Artist",
    spells: [other, reversal],
    buyback: null,
    cost: game.effectiveCost(other),
    permanents: [AZULA, STORM_KILN_ARTIST],
    output: copyLoop({ castsEachRound: true }),
  };
}

/** 9. Prismari gives Reiterate storm: its copies copy Reiterate itself. */
function prismariReiterateLoop(game: AzulaGame): ComboPlan | null {
  return prismariStormLoop(game, REITERATE);
}

/** 10. The same with Reverberate. */
function prismariReverberateLoop(game: AzulaGame): ComboPlan | null {
  return prismariStormLoop(game, REVERBERATE);
}

function prismariStormLoop(
  game: AzulaGame,
  copierName: string,
): ComboPlan | null {
  const copier = game.cardInHand(copierName);
  if (
    !copier ||
    !game.isOnBattlefield(PRISMARI) ||
    !game.isOnBattlefield(STORM_KILN_ARTIST)
  )
    return null;
  const loopCost = game.effectiveCost(copier);
  const other = game.chooseSpellToCopy([copier], loopCost);
  if (!other) return null;
  return {
    name: `Prismari + ${copierName}`,
    spells: [other, copier],
    buyback: null,
    cost: game.effectiveCost(other).plus(loopCost),
    permanents: [PRISMARI, STORM_KILN_ARTIST],
    output: copyLoop({}),
  };
}

// ================================================================ helpers
function reiterateWithBuyback(game: AzulaGame): Cost {
  return game.effectiveCost(game.cardInHand(REITERATE)!).plus(new Cost(3));
}

/** A loop that copies spells with Storm-Kiln Artist out: its Treasures are endless mana of any colour. */
function copyLoop(more: Partial<LoopOutput>): LoopOutput {
  return {
    mana: 'any',
    castsEachRound: false,
    copiesEachRound: true,
    digsLibrary: false,
    ...more,
  };
}

/** The loop's output with our engines added: Storm-Kiln Artist turns casts and copies into Treasures; the
 *  Archmages draw the library (Emeritus on copies, both on casts). */
export function withEngines(game: AzulaGame, output: LoopOutput): LoopOutput {
  const triggersEachRound = output.castsEachRound || output.copiesEachRound;
  const drawsEachRound =
    (game.isOnBattlefield(ARCHMAGE_EMERITUS) && triggersEachRound) ||
    (game.isOnBattlefield(ARCHMAGE_OF_RUNES) && output.castsEachRound);
  return {
    ...output,
    mana:
      game.isOnBattlefield(STORM_KILN_ARTIST) && triggersEachRound
        ? 'any'
        : output.mana,
    digsLibrary: output.digsLibrary || drawsEachRound,
  };
}

/** The finisher a loop reaches, or null: Vivi when it casts each round; with endless mana a finisher spell in hand
 *  (with red only: one whose other pips we can still pay), or in the library when the loop digs. */
function reachableFinisher(game: AzulaGame, plan: ComboPlan): string | null {
  const output = withEngines(game, plan.output);
  if (output.castsEachRound && game.isOnBattlefield(VIVI)) return VIVI;
  if (output.mana === null) return null;
  const isCastable = (card: CardDef) =>
    output.mana === 'any' ||
    game.canPay(plan.cost.plus(nonRedPips(card.cost)), true);
  const inHand = game.hand.find(
    (card) => FINISHERS.has(card.name) && isCastable(card),
  );
  if (inHand) return inHand.name;
  if (!output.digsLibrary) return null;
  return (
    game.library.find((card) => FINISHERS.has(card.name) && isCastable(card))
      ?.name ?? null
  );
}

/** A cost's coloured pips other than red (what endless red mana can't pay). */
function nonRedPips(cost: Cost): Cost {
  return new Cost(0, cost.blue, cost.black, 0, cost.white, 0, cost.green);
}

function describeOutput(output: LoopOutput): string {
  const parts: string[] = [];
  if (output.mana === 'red') parts.push('endless red mana');
  if (output.mana === 'any') parts.push('endless mana');
  if (output.castsEachRound) parts.push('endless casts');
  if (output.copiesEachRound) parts.push('endless copies');
  if (output.digsLibrary) parts.push('the whole library');
  return parts.join(', ');
}
