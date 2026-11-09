/** Settings for the Aesi goldfish simulation (change one with: npm run sim -- aesi --set key=value). */
import { Config } from "../../engine/game";

export const CFG: Config = {
  opponents: 3,
  opp_life: 40,
  opp_library: 92, // 99 - opening 7
  on_play_chance: 0.25, // 4-player pod: 1 in 4 to skip the first draw
  max_turn: 14,
  aesi_first: true, // AI policy: when Aesi can be cast, the turn planner doesn't get to pick something else (Pontus: "we always want Aesi out")
  keep_library: 5, // Aesi's draws (and loops) stop with this many cards left in our library
  land_lock_win: true, // every opponent's land bounced over and over (lands are creatures) counts as a win (Pontus)
  dominion_win: 10, // this many Eternal Dominion copies at an upkeep win the game (Pontus: 10-20 stolen cards)
  search_budget: 0, // (no kill search: the loop solver checks the win directly)
  smart_mulligan: true, // the deck's mulligan rule (mulligan.ts); off = keep 2 to 5 lands
  planner: true, // AI tries its best few plays on copies of the game and keeps the best
  planner_width: 4,
  planner_rollouts: 2,
  planner_budget: 0,
};
