/** Settings for the Meren goldfish simulation (change one with: npm run sim -- meren --set key=value). */
import { Config } from "../../engine/game";

export const CFG: Config = {
  opponents: 3,
  opp_life: 40,
  opp_library: 92, // 99 - opening 7
  on_play_chance: 0.25, // 4-player pod: 1 in 4 to skip the first draw
  max_turn: 12, // a slower, bracket 2-3 deck
  win_damage: 100, // win: 2 opponents dead, or this much damage dealt in total
  win_dead: 2,
  combat_safety: 10, // only attack if the crackback leaves us above this much life (unless the attack wins)
  search_budget: 0, // (no kill search: the AI checks the win condition directly)
  smart_mulligan: true, // the deck's mulligan rule (mulligan.ts); off = keep 2 to 5 lands
  planner: true, // AI tries its best few plays on copies of the game and keeps the best (+7 points win by T10)
  planner_width: 4,
  planner_rollouts: 2,
  planner_budget: 0,
};
