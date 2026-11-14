/** Settings for the Gale goldfish simulation (change one with: npm run sim -- gale --set key=value). */
import { BASE_CONFIG, Config } from '../../engine/game/game-types';

export const CFG: Config = {
  ...BASE_CONFIG,
  opp_creature_density: 0.3,
  opp_hand_size: 5,
  opp_creatures_on_board: 2,
  opp_lands_per_turn: 1,
  opp_lands_untapped: 0.5,
  max_turn: 8,
  search_budget: 2500,
  planner_budget: 300,
  gifts_budget: 120,
  gifts_shortlist: 5,
  ramp_tutor: false,
  ramp_tutor_until: 4,
  ramp_tutor_below: 5,
  self_counter_dev: true,
};

/** What Gale's settings mean (the app's tooltips); the shared ones are in engine/setting-descriptions.ts. */
export const SETTING_DESCRIPTIONS: Record<string, string> = {
  opp_creature_density:
    "The share of the opponents' libraries that are creatures (for Syr Konrad loops).",
  opp_hand_size: 'Cards each opponent discards to Windfall.',
  opp_creatures_on_board:
    'Creatures each opponent has when Singularity Rupture resolves.',
  opp_lands_per_turn:
    'Drain Power: each opponent has about this many lands for each turn played.',
  opp_lands_untapped:
    'Drain Power: the share of those lands that is untapped during our turn (rounded down).',
  gifts_budget:
    'Gifts Ungiven: how hard the kill search looks at each way the opponent could split the four cards.',
  gifts_shortlist:
    'Gifts Ungiven: how many candidate cards are tried for the 4-card piles.',
  ramp_tutor:
    'AI choice. On: early tutors fetch ramp when mana is short (the tutor is cast again later through Gale).',
  ramp_tutor_until: 'With ramp_tutor on: only up to this turn.',
  ramp_tutor_below:
    'With ramp_tutor on: only while we have fewer mana sources than this.',
  self_counter_dev:
    'AI choice. On: counter our own cheap spell (Offer / Unwind) so Gale can cast a sorcery again.',
};
