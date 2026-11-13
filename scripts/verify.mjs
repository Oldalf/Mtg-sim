/**
 * `npm run verify`: every check a change must pass, in one go. It ends with VERIFY OK or VERIFY BAD.
 *
 *   npm run verify                 the checks the change needs, at full power
 *   npm run verify -- --eco        the simulations in power-save mode (slower, same results)
 *   npm run verify -- --full       every check, whatever changed
 *   npm run verify -- --record-pod save the pod report as the new baseline (after a change that is meant to alter it)
 *
 * The checks: the type-check, the formatting, and for every deck `--regress check` (must print IDENTICAL) and
 * `--test` (no BAD line); then the pod tests, the app's tests, and a pod run with fixed seeds whose report must equal the saved one
 * (regress_baseline/pod.txt), because `--regress` does not cover pod games.
 *
 * The regress checks and the pod run are the slow ones, so they run only where the change can alter results: it
 * looks at the files changed since the branch left main (committed, uncommitted and new). A change to the shared
 * simulator (engine/, cli/, sim.ts, the card data, ...) checks every deck; a change inside decks/<name>/ checks that
 * deck (and the pod run if it plays in it); a change elsewhere (the app, the docs) checks none. Each check prints
 * how long it took.
 */
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_FOLDER = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const BUNDLE = path.join('dist', 'sim.js');
const POD_BASELINE_FILE = path.join('regress_baseline', 'pod.txt');
const DECKS_WITH_BASELINE = [
  'gale',
  'meren',
  'samfrodo',
  'aesi',
  'mike',
  'codie',
];
const DECKS_WITH_TESTS = [...DECKS_WITH_BASELINE, 'goldfish'];
const POD_DECKS = ['gale', 'meren', 'samfrodo', 'aesi'];
const POD_ARGUMENTS = ['pod', ...POD_DECKS, '-n', '200', '--no-log'];
/** Files and folders outside the deck folders that can change the results of every deck. */
const SHARED_SIMULATOR_PATHS = [
  'engine/',
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
const verifyStartTime = Date.now();

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

const runSimulator = (simulatorArguments) =>
  run('node', ['--enable-source-maps', BUNDLE, ...simulatorArguments]);

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

/** The decks whose regress check the change needs, and whether it needs the pod run. */
function chooseSlowChecks(changedFiles) {
  if (isFullRun || changedFiles === null)
    return { decksToRegress: DECKS_WITH_BASELINE, needsPodRun: true };
  if (changedFiles.some(isSharedSimulatorFile))
    return { decksToRegress: DECKS_WITH_BASELINE, needsPodRun: true };
  const isDeckChanged = (deck) =>
    changedFiles.some(
      (file) =>
        file.startsWith(`decks/${deck}/`) ||
        file === `regress_baseline/${deck}.json`,
    );
  return {
    decksToRegress: DECKS_WITH_BASELINE.filter(isDeckChanged),
    needsPodRun:
      isRecordingPod ||
      changedFiles.includes(POD_BASELINE_FILE.replace(/\\/g, '/')) ||
      POD_DECKS.some(isDeckChanged),
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

function checkPodRun() {
  const podRun = runSimulator([...POD_ARGUMENTS, ...powerSaveOptions]);
  const podReport = podReportOf(podRun.output);
  const baselineFile = path.join(PROJECT_FOLDER, POD_BASELINE_FILE);
  if (isRecordingPod) {
    fs.writeFileSync(baselineFile, podReport + '\n', 'utf-8');
    console.log(`recorded the pod report to ${POD_BASELINE_FILE}`);
  } else if (!fs.existsSync(baselineFile)) {
    report(`pod: no baseline yet (npm run verify -- --record-pod)`, false);
  } else {
    const savedReport = fs.readFileSync(baselineFile, 'utf-8').trim();
    report(
      `pod: 200 games with fixed seeds give the saved report (${POD_BASELINE_FILE})`,
      podRun.exitCode === 0 && podReport === savedReport.replace(/\r\n/g, '\n'),
      podRun,
    );
  }
}

const { decksToRegress, needsPodRun } = chooseSlowChecks(
  filesChangedSinceMain(),
);
const skippedDecks = DECKS_WITH_BASELINE.filter(
  (deck) => !decksToRegress.includes(deck),
);
if (skippedDecks.length || !needsPodRun)
  console.log(
    `Skipped, as the change cannot alter their results (--full runs them): ` +
      [
        ...skippedDecks.map((deck) => `${deck} --regress`),
        ...(needsPodRun ? [] : ['the pod run']),
      ].join(', ') +
      '\n',
  );

const typeCheck = run('npm', ['run', '-s', 'check']);
report('type-check (npm run check)', typeCheck.exitCode === 0, typeCheck);

const formatCheck = run('npm', ['run', '-s', 'format:check']);
report(
  'formatting (npm run format:check; fix with npm run format)',
  formatCheck.exitCode === 0,
  formatCheck,
);

const build = run('npm', ['run', '-s', 'build']);
report('build', build.exitCode === 0, build);

if (build.exitCode === 0) {
  for (const deck of decksToRegress) {
    const regress = runSimulator([
      deck,
      '--regress',
      'check',
      ...powerSaveOptions,
    ]);
    const isIdentical =
      regress.output.includes('IDENTICAL') &&
      !regress.output.includes('DIFFERENT');
    report(`${deck}: --regress check is IDENTICAL`, isIdentical, regress);
  }
  for (const deck of DECKS_WITH_TESTS) {
    const tests = runSimulator([deck, '--test']);
    const hasBadLine = /^BAD/m.test(tests.output);
    report(`${deck}: --test`, tests.exitCode === 0 && !hasBadLine, tests);
  }
  const podTests = runSimulator(['pod', '--test']);
  report(
    'pod: --test',
    podTests.exitCode === 0 && !/^BAD/m.test(podTests.output),
    podTests,
  );

  const appTests = runSimulator(['app', '--test']);
  report(
    'app: --test',
    appTests.exitCode === 0 && !/^BAD/m.test(appTests.output),
    appTests,
  );

  if (needsPodRun) checkPodRun();
}

const totalSeconds = Math.round((Date.now() - verifyStartTime) / 1000);
console.log(
  failedChecks === 0
    ? `\nVERIFY OK (${totalSeconds}s)`
    : `\nVERIFY BAD (${failedChecks} failed, ${totalSeconds}s)`,
);
process.exit(failedChecks === 0 ? 0 : 1);
