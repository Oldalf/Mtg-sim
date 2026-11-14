/**
 * The worker loop that goldfish runs (runner.ts) and pod runs (pod.ts) share: hand out jobs of seeds to worker
 * threads, collect what comes back, report progress, and stop early when asked.
 *
 * The same bundle (dist/sim.js) runs as each worker; sim.ts sends the jobs it gets to runJob or runPodJob. Which seeds
 * a job holds never depends on the worker count or on stopping, so the results of a full run don't either.
 */
import { Worker } from 'worker_threads';

/** What the caller of a run can do while it plays. */
export interface RunControl {
  /** Called each time a job comes back. */
  onProgress?: (gamesPlayed: number, gamesTotal: number) => void;
  /** Abort it to stop the run: no new jobs are handed out and the workers are ended at once. */
  stopSignal?: AbortSignal;
}

/** The results of the jobs that came back, in job order, and whether the run was stopped before the end. */
export interface FinishedJobs<JobResult> {
  results: JobResult[];
  wasStopped: boolean;
}

/** Seeds 1..gameCount cut into jobs: about eight per worker, so a slow job doesn't hold up the end of a run. */
export function splitSeedsIntoJobs(
  gameCount: number,
  workers: number,
): number[][] {
  const seeds = Array.from({ length: gameCount }, (_, i) => i + 1);
  const chunkSize = Math.max(1, Math.floor(gameCount / (workers * 8)));
  const seedsOfJobs: number[][] = [];
  for (let start = 0; start < gameCount; start += chunkSize)
    seedsOfJobs.push(seeds.slice(start, start + chunkSize));
  return seedsOfJobs;
}

/** Plays the jobs in worker threads. busyPercent below 100 makes each worker rest after a job (power-save mode). */
export async function runJobsInWorkers<
  Job extends { seeds: number[] },
  JobResult,
>(
  jobs: Job[],
  workers: number,
  busyPercent: number,
  control: RunControl = {},
): Promise<FinishedJobs<JobResult>> {
  const resultOfJob: (JobResult | undefined)[] = new Array(jobs.length);
  const gamesTotal = jobs.reduce((sum, job) => sum + job.seeds.length, 0);
  let gamesPlayed = 0;
  let nextJob = 0;
  const isStopped = () => control.stopSignal?.aborted === true;

  const pool = Array.from(
    { length: Math.min(workers, jobs.length) },
    () => new Worker(__filename, { workerData: 'sim-worker' }),
  );
  // a stop ends the workers in the middle of their jobs; those jobs' games are dropped
  const endAllWorkers = () => pool.forEach((worker) => worker.terminate());
  control.stopSignal?.addEventListener('abort', endAllWorkers);

  try {
    await Promise.all(
      pool.map(
        (worker) =>
          new Promise<void>((resolve, reject) => {
            const giveNextJob = () => {
              if (nextJob >= jobs.length || isStopped()) {
                worker.terminate();
                return;
              }
              const jobIndex = nextJob++;
              const startTime = Date.now();
              worker.once('message', (result: JobResult) => {
                resultOfJob[jobIndex] = result;
                gamesPlayed += jobs[jobIndex].seeds.length;
                control.onProgress?.(gamesPlayed, gamesTotal);
                const restMilliseconds =
                  busyPercent < 100
                    ? (Date.now() - startTime) * (100 / busyPercent - 1)
                    : 0;
                if (restMilliseconds > 1)
                  setTimeout(giveNextJob, restMilliseconds);
                else giveNextJob();
              });
              worker.postMessage(jobs[jobIndex]);
            };
            worker.on('error', reject);
            worker.on('exit', () => resolve());
            giveNextJob();
          }),
      ),
    );
  } finally {
    control.stopSignal?.removeEventListener('abort', endAllWorkers);
  }
  const results = resultOfJob.filter(
    (result): result is JobResult => result !== undefined,
  );
  return { results, wasStopped: results.length < jobs.length };
}
