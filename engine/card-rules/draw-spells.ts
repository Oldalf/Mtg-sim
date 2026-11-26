/**
 * Draw, scry and "look at the top cards" spells. Which cards to keep is the deck's choice (cardValue).
 */
import type { CardDef } from '../cards/cards';
import { TREASURE } from '../cards/tokens';
import type { GameCore } from '../game/game-core';
import { firstMax, firstMin, sortDesc } from '../util/lists';
import type { CardRules, HowCast } from './card-rules';

export const DRAW_SPELLS: CardRules[] = [
  {
    names: ['Big Score', 'Unexpected Windfall'],
    // CHECK WHEN ANOTHER DECK PLAYS IT: the discard (an additional cost) is paid by the deck that casts it (Azula's
    // candidates); a copy doesn't pay it.
    resolve(game) {
      game.draw(2);
      game.createTokens(TREASURE, 2);
    },
  },
  {
    names: ['Demand Answers'],
    // CHECK WHEN ANOTHER DECK PLAYS IT: the sacrifice or discard (an additional cost) is paid by the deck that casts it
    // (Azula's candidates).
    resolve(game) {
      game.draw(2);
    },
  },
  {
    names: ['Sea Gate Restoration'],
    resolve(game) {
      game.hasNoMaximumHandSizeForTheGame = true;
      game.draw(game.hand.length + 1);
    },
  },
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
      keepBestOfTopRestToBottom(game, 5, 2);
    },
  },
  {
    names: ['Flow State'],
    // CHECK WHEN ANOTHER DECK PLAYS IT: the "instant and sorcery in your graveyard: two to hand" part is not modelled.
    resolve(game) {
      keepBestOfTopRestToBottom(game, 3, 1);
    },
  },
  {
    names: ['Valakut Awakening'],
    resolve(game, spell) {
      // any cards from hand to the bottom (handCardsToRedraw), then draw that many plus one
      const putBack = game.handCardsToRedraw(spell);
      for (const card of putBack) {
        game.takeCardIfThere(card, 'hand');
        game.putCard(card, 'library');
      }
      game.draw(putBack.length + 1);
    },
  },
  {
    names: ['Ad Nauseam'],
    resolve(game) {
      // reveal the top card, to hand, lose life equal to its mana value; again as long as we want
      while (game.library.length && !game.died) {
        const card = game.library[0];
        if (!game.keepsRevealingForAdNauseam(card)) break;
        game.takeTopCardsOfLibrary(1);
        game.putCard(card, 'hand');
        game.loseLife(card.manaValue);
      }
      game.say('Ad Nauseam: hand', game.hand.length, 'life', game.myLife);
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
      game.draw(xValueOf(howCast));
      game.discard(1);
    },
  },
];

/** The X a spell was cast with: its mode is 'x=N'. */
export function xValueOf(howCast: HowCast): number {
  return parseInt((howCast.mode ?? 'x=0').slice(2), 10);
}

/** The best cards of the top ones to hand, the rest to the bottom. */
function keepBestOfTopRestToBottom(
  game: GameCore,
  lookCount: number,
  keepCount: number,
): void {
  const top = game.takeTopCardsOfLibrary(lookCount);
  sortDesc(top, (card) => game.cardValue(card));
  game.putCards(top.slice(0, keepCount), 'hand');
  game.putCards(top.slice(keepCount), 'library');
}

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
