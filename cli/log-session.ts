/**
 * The game logs of one `sim` or `pod` command. Starting the first logged run clears session-logs/ (the logs of the
 * last command); a command that plays several lists keeps a run folder for each.
 */
import type { RunReport } from '../app/api-types';
import * as C from '../engine/cards/cards';
import {
  GameIndexRow,
  clearSessionLogs,
  writeRunReport,
} from '../engine/game-log/game-log-files';
import {
  LoggedRun,
  describeTaggedGames,
  finishLoggedRun,
} from '../engine/game-log/game-log-run';

export class LogSession {
  private readonly finishedRuns: LoggedRun[] = [];
  private hasStarted = false;

  constructor(private readonly isLogged: boolean) {}

  /** Makes the folder of a new run with createRunFolder (engine/game-log/logged-runs.ts). Returns undefined when the log is off. */
  startRun(createRunFolder: () => string): string | undefined {
    if (!this.isLogged) return undefined;
    if (!this.hasStarted) clearSessionLogs();
    this.hasStarted = true;
    return createRunFolder();
  }

  /** The games of a run are played: tag them and write the index. */
  finishRun(runFolder: string | undefined, rows: GameIndexRow[] = []): void {
    if (runFolder === undefined) return;
    this.finishedRuns.push(finishLoggedRun(runFolder, rows));
  }

  /** Saves the report next to the games of every run of this command (the page shows it). */
  saveReport(report: RunReport): void {
    for (const run of this.finishedRuns) writeRunReport(run.runFolder, report);
  }

  /** The list printed under the report: the tagged games of each run and where to read them. */
  printGamesWorthALook(): void {
    for (const run of this.finishedRuns)
      console.log('\n' + describeTaggedGames(run, C.ROOT).join('\n'));
  }
}
