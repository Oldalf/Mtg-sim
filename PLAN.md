# Plan: step 11, engine split, a swap skill and deck follow-ups

Written 2026-11-17. Step 10 (Gale faster and safer, tasks R1 to R6) is done; its steps and notes are in git: `PLAN.md` at commit `6791b01`, the results in `decks/gale/PLAN.md`. `ROADMAP.md` has the steps before it.

Waiting on Pontus from step 10: whether to adopt `decks/gale/lists/speed.txt` (and to update `decklist.txt` once the cards are on the table).

The friends' decks (Helga, Ardyn, Teval, Thantis, DnD, Azula) are **pod-only**: no goldfish tuning, no mulligan study, no swap tests, no primer of ours, unless the owner asks (Pontus, 2026-11-15). The table plays bracket 2-3. Each deck's own `PLAN.md` says how it wins and what it does not model.

## How to read this plan

Each task names a model. Give it to that model or a stronger one.

| Model | Tier | What it gets |
|---|---|---|
| Claude Haiku 5.5 | S (small) | Mechanical work with exact steps. No design choices. A command says if it worked. |
| Claude Sonnet 5.5 | M (medium) | A feature or fix with a clear goal, in patterns the code already has. Small choices only. |
| Claude Opus 5.5, or Fable 5.2 | L (large) | Design, work across many files where judgement is needed, or writing that other models will follow. |
| **P** | Pontus | A decision or input. Tasks marked "after P" wait for it. |

Rules for every task:

- Read `CLAUDE.md` first (rule 0 names, KISS). For the engine also `ENGINE.md`, for the page also `app/web/CLAUDE.md`, for a new deck `/add-deck`.
- One task is one commit, straight on `main` (a big task may be a few commits, each one passing). `npm run format`, then `npm run verify` must end with VERIFY OK.
- Ask Pontus eco or full power before any task that runs simulations (`verify` with regress checks counts).
- Before changing pod code, save a fixed-seed pod run (`npm run pod -- gale meren samfrodo aesi edgar -n 200 --no-log`) and compare it afterwards; `--regress check` does not cover pod mode. `verify` also compares that run with `regress_baseline/pod.txt`; re-record it (`node scripts/verify.mjs --eco --record-pod`) only for a change Pontus accepted.
- An engine change must leave every existing deck IDENTICAL (goldfish and the pod run). A task that would change them stops and asks.
- A task that finds its steps do not fit the code stops and says so. It does not improvise a bigger change.
- When a task is done, add one line under it here: what was built and anything the next task must know. When the whole plan is done, it is cleared and a new one written.

## Order

| # | Task | What | Model |
|---|---|---|---|
| 1 | T1 | A skill for testing a swap | Opus 5.5 |
| 2 | T2 | Split `engine/game/game-core.ts` by topic | Opus 5.5 |
| 3 | T3 | Card rules shared between decks: Thunderclap Drake, Codie's missing cards | Opus 5.5 |
| 4 | T4 | Pod: why Gale is the first one out, and the cards not wired yet | Opus 5.5 |
| 5 | T5 | Gale's leftovers: planner speed, kill-search mana leftovers | Opus 5.5 |
| 6 | T6 | Meren: "no meaningful impact" and Pontus's changes (after P) | Sonnet 5.5 |
| 7 | T7 | Sam & Frodo: analyze Pontus's logs (after P) | Sonnet 5.5 |

T1 comes first because T3 to T6 all compare lists or settings; T2 before T3 so new engine rules land in the split files. T6 and T7 can run whenever Pontus's input arrives.

---

## T1. A skill for testing a swap (Opus 5.5)

Step 10 did the same steps by hand three times (R1, R3, R5). Write `.claude/skills/test-swap/SKILL.md` so any model can do them from one request ("test X for Y in gale").

