/** The report of a batch of pod games: built as data (`buildPodReport`), printed by `printPod`. */
import type { PodDeckReport, PodReport } from '../app/api-types';
import { PodGame, PodSpec } from './pod-types';

const sum = (numbers: number[]) =>
  numbers.reduce((total, value) => total + value, 0);

/** The rounds the "won by the end of round" table shows (the ones up to the round cap). */
const ROUNDS_OF_INTEREST = [4, 5, 6, 7, 8, 9, 10, 11, 12, 14];

/** The ways a deck goes out, in the order they are printed. */
const WAYS_TO_GO_OUT = [
  'life',
  'commander',
  'poison',
  'decked',
  'its own doing',
];

/** A share in percent, or null when there is nothing to divide by. */
const sharePercent = (part: number, whole: number): number | null =>
  whole ? (100 * part) / whole : null;

export function buildPodReport(spec: PodSpec, games: PodGame[]): PodReport {
  const gameCount = games.length;
  const playerCount = spec.decks.length;
  const roundsShown = ROUNDS_OF_INTEREST.filter((round) => round <= spec.cap);
  const decidedGames = games.filter((game) => game.winner !== null);
  const decks = spec.decks.map((deck, player) => {
    const label =
      deck + (spec.decks.indexOf(deck) !== player ? `#${player + 1}` : '');
    return buildDeckReport(spec, games, player, label, roundsShown);
  });
  return {
    kind: 'pod',
    gameCount,
    playerCount,
    roundsCap: spec.cap,
    evenSharePercent: 100 / playerCount,
    noisePoints: 196 * Math.sqrt(0.25 / Math.max(1, gameCount)),
    decks,
    roundsShown,
    noWinnerPercent:
      sharePercent(gameCount - decidedGames.length, gameCount) ?? 0,
    averageGameLength: decidedGames.length
      ? sum(decidedGames.map((game) => game.turn)) / decidedGames.length
      : null,
    hadInteraction: games.some(
      (game) => sum(game.tried) + sum(game.removals) + sum(game.countered) > 0,
    ),
  };
}

function buildDeckReport(
  spec: PodSpec,
  games: PodGame[],
  player: number,
  label: string,
  roundsShown: number[],
): PodDeckReport {
  const gameCount = games.length;
  /** A share of all games, 0 when there are none. */
  const percentOfGames = (count: number) => sharePercent(count, gameCount) ?? 0;
  const won = games.filter((game) => game.winner === player);
  const winTurns = won
    .map((game) => game.turn)
    .sort((first, second) => first - second);
  const winTurnAtPercentile = (fraction: number) =>
    winTurns.length
      ? winTurns[
          Math.min(winTurns.length - 1, Math.floor(fraction * winTurns.length))
        ]
      : null;
  /** The average per game of a count of this deck. */
  const perGame = (countOf: (game: PodGame) => number) =>
    gameCount ? sum(games.map(countOf)) / gameCount : 0;
  const winAttempts = sum(games.map((game) => game.tried[player]));
  const wentOutPercent: Record<string, number> = {};
  for (const reason of WAYS_TO_GO_OUT) {
    const count = games.filter((game) => game.why[player] === reason).length;
    if (count > 0) wentOutPercent[reason] = percentOfGames(count);
  }
  return {
    label,
    deck: spec.decks[player],
    list: spec.lists[player],
    winPercent: percentOfGames(won.length),
    averageWinTurn: winTurns.length ? sum(winTurns) / winTurns.length : null,
    winTurn10Percent: winTurnAtPercentile(0.1),
    winTurn90Percent: winTurnAtPercentile(0.9),
    declaredPercent: sharePercent(
      won.filter((game) => game.how === 'declared').length,
      won.length,
    ),
    standingPercent: sharePercent(
      won.filter((game) => game.how === 'last standing').length,
      won.length,
    ),
    outFirstPercent: percentOfGames(
      games.filter((game) => game.out[0] === player).length,
    ),
    winPercentBySeat: spec.decks.map((_, seat) => {
      const gamesInSeat = games.filter((game) => game.seat[player] === seat);
      return sharePercent(
        gamesInSeat.filter((game) => game.winner === player).length,
        gamesInSeat.length,
      );
    }),
    wonByRoundPercent: roundsShown.map((round) =>
      percentOfGames(
        games.filter((game) => game.winner === player && game.turn <= round)
          .length,
      ),
    ),
    interaction: {
      winAttempts: perGame((game) => game.tried[player]),
      stoppedPercent: sharePercent(
        sum(games.map((game) => game.stopped[player])),
        winAttempts,
      ),
      turnsWaited: perGame((game) => game.waited[player]),
      spellsCountered: perGame((game) => game.countered[player]),
      removalTaken: perGame((game) => game.removed[player]),
      shielded: perGame((game) => game.shields[player]),
      answersUsed: perGame((game) => game.answers[player]),
      removalCast: perGame((game) => game.removals[player]),
    },
    wentOutPercent,
  };
}

