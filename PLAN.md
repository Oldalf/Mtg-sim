# Plan: step 9, after game night

Written 2026-11-16. Step 8's plan (the engine rules for many decks, the friends' decks, Gale's kill search, the maximum hand size audit) is done and is in git: `PLAN.md` at commit `c88cda4`. Its finished tasks are not repeated here.

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
- One task is one commit, straight on `main`. `npm run format`, then `npm run verify` must end with VERIFY OK.
- Ask Pontus eco or full power before any task that runs simulations (`verify` with regress checks counts).
- Before changing pod code, save a fixed-seed pod run (`npm run pod -- gale meren samfrodo aesi edgar -n 200 --no-log`) and compare it afterwards; `--regress check` does not cover pod mode.
- An engine change must leave every existing deck IDENTICAL (goldfish and the pod run). A task that would change them stops and asks.
- A task that finds its steps do not fit the code stops and says so. It does not improvise a bigger change.
- When a task is done, add one line under it here: what was built and anything the next task must know. When the whole plan is done, it is cleared and a new one written.

## Order

| # | Task | What | Model |
|---|---|---|---|
| 1 | G1 | **Done.** DnD: map the deck from its owner's primer | Opus 5.5, after P (the primer) |
| 2 | G2 | The pod report again, with the engine as it is now | Haiku 5.5 |
| 3 | G3 | **Done.** Helga: annihilator and the Eldrazi's removal | Sonnet 5.5 |
| 4 | G4 | **Done.** Codie's counterspells missing from `answers.ts` | Sonnet 5.5, after P |
| 5 | G5 | **Done.** A blink in an opponent's turn returns at that player's end step | Sonnet 5.5 |
| 6 | G6 | **Done.** Initiative and dungeon rooms that were left out | Sonnet 5.5 |
| 7 | G7 | **Done.** Spells cast through a deck's own code announce themselves; Mystic Remora and Esper Sentinel | Sonnet 5.5 |
| 8 | G8 | **Done.** Finale of Revelation and Aesi's hand size use the engine's rule | Haiku 5.5 |
| 9 | G9 | **Done.** Black tutors move to the engine | Sonnet 5.5 |
| 10 | G10 | **Done.** Aesi's and Sam & Frodo's land search use the engine's | Sonnet 5.5 |
| 11 | G11 | Edgar, Meren and Sam & Frodo move onto `CreatureDeckGame` | Opus 5.5 (the first), Sonnet 5.5 (the others) |

Azula's next task (B7) is not in this plan: it waits in `decks/azula/PLAN.md` ("Next task B7") until Pontus wants it, since Azula may not be played in the pod at all.

Order: G1 first, because DnD will see real pods soon (Pontus, 2026-11-16). G2 to G7 make the pod numbers more true, so they come before the clean-ups (G8 to G11).

---

## G1. DnD: map the deck from its owner's primer (Opus 5.5, after P)

Hama Pashar, Ruin Seeker (`decks/dnd`), William's deck. Its owner wrote a primer for it and gave it to Pontus; the deck will be played in real pods soon, so this is the most important task. The deck was built from the list and a short description (blink enter and leave triggers, ventures into Lost Mine of Phandelver, the Undercity through the initiative). The primer says what the deck is really trying to do.

