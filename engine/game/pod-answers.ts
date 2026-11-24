/**
 * Our answers in a pod (the cards are listed in answers.ts): what an answer costs (with Force of Will's, Daze's and
 * Fierce Guardianship's other costs), casting one, answering a win attempt, the counter abilities of our permanents,
 * shielding our creature from removal (Kira, Soratami Rainshaper, Siren Stormtamer), and what happens to our cards when
 * an opponent's answer hits them. Game's methods of the same topic call these (game.ts); every step calls the game's own
 * methods, so a deck's overrides (answer, podCast, podCanTarget, podShield...) run as before.
 */
import * as C from '../cards/cards';
import { CardDef, Cost } from '../cards/cards';
import { Answer, BOARD_COUNTERS, BoardCounter, PROTECTIONS } from './answers';
import type { Game } from './game';
import { CardListZone, Permanent, Target, WinAttempt } from './game-types';

const FORCE_OF_WILL = 'Force of Will';
const FIERCE_GUARDIANSHIP = 'Fierce Guardianship';
const DAZE = 'Daze';

/** An answer we cast (or a counter ability we used) against a win attempt. */
export interface AnswerUsed {
  card: string;
  target: string;
  how: string;
  shield?: string;
  answer: Answer;
  isAbility?: boolean;
}

/** A permanent's counter ability seen as an answer (what spells it may counter). */
function boardCounterAnswer(ability: BoardCounter): Answer {
  return { kind: 'counter', instant: true, spells: ability.spells };
}

/** What casting this answer costs now: its own cost, or nothing with Fierce Guardianship's, Force of Will's or
 *  Daze's other cost. */
export function costOfAnswer(game: Game<unknown>, card: CardDef): Cost {
  const answer = game.answer(card);
  const cost = game.effectiveCost(
    card,
    answer?.cost ? Cost.parse(answer.cost) : null,
  );
  if (card.name === FIERCE_GUARDIANSHIP && game.controlsCommander())
    return new Cost();
  if (
    card.name === FORCE_OF_WILL &&
    !game.canPay(cost, true) &&
    game.forceOfWillPitch(card)
  )
    return new Cost();
  if (
    card.name === DAZE &&
    !game.canPay(cost, true) &&
    game.islandToReturnForDaze()
  )
    return new Cost();
  return cost;
}

/** See Game.podCast. */
export function castAnswerFromHand(
  game: Game<unknown>,
  card: CardDef,
): boolean {
  const cost = game.answerCost(card);
  if (!game.hand.includes(card) || !game.pay(cost, true)) return false;
  if (card.name === FORCE_OF_WILL && cost.manaValue === 0) {
    // the alternative cost: exile a blue card and pay 1 life
    game.moveCard(game.forceOfWillPitch(card)!, 'hand', 'exile');
    game.loseLife(1);
  }
  if (card.name === DAZE && cost.manaValue === 0) {
    // the alternative cost: return an Island to hand
    const island = game.islandToReturnForDaze()!;
    game.takeFromBattlefield(island);
    game.putCard(island.card, 'hand');
  }
  game.moveCard(card, 'hand', 'graveyard');
  game.podAnnounceCast(card);
  const life = game.answer(card)?.pay ?? 0;
  if (life) game.loseLife(life);
  return true;
}

/** May this answer counter this spell? */
export function answerHitsSpell(answer: Answer, card: CardDef): boolean {
  if (answer.spells === 'noncreature') return !card.isCreature;
  if (answer.spells === 'instant') return card.isInstant;
  if (answer.spells === 'instant-sorcery') return card.isInstantOrSorcery;
  return true;
}

/** May this removal hit a permanent of these types? (Never a land.) */
export function answerHitsPermanentTypes(
  answer: Answer,
  types: Set<string>,
): boolean {
  return (
    !types.has('land') &&
    (answer.hits ?? []).some((hitType) => types.has(hitType))
  );
}

