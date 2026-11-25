/** Everything the DnD deck's AI may do now, with a score each (higher first). */
import {
  ALL_ABOARD,
  ANCESTRAL_RECALL,
  DAYDREAM,
  DELVERS_TORCH,
  DUNGEON_DESCENT,
  DUNGEON_MAP,
  EMERITUS_OF_IDEATION,
  EQUIPPED_WITH_TORCH,
  GENKU,
  HOLD,
  KNIGHT,
  NIKO,
  PREPARED,
  RASPUTIN,
  SKYCOACH_CONDUCTOR,
  SMALLEST_BLINK_WORTH_IT,
  WINDFALL,
} from './cards';
import type { DndGame } from './game';
import { CardDef, Cost } from '../../engine/cards/cards';
import { Candidate, Permanent } from '../../engine/game/game-types';
import {
  BLINK_SPELLS,
  BlinkSpell,
  blink,
  blinkTargets,
  bestCreatureToBlink,
} from '../../engine/game/blink';
import { ventureIntoDungeon } from '../../engine/game/dungeons';
import { firstMax } from '../../engine/util/lists';

/** Adds one thing the AI may do: its score, what it costs, whether it is an instant or sorcery, and how to do it. */
type AddCandidate = (
  score: number,
  cost: Cost,
  isInstantOrSorcery: boolean,
  action: () => boolean,
  rockCard?: CardDef,
) => void;

export function buildCandidates(game: DndGame, main2: boolean): Candidate[] {
  const candidates: Candidate[] = [];
  const add: AddCandidate = (score, cost, isInstantOrSorcery, action, rock) =>
    candidates.push({ score, cost, isInstantOrSorcery, action, rock });

  for (const commander of game.command.slice())
    add(
      95,
      game.commanderCost(commander, game.effectiveCost(commander)),
      false,
      () => game.castPerm(commander, true),
    );
  const seenNames = new Set<string>();
  for (const card of game.hand.slice()) {
    if (seenNames.has(card.name) || card.land !== null || HOLD.has(card.name))
      continue;
    seenNames.add(card.name);
    addHandCardCandidate(game, card, main2, add);
  }
  addDaydreamFlashbackCandidate(game, main2, add);
  addPreparedSpellCandidates(game, add);
  addDungeonCandidates(game, main2, add);
  if (main2) addMainPhaseTwoCandidates(game, add);
  else addTorchCandidate(game, add);
  return candidates;
}

function addHandCardCandidate(
  game: DndGame,
  card: CardDef,
  main2: boolean,
  add: AddCandidate,
): void {
  const cost = game.effectiveCost(card);
  const blinkSpell = BLINK_SPELLS[card.name];
  if (blinkSpell) {
    const score = blinkSpellScore(game, blinkSpell, main2);
    if (score > 0)
      add(score + (card.keywords.has('rebound') ? 5 : 0), cost, true, () =>
        game.castInstantOrSorcery(card),
      );
    return;
  }
  if (card.name === WINDFALL) {
    if (game.hand.length <= 3)
      add(50, cost, true, () => game.castInstantOrSorcery(card));
    return;
  }
  if (card.isInstantOrSorcery)
    add(30, cost, true, () => game.castInstantOrSorcery(card));
  else add(game.battlefieldValue(card), cost, false, () => game.castPerm(card));
}

/** A blink spell's score from what it would bring back; 0 = not worth it. A spell that blinks everything until the
 *  end step waits for the second main phase (the creatures would miss combat). */
function blinkSpellScore(
  game: DndGame,
  spell: BlinkSpell,
  main2: boolean,
): number {
  if (spell.count === 'all') {
    if (!main2) return 0;
    const total = blinkTargets(game, spell).reduce(
      (sum, permanent) => sum + Math.max(0, game.blinkValue(permanent)),
      0,
    );
    return total >= 10 ? Math.min(90, 40 + 3 * total) : 0;
  }
  const targets = blinkTargets(game, spell);
  const best = targets.length ? game.blinkValue(targets[0]) : 0;
  if (best < SMALLEST_BLINK_WORTH_IT) return 0;
  const total = targets.reduce(
    (sum, permanent) => sum + game.blinkValue(permanent),
    0,
  );
  return Math.min(90, 40 + 5 * total);
}

/** Daydream's flashback ({2}{W}) from the graveyard. */
function addDaydreamFlashbackCandidate(
  game: DndGame,
  main2: boolean,
  add: AddCandidate,
): void {
  const daydream = game.graveyard.find((card) => card.name === DAYDREAM);
  if (!daydream) return;
  const score = blinkSpellScore(game, BLINK_SPELLS[DAYDREAM], main2);
  const flashbackCost = Cost.parse('{2}{W}');
  if (score > 0)
    add(score - 5, flashbackCost, true, () =>
      game.castInstantOrSorcery(daydream, true, flashbackCost),
    );
}

