/**
 * --rank in the pod: how much the first deck's pod win rate changes when it had seen a card by the end of its fourth
 * turn. Like the goldfish --rank (engine/tools/ranking.ts) it shows correlation, not proof: test a card with a swap.
 * The counts of a run can be saved (--rank-save) and put together with another run's (--rank-merge), for the same
 * deck with two lists.
 */
import * as fs from 'fs';
import { PodGame } from '../../shared/pod-types';

/** Games with and without a card seen by turn 4, and the first deck's wins in each. */
export interface CardCounts {
  card: string;
  seenGames: number;
  seenWins: number;
  unseenGames: number;
  unseenWins: number;
  /** In how many of the merged lists the card is (1 for a single run). */
  lists: number;
}

/** A card needs this many games with it and without it to be judged. */
const MINIMUM_GAMES = 100;

export function countCardsSeen(
  games: PodGame[],
  cardsOfTheList: string[],
): CardCounts[] {
  const played = games.filter((game) => game.firstDeckSeenByTurn4 != null);
  const cardNames = new Set(cardsOfTheList); // not the tokens
  const counts: CardCounts[] = [];
  for (const card of cardNames) {
    const count: CardCounts = {
      card,
      seenGames: 0,
      seenWins: 0,
      unseenGames: 0,
      unseenWins: 0,
      lists: 1,
    };
    for (const game of played) {
      const hasSeen = game.firstDeckSeenByTurn4!.includes(card);
      const isWin = game.winner === 0 ? 1 : 0;
      if (hasSeen) {
        count.seenGames++;
        count.seenWins += isWin;
      } else {
        count.unseenGames++;
        count.unseenWins += isWin;
      }
    }
    counts.push(count);
  }
  return counts;
}

/** The counts of several runs added up, card by card (a card in only one of them counts as it is). */
export function mergeCounts(runs: CardCounts[][]): CardCounts[] {
  const merged = new Map<string, CardCounts>();
  for (const run of runs)
    for (const count of run) {
      const total = merged.get(count.card);
      if (!total) merged.set(count.card, { ...count });
      else {
        total.seenGames += count.seenGames;
        total.seenWins += count.seenWins;
        total.unseenGames += count.unseenGames;
        total.unseenWins += count.unseenWins;
        total.lists += count.lists;
      }
    }
  return [...merged.values()];
}

export const writeCounts = (file: string, counts: CardCounts[]): void =>
  fs.writeFileSync(file, JSON.stringify(counts), 'utf-8');
export const readCounts = (file: string): CardCounts[] =>
  JSON.parse(fs.readFileSync(file, 'utf-8')) as CardCounts[];

const percent = (part: number, whole: number) => (100 * part) / whole;
const signed = (x: number) => (x >= 0 ? '+' : '') + x.toFixed(1);

export function printRanking(title: string, counts: CardCounts[]): void {
  const rows = counts
    .filter(
      (count) =>
        count.seenGames >= MINIMUM_GAMES && count.unseenGames >= MINIMUM_GAMES,
    )
    .map((count) => ({
      ...count,
      winWith: percent(count.seenWins, count.seenGames),
      winWithout: percent(count.unseenWins, count.unseenGames),
      seenShare: percent(count.seenGames, count.seenGames + count.unseenGames),
    }))
    .sort(
      (first, second) =>
        second.winWith - second.winWithout - (first.winWith - first.winWithout),
    );
  const games = counts.length ? counts[0].seenGames + counts[0].unseenGames : 0;
  console.log(`\nPod ranking: ${title}, ${games} games`);
  console.log(
    "'Better' = the pod win rate of the first deck with the card seen by the end of its turn 4, minus without. Noise: about +/-1.5 points per card",
  );
  console.log(
    '(about +/-1 with 16,000 games). Correlation, not proof: a good card is also one you draw in good games.\n',
  );
  console.log(
    `  ${'card'.padEnd(38)} ${'better'.padStart(7)} ${'win with'.padStart(9)} ${'without'.padStart(8)} ${'seen in'.padStart(8)}`,
  );
  for (const row of rows)
    console.log(
      `  ${(row.card + (row.lists === 1 && counts.some((count) => count.lists > 1) ? ' (one list)' : '')).padEnd(38)} ` +
        `${(signed(row.winWith - row.winWithout) + '%').padStart(7)} ` +
        `${row.winWith.toFixed(1).padStart(8)}% ${row.winWithout.toFixed(1).padStart(7)}% ` +
        `${row.seenShare.toFixed(0).padStart(7)}%`,
    );
}
