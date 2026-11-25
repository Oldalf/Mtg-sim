---
name: add-deck
description: Add a new Commander deck to this goldfish simulator, the way gale, meren, samfrodo, aesi, mike and codie were added. Covers what to ask Pontus first, which deck to copy from, the files of a deck folder, where to register it, the order of work, the engine rules, the optional pod layer and when it is done. Use it whenever someone wants a new deck simulated, says "add a deck", "new deck", "simulate my friend's deck", pastes an Archidekt export for a deck that has no folder in decks/ yet, or wants an existing deck re-added under another name.
---

# Add a deck

A deck is one folder, `decks/<name>/`, with a `Game` subclass that plays it, plus a few lines that register it. This skill says what to build, in what order, and when it is done. It is written from the six decks that exist; when this skill and the code disagree, the code wins: stop and say so.

Read `CLAUDE.md` (rule 0 names, KISS) and the "Rules for changing the engine" in `ENGINE.md` before writing code.

## 1. Ask Pontus first

Do not start coding until you have these. Ask for all of them in one message:

1. **The list**: an Archidekt export (text, with section headings such as `Commander`, `Ramp`, `Removal`). It becomes `decklist.txt` as given.
2. **The commander** (or the two partners).
3. **How the deck wins**, in his words: the main kill and the backup plans. This becomes the win check and the "How the deck wins" section of the deck's `PLAN.md`.
4. **The bracket** (1 to 5). It sets how fast a turn count is "good" and `max_turn` (bracket 2-3 decks use 14).
5. **Whose deck it is**: his own, or a friend's (codie is a friend's). A friend's deck gets no swap proposals unless he asks.
6. **Real game logs** if there are any (Archidekt game logs, text). They go in `logs/`, named `game<n>_t<turn>_<how it won>.txt`.
7. **What he wants from it**: speed, consistency, fun, or a question to answer (which cut, which mulligan).

Two standing rules apply:

- **No cut tests until Pontus names the cuts** (and what replaces them). The card ranking (`--rank`) may be shown; turning it into cuts is his call.
- **Logs contain misplays.** Use a log for what was drawn and what was on the board. Do not copy its plays as the right line, and say so when the log missed a trigger or a kill.

Then agree the **simulation rules** with him and write them down (section 8 below): what counts as a win, which measure is the second number, how combat works, what is not modelled. Every deck's `PLAN.md` has this section; look at `decks/meren/PLAN.md` for the shape.

## 2. Pick a deck to copy from

Copy the structure of the deck closest to the new one, not its card rules.

| The new deck wins by... | Copy from | Why |
|---|---|---|
| A combo the AI must find each turn (a kill search over spells) | `gale` | `kills.ts`, `kill-state.ts`, `kill-moves.ts`: a search with its own state |
| Creatures, combat and value, a big drain spell | `meren` | `GameWithoutKillSearch`, the turn planner, enter / death `triggers.ts` |
| Tokens, sacrifice and drain | `samfrodo` | Token boards, `combat.ts`, Food / Treasure in logs |
| Loops (lands, untaps, infinite mana) | `aesi` | `loops.ts`: a loop is shortcut by a solver, not played step by step |
| A fixed sequence of spells found by a solver (storm-like) | `codie` | `solver.ts`, `solver-actions.ts`, `finishers.ts` |
| Drawing, alternate wins (mill, card counts) | `mike` | Its own `draw()`, several win types, `winAttempt` for the pod |
| Nothing: the smallest deck that runs | `goldfish` | One file, `index.ts`. Start here to see the minimum |

Most new decks are like meren or samfrodo: extend `GameWithoutKillSearch` (in `engine/game/game.ts`) and win through `checkKill()`. Only a combo deck needs a kill search like gale's.

## 3. The files of a deck

Rule 0 applies to every name in them. Split a file at about 800 lines (`game.ts` is usually the one that grows: move cards into `actions.ts` / `triggers.ts`).