/** The prepared creatures' spells: All Aboard (a blink) and Ancestral Recall (draw three), each {U}. */
function addPreparedSpellCandidates(game: DndGame, add: AddCandidate): void {
  for (const creature of game.battlefield) {
    if (!(creature.marks & PREPARED)) continue;
    if (creature.card.name === EMERITUS_OF_IDEATION)
      add(75, ANCESTRAL_RECALL.cost, true, () =>
        game.castPreparedSpell(creature, ANCESTRAL_RECALL),
      );
    if (creature.card.name === SKYCOACH_CONDUCTOR) {
      const target = bestCreatureToBlink(
        game,
        (other) => other.card.name !== SKYCOACH_CONDUCTOR,
      );
      const value = target ? game.blinkValue(target) : 0;
      if (value >= SMALLEST_BLINK_WORTH_IT)
        add(40 + 5 * value, ALL_ABOARD.cost, true, () =>
          game.castPreparedSpell(creature, ALL_ABOARD),
        );
    }
  }
}

/** Taps a permanent for its ability's cost ({T}) and pays the mana without it. Returns false (nothing changed) if
 *  it is tapped or the mana can't be paid. */
function payTappingSource(
  game: DndGame,
  source: Permanent,
  cost: Cost,
): boolean {
  if (source.tapped) return false;
  source.tapped = true;
  if (game.pay(cost)) return true;
  source.tapped = false;
  return false;
}

/** Dungeon Map ({3}, {T}) and Dungeon Descent ({4}, {T}, tap an untapped legendary creature): venture. */
function addDungeonCandidates(
  game: DndGame,
  main2: boolean,
  add: AddCandidate,
): void {
  const map = game.battlefield.find(
    (permanent) => permanent.card.name === DUNGEON_MAP && !permanent.tapped,
  );
  if (map) {
    const cost = new Cost(3);
    add(50, cost, false, () => {
      if (!payTappingSource(game, map, cost)) return false;
      game.say('activate', map.card);
      ventureIntoDungeon(game);
      return true;
    });
  }
  const descent = game.battlefield.find(
    (permanent) => permanent.card.name === DUNGEON_DESCENT && !permanent.tapped,
  );
  // (the legendary creature it taps can't attack: after combat only)
  const legendary = game
    .creatures()
    .find(
      (creature) => !creature.tapped && creature.card.types.has('legendary'),
    );
  if (main2 && descent && legendary) {
    const cost = new Cost(4);
    add(48, cost, false, () => {
      if (!payTappingSource(game, descent, cost)) return false;
      legendary.tapped = true;
      game.say('activate', descent.card, 'tapping', legendary.card);
      ventureIntoDungeon(game);
      return true;
    });
  }
}

/** After combat: Niko's blink, Niko's Shards, Rasputin's Knights, Genku's counters. */
function addMainPhaseTwoCandidates(game: DndGame, add: AddCandidate): void {
  addNikoCandidates(game, add);
  const rasputin = game.findPermanent(RASPUTIN);
  if (
    rasputin &&
    !rasputin.tapped &&
    !rasputin.sick &&
    game.rasputinDreamCounters > 0
  )
    add(45, new Cost(), false, () => {
      rasputin.tapped = true;
      game.say('activate', rasputin.card);
      game.rasputinDreamCounters -= 1;
      game.createTokens(KNIGHT);
      return true;
    });
  const creatureCount = game.creatures().length;
  if (game.isOnBattlefield(GENKU) && creatureCount >= 3) {
    const cost = Cost.parse('{3}{W}{U}');
    add(10 + 6 * creatureCount, cost, false, () => {
      if (!game.pay(cost)) return false;
      for (const creature of game.creatures()) creature.counters += 1;
      game.say(`  ${GENKU}: a +1/+1 counter on each creature`);
      return true;
    });
  }
}

/** Niko ({2}, {T}): a nonlegendary creature of ours is exiled until the next end step (its enter trigger again then).
 *  A Shard ({2}, sacrifice it): scry 1, draw a card. (The Shards becoming copies is not modelled.) */
function addNikoCandidates(game: DndGame, add: AddCandidate): void {
  const niko = game.findPermanent(NIKO);
  if (niko && !niko.sick) {
    const target = bestCreatureToBlink(
      game,
      (creature) => !creature.card.types.has('legendary'),
    );
    const value = target ? game.blinkValue(target) : 0;
    const cost = new Cost(2);
    if (target && value >= SMALLEST_BLINK_WORTH_IT)
      add(35 + 5 * value, cost, false, () => {
        if (!payTappingSource(game, niko, cost)) return false;
        game.say('activate', niko.card);
        blink(game, target, { returnsAtEndStep: true });
        return true;
      });
  }
  const shard = game.battlefield.find(
    (permanent) => permanent.card.name === 'Shard',
  );
  if (shard) {
    const cost = new Cost(2);
    add(35, cost, false, () => {
      if (!game.pay(cost)) return false;
      game.sacrifice(shard);
      game.scry(1);
      game.draw(1);
      return true;
    });
  }
}

/** Before combat: Delver's Torch ({3}) on the creature that attacks best. */
function addTorchCandidate(game: DndGame, add: AddCandidate): void {
  if (!game.isOnBattlefield(DELVERS_TORCH) || game.isTorchAttached()) return;
  const attackers = game
    .creatures()
    .filter((creature) => game.canAttack(creature));
  if (!attackers.length) return;
  const holder = firstMax(attackers, (creature) =>
    game.evasive(creature) ? 10 + game.power(creature) : game.power(creature),
  );
  const cost = new Cost(3);
  add(45, cost, false, () => {
    if (holder.marks & EQUIPPED_WITH_TORCH || !game.pay(cost)) return false;
    game.equipTorch(holder);
    return true;
  });
}
