# Plan: step 12, a heavier engine, one board, missing cards and the app's missing commands

Written 2026-11-24. Step 11 (tasks T1 to T9) is done; its steps and notes are in git: `PLAN.md` at commit `29f352e`. `ROADMAP.md` has the steps before it.

Pontus picked the four parts of this step on 2026-11-24 from the roadmap's open ideas, step 11's leftovers and the decks' "Open" lists.

Still waiting on Pontus from earlier steps: whether to adopt `decks/gale/lists/speed.txt` (step 10), and the answer from Codie's creator on how often he wins by turn 5 (T3).

The friends' decks (Helga, Ardyn, Teval, Thantis, DnD, Azula) are still **pod-only**: no goldfish tuning, no swap tests, no card rounds for them unless the owner asks (Pontus, 2026-11-15).

## How to read this plan

Each task names a model. Give it to that model or a stronger one.

| Model | Tier | What it gets |
|---|---|---|
| Claude Haiku 5.5 | S (small) | Mechanical work with exact steps. No design choices. A command says if it worked. |
| Claude Sonnet 5.5 | M (medium) | A feature or fix with a clear goal, in patterns the code already has. Small choices only. |
| Claude Opus 5.5, or Fable 5.2 | L (large) | Design, work across many files where judgement is needed, or writing that other models will follow. |
| **P** | Pontus | A decision or input. Tasks marked "after P" wait for it. |

Rules for every task:

- Read `CLAUDE.md` first (rule 0 names, KISS). For the engine also `ENGINE.md`, for the page also `app/web/CLAUDE.md`.
- One task is one commit, straight on `main` (a big task may be a few commits, each one passing). `npm run format`, then `npm run verify` must end with VERIFY OK (`verify --quick` while working).
- Ask Pontus eco or full power before any task that runs simulations (`verify` with regress checks counts).
- Before changing pod code, save a fixed-seed pod run (`npm run pod -- gale meren samfrodo aesi edgar -n 200 --no-log`) and compare it afterwards; `--regress check` does not cover pod mode. `verify` also compares that run with `regress_baseline/pod.txt`; re-record it (`node scripts/verify.mjs --eco --record-pod`) only for a change Pontus accepted.
- A move of code must leave every deck IDENTICAL (goldfish and the pod run). A new card rule changes the results of the decks that play the card: report before / after and ask before re-recording a baseline.
- A task that finds its steps do not fit the code stops and says so. It does not improvise a bigger change.
- When a task is done, add one line under it here: what was built and anything the next task must know. When the whole plan is done, it is cleared and a new one written.

## Order

| # | Task | What | Model |
|---|---|---|---|
| 1 | U1 | Card rules out of the big deck files, and the engine's big files split | Opus 5.5 |
| 1b | U1b | Every card's rules in the engine (card objects with hooks), the decks only decide | Opus 5.5 |
| 2 | U2 | One board, not two (the analyzer's and the viewer's) | Sonnet 5.5 |
| 3 | U3 | The cards not modelled yet: Edgar, Aesi, Gale, then Codie | Opus 5.5 |
| 4 | U4 | The app: the commands it is missing, editing lists, a card's print | Opus 5.5 (design), Sonnet 5.5 (each feature) |

U1 comes first so that U3's new card rules land in the right topic files. U2 can run any time (it touches only the log boards and the page). U4 comes last: its design may use deck measures that U1 moves.

---

## U1. Card rules out of the big deck files, and the engine's big files split (Opus 5.5)

The roadmap's goal is a heavy engine and light decks (the engine owns what a card does, the deck decides). Files over the guide's 800 lines: `engine/game/game-core.ts` 1,755, `decks/aesi/game.ts` 1,192, `engine/game/game.ts` 1,099 (the pod parts of a game), `decks/meren/game.ts` 1,073, `decks/mike/game.ts` 969.