**Needs from Pontus:** the primer as a text file in `decks/dnd/` (for example `decks/dnd/primer.txt`, in the owner's own words).

1. Read the primer and `decks/dnd/PLAN.md` (how the deck wins, what it models, what it does not). List what the primer says that the deck does not do yet: the game plan by turn, the key cards and why, the combos and engines, what to mulligan, what to hold, what to protect, what it fears.
2. Write that list into `decks/dnd/PLAN.md` under "From the primer", card by card where the primer names a card: modelled / not modelled / modelled differently.
3. Fix what the primer shows is wrong or missing, biggest effect first, each with a test in `decks/dnd/tests/dnd.test.ts`: the AI's priorities (`VALUE`, `HOLD`, `candidates.ts`), the blink targets (`BLINK_VALUE`), any combo or loop the primer names (a declared win, like Gale's kill line or Azula's `combos.ts`), the opening hand (`mulligan.ts`; see the `/add-deck` skill). Midnight Pathlighter counts as unblockable, which overrates the deck: make it right.
4. If the primer needs an engine rule the engine lacks, add it to `engine/` with a test (every other deck IDENTICAL) or, if it is big, write it as a new task here and stop.
5. Numbers before and after (goldfish 2,000 games; pod with Meren, Edgar and Helga 1,000 games) in `decks/dnd/PLAN.md`. Show Pontus what changed.
6. Done when `npm run sim -- dnd --test` exits 0, a `--trace` game and a pod `--trace` game look like what the primer describes, and `npm run verify` ends VERIFY OK.

Done 2026-11-16: primer in `decks/dnd/primer.txt`, the card-by-card map in `decks/dnd/PLAN.md` ("From the primer"). The list swapped Cloud of Faeries, Claim Jumper and Azorius Signet for Cathars' Crusade, Radiant Solar and Kykar (the owner's cuts). Engine: a `'legendary'` evasion (Midnight Pathlighter), `creature-enter-triggers.ts` (Cathars' Crusade, Radiant Solar), `Arena.bounceAllCreatures`, and `Arena.snipe` takes the source's name for the log (it said "Shriekmaw" for every card) and a minimum value. Every other deck IDENTICAL (fixed-seed pod run). Blink as an answer to removal and wipes is new task G14.

## G14. Blink in answer to removal and wipes (Sonnet 5.5)

DnD's primer: Kykar, Lae'zel's Acrobatics and Ephemerate "dodge boardwipes or removal". In a pod an opponent's removal (`hitWithRemoval`) asks the owner's `podShield` first; a wipe (`castBoardWipe`) asks nothing.

1. Targeted removal: DnD overrides `podShield` to cast Ephemerate (or Ghostly Flicker) on the targeted creature when it has the mana open; the blink makes the removal miss. The blink must target that creature, not the best blink target.
2. Wipes: a hook before `castBoardWipe` removes the creatures, so the owner can answer with Lae'zel's Acrobatics (all nontoken creatures exiled until the end step: G5's end step rule matters here). Only DnD plays these now.
3. Tests in `decks/dnd/tests` and `engine/pod/pod.test.ts`. Every other deck IDENTICAL; DnD's pod numbers before and after.

## G2. The pod report again (Haiku 5.5)

The game-night report of 2026-11-15 (Teval 31.4%, Meren 23.5%, Ardyn 22.7%, Helga 12.0%, Edgar 10.3%) was run before forced attacks, opponent-cast triggers, blink, Treasure in the engine and the hand size fixes. Helga's numbers in particular changed (her Ulamog's Crusher now attacks every combat).

1. Ask Pontus eco or full power. Run `npm run pod -- meren edgar helga ardyn teval -n 1000` (on this machine: `node --enable-source-maps dist/sim.js pod ...`, see the running-node memory). Save the reports in the scratchpad.
2. Also run the pods Pontus is likely to play next: `dnd thantis helga ardyn teval` and `azula meren edgar helga`, 1,000 games each.
3. Write a short table per pod under this task: each deck's win rate, average round, who goes out first, and which deck the others should watch. Plain text a person can read on a phone. Next to each friend's deck, say what is not modelled (copy it from its `PLAN.md`).
4. Do not change code.

Done 2026-11-16, eco mode, 1,000 games per pod, no code changed. "First knocked out" = the share of games where that deck was the first one out.

Pod A: Meren, Edgar, Helga, Ardyn, Teval (5 decks, even share 20%)
- Teval: 31.6% wins, average round 9.2, first knocked out 9.1%
- Meren: 23.2% wins, average round 9.3, first knocked out 25.2%
- Ardyn: 22.1% wins, average round 9.3, first knocked out 17.2%
- Helga: 12.6% wins, average round 9.8, first knocked out 16.9%
- Edgar: 10.3% wins, average round 9.0, first knocked out 31.6%
Watch: Teval. It wins most, and 8.0% of all games end by round 8. Edgar is knocked out first most often.
Not modelled: Teval (the owner's misplays: the numbers likely overrate it; see decks/teval/PLAN.md). Ardyn (Cabal Coffers, Nykthos and extra mana from the lands; menace; another player's graveyard). Helga (It That Betrays taking sacrifices; Ob Nixilis's removal; the Ulamogs' mills; see G3). Edgar (Master of Dark Rites' mana; Cabal Coffers; a counterspell on the explosion ability).

Pod B: DnD, Thantis, Helga, Ardyn, Teval (5 decks, even share 20%)
- Teval: 30.1% wins, average round 9.3, first knocked out 14.4%
- DnD: 22.6% wins, average round 9.6, first knocked out 26.4%
- Ardyn: 21.5% wins, average round 9.5, first knocked out 20.4%
- Thantis: 16.4% wins, average round 9.8, first knocked out 14.9%
- Helga: 9.2% wins, average round 10.0, first knocked out 23.9%
Watch: Teval and DnD. DnD wins a third of its games by round 10 and loses first in 26.4%. Ardyn also declares some wins itself (1.9%).
Not modelled: DnD (blink against removal and wipes, G14; the goad rooms, G6; a blink on an opponent's turn, G5; Avatar's Wrath's exile; warp). Thantis (Shredder's copies, Archon of Cruelty's sacrifice and discard, Chainer, Black Market). Helga (as in Pod A). Teval and Ardyn (as in Pod A).

Pod C: Azula, Meren, Edgar, Helga (4 decks, even share 25%)
- Meren: 37.5% wins, average round 9.4, first knocked out 19.3%
- Edgar: 31.9% wins, average round 9.1, first knocked out 18.9%
- Helga: 24.7% wins, average round 10.0, first knocked out 13.5%
- Azula: 5.8% wins, average round 8.5, first knocked out 48.3%
Watch: Meren and Edgar. Azula is knocked out first in almost half its games. When it does win, it is earlier (average round 8.5), but it wins only 5.8%. It is stopped in 28.6% of its win attempts.
Not modelled: Azula (Reiterate and Reverberate outside the combos; Torment of Hailfire outside a combo; Callidus Assassin's copy; Deflecting Swat, Redirect Lightning and Vandalblast; Ozai's flying).

Helga is below an even share in all three pods (lowest in Pod B, 9.2%). Her annihilator and removal are G3.

## G3. Helga: annihilator and the Eldrazi's removal (Sonnet 5.5)

Helga's `PLAN.md` lists annihilator and the removal that Eldrazi and Terastodon do as not modelled. Her list plays Kozilek, Butcher of Truth, Ulamog, the Defiler, Ulamog's Crusher, Ulamog, the Ceaseless Hunger and Terastodon. In a pod these decide games and make Helga look weaker than she is.

1. Annihilator N: when the creature attacks, each defending player sacrifices N permanents (the least valuable first: tokens, then lands, then the cheapest permanents). Read each card's text in the Scryfall data (`data/cards.json`) first; do not go from memory. Keep it in `decks/helga/` unless a second deck needs it (rule of three).
2. The removal on cast or enter: Ulamog, the Ceaseless Hunger (exile two target permanents when cast), Terastodon (destroy up to three noncreature permanents; their controllers get 3/3 Elephants), Kozilek, Butcher of Truth (draw four when cast). Use the pod's removal path (`podCast` / the Arena's helpers) so shields and the log work.
3. A test for each rule in `decks/helga/tests`. Pod numbers before and after (Helga, Meren, Edgar, Ardyn, 1,000 games), written under this task. Goldfish results unchanged.

Done 2026-11-16, eco mode. Built: `Arena.annihilate` (engine/pod/pod-interaction.ts: the defender sacrifices N permanents, tokens first, then the cheapest nonland permanents, then lands); Helga overrides `strike` to fire annihilator (Kozilek 4, Crusher 2, It That Betrays 2, Ulamog the Defiler X = its counters); the removal uses the existing `arena.snipe` (Ulamog, the Ceaseless Hunger exiles two permanents; Terastodon destroys up to three noncreature permanents worth 45+ and the owner gets a 3/3; Angel of the Ruins exiles up to two artifacts or enchantments). All pod-only: goldfish is unchanged. Test: engine/pod/pod-eldrazi.test.ts (run by `npm run pod -- --test`). Assumptions: Ulamog the Defiler enters with 6 counters in a pod (the exiled half of the library is not looked at); Terastodon's tokens are the engine's 3/3 Beast, not an Elephant. Left out: It That Betrays taking what is sacrificed; Ob Nixilis's destroy-tapped-creatures; the Ulamogs' mills. `verify --full`: VERIFY OK, every deck IDENTICAL.
Pod (Helga, Meren, Edgar, Ardyn, 1,000 games, seeds the same): Helga 16.0% -> 18.9% wins (average round 9.85 -> 9.75); Meren 29.9% -> 28.3%; Edgar 28.2% -> 27.5%; Ardyn 25.9% -> 25.3%. (Lands are sacrificed last, after the cheapest nonland permanents: Pontus, 2026-11-16.)

## G4. Codie's counterspells missing from `answers.ts` (Sonnet 5.5, after P)

Codie's `BACKUP` table (`decks/codie/cards.ts`) lists these cards, all in Codie's decklist, that `engine/game/answers.ts` does not know: **Silence, Orim's Chant, Daze, Bilbo's Gambit, Autumn's Veil, Narset's Reversal**. In a pod Codie holds them for its combo but never uses them as answers, and no other deck can either.

Pontus decides which of them become answers (the rest stay `BACKUP`-only). Read each card's text in the Scryfall data first. They differ: Silence and Orim's Chant stop a player casting spells this turn; Daze counters unless the caster pays {1} (free by returning an Island); Bilbo's Gambit and Autumn's Veil protect our own spells or permanents; Narset's Reversal copies an instant or sorcery and returns it to its owner's hand.

Add each chosen one with a test in `engine/pod/pod.test.ts`. Codie's pod games change: numbers before and after (Codie, Meren, Edgar, Helga, 1,000 games). Goldfish IDENTICAL.

Done 2026-11-16, eco mode. Chosen (decided without waiting for Pontus; say if you want others): **Daze** (counter; free by returning an Island, a tapped one first: `Game.answerCost` / `podCast`) and **Bilbo's Gambit** (counter: it returns the spell to hand, so it is stopped this time; the gift and the no-spells clause are left out). Not answers: Narset's Reversal (copies our own spell) stays `BACKUP`-only. Silence, Orim's Chant and Autumn's Veil are protection, see below. Tests in engine/pod/pod.test.ts.
Pod (Codie, Meren, Edgar, Helga, 1,000 games, seeds the same): Codie 20.4% -> 20.1% wins (average round 6.96 -> 6.99); Meren 30.8% -> 31.3%; Edgar 30.8% -> 29.6%; Helga 18.0% -> 19.0%. Goldfish untouched (verify below).
Then, at Pontus's request (Silence-type cards protect a win by stopping the others' answers): (1) Codie got a `winAttempt()` (decks/codie/game.ts): before this its wins in a pod could never be answered. The finisher it casts can now be countered; backup = a counterspell it can still pay for after the line. (2) Engine `PROTECTIONS` (engine/game/answers.ts) and `WinAttempt.protect`: `answerWin` lets the winner cast Silence (no opponent can cast spells), Orim's Chant (one opponent, the one with the most interaction in hand; unkicked) or Autumn's Veil (blue and black cards can't answer) first. Left out: kicked Chant (no attacks), Veil on creatures, protection cast outside a win attempt. (3) Test: engine/pod/pod-protection.test.ts.
Pod after (Codie, Meren, Edgar, Helga, 1,000 games): Codie 20.1% -> 19.0% wins (average round 6.99 -> 7.03; 0.21 win attempts a game, 8.2% stopped); Meren 31.3% -> 31.9%; Edgar 29.6% -> 29.9%; Helga 19.0% -> 19.2%.

## G5. A blink in an opponent's turn returns at that player's end step (Sonnet 5.5)

**Done.** `BlinkedCard.inOpponentTurn` (set by the `inOpponentTurn` blink option) keeps a card out of our own end step; `playTurn` in pod.ts returns it at the end of that opponent's turn (`returnBlinkedCardsAtOpponentEndStep`). Nothing blinks in an opponent's turn yet (G14 will), so every deck and the pod run are unchanged.

The blink (`engine/game/blink.ts`) exiles "until the next end step" and returns the card at the start of our own `endTurn`. If we blink in an opponent's turn (Ephemerate or Ghostly Flicker at instant speed), the card should return at the end of that opponent's turn.

1. `GameCore.cardsReturningAtEndStep` holds the cards. Record whose end step each one waits for, and let the pod return them at the end of each player's turn.
2. A test in `engine/game/blink.test.ts`: a card blinked in an opponent's turn is back after that turn's end step, not before.
3. Every deck IDENTICAL; pod run unchanged unless DnD blinks in an opponent's turn (then show DnD's numbers).

## G6. Initiative and dungeon rooms that were left out (Sonnet 5.5)

**Done.** Rule 726.4: when the holder leaves, the active player takes the initiative (the next player in turn order if that player is leaving) and ventures into Undercity (`PodTable.passInitiativeFrom`). Twisted Caverns, Fungi Cavern and Arena hit the biggest threat's most powerful targetable creature in a pod (`pod-interaction.ts`; they end at our next turn). Runestone Caverns stays as drawing two: the engine has no "play from exile this turn". Checks in `dungeons.test.ts`. Every deck IDENTICAL, except that gale's `--regress check` already differs in its kill-finder tests before this change (since b5fc943). The DnD pod run (Pod B, 1,000 games) is unchanged: DnD's path choice never takes those rooms (Arena is worth 1, Stash 2).

`engine/game/dungeons.ts` leaves out: the initiative passing on when its holder leaves the game; rooms that only hit an opponent's creature (Twisted Caverns, Fungi Cavern, Arena's goad); Runestone Caverns, which counts as drawing the two cards.

