import * as C from '../../engine/cards';
import {
  AESI,
  AFFINITY,
  AWAKENING,
  BEANSTALK,
  BSZ,
  BUDOKA,
  CHAMBER,
  CLAIM,
  COBRA,
  CROP,
  DOMINION,
  DRUID,
  HARU,
  HOLD,
  KHALNI,
  KIRI,
  KODAMA,
  LORE,
  MAP,
  MELOKU,
  MYRIAD,
  OMNI,
  PASSAGE,
  PATRON,
  PUTTERS,
  RAFT,
  RAMP,
  RETREAT,
  RETURNERS,
  REVOLT,
  SCRYING,
  SEARCH,
  SWARM,
  THREE,
} from './cards';
import {
  bounceAndReplayLand,
  castBeanstalkGiant,
  castFertileFootsteps,
  castPatronWithOffering,
  castZenithForSelf,
  chooseOfferingFodder,
  levelUpDruidClass,
  melokuEndOfTurn,
  sacrificeKhalni,
  useDemolitionField,
  useDokai,
  useLootDig,
} from './actions';
import type { AesiGame } from './game';
import { CardDef, Cost } from '../../engine/cards';
import { Candidate, Permanent } from '../../engine/game-types';
import { firstMax } from '../../engine/lists';

// ================================================================ what to do
/** Adds one thing the AI may do: its score, what it costs, whether it is an instant or sorcery, and how to do it. */
export type AddCandidate = (
  score: number,
  cost: Cost,
  isInstantOrSorcery: boolean,
  action: () => boolean,
  rockCard?: CardDef,
) => void;

/** Everything the AI may do now, with a score each (higher first). */
export function buildCandidates(game: AesiGame, main2: boolean): Candidate[] {
  const candidates: Candidate[] = [];
  const add: AddCandidate = (score, cost, isInstantOrSorcery, action, rock) =>
    candidates.push({
      score,
      cost,
      isInstantOrSorcery: isInstantOrSorcery,
      action: action,
      rock,
    });
  const isEarly = game.landsOnBattlefield().length < 8;
  addLandCandidate(game, add);
  if (game.epic) {
    // an epic spell resolved: only abilities from now on
    abilityCandidates(game, add, main2);
    return candidates;
  }
  for (const commander of game.command.slice())
    add(
      96,
      game.commanderCost(commander, game.effectiveCost(commander)),
      false,
      () => game.castPerm(commander, true),
    );
  addCardsInHandCandidates(game, add, main2, isEarly);
  if (game.footstepsExiled) {
    const giant = C.get(BEANSTALK);
    add(isEarly ? 30 : 45, giant.cost, false, () =>
      castBeanstalkGiant(game, giant),
    );
  }
  abilityCandidates(game, add, main2);
  return candidates;
}

/** Playing a land: every one is a landfall trigger (a card with Aesi). */
function addLandCandidate(game: AesiGame, add: AddCandidate): void {
  if (!game.landsInHand().length) return;
  const way = game.landWay();
  if (way && way.kind !== 'patron')
    add(92, new Cost(), false, () => game.playLandVia(way));
  else if (way) add(70, new Cost(1), false, () => game.playLandVia(way));
}

/** Casting the cards in hand (one candidate per card name). */
function addCardsInHandCandidates(
  game: AesiGame,
  add: AddCandidate,
  main2: boolean,
  isEarly: boolean,
): void {
  const seenNames = new Set<string>();
  for (const card of game.hand.slice()) {
    if (seenNames.has(card.name) || card.land !== null || HOLD.has(card.name))
      continue;
    seenNames.add(card.name);
    if (card.types.has('legendary') && game.isOnBattlefield(card.name))
      continue;
    if (card.name === 'Sol Ring') {
      add(
        100,
        game.effectiveCost(card),
        false,
        () => game.castPerm(card),
        card,
      );
    } else if (card.isInstantOrSorcery) {
      spellCandidates(game, card, add, main2, isEarly);
    } else if (card.name === BEANSTALK) {
      // the adventure first: Fertile Footsteps (a basic onto the battlefield, untapped)
      if (!game.footstepsExiled)
        add(isEarly ? 84 : 50, Cost.parse('{2}{G}'), true, () =>
          castFertileFootsteps(game, card),
        );
    } else {
      permanentCandidate(game, card, add, main2, isEarly);
    }
  }
}