/** See Game.podRespond. */
export function answerWinAttempt(
  game: Game<unknown>,
  winAttempt: WinAttempt,
  need: number,
  owner: Game<unknown>,
): AnswerUsed[] {
  const out: AnswerUsed[] = [];
  for (const card of game.hand.slice()) {
    if (out.filter((x) => !x.shield).length >= need) break;
    const answer = game.answer(card);
    if (!answer || !answer.instant || answer.kind === 'wipe') continue;
    const isStoppedByVeil =
      PROTECTIONS[winAttempt.protect ?? '']?.stops === 'blue-black-cards' &&
      (card.isBlue || card.isBlack);
    if (isStoppedByVeil) continue;
    if (answer.kind === 'counter') {
      const target = winAttempt.spells.find((x) =>
        answerHitsSpell(answer, C.get(x)),
      );
      if (!target || !game.podCast(card)) continue;
      out.push({ card: card.name, target, how: 'countered', answer: answer });
      continue;
    }
    let permanent: Permanent | undefined;
    for (const x of winAttempt.perms) {
      permanent = owner.battlefield.find(
        (otherPermanent) =>
          otherPermanent.card.name === x &&
          answerHitsPermanentTypes(answer, otherPermanent.card.types) &&
          owner.podCanTarget(otherPermanent, answer),
      );
      if (permanent) break;
    }
    if (!permanent || !game.podCast(card)) continue;
    const shield = owner.podShield(permanent) ?? undefined;
    out.push({
      card: card.name,
      target: permanent.card.name,
      how: answer.how ?? 'destroy',
      shield,
      answer: answer,
    });
  }
  // then the counter abilities of our permanents (Diversion Unit, Soratami Savant)
  for (const permanent of game.battlefield.slice()) {
    if (out.filter((x) => !x.shield).length >= need) break;
    const ability = BOARD_COUNTERS[permanent.card.name];
    if (!ability) continue;
    const answer = boardCounterAnswer(ability);
    const target = winAttempt.spells.find((x) =>
      answerHitsSpell(answer, C.get(x)),
    );
    if (!target || !game.useBoardCounter(permanent)) continue;
    out.push({
      card: permanent.card.name,
      target,
      how: 'countered',
      answer,
      isAbility: true,
    });
  }
  return out;
}

/** See Game.boardCountersAgainst. */
export function counterAbilitiesAgainst(
  game: Game<unknown>,
  spell: CardDef,
): Permanent[] {
  return game.battlefield.filter((permanent) => {
    const ability = BOARD_COUNTERS[permanent.card.name];
    return (
      ability !== undefined &&
      answerHitsSpell(boardCounterAnswer(ability), spell) &&
      (!ability.returnLand || game.landsOnBattlefield().length > 0) &&
      game.canPay(Cost.parse(ability.cost), false)
    );
  });
}

/** See Game.useBoardCounter. */
export function useCounterAbility(
  game: Game<unknown>,
  permanent: Permanent,
): boolean {
  const ability = BOARD_COUNTERS[permanent.card.name];
  if (!ability || !game.pay(Cost.parse(ability.cost), false)) return false;
  if (ability.sacrifice) game.sacrifice(permanent);
  if (ability.returnLand) {
    const lands = game.landsOnBattlefield();
    const land = lands.find((candidate) => candidate.tapped) ?? lands[0];
    if (land) {
      game.takeFromBattlefield(land);
      game.putCard(land.card, 'hand');
    }
  }
  return true;
}

/** See Game.podShield. */
export function shieldFromRemoval(
  game: Game<unknown>,
  permanent: Permanent,
): string | null {
  if (!permanent.card.isCreature || game.config.pod_legal === false)
    return null;
  if (
    game.isOnBattlefield('Kira, Great Glass-Spinner') &&
    !game.podShielded.has(permanent)
  ) {
    game.podShielded.add(permanent);
    return 'Kira, Great Glass-Spinner';
  }
  const rain = game.findPermanent('Soratami Rainshaper');
  if (rain && game.openMana() >= 4) {
    game.tapMana(3);
    const land =
      game
        .landsOnBattlefield()
        .find((otherPermanent) => otherPermanent.tapped) ??
      game.landsOnBattlefield()[0];
    if (land) {
      game.takeFromBattlefield(land);
      game.putCard(land.card, 'hand');
    }
    return 'Soratami Rainshaper';
  }
  const siren = game.findPermanent('Siren Stormtamer');
  if (
    siren &&
    siren !== permanent &&
    game.openMana() >= 1 &&
    game.canPay(Cost.parse('{U}'), true)
  ) {
    game.pay(Cost.parse('{U}'), true);
    game.sacrifice(siren);
    return 'Siren Stormtamer';
  }
  return null;
}

