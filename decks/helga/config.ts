/** Settings for Helga's deck (change one with: npm run sim -- helga --set key=value). */
import { BASE_CONFIG, Config } from '../../engine/game/game-types';

export const CFG: Config = {
  ...BASE_CONFIG,
  max_turn: 14, // a bracket 2-3 deck
  win_dead: 3,
  combat_safety: 10,
};

export const SETTING_DESCRIPTIONS: Record<string, string> = {
  win_dead:
    'Win when this many opponents are at 0 life (3 = all of them). A pod always needs every other player dead.',
};
