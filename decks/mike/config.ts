/** Settings for the Mike (Vnwxt) goldfish simulation (change one with: npm run sim -- mike --set key=value). */
import { BASE_CONFIG, Config } from '../../engine/game-types';

export const CFG: Config = {
  ...BASE_CONFIG,
  max_turn: 14,
  keep_library: 3,
  maniac_early: true,
  maniac_at: 14,
  speed_free: false,
  combat_safety: 10,
};

/** What Mike's settings mean (the app's tooltips); the shared ones are in engine/setting-descriptions.ts. */
export const SETTING_DESCRIPTIONS: Record<string, string> = {
  keep_library:
    'AI choice. Without a win piece (or Living Conundrum / Ormos) it stops drawing with this many cards left in the library.',
  maniac_early:
    'AI choice. On: cast Laboratory Maniac / Jace as soon as it is convenient. Off: only when the library is low (maniac_at).',
  maniac_at:
    'Always cast Laboratory Maniac / Jace when the library has this many cards or fewer.',
  speed_free:
    'On: an opponent loses life on every turn of ours (speed rises each turn, without attacking).',
};