/** Casting a creature, artifact or enchantment from hand. */
function permanentCandidate(
  game: AesiGame,
  card: CardDef,
  add: AddCandidate,
  main2: boolean,
  isEarly: boolean,
): void {
  const name = card.name;
  const hasLandInHand = game.landsInHand().length > 0;
  let score = game.battlefieldValue(card);
  if (RAMP.has(name)) score = isEarly ? 86 : 40;
  if (name === COBRA && hasLandInHand) score = 93;
  if (
    (name === RETREAT || name === RAFT) &&
    game.battlefield.some((permanent) => PUTTERS.has(permanent.card.name))
  )
    score = 94;
  if (
    (name === 'Training Grounds' || name === 'Heartstone') &&
    !game.battlefield.some((permanent) => RETURNERS[permanent.card.name])
  )
    score = 35;
  if (
    name === OMNI &&
    !(
      game.hand.some((otherCard) => otherCard.name === KIRI) &&
      game.hand.some((otherCard) => otherCard.name === HARU)
    )
  )
    score = 70;
  if (game.isOnBattlefield(OMNI)) score = Math.max(score, 60);
  if (name === 'Graceful Adept' && game.hand.length < 7) score = 25;
  if (name === 'Kira, Great Glass-Spinner' && !main2) return;
  if (name === REVOLT) {
    // it makes replayed lands summoning sick (no mana): only for a lethal attack with our lands now
    if (
      !main2 &&
      isLandAttackLethal(game, game.effectiveCost(card).manaValue, false)
    )
      add(98, game.effectiveCost(card), false, () => game.castPerm(card));
    return;
  }
  if (name === MAP && wantsComboLand(game)) score = 90;
  if (name === PATRON) {
    const fodder = chooseOfferingFodder(game);
    if (fodder) {
      const offeringCost = new Cost(
        Math.max(0, 5 - fodder.card.cost.generic),
        Math.max(0, 2 - fodder.card.cost.blue),
      );
      add(score + 2, offeringCost, false, () =>
        castPatronWithOffering(game, card, fodder, offeringCost),
      );
    }
  }
  add(score, game.effectiveCost(card), false, () => game.castPerm(card));
}

/** Instants and sorceries. */
export function spellCandidates(
  game: AesiGame,
  spell: CardDef,
  add: AddCandidate,
  main2: boolean,
  isEarly: boolean,
): void {
  if (rampSpellCandidates(game, spell, add, isEarly)) return;
  if (otherSpellCandidates(game, spell, add, main2, isEarly)) return;
  add(game.battlefieldValue(spell), game.effectiveCost(spell), true, () =>
    game.castInstantOrSorcery(spell),
  );
}

