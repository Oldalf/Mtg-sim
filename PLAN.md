# Plan: step 6, what Pontus saw in the viewer

Written 2026-11-14. Four things Pontus spotted while watching games after step 5, each split into tasks that say which size of model can do them. The plan of step 5 is in git (`PLAN.md` at commit `85acdc5`).

## How to read this plan

Each task names a model. Give it to that model or a stronger one.

| Model | Tier | What it gets |
|---|---|---|
| Claude Haiku 5.5 | S (small) | Mechanical work with exact steps. No design choices. A command says if it worked. |
| Claude Sonnet 5.5 | M (medium) | A feature or fix with a clear goal, in patterns the code already has. Small choices only. |
| Claude Opus 5.5, or Fable 5.2 | L (large) | Design, work across many files where judgement is needed, or writing that other models will follow. |
| **P** | Pontus | A decision. Tasks marked "after P" wait for it. |

Rules for every task:

- Read `CLAUDE.md` first (rule 0 names, KISS). For the engine also `ENGINE.md`, for the page also `app/web/CLAUDE.md`.
- One task is one commit, straight on `main`. `npm run format`, then `npm run verify` must end with VERIFY OK.
- Ask Pontus eco or full power before any task that runs simulations (`verify` with regress checks counts).
- Before changing pod code, save a fixed-seed pod run (`npm run pod -- gale meren samfrodo aesi -n 200 --no-log`) and compare afterwards; `--regress check` does not cover pod mode.
- A task that finds its steps do not fit the code stops and says so. It does not improvise a bigger change. This matters most for Haiku 5.5.
- When a task is done, add one line under it here: what was built and anything the next task must know.

## Order

| # | Task | What | Model |
|---|---|---|---|
| 1 | A1 | Whole game rows are links (done) | Haiku 5.5 |
| 2 | A2 | The caption bar keeps one height (done) | Haiku 5.5 |
| 3 | B1 | Fastest and slowest tags that mean something (done) | Sonnet 5.5 |
| 4 | C1 | Energy as a player counter, shown in the viewer (done) | Opus 5.5 |
| 5 | C2 | Volatile Stormdrake takes a creature in a pod | Opus 5.5 |
| 6 | D1 | Tokens: the design (who defines a token, its name in the log, its image) | Opus 5.5, then Pontus |
| 7 | D2 | Tokens: the engine and the card data | Sonnet 5.5 |
| 8 | D3 | Tokens: move every deck to it | Sonnet 5.5 (Haiku 5.5 per deck once the first deck is done) |
| 9 | D4 | Tokens: images and stats in the viewer | Sonnet 5.5 |

Why this order: A and B are small and stand alone. C comes before D because C2 moves a permanent between two players' logs, and D changes how a token is named in the log; doing the log change once with the exchange already working is easier than the other way round. C2 and D4 can swap places if Pontus wants the tokens sooner.

---

## A. Small fixes in the page

### Game rows look clickable but only the seed is

What is wrong: in a run's games (`app/web/src/app/pages/games/run-games.ts`, line 91) only the seed number is an `<a>`; the row has a hover look, so it seems clickable, but a click beside the number does nothing. With a one-digit seed the target is a few pixels wide. The same pattern is in "games worth a look" (`pages/simulate/games-worth-a-look.ts`, line 41).

### A1. Whole rows are links (Haiku 5.5)

The fix keeps the real `<a>` (so Tab, Enter, middle-click and "open in new tab" still work) and stretches its click area over the row:

