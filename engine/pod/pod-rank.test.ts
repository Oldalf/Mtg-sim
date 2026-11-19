/** Checks of the pod card ranking (pod-rank.ts). Run: npm run pod -- --test */
import { PodGame } from '../../shared/pod-types';
import { countCardsSeen, mergeCounts } from './pod-rank';

const game = (winner: number | null, seen: string[] | null): PodGame =>
  ({ winner, firstDeckSeenByTurn4: seen }) as PodGame;

export function runPodRankTests(): boolean {
  const games = [
    game(0, ['Sol Ring', 'Forest']),
    game(1, ['Sol Ring']),
    game(0, ['Forest']),
    game(null, null), // ended before turn 4: not counted
  ];
  const counts = countCardsSeen(games, ['Sol Ring', 'Forest']);
  const solRing = counts.find((count) => count.card === 'Sol Ring')!;
  const merged = mergeCounts([counts, counts]).find(
    (count) => count.card === 'Sol Ring',
  )!;
  const actual = JSON.stringify([
    [
      solRing.seenGames,
      solRing.seenWins,
      solRing.unseenGames,
      solRing.unseenWins,
    ],
    [merged.seenGames, merged.seenWins, merged.lists],
  ]);
  const expected = JSON.stringify([
    [2, 1, 1, 1],
    [4, 2, 2],
  ]);
  const isGood = actual === expected;
  console.log(
    `${isGood ? 'OK ' : 'BAD'} pod ranking counts: got ${actual}, expected ${expected}`,
  );
  return isGood;
}
