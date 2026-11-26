/** What Unearth does in Gale's deck, and Gale's Gifts Ungiven pile (the engine handles the rest; Windfall's discards
 *  reach the kill search's opponents through GaleGame.opponentsWheelTheirHands). */
import { GALE, permScore, unearthMaxManaValue } from './roles';
import { OPPONENT_EVENT } from './kill-state';
import { chooseGiftsPile, chooseTutorTarget } from './tutoring';
import type { GaleGame } from './game';
import { CardDef } from '../../engine/cards/cards';
import { firstMax, sortDesc } from '../../engine/util/lists';

/** Return the best creature the spell allows (Unearth: mana value 3 or less) from the graveyard to the battlefield. */
export function resolveUnearth(game: GaleGame, spellName: string): void {
  const options = game.graveyard.filter(
    (card) =>
      card.isCreature && card.manaValue <= unearthMaxManaValue(spellName),
  );
  if (!options.length) return;
  const creature = firstMax(options, (card) => permScore(card.name, 30));
  game.takeCard(creature, 'graveyard');
  game.enter(creature);
  if (game.isOnBattlefield('Syr Konrad, the Grim'))
    game.applyOpponentEvents([OPPONENT_EVENT.KONRAD, -1, 1]);
}

/** Gifts Ungiven (the engine's rule asks for the pile): the pile that is best against the opponent's worst split, or
 *  else the simple rule. The searched cards are taken from the library. */
export function chooseGiftsUngivenPile(game: GaleGame): {
  searched: CardDef[];
  toGraveyard: CardDef[];
} {
  const pile = game.inRollout ? null : chooseGiftsPile(game);
  if (pile !== null) {
    const [picks, binned] = pile;
    for (const card of picks) game.takeCard(card, 'library');
    game.say(
      'Gifts ->',
      picks,
      '| opponent bins',
      binned,
      game.everySplitWinsNextTurn ? '(every split wins next turn)' : '',
    );
    return { searched: picks, toGraveyard: binned };
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
    game.takeCard(target, 'library');
  }
  // opponent bins the two cards that hurt us most to lose from hand
  sortDesc(
    picks,
    (card) =>
      game.cardValue(card) * (card.isInstantOrSorcery && galeOut ? 0.3 : 1.0),
  );
  game.say('Gifts ->', picks);
  return { searched: picks, toGraveyard: picks.slice(0, 2) };
}