1. In `run-games.ts`: give the seed's `<a>` a class `row-link`. Give `tr[mat-row]` `position: relative` and `cursor: pointer`, and add `.row-link::after { content: ''; position: absolute; inset: 0; }` in the component's styles. The tag chips stay on top: give the tags cell `position: relative; z-index: 1` only if a chip turns out to be clickable (today they are not, so skip it).
2. The same in `games-worth-a-look.ts` for its game rows.
3. Check `pages/games/games.ts` (the list of runs, line 34, and the real logs, line 60): if those rows also have a hover look with a small link, do the same; if they are plain lists, leave them.
4. Check in the browser: a click anywhere on a row opens the game, a middle-click opens it in a new tab, Tab still reaches each row's link with a focus ring (the ring may be on the number only; that is fine).
5. Done when `ng test` passes and `npm run verify` gives VERIFY OK (page only: no regress).

Done: run-games.ts has the whole-row link (`row-link` on the seed, `::after` stretched over `tr[mat-row]`). Not done in games-worth-a-look.ts: its rows hold several game links each, so one link cannot cover the row; its seed links stay as they are. Browser check of the click area not run yet.

### The caption bar changes height

What is wrong: the caption under the table (`app/web/src/app/pages/game/game-caption.ts`) is as tall as its content. A line with cards (an end-of-turn line, a cast) holds 96 px wide card images and is much taller than a line with only text, so while autoplay runs the bar grows and shrinks and the table above it jumps. Pontus wants it to stay the height it has with cards in it, always.

### A2. The caption bar keeps one height (Haiku 5.5, can share A1's session but is its own commit)

Done: `.cards` has `min-height` of one card (`calc(96px * 88 / 63)`, phone `calc(56px * 88 / 63)`), `.line` clamps to two lines with the full text in its `title`. Browser height check not run yet (ng build and ng test only).

1. In `game-caption.ts`, give `.cards` a `min-height` equal to the height of one card at its width, so the row takes the same room with no cards. Use the card's own shape, not a guessed number: `min-height: calc(96px * 88 / 63)` on desktop and `calc(56px * 88 / 63)` in the phone block (a card is 63 x 88 mm). Measure in the browser that an empty caption and a caption with cards are the same height; if `app-card-image` adds a border or a label below the image, add it to the calc.
2. Keep the text from making the bar taller: `.line` shows at most two lines (`display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden`), and the full text goes in a `title` on it. The full text is also in the log drawer. If two lines of `title-large` are taller than a card, the card row sets the height and nothing else is needed; if not, stop and ask Pontus.
3. Check in the browser while autoplay runs (a samfrodo goldfish game and a pod of 4): the caption's height stays the same on every line (`getBoundingClientRect().height` of `app-game-caption` on a text-only line and on a line with three cards), on desktop and in a 390 px iframe. The page still does not scroll on desktop.
4. Done when `ng test` passes and `npm run verify` gives VERIFY OK (page only: no regress). Add one line to `app/web/CLAUDE.md`: the caption keeps a fixed height so the table does not jump.

---

## B. The tags look off

What is wrong (found in `engine/game-log/game-log-tags.ts`): each tag goes to `GAMES_PER_TAG = 5` games, whatever the size of the run. `fastest` takes the 5 lowest win turns and `slowest` the 5 highest. With 8 games that is 10 tags on 8 games, so every game gets one of them and at least two games get both. Ties are broken by seed, so a game can be "fastest" while 3 others won on the same turn and are not tagged. The same happens in a pod run with `tagByWinTurn`.

### B1. Tags that mean something (Sonnet 5.5)

New rules for `tagByWinTurn` (goldfish and pod share it):

- `fastest`: the games won on the earliest win turn (at most 5, lowest seeds first). `slowest`: the games won on the latest win turn (same cap).
- If the earliest and the latest win turn are the same, neither tag is given (no game stands out).
- A game never has both. `average` (the median turn) is given only to games that are neither fastest nor slowest.
- Leave the other tags (`no-win`, `win-stopped`, `most-interaction`...) as they are, but check `most-interaction` the same way: give it only to games with the highest count, not to the top 5 whatever their count.

