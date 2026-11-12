import {
  AESI,
  AFFINITY,
  BSZ,
  BUDOKA,
  COBRA,
  DOMINION,
  HARU,
  HOLD,
  KHALNI,
  KIRI,
  KODAMA,
  LOOP_CAST,
  MELOKU,
  MINDSWEEPER,
  OMNI,
  PUTTERS,
  RETURNERS,
  REVOLT,
  SWARM,
  TATYOVA,
  TOK,
  UYO,
} from './cards';
import type { AesiGame } from './game';
import { CardDef, Cost } from '../../engine/cards';
import { Perm } from '../../engine/game-types';
import { firstMax, removeIfPresent } from '../../engine/lists';

/** What the loops on the battlefield give right now (see loops()). */
export interface Loops {
  landfall: boolean; // endless landfall triggers
  mana: boolean; // endless mana
  draw: boolean; // endless draws (Aesi, or the Onnas with Omniscience)
  tokens: boolean; // endless Meloku Illusions
  mill: boolean; // endless Mindsweeper activations
  copy: boolean; // endless Uyo copies
  lock: boolean; // every opponent's land bounced (lands are creatures: Kiri-Onna or Mirror-Mage over and over)
  replay: boolean;
  start: number; // mana needed to keep a loop going (kept in reserve while the solver casts things)
  putter: Perm | null; // the "put a land" creature a Retreat loop uses (Retreat untaps it after every land) // a way to replay a land (Retreat + putter, or Kodama + Meloku)
  how: string[];
}

// ================================================================ the loop solver
/** A creature that can put a land onto the battlefield over and over (Retreat untaps it). */
export function findLoopPutter(game: AesiGame): Perm | null {
  const permanents = game.bf.filter(
    (permanent) =>
      PUTTERS.has(permanent.cd.name) &&
      !permanent.sick &&
      !(
        permanent.cd.name === BUDOKA &&
        (permanent.transformed || game.landsBf().length >= 9)
      ),
  );
  const otherPermanent = permanents.find((permanent) => !permanent.tapped);
  if (otherPermanent) return otherPermanent;
  // a tapped one: a land drop (with a land in hand) starts the loop by untapping it
  if (permanents.length && game.canDrop() && game.landsInHand().length)
    return permanents[0];
  return null;
}

/** The best instant or sorcery for Uyo to copy that we can cast with this much mana. */
export function uyoTarget(game: AesiGame, budget: number): CardDef | null {
  const cards = game.hand.filter((card) => card.isIS && !HOLD.has(card.name));
  const cost = (card: CardDef) =>
    card.name === BSZ ? 4 : game.effCost(card).mv;
  const otherCards = cards.filter((card) => cost(card) <= budget);
  if (!otherCards.length) return null;
  const priority = (card: CardDef) =>
    card.name === BSZ
      ? 3
      : card.name === SWARM
        ? 2
        : card.name === DOMINION
          ? 1
          : 0;
  return firstMax(otherCards, priority);
}

/** What the board gives a loop: read once by findLoops and shared by its steps. */
interface LoopContext {
  cobraBonus: 0 | 1; // Lotus Cobra makes one more mana for every landfall
  abilityReduction: number; // what Familiar / Training Grounds / Heartstone take off an ability
  manaPerReplayedLand: number; // 0 when lands are summoning-sick creatures (Nature's Revolt, Natural Affinity)
  untappedLands: number; // lands that come back untapped
  availableMana: number;
  putter: Perm | null; // the "put a land" creature a Retreat loop uses
  hasKodamaAndMeloku: boolean;
}

/** Which loops are on the battlefield right now. Mana per loop = lands returned x (1 if they come back
 *  untapped + 1 with Lotus Cobra) + 1 for Oboro Breezecaller's untap - the ability's cost (after
 *  reducers, never below 1). 0 or more: endless; more than 0: endless mana as well. */
