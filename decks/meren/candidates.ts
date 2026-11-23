import {
  DEATH_VALUE,
  EDICT_ETB,
  FREE_OUTLETS,
  GRAY_MERCHANT,
  HOLD,
  MANA_ELVES,
  MEREN,
  RISE_MIN_CREATURES,
  TOKENS,
} from './cards';
import {
  activateFaunaShaman,
  activateGrist,
  activateInsidiousFungus,
  activateLiliana,
  activatePriest,
  activateVampiricRites,
  castEldritchEvolution,
  castGrist,
  castPreparedSpell,
  castSawInHalf,
  escapeWoeStrider,
  evokeCreature,
  sacrificeThenCast,
  activateWight,
} from './actions';
import { activateGrimBackwoods } from './actions';
import type { MerenGame } from './game';
import {
  AYARA,
  GREATER_GOOD,
  MOLDERVINE_RECLAMATION,
  SKULLCLAMP,
  castSacrificeDrawSpell,
  clampCreature,
  crackClue,
  sacrificeToAyara,
  sacrificeToGreaterGood,
} from '../../engine/game/card-draw';
import { CLUE } from '../../engine/cards/tokens';
import {
  EVOLUTIONARY_LEAP,
  FIEND_ARTISAN,
  PROMISE_OF_ACLAZOTZ,
  SIDISI_REGENT,
  activateFiendArtisan,
  activateSidisi,
  castFoulRebirth,
  castFromAdventure,
  fiendArtisanCost,
  isDemon,
} from '../../engine/game/sacrifice-outlets';
import { CardDef, Cost } from '../../engine/cards/cards';
import { Candidate, Permanent } from '../../engine/game/game-types';

// ================================================================ what to do now
/** Adds one thing the AI may do: its score, what it costs, whether it is an instant or sorcery, and how to do it. */
type AddCandidate = (
  score: number,
  cost: Cost,
  isInstantOrSorcery: boolean,
  action: () => boolean,
  rockCard?: CardDef,
) => void;

/** Everything the AI may do now, with a score each (higher first). */
export function buildCandidates(game: MerenGame, main2: boolean): Candidate[] {
  const candidates: Candidate[] = [];
  const add: AddCandidate = (score, cost, isInstantOrSorcery, action, rock) =>
    candidates.push({
      score,
      cost,
      isInstantOrSorcery: isInstantOrSorcery,
      action: action,
      rock,
    });
  const merenOut = game.isOnBattlefield(MEREN);
  const sacrificeOrder = game.sacrificeOrder();
  for (const commander of game.command.slice())
    add(
      95,
      game.commanderCost(commander, game.effectiveCost(commander)),
      false,
      () => game.castPerm(commander, true),
    );
  const seenNames = new Set<string>();
  for (const card of game.hand.slice()) {
    if (seenNames.has(card.name) || card.land !== null) continue;
    seenNames.add(card.name);
    if (card.isCreature)
      addCreatureCandidate(game, card, add, merenOut, sacrificeOrder);
    else if (!HOLD.has(card.name))
      addNonCreatureCandidate(game, card, add, merenOut, sacrificeOrder);
  }
  addPermanentAbilityCandidates(game, add, main2, sacrificeOrder);
  for (const card of game.cardsOnAdventure)
    if (game.exile.includes(card))
      add(45, game.effectiveCost(card), false, () =>
        castFromAdventure(game, card),
      );
  addGraveyardAndMillCandidates(game, add);
  if (main2) addClueCandidate(game, add);
  return candidates;
}

