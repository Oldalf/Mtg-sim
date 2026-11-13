/**
 * `npm run app:dev`: for working on the page. Starts the app's server (without opening the browser) and `ng serve`,
 * which rebuilds the page on every change, opens it on its own port and sends /api calls on to the server
 * (app/web/proxy.conf.json). Ctrl+C stops both.
 */
import { spawn } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_FOLDER = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const isWindows = process.platform === 'win32';

/** Starts a command that prints into this terminal. */
function start(command, commandArguments, folder) {
  return spawn(command, commandArguments, {
    cwd: folder,
    stdio: 'inherit',
    shell: isWindows, // npm is a .cmd file on Windows
  });
}

const server = start(
  'node',
  ['--enable-source-maps', path.join('dist', 'sim.js'), 'app', '--no-open'],
  PROJECT_FOLDER,
);
const pageServer = start(
  'npm',
  ['run', 'start', '--', '--open'],
  path.join(PROJECT_FOLDER, 'app', 'web'),
);

// when one stops, stop the other
for (const [child, other] of [
  [server, pageServer],
  [pageServer, server],
]) {
  child.on('exit', (exitCode) => {
    other.kill();
    process.exitCode = exitCode ?? 0;
  });
}
