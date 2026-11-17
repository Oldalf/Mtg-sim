/**
 * Kill lines are played, not declared. When a deck's kill search finds a line, the game plays it on a copy of
 * itself, step by step, the way the real game plays: every cost is paid with pay(), every card moves. The deck
 * plays each step (GameCore.playKillStep). The copy becomes the game only when the line really wins.
 *
 * A line that fails is not a win: the game logs where it failed and counts it, as a kill miss (the search
 * counted something the real game cannot do: a bug to look at) or a chance fail (a line that only wins on
 * average, and the real cards fell short).
 */
import type { GameCore } from './game-core';
import { KILL_STEP_NEXT_TURN, KillStep, describeKillStep } from './game-types';
import { formatList, formatPool } from './log-format';

/** A run of the same step (a loop: Konrad's mill, a Guildmage activation) is logged for this many rounds, then summed up. */
const ROUNDS_SHOWN = 3;
/** After the deck's own tapping orders, a failed line is tried with this many orders that shuffle the sources'
 *  ranks a little (killLineRankChange in mana-payment.ts): a payment puzzle (tap the dual land now so an untap gets
 *  it back) that no fixed rule finds. */
const SHUFFLED_TAPPING_ORDERS = 12;

/** Plays the line on a copy of the game. Returns the copy if the line wins, or null if it fails (then the miss is
 *  logged on the game and counted). `isChanceLine`: the search said the line only wins on average.
 *  The order lands and rocks are tapped in matters, so a line that fails is played again with each other tapping
 *  order the deck has (killLineTappingOrders); the first that wins is kept. */
export function playKillLineOnCopy<G extends GameCore<unknown>>(
  game: G,
  line: KillStep[],
  isChanceLine: boolean,
): G | null {
  let firstTry: { copy: G; failure: KillLineFailure } | null = null;
  const orderCount = game.killLineTappingOrders() + SHUFFLED_TAPPING_ORDERS;
  for (let order = 0; order < orderCount; order++) {
    const copy = game.clone();
    // this copy becomes the game if the line wins, so its moves are recorded
    copy.moveRecorder =
      game.moveRecorder?.copy(game.battlefield, copy.battlefield) ?? null;
    copy.say('--- the kill line, played:');
    copy.isPlayingKillLine = true;
    copy.killLineTappingOrder = order;
    copy.cardsTheKillLineNeeds = new Set(namesInLine(line));
    const failure = playSteps(copy, line);
    copy.isPlayingKillLine = false;
    copy.killLineTappingOrder = 0;
    copy.cardsTheKillLineNeeds = new Set();
    if (failure === null) return copy;
    firstTry ??= { copy, failure };
  }
  const { copy, failure } = firstTry!;
  // the copy is thrown away: its lines are kept as text, to show how far the line got
  for (const event of copy.log.slice(game.log.length))
    game.say(`  (tried) ${event.text}`);
  if (failure.stepNumber === null && isChanceLine) {
    game.killChanceFails++;
    game.sayHighlight(
      `kill line played, but the opponents are not beaten: it only wins on average and the real cards fell short`,
    );
  } else {
    game.killMisses++;
    game.sayHighlight(
      failure.stepNumber === null
        ? 'KILL MISS: the kill line was played, but the opponents are not beaten'
        : `KILL MISS: the kill line failed at step ${failure.stepNumber} (${line[failure.stepNumber - 1].text}): ${failure.reason}`,
    );
  }
  return null;
}

/** Why a played line is not a win: the step that could not be played (null = every step played, the end short). */
interface KillLineFailure {
  stepNumber: number | null;
  reason: string;
}

/** Plays every step. Returns null if the line won (or the rest of it wins next turn). */
function playSteps(
  copy: GameCore<unknown>,
  line: KillStep[],
): KillLineFailure | null {
  for (let index = 0; index < line.length; index++) {
    const step = line[index];
    if (step.kind === KILL_STEP_NEXT_TURN) {
      copy.say(`(the rest of the line is played next turn: ${step.text})`);
      return null;
    }
    const round = roundOfStep(line, index);
    const isQuiet = round > ROUNDS_SHOWN;
    const wasVerbose = copy.verbose;
    if (isQuiet) copy.verbose = false;
    const reason = copy.playKillStep(step);
    copy.verbose = wasVerbose;
    if (reason !== null)
      return {
        stepNumber: index + 1,
        reason: `${reason} (${describeMana(copy)})`,
      };
    const isLastOfRun = !isSameStep(line[index + 1], step);
    if (isQuiet && isLastOfRun)
      copy.say(`... ${step.text}: repeats ${round - ROUNDS_SHOWN} more times`);
  }
  return copy.areOpponentsBeaten()
    ? null
    : { stepNumber: null, reason: 'opponents not beaten' };
}

