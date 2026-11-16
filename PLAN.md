# Plan: step 9, after game night

Written 2026-11-16. Tasks G1 to G11 are done; their steps and notes (among them G2's pod report of 2026-11-16) are in git: `PLAN.md` at commit `0308b6c`. Step 8's plan is at commit `c88cda4`.

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
| 1-11 | G1-G11 | **Done** (see commit `0308b6c`) | |
| 12 | G14 | **Done** (DnD: blink in answer to removal and wipes) | |

Azula's next task (B7) is not in this plan: it waits in `decks/azula/PLAN.md` ("Next task B7") until Pontus wants it, since Azula may not be played in the pod at all.

---

## G14. Blink in answer to removal and wipes (Sonnet 5.5)

DnD's primer: Kykar, Lae'zel's Acrobatics and Ephemerate "dodge boardwipes or removal". In a pod an opponent's removal (`hitWithRemoval`) asks the owner's `podShield` first; a wipe (`castBoardWipe`) asks nothing.

1. Targeted removal: DnD overrides `podShield` to cast Ephemerate (or Ghostly Flicker) on the targeted creature when it has the mana open; the blink makes the removal miss. The blink must target that creature, not the best blink target.
2. Wipes: a hook before `castBoardWipe` removes the creatures, so the owner can answer with Lae'zel's Acrobatics (all nontoken creatures exiled until the end step). A blink in an opponent's turn returns at that player's end step (`BlinkedCard.inOpponentTurn`, done in G5). Only DnD plays these now.
3. Tests in `decks/dnd/tests` and `engine/pod/pod.test.ts`. Every other deck IDENTICAL; DnD's pod numbers before and after.

**Done.** Engine: `Game.podAnswerWipe(dying)` (called by `castBoardWipe` for each player before the creatures die), `resolveBlinkSpell(game, spell, { targets })` (blink exactly those, back at the end of the opponent's turn), `isHoldingManaForAnswers()` split out of `podReserve`. DnD: `podShield` casts Ephemerate or Ghostly Flicker on a commander or a creature with an enter trigger; `podAnswerWipe` casts Lae'zel's Acrobatics; `podReserve` also keeps mana for Ephemerate or Flicker, not for the Acrobatics (four mana held all game cost DnD about 5 points). Tests: `decks/dnd/tests`, `engine/pod/pod-blink-answer.test.ts`. DnD in a pod with Meren, Edgar and Helga (1,000 games, eco): 24.6% before, 23.2% after (noise about 3 points); in 600 logged games the removal blink fired once, because the mana is rarely open. The log says "countered by Ephemerate".
