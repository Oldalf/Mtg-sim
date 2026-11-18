/**
 * Choosing what to do: the deck's candidates in order (plus the rituals that help, and a mana rock moved first when
 * it still leaves enough for the best play), develop (do the best thing we can pay for, again and again, checking for
 * a kill before each), and the turn planner: it tries the best few options on copies of the game, finishes the turn
 * and plays the next one greedily, and keeps the option whose copy ends best (the deck's positionValue).
 * GameCore's ritualCandidates, orderedCandidates, plan and develop call these.
 */
import { Rng } from '../util/rng';
import type { GameCore } from './game-core';
import { Candidate, Permanent } from './game-types';
import { playOpponentsEndStep } from './instant-speed';

/** Use a ritual only if it lets us cast something good we otherwise can't (see GameCore.ritualCandidates). */
export function ritualCandidatesThatHelp(
  game: GameCore,
  candidates: Candidate[],
): Candidate[] {
  const out: Candidate[] = [];
  const bestAffordable = () =>
    Math.max(
      0,
      ...candidates
        .filter((candidate) =>
          game.canPay(candidate.cost, candidate.isInstantOrSorcery),
        )
        .map((candidate) => candidate.score),
    );
  let affordableBest: number | null = null; // (worked out only if there is a ritual in hand)
  for (const card of game.hand) {
    const cardName = card.name;
    if (
      cardName !== 'Dark Ritual' &&
      cardName !== 'High Tide' &&
      cardName !== 'Cabal Ritual' &&
      cardName !== 'Drain Power' &&
      cardName !== 'Energy Tap'
    )
      continue;
    if (affordableBest === null) affordableBest = bestAffordable();
    const snapshot = game.takeSnapshot();
    if (!game.pay(game.effectiveCost(card), true)) {
      game.restore(snapshot);
      continue;
    }
    if (cardName === 'Dark Ritual') game.pool.B += 3;
    else if (cardName === 'High Tide') game.highTidesThisTurn += 1;
    else if (cardName === 'Cabal Ritual') game.pool.B += game.cabalMana();
    else if (cardName === 'Drain Power') game.pool.C += game.drainPowerMana();
    else game.pool.C += game.energyTapTarget()?.card.manaValue ?? 0;
    const gain = bestAffordable();
    if (cardName === 'High Tide') game.highTidesThisTurn -= 1;
    game.restore(snapshot);
    if (gain >= 60 && gain > affordableBest!)
      out.push({
        score: gain - 1,
        cost: game.effectiveCost(card),
        isInstantOrSorcery: true,
        action: () => game.castRitual(card),
      });
  }
  return out;
}

/** If casting a mana rock first still leaves enough (with the rock's own mana) for the best play,
 *  move the rock to the front: e.g. Waterskin, tap it, then Scion with the rest. */
export function moveRockFirst(game: GameCore, candidates: Candidate[]): void {
  const top = candidates.find(
    (candidate) =>
      candidate.score > 0 &&
      game.canPay(candidate.cost, candidate.isInstantOrSorcery),
  );
  if (!top) return;
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    if (candidate.score < 50 || !candidate.rock || candidate === top) continue;
    const snapshot = game.takeSnapshot();
    let topSpellPayable = false;
    game.withoutExpendableMana(() => {
      if (game.pay(candidate.cost, false)) {
        const permanent = new Permanent(candidate.rock!);
        game.battlefield.push(permanent);
        topSpellPayable = game.canPay(top.cost, top.isInstantOrSorcery);
        game.battlefield.pop();
      }
    });
    game.restore(snapshot);
    if (topSpellPayable) {
      candidates.splice(i, 1);
      candidates.unshift(candidate);
      return;
    }
  }
}

/** Try each option on a copy of the game (library re-shuffled, so no peeking at draws), finish the
 *  turn greedily, and score where it ends up. Returns the best index. */
export function planBestOption(
  game: GameCore,
  options: number[],
  main2: boolean,
): number {
  let best = options[0];
  let bestValue: number | null = null;
  const rolloutCount = (game.config.planner_rollouts as number) ?? 2;
  for (const index of options) {
    let totalValue: number | null = 0;
    for (let rolloutIndex = 0; rolloutIndex < rolloutCount; rolloutIndex++) {
      const rolloutCopy = game.clone();
      rolloutCopy.verbose = false;
      rolloutCopy.inRollout = true;
      rolloutCopy.mode = 'any';
      rolloutCopy.killNow = false;
      rolloutCopy.config = {
        ...game.config,
        search_budget: (game.config.planner_budget as number) ?? 600,
      };
      rolloutCopy.rng = new Rng(Math.floor(game.rng.random() * 4294967296));
      rolloutCopy.rng.shuffle(rolloutCopy.library);
      if (rolloutCopy.orderedCandidates(main2)[index].action() === false) {
        totalValue = null;
        break;
      }
      totalValue += rolloutValue(rolloutCopy, main2);
    }
    if (totalValue === null) continue;
    if (bestValue === null || totalValue > bestValue) {
      best = index;
      bestValue = totalValue;
    }
  }
  return best;
}

