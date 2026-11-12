/**
 * Run many goldfish games for a deck (in parallel worker threads) and print kill-turn tables.
 * Every list is played on the same seeds (1..n), so differences between lists come from the cards.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Worker } from 'worker_threads';
import * as C from './cards';
import { Config } from './game-types';
import { Game } from './game';
import { Rng } from './rng';

/** What a deck folder exports (decks/<name>/index.ts). */
export interface Deck {
  name: string;
  dir: string;
  defaultList: string;
  /** What the two numbers a game returns mean: [long name, short column name] for each.
   *  Default (Gale): first turn with any kill, and with counter backup. */
  metrics?: [[string, string], [string, string]];
  /** The turns shown in comparison tables (default: 6, 7 and the last turn). */
  compareTurns?: number[];
  /** Card ranking: decklist sections whose cards aren't judged (interaction is dead in a goldfish game, like
   *  counterspells), except the cards listed; and the turn the "win by" column uses (default 7). */
  rankProtect?: { sections: string[]; except?: string[]; cards?: string[] };
  rankTurn?: number;
  /** --diag: what to report per list from the games' diag() records plus "win" (the win turn, null = none).
   *  unit "%" = share of games, "turn" = a turn number, "n" = a plain number. */
  diagMetrics?: {
    label: string;
    unit: '%' | 'turn' | 'n';
    f: (rows: DiagRow[]) => number;
  }[];
  /** --hands: yes/no questions about an opening hand (per deck), reported next to the outcome. */
  handFeatures?: { label: string; f: (hand: C.CardDef[]) => boolean }[];
  /** Names the player uses in Archidekt logs as trackers, not cards (their counter is read by syncFromLog). */
  logTrackers?: string[];
  /** Tokens that are sacrificed whenever they're tapped (Food, Treasure): a tap in the log means they're gone. */
  logSacOnTap?: string[];
  /** Pod games: settings that differ from the goldfish ones (e.g. a win rule that only made sense against goldfish opponents). */
  podCfg?: (players: number) => Config;
  /** The deck handles drawing from its own empty library itself (Mike: Laboratory Maniac / Living Conundrum). */
  ownsDecking?: boolean;
  cfg: Config;
  Game: new (
    commanders: string[],
    library: string[],
    rng: Rng,
    cfg: Config,
    verbose?: boolean,
    mode?: 'any' | 'protected',
  ) => Game<unknown>;
}

export type Result = [number | null, number | null]; // the deck's two measures (see Deck.metrics), as turns
const DEFAULT_METRICS: [[string, string], [string, string]] = [
  ['Win possible (any)', ''],
  ['Win with counter backup', 'backup'],
];
/** Share of the games (0-100) where the condition holds. */
export const percentOf = (
  rows: DiagRow[],
  matches: (row: DiagRow) => boolean,
) => (100 * rows.filter(matches).length) / rows.length;

/** Average of a number taken from each game. */
export const averageOf = (rows: DiagRow[], valueOf: (row: DiagRow) => number) =>
  rows.reduce((sum, row) => sum + valueOf(row), 0) / rows.length;

/** The "Win by turn N (%)" rows every deck reports in --diag. */
export function winByTurnMetrics(
  turns: number[],
  winTurnOf: (row: DiagRow) => number,
) {
  return turns.map((turn) => ({
    label: `Win by turn ${turn} (%)`,
    unit: '%' as const,
    f: (rows: DiagRow[]) => percentOf(rows, (row) => winTurnOf(row) <= turn),
  }));
}

export type DiagRow = Record<string, number | null>;
export interface Job {
  deck: string;
  list: string;
  seeds: number[];
  cfg: Config;
  what: 'kills' | 'seen4' | 'diag' | 'hands';
  /** hands: 7 = the raw opening 7, 6 = draw 7 and bottom the least useful card (a mulligan to 6). */
  size?: number;
}
export type JobResult = {
  kills?: Result[];
  seen4?: [number | null, string[]][];
  diag?: DiagRow[];
  hands?: [number | null, string[]][];
  errors: [number, string][];
};

