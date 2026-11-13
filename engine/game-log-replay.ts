/**
 * Plays a game of a logged run again. A game is fully decided by its seed, its lists and its settings, all of
 * which are in the run's run.json, so the replay gives the same log as the first time.
 */
import * as path from 'path';
import * as C from './cards';
import { GameLog, goldfishGameLog } from './game-log';
import { RunInfo, hashOfFile, readRunInfo } from './game-log-files';
import { playPod } from './pod';
import { Rng } from './rng';
import { Deck } from './runner';

/** Stops if a list was edited after the run: the replay would be a different game. */
function checkListsUnchanged(runInfo: RunInfo, listFiles: string[]): void {
  listFiles.forEach((file, index) => {
    if (hashOfFile(file) !== runInfo.listHashes[index])
      throw new Error(
        `${runInfo.lists[index]} changed since the run ${runInfo.name} was played, so its games can't be played again. ` +
          'Run the simulation again to get logs of the list as it is now.',
      );
  });
}

/** Plays the game with that seed again, with the log on. */
export function replayGame(
  allDecks: Record<string, Deck>,
  runFolder: string,
  seed: number,
): GameLog {
  const runInfo = readRunInfo(runFolder);
  const listFiles = runInfo.lists.map((list) => path.join(C.ROOT, list));
  checkListsUnchanged(runInfo, listFiles);

  if (runInfo.mode === 'pod')
    return playPod(allDecks, { ...runInfo.pod!, lists: listFiles }, seed, true)
      .log!;

  const deck = allDecks[runInfo.decks[0]];
  const decklist = C.loadDecklist(listFiles[0]);
  const game = new deck.Game(
    decklist.commanders,
    decklist.library,
    new Rng(seed),
    runInfo.config!,
    true,
    runInfo.gameMode,
  );
  game.play();
  return goldfishGameLog(
    seed,
    deck.name,
    decklist.commanders,
    decklist.library.length,
    game.log,
  );
}
