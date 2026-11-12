/** Every deck the command line knows. To add a deck: make its folder, then register it here. */
import { Deck } from '../engine/runner';
import { RegressSpec } from '../engine/regress';
import { deck as gale } from './gale/index';
import { deck as meren } from './meren/index';
import { deck as samfrodo } from './samfrodo/index';
import { deck as aesi } from './aesi/index';
import { deck as mike } from './mike/index';
import { deck as codie } from './codie/index';
import { deck as goldfish } from './goldfish/index';
import { runKillTests } from './gale/tests/kills.test';
import { runMerenTests } from './meren/tests/meren.test';
import { runSamFrodoTests } from './samfrodo/tests/samfrodo.test';
import { runAesiTests } from './aesi/tests/aesi.test';
import { runMikeTests } from './mike/tests/mike.test';
import { runCodieTests } from './codie/tests/codie.test';

export const DECKS: Record<string, Deck> = {
  gale,
  meren,
  samfrodo,
  aesi,
  mike,
  codie,
  goldfish,
};

/** Each deck's own tests (`npm run sim -- <deck> --test`). Each returns true when all pass. */
export const TESTS: Record<string, () => boolean> = {
  gale: runKillTests,
  meren: runMerenTests,
  samfrodo: runSamFrodoTests,
  aesi: runAesiTests,
  mike: runMikeTests,
  codie: runCodieTests,
};

/** What `--regress` records per deck (lists are relative to the deck folder). */
export const REGRESS: Record<string, RegressSpec> = {
  gale: {
    lists: ['decklist.txt', 'lists/proposed.txt'],
    tests: runKillTests,
    // this log was played with the proposed list
    logLists: { 'game6_t9_duskmantle_singularity.txt': 'lists/proposed.txt' },
  },
  meren: { lists: ['decklist.txt'], tests: runMerenTests },
  samfrodo: { lists: ['decklist.txt'], tests: runSamFrodoTests },
  aesi: { lists: ['decklist.txt'], tests: runAesiTests },
  mike: { lists: ['decklist.txt'], tests: runMikeTests },
  codie: { lists: ['decklist.txt'], tests: runCodieTests },
};
