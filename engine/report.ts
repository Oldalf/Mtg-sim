/** The tables printed after a simulation: kill turns of one list, a comparison of lists, --diag and --hands. */
import * as path from 'path';
import * as C from './cards';
import { Config } from './game-types';
import { Deck, DiagRow, KillTurns } from './runner';
import type { KillKind, Table } from './run-types';

export type { Table };

const KILL_KINDS: readonly KillKind[] = ['any', 'protected'];

/** What the two numbers a game returns mean, when the deck doesn't say: [long name, short column name] for each. */
const DEFAULT_METRICS: [[string, string], [string, string]] = [
  ['Win possible (any)', ''],
  ['Win with counter backup', 'backup'],
];

export function table(results: KillTurns[], maxTurn: number): Table {
  const gameCount = results.length;
  const table: Table = {
    percentOnTurn: { any: [], protected: [] },
    averageTurn: { any: NaN, protected: NaN },
    percentKilled: { any: 0, protected: 0 },
  };
  KILL_KINDS.forEach((kind, kindIndex) => {
    const killTurns = results.map((result) => result[kindIndex]);
    for (let turn = 0; turn <= maxTurn; turn++)
      table.percentOnTurn[kind][turn] =
        (killTurns.filter((killTurn) => killTurn === turn).length / gameCount) *
        100;
    const turnsOfKills = killTurns.filter(
      (killTurn): killTurn is number => killTurn !== null,
    );
    table.averageTurn[kind] = turnsOfKills.length
      ? turnsOfKills.reduce((sum, turn) => sum + turn, 0) / turnsOfKills.length
      : NaN;
    table.percentKilled[kind] = (turnsOfKills.length / gameCount) * 100;
  });
  return table;
}

/** % of games with a kill by this turn. */
const percentByTurn = (table: Table, kind: KillKind, turn: number) =>
  table.percentOnTurn[kind]
    .slice(1, turn + 1)
    .reduce((total, value) => total + value, 0);

/** How far apart two win rates must be, in percentage points, before it is more than luck. */
const noisePoints = (gameCount: number) =>
  2 * Math.sqrt(0.25 / gameCount) * 100 * 1.41;

const oneDecimal = (x: number) => x.toFixed(1);
const padLeft = (text: string, width: number) => text.padStart(width);

export function printSingle(
  name: string,
  table: Table,
  config: Config,
  gameCount: number,
  metrics = DEFAULT_METRICS,
): void {
  const maxTurn = config.max_turn as number;
  console.log(
    `\n${name}  (${gameCount} games, ${config.opponents} goldfish opponents at ${config.opp_life} life)`,
  );
  console.log(`            |   ${metrics[0][0].padEnd(22)}|  ${metrics[1][0]}`);
  console.log('  Turn      |   on turn   by turn     |   on turn   by turn');
  console.log(
    '  ----------+-------------------------+-------------------------',
  );
  let anyByTurn = 0;
  let protectedByTurn = 0;
  for (let turn = 1; turn <= maxTurn; turn++) {
    const anyOnTurn = table.percentOnTurn.any[turn];
    const protectedOnTurn = table.percentOnTurn.protected[turn];
    anyByTurn += anyOnTurn;
    protectedByTurn += protectedOnTurn;
    if (turn < 3 && anyOnTurn === 0 && protectedOnTurn === 0) continue;
    console.log(
      `  Turn ${String(turn).padEnd(4)} |   ${padLeft(oneDecimal(anyOnTurn), 6)}%   ${padLeft(oneDecimal(anyByTurn), 6)}%    |   ${padLeft(oneDecimal(protectedOnTurn), 6)}%   ${padLeft(oneDecimal(protectedByTurn), 6)}%`,
    );
  }
  console.log(
    '  ----------+-------------------------+-------------------------',
  );
  console.log(
    `  Avg turn  |   ${padLeft(table.averageTurn.any.toFixed(2), 6)}               |   ${padLeft(table.averageTurn.protected.toFixed(2), 6)}   (games that won by T${maxTurn})`,
  );
  console.log(
    `  No win T${maxTurn}|   ${padLeft(oneDecimal(100 - table.percentKilled.any), 6)}%              |   ${padLeft(oneDecimal(100 - table.percentKilled.protected), 6)}%`,
  );
}