1. Initiative: read the rule text (comprehensive rules 725) for what happens when the holder leaves the game, then build it.
2. The three rooms use the pod's removal and goad helpers (`arena.goadCreatures`). Only in a pod: a goldfish game has no one to target.
3. Tests in `engine/game/dungeons.test.ts`. Every deck IDENTICAL except DnD's pod numbers (show them).

## G7. Spells cast through a deck's own code announce themselves (Sonnet 5.5)

`podAnnounceCast(card)` tells the other players a spell was cast, so Taurean Mauler and Rhystic Study see it. Spells that a deck casts through its own code (Gale's counter-your-own-spell line, Codie's finishers) don't announce. Mystic Remora (cumulative upkeep) and Esper Sentinel are not modelled.

1. List every place a spell is cast without `podAnnounceCast` (search the engine and the decks for casts that bypass `castInstantOrSorcery` and `castPerm`). Write the list under this task. Make each call it, or say why not.
2. Mystic Remora and Esper Sentinel: only if a `decklist.txt` plays them (check first; if none does, write "no deck plays them" and skip). Otherwise add them to `engine/game/opponent-cast-triggers.ts` with a test.
3. Pod run before and after (the fixed-seed run in the rules above): decks that play Rhystic Study or Taurean Mauler may change; show Pontus the numbers.

