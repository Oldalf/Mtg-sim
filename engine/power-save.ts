/**
 * Power-save mode: a run in the background that leaves the machine usable. The command line's --eco (cli/eco.ts) and
 * the app's powerSave runs use the same numbers.
 */
import * as os from 'os';
import { cpuCores } from './runner';

/** Share of the time the workers are busy in power-save mode (unless --duty says otherwise). */
export const POWER_SAVE_BUSY_PERCENT = 70;

/** A quarter of the cores, at least 1. */
export function powerSaveWorkers(): number {
  return Math.max(1, Math.floor(cpuCores() / 4));
}

/** Below-normal priority for this process and its worker threads in power-save mode, normal otherwise. */
export function setLowPriority(isLow: boolean): void {
  try {
    os.setPriority(
      isLow
        ? os.constants.priority.PRIORITY_BELOW_NORMAL
        : os.constants.priority.PRIORITY_NORMAL,
    );
  } catch {
    /* not allowed here: the other limits still apply */
  }
}