1. Survey first, per file: which parts are card facts that hold in any deck (they go to an engine topic file, a new one if no topic fits), which are the deck's own choices (they stay), and which are code for cards no list plays any more (Edgar's `PLAN.md` says the removed cards' code is still there; check every list in `lists/` before calling a card unused). Write the survey here under this task before moving code.
2. Move one topic per commit, each one IDENTICAL (`npm run verify`: every deck, the pod run, the logs). Follow `ENGINE.md` "How the game class is split": a plain function that takes the game; a method a deck calls or overrides keeps its name as a one-line call; inside a topic file the game's methods are called on the game, so overrides still run. No renames or behaviour changes on the way; a fix found on the way is a separate commit.
3. `game-core.ts`: `ENGINE.md` names casting (about 150 lines) and the turn's small steps (about 130) as the next parts to move (`casting.ts`, `turn.ts`). `game.ts`: split its pod parts by topic (blocks, removal and counterspells, the threat score), as `engine/pod/` already is.
4. Done when each of these files is about 800 lines or `ENGINE.md` has a short list of why not, and `ENGINE.md`'s folder table and "What the engine provides" name the new files. Removing unused card code changes nothing a list plays, so it stays IDENTICAL too.

### Survey (2026-11-24)

Lines are `wc -l`. "Who plays it" is every `decklist.txt` and `lists/*.txt`.

**One rule for the deck moves.** Most cards below are played by one simulated deck only, and some by a pod-only deck that has no code for them (Tatyova: Teval; Buried Alive and Breach the Multiverse: Teval, Thantis). If the engine handled them by default, those decks would change, and that is not a move. So a moved card rule is an engine function that the deck calls (as `upkeepOfCommonCards` is today); the deck's choices come in as hooks or arguments. Making it the engine's default for every deck is a separate change with its own before / after (U3 or later).

**`engine/game/game-core.ts` (1,755)**
- To `casting.ts` (new): `castInstantOrSorcery`, `castReboundCards`, `onCastInstantOrSorcery`, `castPerm`, `flashback`, `wishclaw`, `transmute`, `cycle` (lines 996-1176, about 180).
- To `turn.ts` (exists): `startTurn`, `beginNewTurn`, `enterStep`, `endTurn`, `upkeepTriggersOfTheGame`, `takeInitiative`, `developWin`; `adoptKillLineCopy` to `kill-line.ts` (about 150).
- `cabalMana`, `drainPowerMana`, `energyTapTarget` and `canTapForEnergy` stay where they are: they are 3 to 12 lines each, so a one-line method for each would save almost nothing.
- What is left is about 1,400 lines: state and `clone` (200), the hooks with their default bodies (300), zone changes (200), creatures, life and damage (140), log lines (90). `ENGINE.md`'s list of why not gets the new numbers.

**`engine/game/game.ts` (1,099, the pod parts)**
- To `pod-attacks.ts` (new, in `engine/game/`): our side of a pod combat: `fighter`, `strike`, `planAttack`, `pickDefender`, `homeGuard`, forced attackers, `arenaCombat`, `podDefence` (lines 104-522, about 420).
- To `pod-answers.ts` (new): removal and counterspells: `podWantsToCounter`, `answerCost`, Force of Will and Daze, `podCast`, `podRespond`, board counters, `podCanTarget`, `podShield`, `podGet`, `podRemove`, `podLose`, `podBurnCounters`, `podTargets` (lines 562-1052, about 490).
- The hooks a deck overrides (`evasion`, `blockValue`, `fogPrevent`, `podClose`, `podShield`, `winAttempt`, `podWinStopped`, `combatHit`), `threat` and the small pod hooks stay as methods. What is left is about 350 lines.

**`engine/pod/pod-interaction.ts` (1,037; added to U1 by Pontus on 2026-11-24)**
- To `pod-win-answers.ts` (new): answering a win and countering a spell: `answerWin`, `sayProtection`, `opponentWithMostInteraction`, `counterspellsAgainst`, `counterSpell`, `shouldGoForKill` (lines 529-769, about 240).
- To `pod-card-effects.ts` (new): what one player's card does to the others. That is Volatile Stormdrake's exchange, goad, weaken, stop attacking, the edicts, discard, fight, the graveyards, bouncing a colour, and -1/-1 to all (lines 133-382 and 809-1037, about 500).
- What stays is about 330 lines: removal and wipes after a turn (`useRemovalAfterTurn`, `castTargetedRemoval`, `castBoardWipe`, `bestRemovalTarget`, `hitWithRemoval`, `snipeBestTarget`, `bounceEveryOpponentsCreatures`) and the attack preference.

