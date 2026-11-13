/**
 * The game logs of one `sim` or `pod` command. Starting the first logged run clears session-logs/ (the logs of the
 * last command); a command that plays several lists keeps a run folder for each.
 */
import * as C from '../engine/cards';
import {
  GameIndexRow,
  RunInfo,
  clearSessionLogs,
  createRunFolder,
} from '../engine/game-log-files';
import {
  LoggedRun,
  describeTaggedGames,
  finishLoggedRun,
} from '../engine/game-log-run';

export class LogSession {
  private readonly finishedRuns: LoggedRun[] = [];
  private hasStarted = false;

  constructor(private readonly isLogged: boolean) {}

  /** Makes the folder of a new run. Returns undefined when the log is off. */
  startRun(
    label: string,
    run: Omit<RunInfo, 'name' | 'date' | 'lists' | 'listHashes'>,
    listFiles: string[],
  ): string | undefined {
    if (!this.isLogged) return undefined;
    if (!this.hasStarted) clearSessionLogs();
    this.hasStarted = true;
    return createRunFolder(label, run, listFiles);
  }

  /** The games of a run are played: tag them and write the index. */
  finishRun(runFolder: string | undefined, rows: GameIndexRow[] = []): void {
    if (runFolder === undefined) return;
    this.finishedRuns.push(finishLoggedRun(runFolder, rows));
  }

  /** The list printed under the report: the tagged games of each run and where to read them. */
  printGamesWorthALook(): void {
    for (const run of this.finishedRuns)
      console.log('\n' + describeTaggedGames(run, C.ROOT).join('\n'));
  }
}