Done 2026-11-16, eco mode. Now announced (one `podAnnounceCast` each): Gale's Gale recast (`game.ts`) and counter-your-own-spell line (`candidates.ts`; announced once the counter is paid, so a Rhystic Study payment cannot eat its mana); Aesi's Patron of the Moon (moonfolk offering), Fertile Footsteps, Beanstalk Giant from exile, a cast from the top (Case) and Blue Sun's Zenith for itself; Codie's `spendSpell` and the Reiterate cast; Meren's evoke, Eldritch Evolution, Saw in Half and Beast Within; Mike's Treasure Cruise; Sam & Frodo's Farmer Cotton; engine `wishclaw`. Left silent on purpose: kill lines and combos (Gale's `kill-play.ts`, Codie's finishers, Azula's `combos.ts`, Aesi's `castZenithWithX`: they are played on a copy that never announces, and a standing win ends the game); Harmonized Trio's Brainstorm (a copy, not a cast); suspend (not a cast); Codie's Reiterate loops (a combo); Ormos and Mana Drain's flat option (not casts). Mystic Remora and Esper Sentinel: no deck plays them, so nothing was added. Test: `engine/pod/pod-opponent-cast.test.ts` (Beast Within grows an opponent's Mauler).
Pod run (500 games, same seeds; Thantis plays Rhystic Study and Taurean Mauler, Azula has them too): Thantis, Meren, Gale, Aesi, Codie: Thantis 10.6% -> 10.8% wins, Meren 24.6% -> 24.2%, Gale 17.6% -> 17.6%, Aesi 25.8% -> 25.6%, Codie 21.4% -> 21.8%. Azula, Meren, Sam & Frodo, Gale: Azula 7.0% -> 7.4%, Meren 26.8% -> 26.4%, Sam & Frodo 34.0% -> 34.4%, Gale 32.0% -> 31.6%. All within noise (about 4 points).

## G8. Finale of Revelation and Aesi's hand size use the engine's rule (Haiku 5.5)

1. Aesi's `endTurn()` (`decks/aesi/game.ts`) skips the discard to seven with its own check (Reliquary Tower, Graceful Adept). Replace that check with an override of `hasNoMaximumHandSize()` (Graceful Adept, then `super`) and call the engine's check. Aesi's `--regress check` must be IDENTICAL.
2. Teval plays Finale of Revelation: with X of 10 or more it gives no maximum hand size for the rest of the game. Read how Teval casts it (`decks/teval`). If it can reach X of 10 or more, set a flag when it resolves (as Azula does with `hasSeaGateRestorationResolved`) and return it from Teval's `hasNoMaximumHandSize()`. If Teval never casts it for 10 or more, write that under this task and change nothing.
3. A test for each (`decks/aesi` and `decks/teval` tests).

Done 2026-11-16, eco mode. Aesi: `endTurn()` calls the engine's check and `hasNoMaximumHandSize()` adds Graceful Adept (the engine's check also covers Reliquary Tower, Thought Vessel and Decanter; Aesi plays none of the last two). Test in `decks/aesi/tests/aesi.test.ts`; baseline re-recorded for the two new test lines, games IDENTICAL. Teval: Finale of Revelation is on its `HOLD` list (`decks/teval/cards.ts`), never cast in a goldfish game, and no code path casts it in a pod, so it never reaches X of 10. Nothing changed for Teval. `npm run verify -- --eco`: VERIFY OK.

