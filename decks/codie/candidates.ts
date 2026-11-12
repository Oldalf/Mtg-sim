import {
  AD_NAUSEAM,
  BRASS_BOUNTY,
  CODIE,
  DEMONIC_TUTOR,
  FETCH,
  FINISHERS,
  MANA_GEYSER,
  HOLD,
  PROFANE_TUTOR,
  REITERATE,
  TEFERIS_PROTECTION,
  TRIGGER_SPELLS,
  LIM_DUL_VAULT,
  JESKAS_WILL,
} from './cards';
import {
  activateCodie,
  exileFromHand,
  suspendProfaneTutor,
} from './solver-actions';
import type { CodieGame } from './game';
import { CardDef, Cost } from '../../engine/cards';
import { Cand } from '../../engine/game-types';

/** Adds one thing the AI may do: its score, what it costs, whether it is an instant or sorcery, and how to do it. */
type AddCandidate = (
  score: number,
  cost: Cost,
  isInstantOrSorcery: boolean,
  act: () => boolean,
) => void;

/** Everything the AI may do now while it develops its mana and finds pieces, with a score each. */
export function buildCandidates(game: CodieGame, _main2: boolean): Cand[] {
  game.purgeTreasures();
  const candidates: Cand[] = [];
  const add: AddCandidate = (score, cost, isIS, act) =>
    candidates.push({ score, cost, isIS, act });
  addCodieCandidates(game, add);
  addSpiritGuideCandidates(game, add);
  addVaultCandidate(game, add);
  for (const commander of game.command.slice())
    add(
      game.cfg.codie_early ? 95 : 45,
      game.commanderCost(commander, game.effCost(commander)),
      false,
      () => game.castPerm(commander, true),
    );
  const seenNames = new Set<string>();
  for (const card of game.hand.slice()) {
    if (seenNames.has(card.name) || card.land !== null) continue;
    seenNames.add(card.name);
    if (!HOLD.has(card.name)) addCardInHandCandidate(game, card, add);
  }
  return candidates;
}

/** Codie: {4}, T: WUBRG (net +1 mana, all five colours) and the next spell makes a free cheaper instant or sorcery. */
function addCodieCandidates(game: CodieGame, add: AddCandidate): void {
  const codie = game.perm(CODIE);
  const triggerSpell = TRIGGER_SPELLS.map((name) => game.cardInHand(name)).find(
    (card) => card !== undefined,
  );
  const profaneTutorInLibrary = game.library.some(
    (card) => card.name === PROFANE_TUTOR,
  );
  if (codie && !codie.tapped && !codie.sick && game.cfg.codie_dev)
    add(
      triggerSpell && profaneTutorInLibrary && game.availMana() >= 5 ? 82 : 58,
      new Cost(4),
      false,
      () => activateCodie(game),
    );
  // with Codie armed, a spell of mana value 1 makes the free Profane Tutor: any card
  if (game.codieArmed > 0 && profaneTutorInLibrary)
    for (const name of TRIGGER_SPELLS) {
      const card = game.cardInHand(name);
      if (card) add(92, game.effCost(card), true, () => game.castIS(card));
    }
}

/** Spirit Guides: exile one for mana when that lets us cast a spell we could not cast otherwise this turn. */
function addSpiritGuideCandidates(game: CodieGame, add: AddCandidate): void {
  if (!game.cfg.guides_dev) return;
  for (const [guideName, colour] of [
    ['Elvish Spirit Guide', 'G'],
    ['Simian Spirit Guide', 'R'],
  ] as const) {
    const guide = game.cardInHand(guideName);
    if (!guide) continue;
    const manaAvailable = game.availMana();
    const unlocksSpell = game.hand.some(
      (card) =>
        card.land === null &&
        !HOLD.has(card.name) &&
        card !== guide &&
        (FETCH[card.name] ||
          card.name === 'Manamorphose' ||
          card.name === DEMONIC_TUTOR) &&
        card.mv === manaAvailable + 1,
    );
    if (unlocksSpell)
      add(72, new Cost(), false, () => {
        exileFromHand(game, guideName);
        game.pool[colour] += 1;
        return true;
      });
  }
}

