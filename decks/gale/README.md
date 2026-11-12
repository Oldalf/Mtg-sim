# Gale, Waterdeep Prodigy + Scion of Halaster

Dimir spellslinger combo. Run with `npm run sim -- gale ...` from the project root (see the root README).

## Files

| File | What it is |
|---|---|
| `decklist.txt` | The list as first given (the adopted list is `lists/proposed.txt`, see PLAN.md). |
| `lists/` | Test lists (`proposed.txt` is the adopted list, see PLAN.md). `lists/cuts/` holds cut-test variants, `lists/old/` older results. |
| `logs/` | Archidekt playtest logs of real games, for `--analyze`. |
| `game.ts` | `GaleGame`: its state, the engine hooks, Scion's draw, the Mindskinner's attack, and what the AI values (`cardValue`, `devValueIS`, `positionValue`). |
| `candidates.ts` | What the AI may do now (`buildCandidates`), Gale's recast, countering its own spell. |
| `tutoring.ts` | What to tutor for (`chooseTutorTarget`) and which Gifts Ungiven pile to make. |
| `spells.ts` | What the spells only this deck uses do when they resolve. |
| `snapshot.ts` | Builds the state the kill search starts from. |
| `kills.ts` | The kill search and its cheap pre-filter. |
| `kill-state.ts` | The state the search works on (`KillSearchState`) and what spells do to it. |
| `kill-moves.ts` | The moves of the search: every combo line below. |
| `chain-probability.ts` | The Konrad chain check with real shuffles. |
| `roles.ts` | Which cards are combo pieces, engines, held for the kill; the packages and card scores. |
| `config.ts` | Settings (`--set key=value`). |
| `index.ts` | What the CLI loads for this deck. |
| `tests/kills.test.ts` | Hand-built boards that must or must not be a kill (`--test`). |

## What is modelled

- Mana: colours, lands that enter tapped (with their conditions), filters, Sol Ring, High Tide, Bubbling Muck and Energybending, Frantic Search / Snap / Turnabout untapping lands, and all cost reducers (Baral, Case, Sprite, Drake, Wizards, Voracious Reader, Geist, Nightscape, Medallion, Emet-Selch).
- Gale: casting an instant or sorcery from hand lets you cast one of the other type from the graveyard. That spell resolves first and is exiled afterwards. The kill search also handles responding with ritual mana while the hand spell is still on the stack.
- Scion of Halaster's look-at-two on your first draw, Archmage Emeritus, Academy Wall, Secrets of the Dead, Case solving, Homunculus transforming.
- Kill lines are found by search, not hard-coded:
  - Guildmage + Mindcrank loops; Guildmage + a big mill (kicked Cacophony, Singularity Rupture, ...)
  - Kicked Cacophony + Riverchurn exhaust
  - Mindskinner + Syr Konrad
  - Konrad (+ Mindcrank) chains, counted only if they win at least 90% of the time with real shuffles
  - Poison: Prologue to Phyresis + Expansion Algorithm (poison stays across turns)
  - Emet-Selch recasts; Windfall
  - Countering your own spell to trigger Gale: An Offer You Can't Refuse (+2 Treasures), Unwind (untap 3 lands), Counterspell, Arcane Denial, Mana Sculpt, Dispel
- Outside the kill, the AI may also counter its own cheap spell with Offer / Unwind so Gale recasts a sorcery (`self_counter_dev`).
- Gifts Ungiven builds the pile whose worst split (the opponent chooses) is best. Tutors pick the card that makes a kill possible this turn or next; failing that, the missing piece of the combo closest to completion, or a counterspell if a combo is already assembled. Muddle the Mixture can transmute for a mana-value-2 piece.

## Settings (`config.ts`)

| Setting | Default | Meaning |
|---|---|---|
| opponents / opp_life | 3 / 40 | |
| opp_library | 92 | opponents' library size at the start (each draws 1 per round) |
| opp_creature_density | 0.30 | share of opponents' cards that are creatures (for Syr Konrad chains) |
| opp_hand_size | 5 | cards each opponent discards to Windfall |
| on_play_chance | 0.25 | chance you are the first player and skip your first draw |
| planner, planner_width, planner_rollouts, planner_budget | on, 4, 2, 300 | the turn planner |
| gifts_budget, gifts_shortlist | 120, 5 | how hard Gifts Ungiven searches for the best pile |
| ramp_tutor | off | early tutors fetch ramp when mana is short |
| smart_mulligan | on | the deck's mulligan rule (`mulligan.ts`); off = keep 2 to 5 lands |
| self_counter_dev | on | counter your own spell for Gale outside the kill |
