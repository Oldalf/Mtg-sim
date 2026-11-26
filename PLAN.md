# Plan: step 12, a heavier engine, one board, missing cards and the app's missing commands

Written 2026-11-24, cleaned up 2026-11-26. Step 11 is in git (`PLAN.md` at commit `29f352e`), the steps before it in `ROADMAP.md`. The full write-ups of U1 and U1b steps 1 to 4 (each deck's moves, hooks, before / after numbers) are in git: `PLAN.md` at commit `f249fb6`.

Still waiting on Pontus from earlier steps: whether to adopt `decks/gale/lists/speed.txt` (step 10), and the answer from Codie's creator on how often he wins by turn 5 (T3).

The friends' decks (Helga, Ardyn, Teval, Thantis, DnD, Azula) are **pod-only**: no goldfish tuning, no swap tests, no card rounds for them unless the owner asks (Pontus, 2026-11-15).

## Order

| # | Task | What | Model | Status |
|---|---|---|---|---|
| 1 | [U1](#u1-done) | Card rules out of the big deck files, the engine's big files split | Opus 5.5 | Done 2026-11-25 (`fdae0c3`..`9d81efb`) |
| 1b.1 | [U1b](#u1b-every-cards-rules-in-the-engine-the-decks-only-decide) step 1 | The hooks; the engine's own switches as card objects (`engine/card-rules/`) | Opus 5.5 | Done 2026-11-25 (`07b7177`) |
| 1b.2 | U1b step 2 | The single-deck cards, one deck per commit | Opus 5.5 | Done 2026-11-26 (`594d90e`..`5470767`) |
| 1b.3 | U1b step 3 | The cards two or three decks coded, merged (Pontus picked each version) | Opus 5.5 | Done 2026-11-26 (`3458075`) |
| 1b.4 | U1b step 4 | The cards one deck coded and others play | Opus 5.5 | Done 2026-11-26 (`f249fb6`) |
| 1b.5a | [U1b step 5a](#5a-engine-pieces-the-cards-wait-for) | Engine pieces the cards wait for, then the cards that wait on them | Opus 5.5 | **Next** |
| 1b.5b | [U1b step 5b](#5b-the-other-players-half-a-pod) | The other players' half of a card (a pod) | Opus 5.5 | |
| 1b.5c | [U1b step 5c](#5c-missing-parts-and-modes) | Missing parts and modes | Opus 5.5 | |
| 1b.5d | [U1b step 5d](#5d-the-wrong-card-source-or-timing) | The wrong card, source or timing | Opus 5.5 | |
| 1b.5e | [U1b step 5e](#5e-behaviour-fixes) | Behaviour fixes for every deck | Opus 5.5 | |
| 2 | [U2](#u2-one-board-not-two-sonnet-55) | One board, not two (the analyzer's and the viewer's) | Sonnet 5.5 | |
| 3 | [U3](#u3-the-cards-not-modelled-yet) | The cards not modelled yet: Edgar, Aesi, Gale, then Codie | Opus 5.5 | |
| 4 | [U4](#u4-the-app-the-commands-it-is-missing-editing-lists-a-cards-print) | The app: missing commands, editing lists, a card's print | Opus 5.5 design, Sonnet 5.5 build | |

U2 can run any time (it touches only the log boards and the page). U3 comes after U1b, so its new card rules go straight into `engine/card-rules/`. U4 comes last: its design may use deck measures that U1 moved.

## How to read this plan

Each task names a model. Give it to that model or a stronger one.

| Model | Tier | What it gets |
|---|---|---|
| Claude Haiku 5.5 | S (small) | Mechanical work with exact steps. No design choices. A command says if it worked. |
| Claude Sonnet 5.5 | M (medium) | A feature or fix with a clear goal, in patterns the code already has. Small choices only. |
| Claude Opus 5.5, or Fable 5.2 | L (large) | Design, work across many files where judgement is needed, or writing that other models will follow. |
| **P** | Pontus | A decision or input. Tasks marked "after P" wait for it. |

Rules for every task:

- Read `CLAUDE.md` first (rule 0 names, KISS). For the engine also `ENGINE.md` (its "Card rules" section lists the hooks, choices and dispatchers), for the page also `app/web/CLAUDE.md`.
- One task is one commit, straight on `main` (a big task may be a few commits, each one passing). `npm run format`, then `npm run verify` must end with VERIFY OK (`verify --quick` while working).
- Ask Pontus eco or full power before any task that runs simulations (`verify` with regress checks counts).
- Before changing pod code, save a fixed-seed pod run (`npm run pod -- gale meren samfrodo aesi edgar -n 200 --no-log`) and compare it afterwards; `--regress check` does not cover pod mode. `verify` also compares that run with `regress_baseline/pod.txt`; re-record it (`node scripts/verify.mjs --eco --record-pod`) only for a change Pontus accepted.
- A move of code must leave every deck IDENTICAL (goldfish and the pod run). A new or fixed card rule changes the results of the decks that play the card: report before / after (goldfish 4,000 games where a deck has regress, pods of 400 games otherwise; the pod noise is about 5 points) and ask before re-recording a baseline.
- A task that finds its steps do not fit the code stops and says so. It does not improvise a bigger change.
- When a task is done, set its status in the table above and add one short line under it: what was built and what the next task must know. Long write-ups go in the commit message.

---

## U1 (done)

The big files were split by topic (`casting.ts`, `turn.ts`, `pod-attacks.ts`, `pod-answers.ts`, `pod-win-answers.ts`, `pod-card-effects.ts`; Aesi `land-drops.ts` and `combat.ts`, Mike `drawing.ts`, Meren `sacrifice.ts` and `end-step.ts`). `ENGINE.md` lists why each file still over 800 lines stays that size. Code for cards that other decks' lists don't play but their `PLAN.md` names as tried swaps stays.

## U1b. Every card's rules in the engine, the decks only decide

Pontus, 2026-11-25: the engine handles the cards, the decks are the strategy (what to prioritise), with no card rules of their own. One plain object per card with hooks the engine runs (`engine/card-rules/`, `ENGINE.md` "Card rules").

### The rules a card rule follows (Pontus, 2026-11-25 and 26)

- **The card says what may be taken, the deck chooses within it.** A rule calls a `GameCore` choice method wherever the card asks its controller to choose (`chooseLandToFetch`, `chooseAnyLandToFetch`, `creatureToSacrificeFor`, `cardToPutInGraveyard`, `chosenCreatureType`...); the default is a sensible rule, a deck overrides it. The land choice's default weighs the cards in hand against the lands out.
- **Whose permanents a hook sees.** Our hooks see our permanents only (`onAnotherOfOursEnters`, `onOurPermanentDies`); a card whose text counts other players' creatures adds `onOtherPlayersCreatureDies` (a pod only).
- **Each permanent triggers on its own.** Rules look at permanents, not names, so token copies trigger too.
- **Stolen cards keep their engine rules** (a creature Meren takes from an opponent's graveyard works for her).
- **What a rule doesn't model is a comment** starting `// CHECK WHEN ANOTHER DECK PLAYS IT:` (the `/add-deck` skill checks them for each card of a new list). 84 after step 4: `grep -rn "CHECK WHEN ANOTHER DECK PLAYS IT" engine`.
- **A deck keeps its trigger order** through `orderSimultaneousTriggers` or by calling a dispatcher at its own place (`upkeepOfCommonCards` and `endStepTriggers` take the cards a deck runs elsewhere). The order of simultaneous triggers is the controller's choice, so this stays.
- **A goldfish game has stand-ins, a pod the real thing.** Breach the Multiverse takes a 5/5 stand-in from each goldfish opponent; in a pod a real creature or planeswalker card, and an opponent with neither gives nothing.
- **Deck planning stays in the deck.** Gale's kill search (`kill-state.ts`, `kill-moves.ts`), Codie's solver and Azula's combos keep their own model of the cards: they are what a line of moves would do, not the game's rules.

### Steps 1 to 4 (done)

Every hook, dispatcher and choice they added is in `ENGINE.md` "Card rules"; the checks of the merged cards are in `engine/card-rules/merged-cards.test.ts`. Step 4's scan (every decklist against the decks' rule code, constants included) found nothing else coded in one deck and played uncoded in another: the cards it named are the engine's already (counterspells and removal in `answers.ts`, `LAND_SEARCH`, rocks, spell copies) or deck planning. Fixed on the way in step 4: Thantis drew twice for Garruk's Uprising since step 3.

### Step 5. Every card does what its text says

Pontus, 2026-11-25: "make sure it's in the plan to do this correctly". Steps 2 to 4 kept the decks' old shortcuts so the results stayed comparable; this step removes them. The list is every `CHECK` comment and every card still coded in a deck folder (the table below). One group per commit; each reports before / after and asks before re-recording. A fixed card loses its comment. Done when the grep finds nothing and no deck folder has card rules left.

#### 5a. Engine pieces the cards wait for

Each piece first, then its cards move into `engine/card-rules/` (they are coded in the deck named, and played by the decks after "also").

| Engine piece | Cards (the deck that codes them; also: decks that play them uncoded) |
|---|---|
| Until-end-of-turn effects | Zopandrel, Pyrewood Gearhulk (Thantis); Craterhoof Behemoth, Become the Avalanche (Helga); Goreclaw's attack pump; Sozin's Comet (Azula) |
| The monarch, also taken by others | Grave Venerations (Thantis), Regal Behemoth (Helga) |
| Delayed triggers | Avacyn's return (Thantis) |
| Token copies with the copied card's types plus the new one | Starscourge's Demons; then Ardyn and Unholy Annex move (Ardyn), and Roaming Throne counts the copies |
| Activated abilities and loyalty | Helga's mana; Professor Dellian Fel (Thantis); Druid Class, Khalni Heart Expedition, Expedition Map (Aesi); Legion's Landing's {W} (Edgar); Niko, Genku's counters, Rasputin, Dungeon Map, Dungeon Descent, Delver's Torch (DnD); Lobelia, Witch's Oven, Trading Post, Idol of Oblivion, Savvy Hunter, Cauldron Familiar's return (Sam & Frodo); Codie's Spirit Guides; Rogue's Passage (Mike; also DnD, Helga, Sam & Frodo) |
| Sacrifice outlets as card rules | Viscera Seer (Edgar and Meren each), Vampiric Rites (Edgar and Meren each), Umbral Collar Zealot (Meren and Sam & Frodo), Sakura-Tribe Elder (Meren; also Aesi, Helga, Teval, Thantis), the rest of Edgar's `actions.ts` |
| Mana abilities with a side effect or a variable amount | Gilded Goose eats a Food, The Notary Hobbits, Pristine Talisman (Sam & Frodo); Selvala's {G}, {T}: X mana, X the greatest power (Thantis taps it for {C}{C}, Helga not at all) |
| A beginning-of-combat trigger | Sam's Food (Sam & Frodo's combat is its own, with Frodo's Ring and Gollum's drain); Loyal Drake (Mike) |
| Seeing another player's graveyard from a rule | Crypt Incursion (Sam & Frodo) |
| X of a permanent spell | Farmer Cotton (Sam & Frodo), Fated Firepower (Azula) |
| Speed | Vnwxt, Slick Imitator, the Raceways, Muraganda Raceway's mana (Mike) |
| Draw replacements and "whenever you draw" | Teferi's Ageless Insight, Psychosis Crawler, Clinquant Skymage, Oneirophage, Ominous Seas, Wizard Class, Emrakul's Messenger, Mischievous Mystic, Krang, the second-draw cards (Mike) |
| Drawing from an empty library | Laboratory Maniac, Jace, Ormos, Living Conundrum (Mike) |
| Copy effects on a permanent | Aurora Shifter, Slick Imitator's copy (Mike) |
| Auras and equipment | Nerd Rage, Aqueous Form, Hand of Vecna, Atomic Microsizer (Mike); Swiftfoot Boots, Whispersilk Cloak (Azula); Lightning Greaves (Helga and Azula: Helga gives haste to every creature that enters, Azula equips Azula. Pontus, 2026-11-26: much of Greaves is the shroud, so Helga would equip it to keep a creature from the other players' removal; the piece lets a deck choose what to equip for protection, not only for haste) |
| Alternate wins | Twenty-Toed Toad (Mike) |
| Casting from the graveyard as a permission | Muldrotha (Teval) |
| A cast trigger for every spell: the hook `onWeCastSpell` exists since step 4 | Ancient Cellarspawn (Ardyn); Ruric Thar on our own spells, also in a goldfish game (Thantis); Oji on the second spell, Kykar, Hullbreaker Horror, Tomb of Horrors Adventurer (DnD); Azula's copy while she attacks, Vivi Ornitier, Storm of Saruman, Prismari, Arcane Bombardment (Azula); Codie's own trigger |
| Copies of spells, and casting a copy without paying | Torment of Hailfire and Reiterate (Codie resolves every copy at once); Arcane Bombardment, Mysterious Stranger, Torrential Gearhulk (Azula); the spell copies' mana (Mike) |
| Mana that stays in the pool between steps | Ozai (Azula) |
| Flash as a permission | Leyline of Anticipation, High Fae Trickster, Valley Floodcaller, Wizards of Thay, Scarring Memories (Azula) |
| Damage apart from life loss | Fated Firepower adds to damage only, Scarring Memories (Azula); Evereth's damage counts as Edgar's explosion (Edgar) |
| Additional costs as the card's rule, not the deck's | Big Score, Unexpected Windfall, Demand Answers (Azula, paid in `candidates.ts`) |
| Effects until our next turn | Morningtide's Light's shield (DnD) |
| Airbend | Avatar's Wrath, Airbender Ascension's enter trigger (DnD) |
| Evasion and keywords under a condition | Midnight Pathlighter: only legendary creatures block; Cloister Gargoyle: flying and +3/+0 after a completed dungeon (DnD) |
| Prepared spells | Emeritus of Woe (Edgar), Studious First-Year (Meren), Skycoach Conductor, Emeritus of Ideation (DnD) |
| Lands as creatures, epic copies, Aesi's land loop | Sylvan Awakening, Natural Affinity, the epic spells, Kodama of the East Tree, Retreat to Coralhelm, Elven Raft-Steerer (Aesi; Azusa's Many Journeys and Invasion of Zendikar too, though no list plays them) |
| Meren's own state | Puppeteer Clique and Sepulchral Primordial (`stealCreatures`), D'Ghor Bloodletter and the edict creatures (her sacrifice order), Vindictive Lich and Junji (their pod modes), persist, Decode Transmissions, Deadly Brew, Dina's Guidance |
| Gale's kill roles | Unearth and Zombify (Gale picks the creature by its kill roles), Gale's recast trigger; the combo cards' effect on the opponents stays the kill search's model |
| Others | Fblthp, Body of Knowledge, Mystic Sanctuary's "enters tapped" (Mike's Island count), Wash Out's colour (Mike); Mana Drain's flat option (Codie, a setting) |

#### 5b. The other players' half (a pod)

Blood Artist, Cordial Vampire, Elenda, Cruel Celebrant (also our planeswalkers), Carmen, Mayhem Devil, Harvester of Souls, Ob Nixilis, Unshackled (also its search punishment) and Venomcrawler count every player's creatures dying or sacrifices; Gauntlet of Power and Lavaleaper affect every player; Ob Nixilis, the Ascended's Angel at each end step; Bloodletter only on our turn; Archfiend of Despair's "can't gain life"; Sangromancer's discard half; Selvala's draw for other players' creatures.

#### 5c. Missing parts and modes

Archon of Cruelty's sacrifice and discard, Glissa's other modes (the deck choosing the mode), Taborax's lifelink and Cleric draw, Kozilek, Butcher of Truth's shuffle, Kozilek, the Broken Reality's manifests, Ulamog, the Ceaseless Hunger's attack, Ulamog, the Defiler's real counters and ward, It That Betrays, Ohran Frostfang's deathtouch, Ob Nixilis, the Ascended's enter trigger, Stormsurge Kraken's draw, Akroma's Memorial's other keywords, Radagast's flash, Rishkar's Expertise on any spell, Rhythm of the Wild's "can't be countered", Neyith's real triggers, Grave Titan's attack, The Scarab God's scry and ability, Teval's Judgment's third mode, Will of the Abzan's sacrifice, Turnabout's other modes, Flow State's second part, Burning-Rune Demon's two cards and the opponent's pick, Scion of Halaster binning any number, Pensive Professor's draw for counters from other cards.

#### 5d. The wrong card, source or timing

Six (one of the milled lands), Ripples of Undeath (first main phase, one of the milled cards, {1} and 3 life), Geode Rager (a land gone at once still triggers), Caged Sun (any land making the colour), Jet Medallion (hybrid and {B/P} black spells), Ancient Cellarspawn (Horrors and Nightmares), Kozilek, the Broken Reality's colourless check (a token's colours), Doubling Season and Nyxbloom Ancient (every counter and mana source), Crackle with Power (creatures and planeswalkers too), Lotus Cobra's colour (the deck's choice), Shriekmaw (nonartifact, nonblack), Terastodon on our own permanents, a creature cast from a graveyard for Liliana, the Repentant's count, Pensive Professor's mana really spent (it counts the mana value).

#### 5e. Behaviour fixes

- The once-each-turn record cleared every turn for every deck (Meren clears it at each opponent's upkeep; clearing it every turn changes Edgar's pod games: Baron Bertram could trigger again on an opponent's turn).
- Summer Bloom's extra land drops in the engine's own land play (`extraLandDropsThisTurn` is counted only by Aesi; Explore already plays its land at once).
- Beastmaster Ascension's counters doubled.
- Buried Alive triggering Sidisi and the Grave-Reaver.

## U2. One board, not two (Sonnet 5.5)

The analyzer and `npm run logs` rebuild the board from the logged card moves in `engine/tools/log-board.ts` (395 lines); the game viewer does it in `shared/game-log-board.ts` (286 lines). A fix in one can be missed in the other (roadmap idea 1, `ENGINE.md` "Ideas for later").

1. Compare the two and list here what each does that the other doesn't (the analyzer's extras: tokens read from the log, `logSacOnTap`, `logTrackers`, counters carried over; the viewer's: what it shows per seat).
2. Keep one board in `shared/` (the page may import `shared/`, never `engine/`), with the analyzer's extras either in it or as a thin layer in `engine/tools/` on top of it. No behaviour change.
3. Checks: every deck's regress (it replays each real log through the analyzer) IDENTICAL, `npm run logs` prints the same for a few saved games, `ng build` and `ng test` pass, and the viewer shows a real log (Sam & Frodo's game 2, one of Gale's) the same as before. Remove the note in `ENGINE.md` "Ideas for later" and roadmap idea 1.

## U3. The cards not modelled yet

Opus 5.5; a single card with a clear rule may go to Sonnet 5.5. From the decks' `PLAN.md` "Open" and "Simulation rules" lists, only cards in a current list (`decklist.txt` or `lists/proposed.txt`, checked 2026-11-24). Each card is a rule in `engine/card-rules/` (with a `CHECK` comment for what it leaves out), the deck's choice of when to use it in its folder. Each card gets a test. After each deck: 4,000 games on the same seeds before / after (16,000 when the change is near the noise line), a line in the deck's `PLAN.md`, and ask before re-recording its baseline.

1. **Edgar** (William's deck: model the cards, no swap proposals): Master of Dark Rites' mana, Cabal Coffers and Urborg (today Coffers is a land that makes {B}); in the pod, its removal in `engine/game/answers.ts` (Feed the Swarm, New Blood, Kindred Dominance, Saw in Half; in a goldfish game they stay held). Culling the Weak and Songs of the Damned only if a line uses them.
2. **Aesi:** Haru-Onna returning to the hand when a Spirit is cast without Omniscience, Familiar's adapt, PuPu UFO's Town ability. (Likeness of the Seeker is no longer in a list: drop it from Aesi's "Open".)
3. **Gale:** Mana Sculpt's mana (in every Gale list). The kill search counts it, so add kill tests first; kill misses stay 0 (the regress checks them).
4. **Pod:** Siren Stormtamer's "targets you" half (`POD_PLAN.md`), with a pod test.
5. **Thantis:** Black Market (played generically today).
6. **Codie** (last; Pontus said on 2026-11-18 each is worth about a point at most): Mana Drain, Narset's Reversal, Bring to Light, Spelltwine, Scapeshift, Splendid Reclamation, Bala Ged Recovery, and the lands Field of the Dead, Mistrise Village and Vesuva. (Crop Rotation works since U1b step 4.) After the first three or four, report the gain; if it stays within noise, ask Pontus whether to go on.

## U4. The app: the commands it is missing, editing lists, a card's print

Opus 5.5 design, then Sonnet 5.5. Roadmap step 4 lists what is still only on the command line: `--rank`, `--cut`, `--hands`, `--analyze`, editing lists, and picking the print of a card for its image.

1. **Design (Opus 5.5), then P:** where each one goes in the page (for example: the Simulate page gets a mode for rank, cut and hands; the Games page analyzes a deck's real log; the Decks page edits lists and picks prints), the API shapes in `app/api-types.ts`, and the order. Write it here and let Pontus approve it before building.
2. **Build (Sonnet 5.5), one feature per commit**, each with server tests (`npm run app -- --test`) and page tests (`ng test`), `ng build` passing, checked at phone width:
   - `--hands` and `--rank` (tables, like the report tables).
   - `--cut` (a cut test runs only when Pontus names the cards; the page only makes it easier to run).
   - `--analyze` of a real log, linked to the viewer at the turns it flags.
   - Editing lists: save as a new list in `lists/` or over an existing test list; never re-sort (the order deals the hands); never overwrite `decklist.txt` (the built deck) or `lists/proposed.txt` without asking in the page.
   - A card's print: the list of prints from Scryfall's search (not in the bulk data), and the choice kept in the decklist file in a form Archidekt imports (the design says which).
3. Update `README.md` and roadmap step 4's "Left for later" when done.
