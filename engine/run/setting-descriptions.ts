/**
 * What the settings mean, in plain words, for the app's forms (a tooltip per setting). A deck's own settings are
 * described in its config.ts (`SETTING_DESCRIPTIONS`); a deck may also describe a shared setting again when it
 * means something special there. A test (app/server/decks-routes.test.ts) fails when a setting has no description.
 */

/** The settings of BASE_CONFIG, and the ones the engine reads for any deck that has them. */
export const SHARED_SETTING_DESCRIPTIONS: Record<string, string> = {
  opponents:
    'How many goldfish opponents there are. In a pod the real players are the opponents.',
  opp_life:
    "Each goldfish opponent's starting life. In a pod the real players' life is used.",
  opp_library:
    "Cards in each goldfish opponent's library at the start (99 minus the opening 7); matters for mill wins. In a pod the real libraries are used.",
  on_play_chance:
    'The chance we play first and skip the first draw (0.25 = 1 in 4, as in a 4-player pod). In a pod the seat decides.',
  search_budget:
    'How hard the AI looks for a winning line each time it checks: the most positions the kill search tries. 0 = no kill search (the deck checks its win its own way).',
  smart_mulligan:
    "On: the deck's own mulligan rule (decks/<deck>/mulligan.ts). Off: the old rule, keep 2 to 5 lands.",
  planner:
    'On: at each choice the AI tries its best few plays on copies of the game and keeps the one that ends best. Off: it plays by its fixed priorities (faster, weaker).',
  planner_width:
    'How many plays the planner compares at each choice (more = stronger and slower).',
  planner_rollouts:
    'How many random futures the planner plays out for each play it compares (the library is shuffled, so no peeking).',
  planner_budget:
    'How hard the planner looks for a kill when it scores a position (the kill search budget inside the planner). 0 = it does not look.',
  max_turn:
    'The last turn played. A game not won by then counts as no win. Shown as "Turns" in the Simulate form.',
  combat_safety:
    'Attack only if the crackback leaves us above this much life (an attack that wins is always made).',
  win_dead: 'Win when this many opponents are dead.',
  win_damage:
    'Also win when this much damage has been dealt to the opponents in total.',
};

/**
 * Settings that only make sense against goldfish opponents: a pod replaces them with the real players, the seats
 * and its own win rule (every other player dead, the decks' `podCfg`), so the pod form leaves them out. Setting one
 * in a pod would break the table (`opponents`) or let a deck win too early (`win_dead`).
 */
export const GOLDFISH_ONLY_SETTINGS = [
  'opponents',
  'opp_life',
  'opp_library',
  'on_play_chance',
  'win_dead',
  'win_damage',
];
