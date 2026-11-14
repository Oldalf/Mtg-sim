/** Settings for the Meren goldfish simulation (change one with: npm run sim -- meren --set key=value). */
import { BASE_CONFIG, Config } from '../../engine/game-types';

export const CFG: Config = {
  ...BASE_CONFIG,
  max_turn: 12, // a slower, bracket 2-3 deck
  win_damage: 100,
  win_dead: 2,
  combat_safety: 10,
};

/** What Meren's settings mean (the app's tooltips); the shared ones are in engine/setting-descriptions.ts. */
export const SETTING_DESCRIPTIONS: Record<string, string> = {
  win_dead:
    'Win when this many opponents are dead (2 of 3: the third is assumed to fall soon). A pod always needs every other player dead.',
  win_damage:
    'Also win when this much damage has been dealt to the opponents in total (Gray Merchant drains, combat). Not used in a pod.',
};
