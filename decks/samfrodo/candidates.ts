import {
  CLUE,
  FOOD,
  GOLLUM,
  HOLD,
  OWN_KILL,
  RAMP_EARLY,
  SAM,
  TOK,
} from './cards';
import {
  activateLobelia,
  activateShireTerrace,
  activateTradingPost,
  activateWitchsOven,
  artifactToSacrifice,
  castFarmerCotton,
  payAndActivate,
  payTapAndActivate,
  returnCauldronFamiliar,
  sacrificeFoodsToDraw,
  valueOfGainingLife,
} from './actions';
import { eatFood } from './combat';
import type { SamFrodoGame } from './game';
import { CardDef, Cost } from '../../engine/cards';
import { Cand, Perm } from '../../engine/game-types';
import { removeIfPresent } from '../../engine/lists';

/** Adds one thing the AI may do: its score, what it costs, whether it is an instant or sorcery, and how to do it. */
type AddCandidate = (
  score: number,
  cost: Cost,
  isInstantOrSorcery: boolean,
  action: () => boolean,
  rockCard?: CardDef,
) => void;

/** Everything the AI may do now, with a score each (higher first). */
export function buildCandidates(game: SamFrodoGame, main2: boolean): Cand[] {
  const candidates: Cand[] = [];
  const add: AddCandidate = (score, cost, isInstantOrSorcery, action, rock) =>
    candidates.push({
      score,
      cost,
      isInstantOrSorcery: isInstantOrSorcery,
      action: action,
      rock,
    });
  const isEarly = game.manaSources() < 6;
  const hasSanguineBond = game.isOnBattlefield('Sanguine Bond');
  for (const commander of game.command.slice())
    add(
      commander.name === SAM ? 90 : 86,
      game.commanderCost(commander, game.effCost(commander)),
      false,
      () => game.castPerm(commander, true),
    );
  addOwnRemovalOnRapaciousGuest(game, add, main2);
  const seenNames = new Set<string>();
  for (const card of game.hand.slice()) {
    if (seenNames.has(card.name) || card.land !== null || HOLD.has(card.name))
      continue;
    seenNames.add(card.name);
    addCardInHandCandidate(game, card, add, isEarly, hasSanguineBond);
  }
  addAbilityCandidates(game, add, main2, hasSanguineBond);
  return candidates;
}

/** Removal on our own Rapacious Guest: it drains its power when it leaves the battlefield. */
function addOwnRemovalOnRapaciousGuest(
  game: SamFrodoGame,
  add: AddCandidate,
  main2: boolean,
): void {
  const guest = game.findPermanent('Rapacious Guest');
  if (
    !guest ||
    !main2 ||
    !game.config.own_removal ||
    game.power(guest) < (game.config.own_removal_power as number)
  )
    return;
  const removal = OWN_KILL.map((name) =>
    game.hand.find((card) => card.name === name),
  ).find((card) => card !== undefined);
  if (removal)
    add(
      Math.min(97, 50 + 4 * game.power(guest)),
      game.effCost(removal),
      true,
      () => game.castInstantOrSorcery(removal),
    );
}

