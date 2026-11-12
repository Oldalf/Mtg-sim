/** The moves of the kill search: what can be cast or activated from a state, and what each move does. */
import * as C from '../../engine/cards';
import * as Facts from '../../engine/card-facts';
import {
  KillSearchState,
  Path,
  RELEVANT,
  addSorted,
  remove1,
  uniqSorted,
} from './kill-state';
import { CardDef, Cost } from '../../engine/cards';

/** Gives a new state its description for the printed kill line. */
function labelled(
  state: KillSearchState,
  description: string,
): KillSearchState {
  // a labelled snapshot is never changed afterwards: its children get their own copies of these lists
  state.killLine = [
    state.killLine,
    description,
    state.opponentLife,
    state.opponentLibrary,
    state.opponentPoison,
  ];
  return state;
}

/** The printed kill line: one text per step, the first step first. */
export function renderPath(path: unknown): string[] {
  const lines: string[] = [];
  let step = path as Path;
  while (step) {
    const [previous, description, life, lib, poison] = step;
    let opponentsAlive = 0;
    for (let i = 0; i < life.length; i++)
      if (life[i] > 0 && lib[i] > 0 && poison[i] < 10) opponentsAlive++;
    lines.push(
      `${description}   | opp life [${life.join(', ')}] library [${lib.join(', ')}]` +
        (opponentsAlive ? '' : '  => ALL OPPONENTS DONE'),
    );
    step = previous;
  }
  return lines.reverse();
}

const COST_GUILDMAGE_DRAIN = new Cost(1, 1, 1);
const COST_GUILDMAGE_MILL = new Cost(2, 1, 1);
const COST_KONRAD_MILL = new Cost(1, 0, 1);
const COST_MONUMENT_EXHAUST = new Cost(2, 2);
const COST_MONUMENT = new Cost(1);
const OVERTURE_COST = Cost.parse('{4}{U}{U}');

/** Every state reachable from this one with one more move. */
export function children(state: KillSearchState): KillSearchState[] {
  const moves: KillSearchState[] = [];
  addPermanentCastMoves(state, moves);
  addAbilityMoves(state, moves);
  addHandSpellMoves(state, moves);
  for (const move of selfCounterMoves(state)) moves.push(move);
  addEmetSelchMoves(state, moves);
  return moves;
}

/** Casting the combo permanents and the creatures that untap lands. */
function addPermanentCastMoves(
  state: KillSearchState,
  moves: KillSearchState[],
): void {
  const hand = state.hand;
  const castComboPermanent = (
    name: string,
    flag: 'hasGuildmage' | 'hasMindcrank' | 'hasKonrad',
  ): void => {
    if (!hand.includes(name) || state[flag]) return;
    const next = state.copy();
    const card = C.get(name);
    if (!next.payForSpell(card)) return;
    next.hand = remove1(next.hand, name);
    next[flag] = true;
    if (card.isCreature) {
      next.creatureCount += 1;
      next.energyTapTargets = [...next.energyTapTargets, card.manaValue].sort(
        (first, second) => second - first,
      ); // (Energy Tap can tap a creature that just arrived)
    }
    moves.push(labelled(next, `cast ${name}`));
  };
  castComboPermanent('Duskmantle Guildmage', 'hasGuildmage');
  castComboPermanent('Mindcrank', 'hasMindcrank');
  castComboPermanent('Syr Konrad, the Grim', 'hasKonrad');
  // creatures that untap lands as they enter (Peregrine Drake, Cloud of Faeries)
  for (const [name, landsUntapped] of Object.entries(Facts.UNTAP_ON_ETB)) {
    if (!hand.includes(name)) continue;
    const next = state.copy();
    if (next.payForSpell(C.get(name))) {
      next.hand = remove1(next.hand, name);
      next.creatureCount += 1;
      next.untapLands(landsUntapped);
      moves.push(labelled(next, `cast ${name} (untap ${landsUntapped} lands)`));
    }
  }
  if (hand.includes('Riverchurn Monument') && !state.hasMonument) {
    const next = state.copy();
    if (next.payForSpell(C.get('Riverchurn Monument'))) {
      next.hand = remove1(next.hand, 'Riverchurn Monument');
      next.hasMonument = next.monumentCanExhaust = true;
      moves.push(labelled(next, 'cast Riverchurn Monument'));
    }
  }
}