**`decks/aesi/game.ts` (1,192)**
- Card facts that can move: Lotus Cobra, Druid Class and Khalni Heart Expedition on landfall; Haru-Onna's draw; Invasion of Zendikar's two basics; Azusa's Many Journeys' chapters; Omniscience's free spells; Blue Sun's Zenith going back into the library; Graceful Adept in `hasNoMaximumHandSize` (about 80 lines). Wood Elves is already an engine card (`common-permanents.ts`); Aesi keeps its own copy. Use the engine's only if the two are the same.
- These stay in the deck, because they go through Aesi's own land drops (`putLand`, `chooseLand`, `dropsUsed`): Kodama of the East Tree, Case of the Locked Hothouse, Into the Wilds, Search for Tomorrow's suspend, Retreat to Coralhelm and Elven Raft-Steerer (which permanent to untap). Simic Growth Chamber too: the engine's bounce lands do it in `land-play.ts`, but Aesi picks the land with the Retreat loop in mind. Compare the two, and merge only with a hook and an IDENTICAL result.
- Also staying: the win, the loops, the kill search, combat and Siege, the values, the epic copies, the diag.
- Split within the deck folder: the land drops (lines 310-600, about 290) go to `decks/aesi/land-drops.ts`. With the card facts moved out, `game.ts` is about 800.

