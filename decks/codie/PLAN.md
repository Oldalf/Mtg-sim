# Codie (Codie, Vociferous Codex): deck plan

Five-colour spells combo, bracket 4 (borderline 5). **Not Pontus's deck**: he wants to see how it plays; there is no primer and no game log. Run it with `npm run sim -- codie` (see the root README). Engine notes: the root `PLAN.md`.

- **Lists:** `decklist.txt` is the list as given (2026-11-10); `logs/` is empty.
- **How it wins:** an X spell with a burst of mana: Exsanguinate (X = 40 kills all three at once, 42 mana), Crackle with Power (X = 8, 26 mana), Torment of Hailfire. Reiterate copies the X spell (each copy resolves with the same X); Return the Favor copies it too. Codie can't cast permanent spells; it taps for WUBRG for 4 (net +1) and its free-spell trigger is not modelled.

## Files

- `cards.ts`: the card names and facts about them. `game.ts`: `CodieGame` (state, hooks, turn steps). `candidates.ts`: what the AI may do while developing. `spells.ts`: what the spells do when they resolve. `solver.ts`: the kill search. `solver-actions.ts`: the solver's moves. `finishers.ts`: the kill itself (X spell, copies, backup). `index.ts`: deck registration and --diag measures. `mulligan.ts`, `config.ts`, `tests/`.

## Simulation rules (agreed 2026-11-10)