/** Spells that fetch lands or give extra land drops. Returns false if this is not one of them. */
function rampSpellCandidates(
  game: AesiGame,
  spell: CardDef,
  add: AddCandidate,
  isEarly: boolean,
): boolean {
  const name = spell.name;
  const cost = game.effectiveCost(spell);
  const basicsInLibrary = game.library.filter(
    (card) => card.land?.basic,
  ).length;
  const landsInHand = game.landsInHand().length;
  const rampScore = isEarly ? 86 : 42;
  const cast = () => game.castInstantOrSorcery(spell);
  switch (name) {
    case LORE:
    case THREE:
      if (game.library.some((card) => card.name === 'Forest'))
        add(rampScore + 2, cost, true, cast);
      return true;
    case CLAIM:
      if (game.library.filter((card) => card.name === 'Forest').length >= 2)
        add(rampScore + 1, cost, true, cast);
      return true;
    case SEARCH:
      // suspend for {G} (the land comes at our upkeep two turns later), or cast it for {2}{G} when we need it now
      if (basicsInLibrary)
        add(rampScore + 3, Cost.parse('{G}'), true, () =>
          game.suspendSearch(spell),
        );
      if (basicsInLibrary) add(rampScore - 6, cost, true, cast);
      return true;
    case 'Rampant Growth':
    case 'Farseek':
    case 'Cultivate':
    case 'Explosive Vegetation':
    case 'Circuitous Route':
    case 'Reach the Horizon':
    case "Nissa's Pilgrimage":
    case 'Entish Restoration': {
      const fetchesTwoTapped =
        name === 'Explosive Vegetation' ||
        name === 'Circuitous Route' ||
        name === 'Reach the Horizon';
      if (basicsInLibrary >= 2)
        add(rampScore + (fetchesTwoTapped ? 1 : 0), cost, true, cast);
      return true;
    }
    case 'Harrow':
      if (basicsInLibrary >= 2) add(isEarly ? 88 : 60, cost, true, cast);
      return true;
    case 'Grow from the Ashes': {
      const kickedCost = cost.plus(new Cost(2));
      if (basicsInLibrary >= 2 && game.canPay(kickedCost))
        add(rampScore + 2, kickedCost, true, () =>
          game.castInstantOrSorcery(spell, false, kickedCost, 'kicked'),
        );
      else if (basicsInLibrary) add(rampScore - 2, cost, true, cast);
      return true;
    }
    case 'Growth Spiral':
      add(76, cost, true, cast);
      return true;
    case 'Explore':
      add(
        landsInHand >= 1 || game.isOnBattlefield(AESI) ? 70 : 55,
        cost,
        true,
        cast,
      );
      return true;
    case 'Summer Bloom': {
      const extraDrops = Math.min(
        3,
        landsInHand - (game.dropsAllowed() - game.dropsUsed),
      );
      if (extraDrops >= 1) add(45 + 12 * extraDrops, cost, true, cast);
      return true;
    }
    case 'Seismic Sense':
      add(56, cost, true, cast);
      return true;
    case 'Bushwhack':
      if (basicsInLibrary && landsInHand === 0 && game.canDrop())
        add(50, cost, true, () =>
          game.castInstantOrSorcery(spell, false, null, 'basic'),
        );
      return true;
    default:
      return false;
  }
}

/** Untap, draw, win-the-game and lands-as-creatures spells. Returns false if this is not one of them. */
function otherSpellCandidates(
  game: AesiGame,
  spell: CardDef,
  add: AddCandidate,
  main2: boolean,
  isEarly: boolean,
): boolean {
  const cost = game.effectiveCost(spell);
  const cast = () => game.castInstantOrSorcery(spell);
  switch (spell.name) {
    case 'Early Harvest': {
      // untap the basics: worth it when it pays for something big we couldn't cast otherwise
      const tappedBasics = game
        .landsOnBattlefield()
        .filter(
          (permanent) => permanent.tapped && permanent.land!.basic,
        ).length;
      const manaAfterCasting = game.availMana() - 3;
      const hasBigSpell = [...game.hand, ...game.command].some(
        (card) =>
          card !== spell &&
          card.land === null &&
          !HOLD.has(card.name) &&
          !card.isInstantOrSorcery &&
          game.effectiveCost(card).manaValue > game.availMana() &&
          game.effectiveCost(card).manaValue <= manaAfterCasting + tappedBasics,
      );
      if (tappedBasics >= 4 && hasBigSpell) add(80, cost, true, cast);
      return true;
    }
    case BSZ: {
      // draw for ourselves with what's left in the second main phase
      const xValue = game.availMana() - 3;
      if (
        main2 &&
        xValue >= 2 &&
        game.library.length > game.libraryCardsToKeep() + xValue
      )
        add(38 + 5 * xValue, spell.cost.withGeneric(xValue), true, () =>
          castZenithForSelf(game, spell, xValue),
        );
      return true;
    }
    case SWARM:
      if (isSwarmLethal(game)) add(97, cost, true, cast);
      return true;
    case AWAKENING:
      if (!main2 && isLandAttackLethal(game, cost.manaValue, true))
        add(98, cost, true, cast);
      return true;
    case AFFINITY:
      if (!main2 && isLandAttackLethal(game, cost.manaValue, false))
        add(98, cost, true, cast);
      return true;
    case SCRYING:
      if (game.library.some((card) => card.land !== null))
        add(wantsComboLand(game) ? 95 : isEarly ? 64 : 48, cost, true, cast);
      return true;
    case CROP:
      // sacrifice a land, put a land onto the battlefield: only for the Retreat loop's Simic Growth Chamber
      if (wantsComboLand(game) && game.landsOnBattlefield().length >= 2)
        add(95, cost, true, cast);
      return true;
    case DOMINION:
      // only when nothing else is left to cast (it stops our spells for the rest of the game)
      if (
        game.turn >= 12 &&
        !game.hand.some(
          (card) =>
            card !== spell && card.land === null && !HOLD.has(card.name),
        )
      )
        add(20, cost, true, cast);
      return true;
    default:
      return false;
  }
}

