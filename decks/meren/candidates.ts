import {
  DEATH_VALUE,
  EDICT_ETB,
  FREE_OUTLETS,
  GRAY_MERCHANT,
  HOLD,
  MANA_ELVES,
  MEREN,
  TOKENS,
} from './cards';
import {
  activateFaunaShaman,
  activateGrist,
  activateInsidiousFungus,
  activateLiliana,
  activatePriest,
  activateVampiricRites,
  castBeastWithin,
  castEldritchEvolution,
  castGrist,
  castPreparedSpell,
  castSawInHalf,
  escapeWoeStrider,
  evokeCreature,
  sacrificeThenCast,
} from './actions';
import type { MerenGame } from './game';
import { CardDef, Cost } from '../../engine/cards';
import { Candidate, Permanent } from '../../engine/game-types';

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
  addGraveyardAndMillCandidates(game, add);
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
      add(game.myLife > 12 ? 55 : 25, cost, true, () =>
        game.castInstantOrSorcery(card),
      );
      return true;
    case 'Village Rites': {
      const toSacrifice = sacrificeOrder.find(
        (permanent) => permanent.token || DEATH_VALUE.has(permanent.card.name),
      );
      if (toSacrifice)
        add(52, cost, true, () => sacrificeThenCast(game, card, toSacrifice));
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
          merenOut && game.experience >= 5 ? 'gy' : 'hand',
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
    case 'Deadly Brew':
      if (sacrificeOrder.some((permanent) => permanent.token))
        add(45, cost, false, () => game.castInstantOrSorcery(card));
      return true;
    case 'Beast Within': {
      const target = sacrificeOrder.find(
        (permanent) => permanent.token && game.power(permanent) < 3,
      );
      if (target)
        add(35, cost, true, () => castBeastWithin(game, card, target));
      return true;
    }
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
      const expendable = game
        .sacrificeOrder([permanent])
        .filter(
          (candidate) =>
            candidate.token ||
            DEATH_VALUE.has(candidate.card.name) ||
            game.battlefieldValue(candidate.card) < 50,
        );
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
    } else if (main2 && name === 'Sakura-Tribe Elder')
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
        (candidate) => candidate.token && candidate.card !== TOKENS.stolen,
      );
      if (token)
        add(30, Cost.parse('{1}{B}'), false, () =>
          activateVampiricRites(game, token),
        );
    }
  }
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
