/**
 * Permanents: what they do when they enter, die or at our upkeep. Which card to take (a land, a card from the
 * graveyard) is the deck's choice (chooseLandToFetch, returnToHandValue).
 */
import * as C from '../cards/cards';
import type { CardDef } from '../cards/cards';
import { GOAT, LIFELINK_VAMPIRE, ZOMBIE } from '../cards/tokens';
import { SHRIEKMAW } from '../game/answers';
import type { Answer } from '../game/answers';
import type { GameCore } from '../game/game-core';
import { corpseAugurDies, CORPSE_AUGUR } from '../game/card-draw';
import { fetchLand } from '../game/land-search';
import { firstMax } from '../util/lists';
import type { CardRules } from './card-rules';
import { returnBestCreatureCardToHand } from './self-mill';

export const MASSACRE_WURM = 'Massacre Wurm';

/** Necron Deathmark's "destroy target creature", as the pod's removal. */
const DESTROY_CREATURE: Answer = {
  kind: 'removal',
  instant: false,
  hits: ['creature'],
  how: 'destroy',
};

export const PERMANENTS: CardRules[] = [
  {
    // another creature enters with more power than each other creature: a card. Its power is read after riot's
    // counter and the other replacements (it enters with them).
    // CHECK WHEN ANOTHER DECK PLAYS IT: in a pod, other players' creatures entering (their controller draws) and
    // their creatures in the comparison; its mana ability ({G}, {T}: X mana, X the greatest power among our
    // creatures) is Thantis's {C}{C} (step 5a).
    names: ['Selvala, Heart of the Wilds'],
    onAnotherOfOursEnters(game, _selvala, entered) {
      if (!entered.card.isCreature) return;
      const power = game.power(entered);
      if (
        game
          .creatures()
          .every((other) => other === entered || game.power(other) < power)
      )
        game.draw(1);
    },
  },
  {
    // Increment: a spell with more mana spent than its power or toughness gives it a +1/+1 counter, and the counter
    // draws a card. The mana spent is taken as the spell's mana value.
    // CHECK WHEN ANOTHER DECK PLAYS IT: the mana really spent (cost reductions, X, free casts), and the draw for
    // +1/+1 counters put on it by other cards (proliferate, Hardened Scales).
    names: ['Pensive Professor'],
    onWeCastSpell(game, professor, spell) {
      const smaller = Math.min(
        game.power(professor),
        game.toughness(professor),
      );
      if (spell.manaValue <= smaller) return;
      professor.counters += 1;
      game.draw(1);
    },
  },
  {
    names: ['Whip of Erebos'],
    // CHECK WHEN ANOTHER DECK PLAYS IT: its activated ability (a creature back for a turn) is not modelled.
    givesOurCreaturesKeywords() {
      return ['lifelink'];
    },
  },
  {
    names: ['Rune-Scarred Demon'],
    onEnter(game) {
      game.doTutor(() => true, false);
    },
  },
  {
    names: ['Disciple of Bolas'],
    // which creature is the deck's choice (creatureToSacrificeFor)
    onEnter(game, permanent) {
      const sacrificed = game.creatureToSacrificeFor(permanent);
      if (!sacrificed) return;
      const power = game.power(sacrificed);
      game.sacrifice(sacrificed);
      game.gainLife(power);
      game.draw(power, permanent.card.name);
    },
  },
  {
    names: ['Sheoldred, Whispering One'],
    // CHECK WHEN ANOTHER DECK PLAYS IT: each opponent's sacrifice at its upkeep is not modelled.
    onUpkeep(game) {
      const creature = game.bestCreatureInGraveyard();
      if (creature) game.reanimate(creature);
    },
  },
  {
    names: ['Indulgent Tormentor'],
    // CHECK WHEN ANOTHER DECK PLAYS IT: the opponent always pays 3 life (the card: or sacrifices a creature, else we
    // draw a card).
    onUpkeep(game) {
      game.targetOpponentLosesLife(3);
    },
  },
  {
    names: ['Necron Deathmark'],
    // CHECK WHEN ANOTHER DECK PLAYS IT: the mill is not modelled.
    onEnter(game, permanent) {
      game.podSnipe(DESTROY_CREATURE, permanent.card.name);
    },
  },
  {
    names: ['Solemn Simulacrum'],
    onEnter(game) {
      fetchLand(game, 'basic', true);
    },
    onDies(game, permanent) {
      game.draw(1, permanent.card.name);
    },
  },
  {
    names: ['Simulacrum Shaper'],
    onEnter(game) {
      fetchLand(game, 'basic', true);
    },
    onDies(game, permanent) {
      game.draw(1, permanent.card.name);
    },
  },
  {
    names: ['Scion of Halaster'],
    // Our commander creatures have: the first draw each turn looks at the top two, any number go to the graveyard.
    // CHECK WHEN ANOTHER DECK PLAYS IT: exactly one of the two goes to the graveyard (the lower discardValue).
    beforeFirstDrawEachTurn(game) {
      const hasCommanderCreatureOut = game.battlefield.some(
        (permanent) =>
          permanent.card.isCreature &&
          game.commanderNames.includes(permanent.card.name),
      );
      if (!hasCommanderCreatureOut || game.library.length < 2) return;
      const [topCard, secondCard] = game.library;
      const worse =
        game.discardValue(topCard) < game.discardValue(secondCard)
          ? topCard
          : secondCard;
      const keep = worse === topCard ? secondCard : topCard;
      game.takeTopCardsOfLibrary(2);
      game.putCardsOnTopOfLibrary([keep]);
      game.toGraveyard(worse);
      game.say(`Scion: ${worse.name} -> graveyard`);
    },
  },
  {
    names: ['Wood Elves'],
    onEnter(game) {
      fetchLand(game, 'forest', false);
    },
  },
  {
    names: ['Eternal Witness', 'Timeless Witness'],
    onEnter(game) {
      returnBestCardToHand(game);
    },
  },
  {
    names: [MASSACRE_WURM],
    onEnter(game) {
      // creatures your opponents control get -2/-2 until end of turn (its drain: engine/pod/pod-arena.ts)
      game.podShrinkCreatures(2, false, null, MASSACRE_WURM);
    },
  },
  {
    names: ['Mnemonic Wall'],
    onEnter(game) {
      returnBestCardToHand(game, (card) => card.isInstantOrSorcery);
    },
  },
  {
    // "When this creature enters, draw a card." (Baleful Strix draws in GameCore.enter)
    names: [
      'Wall of Omens',
      'Spirited Companion',
      'Helpful Hunter',
      'Elvish Visionary',
    ],
    onEnter(game, permanent) {
      game.draw(1, permanent.card.name);
    },
  },
  {
    names: [CORPSE_AUGUR],
    onDies(game, permanent) {
      corpseAugurDies(game, permanent);
    },
  },
  {
    names: ['Welcoming Vampire'],
    onAnotherOfOursEnters(game, _permanent, entered) {
      // another creature with power 2 or less enters: draw a card (once each turn)
      if (!entered.card.isCreature || game.power(entered) > 2) return;
      if (game.useOnceEachTurn('Welcoming Vampire')) game.draw(1);
    },
  },
  {
    names: ['Baron Bertram Graywater'],
    onAnotherOfOursEnters(game, _permanent, entered) {
      // tokens enter: create a 1/1 lifelink Vampire (once each turn)
      if (!entered.token) return;
      if (game.useOnceEachTurn('Baron Bertram Graywater'))
        game.createTokens(LIFELINK_VAMPIRE);
    },
  },
  {
    names: ['Haru-Onna'],
    onEnter(game) {
      game.draw(1);
    },
  },
  {
    names: ['Gas Guzzler'],
    onEnter(_game, permanent) {
      permanent.tapped = true;
    },
  },
  {
    names: ['Forerunner of the Legion'],
    onEnter(game) {
      game.doTutor(
        (card) => C.hasCreatureType(card, 'Vampire') && card.land === null,
        true,
      );
    },
  },
  {
    names: ["Garruk's Packleader"],
    onAnotherOfOursEnters(game, _permanent, entered) {
      if (entered.card.isCreature && game.power(entered) >= 3)
        game.draw(1, "Garruk's Packleader");
    },
  },
  {
    names: ['Grim Servant'],
    onEnter(game) {
      // a card with mana value up to our devotion to black to hand; we lose 3 life
      const devotion = game.devotion('B');
      game.doTutor((card) => card.manaValue <= devotion, false);
      game.loseLife(3);
    },
  },
  {
    names: ['Woe Strider'],
    onEnter(game) {
      game.createTokens(GOAT);
    },
  },
  {
    names: ['Grave Titan'],
    // CHECK WHEN ANOTHER DECK PLAYS IT: its attack trigger (two more Zombies) is not modelled
    onEnter(game) {
      game.createTokens(ZOMBIE, 2);
    },
  },
  {
    names: ['Shriekmaw'],
    // CHECK WHEN ANOTHER DECK PLAYS IT: its target is the biggest threat's best creature: nonartifact and nonblack are not checked
    onEnter(game) {
      game.podSnipe(SHRIEKMAW, 'Shriekmaw');
    },
  },
  {
    names: ['Burning-Rune Demon'],
    // CHECK WHEN ANOTHER DECK PLAYS IT: the best card to hand (the card: up to two with different names, an opponent
    // picks which one goes to the hand and the other to the graveyard).
    onEnter(game) {
      game.doTutor(() => true, false);
    },
  },
  {
    names: ['Demonlord Belzenlok'],
    onEnter(game) {
      // the next nonland card goes to our hand, again while it costs 4 or more; 1 damage to us each
      for (let i = 0; i < 10 && game.library.length; i++) {
        const nonland = game.library.find((card) => card.land === null);
        if (!nonland) return;
        const exiled = game.takeTopCardsOfLibrary(
          game.library.indexOf(nonland),
        );
        game.putCards(exiled, 'exile');
        game.takeCard(nonland, 'library');
        game.putCard(nonland, 'hand');
        game.loseLife(1);
        if (nonland.manaValue < 4) return;
      }
    },
  },
  {
    names: ['Bloodgift Demon'],
    onUpkeep(game) {
      game.draw(1);
      game.loseLife(1);
    },
  },
  {
    names: ['Graveshifter'],
    onEnter(game) {
      returnBestCreatureCardToHand(game);
    },
  },
  {
    names: ['Kardur, Doomscourge'],
    onEnter(game) {
      game.podGoadEachOpponentsCreatures();
    },
  },
  {
    names: ['Neyith of the Dire Hunt'],
    // CHECK WHEN ANOTHER DECK PLAYS IT: a card and 1 life at each upkeep stand in for its draws (the card: draws when
    // our creatures fight or become blocked, and doubles a creature's power at combat for {2}{R/G}).
    onUpkeep(game) {
      game.draw(1);
      game.loseLife(1);
    },
  },
  {
    names: ['Rhythm of the Wild'],
    // CHECK WHEN ANOTHER DECK PLAYS IT: "creature spells can't be countered" is not modelled.
    asAnotherOfOursEnters(game, _permanent, entering) {
      // riot for our nontoken creatures: haste or a +1/+1 counter (the deck's choice)
      if (!entering.card.isCreature || entering.token) return;
      if (game.riotTakesHaste(entering)) entering.sick = false;
      else game.addCounters(entering, 1);
    },
  },
  {
    names: ['Lurking Predators'],
    onOpponentCasts(game, _permanent, spell) {
      // reveal the top card: a creature enters, anything else may go to the bottom
      if (!game.library.length) return;
      const top = game.library[0];
      game.say(`${spell.name} was cast: Lurking Predators reveals`, top);
      if (top.isCreature) {
        game.takeCard(top, 'library');
        game.enter(top, 'library');
      } else if (game.putsRevealedCardOnBottom(top)) {
        game.takeCard(top, 'library');
        game.putCard(top, 'library'); // to the bottom
      }
    },
  },
  {
    names: ['Elemental Bond'],
    onAnotherOfOursEnters(game, _permanent, entered) {
      if (entered.card.isCreature && game.power(entered) >= 3) game.draw(1);
    },
  },
  {
    names: ['Guardian Project'],
    onAnotherOfOursEnters(game, _permanent, entered) {
      // a nontoken creature whose name no other creature of ours, nor a creature card in our graveyard, has
      if (!entered.card.isCreature || entered.token) return;
      const name = entered.card.name;
      const sameNameOut = game.battlefield.filter(
        (other) => other.card.name === name,
      ).length;
      if (
        sameNameOut === 1 &&
        !game.graveyard.some((card) => card.name === name)
      )
        game.draw(1);
    },
  },
  {
    names: ["Verdant Sun's Avatar"],
    onEnter(game, permanent) {
      game.gainLife(game.toughness(permanent));
    },
    onAnotherOfOursEnters(game, _permanent, entered) {
      if (entered.card.isCreature) game.gainLife(game.toughness(entered));
    },
  },
  {
    names: ['Colossal Majesty'],
    onUpkeep(game) {
      if (game.creatures().some((creature) => game.power(creature) >= 4))
        game.draw(1);
    },
  },
  {
    names: ['Land Tax'],
    onUpkeep(game) {
      if (game.opponentHasMoreLands())
        for (let i = 0; i < 3; i++) fetchLand(game, 'basic', false, true);
    },
  },
  {
    names: ['Knight of the White Orchid'],
    onEnter(game) {
      if (game.opponentHasMoreLands()) fetchLand(game, 'plains', false);
    },
  },
  {
    names: ["Archaeomancer's Map"],
    // CHECK WHEN ANOTHER DECK PLAYS IT: its land drop when an opponent's land enters is not modelled.
    onEnter(game) {
      fetchLand(game, 'plains', false, true);
      fetchLand(game, 'plains', false, true);
    },
  },
  {
    names: ['Starfield Shepherd'],
    // CHECK WHEN ANOTHER DECK PLAYS IT: the choice is fixed (the deck does not make it): a basic Plains while we have
    // fewer than five lands, else a creature card with mana value 1 or less. Warp is not modelled.
    onEnter(game) {
      const isShortOfLands =
        game.landsOnBattlefield().length + game.countLandsHand() < 5;
      const creature = game.library.find(
        (card) => card.isCreature && card.manaValue <= 1,
      );
      if (!creature || isShortOfLands) {
        fetchLand(game, 'plains', false, true);
        return;
      }
      game.takeCard(creature, 'library');
      game.shuffle();
      game.putCard(creature, 'hand');
      game.say('  search ->', creature);
    },
  },
  {
    names: ['Phyrexian Arena'],
    onUpkeep(game) {
      game.draw(1, 'Phyrexian Arena');
      game.loseLife(1);
    },
  },
];

/** Eternal Witness: the card in our graveyard we want most goes to our hand. */
function returnBestCardToHand(
  game: GameCore,
  isAllowed: (card: CardDef) => boolean = () => true,
): void {
  const allowed = game.graveyard.filter(isAllowed);
  if (!allowed.length) return;
  const best = firstMax(allowed, (card) => game.returnToHandValue(card));
  game.takeCardIfThere(best, 'graveyard');
  game.putCard(best, 'hand');
}
