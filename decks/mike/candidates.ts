import {
  AQUEOUS_FORM,
  AVISHKAR_RACEWAY,
  ROIL_CARTOGRAPHER,
  LIVING_CONUNDRUM,
  PSYCHOSIS_CRAWLER,
  WATER_CRYSTAL,
  FOLIO_OF_FANCIES,
  HOLD,
  JACE,
  KRANG,
  LABORATORY_MANIAC,
  ATOMIC_MICROSIZER,
  MARK_ATOMIC_MICROSIZER,
  MARK_HAND_OF_VECNA,
  NERD_RAGE,
  ORMOS_ARCHIVE_KEEPER,
  ROGUES_PASSAGE,
  SPECTRAL_SAILOR,
  COMMANDERS_SPHERE,
  STRIX_LOOKOUT,
  TEFERIS_AGELESS_INSIGHT,
  SHIELDED_AETHER_THIEF,
  TWENTY_TOED_TOAD,
  HARMONIZED_TRIO,
  HAND_OF_VECNA,
  WIZARD_CLASS,
} from './cards';
import {
  activateHarmonizedTrio,
  activateJacePlusOne,
  castTreasureCruise,
  equipTo,
  levelUpWizardClass,
  payAndTap,
  useRoguesPassage,
} from './actions';
import type { MikeGame } from './game';
import { CardDef, Cost } from '../../engine/cards';
import { Candidate, Permanent } from '../../engine/game-types';

// ================================================================ what to do
/** Adds one thing the AI may do: its score, what it costs, whether it is an instant or sorcery, and how to do it. */
type AddCandidate = (
  score: number,
  cost: Cost,
  isInstantOrSorcery: boolean,
  action: () => boolean,
  rockCard?: CardDef,
) => void;

/** What the board and library look like, read once per call of buildCandidates. */
interface CandidateContext {
  isEarly: boolean; // few mana sources: ramp is worth more
  drawRoom: number; // how many draw events an effect may have before the library is too small
  hasWinPiece: boolean; // Laboratory Maniac or Jace is on the battlefield
  isLibraryLow: boolean; // the mill is near
}

/** Everything the AI may do now, with a score each (higher first). */
export function buildCandidates(game: MikeGame, main2: boolean): Candidate[] {
  game.purgeSpawns();
  const candidates: Candidate[] = [];
  const add: AddCandidate = (score, cost, isInstantOrSorcery, action, rock) =>
    candidates.push({
      score,
      cost,
      isInstantOrSorcery: isInstantOrSorcery,
      action: action,
      rock,
    });
  const context: CandidateContext = {
    isEarly: game.manaSources() < 6,
    drawRoom: game.maxDrawEvents(),
    hasWinPiece: game.hasMillWinPiece(),
    isLibraryLow: game.library.length <= (game.config.maniac_at as number),
  };
  for (const commander of game.command.slice())
    add(
      92,
      game.commanderCost(commander, game.effectiveCost(commander)),
      false,
      () => game.castPerm(commander, true),
    );
  const seenNames = new Set<string>();
  for (const card of game.hand.slice()) {
    if (seenNames.has(card.name) || card.land !== null || HOLD.has(card.name))
      continue;
    seenNames.add(card.name);
    addCardInHandCandidate(game, card, add, context);
  }
  abilityCandidates(
    game,
    candidates,
    main2,
    context.drawRoom,
    context.hasWinPiece,
  );
  return candidates;
}

/** Casting one card from hand. */
function addCardInHandCandidate(
  game: MikeGame,
  card: CardDef,
  add: AddCandidate,
  context: CandidateContext,
): void {
  if (addManaRockCandidate(game, card, add, context)) return;
  if (addEnginePieceCandidate(game, card, add, context)) return;
  if (addAuraAndEquipmentCandidate(game, card, add)) return;
  if (addDrawSpellCandidate(game, card, add, context)) return;
  addPermanentCandidate(game, card, add);
}