/** Eco mode: each worker rests after every chunk of games so that it is busy only this percent of the time. */
let DUTY = 100;
export function setDuty(percent: number): void {
  DUTY = Math.min(100, Math.max(5, percent));
}

export function defaultWorkers(): number {
  return Math.max(1, (os.availableParallelism?.() ?? os.cpus().length) - 1);
}

/** A decklist path as given, or relative to the deck's folder (e.g. lists/proposed.txt). */
export function resolveList(deck: Deck, p: string): string {
  if (fs.existsSync(p)) return p;
  const q = path.join(deck.dir, p);
  if (fs.existsSync(q)) return q;
  throw new Error(`decklist not found: ${p} (also looked in ${deck.dir})`);
}

// ---------------------------------------------------------------- playing games
export function runJob(deck: Deck, job: Job): JobResult {
  const d = C.loadDecklist(job.list);
  const out: JobResult = { errors: [] };
  if (job.what === 'seen4') out.seen4 = [];
  else if (job.what === 'diag') out.diag = [];
  else if (job.what === 'hands') out.hands = [];
  else out.kills = [];
  for (const s of job.seeds) {
    try {
      // one game gives both results: until the first kill appears the "any" and "protected" games
      // make identical choices, and the protected game records that first kill too
      if (job.what === 'hands') {
        // the opening hand is the first 7 cards (no mulligan); size 6 puts the least useful card on the bottom
        const g = new deck.Game(
          d.commanders,
          d.library,
          new Rng(s),
          job.cfg,
          false,
          'any',
        );
        let names: string[] = [];
        g.mulligan = function (this: Game<unknown>) {
          this.hand = this.library.splice(0, 7);
          if (job.size === 6) {
            let worst = this.hand[0];
            for (const c of this.hand)
              if (this.cardValue(c) < this.cardValue(worst)) worst = c;
            this.hand.splice(this.hand.indexOf(worst), 1);
            this.library.push(worst);
          }
          names = this.hand.map((c) => c.name);
        };
        const [u] = g.play();
        out.hands!.push([u, names]);
      } else if (job.what === 'diag') {
        const g = new deck.Game(
          d.commanders,
          d.library,
          new Rng(s),
          job.cfg,
          false,
          'any',
        );
        const [u] = g.play();
        out.diag!.push({ win: u, ...g.diag() });
      } else if (job.what === 'seen4') {
        const g = new deck.Game(
          d.commanders,
          d.library,
          new Rng(s),
          job.cfg,
          false,
          'any',
        );
        const [u] = g.play();
        if (g.seen4 !== null) out.seen4!.push([u, [...g.seen4]]);
      } else {
        const g = new deck.Game(
          d.commanders,
          d.library,
          new Rng(s),
          job.cfg,
          false,
          'protected',
        );
        out.kills!.push(g.play());
      }
    } catch (e) {
      // a simulator bug in one game must not kill the whole run
      out.errors.push([
        s,
        e instanceof Error ? (e.stack ?? e.message) : String(e),
      ]);
    }
  }
  return out;
}