/** Activating Guildmage, Konrad and the Monument, and attacking with The Mindskinner. */
function addAbilityMoves(
  state: KillSearchState,
  moves: KillSearchState[],
): void {
  if (state.hasGuildmage && state.guildmageActivations < 2) {
    const next = state.copy();
    if (next.spendMana(COST_GUILDMAGE_DRAIN)) {
      next.guildmageActivations += 1;
      moves.push(
        labelled(
          next,
          'activate Guildmage {1}{U}{B} (opponents lose 1 life per card to graveyard)',
        ),
      );
    }
  }
  if (
    state.hasGuildmage &&
    (state.guildmageActivations || state.hasMindcrank)
  ) {
    const next = state.copy();
    if (
      next.spendMana(COST_GUILDMAGE_MILL) &&
      next.biggestLibraryOpponent() !== null
    ) {
      next.recordOpponentStep('millBiggestLibrary', 2);
      moves.push(labelled(next, 'Guildmage {2}{U}{B}: opponent mills 2'));
    }
  }
  if (state.hasKonrad) {
    const next = state.copy();
    if (next.spendMana(COST_KONRAD_MILL)) {
      next.recordOpponentStep('konact');
      moves.push(labelled(next, 'Syr Konrad {1}{B}: each player mills 1'));
    }
  }
  if (state.hasMonument) {
    if (state.monumentCanExhaust) {
      const next = state.copy();
      if (next.spendMana(COST_MONUMENT_EXHAUST)) {
        next.hasMonument = next.monumentCanExhaust = false;
        next.millEach('graveyardSize');
        moves.push(
          labelled(
            next,
            'Riverchurn Monument exhaust {2}{U}{U}: mill = graveyard size',
          ),
        );
      }
    }
    const next = state.copy();
    if (next.spendMana(COST_MONUMENT)) {
      next.hasMonument = false;
      next.millEach(2);
      moves.push(
        labelled(next, 'Riverchurn Monument {1}: each opponent mills 2'),
      );
    }
  }
  if (state.mindskinnerCanAttack) {
    const next = state.copy();
    next.mindskinnerCanAttack = false;
    if (next.biggestLibraryOpponent() !== null) {
      next.recordOpponentStep('damageBiggestLibrary', 10);
      moves.push(
        labelled(next, 'attack with The Mindskinner (each opponent mills 10)'),
      );
    }
  }
}

/** A spell in hand as the search casts it: what it resolves as, its card, and its ways to be cast. */
interface HandSpell {
  spell: string; // what resolves (Jidoor's Overture counts as a sorcery)
  card: CardDef;
  isSorcery: boolean;
  variants: [string, Cost][];
}

/** The search's view of a card in hand, or null if the search never casts it. */
function describeHandSpell(
  state: KillSearchState,
  name: string,
): HandSpell | null {
  if (name === 'Jidoor, Aristocratic Capital')
    return {
      spell: 'Overture',
      card: C.get('Traumatize'), // a sorcery
      isSorcery: true,
      variants: [['x', OVERTURE_COST]],
    };
  const card = C.get(name);
  // counters need a target; Archmage's Charm can always pick "target player draws two"
  if (
    !card.isInstantOrSorcery ||
    (Facts.COUNTERS.has(name) && name !== "Archmage's Charm")
  )
    return null;
  return {
    spell: name,
    card,
    isSorcery: card.isSorcery,
    variants: RELEVANT.has(name)
      ? state.castVariants(name, false)
      : [['enabler', card.cost]],
  };
}

