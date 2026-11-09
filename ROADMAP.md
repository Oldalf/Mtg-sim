# Roadmap: the next three decks

Gale is done (the adopted list is `decks/gale/lists/proposed.txt`). The next work, in order. Details and results of each step go in the deck's own `PLAN.md`; the engine history stays in the root `PLAN.md`.

## Phase 1: Meren, finish the simulation (short)

Goal: trustworthy Meren numbers, so the deck can be compared later. No cut or replacement tests for now (Pontus has no cut ideas yet).

**Status (2026-11-04): done.**

1. **Crackback rule: confirmed (2026-11-04).** A full swing with nothing left home costs as much life as we dealt; each untapped creature kept home cuts that by a third; Spore Frog = none. It's already in the engine and tested; only the docs needed updating.
2. **Turn planner for Meren.**
   - A Meren position score (`positionValue`): damage dealt and how close two opponents are to dead, creature power on the battlefield, devotion to black (Gray Merchant), Meren and her experience, creature cards in the graveyard, mana, cards in hand, and our life after the coming crackback.
   - Copying the game must also copy Meren's own references to permanents (prepared spells, end-step sacrifices and exiles).
   - Compare planner on/off with the same seeds. Keep it on only if it wins sooner and the run time is acceptable.
3. Re-record the Meren regress baseline and update the Meren numbers in `decks/meren/PLAN.md`.

Later, when Pontus has ideas: cut and replacement tests for Meren.

## Phase 2: Sam & Frodo (WBG)

**Status (2026-11-05): first version done** (`decks/samfrodo/`, details and results in its `PLAN.md`). Rules agreed, engine work done (two-colour lands, snarls, landfall hook, n-colourless sources, faster mana payment; Gale and Meren unchanged except Meren's snarl now entering untapped), 28 rules tests, planner on, first numbers (68.5% win by turn 10), a card ranking, and Pontus's first log analysed (the analyzer reads this deck's tokens, the Ring counter and +1/+1 counters; removal on our own Rapacious Guest added to the AI). Waiting for: more logs, and cut ideas.

What's needed from Pontus: the decklist (Archidekt export), a short description of how it wins, and one or two game logs.

1. **Agree on the rules** the same way as for Meren: win condition, what the opponents do, combat. Most of Meren's rules should carry over.
2. **Engine work** (whatever the list needs that Meren didn't): white mana is already in place; probably Food and other artifact tokens, life-gain triggers ("whenever you gain life"), and any mechanics specific to the commanders. Gale and Meren must stay IDENTICAL (`--regress check`).
3. **Deck folder** `decks/samfrodo/`: card rules, the AI's priorities, a position score for the planner, tests on hand-built boards, and log-analyzer hooks for the tokens and trackers in Pontus's logs.
4. **First numbers**, a card ranking (with interaction left out of the judgement), and then Pontus's own cut ideas.

## Phase 3: Simic landfall

Needs the most new engine work, so it comes last.

**Status (2026-11-07): done, in refinement.** The deck is `decks/aesi/` (Aesi, Tyrant of Gyre Strait); rules, loop solver, results and open items are in its `PLAN.md`.
- Rules agreed with Pontus; engine work done (land drops, landfall, land puts, loop solver, real land conditions for duals, `--diag` consistency measures). 58 rules tests, planner on.
- A new list (`decks/aesi/lists/package.txt`: land-fetch spells instead of cards that are sad without lands, Raft-Steerer, six duals) wins by turn 10 in 86% of games (82% before) and has slow starts in 9.7% (12.7% before). Pontus said it looks good; waiting for his small choices (see `PLAN.md`, "Open").

## Phase 4: a fifth deck

**Status (2026-11-07): waiting for Pontus.** He brings the decklist (Archidekt export), how it wins, and a log if he has one. Then: agree the rules (opponents, win condition, combat, anything new), `--fetch` the cards, engine work for whatever the list needs, the deck folder (rules, AI, tests on hand-built boards, planner score, mulligan rule, `--diag` measures, analyzer hooks), first numbers, a card ranking, and a primer with a MULLIGANS section. Most of what the earlier decks needed is in the engine now.

## Next session (updated 2026-11-07)

Start here. State: four decks run (gale, meren, samfrodo, aesi), all tests pass, regress baselines are current for all four (`--regress check` = IDENTICAL). Each deck has a `PRIMER.txt` and a mulligan rule; lands play by their real text; `--eco` runs in the background without loading the machine.

1. **A fifth deck** (phase 4, if Pontus wants it): he brings the decklist (Archidekt export), how it wins, and a log if he has one. Then the same steps as before: agree the rules, `--fetch` the cards, engine work, deck folder with tests, planner, mulligan rule, `--diag` measures, numbers, ranking, primer.
2. **Meren** (see `decks/meren/PLAN.md`, "Consistency measures"): Pontus's view of what "no meaningful impact" means for her; the old card ranking predates the planner; cut tests wait for his ideas; a new log would help.
3. **Sam & Frodo** (more likely to change; easier to spot here):
   - His logs contain missed triggers and misplays (game 1: see `decks/samfrodo/PLAN.md`). Treat a log as his draws and board, not as correct play.
   - Not modelled yet: Supper for Spiders after a board wipe, Lobelia's exiled cards, Voidborn's warp, Gilded Goose / Commander's Sphere sacrifices beyond mana, attacking with more than Frodo and Gollum short of an all-in.
   - Cut candidates he agrees with: Farmer Cotton, Mentor of the Meek, Unlucky Cabbage Merchant (Cultivate ranked low too). Ask for his replacements first; no cut tests before he names them.
   - A `--diag` with slow-start measures would be cheap now (`Game.spent` exists).
4. **Aesi** (see `decks/aesi/PLAN.md`, "Open"): his small choices on the package list (make `lists/package.txt` the default, Many Journeys, Search for Tomorrow vs Nature's Lore, which duals he owns); the low-ranked cards; the few unmodelled bits; more logs.
5. **Gale**: his goldfish feedback on the adopted list; ideas in `decks/gale/PLAN.md`.
6. Housekeeping: `decks/gale/lists/` and `decks/aesi/lists/` hold many finished test lists; keep the adopted ones.