/** Play seeds 1..n in worker threads; the same bundle (dist/sim.js) runs as each worker. */
export async function simulate(
  deck: Deck,
  list: string,
  n: number,
  cfg: Config,
  workers: number,
  what: 'kills' | 'seen4' | 'diag' | 'hands' = 'kills',
  size = 7,
): Promise<JobResult> {
  const seeds = Array.from({ length: n }, (_, i) => i + 1);
  const chunk = Math.max(1, Math.floor(n / (workers * 8)));
  const jobs: Job[] = [];
  for (let i = 0; i < n; i += chunk)
    jobs.push({
      deck: deck.name,
      list,
      seeds: seeds.slice(i, i + chunk),
      cfg,
      what,
      size,
    });
  const results: JobResult[] = new Array(jobs.length);
  let next = 0;
  const pool = Array.from(
    { length: Math.min(workers, jobs.length) },
    () => new Worker(__filename, { workerData: 'sim-worker' }),
  );
  await Promise.all(
    pool.map(
      (w) =>
        new Promise<void>((resolve, reject) => {
          const give = () => {
            if (next >= jobs.length) {
              w.terminate().then(() => resolve());
              return;
            }
            const idx = next++;
            const t0 = Date.now();
            w.once('message', (r: JobResult) => {
              results[idx] = r;
              const rest =
                DUTY < 100 ? (Date.now() - t0) * (100 / DUTY - 1) : 0;
              if (rest > 1) setTimeout(give, rest);
              else give();
            });
            w.postMessage(jobs[idx]);
          };
          w.on('error', reject);
          give();
        }),
    ),
  );
  const all: JobResult = { errors: [] };
  if (what === 'seen4') all.seen4 = results.flatMap((r) => r.seen4 ?? []);
  else if (what === 'diag') all.diag = results.flatMap((r) => r.diag ?? []);
  else if (what === 'hands') all.hands = results.flatMap((r) => r.hands ?? []);
  else all.kills = results.flatMap((r) => r.kills ?? []);
  all.errors = results.flatMap((r) => r.errors);
  if (all.errors.length) {
    console.log(
      `!! ${all.errors.length} game(s) hit a simulator bug and were skipped (seeds ` +
        `${all.errors
          .slice(0, 10)
          .map((e) => e[0])
          .join(', ')}). First error:\n${all.errors[0][1]}`,
    );
  }
  return all;
}

/** --diag: the deck's own measures for each list, on the same seeds (differences to the first list in brackets). */
export function printDiag(
  deck: Deck,
  names: string[],
  rows: DiagRow[][],
  n: number,
): void {
  const ms = deck.diagMetrics ?? [];
  const w = Math.max(...ms.map((m) => m.label.length)) + 2;
  console.log(`${n} games each, same seeds. Noise: about +/-2 points for a %, +/-0.1 for a turn.
`);
  console.log(
    ''.padEnd(w) + names.map((x) => x.slice(0, 18).padStart(18)).join(''),
  );
  for (const m of ms) {
    const vals = rows.map((r) => m.f(r));
    const cells = vals.map((v, i) => {
      const txt = m.unit === '%' ? v.toFixed(1) : v.toFixed(2);
      const d =
        i === 0
          ? ''
          : ` (${v - vals[0] >= 0 ? '+' : ''}${(v - vals[0]).toFixed(m.unit === '%' ? 1 : 2)})`;
      return (txt + d).padStart(18);
    });
    console.log(m.label.padEnd(w) + cells.join(''));
  }
}

/** Does a land make this colour? (in cards.ts; kept here for the decks that import it from the runner) */
export const landMakes = C.landMakes;

