/**
 * The reports of a goldfish run as the columns and rows of a results table: what the command line prints
 * (engine/report.ts: printSingle, printCompare, printDiag), as data for the page.
 */
import type { KillKind, Table } from '../../../../../../engine/run-types';
import type { DiagReport, KillTurnReport } from '../../../../../api-types';
import type { ChartLine } from '../../shared/line-chart/line-chart';
import type {
  ResultColumn,
  ResultRow,
} from '../../shared/results-table/results-table';

export interface ShownTable {
  columns: ResultColumn[];
  rows: ResultRow[];
}

/** Share of games with a kill of this kind by the end of the turn. */
export function percentByTurn(
  table: Table,
  kind: KillKind,
  turn: number,
): number {
  let percent = 0;
  for (let earlierTurn = 1; earlierTurn <= turn; earlierTurn++)
    percent += table.percentOnTurn[kind][earlierTurn] ?? 0;
  return percent;
}

/** One list: a row per turn, the share of games won on and by that turn, for both results (as printSingle). */
export function turnByTurnTable(report: KillTurnReport): ShownTable {
  const { table } = report.rows[0];
  const [anyName, protectedName] = report.resultNames.map(
    ([longName]) => longName,
  );
  const columns: ResultColumn[] = [
    { label: `${anyName}: on turn`, unit: '%' },
    { label: 'by turn', unit: '%' },
    { label: `${protectedName}: on turn`, unit: '%' },
    { label: 'by turn', unit: '%' },
  ];
  const rows: ResultRow[] = [];
  for (let turn = 1; turn <= report.maxTurn; turn++) {
    const anyOnTurn = table.percentOnTurn.any[turn] ?? 0;
    const protectedOnTurn = table.percentOnTurn.protected[turn] ?? 0;
    // the command line leaves out the first turns while nothing happens in them
    if (turn < 3 && anyOnTurn === 0 && protectedOnTurn === 0) continue;
    rows.push({
      label: `Turn ${turn}`,
      values: [
        anyOnTurn,
        percentByTurn(table, 'any', turn),
        protectedOnTurn,
        percentByTurn(table, 'protected', turn),
      ],
    });
  }
  return { columns, rows };
}

/** Several lists (or default against changed settings): the turns worth comparing, a row per list (as printCompare). */
export function comparisonTable(report: KillTurnReport): ShownTable {
  const { maxTurn, compareTurns, resultNames } = report;
  const anyPrefix = resultNames[0][1] ? resultNames[0][1] + ' ' : '';
  const protectedPrefix = resultNames[1][1] + ' ';
  const secondLastTurn = compareTurns[compareTurns.length - 2];
  const percentColumns = (
    [
      ...compareTurns.map((turn) => [`${anyPrefix}by T${turn}`, 'any', turn]),
      [`${protectedPrefix}T${secondLastTurn}`, 'protected', secondLastTurn],
      [`${protectedPrefix}T${maxTurn}`, 'protected', maxTurn],
    ] as [string, KillKind, number][]
  ).filter(([, , turn]) => turn <= maxTurn);
  return {
    columns: [
      ...percentColumns.map(([label]) => ({ label, unit: '%' as const })),
      { label: 'Average turn', unit: 'turn' },
    ],
    rows: report.rows.map(({ label, table }) => ({
      label,
      values: [
        ...percentColumns.map(([, kind, turn]) =>
          percentByTurn(table, kind, turn),
        ),
        table.averageTurn.any,
      ],
    })),
  };
}

/** --diag: the deck's own measures, a row per list (as printDiag). */
export function diagTable(report: DiagReport): ShownTable {
  return {
    columns: report.measures,
    rows: report.rows.map(({ label, values }) => ({ label, values })),
  };
}

/** The share of games won by each turn (turn 1 to the last): the numbers of the "by turn" columns. */
export function winShareByTurn(
  table: Table,
  kind: KillKind,
  maxTurn: number,
): number[] {
  const shares: number[] = [];
  for (let turn = 1; turn <= maxTurn; turn++)
    shares.push(percentByTurn(table, kind, turn));
  return shares;
}

/**
 * The lines of the kill-turn chart. One list: a line for each of the two results. Several lists: a line per list
 * for the chosen result.
 */
export function killTurnChartLines(
  report: KillTurnReport,
  chosenKind: KillKind,
): ChartLine[] {
  if (report.rows.length === 1) {
    const { table } = report.rows[0];
    const [[anyName], [protectedName]] = report.resultNames;
    return [
      { label: anyName, values: winShareByTurn(table, 'any', report.maxTurn) },
      {
        label: protectedName,
        values: winShareByTurn(table, 'protected', report.maxTurn),
      },
    ];
  }
  return report.rows.map(({ label, table }) => ({
    label,
    values: winShareByTurn(table, chosenKind, report.maxTurn),
  }));
}
