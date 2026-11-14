/** Settings for the Aesi goldfish simulation (change one with: npm run sim -- aesi --set key=value). */
import { BASE_CONFIG, Config } from '../../engine/game/game-types';

export const CFG: Config = {
  ...BASE_CONFIG,
  max_turn: 14,
  aesi_first: true, // Pontus: "we always want Aesi out"
  keep_library: 5,
  land_lock_win: true, // Pontus
  dominion_win: 10, // Pontus: 10-20 stolen cards
};

/** What Aesi's settings mean (the app's tooltips); the shared ones are in engine/setting-descriptions.ts. */
export const SETTING_DESCRIPTIONS: Record<string, string> = {
  aesi_first:
    'AI choice. On: whenever Aesi can be cast, it is cast; the planner does not get to pick something else.',
  keep_library:
    "Aesi's draws (and the draw loops) stop with this many cards left in our library, so we never draw from an empty library.",
  land_lock_win:
    "On: bouncing every opponent's lands over and over (when lands are creatures) counts as a win.",
  dominion_win:
    'This many Eternal Dominion copies at an upkeep count as a win (each steals a card every turn).',
};