/** Mana rocks: worth casting early, much less later. */
function addManaRockCandidate(
  game: MikeGame,
  card: CardDef,
  add: AddCandidate,
  context: CandidateContext,
): boolean {
  const cost = game.effectiveCost(card);
  const castRock = () => game.castPerm(card);
  switch (card.name) {
    case 'Sol Ring':
      add(100, cost, false, castRock, card);
      return true;
    case 'Arcane Signet':
      add(context.isEarly ? 88 : 30, cost, false, castRock, card);
      return true;
    case 'Thought Vessel':
      add(context.isEarly ? 74 : 35, cost, false, castRock, card);
      return true;
    case COMMANDERS_SPHERE:
      add(context.isEarly ? 62 : 25, cost, false, castRock, card);
      return true;
    default:
      return false;
  }
}

/** The win pieces and the permanents that feed the draws: Maniac, Jace, Conundrum, Ormos, Crawler, Toad and so on. */
function addEnginePieceCandidate(
  game: MikeGame,
  card: CardDef,
  add: AddCandidate,
  context: CandidateContext,
): boolean {
  const name = card.name;
  const cost = game.effectiveCost(card);
  const cast = () => game.castPerm(card);
  const handSize = game.hand.length;
  let score = game.value(card);
  switch (name) {
    case LABORATORY_MANIAC:
    case JACE: {
      // win pieces: cast them when the mill is near (or early, if config says so)
      const isNear = context.isLibraryLow || game.isSafeToEmptyLibrary();
      score = isNear ? 97 : game.config.maniac_early ? score - 10 : 0;
      if (score > 0) add(score, cost, false, cast);
      return true;
    }
    case LIVING_CONUNDRUM:
    case ORMOS_ARCHIVE_KEEPER:
      score = game.library.length <= 30 ? score + 10 : score - 20;
      if (
        name === LIVING_CONUNDRUM &&
        game.countOnBattlefield(LABORATORY_MANIAC) +
          game.countOnBattlefield(JACE) ===
          0 &&
        game.library.length <= 12
      )
        score = 90;
      add(score, cost, false, cast);
      return true;
    case PSYCHOSIS_CRAWLER:
      add(game.cardsDrawnBy(3) >= 3 ? 74 : 66, cost, false, cast);
      return true;
    case TWENTY_TOED_TOAD:
      add(handSize >= 10 ? 90 : 76, cost, false, cast);
      return true;
    case WATER_CRYSTAL:
      add(handSize >= 3 ? 50 : 36, cost, false, cast);
      return true;
    case FOLIO_OF_FANCIES:
    case HARMONIZED_TRIO:
      add(score, cost, false, cast);
      return true;
    default:
      return false;
  }
}

/** Auras and equipment that go on our best attacker. */
function addAuraAndEquipmentCandidate(
  game: MikeGame,
  card: CardDef,
  add: AddCandidate,
): boolean {
  const name = card.name;
  const cost = game.effectiveCost(card);
  const cast = () => game.castPerm(card);
  const handSize = game.hand.length;
  switch (name) {
    case NERD_RAGE:
    case AQUEOUS_FORM:
      if (game.carrier())
        add(
          name === NERD_RAGE ? 56 : handSize >= 6 ? 46 : 30,
          cost,
          false,
          cast,
        );
      return true;
    case HAND_OF_VECNA:
      if (game.carrier() && handSize >= 5)
        add(handSize >= 10 ? 62 : 48, cost, false, cast);
      return true;
    case ATOMIC_MICROSIZER:
      if (game.carrier()) add(26, cost, false, cast);
      return true;
    default:
      return false;
  }
}

/** The draw spells. Returns false if the card is not one of them. */
function addDrawSpellCandidate(
  game: MikeGame,
  card: CardDef,
  add: AddCandidate,
  context: CandidateContext,
): boolean {
  const name = card.name;
  const cost = game.effectiveCost(card);
  const cast = () => game.castInstantOrSorcery(card);
  const score = game.value(card);
  const winPieceBonus = context.hasWinPiece ? 40 : 0;
  switch (name) {
    case 'Brainstorm':
    case 'Consider':
    case 'Tune the Narrative':
      if (game.mayDraw(1)) add(score + winPieceBonus, cost, true, cast);
      return true;
    case 'Frantic Search':
      if (game.mayDraw(2)) add(score + winPieceBonus, cost, true, cast);
      return true;
    case 'Flux':
    case 'Windfall':
      addRefillSpellCandidate(game, card, add, context);
      return true;
    case 'Pull from Tomorrow': {
      let xValue = Math.min(
        game.maxAffordableX(game.imitatorReady() ? 3 : 2),
        context.drawRoom,
      );
      if (!game.isSafeToEmptyLibrary()) xValue = Math.min(xValue, 6);
      if (xValue >= 2) {
        const xCost = Cost.parse('{U}{U}').withGeneric(xValue);
        add(
          Math.min(98, (context.hasWinPiece ? 70 : 30) + 4 * xValue),
          xCost,
          true,
          () => game.castInstantOrSorcery(card, false, xCost, `x=${xValue}`),
        );
      }
      return true;
    }
    case 'Treasure Cruise': {
      const baseCost = game.effectiveCost(card);
      const delve = Math.min(game.graveyard.length, baseCost.generic);
      const delvedCost = baseCost.withGeneric(baseCost.generic - delve);
      if (game.mayDraw(1))
        add(
          score + (context.hasWinPiece ? 30 : 0) - (delve < 3 ? 25 : 0),
          delvedCost,
          true,
          () => castTreasureCruise(game, card, delve),
        );
      return true;
    }
    default:
      return false;
  }
}