/** --hands: how opening hands do, by land count and by what is in them (no mulligans; the sim's keep rule is 2-5 lands). */
export function printHands(
  deck: Deck,
  rows7: [number | null, string[]][],
  rows6: [number | null, string[]][],
  cfg: Config,
): void {
  const T = (cfg.max_turn as number) + 1;
  const KT = deck.rankTurn ?? 7;
  const turn = (u: number | null) => (u === null ? T : u);
  const mean = (xs: number[]) =>
    xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN;
  const winBy = (xs: number[]) =>
    xs.length ? (100 * xs.filter((x) => x <= KT).length) / xs.length : NaN;
  const cards = (names: string[]) => names.map((n) => C.get(n));
  const nLands = (names: string[]) =>
    cards(names).filter((c) => c.land !== null || c.mdfcLand !== null).length;
  const f1 = (x: number, w = 5) =>
    (Number.isNaN(x) ? '-' : x.toFixed(1)).padStart(w);
  const f2 = (x: number, w = 5) =>
    (Number.isNaN(x) ? '-' : x.toFixed(2)).padStart(w);
  const all = rows7.map(([u, h]) => ({ t: turn(u), h, n: nLands(h) }));
  const kept = all.filter((r) => r.n >= 2 && r.n <= 5);
  console.log(
    `${all.length} raw opening hands of 7 (no mulligans). "avg turn" = the turn you win (no win by turn ${T - 1} counts as ${T}); "win by T${KT}" in %. Lower avg turn is better.\n`,
  );
  console.log('lands in the 7   share    avg turn   win by T' + KT);
  for (let n = 0; n <= 7; n++) {
    const g = all.filter((r) => r.n === n);
    console.log(
      `  ${n} lands      ${f1((100 * g.length) / all.length, 5)}%   ${f2(mean(g.map((r) => r.t)), 6)}     ${f1(winBy(g.map((r) => r.t)), 5)}`,
    );
  }
  const base = mean(kept.map((r) => r.t));
  console.log(
    `  2-5 lands (the sim's keep rule)  ${f1((100 * kept.length) / all.length)}%   ${f2(base, 6)}     ${f1(winBy(kept.map((r) => r.t)), 5)}`,
  );
  const six = rows6.map(([u]) => turn(u));
  console.log(
    `  a mulligan to 6 (draw 7, bottom the worst, kept whatever it is): avg turn ${f2(mean(six))}, win by T${KT} ${f1(winBy(six))}%`,
  );
  console.log(
    `  all raw 7s (what the free mulligan gives, before any further mulligan): avg turn ${f2(mean(all.map((r) => r.t)))}`,
  );

  const spell = (c: C.CardDef) => c.land === null && c.mdfcLand === null;
  const generic: { label: string; f: (hand: C.CardDef[]) => boolean }[] = [
    {
      label: 'a spell costing 1-2',
      f: (h) => h.some((c) => spell(c) && c.mv >= 1 && c.mv <= 2),
    },
    {
      label: 'two or more spells costing 1-3',
      f: (h) => h.filter((c) => spell(c) && c.mv >= 1 && c.mv <= 3).length >= 2,
    },
    {
      label: 'no spell costing 3 or less',
      f: (h) => !h.some((c) => spell(c) && c.mv <= 3),
    },
  ];
  const feats = [...generic, ...(deck.handFeatures ?? [])];
  if (feats.length) {
    console.log(
      `\nAmong hands with 2-5 lands (avg turn; a difference under about 0.1 is noise):`,
    );
    console.log('feature'.padEnd(64) + 'share   with     without  gain');
    for (const ft of feats) {
      const w = kept.filter((r) => ft.f(cards(r.h))),
        wo = kept.filter((r) => !ft.f(cards(r.h)));
      const a = mean(w.map((r) => r.t)),
        b = mean(wo.map((r) => r.t));
      console.log(
        ft.label.padEnd(64) +
          `${f1((100 * w.length) / kept.length)}%  ${f2(a, 6)}  ${f2(b, 6)}  ${(b - a >= 0 ? '+' : '') + (b - a).toFixed(2)}`,
      );
    }
    // land count x the first feature set: is a 2-lander OK with help? (best single features first)
  }

  // cards in the opening hand (2-5 lands, nonlands): how much sooner you win with the card in your first 7
  const names = new Set<string>();
  for (const r of kept)
    for (const n of r.h) if (C.get(n).land === null) names.add(n);
  const rowsC: [string, number, number][] = [];
  for (const n of names) {
    const w = kept.filter((r) => r.h.includes(n)).map((r) => r.t),
      wo = kept.filter((r) => !r.h.includes(n)).map((r) => r.t);
    if (w.length >= 150) rowsC.push([n, w.length, mean(wo) - mean(w)]);
  }
  rowsC.sort((a, b) => b[2] - a[2]);
  const show = (r: [string, number, number]) =>
    console.log(
      `  ${r[0].padEnd(40)} in ${String(r[1]).padStart(5)} hands  ${(r[2] >= 0 ? '+' : '') + r[2].toFixed(2)} turns sooner`,
    );
  console.log('\nCards that help most in the opening 7 (2-5 land hands):');
  rowsC.slice(0, 14).forEach(show);
  console.log('Cards that help least (or are a drag) in the opening 7:');
  rowsC.slice(-8).forEach(show);
}