/** Casting a creature from hand (Shriekmaw may also be evoked). */
function addCreatureCandidate(
  game: MerenGame,
  card: CardDef,
  add: AddCandidate,
  merenOut: boolean,
  sacrificeOrder: Permanent[],
): void {
  const name = card.name;
  let score = game.battlefieldValue(card);
  if (
    MANA_ELVES.has(name) ||
    name === 'Sakura-Tribe Elder' ||
    name === 'Simulacrum Shaper' ||
    name === 'Solemn Simulacrum'
  )
    score = game.turn <= 4 ? 85 : 40;
  if (name === GRAY_MERCHANT)
    score = Math.min(99, 8 * (game.devotion('B') + 2));
  if (name === 'Lotleth Giant')
    score = Math.min(99, 6 * game.creaturesInGraveyard());
  if (
    name === 'Disciple of Bolas' &&
    !sacrificeOrder.some((permanent) => game.power(permanent) >= 2)
  )
    score = 10;
  if (
    EDICT_ETB.has(name) &&
    !(
      merenOut &&
      sacrificeOrder.some(
        (permanent) => permanent.token || DEATH_VALUE.has(permanent.card.name),
      )
    )
  )
    score = 30;
  if (name === 'Shriekmaw') {
    // evoke for {1}{B}: it dies right away (a cheap Meren target and an experience counter)
    if (merenOut)
      add(48, game.effectiveCost(card, Cost.parse('{1}{B}')), false, () =>
        evokeCreature(game, card),
      );
    score = 20;
  }
  if (name === 'Twilight Diviner' || FREE_OUTLETS.includes(name))
    score = Math.max(score, 80);
  add(score, game.effectiveCost(card), false, () => game.castPerm(card));
}

/** Casting a noncreature card from hand. */
function addNonCreatureCandidate(
  game: MerenGame,
  card: CardDef,
  add: AddCandidate,
  merenOut: boolean,
  sacrificeOrder: Permanent[],
): void {
  if (addRampAndDrawCandidate(game, card, add, merenOut, sacrificeOrder))
    return;
  if (addReanimationCandidate(game, card, add, sacrificeOrder)) return;
  if (card.isInstantOrSorcery)
    add(30, game.effectiveCost(card), true, () =>
      game.castInstantOrSorcery(card),
    );
  else if (card.types.has('artifact') || card.types.has('enchantment'))
    add(40, game.effectiveCost(card), false, () => game.castPerm(card));
}

/** Mana, card draw, drain and tutor spells. Returns false if the card is not one of them. */
function addRampAndDrawCandidate(
  game: MerenGame,
  card: CardDef,
  add: AddCandidate,
  merenOut: boolean,
  sacrificeOrder: Permanent[],
): boolean {
  const cost = game.effectiveCost(card);
  switch (card.name) {
    case 'Sol Ring':
      add(100, cost, false, () => game.castPerm(card), card);
      return true;
    case 'Phyrexian Arena':
      add(game.myLife > 20 ? 66 : 10, cost, false, () => game.castPerm(card));
      return true;
    case 'Vampiric Rites':
      add(55, cost, false, () => game.castPerm(card));
      return true;
    case 'Grist, the Hunger Tide':
      add(70, cost, false, () => castGrist(game, card));
      return true;
    case 'Dark Ritual':
    case 'Songs of the Damned':
      // only worth it as a ritual (see ritualCandidates)
      if (
        card.name === 'Songs of the Damned' &&
        game.creaturesInGraveyard() >= 4
      )
        add(50, cost, true, () => game.castInstantOrSorcery(card));
      return true;
    case 'Decode Transmissions':
    case 'Diresight':
    case "Night's Whisper":
      add(game.myLife > 12 ? 55 : 25, cost, true, () =>
        game.castInstantOrSorcery(card),
      );
      return true;
    case 'Village Rites': {
      const toSacrifice = game.expendableCreatures()[0];
      if (toSacrifice)
        add(52, cost, true, () => sacrificeThenCast(game, card, toSacrifice));
      return true;
    }
    case 'Deadly Dispute':
    case 'Costly Plunder': {
      const toSacrifice = game.chooseSacrificeForDraw(true);
      if (toSacrifice)
        add(54, cost, true, () =>
          castSacrificeDrawSpell(game, card, [toSacrifice]),
        );
      return true;
    }
    case 'Plumb the Forbidden': {
      const toSacrifice = game.choosePlumbSacrifices();
      if (toSacrifice.length)
        add(52, cost, true, () =>
          castSacrificeDrawSpell(game, card, toSacrifice),
        );
      return true;
    }
    case SKULLCLAMP:
      add(70, cost, false, () => game.castPerm(card));
      return true;
    case MOLDERVINE_RECLAMATION:
      add(55, cost, false, () => game.castPerm(card));
      return true;
    case GREATER_GOOD:
      add(52, cost, false, () => game.castPerm(card));
      return true;
    case EVOLUTIONARY_LEAP:
      add(55, cost, false, () => game.castPerm(card));
      return true;
    case PROMISE_OF_ACLAZOTZ: {
      // Foul Rebirth first (a 4/3 flyer for a creature Meren can return), then the enchantment from exile
      const toSacrifice = game
        .expendableCreatures()
        .find((permanent) => !isDemon(permanent.card));
      if (toSacrifice)
        add(58, game.effectiveCost(card, FOUL_REBIRTH_COST), true, () =>
          castFoulRebirth(game, card, toSacrifice),
        );
      add(35, cost, false, () => game.castPerm(card));
      return true;
    }
    case 'Breach the Multiverse':
      add(88, cost, false, () => game.castInstantOrSorcery(card));
      return true;
    case 'Grisly Salvage':
      add(45, cost, true, () => game.castInstantOrSorcery(card));
      return true;
    case 'Buried Alive':
      add(
        merenOut ||
          game.hand.some((candidate) =>
            /Persist|Unearth|Victimize/.test(candidate.name),
          )
          ? 62
          : 40,
        cost,
        false,
        () => game.castInstantOrSorcery(card),
      );
      return true;
    case "Dina's Guidance":
      add(60, cost, true, () =>
        game.castInstantOrSorcery(
          card,
          false,
          null,
          merenOut && game.experienceCounters >= 5 ? 'gy' : 'hand',
        ),
      );
      return true;
    default:
      return false;
  }
}

