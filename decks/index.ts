/** Every deck the command line knows. To add a deck: make its folder, then add it here (its tests and regress
 *  lists are on its own `deck` object). */
import { Deck } from '../engine/run/runner';
import { deck as gale } from './gale/index';
import { deck as meren } from './meren/index';
import { deck as samfrodo } from './samfrodo/index';
import { deck as aesi } from './aesi/index';
import { deck as mike } from './mike/index';
import { deck as codie } from './codie/index';
import { deck as edgar } from './edgar/index';
import { deck as helga } from './helga/index';
import { deck as ardyn } from './ardyn/index';
import { deck as teval } from './teval/index';
import { deck as goldfish } from './goldfish/index';

export const DECKS: Record<string, Deck> = {
  gale,
  meren,
  samfrodo,
  aesi,
  mike,
  codie,
  edgar,
  helga,
  ardyn,
  teval,
  goldfish,
};
