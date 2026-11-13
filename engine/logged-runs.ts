/**
 * The run folder of a goldfish or a pod run (game-log-files.ts): its name and its run.json. The command line
 * (cli/log-session.ts) and the app's server (app/server/runs.ts) both start runs with these, so their folders match.
 */
import * as path from 'path';
import { Config } from './game-types';
import { createRunFolder } from './game-log-files';
import { PodSpec } from './pod-types';
import { Deck, killTurnNamesOf } from './runner';

/** What a goldfish run measures: the kill-turn table, or the deck's own --diag measures. */
export type GoldfishMeasure = 'kills' | 'diag';

/** Makes the folder of a goldfish run of one list, e.g. "01-meren-decklist" (labelSuffix: "-default", "-changed"). */
export function createGoldfishRunFolder(
  deck: Deck,
  listFile: string,
  gameCount: number,
  config: Config,
  measure: GoldfishMeasure,
  labelSuffix = '',
): string {
  const listName = path.basename(listFile, path.extname(listFile));
  return createRunFolder(
    `${deck.name}-${listName}${labelSuffix}`,
    {
      mode: 'goldfish',
      gameCount,
      decks: [deck.name],
      config,
      gameMode: measure === 'kills' ? 'protected' : 'any',
      killTurnNames: killTurnNamesOf(deck),
    },
    [listFile],
  );
}

/** Makes the folder of a pod run, e.g. "01-pod-gale-meren-samfrodo-aesi". */
export function createPodRunFolder(spec: PodSpec, gameCount: number): string {
  return createRunFolder(
    `pod-${spec.decks.join('-')}`,
    { mode: 'pod', gameCount, decks: spec.decks, pod: spec },
    spec.lists,
  );
}
