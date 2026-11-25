/**
 * Draw, scry and "look at the top cards" spells. Which cards to keep is the deck's choice (cardValue).
 */
import type { CardDef } from '../cards/cards';
import type { GameCore } from '../game/game-core';
import { firstMax, firstMin, sortDesc } from '../util/lists';
import type { CardRules } from './card-rules';

export const DRAW_SPELLS: CardRules[] = [
  {
    names: ['Brainstorm'],
    resolve(game) {
      game.draw(3);
      for (let i = 0; i < Math.min(2, game.hand.length); i++) {
        const card = firstMin(
          game.hand,
          (anotherCard) =>
            game.cardValue(anotherCard) +
            (game.cardsTheKillLineNeeds.has(anotherCard.name) ? 1000 : 0),
        );
        game.takeCard(card, 'hand');
        game.putCardsOnTopOfLibrary([card]);
      }
    },
  },
  {
    names: ['Consider'],
    resolve(game) {
      game.scry(1, true);
      game.draw(1);
    },
  },
  {
    names: ['Opt'],
    resolve(game) {
      game.scry(1);
      game.draw(1);
    },
  },
  {
    names: ['Chart a Course'],
    resolve(game) {
      game.draw(2);
      if (!game.attacked) game.discard(1);
    },
  },
  {
    names: ['Read the Bones'],
    resolve(game) {
      game.scry(2);
      game.draw(2);
      game.myLife -= 2;
    },
  },
  {
    names: ['Pieces of the Puzzle'],
    resolve(game) {
      // up to two instants/sorceries to hand, the rest to the graveyard
      const top = game.takeTopCardsOfLibrary(5);
      const keep = sortDesc(
        top.filter((card) => card.isInstantOrSorcery),
        (card) => game.cardValue(card),
      ).slice(0, 2);
      keepTheseRestToGraveyard(game, top, keep);
    },
  },
  {
    names: ['Fact or Fiction'],
    resolve(game) {
      // the opponent splits: the best card alone vs the other four
      const top = game.takeTopCardsOfLibrary(5);
      sortDesc(top, (card) => game.cardValue(card));
      const rest = top.slice(1);
      const keep =
        top.length &&
        game.cardValue(top[0]) >
          rest.reduce((total, card) => total + game.cardValue(card), 0) * 0.6
          ? top.slice(0, 1)
          : rest;
      keepTheseRestToGraveyard(game, top, keep);
    },
  },
  {
    names: ['Ponder'],
    resolve(game) {
      // look at the top three: shuffle them away if none is good, otherwise put them back best first; then draw
      const top = game.library.slice(0, 3);
      if (
        top.length &&
        Math.max(...top.map((card) => game.cardValue(card))) < 40
      )
        game.shuffle();
      else {
        game.takeTopCardsOfLibrary(3);
        sortDesc(top, (card) => game.cardValue(card));
        game.putCardsOnTopOfLibrary(top);
      }
      game.draw(1);
    },
  },
  {
    names: ['Preordain'],
    resolve(game) {
      game.scry(2);
      game.draw(1);
    },
  },
  {
    names: ['Deep Analysis', "Archmage's Charm"],
    resolve(game) {
      game.draw(2);
    },
  },
  {
    names: ["Night's Whisper"],
    resolve(game, spell) {
      game.draw(2, spell.name);
      game.loseLife(2);
    },
  },
  {
    names: ['Diresight'],
    resolve(game, spell) {
      game.scry(2, true);
      game.draw(2, spell.name);
    },
  },
  {
    names: ['Stock Up'],
    resolve(game) {
      // the two best of the top five to hand, the rest to the bottom
      const top = game.takeTopCardsOfLibrary(5);
      sortDesc(top, (card) => game.cardValue(card));
      for (const card of top.slice(0, 2)) game.putCard(card, 'hand');
      for (const card of top.slice(2)) game.putCard(card, 'library');
    },
  },
  {
    names: ['See the Truth'],
    resolve(game, _spell, howCast) {
      // the top three: from the graveyard all go to hand, otherwise the best one does and the rest go to the bottom
      const top = game.takeTopCardsOfLibrary(3);
      if (howCast.fromGraveyard || !top.length)
        for (const card of top) game.putCard(card, 'hand');
      else {
        sortDesc(top, (card) => game.cardValue(card));
        game.putCard(top[0], 'hand');
        for (const card of top.slice(1)) game.putCard(card, 'library');
      }
    },
  },
  {
    names: ['Energybending'],
    resolve(game) {
      game.isEnergybendingActive = true;
      game.draw(1);
    },
  },
  {
    names: ['Focus the Mind'],
    resolve(game) {
      game.draw(3);
      game.discard(1);
    },
  },
  {
    names: ['Frantic Search'],
    resolve(game) {
      game.draw(2);
      game.discard(2);
      game.untapLands(3);
    },
  },
  {
    names: ['Village Rites'],
    resolve(game, spell) {
      game.draw(2, spell.name);
    },
  },
  {
    names: ['Grisly Salvage'],
    resolve(game) {
      // the top five: a creature or land card to hand (the best), the rest to the graveyard
      const top = game.takeTopCardsOfLibrary(5);
      const keep = top.filter(
        (candidate) => candidate.isCreature || candidate.land !== null,
      );
      const kept = keep.length
        ? firstMax(keep, (candidate) => game.cardValue(candidate))
        : null;
      for (const topCard of top)
        if (topCard === kept) game.putCard(topCard, 'hand');
        else game.toGraveyard(topCard, true);
    },
  },
  {
    names: ['Tune the Narrative'],
    resolve(game) {
      game.draw(1);
      game.gainEnergy(2);
    },
  },
  {
    names: ['Prologue to Phyresis'],
    resolve(game) {
      // a poison counter for each opponent still in the game
      for (let i = 0; i < game.life.length; i++)
        if (game.life[i] > 0 && game.opponentLibrarySizes[i] > 0)
          game.poison[i] += 1;
      game.draw(1);
    },
  },
  {
    names: ['Pull from Tomorrow'],
    resolve(game, _spell, howCast) {
      // the mode is 'x=N'
      const xValue = parseInt((howCast.mode ?? 'x=0').slice(2), 10);
      game.draw(xValue);
      game.discard(1);
    },
  },
];

/** The kept cards go to hand, the other looked-at cards to the graveyard. */
function keepTheseRestToGraveyard(
  game: GameCore,
  lookedAt: CardDef[],
  keep: CardDef[],
): void {
  for (const card of lookedAt) {
    if (keep.includes(card)) game.putCard(card, 'hand');
    else game.toGraveyard(card, true);
  }
}