Steps: write the rules as tests first in `engine/game-log/game-log.test.ts` (8 games with win turns 4, 5, 5, 5, 6, 6, 7, 9: fastest is the one on 4, slowest the one on 9, average the ones on 5 or 6 by the median; all on the same turn: no fastest, no slowest), then change `tagByWinTurn`. Update the comment at the top of the file and the tag explanations in the page if they say "the 5 fastest". Check whether `--regress` stores tags: if it does, only the tags may differ, then `--regress record` for every deck (ask eco or full power). Done when `npm run verify -- --full` is OK.

Done: `tagByWinTurn` and `most-interaction` (`tagLowestScoringGames`) now tag only games sharing the extreme value (cap 5, lowest seeds); no spread gives no fastest/slowest; average skips fastest/slowest games. `runTagTests` in `game-log.test.ts` (called from `sim.ts --test`) covers it. `--regress` does not store tags, so nothing to re-record. `npm run verify -- --full` skipped by Pontus; instead he ran a 1000-game pod through the page in power save mode and the tags looked right. Page text saying "5 fastest" not checked (`pieces.html` shows a sample chip only).

---

## C. Volatile Stormdrake does nothing

What is wrong: Mike's deck plays Volatile Stormdrake as a plain 3/2 flyer (`decks/mike/PLAN.md`, line 75: "Volatile Stormdrake's exchange (no creature to take in a goldfish game)"). That is right in a goldfish game, but in a pod there are creatures to take, and the game Pontus watched was a pod. The engine has no energy at all (`energy` in `engine/game/game-core.ts` is Energybending, a different thing), so the viewer has nothing to show.

The card: "Flying, hexproof from activated and triggered abilities. When this creature enters, exchange control of this creature and target creature an opponent controls. If you do, you get {E}{E}{E}{E}, then sacrifice that creature unless you pay an amount of {E} equal to its mana value."

### C1. Energy as a player counter (Opus 5.5)