/** Flux and Windfall: discard the hand (or the dead cards) and draw again. Worth it when it empties the library with a
 *  protector out, or with Psychosis Crawler. */
function addRefillSpellCandidate(
  game: MikeGame,
  card: CardDef,
  add: AddCandidate,
  context: CandidateContext,
): void {
  const isFlux = card.name === 'Flux';
  const cost = game.effectiveCost(card);
  const cast = () => game.castInstantOrSorcery(card);
  const score = game.value(card);
  const discarded = game.hand.length - 1; // cards that get discarded (Flux: all of them when the mill is safe)
  const totalDrawn = game.refillDraws(discarded, isFlux);
  const hasKeeper = game.hand.some(
    (candidate) =>
      candidate !== card &&
      [
        LABORATORY_MANIAC,
        JACE,
        TWENTY_TOED_TOAD,
        PSYCHOSIS_CRAWLER,
        KRANG,
      ].includes(candidate.name),
  );
  const hasDeadCard = game.hand.some(
    (candidate) => candidate.land !== null || HOLD.has(candidate.name),
  );
  const crawlerCount = game.countOnBattlefield(PSYCHOSIS_CRAWLER);
  if (game.isSafeToEmptyLibrary()) {
    // a protector is out: a refill that draws the library out is the plan
    const emptiesLibrary = totalDrawn >= game.library.length;
    if (
      emptiesLibrary &&
      !(hasKeeper && !context.hasWinPiece && crawlerCount === 0)
    )
      add(context.hasWinPiece ? 99 : 70, cost, true, cast);
    else if (isFlux && game.mayDraw(2) && hasDeadCard)
      add(score, cost, true, cast);
    else if (!isFlux && discarded >= 4 && !hasKeeper && crawlerCount > 0)
      add(85, cost, true, cast);
  } else if (isFlux) {
    if (game.mayDraw(2) && hasDeadCard) add(score, cost, true, cast);
  } else if (
    discarded >= 4 &&
    totalDrawn <= game.library.length - (game.config.keep_library as number) &&
    (!hasKeeper || crawlerCount > 0)
  )
    add(crawlerCount ? 85 : 40, cost, true, cast);
}

/** Creatures, artifacts, enchantments and planeswalkers with no special rule of their own. */
function addPermanentCandidate(
  game: MikeGame,
  card: CardDef,
  add: AddCandidate,
): void {
  const name = card.name;
  let score = game.value(card);
  if (name === 'Volatile Stormdrake' || name === 'Thunderclap Drake')
    score +=
      name === 'Thunderclap Drake' &&
      game.hand.filter((candidate) => candidate.isInstantOrSorcery).length >= 2
        ? 10
        : 0;
  if (
    card.isCreature ||
    card.types.has('artifact') ||
    card.types.has('enchantment') ||
    card.types.has('planeswalker')
  ) {
    if (name === TEFERIS_AGELESS_INSIGHT && !game.mayDraw(2))
      score = Math.min(score, 30);
    add(score, game.effectiveCost(card), false, () => game.castPerm(card));
  }
}

/** What the ability candidates need to know about the turn. */
interface AbilityContext {
  isMain2: boolean;
  drawRoom: number; // how many draw events an effect may have before the library is too small
  hasWinPiece: boolean;
  winPieceBonus: number; // abilities that draw are worth more with a win piece out
}