export function checkList(file: string, fetchHint: string): void {
  const d = C.loadDecklist(file);
  const total = d.commanders.length + d.library.length;
  if (d.missing.length) {
    console.log(`!! ${file}: no card data for: ${d.missing.join(', ')}`);
    console.log('   Run:  ' + fetchHint);
    process.exit(1);
  }
  if (d.generic.length)
    console.log(
      `Note (${path.basename(file)}): these cards have no special rules in the simulator and are played ` +
        `generically: ${d.generic.join(', ')}`,
    );
  if (total !== 100)
    console.log(
      `Note (${path.basename(file)}): deck has ${total} cards (expected 100).`,
    );
}

// ---------------------------------------------------------------- tables
export interface Table {
  on: { any: number[]; prot: number[] }; // % of games whose first kill is on turn t (index t)
  avg: { any: number; prot: number };
  total: { any: number; prot: number };
}

export function table(results: Result[], maxTurn: number): Table {
  const n = results.length;
  const t: Table = {
    on: { any: [], prot: [] },
    avg: { any: NaN, prot: NaN },
    total: { any: 0, prot: 0 },
  };
  (['any', 'prot'] as const).forEach((label, idx) => {
    const turns = results.map((r) => r[idx]);
    for (let k = 0; k <= maxTurn; k++)
      t.on[label][k] = (turns.filter((x) => x === k).length / n) * 100;
    const won = turns.filter((x): x is number => x !== null);
    t.avg[label] = won.length
      ? won.reduce((a, b) => a + b, 0) / won.length
      : NaN;
    t.total[label] = (won.length / n) * 100;
  });
  return t;
}

export const cum = (t: Table, label: 'any' | 'prot', turn: number) =>
  t.on[label].slice(1, turn + 1).reduce((a, b) => a + b, 0);

export const noise = (n: number) => 2 * Math.sqrt(0.25 / n) * 100 * 1.41;

const f1 = (x: number) => x.toFixed(1);
const pad = (s: string, w: number) => s.padStart(w);

export function printSingle(
  name: string,
  t: Table,
  cfg: Config,
  n: number,
  metrics = DEFAULT_METRICS,
): void {
  const T = cfg.max_turn as number;
  console.log(
    `\n${name}  (${n} games, ${cfg.opponents} goldfish opponents at ${cfg.opp_life} life)`,
  );
  console.log(`            |   ${metrics[0][0].padEnd(22)}|  ${metrics[1][0]}`);
  console.log('  Turn      |   on turn   by turn     |   on turn   by turn');
  console.log(
    '  ----------+-------------------------+-------------------------',
  );
  let ca = 0,
    cp = 0;
  for (let k = 1; k <= T; k++) {
    const a = t.on.any[k],
      p = t.on.prot[k];
    ca += a;
    cp += p;
    if (k < 3 && a === 0 && p === 0) continue;
    console.log(
      `  Turn ${String(k).padEnd(4)} |   ${pad(f1(a), 6)}%   ${pad(f1(ca), 6)}%    |   ${pad(f1(p), 6)}%   ${pad(f1(cp), 6)}%`,
    );
  }
  console.log(
    '  ----------+-------------------------+-------------------------',
  );
  console.log(
    `  Avg turn  |   ${pad(t.avg.any.toFixed(2), 6)}               |   ${pad(t.avg.prot.toFixed(2), 6)}   (games that won by T${T})`,
  );
  console.log(
    `  No win T${T}|   ${pad(f1(100 - t.total.any), 6)}%              |   ${pad(f1(100 - t.total.prot), 6)}%`,
  );
}