- 3 goldfish opponents at 40 life. Two measures, as for Gale: any win, and a win with a counterspell or protection spell still castable afterwards (Silence, Orim's Chant, Counterspell, Mana Drain, Arcane Denial, An Offer, Daze, Fierce Guardianship, Bilbo's Gambit, Autumn's Veil).
- **Torment of Hailfire:** each opponent pays 5 times (sacrifice or discard), then loses 3 per repeat (`opp_payments`). X = 19 kills, or X = 10 with one copy.
- **The kill solver** (`solve()`): a depth-first search over the cards in hand (rituals, Spirit Guides, Manamorphose, Frantic Search, Codie's activation, tutors, Reiterate on a mana spell, Ad Nauseam + Teferi's Protection) on copies of the real game, then the cheapest X spell (with the cheapest copies) that kills. It runs after every action.
- **Loops are never played out.** When Reiterate (buyback) copies a spell that makes more than the 6 a copy costs, the solver recognises it and adds 99 of that mana ("bottomless"), then looks for the finisher. Pontus's lines, checked against the rules: a copy makes Y and costs 6 ({1}{R}{R} + buyback {3}), and the original spell stays on the stack as the target, so each copy nets Y − 6.
  - **Jeska's Will:** Y = cards in one opponent's hand (`opp_hand`, 7 for goldfish opponents): +1 per copy. Bottomless red. Needs 9 mana to start (3 + 6, RR for Reiterate).
  - **Mana Geyser:** Y = tapped opposing lands (`opp_tapped_lands`, default 8). 6 is exactly break-even (not a loop), 7+ gains. Needs 11 mana to start.
  - **Brass's Bounty:** Y = our lands (Treasures, any colour): needs 7+ lands. 13 mana to start.
  - **Ad Nauseam + Teferi's Protection:** the whole library into the hand without losing life (the AI casts Ad Nauseam alone at the end of the turn with spare mana while life is 33+, down to 8 life).
- A loop of red mana can't pay for black or blue: Exsanguinate and Torment need BB from lands (or Manamorphose / Treasures), a counterspell needs UU. The AI taps its lands with the colours it still needs in mind (`keepColours`).
- Mulligans: the first is free, then London (`mulligan.ts`).
- Held, never cast during development: every counterspell, protection and removal spell, the rituals and mana spells (they are part of kill lines), the finishers.

## Ideas from the old script (`codie_sim_v2.js`, a friend's outdated simulator; deleted after reading)

An abstract Monte Carlo model of an older list (it also modelled Time Warp effects, Mox Amber, Sol Ring and other cards that are not in this list; those were skipped). What was converted (full power, 4,000 games, win by turn 10; before: 33.2%):
- **Jeska's Will's exile mode (the big one):** with a commander out, each Will (and each Reiterate copy) may also exile the top three cards, which can be played this turn. A Reiterate + Will loop with Codie on the battlefield therefore digs the whole library: a finisher in the library is as good as one in hand (`digAll`). The script treated "9 mana + both pieces" as a guaranteed win for this reason.
- **Flashback** on a tutor or a mana spell in the graveyard (Demonic Tutor again for {R} + {1}{B}; Will / Geyser / Bounty again), and the loop with a Flashbacked piece (`loop: Flashback Jeska's Will + Reiterate`, 10 mana).
- **Codie's free spell as a loop piece:** when the trigger finds Will / Geyser / Bounty and Reiterate is in hand, the loop costs only the 6 for the buyback.
- **Windfall** now does something (a bug: it resolved as nothing before): discard the hand, draw at least 7. The AI casts it only when no combo piece or tutor is in hand, as in the script.
- **Profane Tutor from hand:** suspend 2 for {1}{B}, a free tutor two turns later.
- **A search budget** (`solver_nodes`): the extra moves made some hands' search trees huge (one game took 40 s); the search now stops after 4,000 states (1,500 for the next-turn check).
- Optional realism settings, **off by default**: `opp_decay=2` (opponents lose 2 life per turn to a floor of 10) with `opp_payments_decay=1` (Torment payments 7 on turn 1, shrinking to 1): win by turn 10 **50.5%** instead of 39.8%, though fewer wins come through the loop (13.7%); `mana_drain_flat=1` (a Mana Drain pays 2 to 5 next turn): no change (40.2%).
- Not converted: the old list's cards, and its flat "Mana Geyser pays 7 to 14" (replaced by the turn-based tapped lands).

Numbers now (4,000 games, full power): win by turn 5 / 6 / 7 / 8 / 10: **1.4 / 5.6 / 12.3 / 21.6 / 39.8%**, 27% of games won through a Reiterate loop. Without Codie's activation in development: 1.2 / 4.0 / 9.9 / 17.0 / 32.9%.

## From the deck's creator (2026-11-10) and his three games

- **The only loops worth noting:** Reiterate + Jeska's Will / Mana Geyser / Brass's Bounty, and Ad Nauseam + Teferi's Protection. So the general loop finder (`--loops`) is not needed.
- **The tutor engine:** Profane Tutor is the one mana value 0 instant or sorcery, so Codie's trigger on any spell of mana value 1 (Silence, Orim's Chant, Dark Ritual, Fog, Autumn's Veil, ...) always finds it, and it tutors any card to hand. Find one combo piece by drawing and the other with a tutor. Modelled now: development (Codie arms, a mana value 1 spell is cast, Profane Tutor fetches the missing piece) and the solver (`Codie + Silence -> Profane Tutor -> <card>`).
- **Ad Nauseam + Teferi's Protection** draws the whole library with no life lost. The creator counts it as the win (his game 3, turn 4: Silence stops the table from casting anything; the log ends there). The solver treats it as a win **next turn** if the kill is there with the whole library in hand, next turn's untapped lands, Codie ready and one more land drop (`nextTurnLine`); the win turn is then this turn + 1.
- **Mana Geyser** made 13 in his turn 6 game, so the opposing tapped lands now grow with the turn: round(2.15 x turn): 6 on turn 3 (break-even), 9 on turn 4, 13 on turn 6 (`opp_tapped_per_turn`; `opp_tapped_lands` > 0 fixes it).
- **His games** (`logs/`): game 1 wins on turn 5 (Ad Nauseam + Teferi's Protection, a Spirit Guide exiled for the mana; Profane Tutor by Codie), game 2 on turn 6 (Mana Geyser 13, Brass's Bounty, Reiterate, Exsanguinate), game 3 on turn 4 (Codie + Silence -> Profane Tutor -> Teferi's Protection, Dark Ritual, Ad Nauseam). The analyzer's kill finder finds the kills of games 2 and 3 on the turns he played them (game 1's log ends before the library is drawn; game 2 has a card, Mystical Tutor, that isn't in the list). The AI given his draws wins by turn 10 in about 28% of runs and not before turn 7: it plays slower than he does (his games use Gemstone Caverns' luck counter, the best colour fixing and perfect sequencing). His Codie trackers: "Generic" counters on Codie, Mana Geyser and Dark Ritual are his floating-mana counts.

## Ad Nauseam + Teferi's Protection keeps 5 cards; Lim-Dul's Vault (Pontus, 2026-11-10)

- **Ad Nauseam + Teferi's Protection** draws all but the last 5 cards of the library (they stay so the deck is never empty; `ad_keep`). The 5 are the bottom of the real library order, so a needed piece among them is missed, as in the real game.
- **Lim-Dul's Vault + Teferi's Protection is NOT an infinite tutor:** the rulings for Teferi's Protection say "You can't pay a cost that includes the payment of any amount of life", so with it in play you can't pay the 1 life to look at five more cards. The Vault is strong **before** Teferi's Protection: each 1 life looks at the next five cards (about 12 life to see a 60-card library), and the last five looked at go on top in any order. It finds the best window of five, not the best five cards of the library. Modelled (`vaultStack`): the AI takes the best of the first 12 windows (never going below 15 life), puts the five on top ordered by value, and in the solver the draw spells (Manamorphose, Brainstorm, Frantic Search, Stock Up, Flow State) may then be used because every card they draw is known (`knownTop`). It changes the numbers by nothing measurable (33.2% by turn 10): one card in 100.

## Codie's mana ability and the Spirit Guides in development (2026-11-10, Pontus's question)

The first version used Codie's ability, the Spirit Guides and the rituals only inside the kill solver. Now, in development too: Codie activates ({4}, T: WUBRG, net +1 mana and all five colours) when it has four spare mana (`codie_dev`), and its trigger makes the next spell cast also cast a random cheaper instant or sorcery for free (rituals add mana, tutors fetch, ...). A Spirit Guide is exiled for mana when that lets a land-fetch spell be cast a turn earlier (`guides_dev`). Win by turn 6 / 7 / 8 / 10 (2,000 games, eco): without Codie and guides 0.8 / 1.9 / 2.9 / 7.1%; **with both 1.1 / 3.5 / 6.4 / 15.0%** (Codie is the whole gain; the guides add nothing measurable). Rituals still only count in kill lines; the solver does not use Codie's free spell.

## Numbers after the tutor engine (2,000 games, eco)

Win by turn 5 / 6 / 7 / 8 / 10: **0.7 / 3.9 / 8.6 / 16.2 / 32.7%** (any win); 16.6% of games are won through a Reiterate loop; in 46% of games Reiterate, a loop piece and a finisher are all seen by turn 7. Before the Profane Tutor line: 1.1 / 3.5 / 6.4 / 15.0% by turn 6 / 7 / 8 / 10. Casting Codie before the ramp spells (`codie_early=1`) makes no difference.

## First numbers (3,000 games, the first working version, before the sections above)

Win by turn 5 / 6 / 7 / 8 / 10: **0.2 / 0.6 / 1.4 / 2.4 / 6.1%** (any win), almost all of them through a Reiterate loop (5.6%). In 13% of games Reiterate, a loop piece and a finisher are all seen by turn 7, but there are only about 6.5 lands on turn 7 and the loop needs 9 mana (11 for Mana Geyser, 13 for Brass's Bounty). The deck is mana-starved in a goldfish game: about 36 lands + 24 ramp spells, one draw a turn, and the cantrips are few.

## Open

- Codie's free-spell trigger (each activation: the next spell cast makes a random cheaper instant or sorcery free) is not modelled; nor Mizzix's Mastery (overload), Flashback, Bala Ged Recovery, Spelltwine, Narset's Reversal, Mana Drain, Bring to Light, Crop Rotation, Scapeshift, Splendid Reclamation, Field of the Dead.
- Whether the AI's slow mana development is the deck or the AI (no human comparison, no logs).
