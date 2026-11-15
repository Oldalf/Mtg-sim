# Plan: step 8, the friends' decks for game night, then Gale

Written 2026-11-15. Step 7's plan (mana as it really is, B6, C1, D1, E1) is in git (`PLAN.md` at commit `ed1a598`).

Pontus plays a real pod with friends on 2026-11-16 and wants to simulate it before then. The friends' lists are in `decks/<folder>/decklist.txt`, as given on 2026-11-15. The table plays bracket 2-3 (Pontus, 2026-11-15).

| Friend | Deck (folder) | Commander | Bracket | How it wins (Pontus's words, short) |
|---|---|---|---|---|
| William | Edgar (`edgar`) | Edgar Markov | 2-3 | modelled already |
| William | DnD (`dnd`) | Hama Pashar, Ruin Seeker | 2-3 | blinks enter / leave triggers, and with them ventures into the dungeon again and again (mostly Lost Mine of Phandelver: scry, tokens, pings, cards; also the Undercity through the initiative) |
| Friend 2 | Helga (`helga`) | Helga, Skittish Seer | 2-3 | Helga grows and taps for more and more mana, so huge threats (Eldrazi titans, Craterhoof) come turns early |
| Friend 2 | Thantis (`thantis`) | Thantis, the Warweaver | 2-3 | forced combat: every creature must attack each combat. Taurean Mauler grows on everyone's spells |
| Friend 3 | Azula (`azula`) | Fire Lord Azula | ask at B6 | value engines, free casts while Azula is out, spells during combat while she attacks, many infinite mana combos |
| Friend 3 | Ardyn (`ardyn`) | Ardyn, the Usurper | 3 | Demon tribal: extra enter triggers (Roaming Throne), copied abilities, many value effects. Friend 3 mostly plays bracket 2; this deck is his exception |
| Friend 4 | Teval (`teval`) | Teval, the Balanced Scale | strong 3 | ramps with the commander and self-mill; wins with Rise of the Dark Realms or a value engine that makes many Zombies that attack. The owner pilots it poorly |

**The pod for game night** (Pontus, 2026-11-15, assuming the friends bring their simplest decks): **Meren, Edgar, Helga, Ardyn, Teval.** So Helga, Ardyn and Teval come first; Thantis, DnD and Azula come after game night.

The new decks are **pod-only**: no goldfish tuning, no mulligan study, no swap tests, no primer, unless the owner asks (Pontus, 2026-11-15). Before so many decks arrive, the engine should take over what decks keep writing for themselves, so a new deck is mostly data. The lists also need mechanics the engine has none of yet (doubled enter triggers, forced attacks and goad, triggers on an opponent's spell, blink, dungeons and the initiative): tasks M1 to M5.

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
- One task is one commit, straight on `main`. `npm run format`, then `npm run verify` must end with VERIFY OK, except for Gale's known kill misses (below).
- Ask Pontus eco or full power before any task that runs simulations (`verify` with regress checks counts).
- Before changing pod code, save a fixed-seed pod run (`npm run pod -- gale meren samfrodo aesi edgar -n 200 --no-log`) and compare it afterwards; `--regress check` does not cover pod mode.
- An engine change must leave every existing deck IDENTICAL (goldfish and the pod run). A task that would change them stops and asks.
- A task that finds its steps do not fit the code stops and says so. It does not improvise a bigger change.
- When a task is done, add one line under it here: what was built and anything the next task must know.

**Gale's kill misses are gone** (task E1, done 2026-11-15): `gale --test` plays 300 seeds with 0 misses and `npm run verify` ends VERIFY OK. Codie's baseline was re-recorded after the Cultivate fix (see A2). `npm run verify` runs its checks in parallel (`--jobs N`, 4 by default, 2 with `--eco`). `KILL_MISS_LOG_SEED=24 npm run sim -- gale --test` prints that seed's whole log.

## Order

| # | Task | What | Model |
|---|---|---|---|
| | | **Before game night** | |
| 1 | P0 | The lists, the commanders and the pod (done) | Pontus |
| 2 | A1 | What decks write for themselves that the engine should own (done) | Opus 5.5 |
| 3 | A2 | Move the shared card rules into the engine (done) | Opus 5.5 / Sonnet 5.5 |
| 4 | A3 | Register a deck in one place (done) | Sonnet 5.5 |
| 5 | A4 | A pod-only deck: the light path in `/add-deck` (done) | Opus 5.5 |
| 6 | M1 | Doubled enter triggers (Roaming Throne) (done) | Opus 5.5 |
| 7 | B1 | Helga (done) | Sonnet 5.5 |
| 8 | B2 | Ardyn (done) | Sonnet 5.5 |
| 9 | B3 | Teval (done) | Sonnet 5.5 |
| 10 | C1 | The game-night pod, a report (done) | Sonnet 5.5 |
| | | **After game night** | |
| 11 | M2 | Forced attacks and goad in pod combat (done) | Opus 5.5 |
| 12 | M3 | Triggers on another player's spell (done) | Sonnet 5.5 |
| 13 | M4 | Blink | Opus 5.5 |
| 14 | M5 | Dungeons, venture and the initiative | Opus 5.5 |
| 15 | B4 | Thantis | Sonnet 5.5 |
| 16 | B5 | DnD | Opus 5.5 |
| 17 | B6 | Azula | Opus 5.5, after P |
| 18 | Z1 | Step 7's loose ends | Sonnet 5.5 |
| 19 | D1 | Pontus's real list becomes `decklist.txt` | Sonnet 5.5, after P |
| 20 | E1 | Gale's kill search taps lands for real (`ROADMAP.md` step 9) (done) | Sonnet 5.5 |

**If time runs short before game night:** A2 moves only what Helga, Ardyn and Teval need, A3 waits, and a deck can go to the pod with fewer card rules, as long as its `PLAN.md` says what it does not model (C1 then says it next to its numbers).

---

## P0. What Pontus gives (done 2026-11-15)

The lists, commanders, brackets and the game-night pod are in the tables at the top. Azula's combos and bracket are asked for at B6.

---

## A. The engine before many decks

### A1. What should be the engine's (Opus 5.5)

Read the seven decks (`gale`, `meren`, `samfrodo`, `aesi`, `mike`, `codie`, `edgar`) and list what more than one of them writes for itself that holds for any deck. Likely places to look:

- **Triggers:** enter-the-battlefield token makers, death drains (Blood Artist, Zulaport Cutthroat kind), "whenever a creature dies" draws, Treasure / Food / Clue makers (`meren/triggers.ts`, `samfrodo/triggers.ts`, `edgar/triggers.ts`).
- **Static effects:** anthems and lords, keyword grants (`powerBonus` / `toughnessBonus` overrides).
- **Activated abilities:** sacrifice outlets (free, {1}, {2}, mana-making altars), Skullclamp.
- **Mana:** Treasures and Spawn spent last, the `isTestingRitual` workaround (edgar).
- **Cards:** tutors, card draw, removal and ramp that several lists play (`card-facts.ts` already has some), and token definitions.
- **Pod:** `podClose()`, `blockValue()` and `evasion()` rules that repeat.

Write the list into this task: for each item, which decks have it, where, and whether moving it is a plain move (same behaviour) or would change a deck's results. Then also what a deck must still write itself (its win check, its combo, its AI priorities). Also say how many cards in Helga's, Ardyn's and Teval's lists are already handled by the engine and how many would be after A2.

No code in this task. Pontus reads the list and picks what A2 moves.

**Found (2026-11-15).** What the engine already owns: lands (`LANDS`, `land-text.ts`), mana rocks, mana creatures, rituals, cost reducers, counterspells and removal for the pod (`answers.ts`), some draw spells and blue tutors. Every other card rule is in a deck. Of the nonland cards, the engine knows about 12 of Helga's, 4 of Ardyn's and 4 of Teval's; the rest would be cast as plain bodies or plain spells (a creature keeps its power, toughness and Scryfall keywords).

What more than one deck writes for itself, and whether it should move:

| # | What | Written in | New lists that need it | Move? |
|---|---|---|---|---|
| 1 | **The candidate list skeleton**: the `AddCandidate` type, cast the commander, go through the hand once per name, skip `HOLD`, cast the rest by `VALUE` | all six AI decks (`*/candidates.ts`) | all | Yes, as an engine helper the new decks use. The old decks keep theirs for now: each has small score differences, so switching them is its own IDENTICAL check, after game night. |
| 2 | **Land-search ramp** (Rampant Growth, Farseek, Cultivate, Nature's Lore, Three Visits, Explosive Vegetation...) | `aesi/candidates.ts`, `samfrodo/game.ts`, `codie/cards.ts` (a data table: lands, tapped, which kind) | Helga, Teval | Yes: codie's table goes to `card-facts.ts`, one engine function resolves it. The decks keep their own scores (Aesi wants lands in hand for its extra drops). A plain move. |
| 3 | **Reanimation**: `reanimate()` and the spells (Animate Dead, Necromancy, Reanimate, Victimize, Unearth) | `meren/game.ts`, `meren/actions.ts` | Ardyn, Teval (and Thantis later) | Yes: `reanimate()` and the spells to the engine; Meren calls them. A plain move. |
| 4 | **Simple value cards**: Phyrexian Arena (upkeep), Solemn Simulacrum, Sakura-Tribe Elder, Wood Elves, Eternal and Timeless Witness | `meren` (all), `edgar` (Arena), `aesi` (Elder, Wood Elves) | Helga (Solemn, Elder, Explore), Ardyn (Arena, Solemn), Teval (Elder, Witnesses) | Yes, as engine rules for `onEnter` / `onDies` / upkeep that a deck gets unless it overrides them. A plain move, but each deck's choice of when to cast them stays in the deck. |
| 5 | Black tutors (Demonic, Vampiric Tutor) and what to fetch | `codie`; `tutorTarget` in gale, meren, edgar | Teval, Ardyn (Demonic Counsel) | The resolution only (search the library for `tutorTarget()`); what to fetch stays per deck. Small. |
| 6 | Death drains (Blood Artist, Marionette Apprentice, Susurian Voidborn) | `edgar/game.ts`, `samfrodo/game.ts` | none of the three | No: two decks, and Sam & Frodo's count artifacts too (Food). Revisit with Thantis. |
| 7 | Sacrifice outlets (Viscera Seer, altars) | `edgar/actions.ts`, `meren/cards.ts` | none of the three | No, for the same reason. |
| 8 | Treasures spent last | `codie/game.ts`, `edgar/game.ts` | none of the three | No, not yet. |

What stays in each deck: its win check, its combo or kill search (Gale, Aesi's loops, Codie's solver), its `VALUE` and `HOLD` (the AI's taste), its tribe's lords and anthems, its pod hooks (`podClose`, `winAttempt`: each one differs).

What Helga, Ardyn and Teval must still write themselves: Helga's counters and mana ability, the Eldrazi cast triggers and annihilator, Craterhoof. Ardyn himself, the Demons' enter triggers, Exquisite Blood, Roaming Throne (M1). Teval's mill and Zombie triggers, Doubling Season and Parallel Lives, Rise of the Dark Realms, The Scarab God.

**Recommendation for game night:** A2 moves 1 to 4 (four commits, 5 if time allows); 6 to 8 wait for Thantis.

**Pontus picked (2026-11-15):** 2, 3 and 4, and 5 if time allows. 1 stays in the decks: a deck decides what to do, the engine tells it what it can do (the direction in `ROADMAP.md`). After A2 the engine would know about 18 of Helga's, 12 of Ardyn's and 15 of Teval's nonland cards; the rest are mostly creatures the deck gives a `VALUE` and, for the ones that matter, a trigger.

### A2. Move the shared card rules into the engine (Opus 5.5 for the shape, Sonnet 5.5 for the moves, after P)

What Pontus picked from A1. Each card rule moves to `engine/` (`card-facts.ts` for the data, a new topic file in `engine/game/` for the behaviour: `game-core.ts` is already 2,628 lines and must not grow). Each deck that had it uses the engine's version. Every deck stays IDENTICAL (goldfish `--regress check` and the fixed-seed pod run); a difference means the move is wrong, or the deck's version had a deck-specific twist that must stay in the deck.

**Built (2026-11-15).** Three engine files, each a card fact table in `card-facts.ts` plus the code that plays it; the choice stays with the deck through a hook:
- `engine/game/land-search.ts`: `LAND_SEARCH` (Codie's table, moved), `resolveLandSearch` from `GameCore.resolve`, `fetchLand`; the deck picks with `chooseLandToFetch` (default: a land of the colour we have fewest lands for). Codie uses it with its own chooser. Aesi and Sam & Frodo keep their own versions for now (their fetch triggers landfall at another moment; moving them is its own IDENTICAL check).
- `engine/game/reanimation.ts`: `REANIMATION_SPELLS` (Persist, Unearth, Victimize, Reanimate, Dread Return, Exhume, Animate Dead, Necromancy, Rise of the Dark Realms; our graveyard only), `GameCore.reanimate` and `bestCreatureInGraveyard` (moved from Meren); the deck picks with `reanimationValue`. Gale keeps its own Unearth (it picks by its kill roles and triggers Syr Konrad).
- `engine/game/common-permanents.ts`: Solemn Simulacrum, Wood Elves, Eternal and Timeless Witness, Phyrexian Arena, run from the engine's default `onEnter` / `onDies` / `upkeep`; Meren and Edgar call them from their own hooks at the same place as before (`returnToHandValue` picks the Witness's card).
- Every deck IDENTICAL and the pod run unchanged, except **Codie: its Cultivate fetched one land, not two** (its table said `landCount: 1`). Same seeds, 3,000 games: win by turn 12 62.7% before and after, average turn 8.99 -> 8.94. Pontus (2026-11-15): keep Codie's old baseline for now (Codie isn't in this pod), so `codie --regress check` stays DIFFERENT until it is re-recorded.
- Left for after game night: item 5 (black tutors: Codie and Teval each resolve Demonic and Vampiric Tutor themselves now, so a third deck moves them to the engine); Aesi's and Sam & Frodo's land search onto the engine's; the old creature decks (Edgar, Meren, Sam & Frodo) onto `CreatureDeckGame`. Each must be IDENTICAL.

### A3. Register a deck in one place (Sonnet 5.5)

Today a deck is named in five places in two files: `DECKS`, `TESTS` and `REGRESS` in `decks/index.ts` (plus its imports), and `DECKS_WITH_BASELINE` and `POD_DECKS` in `scripts/verify.mjs`. With six new decks, one missed line makes `verify` skip a deck silently.

- Each deck's `index.ts` exports its tests and regress lists on its `deck` object (`tests`, `regress`), plus whether it is pod-only.
- `decks/index.ts` keeps one list, `DECKS`; `TESTS` and `REGRESS` are built from it.
- `verify.mjs` asks the simulator for the deck names (a small command such as `node dist/sim.js --list-decks --json`) instead of keeping its own arrays. `POD_DECKS` stays a fixed list in `verify.mjs`: it is the pod baseline and changes only on purpose.
- Pod-only decks: `--test` yes, no goldfish baseline (`--regress`), not in the fixed-seed pod run unless Pontus asks.
- Update `/add-deck` section 4 to the one place. Results IDENTICAL.

**Built (2026-11-15).** `Deck.tests` and `Deck.regress` on each deck's `deck` object; `decks/index.ts` has only `DECKS`; `sim.ts` reads them from the deck and has `--list-decks` (JSON: the decks with a baseline, and all); `verify.mjs` builds first, then asks it. `/add-deck` section 4, `README.md` and `ENGINE.md` say so.

### A4. The light path for a pod-only deck (Opus 5.5)

A section in `/add-deck` (`.claude/skills/add-deck/SKILL.md`) for a pod-only deck, written so Sonnet 5.5 can follow it alone:

- What to ask (the list, the commander, how it wins, the bracket; no logs, no goals, no swaps).
- Which existing deck to copy from, now that A2 moved the shared rules.
- The minimum: `index.ts`, `config.ts`, `cards.ts` (its roles, `VALUE`, `HOLD`), `game.ts` (the win check, the deck's few own rules), a short `candidates.ts`, the default mulligan, tests for each card rule written, `PLAN.md` with the sections "How the deck wins", "Simulation rules", "Not modelled" and the pod numbers.
- Its interaction cards checked against `engine/game/answers.ts` (new ones added there with a test).
- Done when: `--test` passes, a `--trace` game and a pod `--trace` game look like real play, `npm run pod -- <deck> goldfish goldfish goldfish --set pod_race=true` gives a sane kill turn, and it shows in the app.

Try it on the first B deck and fix the section from what went wrong.

**Built (2026-11-15).** `/add-deck` section 10, "A pod-only deck (the light path)", and `CreatureDeckGame` (`engine/game/creature-deck.ts`): the win, the two numbers, combat, card values and the planner score that Edgar, Meren and Sam & Frodo each wrote, for the light decks to extend (the old decks keep theirs for now). To be checked on Helga (B1).

---

## M. Mechanics the new lists need

Each is engine code with tests in `engine/pod/pod.test.ts` or a new test file, and leaves every existing deck IDENTICAL. Check the card text in the Scryfall bulk data, not from memory.

### M1. Doubled enter triggers (Opus 5.5)

For Ardyn (Roaming Throne) before game night, and later DnD (Panharmonicon). An effect that doubles enter triggers makes the deck's `onEnter` for that permanent run one more time (Panharmonicon: artifacts and creatures; Roaming Throne: creatures of the chosen type). Teval's Doubling Season and Parallel Lives double tokens and counters, not triggers: they stay in Teval's folder unless A1 finds them elsewhere too. Look first at how `enter` and `onEnter` work in `game-core.ts`; the deck still writes its own card's trigger.

**Built (2026-11-15).** `engine/game/trigger-doublers.ts`: `triggerCount` (Roaming Throne, with the type the deck names through `GameCore.roamingThroneType`) and `enterTriggerCount` (plus Panharmonicon); the deck runs its trigger that many times. `hasCreatureType` in `engine/cards/cards.ts` reads a card's type line (Edgar's `isVampire` does the same and could use it later). Tested in Ardyn's tests.

### M2. Forced attacks and goad (Opus 5.5)

For Thantis ("each creature attacks each combat if able") and, later, Pontus's and Friend 2's goad decks. The two must stay different (Pontus, 2026-11-15):

- **Must attack:** the creature attacks each combat if able, any player its controller picks.
- **Goaded** (rule 701.15): it attacks each combat if able, and attacks a player other than the one who goaded it if able. It attacks the goader only when no other player can be attacked. Goad lasts until the goader's next turn.

Both go on the pod's attacker choice (`engine/pod/pod-combat.ts`), so every deck's creatures obey them without the deck knowing. A forced attacker's controller still picks the defender (by the threat rule) within what is allowed. Tests: a goaded creature with two possible defenders never attacks the goader; with only the goader left, it attacks the goader; a "must attack" creature attacks even when the deck's own rule would hold it back.

**Built (2026-11-15).** Must attack is read from the card text (`attacksEachCombat`: "This creature / Ruric Thar attacks each combat if able"; `makesAllCreaturesAttack`: Thantis's "All creatures attack each combat if able", on any living player's battlefield). Goad is pod state (`PodTable.goaders`, `goad`), ended at the goader's next turn or when it leaves; a deck goads through `arena.goadCreatures(game, slot)` (Geode Rager; Kardur can use it too). `Game.arenaCombat` keeps a goaded creature off its goaders while someone else can be attacked, never keeps a forced creature home as a guard, and adds a forced creature the plan left home to a group it may join (or the opponent the threat rule picks). After the deck's combat, `attackWithForcedCreatures` sends the forced creatures the deck's own combat didn't (Gale's mana creatures, a deck that doesn't attack): a second attack, so blockers that already blocked can't block again and attack triggers fire again. Planner copies don't foresee forced attacks. Tests: `engine/pod/pod-forced-attacks.test.ts` (in `npm run pod -- --test`). The decks in `verify`'s pod run have no forced attackers; Helga's Ulamog's Crusher now attacks each combat in a pod, so her pod numbers change (the game-night run above was before this).

### M3. Triggers on another player's spell (Sonnet 5.5)

Taurean Mauler ("whenever an opponent casts a spell, you may put a +1/+1 counter"; its size matters in a pod, Pontus 2026-11-15), Rhystic Study, and the like. The pod tells each game when another player casts a spell (a hook such as `onOpponentCast(card)`); in a goldfish game the opponents cast nothing, so nothing changes there.

**Built (2026-11-15).** `engine/game/opponent-cast-triggers.ts`: Taurean Mauler (+1/+1 counter) and Rhystic Study (draw unless the caster pays {1}: it pays when it has a mana left, tapping it). Every cast calls `podAnnounceCast(card)` (`castInstantOrSorcery`, `castPerm`, `flashback`, the pod's `podCast` for removal and counterspells, Edgar's Beseech the Mirror and Teval's Muldrotha casts); in a pod it goes through `Arena.announceCast` to each living opponent's `onOpponentCast(spell, caster)`, before any counterspell (the trigger is on the stack above the spell). A deck overrides `onOpponentCast` for its own cards. Mystic Remora (cumulative upkeep) and Esper Sentinel are not modelled. Tests: `engine/pod/pod-opponent-cast.test.ts` (in `npm run pod -- --test`). Not covered: spells a deck casts through its own code without `castInstantOrSorcery`/`castPerm` (Gale's counter-your-own-spell line, Codie's finishers) don't announce.

### M4. Blink (Opus 5.5)

For DnD (Ephemerate, Ghostly Flicker, Brago, Thassa, Displacer Beast...). A blinked permanent leaves and comes back as a new object: leave and enter triggers fire again, counters and attached auras are lost, a token blinked away is gone, and the log shows both moves.

### M5. Dungeons, venture and the initiative (Opus 5.5)

For DnD. Rules 309 (dungeons) and 725 (the initiative):

- **Venture into the dungeon:** start a dungeon (the player picks one of Lost Mine of Phandelver, Dungeon of the Mad Mage, Tomb of Annihilation) or move one room down; each room has its effect; finishing a dungeon counts for "completed a dungeon" cards.
- **The initiative:** taking it ventures into the Undercity (only there). The holder ventures again at their upkeep. A player who deals combat damage to the holder takes it. It is a pod-wide thing: one player has it at a time, and the others want to take it, so the pod's attack choice must value it.
- The rooms as data (one table per dungeon, the room effects as small functions), the dungeon a player is in and the room they are in as game state, shown in the log ("ventures: Lost Mine of Phandelver, Goblin Lair: create a 1/1 Goblin").
- Which dungeon and which path to pick: a simple rule first (Lost Mine for DnD, as Pontus says the owner plays; the path that gives cards or tokens), written in the deck, not the engine.

## B. The friends' decks (after A4; the M tasks a deck needs come first)

One task per list, following `/add-deck`'s light path (A4).

| Task | Deck | Needs | Model | Notes |
|---|---|---|---|---|
| B1 | Helga | | Sonnet 5.5 | Ramp into big threats. Helga's counters and mana are the core; Eldrazi annihilator and "cast" triggers (Ulamog, Kozilek), Craterhoof. |
| B2 | Ardyn | M1 | Sonnet 5.5 | Demon tribal, drains and life loss (Gray Merchant, Exquisite Blood, Vilis). Reanimation: reuse Meren's `reanimate`. |
| B3 | Teval | | Sonnet 5.5 | Self-mill as ramp, reanimation, Zombie tokens (Rise of the Dark Realms, The Scarab God), Doubling Season and Parallel Lives. The AI plays the list as built, not the owner's misplays: C1 says the numbers may overrate it. |
| B4 | Thantis | M2, M3 | Sonnet 5.5 | Forced combat, Taurean Mauler, reanimation, Syr Konrad. |
| B5 | DnD | M1, M4, M5 | Opus 5.5 | Blink engines, dungeons, the initiative. |
| B6 | Azula | | Opus 5.5, after P | Ask Pontus first for the infinite combos (which cards, how each wins) and the bracket. Free casts while Azula is out, spells during combat, counterspells (add to `answers.ts`), the combos as a declared win (`winAttempt`, like Gale's kill line or Aesi's loops). |


**B1 built (2026-11-15).** `decks/helga`, on `CreatureDeckGame` and the light path (A4 worked as written). Helga's mana and cast trigger, the Eldrazi cast triggers, the draw engines, Craterhoof; annihilator and the removal on enter are not modelled (see `decks/helga/PLAN.md`). Goldfish average win turn 10.99; against three goldfish in a pod 99.3%, round 11.29.

**B2 built (2026-11-15).** `decks/ardyn`: Ardyn (haste, lifelink, Starscourge), Roaming Throne, the Swamp mana doublers and cost reducers, the drains and Exquisite Blood, Vilis, the tutors and reanimation. Goldfish average win turn 11.18 (see `decks/ardyn/PLAN.md` for what is not modelled).

**B3 built (2026-11-15).** `decks/teval`: cards leaving the graveyard make Zombies (one trigger per event), self-mill, lands back from the graveyard and landfall, token and counter doubling, Muldrotha, Meren, Nyxbloom. `hasCreatureType` now reads a token's name word by word ("Zombie Druid" is a Zombie). Goldfish average win turn 9.91: the fastest of the three, and the AI plays it better than its owner.
---

## C. Game night

### C1. The game-night pod (Sonnet 5.5, after B1 to B3)

`npm run pod -- meren edgar helga ardyn teval -n 1000` (ask Pontus eco or full power). Write a short report for Pontus, in this plan and as plain text he can read on his phone: each deck's win rate, average win turn, how it wins, who goes out first, and next to each friend's deck what is not modelled. Point out anything that looks too strong or too weak for the table, and which deck the others should watch. Teval's numbers come from an AI that plays it well; its owner does not, so say so.

**Run (2026-11-15, 1,000 games, eco, `session-logs/01-pod-meren-edgar-helga-ardyn-teval`).** An even pod is 20%, noise about ±3 points.

| Deck | Wins | Avg round | Out first | Not modelled that matters |
|---|---|---|---|---|
| Teval | 31.4% | 9.17 | 9.6% | the owner's misplays (the AI plays it well), Muldrotha's lands, Underrealm Lich |
| Meren | 23.5% | 9.36 | 24.8% | |
| Ardyn | 22.7% | 9.31 | 17.5% | menace, Cabal Coffers / Nykthos mana, his removal creatures |
| Helga | 12.0% | 9.77 | 16.5% | annihilator, the Eldrazi's and Terastodon's removal |
| Edgar | 10.3% | 9.02 | 31.6% | |

Games end in round 9.3 on average. Teval is the deck to watch: its Zombie board grows with every card leaving its graveyard, and it is the least often out first. Edgar goes out first most (a small, early board that the others attack). Helga is likely underrated: annihilator is not modelled yet. Seat 5 hurts Meren (13.3% against about 27% elsewhere).

---

## Z. Step 7's loose ends

### Z1. Check and fix (Sonnet 5.5)

- D1's card pop-up was checked only at desktop width: check it at 390 px and with touch (tap opens, a second tap or a tap elsewhere closes).
- (Done 2026-11-15) The app test failed on "no primer or swap notes among the lists": `aesi/SUGGESTED_SWAPS.txt` was read as a decklist. Pontus had it removed; its swaps are `lists/suggested_affinity.txt` and `decklist.txt`.

---

## D. Pontus's real list

### D1. The list he plays becomes `decklist.txt` (Sonnet 5.5, after P)

Pontus has updated one of his decks in real life, partly from its `lists/proposed.txt`. Same as was done for Aesi (commit `e686967`): the current `decklist.txt` moves to `lists/original.txt`, his assembled list becomes `decklist.txt`, then results before and after with the same seeds, the baseline re-recorded (`--regress record`) and the deck's `PLAN.md` updated. Pontus gives the deck and the list.

---

## E. Gale

### E1. Gale's kill search taps lands for real (Opus 5.5, after P)

`ROADMAP.md` step 9 has the problem and the idea; `PLAN.md` B3b part 2 at commit `e686967` has the details. Design first, the speed measured (Gale's search is most of its 25 s), Pontus's yes, then build. Done when `KILL_MISS_SEEDS_SHOWN=100 npm run sim -- gale --test` shows no kill miss and `npm run verify` ends VERIFY OK.

**Built (2026-11-15).** `KillSearchState` (`decks/gale/kill-state.ts`) keeps untapped sources apart from floating mana: `landClasses` (a kind of source: what it taps for, Island / Swamp typed, land or not) with `untappedLands` and `allLands` counts; `pool` holds only mana already made. A payment that falls short taps one more source (`tapAnotherLand`, a filter Signet is fed a mana first), so High Tide / Muck count the Islands / Swamps really untapped, and Turnabout, Frantic Search, Snap, Unwind and Peregrine Drake put real lands back (`untapLands`, the game's own order). An any-colour source makes the colour it is short of when tapped, like the game. The search records what it tapped (`PaymentRecord`, on each step as `payments`; the untaps too) and the real play follows it: engine hooks `sourcesPlannedFor` (in `pay`) and `landsToUntap` (in `untapLands`), Gale fills them from the step being played. Engine rule: with Energybending out every land taps for either colour (`manaSourceKind`). Singularity Rupture also destroys Gale and Emet-Selch in the search. Misses on the current list: 42 -> 0 of 300 seeds. 3,000 games, same seeds, Gale: win by T8 65.2% -> 69.3%, with backup 49.7% -> 51.1%; 51 s -> 55 s (+8%). Other decks IDENTICAL. Gale's regress baseline and the pod baseline were re-recorded (pod: Gale 18.0% -> 18.5%, within noise). **Moved into the engine (2026-11-15, same day):** `engine/game/search-mana.ts` (`SearchMana`: the source classes, paying, High Tide / Muck, untaps, the payment record; `SearchMana.fromGame` reads the game's battlefield) with tests in `engine/game/search-mana.test.ts` (in `npm run pod -- --test`); `GameCore.plannedPayments`, `sourcesPlannedFor` and `landsToUntap` now do the planned taps for any deck. `KillSearchState` keeps a `mana: SearchMana` and only decides when a High Tide / Muck is still to come. Every deck IDENTICAL, Gale's baseline unchanged by the move. Another deck's search (Codie's solver, Aesi's loops) can use it the same way; not done, nothing there needs it yet. Known limit: the search taps greedily, so "Island + Signet pay {U}{B}" is missed (the Island's mana is spent before the Signet could be fed); the real `pay` finds it by its payment search.