export function findLoops(game: AesiGame): Loops {
  const loops: Loops = {
    landfall: false,
    mana: false,
    draw: false,
    tokens: false,
    mill: false,
    copy: false,
    lock: false,
    replay: false,
    start: 99,
    putter: null,
    how: [],
  };
  const context: LoopContext = {
    cobraBonus: game.onBf(COBRA) ? 1 : 0,
    abilityReduction: game.reduction(),
    manaPerReplayedLand: game.replayMana(),
    untappedLands: game
      .landsBf()
      .filter((permanent) => game.untappedLand(permanent.cd)).length,
    availableMana: game.availMana(),
    putter: game.hasUntapper() ? findLoopPutter(game) : null,
    hasKodamaAndMeloku: game.onBf(KODAMA) && game.onBf(MELOKU),
  };
  loops.replay = context.putter !== null || context.hasKodamaAndMeloku;
  findOmniscienceDrawLoop(game, loops);
  findRetreatLoops(game, loops, context);
  findKodamaMelokuLoop(game, loops, context);
  completeLoops(game, loops, context);
  return loops;
}

/** Records a landfall loop: its description, the mana it nets, and the mana needed to start it. */
function recordLandfallLoop(
  loops: Loops,
  context: LoopContext,
  how: string,
  netMana: number,
  startMana = 0,
  viaPutter = false,
): void {
  loops.landfall = true;
  if (viaPutter) loops.putter = context.putter;
  loops.start = Math.min(loops.start, startMana);
  if (netMana > 0) loops.mana = true;
  loops.how.push(how);
}

/** Omniscience with both Onnas: they are cast for free and returned over and over, drawing as many cards as needed. */
function findOmniscienceDrawLoop(game: AesiGame, loops: Loops): void {
  const inHand = (name: string) => game.hand.some((card) => card.name === name);
  if (
    game.onBf(OMNI) &&
    (inHand(KIRI) || inHand(HARU)) &&
    (inHand(KIRI) || game.onBf(KIRI)) &&
    (inHand(HARU) || game.onBf(HARU))
  ) {
    loops.draw = true;
    loops.start = 0;
    loops.how.push(
      'Omniscience + Kiri-Onna + Haru-Onna (draw as many as needed, bounce their creatures)',
    );
  }
}

/** Retreat untaps a "put a land" creature, and a moonfolk returns the land to hand to play it again. */
function findRetreatLoops(
  game: AesiGame,
  loops: Loops,
  context: LoopContext,
): void {
  const { putter } = context;
  if (!putter) return;
  const putterName = putter.cd.name.split(',')[0];
  const chamber = game.hand.find((card) => card.land?.special === 'chamber');
  if (chamber)
    recordLandfallLoop(
      loops,
      context,
      `Retreat + ${putterName} + ${chamber.name}`,
      context.cobraBonus,
      0,
      true,
    );
  for (const permanent of game.bf) {
    const returner = RETURNERS[permanent.cd.name];
    if (!returner || returner[2] === 'counter') continue;
    const [abilityMana, landsReturned, effect] = returner;
    const cost = Math.max(1, abilityMana - context.abilityReduction);
    if (context.untappedLands < landsReturned || context.availableMana < cost)
      continue;
    if (effect === 'copy' && !uyoTarget(game, context.availableMana - cost))
      continue;
    const netMana =
      landsReturned * (context.manaPerReplayedLand + context.cobraBonus) +
      (effect === 'untap' ? 1 : 0) -
      cost;
    if (netMana < 0 && !game.infMana) continue;
    recordLandfallLoop(
      loops,
      context,
      `Retreat + ${putterName} + ${permanent.cd.name.split(',')[0]}`,
      netMana,
      cost,
      true,
    );
    if (effect === 'token') loops.tokens = true;
    else if (effect === 'mill') loops.mill = true;
    else if (effect === 'copy') loops.copy = true;
    else if (
      permanent.cd.name === 'Soratami Mirror-Mage' &&
      game.landsCreatures()
    )
      loops.lock = true;
  }
}

