/**
 * The pod report as the columns and rows of results tables: what the command line prints (engine/pod-report.ts:
 * printPod), as data for the page.
 */
import type { PodReport } from '../../../../../api-types';
import type { ShownTable } from '../simulate/report-tables';

/** The ways a deck went out, in the order the command line prints them. */
const WAYS_TO_GO_OUT = [
  'life',
  'commander',
  'poison',
  'decked',
  'its own doing',
];

/** Wins, when they came, how they came, and the win rate of each seat. */
export function winsTable(report: PodReport): ShownTable {
  return {
    columns: [
      { label: 'wins', unit: '%' },
      { label: 'average win turn', unit: 'turn' },
      { label: '10% point', unit: 'turn' },
      { label: '90% point', unit: 'turn' },
      { label: 'declared win', unit: '%' },
      { label: 'last standing', unit: '%' },
      { label: 'out first', unit: '%' },
      ...Array.from({ length: report.playerCount }, (_, seat) => ({
        label: `seat ${seat + 1}`,
        unit: '%' as const,
      })),
    ],
    rows: report.decks.map((deck) => ({
      label: deck.label,
      values: [
        deck.winPercent,
        deck.averageWinTurn,
        deck.winTurn10Percent,
        deck.winTurn90Percent,
        deck.declaredPercent,
        deck.standingPercent,
        deck.outFirstPercent,
        ...deck.winPercentBySeat,
      ],
    })),
  };
}

/** The share of all games each deck had won by the end of each round. */
export function winsByRoundTable(report: PodReport): ShownTable {
  return {
    columns: report.roundsShown.map((round) => ({
      label: `round ${round}`,
      unit: '%' as const,
    })),
    rows: report.decks.map((deck) => ({
      label: deck.label,
      values: deck.wonByRoundPercent,
    })),
  };
}

/** Per game: win attempts, how many were stopped, removal and counterspells. */
export function interactionTable(report: PodReport): ShownTable {
  return {
    columns: [
      { label: 'win attempts', unit: 'n' },
      { label: 'stopped', unit: '%' },
      { label: 'turns waited', unit: 'n' },
      { label: 'spells countered', unit: 'n' },
      { label: 'removal taken', unit: 'n' },
      { label: 'shielded', unit: 'n' },
      { label: 'answers used', unit: 'n' },
      { label: 'removal / wipes cast', unit: 'n' },
    ],
    rows: report.decks.map(({ label, interaction }) => ({
      label,
      values: [
        interaction.winAttempts,
        interaction.stoppedPercent,
        interaction.turnsWaited,
        interaction.spellsCountered,
        interaction.removalTaken,
        interaction.shielded,
        interaction.answersUsed,
        interaction.removalCast,
      ],
    })),
  };
}

/** Share of all games in which each deck went out, by the way it went out (only ways that happened). */
export function wentOutTable(report: PodReport): ShownTable {
  const waysThatHappened = WAYS_TO_GO_OUT.filter((way) =>
    report.decks.some((deck) => deck.wentOutPercent[way] !== undefined),
  );
  return {
    columns: waysThatHappened.map((way) => ({
      label: way,
      unit: '%' as const,
    })),
    rows: report.decks.map((deck) => ({
      label: deck.label,
      values: waysThatHappened.map((way) => deck.wentOutPercent[way] ?? 0),
    })),
  };
}
