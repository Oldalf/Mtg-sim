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
import { KILL_STEP_NEXT_TURN, KillStep } from './game-types';

/** A run of the same step (a loop: Konrad's mill, a Guildmage activation) is logged for this many rounds, then summed up. */
const ROUNDS_SHOWN = 3;

/** Plays the line on a copy of the game. Returns the copy if the line wins, or null if it fails (then the miss is
 *  logged on the game and counted). `isChanceLine`: the search said the line only wins on average. */
export function playKillLineOnCopy<G extends GameCore<unknown>>(
  game: G,
  line: KillStep[],
  isChanceLine: boolean,
): G | null {
  const copy = game.clone();
  // this copy becomes the game if the line wins, so its moves are recorded
  copy.moveRecorder =
    game.moveRecorder?.copy(game.battlefield, copy.battlefield) ?? null;
  copy.say('--- the kill line, played:');
  copy.isPlayingKillLine = true;
  copy.cardsTheKillLineNeeds = new Set(namesInLine(line));
  const failure = playSteps(copy, line);
  copy.isPlayingKillLine = false;
  copy.cardsTheKillLineNeeds = new Set();
  if (failure === null) return copy;
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
    if (reason !== null) return { stepNumber: index + 1, reason };
    const isLastOfRun = !isSameStep(line[index + 1], step);
    if (isQuiet && isLastOfRun)
      copy.say(`... ${step.text}: repeats ${round - ROUNDS_SHOWN} more times`);
  }
  return copy.areOpponentsBeaten()
    ? null
    : { stepNumber: null, reason: 'opponents not beaten' };
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