/** Endless Swarm now kills the table at the next attack: its Snakes (summoning sick now) plus the next
 *  upkeep's copy, half of the ground blocked, plus the flyers. */
export function isSwarmLethal(game: AesiGame): boolean {
  const otherCardsInHand = game.hand.length - 1;
  const ground = game
    .creatures()
    .filter(
      (permanent) => !permanent.card.flying && game.power(permanent) > 0,
    ).length;
  const flyerPower = game
    .creatures()
    .filter((permanent) => permanent.card.flying)
    .reduce((total, permanent) => total + game.power(permanent), 0);
  const groundAttackerCount = ground + 2 * otherCardsInHand;
  const damage =
    groundAttackerCount - Math.floor(groundAttackerCount / 2) + flyerPower;
  return game.winsWith(damage);
}

/** Activated abilities: returning a land to replay it, Meloku, and the abilities of permanents on the battlefield. */
export function abilityCandidates(
  game: AesiGame,
  add: AddCandidate,
  main2: boolean,
): void {
  const landsInHand = game.landsInHand().length;
  addBounceReplayCandidate(game, add, main2, landsInHand);
  addMelokuEndOfTurnCandidate(game, add, main2, landsInHand);
  for (const permanent of game.battlefield)
    addPermanentAbilityCandidate(game, permanent, add, main2, landsInHand);
}

/** Return a land with a moonfolk and play it again: a landfall trigger (a card with Aesi) for the mana. */
function addBounceReplayCandidate(
  game: AesiGame,
  add: AddCandidate,
  main2: boolean,
  landsInHand: number,
): void {
  if (landsInHand !== 0 || game.landsOnBattlefield().length < 3) return;
  const way = game.landWay();
  if (!way || way.kind === 'patron') return;
  const moonfolk = game.battlefield.filter((permanent) => {
    const returner = RETURNERS[permanent.card.name];
    return returner && returner[1] === 1 && returner[2] !== 'counter';
  });
  if (!moonfolk.length) return;
  const abilityMana = (permanent: Permanent) =>
    game.abilityCost(new Cost(RETURNERS[permanent.card.name][0])).manaValue;
  const effectBonus: Record<string, number> = {
    token: 6,
    loot: 3,
    untap: 4,
    mill: 0,
    none: 0,
  };
  const best = firstMax(
    moonfolk,
    (permanent) =>
      -10 * abilityMana(permanent) +
      effectBonus[RETURNERS[permanent.card.name][2]],
  );
  const mana = abilityMana(best);
  const hasLandfallPayoff =
    game.isOnBattlefield(AESI) ||
    game.isOnBattlefield(COBRA) ||
    game.isOnBattlefield(KHALNI) ||
    game.isOnBattlefield(KODAMA);
  if (hasLandfallPayoff && (mana <= 1 || main2))
    add(mana <= 1 ? 66 : 34, new Cost(mana), false, () =>
      bounceAndReplayLand(game, best),
    );
}