/** First list is the base; every other list is shown as a difference to it. */
export function printCompare(
  names: string[],
  tabs: Table[],
  cfg: Config,
  n: number,
  metrics = DEFAULT_METRICS,
  turns?: number[],
): void {
  const T = cfg.max_turn as number;
  const a = metrics[0][1] ? metrics[0][1] + ' ' : '',
    b = metrics[1][1] + ' ';
  const tt = turns ?? [6, 7, T];
  const cols = (
    [
      ...tt.map((t) => [`${a}by T${t}`, 'any', t]),
      [`${b}T${tt[tt.length - 2]}`, 'prot', tt[tt.length - 2]],
      [`${b}T${T}`, 'prot', T],
    ] as [string, 'any' | 'prot', number][]
  ).filter((c) => c[2] <= T);
  const base = tabs[0];
  const w = Math.max(24, ...names.map((x) => path.basename(x).length + 1));
  console.log(
    `\n${n} games each, same seeds. Difference to ${path.basename(names[0])} in brackets ` +
      `(about +/-${f1(noise(n))} is noise).`,
  );
  console.log(
    `${'list'.padEnd(w)} ` +
      cols.map((c) => pad(c[0], 13)).join(' ') +
      ` ${pad('avg turn', 9)}`,
  );
  names.forEach((name, i) => {
    const t = tabs[i];
    const cells = cols.map(([, lab, k]) => {
      const v = cum(t, lab, k),
        bv = cum(base, lab, k);
      const d = v - bv;
      return (
        pad(f1(v), 5) +
        (t === base ? '' : ` (${(d >= 0 ? '+' : '') + f1(d)})`.padStart(7))
      );
    });
    console.log(
      `${path.basename(name).padEnd(w)} ` +
        cells.map((c) => pad(c, 13)).join(' ') +
        ` ${pad(t.avg.any.toFixed(2), 9)}`,
    );
  });
}

// ---------------------------------------------------------------- card ranking and cut tests
export async function rank(
  deck: Deck,
  list: string,
  n: number,
  cfg: Config,
  workers: number,
): Promise<void> {
  const res = (await simulate(deck, list, n, cfg, workers, 'seen4')).seen4!;
  const dl = C.loadDecklist(list);
  const lib = dl.library;
  const T = cfg.max_turn as number;
  const KT = deck.rankTurn ?? 7;
  const prot = deck.rankProtect;
  const isProtected = (name: string) =>
    !!prot &&
    ((prot.cards ?? []).includes(name) ||
      (prot.sections.includes(dl.sections[name] ?? '') &&
        !(prot.except ?? []).includes(name)));
  const turn = (u: number | null) => (u === null ? T + 1 : u);
  const rows: [number, number, number, string][] = [];
  for (const name of [...new Set(lib)].sort()) {
    const a = res.filter(([, s]) => s.includes(name)).map(([u]) => turn(u));
    const b = res.filter(([, s]) => !s.includes(name)).map(([u]) => turn(u));
    if (a.length < 30 || b.length < 30) continue;
    const k7 = (xs: number[]) =>
      (xs.filter((x) => x <= KT).length / xs.length) * 100;
    const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
    rows.push([mean(b) - mean(a), k7(a) - k7(b), a.length, name]);
  }
  rows.sort((x, y) => y[0] - x[0] || y[1] - x[1]);
  console.log(
    `${res.length} games. 'Faster' = how many turns sooner you kill on average when you had seen the card by turn 4`,
  );
  console.log(
    `(no kill by turn ${T} counts as turn ${T + 1}).  Noise is roughly +/-0.08 turns and +/-3 points.`,
  );
  console.log(
    'This shows correlation, not proof: test a low-ranked card with a cut test before cutting it.\n',
  );
  const line = ([d, k, cnt, name]: [number, number, number, string]) =>
    console.log(
      `  ${name.padEnd(38)} ${pad((d >= 0 ? '+' : '') + d.toFixed(2), 7)} ${pad((k >= 0 ? '+' : '') + f1(k), 10)}% ` +
        `${pad(((cnt / res.length) * 100).toFixed(0), 7)}%`,
    );
  console.log(
    `  ${'card'.padEnd(38)} ${pad('faster', 7)} ${pad(`win by T${KT}`, 11)} ${pad('seen in', 8)}`,
  );
  for (const r of rows) if (!isProtected(r[3])) line(r);
  const pr = rows.filter((r) => isProtected(r[3]));
  if (pr.length) {
    console.log(
      `
  Not judged (${prot!.sections.join(' / ')}: interaction does nothing against goldfish opponents, like ` +
        'counterspells; keep or cut them on judgement):',
    );
    for (const r of pr) line(r);
  }
}

