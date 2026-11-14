/** Settings for the Codie goldfish simulation (change one with: npm run sim -- codie --set key=value). */
import { BASE_CONFIG, Config } from '../../engine/game/game-types';

export const CFG: Config = {
  ...BASE_CONFIG,
  max_turn: 12,
  opp_hand: 7,
  // 6 is break-even with a Reiterate copy, 7 or more gains
  opp_tapped_lands: 0,
  opp_tapped_per_turn: 2.15, // Pontus's creator: at least 6 at turn 3, 13 in his turn 6 game
  opp_payments: 5,
  ad_end_step: true,
  opp_decay: 0,
  opp_payments_decay: false,
  mana_drain_flat: false,
  solver_nodes: 4000, // a hand with many tutors and rituals has a huge tree
  ad_keep: 5,
  ad_floor: 8,
  codie_dev: true,
  guides_dev: true,
  codie_early: false, // Codie makes mana only for four, so by default it waits
  rollout_solver: false, // faster
};

/** What Codie's settings mean (the app's tooltips); the shared ones are in engine/setting-descriptions.ts. */
export const SETTING_DESCRIPTIONS: Record<string, string> = {
  opp_hand:
    "Cards in each opponent's hand (Jeska's Will makes {R} for each card in one opponent's hand). Goldfish opponents hold 7.",
  opp_tapped_lands:
    'Tapped lands the opponents control in all, for Mana Geyser. 0 = it grows by turn (opp_tapped_per_turn × the turn).',
  opp_tapped_per_turn:
    'When opp_tapped_lands is 0: the opponents tap this many more lands each turn, for Mana Geyser.',
  opp_payments:
    'Torment of Hailfire: each opponent pays this many times (sacrifices or discards) before losing life.',
  ad_end_step:
    "AI choice. On: Ad Nauseam is cast at the end of the turn with spare mana (it is an instant, so on an opponent's end step).",
  opp_decay:
    "Optional: the opponents' life drops this much each turn (to a floor of 10), as in a real pod. 0 = they stay at 40.",
  opp_payments_decay:
    'Optional. On: Torment of Hailfire payments shrink with the turn, from 7 on turn 1 to 1. Off: opp_payments.',
  mana_drain_flat:
    "Optional. On: a Mana Drain in hand pays 2 to 5 colourless next turn (assumes an opponent's spell to counter).",
  solver_nodes:
    'The kill search gives up after this many positions (more = finds harder kills, slower).',
  ad_keep:
    "Ad Nauseam with Teferi's Protection: this many cards stay at the bottom of the library, so we never draw from an empty one.",
  ad_floor: 'Ad Nauseam: stop revealing cards at this life.',
  codie_dev:
    'AI choice. On: activate Codie in development ({4}, tap: WUBRG and a free spell) when mana is spare.',
  guides_dev:
    'AI choice. On: exile a Spirit Guide for mana to cast a land-fetch spell a turn earlier.',
  codie_early:
    'AI choice. On: cast Codie before the ramp spells. Off: Codie waits for them (its mana ability costs {4}, so it pays off only later).',
  rollout_solver:
    "On: the planner's copies of the game use the kill search to pick tutor targets (stronger, slower).",
};
