/**
 * Checks the body of POST /api/runs (PLAN.md task 4) before a run starts: the decks, their list files, the game
 * count and the settings. A wrong request is refused with a 400 answer that says what is wrong.
 */
import { DECKS } from '../../decks/index';
import * as C from '../../engine/cards';
import type { Deck } from '../../engine/runner';
import type {
  GoldfishRunRequest,
  PodRunRequest,
  RunRequest,
} from '../api-types';
import { RequestError, resolveListFile } from './decks-routes';

const MAX_GAMES = 50_000;
const MAX_TURNS = 50;
const MIN_POD_SEATS = 3;
const MAX_POD_SEATS = 6;

/** The settings of a run, as the request gives them. */
type Settings = Record<string, number | boolean>;

function refuse(message: string): never {
  throw new RequestError(400, message);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function checkWholeNumber(
  value: unknown,
  name: string,
  lowest: number,
  highest: number,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < lowest ||
    value > highest
  )
    refuse(`${name} must be a whole number from ${lowest} to ${highest}`);
  return value;
}

function checkBoolean(value: unknown, name: string): boolean {
  if (typeof value !== 'boolean') refuse(`${name} must be true or false`);
  return value;
}

function checkOptionalText(value: unknown, name: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') refuse(`${name} must be text`);
  return value;
}

function checkDeck(deckName: unknown): Deck {
  if (typeof deckName !== 'string' || !Object.hasOwn(DECKS, deckName))
    refuse(
      `no deck ${String(deckName)}; choose from ${Object.keys(DECKS).join(', ')}`,
    );
  return DECKS[deckName];
}

/** A list file of the deck that exists and whose cards all have card data. Returns the name as given. */
function checkList(deck: Deck, listName: unknown): string {
  if (typeof listName !== 'string')
    refuse(`a list of ${deck.name} must be a file name`);
  const decklist = C.loadDecklist(resolveListFile(deck, listName));
  if (decklist.missing.length)
    refuse(
      `${deck.name} ${listName}: no card data for ${decklist.missing.join(', ')} (run it once on the command line to fetch them)`,
    );
  return listName;
}

/** Every setting must exist in one of the decks' settings and have the type of its default. */
function checkSettings(settings: unknown, decks: Deck[]): Settings {
  if (!isObject(settings)) refuse('settings must be an object');
  for (const [name, value] of Object.entries(settings)) {
    const deckWithSetting = decks.find((deck) =>
      Object.hasOwn(deck.config, name),
    );
    if (!deckWithSetting)
      refuse(
        `unknown setting ${name}; choose from ${[...new Set(decks.flatMap((deck) => Object.keys(deck.config)))].join(', ')}`,
      );
    const defaultValue = deckWithSetting.config[name];
    if (typeof value !== typeof defaultValue)
      refuse(`setting ${name} must be a ${typeof defaultValue}`);
  }
  return settings as Settings;
}

function checkGoldfishRequest(
  body: Record<string, unknown>,
): GoldfishRunRequest {
  const deck = checkDeck(body.deck);
  if (!Array.isArray(body.lists) || body.lists.length === 0)
    refuse('lists must hold at least one list file');
  const diag = checkBoolean(body.diag, 'diag');
  if (diag && !(deck.diagMetrics ?? []).length)
    refuse(`${deck.name} has no diag measures`);
  return {
    mode: 'goldfish',
    deck: deck.name,
    lists: body.lists.map((listName) => checkList(deck, listName)),
    games: checkWholeNumber(body.games, 'games', 1, MAX_GAMES),
    turns:
      body.turns === undefined
        ? undefined
        : checkWholeNumber(body.turns, 'turns', 1, MAX_TURNS),
    settings: checkSettings(body.settings, [deck]),
    diag,
    powerSave: checkBoolean(body.powerSave, 'powerSave'),
  };
}

function checkPodRequest(body: Record<string, unknown>): PodRunRequest {
  if (
    !Array.isArray(body.decks) ||
    body.decks.length < MIN_POD_SEATS ||
    body.decks.length > MAX_POD_SEATS
  )
    refuse(`a pod has ${MIN_POD_SEATS} to ${MAX_POD_SEATS} decks`);
  const seats = body.decks.map((seat: unknown) => {
    if (!isObject(seat)) refuse('each seat must be { deck, list }');
    const deck = checkDeck(seat.deck);
    return { deck, list: checkList(deck, seat.list) };
  });
  return {
    mode: 'pod',
    decks: seats.map((seat) => ({ deck: seat.deck.name, list: seat.list })),
    games: checkWholeNumber(body.games, 'games', 1, MAX_GAMES),
    rounds: checkWholeNumber(body.rounds, 'rounds', 1, MAX_TURNS),
    settings: checkSettings(
      body.settings,
      seats.map((seat) => seat.deck),
    ),
    threat: checkOptionalText(body.threat, 'threat'),
    policy: checkOptionalText(body.policy, 'policy'),
    powerSave: checkBoolean(body.powerSave, 'powerSave'),
  };
}

/** The body of POST /api/runs as a RunRequest, or a 400 answer. (Pod threat and policy are checked by podSpec.) */
export function checkRunRequest(body: unknown): RunRequest {
  if (!isObject(body)) refuse('the request must be a JSON object');
  if (body.mode === 'goldfish') return checkGoldfishRequest(body);
  if (body.mode === 'pod') return checkPodRequest(body);
  return refuse('mode must be "goldfish" or "pod"');
}
