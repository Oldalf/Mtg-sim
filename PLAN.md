# Plan: step 10, after G14

Written 2026-11-16. Tasks G1 to G11 and G14 are done; their steps and notes (among them G2's pod report and G14's blink in answer to removal and wipes) are in git: `PLAN.md` at commit `ff164f7`. Step 8's plan is at commit `c88cda4`.

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
- Before changing pod code, save a fixed-seed pod run (`npm run pod -- gale meren samfrodo aesi edgar -n 200 --no-log`) and compare it afterwards; `--regress check` does not cover pod mode. `verify` also compares that run with `regress_baseline/pod.txt`; re-record it (`node scripts/verify.mjs --eco --record-pod`) only for a change Pontus accepted.
- An engine change must leave every existing deck IDENTICAL (goldfish and the pod run). A task that would change them stops and asks.
- A task that finds its steps do not fit the code stops and says so. It does not improvise a bigger change.
- When a task is done, add one line under it here: what was built and anything the next task must know. When the whole plan is done, it is cleared and a new one written.

## Order

| # | Task | What | Model |
|---|---|---|---|
| 1 | R1 | Gale: Rain of Filth against `lists/proposed.txt` | Sonnet 5.5 |

Done on 2026-11-16 without a task: **Edgar's commander cast.** Edgar stays in the command zone (eminence works there) and is cast only with mana nothing else wants (`COMMANDER_CAST_SCORE` in `decks/edgar/candidates.ts`; it was the first play). Goldfish, 2,000 games: win by turn 10 65.0% against 66.2% before; never casting him is 43.9%, because his attack puts counters on every Vampire, so he is still cast late (in 76% of games). Pod with Meren, Gale and Helga (1,000 games): Edgar 26.2% against 24.9%. The regress and pod baselines were re-recorded.

Azula's next task (B7) is not in this plan: it waits in `decks/azula/PLAN.md` ("Next task B7") until Pontus wants it, since Azula may not be played in the pod at all.

---

## R1. Gale: Rain of Filth against the proposed list (Sonnet 5.5)

Pontus's home deck is `decklist.txt`, but it is still missing four cards of `lists/proposed.txt` (Drain Power, Unearth, Muddle the Mixture, Thunderclap Drake), which he plans to add. So the comparison is **against `lists/proposed.txt`, not `decklist.txt`.** Rain of Filth (taps every land, then sacrifices them all for {B} each; kill turn only) was modelled in b5fc943 and is in no list yet. Pontus (2026-11-16) leaves the choice of what it replaces to us: try a few.

1. Baseline: `lists/proposed.txt`, 4,000 games (the numbers in `decks/gale/PLAN.md`: kill by turn 6 / 7 / 8 19.9 / 51.4 / 75.3% in 2026-11-14, before the step 8 engine changes; run it again, 16.5 / 45.8 / 70.9% on 2026-11-15). Same seeds for every list.
2. Test lists, each `proposed.txt` with Rain of Filth in place of one card: **Mocking Sprite**; then 3 to 5 cards that look weak in the list. Pick them from `npm run sim -- gale --rank` on `proposed.txt` and from the cards `decks/gale/PLAN.md` calls dead weight or untested (a single engine card, a protection card, a creature that only blocks, an Island: Rain wants lands, so check that one too). Say why each was chosen.
3. Report a table: kill by turn 6 / 7 / 8, counter backup by turn 8, average kill turn, difference to the baseline. Noise is about ±2.6 points at 3,000 games; call a difference real only above that.
4. Put the lists in `decks/gale/lists/` while testing and remove them when done (the table goes in `decks/gale/PLAN.md`). Leave `decklist.txt` and `proposed.txt` as they are: Pontus decides what to swap. Add one line under this task here.
5. Gale's regress baseline must stay IDENTICAL (no code changes in this task).
