/**
 * `npm run verify`: every check a change must pass, in one go. It ends with VERIFY OK or VERIFY BAD.
 *
 *   npm run verify                 the checks the change needs, at full power
 *   npm run verify -- --eco        the simulations in power-save mode (slower, same results)
 *   npm run verify -- --full       every check, whatever changed
 *   npm run verify -- --quick      for the edit-test loop: regress on seeds 1-100 only and no pod run; run the
 *                                  plain verify before a commit
 *   npm run verify -- --jobs N     how many checks run at once (default 4, 2 with --eco)
 *   npm run verify -- --record-pod save the pod report as the new baseline (after a change that is meant to alter it)
 *
 * The checks: the type-check, the formatting, and for every deck `--regress check` (must print IDENTICAL) and
 * `--test` (no BAD line); then the pod tests, the app's tests, and a pod run with fixed seeds whose report must equal the saved one
 * (regress_baseline/pod.txt), because `--regress` does not cover pod games.
 *
 * The simulations are the slow part, so they run only where the change can alter results: it looks at the files
 * changed since the branch left main (committed, uncommitted and new). A change to the shared simulator (engine/,
 * cli/, sim.ts, the card data, ...) checks every deck; a change inside decks/<name>/ checks that deck's regress and
 * --test (and the pod run if it plays in it); the pod and app tests run for any simulator or deck change (the app's
 * also for app/); a change elsewhere (the docs) runs only the type-check and the formatting. The page's own build
 * and tests (`ng build`, `ng test` in app/web/) run when the page, app/api-types.ts or shared/ changed.
 * A deck whose regress runs gets `--test --no-kill-misses`: regress checks its 600 games for kill misses instead of
 * --test playing 300 of them again.
 * Each check prints how long it took. The times are kept in dist/verify-times.json, and the next run starts the
 * slowest checks first, so the last ones to finish are short.
 */
import { spawn, spawnSync } from 'node:child_process';
import * as os from 'node:os';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_FOLDER = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const BUNDLE = path.join('dist', 'sim.js');
const POD_BASELINE_FILE = path.join('regress_baseline', 'pod.txt');
/** Each check's seconds in the last run that ran it (for the order: slowest first). Not in git. */
const TIMES_FILE = path.join(PROJECT_FOLDER, 'dist', 'verify-times.json');
/** verify --quick: the regress checks play only these seeds. */
const QUICK_REGRESS_SEEDS = 100;
/** The decks in the fixed-seed pod run (its report is regress_baseline/pod.txt: change it only on purpose). */
const POD_DECKS = ['gale', 'meren', 'samfrodo', 'aesi', 'edgar'];
const POD_ARGUMENTS = ['pod', ...POD_DECKS, '-n', '200', '--no-log'];
/** Files and folders outside the deck folders that can change the results of every deck. */
const SHARED_SIMULATOR_PATHS = [
  'engine/',
  'shared/',
  'cli/',
  'sim.ts',
  'data/',
  'decks/index.ts',
  'package.json',
  'package-lock.json',
];

const options = process.argv.slice(2);
const powerSaveOptions = options.includes('--eco') ? ['--eco'] : [];
const isRecordingPod = options.includes('--record-pod');
const isFullRun = options.includes('--full');
const isQuickRun = options.includes('--quick') && !isFullRun;
const verifyStartTime = Date.now();
/** How many checks run at once: --jobs N, else 4 (2 with --eco), never more than the cores. */
const jobsOption = options.indexOf('--jobs');
const checksAtOnce = Math.max(
  1,
  Math.min(
    os.cpus().length,
    jobsOption >= 0
      ? Number(options[jobsOption + 1])
      : options.includes('--eco')
        ? 2
        : 4,
  ),
);

/** Runs a command in the project folder. Returns its exit code, everything it printed and how long it took. */
function run(command, commandArguments) {
  const startTime = Date.now();
  const result = spawnSync(command, commandArguments, {
    cwd: PROJECT_FOLDER,
    encoding: 'utf-8',
    shell: process.platform === 'win32', // npm is a .cmd file on Windows
    maxBuffer: 64 * 1024 * 1024,
  });
  return {
    exitCode: result.status ?? 1,
    output: (result.stdout ?? '') + (result.stderr ?? ''),
    seconds: Math.round((Date.now() - startTime) / 1000),
  };
}

