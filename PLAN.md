# Simulator: engine notes

The shared engine and how the project is run. Each deck keeps its own plan (`decks/<name>/PLAN.md`: rules, results, what is open), the phases and next steps are in `ROADMAP.md`, commands and layout in `README.md`. This file used to hold Gale's whole history; that moved to `decks/gale/PLAN.md`.

## Rules for changing the engine

- **Safety net:** after any engine change run `npm run sim -- <deck> --regress check` for all four decks (gale, meren, samfrodo, aesi). It replays 600 seeds, the log analyses and the tests and must print IDENTICAL. If a change is meant to alter a deck, check that only that deck differs, then `--regress record` for it. A new test also shows up as DIFFERENT: check that only the tests differ, then re-record.
- **Speed-ups** must be IDENTICAL. Behaviour changes must stay within noise on 2,000+ games, or be the intended change.
- **Noise:** about ±2.6 points at 3,000 games for a percentage. A different list order deals different hands, so lists are not paired: the same cards in another order differed by 2.4 points at 4,000 games and under 1 at 16,000. Use 16,000 games for decisions.
- **Pitfalls found the hard way:**
  - A subclass's field initializers run after the base constructor, so a deck's state is set in field initializers, not in a hook the base constructor calls.
  - `pay(..., commit = false)` taps lands and then undoes it (only `tapped` and the pool). Side effects in `tap()` (life loss, sacrifices) leak into every payment check: do them when `pay` commits.
  - A card's X is 0 in the card data. Backslashes get lost in heredocs and JS template strings written through the shell: check regexes after writing them.
  - Card data comes from Scryfall's bulk files (`engine/scryfall.ts`, `npm run cards -- update`, run by hand when new sets are out). Cards a list needs are copied into `data/cards.json` automatically before a run.

## What the engine provides

- **Cards** (`engine/cards.ts`): data from Scryfall, with facts that hold in any deck (lands, rocks, cost reducers, counters, tutors, draw spells). Unknown lands are read from their text (colours, "enters tapped", `LandInfo.cond` / `pain` / `colourless` / `colourIf`). **Lands play by their real text for every deck** (`Game.entersTapped`): always-tapped lands, snarls (reveal a card of the types from the hand), check lands (control a land of those types, battle lands count), fast lands (two or fewer other lands), slow lands and battle lands (two or more basic lands), Sunken Hollow. Pain lands deal 1 damage only when tapped for a pain colour (a generic cost uses the free {C}, or the free colour of Murmuring Bosk), dealt when a payment is made, not when it is only tested. Tainted Wood makes coloured mana only with a Swamp. Not modelled: filter lands (Twilight Mire is played as a dual), Hideaway, Bojuka Bog's exile. Mana kinds: a colour, `A` (either of the deck's colours), `UB` / `GU`-style pairs, `C<n>` (n colourless).
- **Game** (`engine/game-core.ts`, plus the pod parts in `engine/game.ts`): zones, mana and payment, lands, casting, creatures (power / toughness, counters, tokens), enter and death triggers, sacrifice, devotion, life and damage, the turn loop, mulligans, and the turn planner. A deck subclasses `Game` and fills in the hooks listed in the header of `game-core.ts` (`candidates`, `cardValue`, `positionValue`, `tutorTarget`, `onEnter`, `onDies`, `upkeep`, `endStep`, `combat`, `onLandEnter`, `resolveOther`, `diag`, ...). Gale is the worked example for a kill-search deck, Meren for combat, Sam & Frodo for tokens, Aesi for loops.
- **Mulligans:** one free mulligan (a new 7), then London. A deck's rule is plain data in `decks/<name>/mulligan.ts` (format and examples: `engine/mulligan.ts`): per attempt (the first 7, the free mulligan's 7, 6 cards) a list of "keep if" clauses, each a land range plus needs (a colour source, a card tag, a cheap spell), and a floor of cards that is always kept (5). A deck without a rule keeps 2–5 lands. `--set smart_mulligan=0` plays the old 2–5 rule for comparison. To change a rule: edit the file, compare with `--set smart_mulligan=0` on 8,000+ games, then re-record the baseline. `--hands` shows how opening hands do by land count and contents (the evidence behind the rules and the primers).
- **Planner:** tries the best few plays on copies of the game and keeps the best (`planner_width`, `planner_rollouts`), with a deck-specific `positionValue`.
- **Goldfish combat** (`creatureCombat`, agreed for creature decks): flyers connect; opponents block half of the other attackers (rounded down), the biggest; crackback = a full swing with nothing left home costs as much life as it dealt, each untapped creature kept home cuts a third; a fog creature (Spore Frog) removes it; an attack that wins is always taken; otherwise the biggest attack that keeps us above `combat_safety` (10). Decks may override (Sam & Frodo and Aesi attack with flyers or a few creatures only).
- **Tools:** `--rank` (cards seen by turn 4; a deck's interaction is left out via `rankProtect`), `--cut`, `--analyze` (Archidekt logs: `logTrackers`, `logToken`, `logSacOnTap`, `syncFromLog` per deck), `--diag` (a deck's own consistency measures: `Deck.diagMetrics` and `Game.diag()`; `Game.spent` / `spentEnd` track the mana paid for every deck, Aesi and Meren use them for the slow-start measure), `--hands` (raw opening 7s by land count and by a deck's `handFeatures`, with the average mulligan to 6 as the yardstick; the basis of the primers' MULLIGANS sections), `--trace`, `--regress`.
- **Power-save mode** (`--eco`, `--duty N`, `-w N`): `setDuty` in the runner makes each worker rest after a chunk so it is busy only that share of the time; `cli/eco.ts` sets below-normal priority and a quarter of the cores. The seeds don't depend on the worker count, so results are identical (checked with `--regress check --eco`). Use it for long runs while Pontus plays.
- **Speed:** 3,000 games take about 11 s (Meren), 25 s (Aesi), 45 s (Gale) and 50 s (Sam & Frodo, big token boards).

## History (one line each)

- 2026-11-04: Gale in Python → shared engine split from the deck (IDENTICAL) → port to TypeScript (about 5× faster; kill tests, 6 log analyses and kill rates matched) → five-colour mana, creatures, tokens, life and damage, goldfish combat → Meren (planner, crackback confirmed).
- 2026-11-05: Sam & Frodo (two-colour lands, snarls, landfall hook, faster payment); Aesi (land drops, land puts, loop solver, `--diag`).
- 2026-11-06: Aesi package list; dual lands with real conditions (Aesi only).
- 2026-11-07: mulligan rules per deck; conditional lands and pain lands play by their text for every deck (Meren and Sam & Frodo re-recorded: about half a point and two points slower by turn 10); the old Python removed.

## Ideas for later

- Play at instant speed on opponents' turns (Gale's Wizards of Thay, end-of-turn draws and tutors).
- Planner only when the top plays are close (about 40% of Gale's run time).
