/** Rules checks on hand-built boards. Run: npm run sim -- azula --test */
import * as C from '../../../engine/cards/cards';
import { Permanent } from '../../../engine/game/game-types';
import { addFirebendingMana } from '../../../engine/game/firebending';
import { copySpell } from '../../../engine/game/spell-copies';
import { Rng } from '../../../engine/util/rng';
import { WEARS_GREAVES } from '../cards';
import { findComboWin, goOffWithCombo } from '../combos';
import { CFG } from '../config';
import { AzulaGame } from '../game';

const repeatName = (cardName: string, count: number) =>
  new Array(count).fill(cardName) as string[];

const SIX_LANDS = [...repeatName('Island', 3), ...repeatName('Mountain', 3)];

function board(
  battlefieldNames: string[] = [],
  hand: string[] = [],
  lands = SIX_LANDS,
  library = [...repeatName('Island', 20), ...repeatName('Mountain', 20)],
): AzulaGame {
  const game = new AzulaGame([], library, new Rng(1), { ...CFG });
  game.commanderNames = ['Fire Lord Azula']; // (she starts on the battlefield, not in the command zone)
  game.startTurn();
  game.turn = 6;
  game.step = 'main1';
  for (const landName of lands) {
    const card = C.get(landName);
    const permanent = new Permanent(card, card.land);
    permanent.sick = false;
    game.battlefield.push(permanent);
  }
  for (const cardName of battlefieldNames) {
    const permanent = new Permanent(C.get(cardName));
    permanent.sick = false;
    game.battlefield.push(permanent);
  }
  game.hand = hand.map((cardName) => C.get(cardName));
  return game;
}

const countOf = (game: AzulaGame, cardName: string): number =>
  game.battlefield.filter((permanent) => permanent.card.name === cardName)
    .length;

/** Azula is attacking: the combat step, her flag set. */
function attackWithAzula(game: AzulaGame): void {
  game.step = 'combat';
  game.isAzulaAttacking = true;
}

