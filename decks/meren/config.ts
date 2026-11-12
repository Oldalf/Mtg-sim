/** Settings for the Meren goldfish simulation (change one with: npm run sim -- meren --set key=value). */
import { BASE_CONFIG, Config } from '../../engine/game-types';

export const CFG: Config = {
  ...BASE_CONFIG,
  max_turn: 12, // a slower, bracket 2-3 deck
  win_damage: 100, // win: 2 opponents dead, or this much damage dealt in total
  win_dead: 2,
  combat_safety: 10, // only attack if the crackback leaves us above this much life (unless the attack wins)
};
