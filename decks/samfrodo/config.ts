/** Settings for the Sam & Frodo goldfish simulation (change one with: npm run sim -- samfrodo --set key=value). */
import { Config } from '../../engine/game';

export const CFG: Config = {
  opponents: 3,
  opp_life: 40,
  opp_library: 92, // 99 - opening 7
  on_play_chance: 0.25, // 4-player pod: 1 in 4 to skip the first draw
  max_turn: 14, // a slow, bracket 2-3 drain deck
  win_dead: 3, // win: all three opponents at 0 life
  all_in: true, // attack with everything when that kills the table (else only Frodo and Gollum attack)
  own_removal: true, // AI policy: removal on our own Rapacious Guest (it drains its power when it leaves)
  own_removal_power: 6, //   ...once its power is at least this
  cotton_min_x: 2, // AI policy: cast Farmer Cotton only with at least this X
  search_budget: 0, // (no kill search: the AI checks the win condition directly)
  smart_mulligan: true, // the deck's mulligan rule (mulligan.ts); off = keep 2 to 5 lands
  planner: true, // AI tries its best few plays on copies of the game and keeps the best
  planner_width: 4,
  planner_rollouts: 2,
  planner_budget: 0,
};
