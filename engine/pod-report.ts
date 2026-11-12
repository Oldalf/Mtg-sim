/** The report printed after a batch of pod games. */
import { PodGame, PodSpec } from './pod-types';

const sum = (numbers: number[]) =>
  numbers.reduce((total, value) => total + value, 0);

/** The report: win rate, win turns (average, 10th and 90th percentile), how the wins came, first out, win rate by seat. */
export function printPod(spec: PodSpec, games: PodGame[]): void {
  const playerCount = spec.decks.length;
  const total = games.length;
  /** A share as "  12.3%". With no games to divide by it prints "-". */
  const percent = (part: number, whole = total) =>
    (whole ? ((100 * part) / whole).toFixed(1) : '-').padStart(6) + '%';
  const labels = spec.decks.map(
    (deck, player) =>
      deck + (spec.decks.indexOf(deck) !== player ? `#${player + 1}` : ''),
  );
  const nameWidth = Math.max(10, ...labels.map((label) => label.length)) + 2;
  const report = {
    spec,
    games,
    playerCount,
    total,
    percent,
    labels,
    nameWidth,
  };

  console.log(
    `\n${total} pod games, ${playerCount} players, at most ${spec.cap} rounds. An even pod would give each deck ${(100 / playerCount).toFixed(0)}%.`,
  );
  console.log(
    `Noise: about +/-${(196 * Math.sqrt(0.25 / Math.max(1, total))).toFixed(0)} points on a win rate.\n`,
  );
  printWinTable(report);
  printWinsByRound(report);
  printGameLength(report);
  printInteraction(report);
  printHowDecksWentOut(report);
}

/** What the print functions below share. */
interface Report {
  spec: PodSpec;
  games: PodGame[];
  playerCount: number;
  total: number;
  percent: (part: number, whole?: number) => string;
  labels: string[];
  nameWidth: number;
}

function printWinTable(report: Report): void {
  const { games, playerCount, percent, labels, nameWidth } = report;
  console.log(
    'deck'.padEnd(nameWidth) +
      '   wins  avg turn  10%-90% turn  declared  standing  out first  ' +
      Array.from({ length: playerCount }, (_, seat) =>
        `seat ${seat + 1}`.padStart(8),
      ).join(''),
  );
  for (let player = 0; player < playerCount; player++) {
    const won = games.filter((game) => game.winner === player);
    const winTurns = won
      .map((game) => game.turn)
      .sort((first, second) => first - second);
    const turnAtPercentile = (fraction: number) =>
      winTurns.length
        ? String(
            winTurns[
              Math.min(
                winTurns.length - 1,
                Math.floor(fraction * winTurns.length),
              )
            ],
          )
        : '-';
    const averageTurn = winTurns.length
      ? (sum(winTurns) / winTurns.length).toFixed(2)
      : '-';
    const winRateBySeat = Array.from({ length: playerCount }, (_, seat) => {
      const gamesInSeat = games.filter((game) => game.seat[player] === seat);
      return percent(
        gamesInSeat.filter((game) => game.winner === player).length,
        gamesInSeat.length,
      ).padStart(8);
    }).join('');
    console.log(
      labels[player].padEnd(nameWidth) +
        percent(won.length) +
        averageTurn.padStart(10) +
        `${turnAtPercentile(0.1)}-${turnAtPercentile(0.9)}`.padStart(14) +
        percent(
          won.filter((game) => game.how === 'declared').length,
          won.length,
        ).padStart(10) +
        percent(
          won.filter((game) => game.how === 'last standing').length,
          won.length,
        ).padStart(10) +
        percent(games.filter((game) => game.out[0] === player).length).padStart(
          11,
        ) +
        '  ' +
        winRateBySeat,
    );
  }
}

function printWinsByRound(report: Report): void {
  const { spec, games, playerCount, percent, labels, nameWidth } = report;
  const rounds = [4, 5, 6, 7, 8, 9, 10, 11, 12, 14].filter(
    (round) => round <= spec.cap,
  );
  console.log('\nWon by the end of round (share of all games):');
  console.log(
    'deck'.padEnd(nameWidth) +
      rounds.map((round) => String(round).padStart(7)).join(''),
  );
  for (let player = 0; player < playerCount; player++)
    console.log(
      labels[player].padEnd(nameWidth) +
        rounds
          .map((round) =>
            percent(
              games.filter(
                (game) => game.winner === player && game.turn <= round,
              ).length,
            ),
          )
          .join(''),
    );
}

function printGameLength(report: Report): void {
  const { spec, games, percent } = report;
  const draws = games.filter((game) => game.winner === null).length;
  const lengthsOfDecidedGames = games
    .filter((game) => game.winner !== null)
    .map((game) => game.turn);
  const averageLength = lengthsOfDecidedGames.length
    ? (sum(lengthsOfDecidedGames) / lengthsOfDecidedGames.length).toFixed(2)
    : '-';
  console.log(
    `\nNo winner by round ${spec.cap}: ${percent(draws).trim()}. Average game length: ${averageLength} rounds.`,
  );
}

function printInteraction(report: Report): void {
  const { games, playerCount, total, percent, labels, nameWidth } = report;
  const hadInteraction = games.some(
    (game) => sum(game.tried) + sum(game.removals) + sum(game.countered) > 0,
  );
  if (!hadInteraction) return;
  console.log('\nInteraction, per game:');
  console.log(
    'deck'.padEnd(nameWidth) +
      '  win attempts   stopped  turns waited  spells countered  removal taken  shielded  answers used  removal / wipes cast',
  );
  for (let player = 0; player < playerCount; player++) {
    const attempts = sum(games.map((game) => game.tried[player]));
    const stopped = sum(games.map((game) => game.stopped[player]));
    /** The average per game of a count, as a column of the given width. */
    const perGame = (countOf: (game: PodGame) => number, width: number) =>
      (sum(games.map(countOf)) / total).toFixed(2).padStart(width);
    console.log(
      labels[player].padEnd(nameWidth) +
        (attempts / total).toFixed(2).padStart(14) +
        (attempts ? percent(stopped, attempts) : '      -').padStart(10) +
        perGame((game) => game.waited[player], 14) +
        perGame((game) => game.countered[player], 18) +
        perGame((game) => game.removed[player], 15) +
        perGame((game) => game.shields[player], 10) +
        perGame((game) => game.answers[player], 14) +
        perGame((game) => game.removals[player], 22),
    );
  }
}

function printHowDecksWentOut(report: Report): void {
  const { games, percent, labels } = report;
  const reasons = ['life', 'commander', 'poison', 'decked', 'its own doing'];
  const describePlayer = (label: string, player: number) => {
    const counts = reasons
      .map(
        (reason) =>
          [
            reason,
            games.filter((game) => game.why[player] === reason).length,
          ] as [string, number],
      )
      .filter(([, count]) => count > 0);
    const text = counts.length
      ? counts
          .map(([reason, count]) => `${reason} ${percent(count).trim()}`)
          .join(', ')
      : 'never';
    return `${label}: ${text}`;
  };
  console.log(
    '\nHow each deck went out (share of its games): ' +
      labels.map(describePlayer).join('; ') +
      '.',
  );
  console.log(
    `"declared" = the deck's own win (a combo, a kill line, its win rule) with others still alive; "standing" = it was the last one left.`,
  );
}