export function cutVariant(
  basePath: string,
  card: string,
  replace: string,
  outPath: string,
): void {
  const lines = fs.readFileSync(basePath, 'utf-8').split(/\r?\n/);
  const out: string[] = [];
  let removed = false,
    added = false;
  for (const ln of lines) {
    const m = /^\s*(\d+)x?\s+(.+?)\s*$/.exec(ln);
    if (m && !removed && m[2] === card) {
      const k = parseInt(m[1], 10);
      removed = true;
      if (k > 1) out.push(`${k - 1}x ${card}`);
      continue;
    }
    if (m && !added && m[2] === replace) {
      out.push(`${parseInt(m[1], 10) + 1}x ${replace}`);
      added = true;
      continue;
    }
    out.push(ln);
  }
  if (!removed) throw new Error(`'${card}' is not in ${basePath}`);
  if (!added) out.push(`1x ${replace}`);
  fs.writeFileSync(outPath, out.join('\n').replace(/\n*$/, '\n'), 'utf-8');
}

export async function cuts(
  deck: Deck,
  list: string,
  cards: string[],
  replace: string,
  n: number,
  cfg: Config,
  workers: number,
): Promise<void> {
  const outDir = path.join(deck.dir, 'lists', 'cuts');
  fs.mkdirSync(outDir, { recursive: true });
  const names = [list];
  const tabs = [
    table(
      (await simulate(deck, list, n, cfg, workers)).kills!,
      cfg.max_turn as number,
    ),
  ];
  for (const card of cards) {
    const p = path.join(
      outDir,
      'cut_' +
        card.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '') +
        '.txt',
    );
    cutVariant(list, card, replace, p);
    names.push(p);
    tabs.push(
      table(
        (await simulate(deck, p, n, cfg, workers)).kills!,
        cfg.max_turn as number,
      ),
    );
    console.log(`  done: cut ${card}`);
  }
  console.log(
    `\nEach card replaced by 1 ${replace}. A difference near 0 or positive means the land does as well.`,
  );
  printCompare(names, tabs, cfg, n, deck.metrics, deck.compareTurns);
  console.log(`\nVariant lists are saved in ${outDir}.`);
}

export function trace(
  deck: Deck,
  list: string,
  cfg: Config,
  seed: number,
  count: number,
  mode: 'any' | 'protected',
): void {
  const d = C.loadDecklist(list);
  for (let s = seed; s < seed + count; s++) {
    const g = new deck.Game(
      d.commanders,
      d.library,
      new Rng(s),
      cfg,
      true,
      mode,
    );
    const [u, p] = g.play();
    console.log(
      `\n===== game seed ${s}: any-win turn ${u}, protected-win turn ${p}`,
    );
    console.log(g.log.join('\n'));
  }
}
