---
name: test-swap
description: Test a card swap in one of the simulated Commander decks, the way Gale's Rain of Filth, flash enablers and speed swaps were tested in step 10. Covers what to ask Pontus first, how to build the test list without changing the shuffle, how many games to run, the deck's settings and --diag, when a pod run is needed, prices, the table in the deck's PLAN.md and the verdict. Use it whenever someone asks to "test X for Y", "try X instead of Y", "swap X in", "is X better than Y in <deck>", "compare these lists", or wants a card added to or cut from a deck judged by the simulator.
---

# Test a swap

A swap test plays the base list and the list with the swap on the same seeds and says whether the difference is bigger than the noise. The simulator does the work; this skill is about asking the right things, building the list so the comparison is fair, and reporting it so Pontus can decide. When this skill and the code disagree, the code wins: stop and say so.

## 1. Ask Pontus first

Ask for everything missing in one message (AskUserQuestion is fine):

1. **The deck.** A pod-only deck (helga, ardyn, teval, thantis, dnd, azula) and a friend's deck (codie, edgar) get no swap tests unless the owner asked; say so and stop.
2. **The base list:** `decklist.txt` (the home list) or a list in `lists/` (often `lists/proposed.txt`, the adopted one). The deck's `PLAN.md` says which list is current; when it differs from what Pontus names, ask.
3. **The swaps:** which card goes out and which comes in, one pair or several. **Pontus names the cards that go out.** Do not pick cuts yourself (the standing rule "cuts wait for the user's ideas"). Only when he says "try a few slots" may you pick them, and then say why each one (worst in `--rank`, called dead weight in `PLAN.md`, a basic land when the new card wants lands).
4. **The settings:** a deck may play in more than one way (`config.ts` and `SETTING_DESCRIPTIONS`; Gale's `hold_counter` and `opponents_end_step`, which play as at the table). Ask whether to run the default, a setting, or both. Both doubles the runs.
5. **A budget**, if the new cards cost money: then prices go in the table.
6. **Eco or full power** (`--eco` or not), every time. Give the time with the question: at full power Gale plays 4,000 games in about 50 seconds per list and setting, so a 16,000-game comparison of two lists is about 7 minutes; eco is about 3 times slower.

## 2. Build the test list

1. Copy the base list to `decks/<deck>/lists/<in>_for_<out>.txt` (lower case, underscores, the card names shortened only as far as they stay clear: `merchant_scroll_for_personal_tutor.txt`). Several swaps get a short name for what they are (`speed_swaps.txt`).
2. **Replace the line in place.** `1x Personal Tutor` becomes `1x Merchant Scroll` on the same line, whatever section heading it is under. Never re-sort the list or move lines: a different order deals different hands (`ENGINE.md` "Noise"). For a basic land, lower its count (`18x Island` to `17x Island`) and put the new card on the next line.
3. Check the swap: `git diff --no-index <base> <test>` shows only the swapped lines (it exits with code 1 when the files differ; that is not an error). The run prints a note when the deck is not 100 cards.
4. **New cards.** A card that is not in `data/cards.json` is added on the first run from the local Scryfall data (it prints `+ <name>`, no network). If it is not found, check the spelling, or `npm run cards -- update` if it is from a newer set. The added card data is committed with the report.
5. **Cards played generically.** The run prints `Note (...): these cards have no special rules in the simulator and are played generically: ...`. Read it. A generic card is played by its type and mana value only. If the card's text is the reason for the swap (a tutor, a ritual, flash, an untap, a trigger), the test means nothing yet: **stop and tell Pontus** that the card needs rules first (a card fact in `engine/`, the deck's choice in its folder, with tests, and every other deck IDENTICAL). That is a separate task; step 10 did it for Merchant Scroll and Mnemonic Wall (R4) before testing them. A plain creature, a land or a vanilla effect may be fine generically: say which.

## 3. Run

Same seeds for every list happen by themselves: the runner plays seeds 1..n for each list.

```
npm run sim -- <deck> <base> <test1> <test2> ... -n 4000            # screen
npm run sim -- <deck> <base> <test> -n 16000                        # decide
npm run sim -- <deck> <base> <test> -n 4000 --set hold_counter=1    # a setting, applied to every list
npm run sim -- <deck> <base> <test> -n 4000 --diag                  # the deck's own measures, a separate run
```