/** Reanimation, sacrifice and token-making spells. Returns false if the card is not one of them. */
function addReanimationCandidate(
  game: MerenGame,
  card: CardDef,
  add: AddCandidate,
  sacrificeOrder: Permanent[],
): boolean {
  const name = card.name;
  const cost = game.effectiveCost(card);
  switch (name) {
    case 'Persist':
    case 'Unearth': {
      const target = game.bestCreatureInGraveyard(
        (candidate) => name === 'Persist' || candidate.manaValue <= 3,
      );
      if (target)
        add(Math.min(90, game.battlefieldValue(target)), cost, false, () =>
          game.castInstantOrSorcery(card),
        );
      return true;
    }
    case 'Victimize': {
      const creaturesInGraveyard = game.graveyard.filter(
        (candidate) => candidate.isCreature,
      ).length;
      const toSacrifice = sacrificeOrder[0];
      if (creaturesInGraveyard >= 2 && toSacrifice)
        add(75, cost, false, () => sacrificeThenCast(game, card, toSacrifice));
      return true;
    }
    case 'Eldritch Evolution': {
      const toSacrifice = sacrificeOrder[0];
      if (toSacrifice)
        add(60, cost, false, () =>
          castEldritchEvolution(game, card, toSacrifice),
        );
      return true;
    }
    case 'Saw in Half': {
      const target =
        game.findPermanent(GRAY_MERCHANT) ?? game.findPermanent('Grave Titan');
      if (target)
        add(target.card.name === GRAY_MERCHANT ? 92 : 60, cost, true, () =>
          castSawInHalf(game, card, target),
        );
      return true;
    }
    case 'Rise of the Dark Realms': {
      // every creature card in every graveyard onto the battlefield: only with several worth having
      const creatureCards = game.creaturesInGraveyard();
      if (creatureCards >= RISE_MIN_CREATURES)
        add(88, cost, true, () => game.castInstantOrSorcery(card));
      return true;
    }
    case 'Deadly Brew':
      if (sacrificeOrder.some((permanent) => permanent.token))
        add(45, cost, false, () => game.castInstantOrSorcery(card));
      return true;
    default:
      return false;
  }
}

