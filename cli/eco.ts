/** Power-save mode (--eco): the simulation runs in the background without loading the machine. */
import * as os from 'os';
import { cpuCores } from '../engine/runner';
import { Args } from './args';

/** Share of the time the workers are busy in eco mode unless --duty says otherwise. */
const DEFAULT_DUTY_PERCENT = 70;

/** A quarter of the cores (at least 1) unless -w is given, below-normal priority, and the workers rest between chunks. */
export function enableEcoMode(args: Args): {
  workers: number;
  dutyPercent: number;
} {
  const workers = args.workersGiven
    ? args.workers
    : Math.max(1, Math.floor(cpuCores() / 4));
  const dutyPercent = args.dutyPercent ?? DEFAULT_DUTY_PERCENT;
  try {
    os.setPriority(os.constants.priority.PRIORITY_BELOW_NORMAL);
  } catch {
    /* not allowed here: the other limits still apply */
  }
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