/** Activated abilities of the permanents on the battlefield. */
export function abilityCandidates(
  game: MikeGame,
  candidates: Candidate[],
  main2: boolean,
  drawRoom: number,
  hasWinPiece: boolean,
): void {
  const add = (score: number, cost: Cost, action: () => boolean) =>
    candidates.push({ score, cost, isInstantOrSorcery: false, action: action });
  const context: AbilityContext = {
    isMain2: main2,
    drawRoom,
    hasWinPiece,
    winPieceBonus: hasWinPiece ? 40 : 0,
  };
  for (const permanent of game.battlefield) {
    if (addDrawAbilityCandidate(game, permanent, add, context)) continue;
    addCombatAbilityCandidate(game, permanent, add, context);
  }
}

type AddAbility = (score: number, cost: Cost, action: () => boolean) => void;

/** Abilities that draw cards or loot. Returns true if the permanent has one of them (even if not usable now). */
function addDrawAbilityCandidate(
  game: MikeGame,
  permanent: Permanent,
  add: AddAbility,
  context: AbilityContext,
): boolean {
  const { isMain2, winPieceBonus } = context;
  const isReady =
    !permanent.tapped && !(permanent.isCreature && permanent.sick);
  switch (permanent.card.name) {
    case SPECTRAL_SAILOR:
      if (game.mayDraw(1))
        add(
          40 + winPieceBonus,
          Cost.parse('{3}{U}'),
          () => game.pay(Cost.parse('{3}{U}')) && (game.draw(1), true),
        );
      return true;
    case STRIX_LOOKOUT:
      if (isReady)
        add(34, Cost.parse('{1}{U}'), () =>
          payAndTap(game, permanent, '{1}{U}', () => {
            game.draw(1);
            game.discard(1);
          }),
        );
      return true;
    case SHIELDED_AETHER_THIEF:
      if (isReady && game.energyCounters >= 3 && game.mayDraw(1))
        add(44 + winPieceBonus, new Cost(), () => {
          permanent.tapped = true;
          game.energyCounters -= 3;
          game.draw(1);
          return true;
        });
      return true;
    case ROIL_CARTOGRAPHER:
      if (isReady && game.energyCounters >= 6 && game.mayDraw(3))
        add(60 + winPieceBonus, new Cost(), () => {
          permanent.tapped = true;
          game.energyCounters -= 6;
          game.draw(3);
          return true;
        });
      return true;
    case COMMANDERS_SPHERE:
      if (game.mayDraw(1) && isMain2)
        add(30 + winPieceBonus, new Cost(), () => {
          game.dies(permanent);
          game.draw(1);
          return true;
        });
      return true;
    case AVISHKAR_RACEWAY:
      if (
        game.speed >= 4 &&
        isReady &&
        game.hand.some((card) => game.cardValue(card) < 30)
      )
        add(30, Cost.parse('{3}'), () =>
          payAndTap(game, permanent, '{3}', () => {
            game.discard(1);
            game.draw(1);
          }),
        );
      return true;
    default:
      return addEngineAbilityCandidate(game, permanent, add, context);
  }
}