export function runAzulaTests(): boolean {
  let allPassed = true;
  const check = (label: string, got: unknown, expect: unknown) => {
    const good = JSON.stringify(got) === JSON.stringify(expect);
    console.log(
      `${good ? 'OK ' : 'BAD'} ${label}: got ${JSON.stringify(got)}, expected ${JSON.stringify(expect)}`,
    );
    if (!good) allPassed = false;
  };

  // ---------------------------------------------------------------- engine: firebending, copies, magecraft
  {
    const game = board(['Fire Lord Azula']);
    addFirebendingMana(game, [game.azula()!]);
    check('firebending 2: Azula attacking adds {R}{R}', game.pool.R, 2);
  }
  {
    const game = board(['Storm-Kiln Artist'], ['Frantic Search']);
    game.castInstantOrSorcery(game.hand[0]);
    check(
      'Storm-Kiln Artist: casting an instant makes a Treasure',
      countOf(game, 'Treasure'),
      1,
    );
  }
  {
    const game = board(['Storm-Kiln Artist', 'Veyran, Voice of Duality']);
    copySpell(game, C.get('Frantic Search'));
    check(
      'Veyran: a copy makes Storm-Kiln Artist trigger twice',
      countOf(game, 'Treasure'),
      2,
    );
  }
  {
    const game = board(['Twinning Staff', 'Archmage Emeritus']);
    copySpell(game, C.get('Demand Answers'));
    // two copies (Twinning Staff), each draws two and Emeritus draws one
    check(
      'Twinning Staff: one copy becomes two; Archmage Emeritus draws on each',
      game.hand.length,
      6,
    );
  }

  {
    const game = board(['Twinning Staff']);
    copySpell(game, C.get('Twinning Staff'));
    check(
      'Twinning Staff copied: two tokens, and the new Staffs add no copies to this one',
      countOf(game, 'Twinning Staff'),
      3,
    );
  }
  {
    const game = board(['Storm of Saruman']);
    game.spellsCast = 2;
    game.podAnnounceCast(C.get('Storm of Saruman'));
    check(
      'Storm of Saruman copying a Storm of Saruman: one token',
      countOf(game, 'Storm of Saruman'),
      2,
    );
  }

  // ---------------------------------------------------------------- Azula and the other copiers
  {
    const game = board(['Fire Lord Azula'], ['Big Score', 'Island']);
    attackWithAzula(game);
    game.castInstantOrSorcery(game.hand[0]);
    // (cast directly: the discard is the AI's, in candidates.ts)
    check(
      'Azula attacking: Big Score is copied (Island + 4 cards, 4 Treasures)',
      [game.hand.length, countOf(game, 'Treasure')],
      [5, 4],
    );
  }
  {
    const game = board(['Fire Lord Azula'], ['Demand Answers']);
    game.castInstantOrSorcery(game.hand[0]);
    check('Azula not attacking: no copy', game.hand.length, 2);
  }
  {
    const game = board(['Storm of Saruman'], ['Demand Answers', 'Big Score']);
    game.castInstantOrSorcery(game.hand[0]);
    const handAfterFirst = game.hand.length;
    game.castInstantOrSorcery(game.cardInHand('Big Score')!);
    check(
      'Storm of Saruman: the second spell of the turn is copied',
      [handAfterFirst, countOf(game, 'Treasure')],
      [3, 4],
    );
  }
  {
    const game = board(['Prismari, the Inspiration'], ['Demand Answers']);
    game.spellsCast = 2;
    game.castInstantOrSorcery(game.hand[0]);
    check(
      'Prismari: storm copies the third spell twice (three times two cards)',
      game.hand.length,
      6,
    );
  }
  {
    const game = board(['Vivi Ornitier'], ['Frantic Search']);
    game.castInstantOrSorcery(game.hand[0]);
    check(
      'Vivi Ornitier: a noncreature spell pings each opponent and grows it',
      [game.life, game.findPermanent('Vivi Ornitier')!.counters],
      [[39, 39, 39], 1],
    );
  }
  {
    const game = board(['Arcane Bombardment'], ['Frantic Search']);
    game.graveyard = [C.get('Lightning Bolt')];
    game.castInstantOrSorcery(game.hand[0]);
    check(
      'Arcane Bombardment: the first spell casts a free copy of a graveyard spell',
      [game.life[0], game.exile.map((card) => card.name)],
      [37, ['Lightning Bolt']],
    );
  }

  // ---------------------------------------------------------------- other cards
  {
    const game = board(['Fated Firepower']);
    game.findPermanent('Fated Firepower')!.counters = 3;
    game.damageOpponent(0, 3);
    game.opponentLosesLife(1, 3);
    check(
      'Fated Firepower: damage +3, life loss unchanged',
      game.life.slice(0, 2),
      [34, 37],
    );
  }
  {
    const game = board(['Ozai, the Phoenix King']);
    game.pool.U = 2;
    game.enterStep('main2');
    check('Ozai: mana we would lose becomes red', game.pool.R, 2);
  }
  {
    const game = board(['Fire Lord Azula', 'Lightning Greaves']);
    const azula = game.azula()!;
    azula.sick = true;
    const before = game.canAttack(azula);
    azula.marks |= WEARS_GREAVES;
    check(
      'Lightning Greaves: a summoning-sick Azula may attack',
      [before, game.canAttack(azula)],
      [false, true],
    );
  }
  {
    const game = board(['Thought Vessel'], repeatName('Island', 9));
    game.endTurn();
    check('Thought Vessel: no discard to seven', game.hand.length, 9);
  }
  {
    const game = board(
      ['Fire Lord Azula'],
      ['Force of Will', 'Counterspell', 'Fierce Guardianship'],
      [],
    );
    check(
      'Force of Will pitches a blue card, Fierce Guardianship is free with Azula out',
      [
        game.answerCost(game.hand[0]).manaValue,
        game.answerCost(game.hand[2]).manaValue,
      ],
      [0, 0],
    );
    const withoutAzula = board([], ['Fierce Guardianship'], []);
    check(
      'Fierce Guardianship costs {2}{U} without a commander out',
      withoutAzula.answerCost(withoutAzula.hand[0]).manaValue,
      3,
    );
  }

  // ---------------------------------------------------------------- the combos
  const eightLands = [...repeatName('Island', 4), ...repeatName('Mountain', 4)];
  const nineLands = [...eightLands, 'Mountain'];
  {
    const game = board(
      [],
      ["Jeska's Will", 'Reiterate', 'Lightning Bolt'],
      nineLands,
    );
    check(
      "combo 1: Jeska's Will + Reiterate, 7 cards in a hand, Lightning Bolt",
      findComboWin(game)?.name,
      "Reiterate + Jeska's Will",
    );
    game.config.opp_hand = 6;
    check(
      'combo 1: 6 cards only break even (no Vivi): no win',
      findComboWin(game),
      null,
    );
    const withVivi = board(
      ['Vivi Ornitier'],
      ["Jeska's Will", 'Reiterate'],
      nineLands,
    );
    withVivi.config.opp_hand = 6;
    check(
      'combo 1: with 6 cards Vivi pings on each Reiterate',
      findComboWin(withVivi)?.finisher,
      'Vivi Ornitier',
    );
  }
  {
    const game = board(
      [],
      ['Mana Geyser', 'Reiterate', 'Breath of Malfegor'],
      [...nineLands, 'Mountain', 'Mountain', 'Swamp'],
    );
    game.turn = 4; // 2.15 x 4 = 9 tapped opposing lands
    check(
      'combo 2: Mana Geyser + Reiterate, Breath of Malfegor needs {B}: a Swamp left',
      findComboWin(game)?.finisher,
      'Breath of Malfegor',
    );
  }
  {
    const game = board(
      ['Storm-Kiln Artist'],
      ['Seething Song', 'Reiterate', 'Lightning Bolt'],
      eightLands,
    );
    const win = findComboWin(game);
    check(
      'combo 3: Storm-Kiln Artist + Seething Song + Reiterate (8 mana, one Treasure)',
      win?.name,
      'Storm-Kiln Artist + Seething Song + Reiterate',
    );
    goOffWithCombo(game, win!);
    check(
      'going off kills every opponent; the pod may counter Seething Song, Reiterate or the Bolt',
      [game.hasWon(), game.winAttempt()],
      [
        true,
        {
          spells: ['Seething Song', 'Reiterate', 'Lightning Bolt'],
          perms: ['Storm-Kiln Artist'],
          backup: 0,
        },
      ],
    );
    const noFinisher = board(
      ['Storm-Kiln Artist'],
      ['Seething Song', 'Reiterate'],
      eightLands,
    );
    check(
      'combo 3 without a finisher in hand (it does not dig): no win',
      findComboWin(noFinisher),
      null,
    );
    noFinisher.battlefield.push(new Permanent(C.get('Archmage Emeritus')));
    noFinisher.library.push(C.get('Torment of Hailfire'));
    check(
      'combo 3 with Archmage Emeritus draws the library: Torment of Hailfire',
      findComboWin(noFinisher)?.finisher,
      'Torment of Hailfire',
    );
  }
  {
    const hand = ["Narset's Reversal", 'Reverberate', 'Lightning Bolt'];
    check(
      'combo 5: Narset + Reverberate without Storm-Kiln Artist: no win',
      findComboWin(board([], hand, eightLands)),
      null,
    );
    check(
      'combo 5: with Storm-Kiln Artist (Treasures without end)',
      // {U}{U} + {R}{R} twice + Lightning Bolt's {R}
      findComboWin(board(['Storm-Kiln Artist'], hand, nineLands))?.name,
      "Narset's Reversal + Reverberate",
    );
  }
  {
    const hand = ["Narset's Reversal", 'Lightning Bolt'];
    check(
      'combo 4: Twinning Staff ({7}) + Narset + Storm-Kiln Artist',
      findComboWin(
        board(['Twinning Staff', 'Storm-Kiln Artist'], hand, [
          ...nineLands,
          'Island',
        ]),
      )?.name,
      "Twinning Staff + Narset's Reversal",
    );
  }
  {
    const hand = ["Narset's Reversal", 'Frantic Search'];
    const library = [...repeatName('Island', 10), 'Lightning Bolt'];
    const game = board(['Fire Lord Azula'], hand, SIX_LANDS, library);
    check('combo 6 needs Azula attacking', findComboWin(game), null);
    attackWithAzula(game);
    check(
      'combo 6: Azula attacking + Narset + Frantic Search loots to a Lightning Bolt',
      [findComboWin(game)?.name, findComboWin(game)?.finisher],
      [
        "Fire Lord Azula + Narset's Reversal + Frantic Search",
        'Lightning Bolt',
      ],
    );
  }
  {
    const game = board(
      ['Fire Lord Azula', 'Storm-Kiln Artist'],
      ["Narset's Reversal", 'Lightning Bolt'],
      [],
    );
    attackWithAzula(game);
    game.pool.R = 2; // firebending
    check(
      'combo 7: Azula attacking + Narset + Storm-Kiln Artist, Bolt paid by firebending',
      findComboWin(game)?.name,
      "Fire Lord Azula + Narset's Reversal + Storm-Kiln Artist",
    );
  }
  {
    const game = board(
      ['Prismari, the Inspiration', 'Storm-Kiln Artist'],
      ['Reiterate', 'Lightning Bolt'],
    );
    check(
      'combo 9: Prismari + Reiterate + Storm-Kiln Artist',
      findComboWin(game)?.name,
      'Prismari + Reiterate',
    );
  }
  return allPassed;
}