/** Finish this turn greedily, then play the next turn greedily (with random draws). Rollouts always
 *  play in "any" mode and score kills the same way in both modes, so the "any" and "protected"
 *  games make identical choices until the first kill appears (that's what lets the runner get both
 *  results from one game). */
function rolloutValue(game: GameCore, main2: boolean): number {
  const killScore = (): number | null => {
    if (game.protectedKillTurn !== null) return 10000;
    if (game.unprotectedKillTurn !== null) return 9000;
    if (game.areOpponentsBeaten()) return 10000; // e.g. Mindskinner combat kill
    return null;
  };
  let won = game.develop(main2);
  if (!won && !main2) {
    game.enterStep('combat');
    game.combat();
    if (!game.areOpponentsBeaten()) {
      game.enterStep('main2');
      game.develop(true);
    }
  }
  let killResult = killScore();
  if (killResult !== null) return killResult;
  game.enterStep('end');
  game.endTurn();
  if (!game.inArena()) playOpponentsEndStep(game);
  const valueAtTurnEnd = game.positionValue();
  if (game.turn >= (game.config.max_turn as number) + 1) return valueAtTurnEnd;
  game.startTurn();
  game.opponentUpkeep();
  game.enterStep('upkeep');
  game.upkeep();
  game.upkeepTriggersOfTheGame();
  game.enterStep('draw');
  game.draw(1);
  game.enterStep('main1');
  game.playLand();
  won = game.develop();
  if (!won) {
    game.enterStep('combat');
    game.combat();
    if (!game.areOpponentsBeaten()) {
      game.enterStep('main2');
      game.develop(true);
    }
  }
  killResult = killScore();
  if (killResult !== null) return killResult / 2 + 0.2 * valueAtTurnEnd;
  return valueAtTurnEnd + 0.3 * game.positionValue();
}

/** The plays worth comparing (planner_close): those whose score is within maxScoreGap of the best one. A clear
 *  favourite is played without rollouts, which saves most of the planner's time. 0 keeps them all. */
function closePlays(
  candidates: Candidate[],
  options: number[],
  maxScoreGap: number,
): number[] {
  if (maxScoreGap <= 0) return options;
  const bestScore = Math.max(...options.map((i) => candidates[i].score));
  return options.filter((i) => bestScore - candidates[i].score <= maxScoreGap);
}

/** Do the best thing we can pay for, again and again (see GameCore.develop). Returns true when the game is won. */
export function developTurn(game: GameCore, main2: boolean): boolean {
  for (let step = 0; step < 40; step++) {
    game.logCardMovesSoFar();
    if (game.checkKill() === 2) return true;
    const candidates = game.orderedCandidates(main2);
    const afford: number[] = [];
    const reserve = game.podReserve();
    candidates.forEach((candidate, i) => {
      if (
        candidate.score > 0 &&
        game.canPay(candidate.cost, candidate.isInstantOrSorcery) &&
        (reserve === 0 || game.openMana() - candidate.cost.manaValue >= reserve)
      )
        afford.push(i);
    });
    if (!afford.length) return false;
    if (game.mode === 'protected' && game.killNow) {
      let done = false;
      for (const index of afford) {
        // try the action on a copy; keep it only if the kill survives
        const rolloutCopy = game.clone();
        // this copy becomes the game if the kill survives, so its moves are recorded
        rolloutCopy.moveRecorder =
          game.moveRecorder?.copy(game.battlefield, rolloutCopy.battlefield) ??
          null;
        if (rolloutCopy.orderedCandidates(main2)[index].action() === false)
          continue;
        if (
          game
            .killSearch()
            .search(
              rolloutCopy.buildKillSearchState(),
              game.config.search_budget as number,
            ) === 0
        )
          continue;
        const log = game.log;
        Object.assign(game, rolloutCopy);
        game.log = [...log, ...rolloutCopy.log.slice(log.length)];
        done = true;
        break;
      }
      if (!done) return false;
      continue;
    }
    let order = afford;
    if (
      game.config.planner &&
      !game.inRollout &&
      afford.length > 1 &&
      game.turn >= 2
    ) {
      const options = closePlays(
        candidates,
        afford.slice(0, (game.config.planner_width as number) ?? 4),
        (game.config.planner_close as number) ?? 0,
      );
      const pick = options.length > 1 ? game.plan(options, main2) : options[0];
      order = [pick, ...afford.filter((i) => i !== pick)];
    }
    let done = false;
    for (const index of order) {
      if (candidates[index].action() !== false) {
        done = true;
        break;
      }
    }
    if (!done) return false;
  }
  return false;
}