- A player's energy in the engine (`Game`), changed only through one function that logs it, like life.
- The log carries it the way it carries life (each `GameEvent` has every player's life; add energy where it is not 0, so old logs and goldfish logs stay the same size). `shared/game-log-types.ts` and the board (`shared/game-log-board.ts`) learn it; a real Archidekt log has no energy and shows none.
- The seat in the viewer shows energy next to life when it is above 0 (a small chip with the count; check `player-seat.scss` against its 4 kB budget, which is nearly full).
- Name it so it cannot be mixed up with the existing `energy` flag of Energybending: rename that flag (`energybendingActive` or similar) in the same commit.
- Done when every deck's `--regress check` is IDENTICAL (nothing gives energy yet), the pod output is unchanged, and a test sets energy and finds it in the log and on the rebuilt board.

Done, wider than planned: Mike already counted energy itself (Roil Cartographer, Aurora Shifter, Tune the Narrative, Shielded Aether Thief), Meren counted experience, and Gale gives opponents poison, so all three became player counters. `Game.energyCounters` / `experienceCounters` with `gainEnergy`, `payEnergy` (throws if short), `gainExperience`; Mike and Meren use them. `GameEvent.playerCounters` (per player as `life`, only counts above 0, left out when all are 0; pod: own energy/experience from the player's game, poison from the table and the game's view of its opponents), `PlayerBoard.playerCounters`, the text log's turn header ("counters: energy 2") and `describeBoard`. The seat shows a chip per counter after the life ("4 energy"; a player at 10 poison is greyed out); a goldfish caption shows an opponent's poison under its life. The Energybending flag is `isEnergybendingActive`. Test: `runPlayerCounterTests` (in `npm run pod -- --test`). `player-seat.scss` is at its 4 kB budget: the chip reuses `.badge` with no new CSS. For C2: `payEnergy` is ready for the Stormdrake's sacrifice-unless-you-pay.

### C2. The exchange in a pod (Opus 5.5, after C1)

It needs Opus because nothing in the engine moves a permanent from one player to another today: each player is its own `Game`, and the pod reaches the others only through the `Arena` (`engine/pod/pod-arena.ts`: `fight`, `edict`, `snipe`...). Meren's "Stolen creature" is a 5/5 token stand-in, not a real exchange.

- A new `Arena` call, for example `exchangeControl(game, ownPermanent)`, that picks the opponent's creature to take (the best one by the pod's own threat measure, as `snipeBestTarget` picks), moves it into the taker's battlefield and the Stormdrake into the opponent's, with card moves logged on both sides so the viewer shows both. The permanent keeps its owner (it goes to its owner's graveyard if it dies). Hexproof and shroud on the target are respected.
- Then the energy: the taker gets 4, and keeps the creature only by paying energy equal to its mana value; otherwise it is sacrificed (to its owner's graveyard). So a creature with mana value 4 or less is kept, and Mike can save energy for a later Stormdrake.
- In a goldfish game the arena has no opponents with creatures: the Stormdrake stays a 3/2 flyer, so Mike's `--regress check` stays IDENTICAL. The pod output changes for runs with Mike: show Pontus a fixed-seed pod run with Mike before and after, then re-record `regress_baseline/pod.txt`.
- Update `decks/mike/PLAN.md` (the line about what is not modelled) and `POD_PLAN.md`.
- Done when a pod test has a Stormdrake take a creature, the creature fights for Mike, energy shows in the viewer, `npm run pod -- --test` passes and `npm run verify -- --full` is OK.

Done: `Permanent.owner` (set while another player controls it), `GameCore.giveControlTo`, and `putCard` sends a card that leaves the battlefield to its owner (`receiveOwnCard`, a commander to the command zone). `Game.enter` calls `Arena.stormdrakeExchange` for Volatile Stormdrake in a pod; `exchangeForStormdrake` (`pod-interaction.ts`) does the whole trigger on one log line so both players' moves are on it: target as removal picks it but any creature (mandatory), and one Mike can keep (mana value at most his energy + 4) counts double (Pontus: stealing is worth more than killing); no hexproof/shroud, shields counter it; 4 energy, pay the mana value or the creature dies. A player who is out gets back what it lent and takes back what it owned (`PodTable.endControlOfPlayerWhoLeft`). Log zone: `opponentsCards`, which the board already ignored, so the page needed no change (energy shows through C1). Test: `runControlExchangeTests` in `engine/pod/pod-exchange.test.ts`. Mike is not in the fixed-seed pod run, so `regress_baseline/pod.txt` did not need re-recording; Edgar's baseline was re-recorded because one of its tests prints a whole Permanent (now with `"owner":null`), its 600 games identical. Pod run gale meren samfrodo aesi mike, 300 games, eco, before / after: Mike 26.0% / 25.3%, the others within 2 points (noise ±6). For D: a taken token arrives as a token from `miscCards`, a card from `opponentsCards`.

---

## D. Tokens

What is wrong:

- No image: the image route (`app/server/cards-routes.ts`) finds a card's picture by its `scryfall_id`, and a token has none, so it returns 404 and the page shows a text card. `engine/cards/scryfall.ts` skips every card with the layout `token` when looking up names.
- Each deck makes its own tokens: `makeToken(name, power, toughness, colour, keywords)` in `engine/cards/cards.ts` for creatures, and three copies of an `artifactToken` helper in samfrodo, edgar and codie for Food, Treasure and Clue (rule of three: it belongs in the engine).
- The log names a token by its name only, so tokens with the same name and different stats look the same: Edgar makes three kinds of "Vampire" (1/1 black, 1/1 white lifelink, 2/2 black flying), and an older Meren list had a 1/1 Insect and a 1/1 deathtouch Insect. The viewer and the board (`shared/game-log-board.ts`) cannot tell them apart.

What the Scryfall data already gives (checked in `data/scryfall/oracle-cards.jsonl.gz`): every token is in the bulk file with its own id, stats, colours, keywords and image (layout `token`). And every card lists the tokens it makes in `all_parts` with `"component": "token"` and the token's Scryfall id (Bitterblossom lists its Faerie Rogue). So "the token's stats come from what made it" can be read from the data: the card that makes the token names the exact token, and the token's own entry has its stats and picture.

### D1. The design (Opus 5.5, then Pontus)

Write the design here, under this task, for Pontus to approve. It must answer:

1. **Where a token's definition comes from.** Proposal: a deck asks for "the token this card makes" (`tokenMadeBy('Bitterblossom')`), and the engine finds it through the card's `all_parts` in the bulk data, then the token's entry (stats, colours, keywords, types, Scryfall id). For a card that makes more than one kind of token (or none listed), the deck names it (`token('Insect', { power: 1, toughness: 1, keywords: ['deathtouch'] })`) and the engine finds the matching token entry by name, stats, colours and keywords. Today's stand-ins that are not real tokens (Meren's "Stolen creature", aesi's "Illusion army" 999/999, Edgar's "Zombie Army" 0/0 with counters) stay as plain made-up tokens with no image; say how they are marked.
2. **How the tokens get into `data/cards.json`.** `npm run cards` already adds the cards a list uses; it must also add the tokens those cards make (from `all_parts`), with their Scryfall ids, so a run needs no bulk file.
3. **How a token is named in the log**, so that two different tokens with the same name stay apart, real Archidekt logs still load (check what a real log calls its tokens, in `decks/*/logs/`), and logs from before the change still open. One option: the log keeps the token's name and adds its Scryfall id (or its stats) to the move; another: a display name like "Vampire 2/2 flying". Pick one and say why.
4. **Results stay the same.** The token's stats and keywords must equal what each deck uses today, or the change is a deliberate fix. List each deck's tokens (the `makeToken` and `artifactToken` calls) next to the Scryfall token that matches, and flag the ones that differ.

Done when the design is written here and Pontus has said yes. A throwaway check that `all_parts` finds the right token for every token-making card in today's lists is worth doing first (a small script in the scratchpad, not committed).

### D2. The engine and the card data (Sonnet 5.5, after D1)

Build what D1 decided in `engine/cards/` (token lookup, the shared artifact-token helper replaces the three copies) and in `npm run cards` (tokens into `data/cards.json`), plus the log change in `engine/game-log/` and `shared/`. No deck changes yet besides what keeps them building. Done when every deck's `--regress check` is IDENTICAL, the pod output is unchanged, `npm run cards` adds the tokens for every list, and a test looks up a token by its maker and by its stats.

### D3. Every deck uses it (Sonnet 5.5; Haiku 5.5 per deck after the first)

One commit per deck, in this order: samfrodo (the most tokens), edgar, meren, aesi, mike, codie. Each deck's `makeToken` / `artifactToken` calls become the lookup of D2. The deck's `--regress check` must stay IDENTICAL unless D1 listed a deliberate fix for it; then only that deck differs and its PLAN.md says why. Ask eco or full power first.

### D4. Images and stats in the viewer (Sonnet 5.5, after D3)

- The image route serves a token's picture by its Scryfall id (the cache in `data/scryfall/images/` works as for cards). Update the test in `app/server/cards-routes.test.ts` that expects a token to be 404.
- The seat shows a token's image; on a token without one (the made-up stand-ins), a text card with name, power/toughness and keywords instead of just the name.
- The board summary line (`shared/game-log-board.ts`, "Insect token x2") tells different tokens apart.
- Check in the browser with a samfrodo goldfish game (Food, Clue, Halfling...) and an Edgar game (the three Vampires), at desktop and phone width.
- Done when `ng test`, `npm run app -- --test` and `npm run verify` pass.

---

## Not in this plan

The ideas left from step 5 are in `ROADMAP.md` under "Ideas not decided". Suggestion 7 there ("one board, not two") touches the same board code as C1 and D2; if Pontus takes it, do it before C1.