| File | What it holds |
|---|---|
| `decklist.txt` | The list as Pontus gave it. Never edited; changes go in `lists/`. |
| `index.ts` | `export const deck = { name, dir, defaultList, config, Game }` (the `Deck` type in `engine/run/runner.ts`), plus optional extras: `settingDescriptions`, `metrics` (the names of the two numbers), `compareTurns`, `rankProtect` / `rankTurn`, `diagMetrics`, `handFeatures`, `logTrackers`, `logSacOnTap`, `podCfg`. `decks/samfrodo/index.ts` shows most of them. |
| `config.ts` | `CFG = { ...BASE_CONFIG, max_turn, ... }` and `SETTING_DESCRIPTIONS` (one sentence per deck setting, shown as the app's tooltips). Each setting can be changed with `--set key=value`. |
| `game.ts` | `class <Name>Game extends GameWithoutKillSearch` (or `Game<State>` with a kill search). A header comment like `decks/mike/game.ts`: the files, how the deck wins, the second measure. It fills in the hooks listed in the header of `engine/game/game-core.ts` (and the pod hooks in the header of `engine/game/game.ts`). |
| `cards.ts` | The card names as constants (`export const GRAY_MERCHANT = 'Gray Merchant of Asphodel'`), the deck's tokens, `VALUE` (how much the AI wants each card on the battlefield), `HOLD` (cards never cast in a goldfish game, such as removal), and `C.registerKnown([...])` for every card the deck gives rules to. |
| `candidates.ts` | `buildCandidates(game)`: everything the AI may do now, each with a score, a cost and an action. The planner picks between the best few. |
| `mulligan.ts` | `MULLIGAN: MulliganRule`, plain data (format in `engine/game/mulligan.ts`): card tags, then per attempt a list of "keep if" clauses, and `alwaysKeep: 5`. |
| `tests/<name>.test.ts` | `run<Name>Tests(): boolean`: hand-built boards, one `check(label, got, expected)` per rule. `decks/mike/tests/mike.test.ts` shows the `board(...)` helper. |
| `PLAN.md` | The deck's own plan: rules, results, what is open (section 8). |
| `logs/` | Pontus's real games, if any. |
| `lists/` | Later: other versions of the list (`proposed.txt` is the adopted one). |
| `PRIMER.txt`, `SWAPS.md` | Later, when Pontus asks: the primer for Archidekt (plain text, short, no markdown) and the swaps he made (newest first, older sections below; Aesi still has an older `SWAPS.txt`). |

Other files (`actions.ts`, `triggers.ts`, `combat.ts`, `spells.ts`, `loops.ts`) come when `game.ts` grows; name them by topic.

## 4. Where to register it

A deck is registered in one place: `decks/index.ts` imports its `deck` object and adds it to `DECKS`. Everything else is on the deck's own `deck` object in its `index.ts`:

- `tests: run<Name>Tests` (its `--test`).
- `regress: { lists: ['decklist.txt'] }` (what `--regress` records). Leave it out for a pod-only deck: it has no goldfish baseline.

`npm run verify` asks the simulator for the deck names (`node dist/sim.js --list-decks`), so nothing to add there. Two things stay by hand:

1. `scripts/verify.mjs`: `POD_DECKS` only if Pontus wants the deck in the fixed-seed pod run (that changes `regress_baseline/pod.txt`: re-record it on purpose, and say so in the commit).
2. `README.md`: one line under "Current decks" (commander, colours, archetype, bracket, how it wins, `npm run sim -- <name>`).

The app reads `DECKS`: check that the deck shows on the Decks page.

## 5. The order of work

One step at a time; each step ends with something that runs. Ask Pontus "eco or full power?" before each step that runs simulations (`npm run verify` with regress checks counts); eco is `--eco` on `sim` and `-- --eco` on `verify`.

1. **Card data.** Put the list in `decklist.txt` and run `npm run sim -- <name> -n 50` (after a first registration, step 2). Cards missing from `data/cards.json` are copied from the Scryfall bulk data automatically. A card that is not found is from a newer set: `npm run cards -- update`, then try again. The run prints the cards it plays generically (by type and cost, not by their text): that is the list of cards to give rules to, most important first. A card leaves the list when `cards.ts` passes it to `C.registerKnown`.
2. **A game that plays.** `index.ts`, `config.ts`, `game.ts` with the must-have hooks only (`candidates` returning casts of what is in hand, no win yet), registered in `DECKS` (`decks/index.ts`). Check with `npm run sim -- <name> --trace 1`: lands are played, spells are cast, the mana is right.
3. **The win.** `checkKill()` returns 2 when the game is won (`areOpponentsBeaten()`, or the deck's own win); `play()` returns the two numbers (`[win turn, second measure]`). Then the cards that matter most to the win get their rules, in `cards.ts` and `game.ts`.
4. **Tests.** `tests/<name>.test.ts` with one check per rule written so far; add it as `tests` on the deck's `deck` object. `npm run sim -- <name> --test` must exit with code 0 (it prints one OK / BAD line per check, no ALL OK line). From here, every new card rule gets a test in the same change.
5. **The other cards**, most important first, until `--trace` games look like a real game. Read three or four traced games each round; a log of Pontus's (`npm run sim -- <name> --analyze logs/<file>`) shows where the AI plays differently from him.
6. **The first numbers**: `npm run sim -- <name> -n 3000`, then 16,000 games for anything Pontus decides on. Put them in `PLAN.md` with the game count. `--rank` may be shown, not cuts (section 1).
7. **The mulligan rule** from `npm run sim -- <name> --hands -n 8000`: which land counts and cards win, written as `mulligan.ts`. Compare with `--set smart_mulligan=0` on 8,000+ games.
8. **The baseline.** Add `regress` to the deck's `deck` object, then `npm run sim -- <name> --regress record` and `--regress check` (must print IDENTICAL). Commit `regress_baseline/<name>.json`.
9. **The deck's `PLAN.md`** (section 8). Pontus may then ask for `PRIMER.txt` and swap tests.

## 6. The rules

- **Card facts that hold in any deck go in the engine** (`engine/cards/` for card data and facts, `engine/game/game-core.ts` for game rules). Deck-specific behaviour stays in the deck's folder. An engine change must leave every other deck IDENTICAL: `npm run verify` checks it. If a change is meant to alter another deck, stop and ask Pontus.
- **Zones change only through the engine's methods**: `takeCard`, `putCard`, `moveCard`, `takeTopCardsOfLibrary`, `putCardsOnTopOfLibrary`, `putOntoBattlefield`, `takeFromBattlefield` (and `draw`, `discard`, `toGraveyard`, `enter`, `dies`). `this.hand.push(card)` breaks the game log and `--test` fails on it.
- **The log**: `say(...)` for a note, `sayEvent(kind, ...)` for a line of a known kind, `sayHighlight(...)` for a line worth jumping to (a win, a big turn). Name an opponent with `opponentName(slot)` and print life totals with `describeOpponentLife()`, so pod logs show deck names.
- **Deck state goes in field initializers**, not in a hook the base constructor calls (they run after it). The planner plays on copies made by `clone()`, which copies arrays but shares a `Set`, `Map` or object: override `clone()` to copy those (see `decks/mike/game.ts`).
- **`pay(..., commit = false)` is a test payment**: side effects of tapping (life, sacrifice) happen only when it commits. The engine's `ritualCandidates` also pays for real inside a snapshot and then undoes it: a deck whose payments sacrifice permanents (Treasures, Spawn) must switch that off while it runs (see `isTestingRitual` in `decks/edgar/game.ts`), or the candidate list changes between calls and a game crashes in the planner ("reading 'action'").
- **Identical tokens that differ in counters or tapped state** (Vampire tokens after an attack trigger) are told apart by name only in a log. The recorder corrects this itself (`MoveRecorder`); if `--test` still reports "the board rebuilt from the log" differences, look first for a zone change made by hand, or a card taken out of a zone before it really leaves (Nine-Lives Familiar waiting for the end step stays in the graveyard until then).
- **A hand-built test board with `game.arena` set to a stub** (`{ real: () => true }`) is a pod game for `inArena()`: that is how to test a `winAttempt` without a whole pod (`decks/edgar/tests/edgar.test.ts`).
- **How to answer "how does it win?"**: tag the damage by source (combat, drains, a combo piece) in `damageOpponent`, return the source of the killing blow from `diag()` and add `diagMetrics` for it (`decks/edgar/index.ts`: `winTypeMetrics`). Then `--diag` shows it.
- **On this machine** Node comes from fnm and PowerShell swallows `--` after `npm run`: see the memory note "Running node here" (use `node dist/sim.js <deck> ...`).
- **A card's X is 0 in the card data**: compute X in the deck.
- **Same seeds, same results.** Use the game's `rng`, never `Math.random()`.

## 7. The pod layer (optional, second part)

A deck plays in a pod (`npm run pod -- <name> gale meren samfrodo`) as soon as it works in a goldfish game. Do this part only when Pontus wants the deck in the pod. Read `POD_PLAN.md` steps 3 and 4 first.

- **Interaction cards**: the deck's counterspells and removal are in the shared table `engine/game/answers.ts`. Add a card there only if it holds for any deck, with a test in `engine/pod/pod.test.ts` (`npm run pod -- --test`). A big spell worth countering goes in `KEY_SPELLS`.
- **Answering its win**: `winAttempt()` names the key spells and permanents of a declared win, and its backup; `podWinStopped()` says what happens when it is answered. `decks/mike/game.ts` has both.
- **"Close to winning"**: `podClose()` returns 0 to 1, how close the others think the deck is (it adds to the threat score). One plain rule per win type.
- **Pod settings** that differ from the goldfish ones go in `podCfg` in `index.ts` (samfrodo: `win_dead: players - 1`).
- **Check**: `npm run pod -- <name> goldfish goldfish goldfish --set pod_race=true` must give about the goldfish numbers of `npm run sim -- <name>`. Write the first pod numbers into `POD_PLAN.md`.

## 8. The deck's PLAN.md

Use the sections the other decks use, in this order (see `decks/samfrodo/PLAN.md`):

- `# <Deck> (<commander>): deck plan`, one line on the archetype and bracket.
- `## Files`: one line per file.
- `## How the deck wins (Pontus, <date>)`.
- `## Simulation rules (agreed <date>)`: the win, the second measure, combat, what the opponents do, what is not modelled.
- `## How the AI plays`: the main rules in `game.ts`.
- `## First results` (game count, list, the turn table).
- `## Pontus's game 1 (logs/<file>)` per real log: what the simulator does differently, misplays named as such.
- `## Opening hands` (from `--hands`), later.
- `## Open`: what is not done yet.

## 9. Done when

- `npm run sim -- <name> --test` exits with code 0 and prints no BAD line.
- The baseline is recorded and `npm run sim -- <name> --regress check` prints IDENTICAL.
- `npm run format`, then `npm run verify` ends with VERIFY OK (it now checks the new deck too).
- The deck shows in the app (`npm run app`, Decks page) and a game of it opens in the game viewer.
- `README.md` lists it and its `PLAN.md` has the sections above.
- One commit per working step (section 5), each passing `npm run verify`.

## 10. A pod-only deck (the light path)

For a friend's deck that only plays in pods (Pontus, 2026-11-15: no goldfish tuning unless the owner asks). The engine owns what cards do; the deck decides what to do and writes only its own cards. Skip sections 5.6 to 5.9 (first numbers, mulligan study, baseline, primer) and keep the rest short.

1. **Ask** (one message): the list, the commander, how it wins in a sentence or two, the bracket. No logs, goals or swaps.
2. **Folder:** `decklist.txt` as given, `index.ts`, `config.ts`, `cards.ts`, `game.ts`, `candidates.ts`, `tests/<name>.test.ts`, `PLAN.md`. No `mulligan.ts` (the default rule: keep 2-5 lands), no `regress` on the `deck` object.
3. **What the engine already does** (do not write these again): lands, mana rocks and mana creatures, rituals, cost reducers, draw spells (`DRAW_SPELLS`), land-search spells (`LAND_SEARCH`: Cultivate, Farseek...; the deck may override `chooseLandToFetch`), reanimation spells (`REANIMATION_SPELLS`: Animate Dead, Reanimate...; `reanimationValue` picks the creature), common permanents (`COMMON_PERMANENTS`: Solemn, Wood Elves, the Witnesses, Phyrexian Arena; they run from the default `onEnter` / `onDies` / `upkeep`, so a deck that overrides one of those calls `enterTriggerOfCommonCard` / `deathTriggerOfCommonCard` / `upkeepOfCommonCards` itself), and the pod's removal and counterspells (`engine/game/answers.ts`). A creature with no rules is a body with its power, toughness and Scryfall keywords. The engine's card rules are in `engine/card-rules/` (one object per card, `ENGINE.md` "Card rules"). Run `npm run sim -- <name> -n 50` to see the cards still played generically, Then check the engine rules the list already has: for each card of the list, search `engine/card-rules/` for its name, read its rules and any comment that starts with `CHECK WHEN ANOTHER DECK PLAYS IT:` (e.g. Lotus Cobra always makes blue or green, Blood Artist counts only our creatures). If the new deck needs more than the rule does, fix the rule in the engine (a choice hook, the missing half), with every other deck IDENTICAL or a before / after for Pontus, and update or remove the comment.
4. **The game class** extends `CreatureDeckGame` (`engine/game/creature-deck.ts`) when the deck wins by beating the opponents down (creatures, combat, drains): it has the win (`win_dead`), the two numbers, the goldfish combat, card values from `values` (the deck's `VALUE`), the planner score and a default `podClose`. A combo deck extends `GameWithoutKillSearch` or `Game` as in section 2.
5. **What the deck writes:** `cards.ts` with `VALUE` (how much the AI wants each card on the battlefield) and `HOLD` (removal and other cards with no goldfish target); `candidates.ts` (cast the commander, then the hand by `VALUE`, plus the deck's own activated abilities; copy `decks/edgar/candidates.ts` and cut it down); in `game.ts` the commander's rules, the few cards the plan depends on (the ones in "how it wins"), and `podClose()` if the default (power on the board) misses how the deck wins. A card rule that holds in any deck goes in the engine instead (a topic file in `engine/game/`, not `game-core.ts`), with every other deck IDENTICAL.
6. **Tests:** one check per card rule the deck writes.
7. **PLAN.md:** "How the deck wins (Pontus, <date>)", "Simulation rules", "Not modelled" (the cards played as plain bodies or not cast, said plainly: the pod report shows it next to the deck's numbers), and the first pod numbers.
8. **Done when:** `npm run sim -- <name> --test` passes; a `--trace 1` game and a pod `--trace` game look like real play; `npm run pod -- <name> goldfish goldfish goldfish --set pod_race=true` gives a sane kill turn; `npm run verify` passes (only Gale's known line BAD); the deck shows in the app.
