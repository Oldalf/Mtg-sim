/**
 * Ramp spells: basic lands from the library, extra land drops, lands untapped. Which basic to fetch is the deck's
 * choice (chooseLandToFetch); which land to sacrifice too (chooseLandToSacrifice).
 */
import type { GameCore } from '../game/game-core';
import type { Permanent } from '../game/game-types';
import { fetchLand } from '../game/land-search';
import { firstMax, removeIfPresent } from '../util/lists';
import type { CardRules } from './card-rules';

export const RAMP_SPELLS: CardRules[] = [
  {
    names: ['Skyshroud Claim'],
    resolve(game) {
      // two Forest cards onto the battlefield untapped
      fetchLand(game, 'forest', false);
      fetchLand(game, 'forest', false);
    },
  },
  {
    names: ['Search for Tomorrow'],
    resolve(game) {
      fetchLand(game, 'basic', false);
    },
  },
  {
    names: ['Circuitous Route', 'Reach the Horizon'],
    resolve(game) {
      fetchLand(game, 'basic', true);
      fetchLand(game, 'basic', true);
    },
  },
  {
    names: ["Nissa's Pilgrimage"],
    resolve(game) {
      // spell mastery (two or more instants and sorceries in our graveyard): one more Forest to hand
      const hasSpellMastery =
        game.graveyard.filter((card) => card.isInstantOrSorcery).length >= 2;
      fetchLand(game, 'forest', true);
      fetchLand(game, 'forest', false, true);
      if (hasSpellMastery) fetchLand(game, 'forest', false, true);
    },
  },
  {
    names: ['Bushwhack'],
    resolve(game, _spell, { mode }) {
      // 'fight': our biggest creature fights the best opposing one (a pod only); otherwise a basic to hand
      const fighter = game.biggestCreature();
      if (mode === 'fight') {
        if (fighter) game.podFightBestCreature(fighter, 'Bushwhack');
      } else fetchLand(game, 'basic', false, true);
    },
  },
  {
    // sacrifice a land, then two basics (Harrow: untapped; Entish Restoration: tapped, three with a 4-power creature)
    names: ['Harrow', 'Entish Restoration'],
    resolve(game, spell, { mode }) {
      const isHarrow = spell.name === 'Harrow';
      const landToSacrifice =
        isHarrow && mode === 'copy'
          ? undefined // Harrow's sacrifice is a cost (a copy doesn't pay it)
          : game.chooseLandToSacrifice();
      if (landToSacrifice) putLandIntoGraveyard(game, landToSacrifice);
      const hasBigCreature = game
        .creatures()
        .some((creature) => game.power(creature) >= 4);
      const basicCount = !isHarrow && hasBigCreature ? 3 : 2;
      for (let i = 0; i < basicCount; i++) fetchLand(game, 'basic', !isHarrow);
    },
  },
  {
    names: ['Summer Bloom'],
    resolve(game) {
      game.extraLandDropsThisTurn += 3;
    },
  },
  {
    names: ['Early Harvest'],
    resolve(game) {
      for (const land of game.landsOnBattlefield())
        if (land.land!.basic) land.tapped = false;
    },
  },
  {
    names: ['Seismic Sense'],
    resolve(game) {
      // look at the top X (X = our lands): a creature or land card to hand, the rest to the bottom
      const lookCount = Math.min(
        game.landsOnBattlefield().length,
        Math.max(0, game.library.length - game.libraryCardsToKeep()),
      );
      const top = game.takeTopCardsOfLibrary(lookCount);
      const choices = top.filter(
        (card) => card.isCreature || card.land !== null,
      );
      const pick = choices.length
        ? firstMax(
            choices,
            (card) => game.cardValue(card) + (card.isCreature ? 5 : 0),
          )
        : null;
      if (pick) {
        removeIfPresent(top, pick);
        game.putCard(pick, 'hand');
      }
      game.putCards(top, 'library');
      game.say('Seismic Sense:', pick ?? 'nothing');
    },
  },
];

/** A sacrificed land goes to the graveyard. (As Aesi modelled it: no "leaves" or "dies" triggers, which no land
 *  needed.) */
function putLandIntoGraveyard(game: GameCore, land: Permanent): void {
  game.takeFromBattlefieldIfThere(land);
  game.putCard(land.card, 'graveyard');
}