// ================================================================ printing

/** A share as "  12.3%", or "-" when there is none. */
const showPercent = (percent: number | null) =>
  (percent === null ? '-' : percent.toFixed(1)).padStart(6) + '%';
const showNumber = (value: number | null, decimals: number) =>
  value === null ? '-' : value.toFixed(decimals);

/** The report: win rate, win turns (average, 10th and 90th percentile), how the wins came, first out, win rate by seat. */
export function printPod(report: PodReport): void {
  const nameWidth =
    Math.max(10, ...report.decks.map((deck) => deck.label.length)) + 2;
  console.log(
    `\n${report.gameCount} pod games, ${report.playerCount} players, at most ${report.roundsCap} rounds. An even pod would give each deck ${report.evenSharePercent.toFixed(0)}%.`,
  );
  console.log(
    `Noise: about +/-${report.noisePoints.toFixed(0)} points on a win rate.\n`,
  );
  printWinTable(report, nameWidth);
  printWinsByRound(report, nameWidth);
  console.log(
    `\nNo winner by round ${report.roundsCap}: ${showPercent(report.noWinnerPercent).trim()}. Average game length: ${showNumber(report.averageGameLength, 2)} rounds.`,
  );
  if (report.hadInteraction) printInteraction(report, nameWidth);
  printHowDecksWentOut(report);
}

function printWinTable(report: PodReport, nameWidth: number): void {
  console.log(
    'deck'.padEnd(nameWidth) +
      '   wins  avg turn  10%-90% turn  declared  standing  out first  ' +
      Array.from({ length: report.playerCount }, (_, seat) =>
        `seat ${seat + 1}`.padStart(8),
      ).join(''),
  );
  for (const deck of report.decks) {
    const winTurnRange = `${showNumber(deck.winTurn10Percent, 0)}-${showNumber(deck.winTurn90Percent, 0)}`;
    console.log(
      deck.label.padEnd(nameWidth) +
        showPercent(deck.winPercent) +
        showNumber(deck.averageWinTurn, 2).padStart(10) +
        winTurnRange.padStart(14) +
        showPercent(deck.declaredPercent).padStart(10) +
        showPercent(deck.standingPercent).padStart(10) +
        showPercent(deck.outFirstPercent).padStart(11) +
        '  ' +
        deck.winPercentBySeat
          .map((percent) => showPercent(percent).padStart(8))
          .join(''),
    );
  }
}

function printWinsByRound(report: PodReport, nameWidth: number): void {
  console.log('\nWon by the end of round (share of all games):');
  console.log(
    'deck'.padEnd(nameWidth) +
      report.roundsShown.map((round) => String(round).padStart(7)).join(''),
  );
  for (const deck of report.decks)
    console.log(
      deck.label.padEnd(nameWidth) +
        deck.wonByRoundPercent.map(showPercent).join(''),
    );
}

function printInteraction(report: PodReport, nameWidth: number): void {
  console.log('\nInteraction, per game:');
  console.log(
    'deck'.padEnd(nameWidth) +
      '  win attempts   stopped  turns waited  spells countered  removal taken  shielded  answers used  removal / wipes cast',
  );
  for (const { label, interaction } of report.decks) {
    const stopped =
      interaction.stoppedPercent === null
        ? '      -'
        : showPercent(interaction.stoppedPercent);
    console.log(
      label.padEnd(nameWidth) +
        interaction.winAttempts.toFixed(2).padStart(14) +
        stopped.padStart(10) +
        interaction.turnsWaited.toFixed(2).padStart(14) +
        interaction.spellsCountered.toFixed(2).padStart(18) +
        interaction.removalTaken.toFixed(2).padStart(15) +
        interaction.shielded.toFixed(2).padStart(10) +
        interaction.answersUsed.toFixed(2).padStart(14) +
        interaction.removalCast.toFixed(2).padStart(22),
    );
  }
}

function printHowDecksWentOut(report: PodReport): void {
  const describeDeck = ({ label, wentOutPercent }: PodDeckReport) => {
    const reasons = Object.entries(wentOutPercent);
    const text = reasons.length
      ? reasons
          .map(
            ([reason, percent]) => `${reason} ${showPercent(percent).trim()}`,
          )
          .join(', ')
      : 'never';
    return `${label}: ${text}`;
  };
  console.log(
    '\nHow each deck went out (share of its games): ' +
      report.decks.map(describeDeck).join('; ') +
      '.',
  );
  console.log(
    `"declared" = the deck's own win (a combo, a kill line, its win rule) with others still alive; "standing" = it was the last one left.`,
  );
}

/** How a pod game ended, in a few words: "samfrodo wins in round 8 (last standing)". */
export function describePodResult(spec: PodSpec, game: PodGame): string {
  if (game.winner === null) return `no winner after round ${game.turn}`;
  return `${spec.decks[game.winner]} wins in round ${game.turn} (${game.how})`;
}
