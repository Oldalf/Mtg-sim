/**
 * `npm run verify`: every check a change must pass, in one go. It ends with VERIFY OK or VERIFY BAD.
 *
 *   npm run verify                 all checks at full power
 *   npm run verify -- --eco        the simulations in power-save mode (slower, same results)
 *   npm run verify -- --record-pod save the pod report as the new baseline (after a change that is meant to alter it)
 *
 * The checks: the type-check, the formatting, and for every deck `--regress check` (must print IDENTICAL) and
 * `--test` (no BAD line); then the pod tests, and a pod run with fixed seeds whose report must equal the saved one
 * (regress_baseline/pod.txt), because `--regress` does not cover pod games.
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
const POD_ARGUMENTS = [
  'pod',
  'gale',
  'meren',
  'samfrodo',
  'aesi',
  '-n',
  '200',
  '--no-log',
];

const options = process.argv.slice(2);
const powerSaveOptions = options.includes('--eco') ? ['--eco'] : [];
const isRecordingPod = options.includes('--record-pod');

/** Runs a command in the project folder. Returns its exit code and everything it printed. */
function run(command, commandArguments) {
  const result = spawnSync(command, commandArguments, {
    cwd: PROJECT_FOLDER,
    encoding: 'utf-8',
    shell: process.platform === 'win32', // npm is a .cmd file on Windows
    maxBuffer: 64 * 1024 * 1024,
  });
  return {
    exitCode: result.status ?? 1,
    output: (result.stdout ?? '') + (result.stderr ?? ''),
  };
}

const runSimulator = (simulatorArguments) =>
  run('node', ['--enable-source-maps', BUNDLE, ...simulatorArguments]);

let failedChecks = 0;
/** Prints one line for a check, and what it printed if it failed. */
function report(label, isGood, outputToShowIfBad = '') {
  console.log(`${isGood ? 'OK ' : 'BAD'} ${label}`);
  if (!isGood) {
    failedChecks++;
    const lastLines = outputToShowIfBad.trim().split(/\r?\n/).slice(-15);
    for (const line of lastLines) console.log(`      ${line}`);
  }
}

/** The pod report without the lines that differ from run to run (the time taken, the power-save note). */
function podReportOf(output) {
  return output
    .split(/\r?\n/)
    .filter((line) => !line.startsWith('(') && !line.startsWith('eco mode:'))
    .join('\n')
    .trim();
}

const typeCheck = run('npm', ['run', '-s', 'check']);
report(
  'type-check (npm run check)',
  typeCheck.exitCode === 0,
  typeCheck.output,
);

const formatCheck = run('npm', ['run', '-s', 'format:check']);
report(
  'formatting (npm run format:check; fix with npm run format)',
  formatCheck.exitCode === 0,
  formatCheck.output,
);

const build = run('npm', ['run', '-s', 'build']);
report('build', build.exitCode === 0, build.output);

if (build.exitCode === 0) {
  for (const deck of DECKS_WITH_BASELINE) {
    const regress = runSimulator([
      deck,
      '--regress',
      'check',
      ...powerSaveOptions,
    ]);
    const isIdentical =
      regress.output.includes('IDENTICAL') &&
      !regress.output.includes('DIFFERENT');
    report(
      `${deck}: --regress check is IDENTICAL`,
      isIdentical,
      regress.output,
    );
  }
  for (const deck of DECKS_WITH_TESTS) {
    const tests = runSimulator([deck, '--test']);
    const hasBadLine = /^BAD/m.test(tests.output);
    report(
      `${deck}: --test`,
      tests.exitCode === 0 && !hasBadLine,
      tests.output,
    );
  }
  const podTests = runSimulator(['pod', '--test']);
  report(
    'pod: --test',
    podTests.exitCode === 0 && !/^BAD/m.test(podTests.output),
    podTests.output,
  );

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
      podRun.output,
    );
  }
}

console.log(
  failedChecks === 0 ? '\nVERIFY OK' : `\nVERIFY BAD (${failedChecks} failed)`,
);
process.exit(failedChecks === 0 ? 0 : 1);
