# Meren: swaps

## Made on 2026-11-24 (cards bought; now in `decklist.txt`)

| In | Out | Why |
|---|---|---|
| Yahenni, Undying Partisan | Eternal Witness | a free sacrifice outlet; Eternal Witness ranked worst in `--rank` (−0.29 turns) |
| Ophiomancer | Timeless Witness | fodder every turn (a Snake each upkeep, ours and the opponents'); Timeless Witness ranked second worst (−0.23) |
| High Market | Mosswort Bridge | a land that is also an outlet; Mosswort Bridge was the lowest-ranked land |

Unearth stays: it ranks far better than both Witnesses (−0.08 turns, in the noise) and it helps Meren's early engine (taking it out cost about 1.5 points of "no impact by turn 6" in the draw round).

**Result** (16,000 goldfish games, same seeds, noise about ±2 points as printed; old = `decklist.txt` before the swaps):

| Measure | Old | New |
|---|---|---|
| Win by turn 8 | 18.3% | 20.9% (+2.6) |
| Win by turn 10 | 73.4% | 76.4% (+3.0) |
| Win by turn 12 | 95.6% | 96.1% (+0.5) |
| Turn the slowest 10% win by | 12 | 11 |
| Full impact by turn 5 / 6 | 32.5 / 58.0% | 34.6 / 60.5% |
| Low impact by turn 5 / 6 | 42.5 / 30.0% | 41.4 / 28.1% |
| No impact by turn 5 / 6 | 25.1 / 11.9% | 24.0 / 11.1% |
| Meren's experience at end of turn 5 / 6 | 0.77 / 1.73 | 0.89 / 2.05 |
| No free outlet (Meren out, below full impact) turn 5 / 6 | 68.8 / 62.4% | 64.5 / 58.7% |
| Out of cards at turn 8 | 3.9% | 4.7% |

Unlike the six outlets alone (outlet round in `PLAN.md`), this set also moves Meren's early engine: Ophiomancer brings the fodder that the outlets were missing.

### Where the cut cards could go

- **Eternal Witness** → Sam & Frodo, in for Pristine Talisman (done on 2026-11-24; see `decks/samfrodo/SWAPS.md`).
- **Timeless Witness**, **Mosswort Bridge**: no deck noted for them.

---

## Earlier: `lists/proposed.txt` (2026-11-14, was `SWAPS.txt`)

MEREN: swaps from decklist.txt (your original list) to lists/proposed.txt
Result in the simulator (8,000 games, same seeds): win by turn 8 / 10 / 12 went from 17.6 / 71.8 / 95.3% to 22.2 / 77.4 / 96.2%, average win turn 9.63 -> 9.43.
Full list to copy: lists/proposed.txt (100 cards)

CUT (5):

- Eternal Witness
- Timeless Witness
- Songs of the Damned
- Puppeteer Clique
- Solemn Simulacrum

ADD (5):

- Carrion Feeder
- Stitcher's Supplier
- Wood Elves
- Ophiomancer
- Skull Prophet

Note: the sim is a goldfish game. The two Witnesses (getting removal back) and Solemn (ramp plus a card) are worth more against real opponents than the numbers show, so those cuts are your call.

Tested and not better than this list (the test lists are described in PLAN.md, "Swap tests"): A3 (also Village Rites and Rune-Scarred Demon out, Fleshbag Marauder and Fyndhorn Elves in) and B3x (Solemn kept, no Skull Prophet).

(Since 2026-11-24 `decklist.txt` has both Witnesses out and Ophiomancer in; `lists/proposed.txt` is unchanged and still lists them as swaps from the old list.)