**`decks/meren/game.ts` (1,073)**
- Card facts that can move:
  - The spells in `resolveOther` (Decode Transmissions, Village Rites, Grisly Salvage, Songs of the Damned, Breach the Multiverse, Deadly Brew, Buried Alive, Dina's Guidance; about 60 lines). Meren's choices stay hooks: which creature to sacrifice, what to put into the graveyard.
  - Ophiomancer's Snake, Grave Researcher's upkeep, Grave Titan's and Avenger of the Fallen's attack tokens, Wight of the Reliquary's power.
  - Spore Frog as the fog (`canAttack`, `fogBlocker`, `blockValue`, `fogPrevent`).
- `fetchBasic` repeats the engine's `fetchLand`, and it repeats `chooseLandToFetch`'s Forest-or-Swamp choice. Replace it only if the result is IDENTICAL: the order of shuffle and enter may differ.
- Staying in the deck: the sacrifice choices, Meren's end step and the fodder rule, the tutor priorities, the diag measures, stealing creatures.
- Split within the deck folder: the sacrifice choices and outlets (lines 400-590, about 190) go to `decks/meren/sacrifice.ts`, and Meren's end step (lines 760-875, about 115) to `decks/meren/end-step.ts`. `game.ts` is then about 700.

**`decks/mike/game.ts` (969)**
- Duplicate: Mike's Frantic Search is the engine's (`common-spells.ts`), word for word. Delete Mike's copy.
- Windfall is written three times, and the three differ:
  - Mike: the pod's `wheel`, else at least 7.
  - Codie: always at least 7, also in a pod.
  - Gale: the goldfish opponents' hands, and the kill search's opponent state.
  - One engine Windfall changes Codie's pod results, so that is a behaviour change for later, not U1. DnD plays Windfall and has no code for it: it is cast, and nothing happens. That is a bug found on the way; it gets its own commit, which changes DnD's pod results.
- Card facts that can move with hooks for the choices: Mystic Sanctuary (it enters tapped with fewer than 3 Islands, and puts a spell on top), The Water Crystal's cost cut, Roil Cartographer's energy, Tune the Narrative, Pull from Tomorrow, and the looters' combat damage.
- Staying in the deck: the cards that hang on Mike's own draw counting and its speed. These are the draw triggers (Psychosis Crawler, Ominous Seas, Skymage, Oneirophage, Messenger, Mystic, Krang), Laboratory Maniac, Jace and Ormos on an empty library, Flux (it uses `refillDraws`), Slick Imitator, Aurora Shifter, the Toad and Fblthp.
- Split within the deck folder: drawing (lines 338-487, about 150) goes to `decks/mike/drawing.ts`. `game.ts` is then about 780.

**Card code that no list plays any more**
- Edgar (`PLAN.md` says so; checked against every list): Arnyn, Blasphemous Act, Dreadhorde Invasion, Indulgent Aristocrat, Keen Duelist, Nine-Lives Familiar.
  - Marionette Apprentice and Swords to Plowshares are played by other decks. Delete only Edgar's own code for them; the engine's answer for Swords stays.
  - The tests of these cards go too. The regress then shows DIFFERENT only in Edgar's tests, so re-record Edgar's baseline for the tests alone.
- Named in other decks' code but in none of that deck's lists (each to check: a row in a values table is harmless, code for the card is not):
  - Aesi: Guildless Commons, Sylvan Awakening, Sylvan Scrying, Expedition Map, Crop Rotation, Myriad Landscape, Fabled Passage.
  - Meren: Grim Backwoods, Costly Plunder, Plumb the Forbidden, Reassembling Skeleton, Elvish Mystic, Zulaport Cutthroat, Sylvan Caryatid, Elvish Visionary.
  - Gale: Mnemonic Wall, Rewind, Cabal Ritual, Sapphire Medallion, Cloud of Faeries.
  - Sam & Frodo: Farmer Cotton, Idol of Oblivion, Pristine Talisman, Graypelt Refuge.
  - A test list a deck's `PLAN.md` still wants to try keeps its cards.

**Order of the commits** (each IDENTICAL: every deck's regress and the pod run)
1. `casting.ts`, then the turn steps (game-core).
2. `pod-attacks.ts`, then `pod-answers.ts` (game.ts); then `pod-win-answers.ts` and `pod-card-effects.ts` (pod-interaction.ts).
3. Edgar's unused code (the tests' baseline re-recorded, after asking).
4. Mike: delete the Frantic Search copy, then `drawing.ts`, then its card facts.
5. Meren: `sacrifice.ts` and `end-step.ts`, then its card facts.
6. Aesi: `land-drops.ts`, then its card facts.
7. The other decks' unused card code, as checked.
8. `ENGINE.md` (the folders, how the game class is split, what the engine provides).

DnD's Windfall is a separate commit, with a before / after of the pod run.

**Done (2026-11-25), commits `fdae0c3` to `9d81efb`.** Every move is IDENTICAL: every deck's regress and the pod run. The file sizes after U1:
- `game-core.ts` 1,617, `game.ts` 556, `pod-interaction.ts` 316.
- `decks/aesi/game.ts` 888, `decks/mike/game.ts` 888, `decks/meren/game.ts` 828.

`ENGINE.md` lists why each file still over 800 lines stays that size, and names the new files.

What moved to the engine:
- Mike: Frantic Search (a duplicate), Tune the Narrative, Pull from Tomorrow.
- Meren: Village Rites, Grisly Salvage, Songs of the Damned.
- Aesi: Omniscience, Graceful Adept, Blue Sun's Zenith.
- Windfall, in `Game.resolveOther`. Mike's copy is gone; Gale and Codie keep their own. DnD's Windfall now resolves: DnD won 15.0% of 2,000 pod games before and after.

What stayed in the decks, and why:
- Aesi's enter and landfall cards (Haru-Onna, Invasion of Zendikar, Lotus Cobra, Druid Class, Khalni Heart Expedition, Azusa's Many Journeys) and Mike's Mystic Sanctuary, The Water Crystal, Roil Cartographer and the looters. Those decks' `onEnter` and `onLandEnter` don't call the engine's, so moving these cards changes what the decks run. That is a change of its own, for U3 or later.
- Meren's Decode Transmissions, Deadly Brew, Dina's Guidance, Breach the Multiverse and Buried Alive: they hang on Meren's own state and choices, and Teval and Thantis play the last two.

