/** Power-save mode (--eco): the simulation runs in the background without loading the machine. */
import {
  POWER_SAVE_BUSY_PERCENT,
  powerSaveWorkers,
  setLowPriority,
} from '../engine/power-save';
import { cpuCores } from '../engine/runner';
import { Args } from './args';

/** A quarter of the cores (at least 1) unless -w is given, below-normal priority, and the workers rest between chunks. */
export function enableEcoMode(args: Args): {
  workers: number;
  dutyPercent: number;
} {
  const workers = args.workersGiven ? args.workers : powerSaveWorkers();
  const dutyPercent = args.dutyPercent ?? POWER_SAVE_BUSY_PERCENT;
  setLowPriority(true);
  console.log(
    `eco mode: ${workers} worker(s), below-normal priority, busy about ${dutyPercent}% of the time`,
  );
  return { workers, dutyPercent };
}

/** When the program ends, prints how many cores it kept busy on average. */
export function reportCpuUseAtExit(): void {
  const startTime = Date.now();
  const startUsage = process.cpuUsage();
  process.on('exit', () => {
    const usage = process.cpuUsage(startUsage);
    const seconds = (Date.now() - startTime) / 1000;
    console.log(
      `(eco: ${((usage.user + usage.system) / 1e6 / seconds).toFixed(1)} of ${cpuCores()} cores busy on average)`,
    );
  });
}