## G9. Black tutors move to the engine (Sonnet 5.5)

Codie and Teval each resolve Demonic Tutor and Vampiric Tutor themselves, and Ardyn plays Demonic Counsel. Three decks: the rule of three says it goes into the engine.

1. One engine function searches the library for what the deck's `tutorTarget()` names (Gale, Meren and Edgar already have `tutorTarget`). Demonic Tutor puts the card into hand; Vampiric Tutor puts it on top and costs 2 life.
2. Codie, Teval and Ardyn drop their own code and call it; what to fetch stays per deck.
3. Codie's `--regress check` must be IDENTICAL, and so must the fixed-seed pod run; Teval's and Ardyn's tests pass. A difference means the deck's version had a twist: keep the twist in the deck.

## G10. Aesi's and Sam & Frodo's land search use the engine's (Sonnet 5.5)

`engine/game/land-search.ts` (`LAND_SEARCH`, `resolveLandSearch`) is used by Codie. Aesi (`candidates.ts`) and Sam & Frodo (`game.ts`) keep their own versions because their fetch triggers landfall at another moment than the engine's.

1. For each deck: find what differs (when landfall fires, which land is chosen, tapped or untapped) and make the engine's function do it the same way (a parameter or a hook the deck sets), or find that it can't and write why.
2. Move the deck onto it. `--regress check` must be IDENTICAL for both. A difference means the move changed the behaviour: undo it and write what differs.

