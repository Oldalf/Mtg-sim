import { describe, expect, it } from 'vitest';
import type { PodDeckReport, PodReport } from '../../../../../api-types';
import { interactionTable, wentOutTable, winsTable } from './pod-tables';

function deckReport(label: string, winPercent: number): PodDeckReport {
  return {
    label,
    deck: label,
    list: 'decklist.txt',
    winPercent,
    averageWinTurn: 7.5,
    winTurn10Percent: 5,
    winTurn90Percent: 10,
    declaredPercent: 80,
    standingPercent: 20,
    outFirstPercent: 10,
    winPercentBySeat: [30, 20, 25],
    wonByRoundPercent: [1, 2],
    interaction: {
      winAttempts: 1,
      stoppedPercent: null,
      turnsWaited: 0,
      spellsCountered: 0,
      removalTaken: 0,
      shielded: 0,
      answersUsed: 0,
      removalCast: 0,
    },
    wentOutPercent: { commander: 12 },
  };
}

const report: PodReport = {
  kind: 'pod',
  gameCount: 100,
  playerCount: 3,
  roundsCap: 17,
  evenSharePercent: 100 / 3,
  noisePoints: 10,
  decks: [deckReport('gale', 40), deckReport('meren', 30)],
  roundsShown: [4, 5],
  noWinnerPercent: 5,
  averageGameLength: 8,
  hadInteraction: true,
};

describe('pod tables', () => {
  it('gives the wins table a column per seat and a value per column', () => {
    const { columns, rows } = winsTable(report);
    expect(columns.length).toBe(7 + report.playerCount);
    expect(rows[0].values.length).toBe(columns.length);
    expect(rows[0].values[0]).toBe(40);
  });

  it('keeps the values of the interaction table in step with its columns', () => {
    const { columns, rows } = interactionTable(report);
    expect(rows[0].values.length).toBe(columns.length);
  });

  it('shows only the ways of going out that happened', () => {
    const { columns } = wentOutTable(report);
    expect(columns.map((column) => column.label)).toEqual(['commander']);
  });
});
