/** Judging the cards of a list: --rank (which cards help most when seen early) and --cut (replace a card by a land). */
import * as fs from 'fs';
import * as path from 'path';
import * as C from './cards';
import { Config } from './game-types';
import { buildKillTurnReport, printCompare, table } from './report';
import { Deck, simulate } from './runner';

const signed = (x: number, decimals: number) =>
  (x >= 0 ? '+' : '') + x.toFixed(decimals);
const padLeft = (text: string, width: number) => text.padStart(width);

/** One card's row of the ranking. */
interface CardRanking {
  card: string;
  turnsSooner: number; // how many turns sooner the average game kills when the card was seen by turn 4
  percentPointsMore: number; // how many more points of games kill by the deck's rank turn
  gamesSeen: number;
}

/** --rank: how much sooner the deck kills when it has seen a card by turn 4. This shows correlation, not proof. */
export async function rank(
  deck: Deck,
  listFile: string,
  gameCount: number,
  config: Config,
  workers: number,
): Promise<void> {
  const games = (
    await simulate(deck, listFile, gameCount, config, workers, 'seen4')
  ).seen4!;
  const decklist = C.loadDecklist(listFile);
  const maxTurn = config.max_turn as number;
  const rankTurn = deck.rankTurn ?? 7;
  const protection = deck.rankProtect;
  const isProtected = (card: string) =>
    !!protection &&
    ((protection.cards ?? []).includes(card) ||
      (protection.sections.includes(decklist.sections[card] ?? '') &&
        !(protection.except ?? []).includes(card)));
  // a game with no kill counts as the turn after the last one
  const turnOf = (killTurn: number | null) =>
    killTurn === null ? maxTurn + 1 : killTurn;
  const percentKillingBy = (turns: number[]) =>
    (turns.filter((turn) => turn <= rankTurn).length / turns.length) * 100;
  const mean = (numbers: number[]) =>
    numbers.reduce((sum, value) => sum + value, 0) / numbers.length;

  const rankings: CardRanking[] = [];
  for (const card of [...new Set(decklist.library)].sort()) {
    const turnsWithCard = games
      .filter(([, cardsSeen]) => cardsSeen.includes(card))
      .map(([killTurn]) => turnOf(killTurn));
    const turnsWithoutCard = games
      .filter(([, cardsSeen]) => !cardsSeen.includes(card))
      .map(([killTurn]) => turnOf(killTurn));
    if (turnsWithCard.length < 30 || turnsWithoutCard.length < 30) continue;
    rankings.push({
      card,
      turnsSooner: mean(turnsWithoutCard) - mean(turnsWithCard),
      percentPointsMore:
        percentKillingBy(turnsWithCard) - percentKillingBy(turnsWithoutCard),
      gamesSeen: turnsWithCard.length,
    });
  }
  rankings.sort(
    (first, second) =>
      second.turnsSooner - first.turnsSooner ||
      second.percentPointsMore - first.percentPointsMore,
  );

  console.log(
    `${games.length} games. 'Faster' = how many turns sooner you kill on average when you had seen the card by turn 4`,
  );
  console.log(
    `(no kill by turn ${maxTurn} counts as turn ${maxTurn + 1}).  Noise is roughly +/-0.08 turns and +/-3 points.`,
  );
  console.log(
    'This shows correlation, not proof: test a low-ranked card with a cut test before cutting it.\n',
  );
  const printRow = (row: CardRanking) =>
    console.log(
      `  ${row.card.padEnd(38)} ${padLeft(signed(row.turnsSooner, 2), 7)} ${padLeft(signed(row.percentPointsMore, 1), 10)}% ` +
        `${padLeft(((row.gamesSeen / games.length) * 100).toFixed(0), 7)}%`,
    );
  console.log(
    `  ${'card'.padEnd(38)} ${padLeft('faster', 7)} ${padLeft(`win by T${rankTurn}`, 11)} ${padLeft('seen in', 8)}`,
  );
  for (const row of rankings) if (!isProtected(row.card)) printRow(row);
  const notJudged = rankings.filter((row) => isProtected(row.card));
  if (notJudged.length) {
    console.log(
      `
  Not judged (${protection!.sections.join(' / ')}: interaction does nothing against goldfish opponents, like ` +
        'counterspells; keep or cut them on judgement):',
    );
    for (const row of notJudged) printRow(row);
  }
}

/** Writes a copy of a decklist with one copy of `card` replaced by one `replacement` (a basic land). */
export function cutVariant(
  baseListFile: string,
  card: string,
  replacement: string,
  outFile: string,
): void {
  const lines = fs.readFileSync(baseListFile, 'utf-8').split(/\r?\n/);
  const outLines: string[] = [];
  let removed = false;
  let added = false;
  for (const line of lines) {
    const entry = /^\s*(\d+)x?\s+(.+?)\s*$/.exec(line);
    if (entry && !removed && entry[2] === card) {
      const copies = parseInt(entry[1], 10);
      removed = true;
      if (copies > 1) outLines.push(`${copies - 1}x ${card}`);
      continue;
    }
    if (entry && !added && entry[2] === replacement) {
      outLines.push(`${parseInt(entry[1], 10) + 1}x ${replacement}`);
      added = true;
      continue;
    }
    outLines.push(line);
  }
  if (!removed) throw new Error(`'${card}' is not in ${baseListFile}`);
  if (!added) outLines.push(`1x ${replacement}`);
  fs.writeFileSync(outFile, outLines.join('\n').replace(/\n*$/, '\n'), 'utf-8');
}

/** --cut: replaces each card in turn by a land and compares the results with the original list. */
export async function cuts(
  deck: Deck,
  listFile: string,
  cards: string[],
  replacement: string,
  gameCount: number,
  config: Config,
  workers: number,
): Promise<void> {
  const outDir = path.join(deck.dir, 'lists', 'cuts');
  fs.mkdirSync(outDir, { recursive: true });
  const maxTurn = config.max_turn as number;
  const killTable = async (file: string) =>
    table(
      (await simulate(deck, file, gameCount, config, workers)).kills!,
      maxTurn,
    );
  const listFiles = [listFile];
  const tables = [await killTable(listFile)];
  for (const card of cards) {
    const variantFile = path.join(
      outDir,
      'cut_' +
        card.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '') +
        '.txt',
    );
    cutVariant(listFile, card, replacement, variantFile);
    listFiles.push(variantFile);
    tables.push(await killTable(variantFile));
    console.log(`  done: cut ${card}`);
  }
  console.log(
    `\nEach card replaced by 1 ${replacement}. A difference near 0 or positive means the land does as well.`,
  );
  printCompare(
    buildKillTurnReport(
      listFiles,
      tables,
      config,
      gameCount,
      deck.metrics,
      deck.compareTurns,
    ),
  );
  console.log(`\nVariant lists are saved in ${outDir}.`);
}