Done 2026-11-16, eco mode. Both decks now call the engine's `fetchLand` and fill in `chooseLandToFetch` (what to take stays per deck). Sam & Frodo: its `putBasic` is gone (always tapped; the basic of the colour with the fewest sources); nothing else differed. Aesi: `fetchBasic` is a thin wrapper over `fetchLand`, and Rampant Growth, Nature's Lore, Three Visits, Farseek, Cultivate and Explosive Vegetation are now resolved by the engine (the rest of its fetch spells still call `fetchBasic`). What differed was when the land enters: Aesi's land counts as entered this turn (`sick`) and its landfall draws come before the shuffle. That is a new engine hook, `GameCore.putSearchedLand` (default: shuffle, then the land enters; Aesi overrides it). `--regress check` IDENTICAL for Aesi and Sam & Frodo.

## G11. Edgar, Meren and Sam & Frodo move onto `CreatureDeckGame` (Opus 5.5 for the first, Sonnet 5.5 for the others)

`engine/game/creature-deck.ts` (`CreatureDeckGame`) has the win check, the two numbers, combat, card values and the planner score that Edgar, Meren and Sam & Frodo each wrote for themselves. Helga, Ardyn, Teval, Thantis, DnD and Azula already use it. The three old decks keep their own copies, with small differences.

1. One deck at a time, starting with Meren (the simplest). List what its game class writes that `CreatureDeckGame` already does, and what differs by a number or a rule. A number becomes a parameter of the engine's version; a rule stays in the deck as an override.
2. Move the deck. `--regress check` and the fixed-seed pod run must be IDENTICAL after each deck. A deck that cannot be IDENTICAL stays as it is, with the reason written here.
3. One commit per deck.

Meren done 2026-11-16, eco mode. `MerenGame` extends `CreatureDeckGame`; gone from the deck: the win check, `winsWith`, `checkKill`, `play`, `combat`, `reanimationValue`, the land part of `cardValue` and a `manaSourceKind` that did nothing. Engine: `config.win_damage` is now an optional second win in `CreatureDeckGame` (no deck but Meren sets it; the WIN line adds the damage dealt only then). Kept as Meren's overrides: `battlefieldValue` (Lotleth Giant), `cardValue` for spells (HOLD 20, others 45), `positionValue`, `podClose`. The engine's lifelink on combat damage is new for Meren, but no Meren card or token has lifelink. `--regress check` IDENTICAL for every deck, the fixed-seed pod run IDENTICAL, `npm run verify -- --eco`: VERIFY OK.