/** Casting one card from hand. */
function addCardInHandCandidate(
  game: SamFrodoGame,
  card: CardDef,
  add: AddCandidate,
  isEarly: boolean,
  hasSanguineBond: boolean,
): void {
  const name = card.name;
  const cost = game.effCost(card);
  let score = game.battlefieldValue(card);
  if (RAMP_EARLY.has(name)) score = isEarly ? 85 : 25;
  switch (name) {
    case 'Sol Ring':
      add(100, cost, false, () => game.castPerm(card), card);
      return;
    case 'Arcane Signet':
      if (isEarly) {
        add(88, cost, false, () => game.castPerm(card), card);
        return;
      }
      break;
    case 'Cultivate':
    case 'Farseek':
      if (game.library.some((candidate) => candidate.land?.basic))
        add(score, cost, false, () => game.castInstantOrSorcery(card));
      return;
    case "Night's Whisper":
      if (game.myLife > 8)
        add(52, cost, false, () => game.castInstantOrSorcery(card));
      return;
    case 'Harmonize':
      add(58, cost, false, () => game.castInstantOrSorcery(card));
      return;
    case 'Farmer Cotton': {
      let xValue = 0;
      while (xValue < 12 && game.canPay(card.cost.withGeneric(xValue + 1)))
        xValue++;
      if (xValue >= (game.config.cotton_min_x as number))
        add(
          Math.min(95, 35 + 9 * xValue),
          card.cost.withGeneric(xValue),
          false,
          () => castFarmerCotton(game, card, xValue),
        );
      return;
    }
    case 'Second Harvest': {
      const tokenCount = game.battlefield.filter(
        (permanent) => permanent.token,
      ).length;
      if (tokenCount >= 4)
        add(Math.min(96, 30 + 6 * tokenCount), cost, true, () =>
          game.castInstantOrSorcery(card),
        );
      return;
    }
    case 'Crypt Incursion': {
      const creaturesInGraveyard = game.graveyard.filter(
        (candidate) => candidate.isCreature,
      ).length;
      const familiarLoop =
        game.graveyard.some(
          (candidate) => candidate.name === 'Cauldron Familiar',
        ) && game.isOnBattlefield("Witch's Oven");
      if (creaturesInGraveyard >= 2 && !familiarLoop)
        add(
          hasSanguineBond
            ? 30 + 8 * creaturesInGraveyard
            : 10 + 3 * creaturesInGraveyard,
          cost,
          true,
          () => game.castInstantOrSorcery(card),
        );
      return;
    }
  }
  if (name === 'Sanguine Bond') score = 88;
  if (name === 'Cauldron Familiar' && game.isOnBattlefield("Witch's Oven"))
    score = 80;
  if (
    name === "Witch's Oven" &&
    (game.hand.some((candidate) => candidate.name === 'Cauldron Familiar') ||
      game.isOnBattlefield('Cauldron Familiar'))
  )
    score = Math.max(score, 75);
  add(score, cost, false, () => game.castPerm(card));
}

/** The abilities of permanents on the battlefield, cracking a Clue, and eating a Food. */
function addAbilityCandidates(
  game: SamFrodoGame,
  add: AddCandidate,
  main2: boolean,
  hasSanguineBond: boolean,
): void {
  const spareFodder = game.spareSacrifices();
  const foodCost = new Cost(game.isOnBattlefield(SAM) ? 1 : 2);
  const familiar = game.graveyard.find(
    (card) => card.name === 'Cauldron Familiar',
  );
  if (familiar && game.foodsOnBattlefield().length)
    add(74, new Cost(), false, () => returnCauldronFamiliar(game, familiar));
  for (const permanent of game.battlefield)
    addPermanentAbilityCandidate(
      game,
      permanent,
      add,
      main2,
      hasSanguineBond,
      spareFodder,
    );
  // crack a Clue (one candidate, whichever Clue)
  const clue = game.battlefield.find((permanent) => permanent.card === CLUE);
  if (clue && main2)
    add(38, new Cost(2), false, () =>
      payAndActivate(game, new Cost(2), () => {
        game.sacrifice(clue);
        game.draw(1);
      }),
    );
  // eat a Food: 3 life (drains with Sanguine Bond, feeds Gollum / Frodo / The Gaffer / Gwaihir)
  const food = spareFodder.find((permanent) => permanent.card === FOOD);
  if (food && main2) {
    const value = valueOfGainingLife(game, 3);
    if (value > 0)
      add(Math.min(70, 20 + value), foodCost, false, () => eatFood(game, food));
  }
}

