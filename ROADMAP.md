# Roadmap

Decided 2026-11-12 (Pontus). The big steps below go in this order. Deck work (new decks, cuts, logs, refinements, pod steps) is ongoing, happens before, during or after these steps, and is not part of the roadmap. It lives in each deck's `PLAN.md` and in `POD_PLAN.md`. The goal of the roadmap is to make that ongoing work easier.

## Where the project is going (Pontus, 2026-11-15)

A heavy engine and light decks. The engine runs the turns and owns the rules of the cards (what a card does, in any deck), split by topic into files that are easy to read. A deck makes the decisions: what to cast, attack, keep or fetch, using what the engine tells it it can do, and it handles only the few things that are its own (its win, its combo). Each step moves a little more into the engine: step 8 moves what the friends' decks need.

## 1. Code follows the coding standards (CLAUDE.md) (done)

- Prettier is set up and the code is formatted (`npm run format`).
- Done: the existing code was brought in line with CLAUDE.md (rule 0 names, readability, KISS, rule of three). Every change left `--regress check` IDENTICAL for all decks and pod output unchanged.
- Known leftovers: card-nickname constants in aesi (e.g. `BSZ`, `OMNI`), a few 3+ letter abbreviations, and `engine/game/game-core.ts` is still about 2,280 lines.

## 2. Scryfall bulk data replaces per-card fetching (done)

- `npm run cards -- update` downloads Scryfall's oracle cards and rulings (gzipped JSONL) into `data/scryfall/` (not in git), with `bulk-info.json` next to them (download date, latest set). It is run by hand, once now and again when new sets come out.
- The files stay gzipped and are streamed line by line; only matching cards are parsed. The simulator still reads only `data/cards.json` (in git: the cards the lists use, now with Scryfall ids; rulings are downloaded but stay out of it, `rulingsFor` reads them), so run speed is unchanged. Cards missing from it are added from the bulk data automatically before a run.
- `npm run cards -- refresh` rebuilds the stored cards from the bulk data and lists the ones whose rules text changed. Run once: no card changed in a way that affects play, `--regress check` is IDENTICAL for all decks, pod output unchanged.
- Images are not downloaded. Each card keeps its `scryfall_id`, so images can later be fetched for just the cards the lists use.

## 3. Game logs (done)

- Every game of a `sim` or `pod` run is logged as events: a readable line plus its card moves in Archidekt's simple format, the format of the logs Pontus has provided. A goldfish game, a pod game and a real Archidekt log share one format. The plan and what was decided on the way are in git (`PLAN.md` at commit `df7eca7`); `ENGINE.md` has the rules for new code.
- The games worth reading get a tag (fastest, slowest, average, win-stopped...) and are saved as text; `npm run logs` reads any game, with its card moves, its highlights or the board at the end of each turn.
- Logs live in `session-logs/` (not in git) and are cleared when the next `sim` or `pod` command starts a run. Until step 4 there is no application to start, so one session is the last run command.
- Every zone change in the engine and the decks goes through the engine's functions (`takeCard`, `putCard`, `moveCard`...), which record it; `--test` fails on one that does not. Results did not change: `--regress check` IDENTICAL for all decks.
- For step 4: the board at any point is rebuilt from the moves (`boardAt`), and a game can be played again from its run (`replayGame`).

## 4. App with a simple UI (first step done 2026-11-14)