/** First list is the base; every other list is shown as a difference to it. */
export function printCompare(
  listFiles: string[],
  tables: Table[],
  config: Config,
  gameCount: number,
  metrics = DEFAULT_METRICS,
  compareTurns?: number[],
): void {
  const maxTurn = config.max_turn as number;
  const anyPrefix = metrics[0][1] ? metrics[0][1] + ' ' : '';
  const protectedPrefix = metrics[1][1] + ' ';
  const turns = compareTurns ?? [6, 7, maxTurn];
  const secondLastTurn = turns[turns.length - 2];
  const columns = (
    [
      ...turns.map((turn) => [`${anyPrefix}by T${turn}`, 'any', turn]),
      [`${protectedPrefix}T${secondLastTurn}`, 'protected', secondLastTurn],
      [`${protectedPrefix}T${maxTurn}`, 'protected', maxTurn],
    ] as [string, KillKind, number][]
  ).filter(([, , turn]) => turn <= maxTurn);
  const baseTable = tables[0];
  const nameWidth = Math.max(
    24,
    ...listFiles.map((file) => path.basename(file).length + 1),
  );
  console.log(
    `\n${gameCount} games each, same seeds. Difference to ${path.basename(listFiles[0])} in brackets ` +
      `(about +/-${oneDecimal(noisePoints(gameCount))} is noise).`,
  );
  console.log(
    `${'list'.padEnd(nameWidth)} ` +
      columns.map(([title]) => padLeft(title, 13)).join(' ') +
      ` ${padLeft('avg turn', 9)}`,
  );
  listFiles.forEach((file, index) => {
    const listTable = tables[index];
    const cells = columns.map(([, kind, turn]) => {
      const percent = percentByTurn(listTable, kind, turn);
      const difference = percent - percentByTurn(baseTable, kind, turn);
      return (
        padLeft(oneDecimal(percent), 5) +
        (listTable === baseTable
          ? ''
          : ` (${(difference >= 0 ? '+' : '') + oneDecimal(difference)})`.padStart(
              7,
            ))
      );
    });
    console.log(
      `${path.basename(file).padEnd(nameWidth)} ` +
        cells.map((cell) => padLeft(cell, 13)).join(' ') +
        ` ${padLeft(listTable.averageTurn.any.toFixed(2), 9)}`,
    );
  });
}

/** --diag: the deck's own measures for each list, on the same seeds (differences to the first list in brackets). */
export function printDiag(
  deck: Deck,
  listNames: string[],
  rowsPerList: DiagRow[][],
  gameCount: number,
): void {
  const metrics = deck.diagMetrics ?? [];
  const labelWidth =
    Math.max(...metrics.map((metric) => metric.label.length)) + 2;
  console.log(`${gameCount} games each, same seeds. Noise: about +/-2 points for a %, +/-0.1 for a turn.
`);
  console.log(
    ''.padEnd(labelWidth) +
      listNames.map((name) => name.slice(0, 18).padStart(18)).join(''),
  );
  for (const metric of metrics) {
    const values = rowsPerList.map((rows) => metric.measure(rows));
    const decimals = metric.unit === '%' ? 1 : 2;
    const cells = values.map((value, index) => {
      const difference = value - values[0];
      const differenceText =
        index === 0
          ? ''
          : ` (${difference >= 0 ? '+' : ''}${difference.toFixed(decimals)})`;
      return (value.toFixed(decimals) + differenceText).padStart(18);
    });
    console.log(metric.label.padEnd(labelWidth) + cells.join(''));
  }
}

