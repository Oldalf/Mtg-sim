/**
 * The app's web server (PLAN.md, roadmap step 4): Node's own `http` module, listening on 127.0.0.1 only.
 * It answers the API calls of the route table below with JSON, and every other path with a file of the built page.
 */
import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import type { ErrorAnswer, HealthAnswer } from '../api-types';
import { answerDecklist, answerDecks, RequestError } from './decks-routes';
import { answerCurrentRun, startRun, stopCurrentRun } from './runs';

/** The built page (`ng build` in app/web/ writes it here). */
export const WEB_FOLDER = path.join('dist', 'web');

/** An answer to an API call: a status and the JSON body. */
interface ApiAnswer {
  status: number;
  body: unknown;
}

/** One API call: its method, its path (named parts as regex groups), and the function that answers it. */
interface Route {
  method: 'GET' | 'POST';
  path: RegExp;
  answer: (
    pathParts: Record<string, string>,
    url: URL,
    request: http.IncomingMessage,
  ) => Promise<ApiAnswer> | ApiAnswer;
}

const ROUTES: Route[] = [
  {
    method: 'GET',
    path: /^\/api\/health$/,
    answer: () => ok<HealthAnswer>({ status: 'ok' }),
  },
  {
    method: 'GET',
    path: /^\/api\/decks$/,
    answer: (_pathParts, url) =>
      ok(answerDecks(url.searchParams.get('all') === '1')),
  },
  {
    // the list name may hold slashes (lists/proposed.txt)
    method: 'GET',
    path: /^\/api\/decks\/(?<deck>[^/]+)\/lists\/(?<list>.+)$/,
    answer: (pathParts) =>
      ok(
        answerDecklist(
          decodeURIComponent(pathParts.deck),
          decodeURIComponent(pathParts.list),
        ),
      ),
  },
  {
    method: 'POST',
    path: /^\/api\/runs$/,
    answer: async (_pathParts, _url, request) =>
      ok(startRun(await readJsonBody(request))),
  },
  {
    method: 'GET',
    path: /^\/api\/runs\/current$/,
    answer: () => ok(answerCurrentRun()),
  },
  {
    method: 'POST',
    path: /^\/api\/runs\/current\/stop$/,
    answer: () => ok(stopCurrentRun()),
  },
];

/** A request body is small JSON (a run request); anything bigger is refused. */
const MAX_BODY_BYTES = 100_000;

/** The JSON body of a request; a 400 answer when it is not JSON. */
async function readJsonBody(request: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let byteCount = 0;
  for await (const chunk of request) {
    byteCount += (chunk as Buffer).length;
    if (byteCount > MAX_BODY_BYTES)
      throw new RequestError(413, 'the request body is too big');
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf-8'));
  } catch {
    throw new RequestError(400, 'the request body is not JSON');
  }
}

/** A 200 answer. The type parameter names the shape in api-types.ts the body must have. */
function ok<Body>(body: Body): ApiAnswer {
  return { status: 200, body };
}

/** An error answer (4xx: the request was wrong, 5xx: the server failed). */
export function errorAnswer(status: number, message: string): ApiAnswer {
  const body: ErrorAnswer = { error: message };
  return { status, body };
}

const FILE_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
};

function sendJson(response: http.ServerResponse, answer: ApiAnswer): void {
  response.writeHead(answer.status, {
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(answer.body));
}

/** Answers an API call from the route table. */
async function answerApiCall(
  request: http.IncomingMessage,
  url: URL,
): Promise<ApiAnswer> {
  for (const route of ROUTES) {
    const match = route.path.exec(url.pathname);
    if (!match) continue;
    if (route.method !== request.method)
      return errorAnswer(405, `${request.method} is not allowed here`);
    return route.answer(match.groups ?? {}, url, request);
  }
  return errorAnswer(404, `no API call ${url.pathname}`);
}

/** Sends a file of the built page. "/" is index.html. Paths outside the page's folder are refused. */
function sendPageFile(response: http.ServerResponse, url: URL): void {
  const webFolder = path.resolve(WEB_FOLDER);
  const relativePath =
    url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname);
  const file = path.resolve(webFolder, '.' + path.sep + relativePath);
  const isInsideWebFolder = file.startsWith(webFolder + path.sep);
  if (
    !isInsideWebFolder ||
    !fs.existsSync(file) ||
    !fs.statSync(file).isFile()
  ) {
    const notFound = fs.existsSync(path.join(webFolder, 'index.html'))
      ? `no file ${url.pathname}`
      : `the page is not built: run "npm run app" (or "ng build" in app/web/)`;
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end(notFound);
    return;
  }
  const fileType =
    FILE_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
  response.writeHead(200, { 'Content-Type': fileType });
  fs.createReadStream(file).pipe(response);
}

async function handleRequest(
  request: http.IncomingMessage,
  response: http.ServerResponse,
): Promise<void> {
  const url = new URL(request.url ?? '/', 'http://localhost');
  if (!url.pathname.startsWith('/api/')) {
    sendPageFile(response, url);
    return;
  }
  try {
    sendJson(response, await answerApiCall(request, url));
  } catch (error) {
    if (error instanceof RequestError) {
      sendJson(response, errorAnswer(error.status, error.message));
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    sendJson(response, errorAnswer(500, message));
  }
}

/** Starts the server on 127.0.0.1 and resolves once it listens. */
export function startServer(port: number): Promise<http.Server> {
  const server = http.createServer((request, response) => {
    handleRequest(request, response).catch((error) => {
      console.error(error);
      if (!response.headersSent) response.writeHead(500);
      response.end();
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}
