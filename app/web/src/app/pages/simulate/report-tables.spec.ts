import type { Table } from '../../../../../../engine/run-types';
import type { KillTurnReport } from '../../../../../api-types';
import {
  comparisonTable,
  percentByTurn,
  turnByTurnTable,
} from './report-tables';

/** A table of games played to turn 8; index 0 of percentOnTurn is unused. */
function makeTable(anyOnTurn: number[], protectedOnTurn: number[]): Table {
  const sum = (numbers: number[]) =>
    numbers.reduce((total, value) => total + value, 0);
  return {
    percentOnTurn: {
      any: [0, ...anyOnTurn],
      protected: [0, ...protectedOnTurn],
    },
    averageTurn: { any: 6.5, protected: 7.25 },
    percentKilled: { any: sum(anyOnTurn), protected: sum(protectedOnTurn) },
  };
}

const BASE_TABLE = makeTable(
  [0, 0, 0, 5, 10, 20, 25, 10],
  [0, 0, 0, 0, 5, 10, 15, 10],
);
const OTHER_TABLE = makeTable(
  [0, 0, 0, 10, 10, 20, 25, 10],
  [0, 0, 0, 0, 5, 15, 15, 10],
);

function makeReport(tables: Table[]): KillTurnReport {
  return {
    kind: 'kill-turns',
    gameCount: 1000,
    maxTurn: 8,
    opponents: 3,
    opponentLife: 40,
    resultNames: [
      ['Win possible (any)', 'win'],
      ['Win with counter backup', 'backup'],
    ],
    compareTurns: [6, 7, 8],
    noisePoints: 2.5,
    rows: tables.map((table, index) => ({ label: `list${index}.txt`, table })),
  };
}

describe('report tables', () => {
  it('adds up the turns for "by turn"', () => {
    expect(percentByTurn(BASE_TABLE, 'any', 5)).toBe(15);
    expect(percentByTurn(BASE_TABLE, 'protected', 8)).toBe(40);
  });

  it('shows one list turn by turn, leaving out the first turns without wins', () => {
    const { columns, rows } = turnByTurnTable(makeReport([BASE_TABLE]));
    expect(columns.length).toBe(4);
    expect(rows.map((row) => row.label)).toEqual([
      'Turn 3',
      'Turn 4',
      'Turn 5',
      'Turn 6',
      'Turn 7',
      'Turn 8',
    ]);
    expect(rows[3].values).toEqual([20, 35, 10, 15]);
  });

  it('compares lists at the turns the command line compares', () => {
    const { columns, rows } = comparisonTable(
      makeReport([BASE_TABLE, OTHER_TABLE]),
    );
    expect(columns.map((column) => column.label)).toEqual([
      'win by T6',
      'win by T7',
      'win by T8',
      'backup T7',
      'backup T8',
      'Average turn',
    ]);
    expect(rows[0].values).toEqual([35, 60, 70, 30, 40, 6.5]);
    expect(rows[1].values).toEqual([40, 65, 75, 35, 45, 6.5]);
  });
});