// ================================================================ --hands

/** One game's opening hand and the turn the game was won (null = not won). */
export type HandResult = [number | null, string[]];

/**
 * --hands: how opening hands do, by land count and by what is in them (no mulligans; the sim's keep rule is 2-5
 * lands). `handsOfSeven` are raw opening sevens, `handsOfSix` are a mulligan to six.
 */
export function printHands(
  deck: Deck,
  handsOfSeven: HandResult[],
  handsOfSix: HandResult[],
  config: Config,
): void {
  const noWinTurn = (config.max_turn as number) + 1; // a game with no win counts as this turn
  const winByTurn = deck.rankTurn ?? 7;
  const turnOf = (winTurn: number | null) =>
    winTurn === null ? noWinTurn : winTurn;
  const landCount = (cardNames: string[]) =>
    cardNames
      .map((name) => C.get(name))
      .filter((card) => card.land !== null || card.mdfcLand !== null).length;
  const hands = handsOfSeven.map(([winTurn, cardNames]) => ({
    turn: turnOf(winTurn),
    cardNames,
    lands: landCount(cardNames),
  }));
  const keptHands = hands.filter((hand) => hand.lands >= 2 && hand.lands <= 5);

  console.log(
    `${hands.length} raw opening hands of 7 (no mulligans). "avg turn" = the turn you win (no win by turn ${noWinTurn - 1} counts as ${noWinTurn}); "win by T${winByTurn}" in %. Lower avg turn is better.\n`,
  );
  printHandsByLandCount(hands, keptHands, winByTurn);
  const turnsOfSix = handsOfSix.map(([winTurn]) => turnOf(winTurn));
  console.log(
    `  a mulligan to 6 (draw 7, bottom the worst, kept whatever it is): avg turn ${fixed2(mean(turnsOfSix))}, win by T${winByTurn} ${fixed1(percentWinningBy(turnsOfSix, winByTurn))}%`,
  );
  console.log(
    `  all raw 7s (what the free mulligan gives, before any further mulligan): avg turn ${fixed2(mean(hands.map((hand) => hand.turn)))}`,
  );
  printHandFeatures(deck, keptHands);
  printCardsInOpeningHand(keptHands);
}

interface OpeningHand {
  turn: number; // the turn the game was won (or the "no win" turn)
  cardNames: string[];
  lands: number;
}

const mean = (numbers: number[]) =>
  numbers.length
    ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length
    : NaN;
const percentWinningBy = (turns: number[], turn: number) =>
  turns.length
    ? (100 * turns.filter((x) => x <= turn).length) / turns.length
    : NaN;
const fixed1 = (x: number, width = 5) =>
  (Number.isNaN(x) ? '-' : x.toFixed(1)).padStart(width);
const fixed2 = (x: number, width = 5) =>
  (Number.isNaN(x) ? '-' : x.toFixed(2)).padStart(width);

function printHandsByLandCount(
  hands: OpeningHand[],
  keptHands: OpeningHand[],
  winByTurn: number,
): void {
  console.log('lands in the 7   share    avg turn   win by T' + winByTurn);
  for (let lands = 0; lands <= 7; lands++) {
    const turns = hands
      .filter((openingHand) => openingHand.lands === lands)
      .map((openingHand) => openingHand.turn);
    console.log(
      `  ${lands} lands      ${fixed1((100 * turns.length) / hands.length, 5)}%   ${fixed2(mean(turns), 6)}     ${fixed1(percentWinningBy(turns, winByTurn), 5)}`,
    );
  }
  const keptTurns = keptHands.map((hand) => hand.turn);
  console.log(
    `  2-5 lands (the sim's keep rule)  ${fixed1((100 * keptHands.length) / hands.length)}%   ${fixed2(mean(keptTurns), 6)}     ${fixed1(percentWinningBy(keptTurns, winByTurn), 5)}`,
  );
}