/** Like run, but several can go at once. */
function runAsync(command, commandArguments) {
  const startTime = Date.now();
  return new Promise((resolve) => {
    const child = spawn(command, commandArguments, {
      cwd: PROJECT_FOLDER,
      shell: process.platform === 'win32',
    });
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    child.on('close', (exitCode) =>
      resolve({
        exitCode: exitCode ?? 1,
        output,
        seconds: Math.round((Date.now() - startTime) / 1000),
      }),
    );
  });
}

const runSimulator = (simulatorArguments) =>
  run('node', ['--enable-source-maps', BUNDLE, ...simulatorArguments]);
const runSimulatorAsync = (simulatorArguments) =>
  runAsync('node', ['--enable-source-maps', BUNDLE, ...simulatorArguments]);

let failedChecks = 0;
/** Prints one line for a check with the seconds it took, and what it printed if it failed. */
function report(label, isGood, commandRun) {
  const time = commandRun ? ` (${commandRun.seconds}s)` : '';
  console.log(`${isGood ? 'OK ' : 'BAD'} ${label}${time}`);
  if (!isGood) {
    failedChecks++;
    const output = commandRun?.output ?? '';
    const lastLines = output.trim().split(/\r?\n/).slice(-15);
    for (const line of lastLines) console.log(`      ${line}`);
  }
}

/** Runs the checks `maxAtOnce` at a time, slowest first (by the last run's times: the last ones to finish are
 *  then short; a check without a time yet goes first, as it may be slow), then reports them in the order they
 *  were listed. A check is { key, run }: run is an async function returning the reports of its result,
 *  [{ label, isGood, commandRun }]. Returns the seconds each check took, by its key. */
async function runChecks(checks, maxAtOnce) {
  const lastTimes = readLastTimes();
  const lastSeconds = (index) => lastTimes[checks[index].key] ?? 1e9;
  const startOrder = checks
    .map((_, index) => index)
    .sort((first, second) => lastSeconds(second) - lastSeconds(first));
  const results = new Array(checks.length);
  const secondsByKey = {};
  let nextCheck = 0;
  const worker = async () => {
    while (nextCheck < checks.length) {
      const index = startOrder[nextCheck++];
      const startTime = Date.now();
      results[index] = await checks[index].run();
      secondsByKey[checks[index].key] = Math.round(
        (Date.now() - startTime) / 1000,
      );
    }
  };
  await Promise.all(Array.from({ length: maxAtOnce }, worker));
  for (const reports of results)
    for (const { label, isGood, commandRun } of reports)
      report(label, isGood, commandRun);
  return secondsByKey;
}

