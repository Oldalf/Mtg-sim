/** Settings for the Sam & Frodo goldfish simulation (change one with: npm run sim -- samfrodo --set key=value). */
import { BASE_CONFIG, Config } from '../../engine/game/game-types';

export const CFG: Config = {
  ...BASE_CONFIG,
  max_turn: 14, // a slow, bracket 2-3 drain deck
  win_dead: 3,
  all_in: true,
  own_removal: true,
  own_removal_power: 6,
  cotton_min_x: 2,
};

/** What Sam & Frodo's settings mean (the app's tooltips); the shared ones are in engine/setting-descriptions.ts. */
export const SETTING_DESCRIPTIONS: Record<string, string> = {
  win_dead:
    'Win when this many opponents are at 0 life (3 = all of them). A pod always needs every other player dead.',
  all_in:
    'On: attack with everything when that kills the table. Otherwise only Frodo and Gollum attack.',
  own_removal:
    'AI choice. On: use removal on our own Rapacious Guest (it drains its power when it leaves).',
  own_removal_power:
    'With own_removal on: only once its power is at least this.',
  cotton_min_x: 'AI choice: cast Farmer Cotton only with at least this X.',
};
