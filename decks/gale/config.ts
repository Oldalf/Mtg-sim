/** Settings for the Gale goldfish simulation (change one with: npm run sim -- gale --set key=value). */
import { BASE_CONFIG, Config } from '../../engine/game-types';

export const CFG: Config = {
  ...BASE_CONFIG,
  opp_creature_density: 0.3, // share of opponents' decks that are creatures (Syr Konrad loops)
  opp_hand_size: 5, // cards opponents discard to Windfall
  opp_creatures_on_board: 2, // creatures each opponent has when Singularity Rupture resolves
  opp_lands_per_turn: 1, // Drain Power: each opponent has about this many lands per turn played...
  opp_lands_untapped: 0.5, //   ...and this share of them is untapped during our turn (rounded down)
  max_turn: 8,
  search_budget: 2500,
  planner_budget: 300, // kill-search effort when the planner scores a position
  gifts_budget: 120, // Gifts Ungiven: kill-search effort per possible split
  gifts_shortlist: 5, //   ...how many candidate cards are tried in 4-card piles
  ramp_tutor: false, // AI policy: early tutors fetch ramp when mana is short (recast tutor later via Gale)
  ramp_tutor_until: 4, //   ...only up to this turn
  ramp_tutor_below: 5, //   ...only while you have fewer mana sources than this
  self_counter_dev: true, // AI policy: counter your own cheap spell (Offer / Unwind) so Gale recasts a sorcery
};