1. What to ask first: the deck, the base list (`decklist.txt` or `lists/proposed.txt`), the swaps (one card out, one in, or several), the settings to run under (a deck may have more than one mode, as Gale's `hold_counter`), eco or full power. No cut tests until Pontus names the cards (the memory rule "cuts wait for the user's ideas").
2. Building the list: copy the base and replace the line in place (a different order deals different hands, see `ENGINE.md` "Noise"; never re-sort the list); check the card count; a card not in `data/cards.json` is added on the first run; say when a new card is played generically (the run prints a note) and stop if that card matters.
3. Running: 4,000 games per list on the same seeds to screen, 16,000 to decide (`ENGINE.md`); `--diag` where the deck has one; a pod run only when the swap is about interaction or defence.
4. Reporting: one table in the deck's `PLAN.md` (by turn, with backup when the deck has it, average turn, difference and noise), prices from `data/scryfall/oracle-cards.jsonl.gz` (`prices.eur`, dated) when Pontus has a budget, a plain verdict ("within noise" below the noise line). Remove the test lists, leave `decklist.txt` and `proposed.txt` alone; Pontus decides.
5. Try it on one real request and fix what the skill missed. List the skill in `CLAUDE.md` / `README.md` where `/add-deck` is.

Done 2026-11-17 (Opus 5.5): `.claude/skills/test-swap/SKILL.md`, listed in `CLAUDE.md` and `README.md`. Tried on R5's Merchant Scroll for Personal Tutor (4,000 then 16,000 games, both settings): the base rows matched R5 to the decimal, backup by T8 +3.9 / +3.7 (line under R5's table in `decks/gale/PLAN.md`). The trial added: check the base row against the old table, run times for the eco question, which settings get the 16,000 run, a re-run goes as one line under the old table. No price tool exists: the skill has a `node -e` one-liner over the Scryfall bulk file.

## T2. Split `engine/game/game-core.ts` by topic (Opus 5.5)

3,095 lines against the guide's 800 (`engine/game/game.ts` 978, `decks/aesi/game.ts` 1,192 and `decks/mike/game.ts` 962 are over too; leave those for later). The file's header already names its sections: state and helpers, mana, zones and drawing, effects of common cards, creatures, life and damage, casting, lands, choosing what to do (candidates, the planner), the turn, deck hooks, combat.

1. Design first: which sections become their own files, and how. `blink.ts`, `instant-speed.ts` and `common-permanents.ts` show the pattern already used: functions that take the game. Methods a deck overrides (the hooks) stay on the class; plain helpers move out. Write the design in `ENGINE.md` before moving code.
2. Move one topic per commit, each one IDENTICAL (`npm run verify`: every deck, the pod run, the logs). No renames or behaviour changes on the way; a fix found on the way is a separate commit.
3. Done when `game-core.ts` is the class, its state and its hooks, about 800 lines or a short list of why not; `ENGINE.md`'s folder table and "What the engine provides" name the new files.