/** Meloku in the second main phase: tapped lands become Illusions, replayed next turn with spare drops. */
function addMelokuEndOfTurnCandidate(
  game: AesiGame,
  add: AddCandidate,
  main2: boolean,
  landsInHand: number,
): void {
  if (
    game.findPermanent(MELOKU) &&
    main2 &&
    landsInHand + 1 < game.dropsAllowed() &&
    game
      .landsOnBattlefield()
      .some((permanent) => permanent.tapped && permanent.land!.basic) &&
    game.landsOnBattlefield().length >= 6
  )
    add(30, game.abilityCost(new Cost(1)), false, () => melokuEndOfTurn(game));
}

/** The ability of one permanent on the battlefield (a sacrifice for lands, a level up, a dig...). */
function addPermanentAbilityCandidate(
  game: AesiGame,
  permanent: Permanent,
  add: AddCandidate,
  main2: boolean,
  landsInHand: number,
): void {
  const name = permanent.card.name;
  const isReady =
    !permanent.tapped && !(permanent.isCreature && permanent.sick);
  const basicLandInLibrary = game.library.some((card) => card.land?.basic);
  if (name === 'Sakura-Tribe Elder' && basicLandInLibrary)
    add(72, new Cost(), false, () => {
      game.sacrifice(permanent);
      return game.fetchBasic({ tapped: true });
    });
  else if (name === KHALNI && permanent.counters >= 3 && basicLandInLibrary)
    add(74, new Cost(), false, () => sacrificeKhalni(game, permanent));
  else if (
    name === MAP &&
    !permanent.tapped &&
    game.library.some((card) => card.land !== null) &&
    (wantsComboLand(game) || (main2 && landsInHand === 0 && game.canDrop()))
  )
    add(wantsComboLand(game) ? 93 : 45, new Cost(2), false, () =>
      useExpeditionMap(game, permanent),
    );
  else if (
    name === MYRIAD &&
    !permanent.tapped &&
    game.library.filter((card) => card.land?.basic).length >= 2
  )
    add(68, new Cost(2), false, () => useMyriadLandscape(game, permanent));
  else if (
    name === 'Demolition Field' &&
    !permanent.tapped &&
    basicLandInLibrary &&
    game.availMana() >= 3
  )
    add(main2 ? 46 : 40, new Cost(2), false, () =>
      useDemolitionField(game, permanent),
    );
  else if (name === DRUID && permanent.counters === 1)
    add(72, Cost.parse('{2}{G}'), false, () =>
      levelUpDruidClass(game, permanent, Cost.parse('{2}{G}')),
    );
  else if (
    name === DRUID &&
    permanent.counters === 2 &&
    game.landsOnBattlefield().length >= 8 &&
    !main2
  )
    add(48, Cost.parse('{4}{G}'), false, () =>
      levelUpDruidClass(game, permanent, Cost.parse('{4}{G}')),
    );
  else if (name === 'Loot, Exuberant Explorer' && isReady && main2) {
    const cost = game.abilityCost(Cost.parse('{4}{G}{G}'));
    add(44, cost, false, () => useLootDig(game, permanent, cost));
  } else if (name === BUDOKA && permanent.transformed && isReady && main2) {
    const cost = game.abilityCost(Cost.parse('{4}{G}{G}'));
    add(30, cost, false, () => useDokai(game, permanent, cost));
  }
}

/** Our lands as 2/2 creatures would kill the table this turn (after paying this much, sick lands first;
 *  with haste every untapped land attacks). Half of the ground attackers are blocked. */
