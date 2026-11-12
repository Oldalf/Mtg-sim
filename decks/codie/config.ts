/** Settings for the Codie goldfish simulation (change one with: npm run sim -- codie --set key=value). */
import { Config } from '../../engine/game';

export const CFG: Config = {
  opponents: 3,
  opp_life: 40,
  opp_library: 92, // 99 - opening 7
  on_play_chance: 0.25, // 4-player pod: 1 in 4 to skip the first draw
  max_turn: 12,
  opp_hand: 7, // cards in each opponent's hand (Jeska's Will makes {R} for each card in ONE opponent's hand): goldfish opponents hold 7
  opp_tapped_lands: 0, // tapped lands the opponents control in all (Mana Geyser); 0 = by turn: opp_tapped_per_turn x turn. 6 is break-even with a Reiterate copy, 7 or more gains
  opp_tapped_per_turn: 2.15, // Pontus's creator: at least 6 at turn 3, 13 in his turn 6 game
  opp_payments: 5, // Torment of Hailfire: each opponent pays this many times (sacrifice / discard) before losing life
  ad_end_step: true, // AI policy: Ad Nauseam at the end of the turn with spare mana (an instant, cast on the opponents' end step)
  opp_decay: 0, // optional: opponents' life drops this much each turn (to a floor of 10), as in a real pod (0 = stay at 40)
  opp_payments_decay: false, // optional: Torment of Hailfire payments shrink with the turn: 7 on turn 1 to 1 (false = opp_payments)
  mana_drain_flat: false, // optional: a Mana Drain in hand pays 2 to 5 colourless on the next turn (an opponent's spell, assumed)
  solver_nodes: 4000, // the kill search gives up after this many states (a hand with many tutors and rituals has a huge tree)
  ad_keep: 5, // Ad Nauseam + Teferi's Protection: the bottom cards of the library that stay (so we never draw from an empty library)
  ad_floor: 8, // Ad Nauseam: stop revealing at this life
  codie_dev: true, // AI policy: activate Codie in development ({4}, T: WUBRG and a free spell) when mana is spare
  guides_dev: true, // AI policy: exile a Spirit Guide for mana to cast a land-fetch spell a turn earlier
  codie_early: false, // AI policy: cast Codie before the ramp spells (it makes mana only for four, so by default it waits)
  rollout_solver: false, // the planner's copies don't use the solver to pick tutor targets (faster)
  search_budget: 0,
  smart_mulligan: true, // the deck's mulligan rule (mulligan.ts); off = keep 2 to 5 lands
  planner: true, // AI tries its best few plays on copies of the game and keeps the best
  planner_width: 4,
  planner_rollouts: 2,
  planner_budget: 0,
};