/** The mana a game has left: its pool and its untapped sources (for a miss's log line). */
function describeMana(game: GameCore<unknown>): string {
  const pool = Object.entries(game.pool)
    .filter(([, amount]) => amount > 0)
    .map(([colour, amount]) => `${amount}${colour}`)
    .join(' ');
  const sources = game.battlefield
    .filter(
      (permanent) =>
        !permanent.tapped && game.manaSourceKind(permanent) !== null,
    )
    .map((permanent) => permanent.card.name);
  return `pool ${pool || 'empty'}; untapped: ${sources.join(', ') || 'none'}`;
}

/** The cards a line names (a deck's steps may name more in fields of their own: every string field counts). */
function namesInLine(line: KillStep[]): string[] {
  const names: string[] = [];
  for (const step of line)
    for (const value of Object.values(step)) {
      if (typeof value === 'string') names.push(value);
      else if (Array.isArray(value))
        for (const item of value)
          if (typeof item === 'string') names.push(item);
    }
  return names;
}

/** Which round of a run of the same step this one is (1 = the first). */
function roundOfStep(line: KillStep[], index: number): number {
  let round = 1;
  while (index - round >= 0 && isSameStep(line[index - round], line[index]))
    round++;
  return round;
}

function isSameStep(first: KillStep | undefined, second: KillStep): boolean {
  return (
    first !== undefined &&
    first.kind === second.kind &&
    first.text === second.text
  );
}

/** Looks for a kill at this step of the turn (see GameCore.checkKill). Returns 2 when we win now (or already won),
 *  1 when a kill was found that we don't take (no counter backup, or the pod's policy says wait), 0 when none. */
export function checkForKill(game: GameCore): number {
  if (
    game.protectedKillTurn !== null ||
    (game.mode === 'any' && game.unprotectedKillTurn !== null)
  )
    return 2;
  const killState = game.buildKillSearchState();
  const stateKey = game.killSearchStateKey(killState);
  if (stateKey === game.lastKey) return 0;
  game.lastKey = stateKey;
  if (!game.killReachable(killState)) return 0;
  const search = game.killSearch();
  let killLevel = search.search(killState, game.config.search_budget as number);
  const isNewKill = game.unprotectedKillTurn === null || killLevel === 2;
  if (killLevel >= 1 && game.verbose && isNewKill) {
    game.say(
      `--- state: mana ${formatPool(game.killSearchStatePool(game.buildKillSearchState()))}, hand ${formatList(game.hand.map((card) => card.name))}`,
    );
    game.say(
      `--- battlefield ${formatList(game.battlefield.filter((permanent) => permanent.land === null).map((permanent) => permanent.name))}, ` +
        `lands ${game.landsOnBattlefield().length}, graveyard ${formatList(game.graveyard.map((card) => card.name))}`,
    );
    for (const step of search.lastLine ?? [])
      game.say('      > ' + describeKillStep(step));
  }
  game.killLineCopy = null;
  if (killLevel >= 1 && isNewKill && game.playsKillLines() && !game.inRollout) {
    // the line is played for real on a copy; it only counts if it wins there
    game.killLineLogLength = game.log.length;
    game.killLineCopy = playKillLineOnCopy(
      game,
      search.lastLine ?? [],
      search.lastLineProbability !== null,
    );
    if (game.killLineCopy === null) killLevel = 0;
  }
  if (killLevel >= 1)
    game.lastKillLine = (search.lastLine ?? []).map(describeKillStep);
  if (killLevel >= 1 && game.unprotectedKillTurn === null)
    game.unprotectedKillTurn = game.turn;
  if (killLevel === 2) game.protectedKillTurn = game.turn;
  game.killNow = killLevel >= 1;
  if (
    killLevel === 2 ||
    (killLevel === 1 && game.mode === 'any' && game.podAllowsKill())
  ) {
    // with a played line, the win is logged after its plays (on the copy that becomes the game)
    (game.killLineCopy ?? game).sayEvent(
      'win',
      'KILL -> WIN' +
        (killLevel === 2 ? ' (with counter backup)' : ' (no counter backup)'),
    );
    return 2;
  }
  game.killLineCopy = null;
  if (killLevel === 1) {
    game.podWaits++;
    game.sayHighlight(
      'kill available but no counter backup: keep the kill intact and look for protection',
    );
  }
  return killLevel;
}