/** Lim-Dul's Vault, when a cantrip in hand can use the stacked top and life and library allow it. */
function addVaultCandidate(game: CodieGame, add: AddCandidate): void {
  const vault = game.cardInHand(LIM_DUL_VAULT);
  const hasCantrip = game.hand.some((card) =>
    [
      'Brainstorm',
      'Stock Up',
      'Manamorphose',
      'Flow State',
      'Frantic Search',
    ].includes(card.name),
  );
  if (vault && hasCantrip && game.myLife >= 25 && game.library.length >= 30)
    add(64, game.effCost(vault), true, () => game.castIS(vault));
}

/** One card in hand: land fetchers, cantrips, tutors and Windfall; the cards only the solver uses are skipped. */
function addCardInHandCandidate(
  game: CodieGame,
  card: CardDef,
  add: AddCandidate,
): void {
  const name = card.name;
  const cost = game.effCost(card);
  const score = game.developmentValue(card);
  const cast = () => game.castIS(card);
  const fetcher = FETCH[name];
  if (fetcher) {
    const landsOnBattlefield = game.landsBf().length;
    if (!game.library.some((candidate) => candidate.land !== null)) return;
    if (fetcher.landsToSacrifice && landsOnBattlefield < 3) return;
    if (name === 'Hour of Promise' && landsOnBattlefield < 5) return;
    add(landsOnBattlefield >= 9 ? score - 40 : score, cost, true, cast);
    return;
  }
  switch (name) {
    case 'Frantic Search':
      if (game.landsBf().filter((permanent) => permanent.tapped).length >= 3)
        add(score + 20, cost, true, cast);
      return;
    case 'Windfall': {
      // a mid-game mulligan: only when no combo piece or tutor is in hand (discarding a good hand is a loss)
      const hasComboPiece = game.hand.some((candidate) =>
        [
          REITERATE,
          JESKAS_WILL,
          MANA_GEYSER,
          BRASS_BOUNTY,
          DEMONIC_TUTOR,
          PROFANE_TUTOR,
          AD_NAUSEAM,
          TEFERIS_PROTECTION,
          LIM_DUL_VAULT,
          ...FINISHERS,
        ].includes(candidate.name),
      );
      if (!hasComboPiece || game.hand.length <= 2)
        add(score + 20, cost, true, cast);
      return;
    }
    case PROFANE_TUTOR:
      // suspend 2: a free tutor two turns later
      add(60, Cost.parse('{1}{B}'), false, () =>
        suspendProfaneTutor(game, card),
      );
      return;
    case 'Valakut Awakening': {
      const unwanted = game.hand.filter(
        (candidate) =>
          candidate !== card &&
          !HOLD.has(candidate.name) &&
          (candidate.land !== null
            ? game.countLandsHand() > 2
            : game.developmentValue(candidate) < 45),
      );
      if (unwanted.length >= 2) add(score, cost, true, cast);
      return;
    }
    case AD_NAUSEAM:
      return; // cast at the end of the turn (endTurn)
    case 'Demonic Tutor':
    case 'Merchant Scroll':
      add(score, cost, false, cast);
      return;
    case 'Vampiric Tutor':
    case 'Personal Tutor':
      return; // the top of the library: needs a draw; only the solver uses them
    case 'Manamorphose':
    case 'Brainstorm':
    case 'Flow State':
    case 'Stock Up':
    case 'Growth Spiral':
    case 'Sylvan Scrying':
      add(score, cost, true, () =>
        game.castIS(
          card,
          false,
          name === 'Manamorphose' ? manamorphoseCost(game) : null,
        ),
      );
      return;
  }
}

export function manamorphoseCost(game: CodieGame): Cost {
  return Cost.parse(game.canPay(Cost.parse('{1}{R}')) ? '{1}{R}' : '{1}{G}');
}