/** Kodama + Meloku: with lands as creatures Retreat (free in this loop) untaps an older land each time. */
function findKodamaMelokuLoop(
  game: AesiGame,
  loops: Loops,
  context: LoopContext,
): void {
  const netMana =
    context.manaPerReplayedLand +
    context.cobraBonus +
    (game.hasUntapper() && game.landsCreatures() ? 1 : 0) -
    1;
  if (
    context.hasKodamaAndMeloku &&
    context.untappedLands >= 1 &&
    context.availableMana >= 1 &&
    (netMana >= 0 || game.infMana)
  ) {
    recordLandfallLoop(loops, context, 'Kodama + Meloku', netMana, 1);
    loops.tokens = true;
  }
}

/** What follows from the loops found: endless mana lets every moonfolk be the land returner; draws and the land lock. */
function completeLoops(
  game: AesiGame,
  loops: Loops,
  context: LoopContext,
): void {
  if (loops.landfall && context.cobraBonus) loops.mana = true;
  if (game.infMana) loops.mana = true;
  if (loops.mana && loops.replay) {
    // endless mana: every moonfolk can be the land returner
    loops.landfall = true;
    if (context.putter && !loops.putter) loops.putter = context.putter;
    if (game.onBf(MINDSWEEPER)) loops.mill = true;
    if (game.onBf(MELOKU)) loops.tokens = true;
    if (game.onBf(UYO) && uyoTarget(game, 99)) loops.copy = true;
    if (game.onBf('Soratami Mirror-Mage') && game.landsCreatures())
      loops.lock = true;
  }
  // Omniscience + Onnas with lands as creatures: Kiri-Onna bounces a land every time
  if (
    loops.draw &&
    loops.how[0]?.startsWith('Omniscience') &&
    (game.revolt ||
      game.affinity ||
      game.hand.some((card) => card.name === AFFINITY || card.name === REVOLT))
  )
    loops.lock = true;
  if (loops.landfall && (game.onBf(AESI) || game.onBf(TATYOVA)))
    loops.draw = true;
}

/** Cheap test before the solver: is any loop conceivable? */
export function isLoopConceivable(game: AesiGame): boolean {
  return (
    game.infMana ||
    game.hasUntapper() ||
    game.onBf(OMNI) ||
    (game.onBf(KODAMA) && game.onBf(MELOKU))
  );
}

/** Shortcut the loops on the battlefield: draw (keeping some cards), put every land from hand onto the
 *  battlefield, cast what makes the loops bigger, and look for a win. Returns true if we won now. */
export function solveLoops(game: AesiGame): boolean {
  if (!isLoopConceivable(game)) return false;
  const key =
    game.bf
      .map((permanent) => permanent.cd.name + (permanent.tapped ? 't' : ''))
      .join('|') +
    '#' +
    game.hand.map((card) => card.name).join('|') +
    '#' +
    game.availMana() +
    game.dropsUsed;
  if (key === game.comboKey) return false;
  game.comboKey = key;
  let loops = findLoops(game);
  if (!loops.landfall && !loops.draw) return false;
  const how = 'LOOP: ' + loops.how.join('; ');
  if (how !== game.lastLoopSay) game.say(how);
  game.lastLoopSay = how;
  // what the loops gave at any point (casting can use up the mana a loop needs, but its tokens were made first)
  let tokens = false,
    copy = false;
  for (let iteration = 0; iteration < 120; iteration++) {
    if (loops.putter) loops.putter.tapped = false; // Retreat untapped it after the loop's last land
    if (loops.mana && !game.infMana) {
      game.infMana = true;
      game.say('LOOP: endless mana');
    }
    tokens ||= loops.tokens;
    copy ||= loops.copy;
    if (winFromLoops(game, loops)) return true;
    // draw everything first (keeping some cards), then put the lands down, then cast
    if (loops.draw && game.library.length > game.libraryCardsToKeep()) {
      game.draw(game.library.length - game.libraryCardsToKeep());
      if (loops.landfall && loops.replay) dumpLandsFromHand(game);
      loops = findLoops(game);
      continue;
    }
    let progress = false;
    if (loops.landfall && loops.replay && dumpLandsFromHand(game))
      progress = true;
    game.loopReserve = game.infMana ? 0 : loops.start === 99 ? 0 : loops.start;
    if (castForLoops(game)) progress = true;
    game.loopReserve = 0;
    if (!progress) break;
    loops = findLoops(game);
  }
  setUpNextTurnWin(game, {
    ...loops,
    tokens: tokens || loops.tokens,
    copy: copy || loops.copy,
  });
  game.comboKey =
    game.bf
      .map((permanent) => permanent.cd.name + (permanent.tapped ? 't' : ''))
      .join('|') +
    '#' +
    game.hand.map((card) => card.name).join('|') +
    '#' +
    game.availMana() +
    game.dropsUsed;
  return game.oppsBeaten();
}

