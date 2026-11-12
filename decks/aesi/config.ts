/** Settings for the Aesi goldfish simulation (change one with: npm run sim -- aesi --set key=value). */
import { BASE_CONFIG, Config } from '../../engine/game-types';

export const CFG: Config = {
  ...BASE_CONFIG,
  max_turn: 14,
  aesi_first: true, // AI policy: when Aesi can be cast, the turn planner doesn't get to pick something else (Pontus: "we always want Aesi out")
  keep_library: 5, // Aesi's draws (and loops) stop with this many cards left in our library
  land_lock_win: true, // every opponent's land bounced over and over (lands are creatures) counts as a win (Pontus)
  dominion_win: 10, // this many Eternal Dominion copies at an upkeep win the game (Pontus: 10-20 stolen cards)
};