/** The abilities of permanents on the battlefield. */
function addPermanentAbilityCandidates(
  game: MerenGame,
  add: AddCandidate,
  main2: boolean,
  sacrificeOrder: Permanent[],
): void {
  for (const permanent of game.battlefield) {
    const name = permanent.card.name;
    const isReady = !permanent.tapped && !permanent.sick;
    if (name === 'Priest of Forgotten Gods' && isReady) {
      const expendable = game.expendableCreatures([permanent]);
      if (expendable.length >= 2)
        add(78, new Cost(), false, () =>
          activatePriest(game, permanent, expendable[0], expendable[1]),
        );
    } else if (name === 'Fauna Shaman' && isReady) {
      if (game.hand.some((card) => card.isCreature))
        add(58, new Cost(0, 0, 0, 0, 0, 0, 1), false, () =>
          activateFaunaShaman(game, permanent),
        );
    } else if (name === 'Liliana the Repentant' && !game.lilianaUsed) {
      const best = game.bestCreatureInGraveyard();
      if (best && game.battlefieldValue(best) >= 60)
        add(70, Cost.parse('{5}{B}'), false, () =>
          activateLiliana(game, permanent),
        );
    } else if (name === 'Grist, the Hunger Tide' && !game.gristUsed)
      add(64, new Cost(), false, () => activateGrist(game, permanent));
    else if (name === 'Studious First-Year' && game.prepared.has(permanent))
      add(72, Cost.parse('{1}{G}'), false, () =>
        castPreparedSpell(game, permanent),
      );
    else if (name === 'Grave Researcher' && game.prepared.has(permanent)) {
      const best = game.bestCreatureInGraveyard();
      if (
        best &&
        game.battlefieldValue(best) >= 60 &&
        best.manaValue < game.myLife - 10
      )
        add(74, Cost.parse('{B}'), false, () =>
          castPreparedSpell(game, permanent),
        );
    } else if (main2 && name === 'Wight of the Reliquary' && isReady) {
      // {T}, sacrifice another creature: a land onto the battlefield tapped (and Meren's experience)
      const toSacrifice = game.expendableCreatures([permanent])[0];
      if (toSacrifice && game.library.some((card) => card.land !== null))
        add(48, new Cost(), false, () =>
          activateWight(game, permanent, toSacrifice),
        );
    } else if (name === SKULLCLAMP) {
      // equip {1} to a 1-toughness creature we don't mind losing: it dies and we draw two
      const target = sacrificeOrder.find(
        (creature) =>
          game.toughness(creature) <= 1 && game.sacrificeCost(creature) <= 25,
      );
      if (target)
        add(75, new Cost(1), false, () => clampCreature(game, target));
    } else if (name === GREATER_GOOD) {
      const toSacrifice = game.chooseGreaterGoodSacrifice();
      if (toSacrifice)
        add(56, new Cost(), false, () =>
          sacrificeToGreaterGood(game, toSacrifice),
        );
    } else if (main2 && name === AYARA && isReady) {
      const toSacrifice = game.expendableCreatures([permanent])[0];
      if (toSacrifice)
        add(50, new Cost(), false, () =>
          sacrificeToAyara(game, permanent, toSacrifice),
        );
    } else if (main2 && name === 'Grim Backwoods' && !permanent.tapped) {
      const toSacrifice = game.expendableCreatures()[0];
      if (toSacrifice)
        add(44, Cost.parse('{2}{B}{G}'), false, () =>
          activateGrimBackwoods(game, permanent, toSacrifice),
        );
    } else if (name === FIEND_ARTISAN && isReady)
      addFiendArtisanCandidate(game, permanent, add);
    else if (name === SIDISI_REGENT && isReady)
      addSidisiCandidate(game, permanent, add);
    else if (main2 && name === 'Sakura-Tribe Elder')
      add(50, new Cost(), false, () => {
        game.sacrifice(permanent);
        game.fetchBasic();
        return true;
      });
    else if (main2 && name === 'Insidious Fungus')
      add(35, new Cost(2), false, () =>
        activateInsidiousFungus(game, permanent),
      );
    else if (main2 && name === 'Vampiric Rites') {
      const token = sacrificeOrder.find(
        (candidate) => candidate.token && !game.isStolen(candidate),
      );
      if (token)
        add(30, Cost.parse('{1}{B}'), false, () =>
          activateVampiricRites(game, token),
        );
    }
  }
}

/** Foul Rebirth, Promise of Aclazotz's adventure. */
const FOUL_REBIRTH_COST = Cost.parse('{2}{B}');
/** Fiend Artisan and Sidisi only fetch a creature worth at least this much. */
const POD_TARGET_MIN_VALUE = 55;
/** Fiend Artisan's X is tried up to this. */
const FIEND_ARTISAN_MOST_X = 10;

