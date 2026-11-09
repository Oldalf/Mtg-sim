/** Settings for the Mike (Vnwxt) goldfish simulation (change one with: npm run sim -- mike --set key=value). */
import { Config } from "../../engine/game";

export const CFG: Config = {
  opponents: 3,
  opp_life: 40,
  opp_library: 92, // 99 - opening 7
  on_play_chance: 0.25, // 4-player pod: 1 in 4 to skip the first draw
  max_turn: 14,
  keep_library: 3, // AI policy: without a win piece (or Conundrum / Ormos) it stops drawing with this many cards left
  maniac_early: true, // AI policy: cast Laboratory Maniac / Jace as soon as it's convenient (false = only when the library is low)
  maniac_at: 14, // ...and always when the library has this many cards or fewer
  speed_free: false, // true = an opponent loses life on every turn of ours (speed rises each turn without attacking)
  combat_safety: 10, // combat: stay above this life after the crackback
  search_budget: 0, // (no kill search: the AI checks the win conditions directly)
  smart_mulligan: true, // the deck's mulligan rule (mulligan.ts); off = keep 2 to 5 lands
  planner: true, // AI tries its best few plays on copies of the game and keeps the best
  planner_width: 4,
  planner_rollouts: 2,
  planner_budget: 0,
};