/** Spells from hand, each with a Gale recast of a spell of the other type from the graveyard (or none). */
function addHandSpellMoves(
  state: KillSearchState,
  moves: KillSearchState[],
): void {
  let previousName = '';
  for (const name of state.hand) {
    if (name === previousName) continue; // hand is sorted: each name once
    previousName = name;
    const handSpell = describeHandSpell(state, name);
    if (handSpell === null) continue;
    for (const [variant, baseCost] of handSpell.variants) {
      const afterPaying = state.copy();
      if (!afterPaying.payForSpell(handSpell.card, baseCost)) continue;
      afterPaying.hand = remove1(afterPaying.hand, name);
      for (const galeRecast of galeRecastNames(afterPaying, handSpell)) {
        if (variant === 'enabler' && galeRecast === null) continue;
        const recastVariants: ([string, Cost] | null)[] =
          galeRecast === null
            ? [null]
            : afterPaying.castVariants(galeRecast, true);
        for (const recastVariant of recastVariants) {
          const next = afterPaying.copy();
          if (galeRecast !== null && recastVariant !== null) {
            if (!next.payForSpell(C.get(galeRecast), recastVariant[1], true))
              continue;
            next.graveyardSpells = remove1(next.graveyardSpells, galeRecast);
            next.resolveSpell(galeRecast, recastVariant[0]);
          }
          addResponseMoves(
            next,
            moves,
            name,
            handSpell,
            variant,
            galeRecast,
            recastVariant,
          );
        }
      }
    }
  }
}

/** The relevant graveyard spells Gale could recast after this one (null = no recast), by name. */
function galeRecastNames(
  state: KillSearchState,
  handSpell: HandSpell,
): (string | null)[] {
  const names: (string | null)[] = [null];
  if (!state.hasGale) return names;
  for (const graveyardName of uniqSorted(state.graveyardSpells)) {
    const graveyardCard = C.get(graveyardName);
    const isOtherType = handSpell.isSorcery
      ? graveyardCard.isInstant
      : graveyardCard.isSorcery;
    if (RELEVANT.has(graveyardName) && isOtherType) names.push(graveyardName);
  }
  return names;
}

/** With the hand spell still on the stack we may respond at instant speed, e.g. use Dark Ritual mana (cast via
 *  Gale) to activate Guildmage first. Adds the move without a response and one for each response. */
function addResponseMoves(
  state: KillSearchState,
  moves: KillSearchState[],
  name: string,
  handSpell: HandSpell,
  variant: string,
  galeRecast: string | null,
  recastVariant: [string, Cost] | null,
): void {
  const responses = [state];
  if (state.hasGuildmage && variant !== 'enabler') {
    let latest = state;
    for (
      let response = 0;
      response < 2 - state.guildmageActivations;
      response++
    ) {
      latest = latest.copy();
      if (!latest.spendMana(COST_GUILDMAGE_DRAIN)) break;
      latest.guildmageActivations += 1;
      responses.push(latest);
    }
  }
  responses.forEach((responseState, responseCount) => {
    let description =
      `cast ${handSpell.spell}` +
      (variant !== 'x' && variant !== 'enabler' ? ` [${variant}]` : '') +
      ' from hand';
    if (galeRecast !== null && recastVariant !== null)
      description +=
        ` -> Gale: cast ${galeRecast}` +
        (recastVariant[0] !== 'x' ? ` [${recastVariant[0]}]` : '') +
        ' from graveyard';
    if (responseCount)
      description += ` -> in response activate Guildmage x${responseCount}`;
    if (variant !== 'enabler')
      responseState.resolveSpell(handSpell.spell, variant);
    if (handSpell.spell !== 'Overture')
      responseState.graveyardSpells = addSorted(responseState.graveyardSpells, [
        name,
      ]);
    moves.push(labelled(responseState, description));
  });
}

