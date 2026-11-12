/** Settings for the Sam & Frodo goldfish simulation (change one with: npm run sim -- samfrodo --set key=value). */
import { BASE_CONFIG, Config } from '../../engine/game-types';

export const CFG: Config = {
  ...BASE_CONFIG,
  max_turn: 14, // a slow, bracket 2-3 drain deck
  win_dead: 3, // win: all three opponents at 0 life
  all_in: true, // attack with everything when that kills the table (else only Frodo and Gollum attack)
  own_removal: true, // AI policy: removal on our own Rapacious Guest (it drains its power when it leaves)
  own_removal_power: 6, //   ...once its power is at least this
  cotton_min_x: 2, // AI policy: cast Farmer Cotton only with at least this X
};