/** A win this turn from the loops: Mindsweeper, Uyo copying Blue Sun's Zenith, or endless mana +
 *  Blue Sun's Zenith (drawn again each time with endless draws). */
export function winFromLoops(game: AesiGame, loops: Loops): boolean {
  if (loops.lock && game.cfg.land_lock_win) {
    const otherCard =
      !game.revolt && !game.affinity
        ? game.hand.find(
            (card) => card.name === AFFINITY || card.name === REVOLT,
          )
        : undefined;
    if (otherCard) {
      if (
        otherCard.name === AFFINITY
          ? game.castIS(otherCard)
          : game.castPerm(otherCard)
      )
        game.say(`(${otherCard.name}: lands are creatures)`);
    }
    if (game.revolt || game.affinity) {
      game.locked = true;
      for (let i = 0; i < game.lib.length; i++)
        if (game.firstOppDead === null) game.firstOppDead = game.turn;
      game.loopWinHow = "land lock: every opponent's land bounced";
      game.say(
        "LOOP WIN: lands are creatures, every opponent's land is bounced over and over (land lock)",
      );
      return true;
    }
  }
  if (loops.mill) {
    game.millAll('endless Soratami Mindsweeper activations');
    return true;
  }
  const bszHand = game.hand.find((card) => card.name === BSZ);
  if (
    loops.copy &&
    bszHand &&
    uyoTarget(game, game.availMana() - 1)?.name === BSZ &&
    castZenithWithX(game, bszHand, 1)
  ) {
    game.millAll("Uyo copies Blue Sun's Zenith for every opponent");
    return true;
  }
  if (
    game.infMana &&
    (bszHand || (loops.draw && game.library.some((card) => card.name === BSZ)))
  ) {
    if (loops.draw) {
      game.millAll(
        "endless mana: Blue Sun's Zenith on each opponent (shuffled back and drawn again)",
      );
      return true;
    }
    // one huge Zenith: one opponent
    let target: number | null = null;
    for (let i = 0; i < game.lib.length; i++)
      if (
        game.oppAlive(i) &&
        (target === null || game.lib[i] > game.lib[target])
      )
        target = i;
    if (target !== null && bszHand) {
      removeIfPresent(game.hand, bszHand);
      game.library.push(bszHand);
      game.shuffle();
      game.millOut(target);
      game.say(`endless mana: Blue Sun's Zenith mills opponent ${target + 1}`);
    }
    return game.oppsBeaten();
  }
  return false;
}

/** Cast Blue Sun's Zenith with this X (at an opponent: they draw / mill X). */
export function castZenithWithX(
  game: AesiGame,
  card: CardDef,
  xValue: number,
): boolean {
  if (game.epic || !game.pay(card.cost.withGeneric(xValue), true)) return false;
  removeIfPresent(game.hand, card);
  game.spellsCast += 1;
  game.library.push(card);
  game.shuffle();
  game.say(`cast Blue Sun's Zenith (X=${xValue})`);
  return true;
}