Unused code: Edgar's code for the 6 removed cards and his own copies for Marionette Apprentice and Swords to Plowshares are gone (Edgar's tests re-recorded, Pontus OK'd). The cards in the other decks' code that their lists don't play (Aesi, Meren, Gale, Sam & Frodo) stay. Nearly all are swaps those decks tried, and their `PLAN.md` names them. Two that were named nowhere were removed on 2026-11-25 (Pontus).

## U1b. Every card's rules in the engine, the decks only decide (Opus 5.5)

Pontus, 2026-11-25: the engine handles the cards, the decks are the strategy (what to prioritise), with no card rules of their own. He picked one plain object per card with hooks the engine runs (`ENGINE.md`, "Card rules"), and this order: the IDENTICAL moves first, then the cards that change results.

Survey (2026-11-25, the `case '...'` and `=== '...'` card names in each deck's code, against every `decklist.txt`):
- 133 cards are coded in one deck and played by no other deck: they move IDENTICAL.
- 11 cards are coded in two or three decks: Breach the Multiverse and Buried Alive (Meren, Teval), Disciple of Bolas and Rune-Scarred Demon (Ardyn, Meren), Explore (Aesi, Helga), Growth Spiral (Aesi, Codie, Teval), Indulgent Tormentor (Ardyn, Thantis), Sheoldred, Whispering One (Ardyn, Teval), Susurian Voidborn (Edgar, Sam & Frodo), Viscera Seer (Edgar, Meren), Windfall (Codie, Gale; the engine has one too).
- About 20 are played by decks that don't code them, e.g. Dark Ritual (Ardyn, Edgar, Meren), Cultivate and Farseek (Sam & Frodo codes them; Aesi, Codie, Helga, Teval, Thantis play them), Swords to Plowshares and Path to Exile, Unearth (Meren), Vampiric Rites (Meren), Gray Merchant (Meren). Some hits are a deck's card values, not rules (Sol Ring, basic lands).
- Gale's kill search (`kill-state.ts`, `kill-moves.ts`) and Codie's solver keep their own model of the cards: they are the deck's planning (what a line of moves would do), not the game's rules. They stay.

Steps, each one commit with `verify` VERIFY OK:
1. The hooks and the engine's own switches as card objects (`engine/card-rules/`). IDENTICAL.
2. The 133 single-deck cards, one deck per commit (biggest first: Edgar, Aesi, Meren, Gale, Codie, Teval, Ardyn...). A new hook (cast triggers, another creature dying, landfall, activated abilities) is added when the first card needs it. A deck whose override doesn't call the engine's hook calls the card-rules dispatcher at the place its own switch was, so the order stays. IDENTICAL.
3. The 11 cards coded twice: show Pontus each difference, pick one version, report before / after, ask before re-recording.
4. The cards other decks play but don't code: they start working there. Report before / after (goldfish and the pod run), ask before re-recording.

**Step 1 done (2026-11-25).** `engine/card-rules/`: `card-rules.ts` (the `CardRules` hooks `resolve`, `onEnter`, `onDies`, `onUpkeep`; the lookup; the dispatchers `resolveSpellByRules`, `enterTriggerOfCommonCard`, `deathTriggerOfCommonCard`, `upkeepOfCommonCards`), `draw-spells.ts`, `mana-spells-and-tutors.ts`, `permanents.ts`. `common-spells.ts` and `common-permanents.ts` are gone (their untap code is `engine/game/untap-lands.ts`). Every deck IDENTICAL.

**Step 2, Edgar done (2026-11-25).** New hooks `onOtherPermanentEnters`, `onPermanentDies` (each of our permanents and the dead one), `onAttacks`, `onWeAttack`; the engine's default `onEnter`, `onDies` and `onAttack` run them. New in `GameCore`: `drainOne`, `drainAllOpponents`, `isSacrificing` (set by `sacrifice`), `useOnceEachTurn` (cleared in `startTurn`), `battlefieldValue` (defaults to `cardValue`), and the token `LIFELINK_VAMPIRE`. Moved: the drains and death payoffs (`aristocrats.ts`: Blood Artist, Vengeful Bloodwitch, Susurian Voidborn, Cruel Celebrant, Cordial Vampire, Elenda, Pitiless Plunderer, Pawn of Ulamog, Carmen, Mayhem Devil), the attack triggers (`attack-triggers.ts`: Edgar Markov, Preacher of the Schism, Vampire Gourmand, Legion's Landing), Welcoming Vampire, Baron Bertram, Gas Guzzler and Forerunner (`permanents.ts`). Edgar's `onEnter` and `onDies` now call the engine's first. Still Edgar's: Emeritus of Woe (prepared spells), Evereth (its damage counts as Edgar's explosion), Legion's Landing's {W} once transformed (`manaSourceKind`; a mana hook comes when a second card needs it), the sacrifice outlets and activated abilities in `actions.ts`. Susurian Voidborn is Edgar's version; Sam & Frodo's `onDies` doesn't call the engine's, so its own copy still runs there (step 3). Every deck IDENTICAL.