- Paths are looked up as given, then inside the deck's folder, so `lists/x.txt` is enough. The base list goes first: the differences are to it.
- **4,000 games to screen** (noise about ±2.2 points on a percentage), **16,000 to decide** (about ±1.1). The run prints the noise line. Re-run at 16,000 the swaps that pass the noise at 4,000 in any column, and every swap Pontus is about to adopt, under each setting where it passed.
- **Check the base row first.** When the deck's `PLAN.md` has the base list at the same games and settings, the new base row must match it to the decimal. If it does, the engine has not changed and the old rows still compare. If it does not, the engine or the list changed since: say so, and compare only rows from this run.
- `--set key=value` with several lists applies to all of them. With one list it compares the default against the setting instead, which is not a swap test.
- `--diag` where the deck has one (`diagMetrics` in its `index.ts`: aesi, codie, edgar, gale, meren, mike, samfrodo). Run it when the swap is about consistency (slow starts, the commander's turn, a missing piece), not for every swap.
- **A pod run only when the swap is about interaction or defence** (removal, a fog, blockers, a counterspell): the goldfish opponents do nothing, so those cards are worth nothing there. Then also run the pod, base and test with the same opponents and `-n`, against the table the deck meets (Gale: `helga ardyn teval`, and `helga thantis dnd`):

  ```
  npm run pod -- <deck>:<base> helga ardyn teval -n 4000 --no-log
  npm run pod -- <deck>:<test> helga ardyn teval -n 4000 --no-log
  ```

  Report the deck's win rate (25% is an even share in a 4-player pod) and the share of games it was the first one out. Noise is printed (about ±1.6 at 4,000).
- On a Windows shell that drops `--` flags (PowerShell): `npm run -s build`, then `node --enable-source-maps dist/sim.js <deck> ...` with the same arguments.

## 4. Report

Put one table in the deck's `PLAN.md`, under "Current state" next to the earlier swap tables (Gale's R1 and R5 tables are the model). A swap that an earlier table already has gets no new table: add one line under that table with the new numbers (16,000 games, say) and the date. Above it, one or two sentences: the task or request and the date, the base list, the games per list, same seeds, the settings, the noise.

- **Columns:** copy what the comparison prints: the turns of `compareTurns`, the second measure when the deck has one (Gale's backup columns: Pontus goes off only with protection, so those count most for Gale), the average turn. The base row gives the numbers, every other row the difference to it (`+2.0`). With two settings, `default / setting` in each cell, as in Gale's R5 table.
- **One row per swap**, named "In for Out", with the price in brackets when there is a budget.
- **Prices**, when there is a budget: `prices.eur` of one printing in Scryfall's bulk data, dated with `downloadedOn` from `data/scryfall/bulk-info.json`, and "check Cardmarket before buying". A card with no euro price says so.

  ```
  node -e "const z=require('zlib'),f=require('fs');const want=process.argv.slice(1);for(const line of z.gunzipSync(f.readFileSync('data/scryfall/oracle-cards.jsonl.gz')).toString().split('\n')){if(!line)continue;const c=JSON.parse(line);if(want.includes(c.name))console.log(c.name+': '+(c.prices&&c.prices.eur||'no eur price'))}" "Merchant Scroll" "Rain of Filth"
  ```

- **The verdict,** in plain words under the table:
  - A difference below the printed noise line is "within noise": the swap neither helps nor hurts measurably. Do not rank such swaps against each other.
  - Above the noise at 4,000 games: "looks real, checked at 16,000" with the 16,000 numbers. Only those count as a result.
  - Say what goldfish cannot see: protection, removal and blockers are dead in goldfish; a card played generically is not tested.
  - **Pontus decides.** Recommend, but do not change `decklist.txt` or `lists/proposed.txt`. A list he may adopt can stay in `lists/` under a clear name (Gale's `lists/speed.txt`) when he asks for it.

Then:

1. Remove the test lists (`decks/<deck>/lists/<in>_for_<out>.txt`).
2. If the work is a task in the root `PLAN.md`, add one "Done" line under it.
3. `npm run format`, then `npm run verify` (ask eco or full power; a change in `data/cards.json` makes it run every deck's regress), then one commit: the table, and the card data if cards were added.

## Done when

- Every swap Pontus named has a row, run on the same seeds as its base.
- Each difference has a verdict against the printed noise, and the swaps worth adopting were run at 16,000 games.
- Cards played generically are named, and none of them is the reason for the swap.
- The test lists are gone and `decklist.txt` and `lists/proposed.txt` are unchanged.