/** See Game.podGet. */
export function getWhatRemovalGives(
  game: Game<unknown>,
  permanent: Permanent,
  answer: Answer,
): void {
  if (answer.gives === 'token3')
    game.createTokens(C.makeToken('Beast', 3, 3, 'Green'));
  else if (answer.gives === 'manifest')
    game.createTokens(C.makeToken('Manifest', 2, 2));
  else if (answer.gives === 'life') game.gainLife(game.power(permanent));
  else if (answer.gives === 'land') {
    const basic = game.library.find(
      (card) =>
        card.land !== null &&
        /^(Snow-Covered )?(Plains|Island|Swamp|Mountain|Forest|Wastes)$/.test(
          card.name,
        ),
    );
    if (basic) {
      game.takeCard(basic, 'library');
      game.enter(basic, 'library', { tapped: true });
      game.shuffle();
    }
  }
}

/** See Game.podRemove. */
export function removeOurPermanent(
  game: Game<unknown>,
  permanent: Permanent,
  how: string,
): void {
  if (!game.battlefield.includes(permanent)) return;
  if (game.isCommander(permanent)) {
    game.takeFromBattlefield(permanent);
    game.putCard(permanent.card, 'command');
    game.onLeave(permanent);
  } else if (how === 'destroy' || how === 'sacrifice') {
    if (permanent.card.isCreature) game.dies(permanent);
    else {
      game.takeFromBattlefield(permanent);
      if (!permanent.token) game.putCard(permanent.card, 'graveyard');
      game.onLeave(permanent);
    }
  } else {
    game.takeFromBattlefield(permanent);
    if (!permanent.token)
      game.putCard(permanent.card, how === 'bounce' ? 'hand' : 'exile');
    game.onLeave(permanent);
  }
}

/** See Game.podLose. */
export function loseCardOurWinStoppedAt(
  game: Game<unknown>,
  name: string,
  how: string,
  answer?: Answer,
): void {
  const permanent = game.battlefield.find(
    (otherPermanent) =>
      otherPermanent.card.name === name && !otherPermanent.token,
  );
  if (permanent && how !== 'countered') {
    if (answer) game.podSuffer(permanent, answer);
    else game.podRemove(permanent, how);
    return;
  }
  const card = C.get(name);
  if (how === 'countered') game.tapMana(game.effectiveCost(card).manaValue);
  /** Takes the card with that name out of a zone. False if it is not there. */
  const take = (fromZone: CardListZone) => {
    const found = game[fromZone].find((otherCard) => otherCard.name === name);
    if (!found) return false;
    game.takeCard(found, fromZone);
    return true;
  };
  if (take('command')) game.putCard(card, 'command');
  else if (take('hand'))
    game.putCard(
      card,
      how === 'exile' ? 'exile' : how === 'bounce' ? 'hand' : 'graveyard',
    );
  else if (how === 'countered' && take('graveyard'))
    game.putCard(card, 'exile');
  // a shortcut line (a loop that draws its finisher) still had it in the library
  else if (take('library'))
    game.putCard(card, how === 'exile' ? 'exile' : 'graveyard');
}

/** See Game.podBurnCounters. */
export function spendCountersAgainst(
  game: Game<unknown>,
  against: string[],
): string[] {
  const used: string[] = [];
  for (const name of against) {
    const target = C.get(name);
    const card = game.hand.find((otherCard) => {
      const answer = game.answer(otherCard);
      return (
        answer?.kind === 'counter' &&
        answerHitsSpell(answer, target) &&
        game.canPay(game.answerCost(otherCard), true)
      );
    });
    if (card && game.podCast(card)) used.push(card.name);
  }
  return used;
}

/** See Game.podTargets. */
export function removalTargets(game: Game<unknown>, answer: Answer): Target[] {
  return game.battlefield
    .filter(
      (permanent) =>
        permanent.land === null &&
        answerHitsPermanentTypes(answer, permanent.card.types) &&
        game.podCanTarget(permanent, answer),
    )
    .map((permanent) => ({
      permanent,
      name: permanent.card.name,
      power: permanent.card.isCreature ? game.power(permanent) : 0,
      types: permanent.card.types,
      token: permanent.token,
      commander: game.isCommander(permanent),
      value:
        (permanent.token ? 0 : game.cardValue(permanent.card)) +
        (game.isCommander(permanent) ? 30 : 0) +
        (permanent.card.isCreature ? 2 * game.power(permanent) : 0),
    }));
}