/** The seconds each check took when it last ran ({} before the first run). */
function readLastTimes() {
  try {
    return JSON.parse(fs.readFileSync(TIMES_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function saveTimes(secondsByKey) {
  try {
    const times = { ...readLastTimes(), ...secondsByKey };
    fs.writeFileSync(TIMES_FILE, JSON.stringify(times, null, 1) + '\n');
  } catch {
    // only the order of the next run depends on it
  }
}

/** The files changed since this branch left main, with forward slashes; null when git cannot tell. */
function filesChangedSinceMain() {
  const mergeBase = run('git', ['merge-base', 'HEAD', 'main']);
  if (mergeBase.exitCode !== 0) return null;
  const changed = run('git', ['diff', '--name-only', mergeBase.output.trim()]);
  const untracked = run('git', ['ls-files', '--others', '--exclude-standard']);
  if (changed.exitCode !== 0 || untracked.exitCode !== 0) return null;
  return (changed.output + '\n' + untracked.output)
    .split(/\r?\n/)
    .map((file) => file.trim().replace(/\\/g, '/'))
    .filter(Boolean);
}

/** Is the file part of the shared simulator, or under decks/ but in no deck's folder? */
function isSharedSimulatorFile(file) {
  if (SHARED_SIMULATOR_PATHS.some((shared) => file.startsWith(shared)))
    return true;
  const [topFolder, deckFolder, fileInDeck] = file.split('/');
  return topFolder === 'decks' && fileInDeck === undefined && deckFolder !== '';
}

/** The simulations the change needs: the decks whose regress check and --test it needs, the pod run, and the
 *  pod and app tests. */
function chooseSimulationChecks(changedFiles) {
  const everything = {
    decksToRegress: DECKS_WITH_BASELINE,
    decksToTest: DECKS_WITH_TESTS,
    needsPodRun: true,
    needsPodTests: true,
    needsAppTests: true,
  };
  if (isFullRun || changedFiles === null) return everything;
  if (changedFiles.some(isSharedSimulatorFile)) return everything;
  const isDeckChanged = (deck) =>
    changedFiles.some(
      (file) =>
        file.startsWith(`decks/${deck}/`) ||
        file === `regress_baseline/${deck}.json`,
    );
  const isAnyDeckChanged = DECKS_WITH_TESTS.some(isDeckChanged);
  return {
    decksToRegress: DECKS_WITH_BASELINE.filter(isDeckChanged),
    decksToTest: DECKS_WITH_TESTS.filter(isDeckChanged),
    needsPodRun:
      isRecordingPod ||
      changedFiles.includes(POD_BASELINE_FILE.replace(/\\/g, '/')) ||
      POD_DECKS.some(isDeckChanged),
    // the pod tests and the app's (its deck list, runs and logs) play several decks
    needsPodTests: isAnyDeckChanged,
    needsAppTests:
      isAnyDeckChanged ||
      changedFiles.some(
        (file) => file.startsWith('app/') && !file.startsWith('app/web/'),
      ),
  };
}

/** The pod report without the lines that differ from run to run (the time taken, the power-save note). */
function podReportOf(output) {
  return output
    .split(/\r?\n/)
    .filter((line) => !line.startsWith('(') && !line.startsWith('eco mode:'))
    .join('\n')
    .trim();
}

async function checkPodRun() {
  const podRun = await runSimulatorAsync([
    ...POD_ARGUMENTS,
    ...powerSaveOptions,
  ]);
  const podReport = podReportOf(podRun.output);
  const baselineFile = path.join(PROJECT_FOLDER, POD_BASELINE_FILE);
  if (isRecordingPod) {
    fs.writeFileSync(baselineFile, podReport + '\n', 'utf-8');
    return [
      {
        label: `recorded the pod report to ${POD_BASELINE_FILE}`,
        isGood: true,
        commandRun: podRun,
      },
    ];
  }
  if (!fs.existsSync(baselineFile))
    return [
      {
        label: `pod: no baseline yet (npm run verify -- --record-pod)`,
        isGood: false,
      },
    ];
  const savedReport = fs.readFileSync(baselineFile, 'utf-8').trim();
  return [
    {
      label: `pod: 200 games with fixed seeds give the saved report (${POD_BASELINE_FILE})`,
      isGood:
        podRun.exitCode === 0 &&
        podReport === savedReport.replace(/\r\n/g, '\n'),
      commandRun: podRun,
    },
  ];
}

/** Files the app's page builds from: the page itself and the shapes and code it shares with the Node side. */
const PAGE_PATHS = ['app/web/', 'app/api-types.ts', 'shared/'];

/** The page's build and tests (Angular, a few seconds) when the change can touch the page. */
function needsPageChecks(changedFiles) {
  if (isFullRun || changedFiles === null) return true;
  return changedFiles.some((file) =>
    PAGE_PATHS.some((pagePath) => file.startsWith(pagePath)),
  );
}

/** The build, then the tests: one after the other, as the tests may use what the build made. */
async function checkPage() {
  const pageBuild = await runAsync('npm', [
    '--prefix',
    'app/web',
    'run',
    '-s',
    'build',
  ]);
  const pageTests = await runAsync('npm', [
    '--prefix',
    'app/web',
    'run',
    '-s',
    'test',
    '--',
    '--watch=false',
  ]);
  return [
    {
      label: 'page: ng build',
      isGood: pageBuild.exitCode === 0,
      commandRun: pageBuild,
    },
    {
      label: 'page: ng test',
      isGood: pageTests.exitCode === 0,
      commandRun: pageTests,
    },
  ];
}

/** The deck names from the simulator itself (decks/index.ts): those with a regress baseline, and all of them. */
function listDecks() {
  const listing = runSimulator(['--list-decks']);
  if (listing.exitCode !== 0) {
    report('list the decks (node dist/sim.js --list-decks)', false, listing);
    process.exit(1);
  }
  return JSON.parse(listing.output.trim().split(/\r?\n/).pop());
}

// the build comes first: the deck names come from it
const build = run('npm', ['run', '-s', 'build']);
report('build', build.exitCode === 0, build);
if (build.exitCode !== 0) {
  console.log('\nVERIFY BAD (the build failed)');
  process.exit(1);
}
const { withBaseline: DECKS_WITH_BASELINE, all: DECKS_WITH_TESTS } =
  listDecks();

const changedFiles = filesChangedSinceMain();
const {
  decksToRegress,
  decksToTest,
  needsPodTests,
  needsAppTests,
  needsPodRun: podRunNeeded,
} = chooseSimulationChecks(changedFiles);
const needsPodRun = podRunNeeded && !isQuickRun;
const runsPageChecks = needsPageChecks(changedFiles);
const skipped = [
  ...DECKS_WITH_BASELINE.filter((deck) => !decksToRegress.includes(deck)).map(
    (deck) => `${deck} --regress`,
  ),
  ...DECKS_WITH_TESTS.filter((deck) => !decksToTest.includes(deck)).map(
    (deck) => `${deck} --test`,
  ),
  ...(needsPodTests ? [] : ['pod --test']),
  ...(needsAppTests ? [] : ['app --test']),
  ...(podRunNeeded ? [] : ['the pod run']),
  ...(runsPageChecks ? [] : ['the page build and tests']),
];
if (skipped.length)
  console.log(
    `Skipped, as the change cannot alter their results (--full runs them): ${skipped.join(', ')}\n`,
  );
if (isQuickRun)
  console.log(
    `Quick: regress on seeds 1-${QUICK_REGRESS_SEEDS} only` +
      (podRunNeeded ? ', no pod run' : '') +
      '. Run the plain verify before a commit.\n',
  );

/** One check that is a single command: its label, the command, and what makes it good. */
const commandCheck = (label, startCommand, isGoodOutput) => ({
  key: label,
  run: async () => {
    const commandRun = await startCommand();
    return [{ label, isGood: isGoodOutput(commandRun), commandRun }];
  },
});
const hasNoBadLine = (commandRun) =>
  commandRun.exitCode === 0 && !/^BAD/m.test(commandRun.output);
const regressSeedOptions = isQuickRun
  ? ['-n', String(QUICK_REGRESS_SEEDS)]
  : [];

const checks = [
  commandCheck(
    'type-check (npm run check)',
    () => runAsync('npm', ['run', '-s', 'check']),
    (commandRun) => commandRun.exitCode === 0,
  ),
  commandCheck(
    'formatting (npm run format:check; fix with npm run format)',
    () => runAsync('npm', ['run', '-s', 'format:check']),
    (commandRun) => commandRun.exitCode === 0,
  ),
  ...decksToRegress.map((deck) =>
    commandCheck(
      `${deck}: --regress check is IDENTICAL` +
        (isQuickRun ? ` (seeds 1-${QUICK_REGRESS_SEEDS})` : '') +
        ', no kill misses',
      () =>
        runSimulatorAsync([
          deck,
          '--regress',
          'check',
          ...regressSeedOptions,
          ...powerSaveOptions,
        ]),
      (commandRun) =>
        commandRun.output.includes('IDENTICAL') && hasNoBadLine(commandRun),
    ),
  ),
  ...decksToTest.map((deck) => {
    // the deck's regress checks its games for kill misses, on more seeds
    const killMissOptions = decksToRegress.includes(deck)
      ? ['--no-kill-misses']
      : [];
    return commandCheck(
      `${deck}: --test`,
      () => runSimulatorAsync([deck, '--test', ...killMissOptions]),
      hasNoBadLine,
    );
  }),
];
if (needsPodTests)
  checks.push(
    commandCheck(
      'pod: --test',
      () => runSimulatorAsync(['pod', '--test']),
      hasNoBadLine,
    ),
  );
if (needsAppTests)
  checks.push(
    commandCheck(
      'app: --test',
      () => runSimulatorAsync(['app', '--test']),
      hasNoBadLine,
    ),
  );
if (needsPodRun) checks.push({ key: 'pod run', run: checkPodRun });
if (runsPageChecks) checks.push({ key: 'page', run: checkPage });

saveTimes(await runChecks(checks, checksAtOnce));

const totalSeconds = Math.round((Date.now() - verifyStartTime) / 1000);
console.log(
  failedChecks === 0
    ? `\nVERIFY OK (${isQuickRun ? 'quick, ' : ''}${totalSeconds}s)`
    : `\nVERIFY BAD (${failedChecks} failed, ${totalSeconds}s)`,
);
process.exit(failedChecks === 0 ? 0 : 1);
