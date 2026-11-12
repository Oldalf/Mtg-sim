/** Settings for the Gale goldfish simulation (change one with: npm run sim -- gale --set key=value). */
import { Config } from '../../engine/game';

export const CFG: Config = {
  opponents: 3,
  opp_life: 40,
  opp_library: 92, // 99 - opening 7
  opp_creature_density: 0.3, // share of opponents' decks that are creatures (Syr Konrad loops)
  opp_hand_size: 5, // cards opponents discard to Windfall
  opp_creatures_on_board: 2, // creatures each opponent has when Singularity Rupture resolves
  opp_lands_per_turn: 1, // Drain Power: each opponent has about this many lands per turn played...
  opp_lands_untapped: 0.5, //   ...and this share of them is untapped during our turn (rounded down)
  on_play_chance: 0.25, // 4-player pod: 1 in 4 to skip the first draw
  max_turn: 8,
  search_budget: 2500,
  smart_mulligan: true, // the deck's mulligan rule (mulligan.ts); off = keep 2 to 5 lands
  planner: true, // AI tries its best few plays on copies of the game and keeps the best
  planner_width: 4, //   ...how many plays it compares at each decision
  planner_rollouts: 2, //   ...random futures per play (library re-shuffled: no peeking)
  planner_budget: 300, //   ...kill-search effort when scoring a position
  gifts_budget: 120, // Gifts Ungiven: kill-search effort per possible split
  gifts_shortlist: 5, //   ...how many candidate cards are tried in 4-card piles
  ramp_tutor: false, // AI policy: early tutors fetch ramp when mana is short (recast tutor later via Gale)
  ramp_tutor_until: 4, //   ...only up to this turn
  ramp_tutor_below: 5, //   ...only while you have fewer mana sources than this
  self_counter_dev: true, // AI policy: counter your own cheap spell (Offer / Unwind) so Gale recasts a sorcery
};
