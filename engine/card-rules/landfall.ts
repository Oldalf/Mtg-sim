/**
 * Landfall ("whenever a land enters under your control") and the permanents that give extra land drops.
 */
import { BEAST, FOOD, TREASURE } from '../cards/tokens';
import type { CardRules } from './card-rules';

export const LANDFALL: CardRules[] = [
  {
    names: ['Tireless Provisioner'],
    onLandfall(game) {
      game.createTokens(game.chooseTokenToCreate([FOOD, TREASURE]));
    },
  },
  {
    names: ['Graypelt Refuge', 'Scoured Barrens'],
    // its own "when this enters, you gain 1 life" (a land enters through landfall, not onEnter)
    onLandfall(game, permanent, land) {
      if (land === permanent) game.gainLife(1);
    },
  },
  {
    names: ['Geode Rager'],
    // CHECK WHEN ANOTHER DECK PLAYS IT: a land that is gone at once (Evolving Wilds) doesn't trigger it (the card: it
    // does).
    onLandfall(game, _permanent, land) {
      if (game.battlefield.includes(land))
        game.podGoadStrongestOpponentsCreatures();
    },
  },
  {
    names: ['Rampaging Baloths'],
    onLandfall(game) {
      game.createTokens(BEAST);
    },
  },
  {
    names: ['Ob Nixilis, the Fallen'],
    onLandfall(game, permanent) {
      // may have an opponent lose 3 life; then three +1/+1 counters on it
      const target = game.chooseTargetOpponent();
      if (target === null) return;
      game.damageOpponent(target, 3);
      game.addCounters(permanent, 3);
    },
  },
  {
    names: ['Aesi, Tyrant of Gyre Strait'],
    onLandfall(game) {
      // draw a card (not from a library down to the cards we keep)
      if (game.library.length > game.libraryCardsToKeep()) game.draw(1);
    },
    landDropsItGives: () => 1,
  },
  {
    names: ['Lotus Cobra'],
    // CHECK WHEN ANOTHER DECK PLAYS IT: its "any colour" mana is always blue or green (the colours of Aesi, who plays it): a deck of other colours needs a colour choice hook here
    onLandfall(game) {
      // one mana of any colour: blue or green, whichever the pool has less of
      if (game.pool.U <= game.pool.G) game.pool.U += 1;
      else game.pool.G += 1;
    },
  },
  {
    names: ['Druid Class'],
    onEnter(_game, permanent) {
      permanent.counters = 1; // its level
    },
    onLandfall(game) {
      game.gainLife(1);
    },
    // level 2: an additional land each turn (its level-ups are the deck's to choose)
    landDropsItGives: (_game, permanent) => (permanent.counters >= 2 ? 1 : 0),
  },
  {
    names: ['Khalni Heart Expedition'],
    onLandfall(_game, permanent) {
      permanent.counters += 1; // a quest counter
    },
  },
  {
    names: ['Loot, Exuberant Explorer', 'Case of the Locked Hothouse'],
    landDropsItGives: () => 1,
  },
  {
    names: ['Azusa, Lost but Seeking'],
    landDropsItGives: () => 2,
  },
];
