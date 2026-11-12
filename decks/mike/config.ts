/** Settings for the Mike (Vnwxt) goldfish simulation (change one with: npm run sim -- mike --set key=value). */
import { BASE_CONFIG, Config } from '../../engine/game';

export const CFG: Config = {
  ...BASE_CONFIG,
  max_turn: 14,
  keep_library: 3, // AI policy: without a win piece (or Conundrum / Ormos) it stops drawing with this many cards left
  maniac_early: true, // AI policy: cast Laboratory Maniac / Jace as soon as it's convenient (false = only when the library is low)
  maniac_at: 14, // ...and always when the library has this many cards or fewer
  speed_free: false, // true = an opponent loses life on every turn of ours (speed rises each turn without attacking)
  combat_safety: 10, // combat: stay above this life after the crackback
};