- `npm run app` starts a local server (Node's own `http`, 127.0.0.1:4173, inside the simulator's bundle so the worker threads work as before) and opens an Angular page (Angular Material, dark). The plan and its notes per task are in git (`PLAN.md` at commit `4588599`); `README.md` has the commands and folders, `ENGINE.md` what the server calls, `app/web/CLAUDE.md` the page's rules.
- Pages: Decks (decklists by section, card images), Simulate (one deck, one or more lists, settings, `--diag`, progress and stop, kill-turn tables and chart, games worth a look), Pod (3 to 6 seats, threat, policy, settings, the pod report), Games (the runs of the session, filters, each deck's real Archidekt logs) and the game viewer (log by turn, the board after any line, stepping by line, turn and highlight). The viewer is a table you can watch (step 5, done 2026-11-14): a grid of seats that keep their place, a caption under the table, a control bar with a scrub bar, autoplay, and a log drawer; checked at 1 to 6 seats, real logs and a 390 px phone width.
- Card images come from Scryfall by `scryfall_id` and are kept in `data/scryfall/images/`; without them a card shows as text.
- Tests: `npm run app -- --test` (the API) and `ng test` in `app/web/` (the board of the viewer, the report tables, the two forms); `npm run verify` runs both.
- Left for later: pick the print of a card in a decklist (for its image): the image call and the card component already take a Scryfall id (`?print=`); still to do are the list of prints of a card (from Scryfall's search, not in the bulk data) and a place for the choice in the decklist file. Not in the app yet (still on the command line): `--rank`, `--cut`, `--hands`, `--analyze`, `--regress`, the card data commands, editing lists.

## 5. Tidy up and a game you can watch (done 2026-11-14)

The plan and its notes per task are in git (`PLAN.md` at commit `85acdc5`).

- Fewer decklists: each deck keeps `decklist.txt` (the original), its adopted list as `lists/proposed.txt` and the alternatives named after what they change. The app's archive switch is gone.
- The engine is in folders by topic (`cards`, `game`, `game-log`, `pod`, `run`, `tools`, `util`); `ENGINE.md` has the table.
- `/add-deck` (`.claude/skills/add-deck/SKILL.md`) walks a model through adding a deck; it was tried on the Edgar deck.
- The game viewer has autoplay (Space, three speeds, kept in `localStorage`), the line in the URL (`?line=`), and is a grid table of seats that keep their place (see step 4), checked at 1 to 6 seats, real logs and phone width.

## 6. What Pontus saw in the viewer (done 2026-11-15)

The plan and its notes per task are in git (`PLAN.md` at commit `330b641`).

- Whole game rows are links; the caption keeps one height while autoplay runs.
- The fastest and slowest tags go only to games won on the earliest and latest turn (none when every game won on the same turn), `most-interaction` the same way.
- Energy, experience and poison are player counters in the engine, the log and the viewer (a chip on the seat).
- Volatile Stormdrake takes a creature in a pod: a permanent can change control between players (`Permanent.owner`, `GameCore.giveControlTo`), with energy paid to keep it.
- Tokens: the deck owns a token's stats, Scryfall only gives its art (`data/token-art.json`, `pickTokenArt`). The log writes a creature token's face next to its name, so tokens with the same name and other stats stay apart; Aesi's armies are logged as x999. The viewer shows a creature token as Scryfall's art in our own frame with the game's stats, other tokens as their Scryfall token card.
- D4 was committed without `npm run verify` (Pontus skipped it); step 7 runs it first.

## 7. Mana as it really is, then Pontus's ideas (done 2026-11-15)

The plan and its notes per task are in git (`PLAN.md` at commit `ed1a598`).

- A wrong Gale win fixed (a filter Signet counted as free mana by the kill search).
- Mana is tapped in order into a floating pool that empties between the steps of a turn; kill lines are played for real, and `pay` tries other orders when the first fails. The log says what paid for each spell, and the viewer shows the pool as a chip on the seat.
- Meren's Snake (Ophiomancer) has deathtouch and comes at each upkeep.
- In the viewer a card grows on hover, focus or tap.
- The Games tab has a stats page per run (the report is stored with the run).
- Gale's kill search misses 0 of 300 seeds (step 9 done, see `PLAN.md` E1).

## 8. The friends' decks for game night, and Gale's kill search (done 2026-11-15)

The plan and its notes per task are in git (`PLAN.md` at commit `c88cda4`).

- The engine took over card rules the decks kept writing for themselves (land search, reanimation, common permanents, doubled triggers), and a deck is registered in one place (`decks/index.ts`); a pod-only deck has a light path (`/add-deck`).
- The friends' decks were added as pod-only decks: Helga, Ardyn, Teval (then Thantis, DnD and Azula), and the game-night pod was run.
- Gale's kill search taps lands and counts mana for real (task E1, the old step 9): 0 kill misses in 300 seeds.

## 9. After game night (done 2026-11-16)

The plan and its notes per task are in git (`PLAN.md` at commit `ff164f7`), tasks G1 to G14.

- DnD mapped from its owner's primer; Helga's annihilator and the Eldrazi's removal in a pod; Daze, Bilbo's Gambit and Silence-type protection; Codie's wins can be answered; a blink in an opponent's turn returns at the end of that turn; the initiative passes on; spells cast through a deck's own code trigger the opponents' cast triggers.
- More card rules moved to the engine (black tutors, land search, no maximum hand size), and Meren, Edgar and Sam & Frodo run on the shared `CreatureDeckGame`.
- DnD blinks in answer to removal and wipes (G14). Azula's pilot task (B7) is parked in `decks/azula/PLAN.md`.

## 10. Gale faster and safer, within about 15 € (done 2026-11-17)

The plan and its notes per task are in git (`PLAN.md` at commit `6791b01`), tasks R1 to R6; the results are in `decks/gale/PLAN.md`.

- Gale has a `--diag` (what a slow game is missing). The engine has an opt-in window at the end of the opponents' turns with flash for sorceries (`engine/game/instant-speed.ts`, setting `opponents_end_step`), and Gale a `hold_counter` setting; both are off by default. Holding a counterspell up costs Gale about 9 to 11 points by turn 7; the window wins back about 2.
- Merchant Scroll and Mnemonic Wall are engine card rules.
- The pick is `decks/gale/lists/speed.txt` (Merchant Scroll, Rain of Filth and Aetherize for Personal Tutor, Wizards of Thay and Mocking Sprite, about 9 €): +4.7 points by turn 7 in goldfish, and about +4 points of win rate in lower-bracket pods. Pontus decides whether to adopt it.

## 11. Engine split, a swap skill, and deck follow-ups (in progress)

The plan is in `PLAN.md` (tasks T1 to T7): split `engine/game/game-core.ts` by topic, a skill for testing a swap, card rules shared between decks (Thunderclap Drake, Codie's missing cards), pod gaps, Gale's leftovers, Meren's "no meaningful impact" with Pontus's ideas, and Sam & Frodo's logs.

## Ideas not decided (Pontus picks)

Each names the model it would need. Pontus dropped the others on 2026-11-15 (shorter engine file names, a rule for test lists, the app knowing the adopted list, step 1's leftovers, a "watch" button). Splitting `game-core.ts` and the swap skill are now tasks of step 11.

1. **One board, not two** (Sonnet 5.5). `engine/tools/log-board.ts` (the analyzer and `npm run logs`) and `shared/game-log-board.ts` (the viewer) each rebuild the board from the logged card moves with their own code, so a fix in one can be missed in the other. Pontus is unsure it is needed.
2. **Azula plays its combos like a pilot** (Opus 5.5): task B7 in `decks/azula/PLAN.md`, parked until Pontus wants Azula in the pod.