/** Yes/no questions about the hand (the deck's own, and a few that fit every deck): how much sooner it wins with them. */
function printHandFeatures(deck: Deck, keptHands: OpeningHand[]): void {
  const isSpell = (card: C.CardDef) =>
    card.land === null && card.mdfcLand === null;
  const genericFeatures: {
    label: string;
    matches: (hand: C.CardDef[]) => boolean;
  }[] = [
    {
      label: 'a spell costing 1-2',
      matches: (hand) =>
        hand.some(
          (card) => isSpell(card) && card.manaValue >= 1 && card.manaValue <= 2,
        ),
    },
    {
      label: 'two or more spells costing 1-3',
      matches: (hand) =>
        hand.filter(
          (card) => isSpell(card) && card.manaValue >= 1 && card.manaValue <= 3,
        ).length >= 2,
    },
    {
      label: 'no spell costing 3 or less',
      matches: (hand) =>
        !hand.some((card) => isSpell(card) && card.manaValue <= 3),
    },
  ];
  const features = [...genericFeatures, ...(deck.handFeatures ?? [])];
  if (!features.length) return;
  const cardsOf = (hand: OpeningHand) =>
    hand.cardNames.map((name) => C.get(name));
  console.log(
    `\nAmong hands with 2-5 lands (avg turn; a difference under about 0.1 is noise):`,
  );
  console.log('feature'.padEnd(64) + 'share   with     without  gain');
  for (const feature of features) {
    const withFeature = keptHands.filter((openingHand) =>
      feature.matches(cardsOf(openingHand)),
    );
    const withoutFeature = keptHands.filter(
      (openingHand) => !feature.matches(cardsOf(openingHand)),
    );
    const turnsWith = mean(withFeature.map((openingHand) => openingHand.turn));
    const turnsWithout = mean(
      withoutFeature.map((openingHand) => openingHand.turn),
    );
    const gain = turnsWithout - turnsWith;
    console.log(
      feature.label.padEnd(64) +
        `${fixed1((100 * withFeature.length) / keptHands.length)}%  ${fixed2(turnsWith, 6)}  ${fixed2(turnsWithout, 6)}  ${(gain >= 0 ? '+' : '') + gain.toFixed(2)}`,
    );
  }
}

/** Cards in the opening hand (2-5 lands, nonlands): how much sooner you win with the card in your first 7. */
function printCardsInOpeningHand(keptHands: OpeningHand[]): void {
  const MIN_HANDS_WITH_CARD = 150; // fewer than this is too noisy to say anything
  const cardNames = new Set<string>();
  for (const hand of keptHands)
    for (const name of hand.cardNames)
      if (C.get(name).land === null) cardNames.add(name);
  const rows: [string, number, number][] = []; // card, hands with it, turns sooner
  for (const name of cardNames) {
    const turnsWith = keptHands
      .filter((openingHand) => openingHand.cardNames.includes(name))
      .map((openingHand) => openingHand.turn);
    const turnsWithout = keptHands
      .filter((openingHand) => !openingHand.cardNames.includes(name))
      .map((openingHand) => openingHand.turn);
    if (turnsWith.length >= MIN_HANDS_WITH_CARD)
      rows.push([name, turnsWith.length, mean(turnsWithout) - mean(turnsWith)]);
  }
  rows.sort((first, second) => second[2] - first[2]);
  const show = ([name, handCount, turnsSooner]: [string, number, number]) =>
    console.log(
      `  ${name.padEnd(40)} in ${String(handCount).padStart(5)} hands  ${(turnsSooner >= 0 ? '+' : '') + turnsSooner.toFixed(2)} turns sooner`,
    );
  console.log('\nCards that help most in the opening 7 (2-5 land hands):');
  rows.slice(0, 14).forEach(show);
  console.log('Cards that help least (or are a drag) in the opening 7:');
  rows.slice(-8).forEach(show);
}