/** Fiend Artisan: sacrifice a creature we don't mind losing for the best creature of the library we can pay X for. */
function addFiendArtisanCandidate(
  game: MerenGame,
  artisan: Permanent,
  add: AddCandidate,
): void {
  const toSacrifice = game.expendableCreatures([artisan])[0];
  if (!toSacrifice) return;
  let mostX = -1;
  while (
    mostX < FIEND_ARTISAN_MOST_X &&
    fiendArtisanCost(game, mostX + 1) !== null
  )
    mostX++;
  const choices = game.library.filter(
    (card) => card.isCreature && card.manaValue <= mostX,
  );
  if (!choices.length) return;
  const target = mostValuable(game, choices);
  if (game.battlefieldValue(target) < POD_TARGET_MIN_VALUE) return;
  // X just big enough for it; the card itself is picked after the sacrifice (a death trigger may change the library)
  const x = target.manaValue;
  add(66, fiendArtisanCost(game, x)!, false, () =>
    activateFiendArtisan(game, artisan, toSacrifice, x, (cards) =>
      mostValuable(game, cards),
    ),
  );
}

function mostValuable(game: MerenGame, cards: CardDef[]): CardDef {
  return cards.reduce((best, card) =>
    game.battlefieldValue(card) > game.battlefieldValue(best) ? card : best,
  );
}

/** Sidisi: sacrifice a creature of mana value X for the best creature card of mana value X + 1 in the graveyard,
 *  when that trade gains enough. */
function addSidisiCandidate(
  game: MerenGame,
  sidisi: Permanent,
  add: AddCandidate,
): void {
  let bestCreature: Permanent | null = null;
  let bestTarget: CardDef | null = null;
  let bestGain = 0;
  for (const creature of game.sacrificeOrder([sidisi])) {
    if (game.isStolen(creature)) continue;
    for (const card of game.graveyard) {
      if (!card.isCreature || card.manaValue !== creature.card.manaValue + 1)
        continue;
      const gain = game.battlefieldValue(card) - game.sacrificeCost(creature);
      if (
        gain > bestGain &&
        game.battlefieldValue(card) >= POD_TARGET_MIN_VALUE
      ) {
        bestGain = gain;
        bestCreature = creature;
        bestTarget = card;
      }
    }
  }
  if (bestCreature && bestTarget) {
    const creature = bestCreature;
    const target = bestTarget;
    add(65, new Cost(), false, () =>
      activateSidisi(game, sidisi, creature, target),
    );
  }
}

/** Tireless Tracker's Clues: {2}, sacrifice: draw a card (with mana to spare, after the spells). */
function addClueCandidate(game: MerenGame, add: AddCandidate): void {
  const clue = game.battlefield.find((permanent) => permanent.card === CLUE);
  if (clue) add(36, new Cost(2), false, () => crackClue(game, clue));
}

/** Skull Prophet's mill, Reassembling Skeleton's return and Woe Strider's escape. */
function addGraveyardAndMillCandidates(
  game: MerenGame,
  add: AddCandidate,
): void {
  // Skull Prophet: {T}: mill two cards (its mana, B or G, is "any colour" here: the deck only uses those two)
  const skullProphet = game.battlefield.find(
    (permanent) =>
      permanent.card.name === 'Skull Prophet' &&
      !permanent.tapped &&
      !permanent.sick,
  );
  if (skullProphet && game.library.length > 6)
    add(20, Cost.parse('{0}'), false, () => {
      skullProphet.tapped = true;
      game.millOurselves(2);
      return true;
    });
  // Reassembling Skeleton: {1}{B} returns it from the graveyard tapped (only worth it with mana to spare)
  const skeleton = game.graveyard.find(
    (card) => card.name === 'Reassembling Skeleton',
  );
  if (skeleton)
    add(25, game.effectiveCost(skeleton, Cost.parse('{1}{B}')), false, () => {
      if (!game.pay(game.effectiveCost(skeleton, Cost.parse('{1}{B}')), false))
        return false;
      game.reanimate(skeleton, { tapped: true });
      return true;
    });
  // Woe Strider: escape from the graveyard
  const woeStrider = game.graveyard.find((card) => card.name === 'Woe Strider');
  if (
    woeStrider &&
    game.graveyard.filter((card) => card !== woeStrider && !card.isCreature)
      .length >= 4
  )
    add(
      40,
      game.effectiveCost(woeStrider, Cost.parse('{3}{B}{B}')),
      false,
      () => escapeWoeStrider(game, woeStrider),
    );
}