/** The ability of one permanent: Witch's Oven, Lobelia, Trading Post, the Food makers and so on. */
function addPermanentAbilityCandidate(
  game: SamFrodoGame,
  permanent: Perm,
  add: AddCandidate,
  main2: boolean,
  hasSanguineBond: boolean,
  spareFodder: Perm[],
): void {
  const name = permanent.card.name;
  const isReady =
    !permanent.tapped && !(permanent.isCreature && permanent.sick);
  const spareFoodCount = spareFodder.filter(
    (candidate) => candidate.card === FOOD,
  ).length;
  if (name === "Witch's Oven" && !permanent.tapped) {
    const familiar = game.findPermanent('Cauldron Familiar');
    const victim =
      familiar ?? spareFodder.find((candidate) => candidate.isCreature) ?? null;
    if (victim)
      add(
        familiar ? 76 : 40 + 4 * game.sacrificeValue(victim),
        new Cost(),
        false,
        () => activateWitchsOven(game, permanent, victim),
      );
  } else if (name === 'Umbral Collar Zealot' && main2) {
    const toSacrifice = spareFodder.find(
      (candidate) =>
        candidate !== permanent && game.sacrificeValue(candidate) >= 3,
    );
    if (toSacrifice)
      add(45 + 3 * game.sacrificeValue(toSacrifice), new Cost(), false, () => {
        game.sacrifice(toSacrifice);
        game.scry(1, true);
        return true;
      });
  } else if (name === 'Lobelia, Defender of Bag End' && isReady) {
    const artifact = artifactToSacrifice(game);
    if (artifact)
      add(82, new Cost(), false, () =>
        activateLobelia(game, permanent, artifact),
      );
  } else if (name === 'Trading Post' && isReady) {
    addTradingPostCandidate(game, permanent, add, main2, hasSanguineBond);
  } else if (name === 'Savvy Hunter' && main2 && spareFoodCount >= 2)
    add(36, new Cost(), false, () => sacrificeFoodsToDraw(game, 2));
  else if (name === 'Peregrin Took' && main2 && spareFoodCount >= 3)
    add(32, new Cost(), false, () => sacrificeFoodsToDraw(game, 3));
  else if (name === 'Pippin, Warden of Isengard' && isReady && main2)
    add(30, new Cost(1), false, () =>
      payTapAndActivate(game, permanent, new Cost(1), () =>
        game.makeTokens([FOOD]),
      ),
    );
  else if (name === 'Nuka-Cola Vending Machine' && !permanent.tapped && main2)
    add(33, new Cost(1), false, () =>
      payTapAndActivate(game, permanent, new Cost(1), () =>
        game.makeTokens([FOOD]),
      ),
    );
  else if (name === 'Gilded Goose' && isReady && main2)
    add(20, Cost.parse('{1}{G}'), false, () =>
      payTapAndActivate(game, permanent, Cost.parse('{1}{G}'), () =>
        game.makeTokens([FOOD]),
      ),
    );
  else if (name === 'Dawn of Hope' && main2)
    add(28, Cost.parse('{3}{W}'), false, () =>
      payAndActivate(game, Cost.parse('{3}{W}'), () =>
        game.makeTokens([TOK.soldier]),
      ),
    );
  else if (
    name === 'Shire Terrace' &&
    !permanent.tapped &&
    game.library.some((card) => card.land?.basic)
  )
    add(40, new Cost(1), false, () => activateShireTerrace(game, permanent));
}

/** Trading Post: sacrifice an artifact to draw, discard a dead card for life, or lose 1 life for a Goat. */
function addTradingPostCandidate(
  game: SamFrodoGame,
  tradingPost: Perm,
  add: AddCandidate,
  main2: boolean,
  hasSanguineBond: boolean,
): void {
  const artifact = artifactToSacrifice(game);
  const deadCard = game.hand.find((card) => HOLD.has(card.name));
  if (artifact && main2)
    add(48, new Cost(1), false, () =>
      activateTradingPost(game, tradingPost, () => {
        game.sacrifice(artifact);
        game.draw(1);
      }),
    );
  else if (deadCard && (hasSanguineBond || game.isOnBattlefield(GOLLUM)))
    add(46, new Cost(1), false, () =>
      activateTradingPost(game, tradingPost, () => {
        removeIfPresent(game.hand, deadCard);
        game.graveyard.push(deadCard);
        game.gainLife(4);
      }),
    );
  else if (main2 && game.myLife > 15)
    add(26, new Cost(1), false, () =>
      activateTradingPost(game, tradingPost, () => {
        game.loseLife(1);
        game.makeTokens([TOK.goat]);
      }),
    );
}
