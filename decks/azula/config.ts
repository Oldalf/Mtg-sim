/** Settings for the Azula deck (change one with: npm run sim -- azula --set key=value). */
import { BASE_CONFIG, Config } from '../../engine/game/game-types';

export const CFG: Config = {
  ...BASE_CONFIG,
  max_turn: 14,
  win_dead: 3,
  combat_safety: 10,
  // a goldfish game has no real opponents: what Jeska's Will and Mana Geyser count (a pod counts the real ones)
  opp_hand: 7,
  opp_tapped_per_turn: 2.15,
  azula_attacks_to_cast: true,
};

export const SETTING_DESCRIPTIONS: Record<string, string> = {
  win_dead:
    'Win when this many opponents are at 0 life (3 = all of them). A pod always needs every other player dead.',
  opp_hand:
    "Goldfish only: cards in each opponent's hand (Jeska's Will makes {R} for each card in one opponent's hand). A pod counts the real hands.",
  opp_tapped_per_turn:
    'Goldfish only: tapped lands the opponents control in all grow by this much each turn (Mana Geyser). A pod counts the real lands.',
  azula_attacks_to_cast:
    'AI choice, pod only. On: Azula attacks whenever we hold a spell to cast in combat (she copies it), even into blockers. Off: the pod rule decides (made no difference over 1,000 games).',
};
