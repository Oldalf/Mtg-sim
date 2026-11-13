/** What the spells only Gale's deck uses do when they resolve (the engine handles the rest). */
import { GALE, permScore } from './roles';
import { OPPONENT_EVENT } from './kill-state';
import { chooseGiftsPile, chooseTutorTarget } from './tutoring';
import type { GaleGame } from './game';
import { CardDef } from '../../engine/cards';
import { firstMax, removeOrThrow, sortDesc } from '../../engine/lists';

export function resolveGaleSpell(
  game: GaleGame,
  spell: CardDef,
  _fromGraveyard: boolean,
  _mode: string | null,
): void {
  switch (spell.name) {
    case 'Mission Briefing':
      resolveMissionBriefing(game, spell);
      break;
    case 'Prologue to Phyresis':
      for (let i = 0; i < game.life.length; i++)
        if (game.life[i] > 0 && game.opponentLibrarySizes[i] > 0)
          game.poison[i] += 1;
      game.draw(1);
      break;
    case 'Windfall':
      resolveWindfall(game);
      break;
    case 'Unearth':
      resolveUnearth(game);
      break;
    case 'Gifts Ungiven':
      resolveGiftsUngiven(game);
      break;
  }
}

/** Scry 2, then recast an instant or sorcery from the graveyard. */
function resolveMissionBriefing(game: GaleGame, spell: CardDef): void {
  game.scry(2, true);
  const options = game.graveyard.filter(
    (card) =>
      card.isInstantOrSorcery &&
      card !== spell &&
      game.instantOrSorceryDevValue(card, true) > 0 &&
      game.canPay(game.effectiveCost(card, null, true), true),
  );
  if (options.length) {
    const recast = firstMax(options, (card) =>
      game.instantOrSorceryDevValue(card, true),
    );
    game.say('  Mission Briefing recasts', recast);
    game.castInstantOrSorcery(recast, true);
  }
}

/** Everyone discards their hand and draws again; the opponents' discards go to their graveyards. */
function resolveWindfall(game: GaleGame): void {
  const handSize = game.hand.length;
  for (const card of game.hand.slice()) {
    removeOrThrow(game.hand, card);
    game.toGraveyard(card);
  }
  const events: number[] = [];
  for (let i = 0; i < game.life.length; i++)
    events.push(OPPONENT_EVENT.PUTGY, i, game.config.opp_hand_size as number);
  game.applyOpponentEvents(events);
  game.draw(
    game.inArena()
      ? game.arena!.wheel(game, handSize)
      : Math.max(handSize, game.config.opp_hand_size as number),
  );
}

/** Return the best creature with mana value 3 or less from the graveyard to the battlefield. */
function resolveUnearth(game: GaleGame): void {
  const options = game.graveyard.filter(
    (card) => card.isCreature && card.manaValue <= 3,
  );
  if (!options.length) return;
  const creature = firstMax(options, (card) => permScore(card.name, 30));
  removeOrThrow(game.graveyard, creature);
  game.enter(creature);
  if (game.isOnBattlefield('Syr Konrad, the Grim'))
    game.applyOpponentEvents([OPPONENT_EVENT.KONRAD, -1, 1]);
}

/** Gifts Ungiven: the pile that is best against the opponent's worst split, or else the simple rule. */
function resolveGiftsUngiven(game: GaleGame): void {
  const pile = game.inRollout ? null : chooseGiftsPile(game);
  if (pile !== null) {
    const [picks, binned] = pile;
    for (const card of picks) removeOrThrow(game.library, card);
    game.shuffle();
    for (const card of binned) game.toGraveyard(card);
    game.hand.push(...picks.filter((card) => !binned.includes(card)));
    game.say(
      'Gifts ->',
      picks,
      '| opponent bins',
      binned,
      game.everySplitWinsNextTurn ? '(every split wins next turn)' : '',
    );
    return;
  }
  const picks: CardDef[] = [];
  const galeOut = game.isOnBattlefield(GALE);
  for (let i = 0; i < 4; i++) {
    // with Gale out, build the pile mostly from instants/sorceries (binned ones stay castable)
    const onlyInstantsAndSorceries = galeOut && i >= 1;
    const pickedNames = new Set(picks.map((card) => card.name));
    const target = chooseTutorTarget(
      game,
      (card) =>
        !pickedNames.has(card.name) &&
        (card.isInstantOrSorcery || !onlyInstantsAndSorceries),
      false,
    );
    if (target === null) break;
    picks.push(target);
    removeOrThrow(game.library, target);
  }
  game.shuffle();
  // opponent bins the two cards that hurt us most to lose from hand
  sortDesc(
    picks,
    (card) =>
      game.cardValue(card) * (card.isInstantOrSorcery && galeOut ? 0.3 : 1.0),
  );
  for (const card of picks.slice(0, 2)) game.toGraveyard(card);
  game.hand.push(...picks.slice(2));
  game.say('Gifts ->', picks);
}