**Step 2, Aesi done (2026-11-25).** New hooks `onLandfall` and `landDropsItGives`; the engine's default `onLandEnter` runs landfall, and Aesi's own landfall loop calls `landfallTriggerOf` per permanent, so the battlefield order stays. New in `GameCore`: `extraLandDropsThisTurn` (was Aesi's `dropsBonus`; the engine's own land play doesn't use it yet, so Explore and Summer Bloom give other decks nothing: step 4), `chooseLandToSacrifice`, `libraryCardsToKeep` (0 unless a deck says), `biggestCreature` (from `Game`), `podFightBestCreature`. Moved: the ramp spells (`ramp-spells.ts`: Skyshroud Claim, Search for Tomorrow, Circuitous Route, Reach the Horizon, Nissa's Pilgrimage, Bushwhack, Harrow, Entish Restoration, Summer Bloom, Early Harvest, Seismic Sense), landfall and land drops (`landfall.ts`: Aesi, Lotus Cobra, Druid Class, Khalni Heart Expedition, Loot, Case of the Locked Hothouse, Azusa), Haru-Onna; Aesi's `onEnter` now calls the engine's (its Wood Elves was the engine's word for word). Still Aesi's: Explore, Growth Spiral, Grow from the Ashes, Sylvan Scrying, Crop Rotation (other decks play them: steps 3 and 4); Tatyova (Teval codes it: step 3); the epic spells, Sylvan Awakening and Natural Affinity (lands as creatures and the epic copies hang on Aesi's loops and combat); Azusa's Many Journeys and Invasion of Zendikar (no list plays them; their chapters and the battle are in Aesi's upkeep and combat); Kodama, Retreat to Coralhelm and Elven Raft-Steerer (their choices are Aesi's loop logic); the activated abilities (Druid Class's levels, Khalni's sacrifice: an abilities hook comes with the first deck that needs it moved). Every deck IDENTICAL.

**Whose triggers, and what is not modelled (2026-11-25, Pontus).** The hooks say whose permanents they see (`onAnotherOfOursEnters`, `onOurPermanentDies`; an opponent's creature never reaches them), and `onOtherPlayersCreatureDies` is there for a card that counts other players' creatures (a pod; no card uses it yet). A rule's `notModelled` field is printed for every list that plays the card. Found by reading each moved card's text: Blood Artist, Cordial Vampire and Elenda count only our creatures dying (their text counts every creature), Carmen and Mayhem Devil only our sacrifices (theirs: any player's), Cruel Celebrant not our planeswalkers, Lotus Cobra makes only blue or green. These are as Edgar and Aesi had them; adding the other players' half changes Edgar's pod games, so it is step 4. Every deck IDENTICAL.

## U2. One board, not two (Sonnet 5.5)

The analyzer and `npm run logs` rebuild the board from the logged card moves in `engine/tools/log-board.ts` (395 lines); the game viewer does it in `shared/game-log-board.ts` (286 lines). A fix in one can be missed in the other (roadmap idea 1, `ENGINE.md` "Ideas for later").

1. Compare the two and list here what each does that the other doesn't (the analyzer's extras: tokens read from the log, `logSacOnTap`, `logTrackers`, counters carried over; the viewer's: what it shows per seat).
2. Keep one board in `shared/` (the page may import `shared/`, never `engine/`), with the analyzer's extras either in it or as a thin layer in `engine/tools/` on top of it. No behaviour change.
3. Checks: every deck's regress (it replays each real log through the analyzer) IDENTICAL, `npm run logs` prints the same for a few saved games, `ng build` and `ng test` pass, and the viewer shows a real log (Sam & Frodo's game 2, one of Gale's) the same as before. Remove the note in `ENGINE.md` "Ideas for later" and roadmap idea 1.

## U3. The cards not modelled yet (Opus 5.5; a single card with a clear rule may go to Sonnet 5.5)

From the decks' `PLAN.md` "Open" and "Simulation rules" lists, only cards in a current list (`decklist.txt` or `lists/proposed.txt`, checked 2026-11-24). Card facts go in an engine topic file, the deck's choice of when to use them in its folder. Each card gets a test (engine or deck). After each deck: 4,000 games on the same seeds before / after (16,000 when the change is near the noise line), a line in the deck's `PLAN.md`, and ask before re-recording its baseline.

1. **Edgar** (William's deck: model the cards, no swap proposals): Master of Dark Rites' mana, Cabal Coffers and Urborg (today Coffers is a land that makes {B}); in the pod, its removal in `engine/game/answers.ts` (Feed the Swarm, New Blood, Kindred Dominance, Saw in Half; in a goldfish game they stay held). Culling the Weak and Songs of the Damned only if a line uses them.
2. **Aesi:** Haru-Onna returning to the hand when a Spirit is cast without Omniscience, Familiar's adapt, PuPu UFO's Town ability. (Likeness of the Seeker is no longer in a list: drop it from Aesi's "Open".)
3. **Gale:** Mana Sculpt's mana (in every Gale list). The kill search counts it, so add kill tests first; kill misses stay 0 (the regress checks them).
4. **Pod:** Siren Stormtamer's "targets you" half (`POD_PLAN.md`), with a pod test.
5. **Codie** (last; Pontus said on 2026-11-18 each is worth about a point at most): Mana Drain, Narset's Reversal, Bring to Light, Spelltwine, Crop Rotation, Scapeshift, Splendid Reclamation, Bala Ged Recovery, and the lands Field of the Dead, Mistrise Village and Vesuva. After the first three or four, report the gain; if it stays within noise, ask Pontus whether to go on.

## U4. The app: the commands it is missing, editing lists, a card's print (Opus 5.5 design, then Sonnet 5.5)

Roadmap step 4 lists what is still only on the command line: `--rank`, `--cut`, `--hands`, `--analyze`, editing lists, and picking the print of a card for its image.

1. **Design (Opus 5.5), then P:** where each one goes in the page (for example: the Simulate page gets a mode for rank, cut and hands; the Games page analyzes a deck's real log; the Decks page edits lists and picks prints), the API shapes in `app/api-types.ts`, and the order. Write it here and let Pontus approve it before building.
2. **Build (Sonnet 5.5), one feature per commit**, each with server tests (`npm run app -- --test`) and page tests (`ng test`), `ng build` passing, checked at phone width:
   - `--hands` and `--rank` (tables, like the report tables).
   - `--cut` (a cut test runs only when Pontus names the cards; the page only makes it easier to run).
   - `--analyze` of a real log, linked to the viewer at the turns it flags.
   - Editing lists: save as a new list in `lists/` or over an existing test list; never re-sort (the order deals the hands); never overwrite `decklist.txt` (the built deck) or `lists/proposed.txt` without asking in the page.
   - A card's print: the list of prints from Scryfall's search (not in the bulk data), and the choice kept in the decklist file in a form Archidekt imports (the design says which).
3. Update `README.md` and roadmap step 4's "Left for later" when done.