/** Loops with a way to replay lands: every land in hand goes onto the battlefield (untapped). */
export function dumpLandsFromHand(game: AesiGame): boolean {
  const lands = game
    .landsInHand()
    .filter((card) => card.land!.special !== 'chamber');
  if (!lands.length) return false;
  let landCount = 0;
  for (const otherCard of lands) {
    removeIfPresent(game.hand, otherCard);
    if (otherCard.land!.special === 'wilds') {
      game.gy.push(otherCard);
      const anotherCard = game.library.find((card) => card.land?.basic);
      if (anotherCard && game.library.length > game.libraryCardsToKeep()) {
        removeIfPresent(game.library, anotherCard);
        const permanent = new Perm(anotherCard, anotherCard.land, true);
        permanent.sick = false;
        game.bf.push(permanent);
      }
    } else {
      const otherPermanent = new Perm(
        otherCard,
        otherCard.land,
        otherCard.land!.etb === 'tapped',
      );
      otherPermanent.sick = false;
      game.bf.push(otherPermanent);
    }
    landCount++;
  }
  for (const anotherPermanent of game.bf)
    if (anotherPermanent.cd.name === KHALNI)
      anotherPermanent.counters += landCount;
  game.say(`LOOP: ${landCount} land(s) from hand onto the battlefield`);
  return true;
}

// (the trace names a loop once a turn)
export function canPayKeepingReserve(game: AesiGame, cost: Cost): boolean {
  if (game.infMana || game.loopReserve === 0) return game.canPay(cost);
  return game.availMana() - cost.mv >= game.loopReserve && game.canPay(cost);
}

export function castForLoops(game: AesiGame): boolean {
  if (game.epic) return false;
  if (game.command.length) {
    const card = game.command[0];
    if (
      canPayKeepingReserve(
        game,
        game.commanderCost(card, game.effCost(card)),
      ) &&
      game.castPerm(card, true)
    )
      return true;
  }
  for (const name of LOOP_CAST) {
    const otherCard = game.hand.find((card) => card.name === name);
    if (!otherCard) continue;
    if (name === 'Graceful Adept' && game.hand.length <= 8) continue;
    if (name === OMNI && !game.canPay(game.effCost(otherCard))) continue;
    if (game.onBf(name) && otherCard.types.has('legendary')) continue;
    if (
      canPayKeepingReserve(game, game.effCost(otherCard)) &&
      game.castPerm(otherCard)
    )
      return true;
  }
  // with Omniscience everything else is free too (permanents only; spells could end the loops' value)
  if (game.onBf(OMNI)) {
    // (not the Onnas: they are the draw loop, cast and returned over and over)
    const anotherCard = game.hand.find(
      (card) =>
        card.land === null &&
        !card.isIS &&
        !HOLD.has(card.name) &&
        card.name !== KIRI &&
        card.name !== HARU &&
        !(card.types.has('legendary') && game.onBf(card.name)),
    );
    if (anotherCard && game.castPerm(anotherCard)) return true;
  }
  return false;
}

/** Wins that land on the next turn: endless Illusions (summoning sick now), Uyo copying an epic spell. */
export function setUpNextTurnWin(game: AesiGame, loops: Loops): void {
  if (game.oppsBeaten()) return;
  const hasArmy = game.bf.some(
    (permanent) =>
      permanent.cd === TOK.illusionArmy || permanent.cd === TOK.snakeArmy,
  );
  if (hasArmy || game.dominionCopies >= (game.cfg.dominion_win as number))
    return;
  if (loops.tokens) {
    game.enter(TOK.illusionArmy, 'token', { token: true });
    game.loopWinHow = 'endless Illusions (attack next turn)';
    game.say('LOOP: endless Meloku Illusions (they attack next turn)');
    return;
  }
  if (loops.copy) {
    const card = uyoTarget(game, game.availMana() - 1);
    if (
      card &&
      (card.name === SWARM || card.name === DOMINION) &&
      game.castIS(card)
    ) {
      if (card.name === SWARM) {
        game.enter(TOK.snakeArmy, 'token', { token: true });
        game.swarmCopies = 99;
        game.loopWinHow = 'Uyo copies Endless Swarm (attack next turn)';
      } else {
        game.dominionCopies = 99;
        game.loopWinHow = 'Uyo copies Eternal Dominion (win next upkeep)';
      }
      game.say(`LOOP: Uyo copies ${card.name} over and over`);
    }
  }
}