Done 2026-11-17 (Opus 5.5): `game-core.ts` 3,095 -> about 1,540 lines, in 7 commits, each IDENTICAL (`verify`: every deck's regress, the tests, the pod run). New topic files: `mana-payment.ts`, `common-spells.ts`, `land-play.ts`, `planner.ts`, `turn.ts`, `goldfish-combat.ts`, and `checkKill`'s body in `kill-line.ts`. Every method a deck calls or overrides kept its name, as a one-line call; no deck changed. The design, and why the file is still over 800 lines, are in `ENGINE.md` "How the game class is split". For T3: a new card rule goes in a topic file (a new one if no topic fits), not in `game-core.ts`. Inside a topic file, call the game's methods (`game.tap`), not the file's own functions, so deck overrides still run. `engine/run/runner.ts` and `engine/tools/analyze.ts` call `game.mulligan()` over two lines, which a one-line grep misses.

## T3. Card rules shared between decks (Opus 5.5)

1. **Thunderclap Drake:** its sacrifice (copy the next instant or sorcery once per time the commander was cast) is modelled in Mike's folder (`drakeCopies` in `decks/mike/game.ts`, its use in `decks/mike/candidates.ts`) and listed as open for Gale. Move the card rule to the engine (the copies through `engine/game/spell-copies.ts`), keep the choice of when to sacrifice in each deck. Mike stays IDENTICAL; Gale's use in its kill search is a Gale change: report before / after on `lists/proposed.txt` and `lists/speed.txt` (T1's skill) and ask before re-recording.
2. **Codie's missing cards** (`decks/codie/PLAN.md` "Open"): its free-spell trigger (each activation: the next spell makes a random cheaper instant or sorcery free), then Mizzix's Mastery, flashback, Mana Drain, Bring to Light, Crop Rotation, Scapeshift and the land cards. Card facts go in the engine, Codie's choices in its folder. This is the road to Codie in the pod (Pontus, 2026-11-17: not yet, it is too far off). Pontus said Codie wins around turn 5 with protection at the table; compare with the simulator after each card and stop to ask when the gap stays big. Codie's baseline changes: ask before re-recording.

## T4. Pod: why Gale is the first one out, and the cards not wired yet (Opus 5.5)

R6: Gale is the first player out in about half its pod games (nearly all to life), and wins only when fast.

1. Trace 200 pod games where Gale goes out first (`npm run pod -- gale:lists/speed.txt helga ardyn teval --trace ...`, or the logged run): who attacks it, when, with what, what Gale held (blockers, Aetherize, mana). Write what you find in `decks/gale/PLAN.md` before changing anything.
2. Propose the fix to Pontus (for example: blockers or a fog cast earlier, `podDefence` for a combo deck, the attackers' threat rule) and build what he picks. A behaviour change in the pod: save the fixed-seed pod run first, report before / after, and re-record only when Pontus accepts.
3. The cards `POD_PLAN.md` lists as not wired in a pod (Diversion Unit, Siren Stormtamer's own ability, Soratami Savant, Mirror-Mage, Wash Out, Shire Shirriff, Vindictive Lich's sacrifice mode, Insidious Fungus, Bushwhack's fight, Crypt Incursion): wire the ones still in a current list, each with a pod test.

## T5. Gale's leftovers (Opus 5.5)

From `decks/gale/PLAN.md` "Open":

1. **Planner speed:** the planner is about 40% of Gale's run time. Run it only when the top plays are close in score (a setting, so both can be compared). Not IDENTICAL by nature: within noise at 16,000 games, and say how much faster. Ask before making it the default.
2. **Kill-search mana leftovers:** outside mana isn't used up by other spells; a dual that pays for High Tide still counts for Bubbling Muck; the AI doesn't save a rock to pay for High Tide. Each as a kill test first (`decks/gale/tests/kills.test.ts`), then the fix, then the numbers. Kill misses must stay 0 in 300 seeds.
3. Update Gale's "Open" list: drop what step 10 did (instant speed), keep what is left.

## T6. Meren: "no meaningful impact" and Pontus's changes (Sonnet 5.5, after P)

Meren's `--diag` has a first definition of a game with no meaningful impact (`noImpact` in `decks/meren/index.ts`: by the end of turn 5 / 6 nothing came back from a graveyard and the board has under 3 nonland permanents; 15.9% / 4.3% of games, `decks/meren/PLAN.md`). Pontus will say what counts as impact for this deck and which changes he wants to look at.

1. Ask Pontus for his definition and his changes (cards, AI choices or both). Change `noImpact` to match, with the old numbers next to the new.
2. Test his changes with T1's skill, judged by the new measure as well as the win turns. No cut tests beyond what he names.

## T7. Sam & Frodo: analyze Pontus's logs (Sonnet 5.5, after P)

Pontus will add real games to `decks/samfrodo/logs/` (one so far, `game1_t8_pippin_alpha.txt`, already analyzed in `decks/samfrodo/PLAN.md`).

1. Run `npm run sim -- samfrodo --analyze logs/<file>.txt` on each new log. The analyzer may need token names from the logs (`logToken` in `decks/samfrodo/game.ts`); add what is missing.
2. For each game: a row in `decks/samfrodo/PLAN.md` ("Pontus's games"), as Gale's table does: the result, missed kills, and AI fixes it led to. Logs contain misplays: use them for draws and the board, flag missed triggers, don't copy mistakes into the AI.
3. Add each log to the deck's regress (`regress.logLists` in `decks/samfrodo/index.ts` if the list differs) and re-record the baseline for the new log only.