/** Emet-Selch: cast an instant/sorcery from the graveyard after opponents lost life. */
function addEmetSelchMoves(
  state: KillSearchState,
  moves: KillSearchState[],
): void {
  if (!(state.hasEmetSelch && state.opponentLostLife && !state.emetSelchUsed))
    return;
  for (const name of uniqSorted(state.graveyardSpells)) {
    if (!RELEVANT.has(name)) continue;
    for (const [variant, baseCost] of state.castVariants(name, true)) {
      const next = state.copy();
      if (next.payForSpell(C.get(name), baseCost, true)) {
        next.emetSelchUsed = true;
        next.graveyardSpells = remove1(next.graveyardSpells, name);
        next.resolveSpell(name, variant);
        moves.push(
          labelled(
            next,
            `Emet-Selch trigger: cast ${name} [${variant}] from graveyard`,
          ),
        );
      }
    }
  }
}

/** What each counterspell can counter when we cast it on our own spell. */
const SELF_COUNTER_TARGETS: Record<string, string> = {
  "An Offer You Can't Refuse": 'noncreature',
  Unwind: 'noncreature',
  Rewind: 'any',
  Counterspell: 'any',
  'Arcane Denial': 'any',
  'Mana Sculpt': 'any',
  Dispel: 'instant',
};

/** A graveyard spell Gale could recast: [name, variant, base cost]; all null = skip the trigger. */
type GaleRecast = [string | null, string | null, Cost | null];

/** Relevant graveyard spells Gale could cast ([null] = skip the trigger). */
function galeOptions(
  state: KillSearchState,
  wantSorcery: boolean,
): GaleRecast[] {
  const options: GaleRecast[] = [[null, null, null]];
  if (state.hasGale) {
    for (const name of uniqSorted(state.graveyardSpells)) {
      const card = C.get(name);
      if (
        RELEVANT.has(name) &&
        (wantSorcery ? card.isSorcery : card.isInstant)
      ) {
        for (const [variant, baseCost] of state.castVariants(name, true))
          options.push([name, variant, baseCost]);
      }
    }
  }
  return options;
}

/** The spells worth trying as the target of our own counterspell: the cheapest, plus instants/sorceries whose own Gale
 *  trigger matters. */
function selfCounterTargets(
  state: KillSearchState,
  counterName: string,
  handNames: string[],
): CardDef[] {
  const kind = SELF_COUNTER_TARGETS[counterName];
  const targets: CardDef[] = [];
  for (const name of handNames) {
    if (name === counterName || name === 'Jidoor, Aristocratic Capital')
      continue;
    const card = C.get(name);
    if (
      card.land !== null ||
      (kind === 'noncreature' && card.isCreature) ||
      (kind === 'instant' && !card.isInstant)
    )
      continue;
    targets.push(card);
  }
  targets.sort(
    (first, second) =>
      first.manaValue - second.manaValue ||
      (first.name < second.name ? -1 : first.name > second.name ? 1 : 0),
  );
  const worthTrying = targets.slice(0, 1);
  if (state.hasGale) {
    for (const card of targets.slice(1)) {
      if (
        card.isInstantOrSorcery &&
        card.manaValue <= 3 &&
        state.graveyardSpells.some(
          (graveyardName) =>
            RELEVANT.has(graveyardName) &&
            (card.isInstant
              ? C.get(graveyardName).isSorcery
              : C.get(graveyardName).isInstant),
        )
      )
        worthTrying.push(card);
    }
  }
  return worthTrying;
}

/** Cast a cheap spell from hand, then counter it with your own counterspell from hand. Both casts
 *  can trigger Gale; An Offer You Can't Refuse gives you two Treasures and Unwind untaps three lands. */