export function isLandAttackLethal(
  game: AesiGame,
  costMv: number,
  haste: boolean,
): boolean {
  const lands = game
    .landsOnBattlefield()
    .filter((permanent) => !permanent.tapped);
  const landMana = lands.reduce(
    (total, permanent) =>
      total +
      (game.manaSourceKind(permanent) === 'GU' ||
      game.manaSourceKind(permanent) === 'C2'
        ? 2
        : 1),
    0,
  );
  const pay = Math.max(0, costMv - Math.max(0, game.availMana() - landMana));
  let landAttackerCount = haste
    ? lands.length
    : lands.filter((permanent) => !permanent.sick).length;
  const sickSpare = haste ? 0 : lands.length - landAttackerCount;
  landAttackerCount -= Math.max(0, pay - sickSpare);
  if (landAttackerCount <= 0) return false;
  const flyerPower = game
    .creatures()
    .filter(
      (permanent) =>
        permanent.card.flying && !permanent.tapped && !permanent.sick,
    )
    .reduce((total, permanent) => total + game.power(permanent), 0);
  const groundPowers: number[] = [
    ...game
      .creatures()
      .filter(
        (permanent) =>
          !permanent.card.flying &&
          !permanent.tapped &&
          !permanent.sick &&
          game.power(permanent) > 0,
      )
      .map((permanent) => game.power(permanent)),
    ...new Array(landAttackerCount).fill(2),
  ].sort((first, second) => second - first);
  return game.winsWith(
    flyerPower +
      groundPowers
        .slice(Math.floor(groundPowers.length / 2))
        .reduce((total, value) => total + value, 0),
  );
}

/** The Retreat loop is one Simic Growth Chamber / Guildless Commons away (a land tutor gets it). */
export function wantsComboLand(game: AesiGame): boolean {
  return (
    game.hasUntapper() &&
    game.battlefield.some(
      (permanent) => PUTTERS.has(permanent.card.name) && !permanent.sick,
    ) &&
    !game.hand.some((card) => card.land?.special === 'chamber') &&
    game.library.some((card) => card.land?.special === 'chamber')
  );
}

/** What a land tutor gets: the Retreat loop's Chamber, else the land with the most landfall. */
export function chooseLandTutorTarget(game: AesiGame): CardDef | null {
  const landsInLibrary = game.library.filter((card) => card.land !== null);
  if (!landsInLibrary.length) return null;
  if (wantsComboLand(game))
    return landsInLibrary.find((card) => card.land!.special === 'chamber')!;
  for (const landName of [
    MYRIAD,
    PASSAGE,
    'Evolving Wilds',
    'Terramorphic Expanse',
    CHAMBER,
    'Guildless Commons',
  ]) {
    const otherCard = landsInLibrary.find((card) => card.name === landName);
    if (otherCard) return otherCard;
  }
  const want = game.wantColour() === 'U' ? 'Island' : 'Forest';
  return landsInLibrary.find((card) => card.name === want) ?? landsInLibrary[0];
}

export function tutorLand(game: AesiGame, toBattlefield: boolean): void {
  const card = chooseLandTutorTarget(game);
  if (!card) return;
  if (toBattlefield)
    game.putLand(card, 'library', 'tutor onto the battlefield');
  else {
    game.takeCardIfThere(card, 'library');
    game.putCard(card, 'hand');
    game.say('land tutor ->', card);
  }
  game.shuffle();
}

export function useExpeditionMap(
  game: AesiGame,
  permanent: Permanent,
): boolean {
  if (!game.pay(new Cost(2))) return false;
  game.sacrifice(permanent);
  tutorLand(game, false);
  return true;
}

export function useMyriadLandscape(
  game: AesiGame,
  permanent: Permanent,
): boolean {
  if (!game.pay(new Cost(2))) return false;
  game.takeFromBattlefieldIfThere(permanent);
  game.putCard(permanent.card, 'graveyard');
  const want = game.wantColour() === 'U' ? 'Island' : 'Forest';
  const type =
    game.library.filter((card) => card.name === want).length >= 2
      ? want
      : want === 'Island'
        ? 'Forest'
        : 'Island';
  game.say('Myriad Landscape: two basics');
  game.fetchBasic({ tapped: true, only: type });
  game.fetchBasic({ tapped: true, only: type });
  return true;
}