/** Abilities of the draw engines: Folio of Fancies, Ormos, Wizard Class, Jace and Harmonized Trio. */
function addEngineAbilityCandidate(
  game: MikeGame,
  permanent: Permanent,
  add: AddAbility,
  context: AbilityContext,
): boolean {
  const { drawRoom, hasWinPiece, winPieceBonus } = context;
  const isReady =
    !permanent.tapped && !(permanent.isCreature && permanent.sick);
  switch (permanent.card.name) {
    case FOLIO_OF_FANCIES:
      if (isReady) {
        const xValue = Math.min(game.maxAffordableX(0, 2), drawRoom);
        if (xValue >= 1)
          add(
            Math.min(96, 30 + 6 * xValue + winPieceBonus),
            new Cost(2 * xValue),
            () =>
              payAndTap(game, permanent, '{' + 2 * xValue + '}', () => {
                game.draw(xValue);
                if (game.inArena()) game.arena!.eachDraws(game, xValue);
              }),
          );
      }
      return true;
    case ORMOS_ARCHIVE_KEEPER:
      addOrmosCandidate(game, add, winPieceBonus);
      return true;
    case WIZARD_CLASS:
      if (permanent.counters === 1)
        add(62, Cost.parse('{2}{U}'), () =>
          levelUpWizardClass(game, permanent, '{2}{U}', () => game.draw(2)),
        );
      else if (permanent.counters === 2 && game.cardsDrawnBy(1) >= 1)
        add(48, Cost.parse('{4}{U}'), () =>
          levelUpWizardClass(game, permanent, '{4}{U}', () => {}),
        );
      return true;
    case JACE:
      if (permanent.counters < 90 && !permanent.exhausted)
        add(
          hasWinPiece || game.isSafeToEmptyLibrary() ? 99 : 70,
          new Cost(),
          () => activateJacePlusOne(game, permanent),
        );
      return true;
    case HARMONIZED_TRIO:
      if (isReady) {
        const others = game
          .creatures()
          .filter((candidate) => candidate !== permanent && !candidate.tapped);
        if (others.length >= 2 && game.mayDraw(3))
          add(50 + winPieceBonus, Cost.parse('{U}'), () =>
            activateHarmonizedTrio(game, permanent, others),
          );
      }
      return true;
    default:
      return false;
  }
}

/** Ormos: put three cheap cards from hand into the graveyard and draw five. */
function addOrmosCandidate(
  game: MikeGame,
  add: AddAbility,
  winPieceBonus: number,
): void {
  const names = new Set<string>();
  const picks: CardDef[] = [];
  for (const card of game.hand
    .slice()
    .sort((first, second) => game.cardValue(first) - game.cardValue(second))) {
    if (names.has(card.name) || game.cardValue(card) > 50) continue;
    names.add(card.name);
    picks.push(card);
    if (picks.length === 3) break;
  }
  if (picks.length === 3 && game.mayDraw(5))
    add(50 + winPieceBonus, Cost.parse('{1}{U}{U}'), () => {
      if (!game.pay(Cost.parse('{1}{U}{U}'))) return false;
      for (const card of picks) {
        game.takeCardIfThere(card, 'hand');
        game.toGraveyard(card);
      }
      game.draw(5);
      return true;
    });
}

/** Abilities that help the attack: Thunderclap Drake, Rogue's Passage and the equipment. */
function addCombatAbilityCandidate(
  game: MikeGame,
  permanent: Permanent,
  add: AddAbility,
  context: AbilityContext,
): void {
  const name = permanent.card.name;
  const isReady =
    !permanent.tapped && !(permanent.isCreature && permanent.sick);
  if (
    name === 'Thunderclap Drake' &&
    game.commanderCasts > 0 &&
    game.hand.some((card) =>
      ['Windfall', 'Flux', 'Pull from Tomorrow', 'Treasure Cruise'].includes(
        card.name,
      ),
    ) &&
    (game.hasMillWinPiece() || game.isSafeToEmptyLibrary())
  )
    add(88, Cost.parse('{2}{U}'), () => {
      if (!game.pay(Cost.parse('{2}{U}'))) return false;
      game.dies(permanent);
      game.drakeCopies = game.commanderCasts;
      return true;
    });
  else if (name === ROGUES_PASSAGE && isReady && context.isMain2 === false) {
    const bigCreatures = game
      .creatures()
      .filter(
        (candidate) =>
          !game.evasive(candidate) &&
          !candidate.sick &&
          !candidate.tapped &&
          game.power(candidate) >= 6,
      );
    if (bigCreatures.length)
      add(20 + 4 * game.power(bigCreatures[0]), Cost.parse('{4}'), () =>
        useRoguesPassage(game, permanent, bigCreatures[0]),
      );
  } else if (name === HAND_OF_VECNA) {
    const carrier = game.carrier();
    if (
      carrier &&
      !(carrier.marks & MARK_HAND_OF_VECNA) &&
      game.hand.length >= 4
    )
      add(40, new Cost(2), () =>
        equipTo(game, permanent, carrier, MARK_HAND_OF_VECNA),
      );
  } else if (name === ATOMIC_MICROSIZER) {
    const carrier = game.carrier();
    if (carrier && !(carrier.marks & MARK_ATOMIC_MICROSIZER))
      add(15, new Cost(2), () =>
        equipTo(game, permanent, carrier, MARK_ATOMIC_MICROSIZER),
      );
  }
}