function selfCounterMoves(state: KillSearchState): KillSearchState[] {
  const moves: KillSearchState[] = [];
  const handNames = uniqSorted(state.hand);
  for (const counterName of handNames) {
    if (SELF_COUNTER_TARGETS[counterName] === undefined) continue;
    const counterCard = C.get(counterName);
    for (const targetCard of selfCounterTargets(
      state,
      counterName,
      handNames,
    )) {
      const targetName = targetCard.name;
      const afterTarget = state.copy();
      if (!afterTarget.payForSpell(targetCard)) continue;
      afterTarget.hand = remove1(afterTarget.hand, targetName);
      const firstRecasts: GaleRecast[] = targetCard.isInstantOrSorcery
        ? galeOptions(afterTarget, targetCard.isInstant)
        : [[null, null, null]];
      for (const [firstName, firstVariant, firstCost] of firstRecasts) {
        const afterFirst = afterTarget.copy();
        if (firstName !== null) {
          if (!afterFirst.payForSpell(C.get(firstName), firstCost, true))
            continue;
          afterFirst.graveyardSpells = remove1(
            afterFirst.graveyardSpells,
            firstName,
          );
          afterFirst.resolveSpell(firstName, firstVariant as string);
        }
        // e.g. a graveyard Windfall discarded the counterspell
        if (
          !afterFirst.hand.includes(counterName) ||
          !afterFirst.payForSpell(counterCard)
        )
          continue;
        afterFirst.hand = remove1(afterFirst.hand, counterName);
        for (const [secondName, secondVariant, secondCost] of galeOptions(
          afterFirst,
          true,
        )) {
          const hasUntapOrTreasures =
            counterName === "An Offer You Can't Refuse" ||
            counterName === 'Unwind' ||
            counterName === 'Rewind';
          if (firstName === null && secondName === null && !hasUntapOrTreasures)
            continue;
          const next = afterFirst.copy();
          if (secondName !== null) {
            if (!next.payForSpell(C.get(secondName), secondCost, true))
              continue;
            next.graveyardSpells = remove1(next.graveyardSpells, secondName);
            next.resolveSpell(secondName, secondVariant as string);
          }
          if (counterName === "An Offer You Can't Refuse") {
            next.pool.A += 2;
            next.coloursFromOutsideLands += 2;
          } else if (counterName === 'Unwind') next.untapLands(3);
          else if (counterName === 'Rewind') next.untapLands(4);
          next.graveyardSpells = addSorted(
            next.graveyardSpells,
            targetCard.isInstantOrSorcery
              ? [counterName, targetName]
              : [counterName],
          );
          moves.push(
            labelled(
              next,
              describeSelfCounter(
                targetName,
                counterName,
                [firstName, firstVariant],
                [secondName, secondVariant],
              ),
            ),
          );
        }
      }
    }
  }
  return moves;
}

/** The text of a self-counter step for the printed kill line. */
function describeSelfCounter(
  targetName: string,
  counterName: string,
  firstRecast: [string | null, string | null],
  secondRecast: [string | null, string | null],
): string {
  const recastText = ([name, variant]: [string | null, string | null]) =>
    ` -> Gale: cast ${name}` +
    (variant !== 'x' && variant !== null ? ` [${variant}]` : '') +
    ' from graveyard';
  let description = `cast ${targetName} from hand`;
  if (firstRecast[0]) description += recastText(firstRecast);
  description += `, then counter it with your own ${counterName}`;
  if (secondRecast[0]) description += recastText(secondRecast);
  if (counterName === "An Offer You Can't Refuse")
    description += ' (+2 Treasures)';
  else if (counterName === 'Unwind') description += ' (untap 3 lands)';
  else if (counterName === 'Rewind') description += ' (untap 4 lands)';
  return description;
}

/** Can we still cast a counterspell from hand with what's left? */
export function isProtected(state: KillSearchState): boolean {
  for (const name of uniqSorted(state.hand)) {
    if (Facts.COUNTERS.has(name)) {
      const next = state.copy();
      if (next.payForSpell(C.get(name))) return true;
    }
  }
  return false;
}
