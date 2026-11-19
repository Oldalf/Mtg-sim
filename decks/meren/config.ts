/** Settings for the Meren goldfish simulation (change one with: npm run sim -- meren --set key=value). */
import { BASE_CONFIG, Config } from '../../engine/game/game-types';

export const CFG: Config = {
  ...BASE_CONFIG,
  max_turn: 12, // a slower, bracket 2-3 deck
  win_damage: 100,
  win_dead: 2,
  combat_safety: 10,
  ritual_several_plays: 1, // 1: Dark Ritual is also cast to make two plays instead of one; 0: only for one play we couldn't pay for
  hold_opponent_power: 30, // pod: keep mana open for removal only while one opponent's creatures have this much power in total (0: always, from round 5; 8,000-game pod runs: 0 gave 29.9% wins, 12 30.7%, 20 32.1%, 30 33.1%, never 34.8%)
};

/** What Meren's settings mean (the app's tooltips); the shared ones are in engine/run/setting-descriptions.ts. */
export const SETTING_DESCRIPTIONS: Record<string, string> = {
  ritual_several_plays:
    'Dark Ritual is cast when it lets Meren make one more play (two creatures instead of one), not only when it pays for one play it could not afford. 0 = the old rule.',
  hold_opponent_power:
    'In a pod Meren keeps mana open for an instant-speed removal spell in hand only while one opponent has creatures with this much power in total on the battlefield; otherwise the mana is spent on our own turn. 0 = always, from round 5.',
  win_dead:
    'Win when this many opponents are dead (2 of 3: the third is assumed to fall soon). A pod always needs every other player dead.',
  win_damage:
    'Also win when this much damage has been dealt to the opponents in total (Gray Merchant drains, combat). Not used in a pod.',
};
