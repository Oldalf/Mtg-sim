# Plan: game logs (roadmap step 3)

Written 2026-11-13. The engine notes that were in this file moved to `ENGINE.md`.

## Status (2026-11-13): done

Done and checked (`--regress check` IDENTICAL for all six decks, `--test` and `pod --test` pass, the fixed-seed pod run is unchanged):

- **Step 1**: `engine/game-log.test.ts`. `npm run sim -- <deck> --test` and `npm run pod -- --test` play 50 seeds with the log on and off.
- **Step 2**: events (`engine/game-log.ts`), `sayEvent` and `sayHighlight` in `GameCore`. The old and new `--trace` outputs hold the same lines.
- **Step 3a**: `engine/game-log-moves.ts`. Added to the plan: `logCardMovesSoFar()` between the actions of a turn, so a land's or a spell's moves sit under its own line. A card that left every zone (a spell still resolving) waits and is written when it arrives; what never arrives is written as exiled at the end of the turn.
- **Step 4**: the pod log is events with names (`opponentName`, `describeOpponentLife` in the decks' lines too).
- **Step 5**: `session-logs/`, `--no-log`. Changed from the plan: the games files are gzipped (`games-000.jsonl.gz`), because with the moves a game is 20 to 60 KB of JSON. Gzipped: 3,000 games are 3.7 MB (Gale) to 8.2 MB (Sam & Frodo), 16,000 Meren games 31 MB, 1,000 pod games 8 MB. Time for 3,000 games with the log against without: Gale 31.2 s / 30.8 s, Aesi 37.9 / 36.3, Sam & Frodo 43.3 / 40.6, Meren 7.8 / 6.0, 1,000 pod games 25.2 / 22.5. Meren is over the 10% of step 3c (short games, so the fixed work per event weighs more); open whether that matters at 1.8 s.
- **Step 6**: `engine/game-log-text.ts` (`--trace` uses it; `--moves` works on `--trace` too).
- **Step 7**: `engine/game-log-tags.ts`, `engine/game-log-run.ts`. The list under a report shows two games per tag in full and the other seeds on one line.
- **Step 8**: `npm run logs` with `--seed`, `--tag`, `--highlights`, `--moves`.

- **Steps 3b and 3c**, packages A to C (under step 3): the renames, the engine's zone functions (`takeCard`, `putCard`, `moveCard`...) and the safety net in `--test`.
- **Step 9** and the rest of step 8 (2026-11-13):
  - `engine/game-log-board.ts`: `boardAt(gameLog, eventIndex)` and `TableBoards` (the same, event by event). `npm run logs -- <run> --seed N --board` shows the board of the player whose turn it was at the end of each turn.
  - `engine/game-log-archidekt.ts`: `readArchidektLog(file)` (`npm run logs -- decks/meren/logs/game1_t9_gray_merchant.txt --board` shows a real game the same way) and `archidektLines(gameLog, player)` (`--archidekt`).
  - `engine/game-log-replay.ts`: `replayGame(allDecks, runFolder, seed)` (`--replay` in the viewer). It stops with a clear message if a list changed since the run (the hash in `run.json`).
  - Every game now starts with an `opening hand [...]` line on turn 0 (round 0 in a pod), which carries the opening hand and the mulligans, as T0 does in a real log. The log analyzer's replay leaves it out, so `--regress check` stays IDENTICAL.
  - Tapped and counters are now compared per permanent, not per name (Aesi's returned and replayed lands came out wrong per name).
  - A tapped permanent is untapped in the log before it leaves the battlefield, and the board takes an untapped one off. A log tells permanents apart by name only, so this keeps the number of tapped ones right when one of several leaves.
  - Tests in `--test`: a game played again gives the same log (20 seeds), and the board rebuilt from the log equals the game's real zones at the end of every turn (20 seeds; per name: how many, how many tapped, and the counters when there is only one). Gale, Meren, Sam & Frodo, Aesi and Codie: 0 differences. Mike: 42, because its own `draw` goes around the engine (package D).
  - Not as planned: `Board` in `log-board.ts` (the analyzer's board) keeps its own move code. It needs card data, a deck and a mana estimate, and it treats a sorcery on the battlefield as the stack; the new board is names only so that it also works for cards and tokens the simulator does not know. Sharing them is a refactor of the analyzer, for later.

- **Packages D and E** (2026-11-13): every deck changes zones only through the engine's functions. `--test` finds 0 zone changes that go around them for all six decks, the goldfish deck and 20 pod games, and now fails on any. The rebuilt board matches the game for all six decks (Mike included). The per-deck switch `recordsExactMoves` is gone. About 180 places were converted, most of them by a script (`removeOrThrow(game.hand, card)` to `game.takeCard(card, 'hand')` and the like); a few small engine functions were added for what the decks needed (`takeCardIfThere`, `takeCardAt`, `takeAllCards`, `putCards`, `putCardAt`, `takeFromBattlefieldIfThere`).

The plan is done. Left over, for when it matters:

- What step 4 of the roadmap (the web page) can call, all free of `console.log`: `listRuns`, `readRunInfo`, `readIndex`, `readGame` (`game-log-files.ts`), `boardAt` (`game-log-board.ts`), `readArchidektLog`, `archidektLines` (`game-log-archidekt.ts`), `replayGame` (`game-log-replay.ts`), `formatGameLog`, `highlightsOf` (`game-log-text.ts`), `formatGameOfRun`, `describeGameResult` (`game-log-run.ts`).
- Meren is about 30% slower with the log (7.4 s against 5.7 s for 3,000 games); the other decks 1 to 7%.
- A game that crashes keeps its log so far (written, not yet seen in practice: no game has crashed).

## The goal

After a simulation or a pod run, Pontus can open a few games that stand out and a few average ones, and read them easily. In pod games it is always clear which player does what. In step 4 the web page reads the same data to list the games of a run, open one and step through it.

## What exists today (checked 2026-11-13)

- `--trace N` already prints a play-by-play. Each `Game` collects lines with `say()` when `verbose` is on (about 40 calls in the engine, 110 in the decks). The pod merges the players' lines in `engine/pod-table.ts` (`say`, `sayAs`, `flushCurrentPlayerLog`).
- Logging costs no measurable time: 300 games single-threaded took 11.1 s with the log and 12.5 s without (Gale), 4.0 s and 4.0 s (Meren); 100 pod games 10.9 s and 10.8 s.
- Size as plain text: about 2 KB per game (Gale), 3.3 KB (Meren), 10.5 KB per 4-player pod game. As JSON expect 2 to 3 times that: roughly 130 MB for 16,000 Meren games, 30 MB for 1,000 pod games.
- A game is fully decided by its seed, list and settings, so any game can be played again and gives the same log.
- Pod lines are hard to follow today: `attack opponent 2 ... opp life [39, 38, 40]` is numbered from the acting player's own seat, so the reader has to work out who "opponent 2" is.
- Cards move between zones in about 180 places in the engine and decks. There is no single "move a card" function.
- The 13 real logs use Archidekt's simple format, and almost only four kinds of line: `moved <zone> => <zone>` (zones: library, hand, battlefield, graveyard, exile, commandZone, miscCards), `tapped`, `untapped` and `counter:<kind>=<number>`. `engine/log-board.ts` already rebuilds a board from such lines.

## Decisions (say so if you want one changed)

1. **Every game is logged as events, and each event carries its card moves in Archidekt's simple format** (agreed 2026-11-13). An event is the sim's own readable line ("cast Gray Merchant of Asphodel") plus the moves it caused (`Gray Merchant of Asphodel; moved hand => battlefield`, `Swamp; tapped`). Zone changes are recorded exactly, by one engine function that every zone change goes through (step 3). Reading is easy, and the moves alone are a real Archidekt log.
2. **Goldfish and pod games share one format.** A goldfish game is a game with one player. One viewer and later one UI handle both. A real Archidekt log loads into the same format (moves without the readable lines), so the viewer and the UI can show Pontus's real games too.
3. **The board is rebuilt from the moves, not stored.** Applying the moves from the start gives the board at any point (as `log-board.ts` does today). That is what step 4 uses for stepping through a game.
4. **Folder `session-logs/`** at the top (not in git). `decks/<name>/logs/` stays what it is: Pontus's real games.
5. **Cleared when a new `sim` or `pod` run starts.** Until step 4 there is no application to start, so "one session" means "the last run command". Looking at logs (`npm run logs`) never clears. A run that compares several lists keeps all of them.
6. **Logged runs:** the normal table, list comparisons, `--diag` and pod runs. Not logged: `--rank`, `--cut`, `--hands`, `--regress`, `--test` (many runs of little interest each). `--no-log` switches it off.

## The format

One run = one folder:

```
session-logs/
  01-meren-decklist/           one folder per list in a comparison (02-meren-test, ...)
    run.json                   what was run, enough to replay it: decks, list files, settings, mode, game count, date
    index.json                 one row per game: seed, result, tags, file, line
    games-000.jsonl.gz ...     one file per worker job, one game per line, gzipped
    tagged/fastest-seed-0412.txt   readable text of every tagged game
```

One game (a line of a `games-*.jsonl` file):

```ts
interface GameLog {
  seed: number;
  players: LogPlayer[]; // goldfish: one player
  events: GameEvent[];
}
interface LogPlayer {
  name: string; // the deck name, "gale#2" when a deck is in the pod twice
  deckName: string;
  commanders: string[];
  seat: number; // 0 = first to play
}
interface GameEvent {
  turn: number; // the round in a pod
  player: number; // who does it (index into players); in a pod this can differ from whose turn it is
  activePlayer: number; // whose turn it is
  kind: EventKind;
  text: string; // the readable line, e.g. "cast Gray Merchant of Asphodel"
  cards: string[]; // card names in the line (for card images in step 4)
  isHighlight: boolean; // worth jumping to: a win attempt, a counterspell, removal, a wipe, a player out, the win
  moves: CardMove[]; // what changed on the table because of this event
  life: number[]; // every player's life after the event (goldfish: ours, then the opponents')
}
/** One line of Archidekt's simple format, plus whose card it is. */
interface CardMove {
  player: number;
  card: string;
  action: string; // "moved hand => battlefield" | "tapped" | "untapped" | "counter:+1 / +1=3"
}
type EventKind =
  'turn-start' | 'land' | 'cast' | 'attack' | 'answer' | 'out' | 'win' | 'turn-end' | 'note';
```

Archidekt's format has no column for the player and no life totals, which is why `CardMove.player` and `GameEvent.life` are extra. An Archidekt export of a pod game is one file per player.

`index.json` rows hold the result (goldfish: both kill turns; pod: winner, round, how, the `PodStats` numbers) and the tags, so the UI can list and filter 16,000 games without reading their events.

## Tags

Worked out in the main thread after the run, from the index rows. Each tag is given to at most 5 games (lowest seeds first), so the list stays short.

| Goldfish | Meaning |
|---|---|
| `fastest` | the earliest wins |
| `slowest` | the latest wins |
| `no-win` | no win within the turns played |
| `average` | the win turn equals the median |
| `error` | the game hit a simulator bug (the log up to the crash is kept) |

| Pod | Meaning |
|---|---|
| `fastest`, `slowest`, `average` | by the round the game ended |
| `no-winner` | reached the round cap |
| `win-stopped` | a win attempt was answered |
| `most-interaction` | the most answers, counters and removal |
| `waited` | a deck held a kill for counter backup |
| `commander-kill`, `poison`, `decked` | someone went out this way |
| `error` | as above |

Deck-specific tags (a hook on `Deck`) can come later, when a deck needs one.

## Steps

Each step ends with `npm run check`, `npm run format`, `--regress check` IDENTICAL for all decks, `npm run pod -- --test`, and the same output from a fixed-seed pod run saved before the step (`npm run pod -- gale meren samfrodo aesi -n 200`).

### 1. Prove that logging does not change a game

- Save the fixed-seed pod output and a `--trace 3` output per deck before changing anything.
- Add a test (in `engine/pod.test.ts` and each deck's regress set, or one shared helper): play 50 seeds with `verbose` on and off, the results must be equal. If a deck differs, fix it first: logging must only read.

### 2. Events instead of plain lines (`engine/game-log.ts`)

- New file with the types above and `GameEvent` builders.
- `GameCore.log` becomes `GameEvent[]`. `say(...parts)` keeps its signature and makes a `note` event; the cards are collected from the `CardDef` parts it already receives. Add `sayEvent(kind, ...parts)` and use it in the few central places: playing a land, casting, attacking, turn start and end, the kill found.
- The 110 `say()` calls in the decks stay as they are.
- `--trace` prints the events through one function `formatGameLog` (step 6). Compare with the saved trace outputs: same information.

### 3. Card moves in Archidekt's simple format (`engine/game-log-moves.ts`, `engine/game-core.ts`)

Agreed 2026-11-13: zone changes are recorded exactly, by the engine. Today the zones are arrays on `GameCore`, but the code changes them directly (`this.hand.push(card)`) in about 45 places in the engine and 125 in the decks (Codie 43, Aesi 27, Gale 20, Meren 17, Sam & Frodo 8, Mike 7). The direction: the engine owns the zones, a deck says what it wants done.

**3a. The comparison (gives moves for every deck from the start)**

- A small recorder keeps what the table looked like at the last event: the card names in each zone, and each permanent's tapped state and counters. At the next event it compares, writes the differences as `CardMove`s on that event and remembers the new state. A turn's last changes go on the `turn-end` event.
- A card that left one zone and showed up in another is `moved A => B`. A token that appears is `moved miscCards => battlefield` and one that disappears goes back to `miscCards`, as in the real logs. Permanents are compared one by one (tapped, untapped, `counter:+1 / +1=N`).
- Only the real game records (not the planner's copies), and only when the log is on.
- Limits: a card that moves twice between two events shows as one move (a sorcery goes hand => graveyard), and the order of moves inside one event is not known. 3b removes both for zones.
- Tapped and counters stay with the comparison for good: a payment that is only tested taps lands and undoes it, and the log should show the end result.

**3b and 3c. One engine function for every zone change, and its safety net**

Split into work packages (2026-11-13), in the order to do them. Each one ends with the checks under "Steps" above and stands on its own, so it can be done in its own session. "Who" says what the package needs: Pontus in VS Code, a small model, or the big model.

**A. The renames. Done 2026-11-13** (by script: whole word, match case, `*.ts` only; `red` → `reduction` only in `effectiveCost`, `tot` → `totalValue`). **No behaviour change.**

Rule 0 names the big refactor missed. Done when `npm run check` passes and `--regress check` is IDENTICAL for all six decks.

Required (the rest of 3b uses these names):

| Old | New | How |
|---|---|---|
| `toGy` (method, `engine/game-core.ts`) | `toGraveyard` | F2 on the method: calls in the engine and the decks follow |
| `onToGy` (hook, `engine/game-core.ts`) | `onToGraveyard` | F2 on the method in `GameCore`: the decks' overrides follow |
| `fromGy`, `_fromGy` (parameters, about 50 places) | `fromGraveyard`, `_fromGraveyard` | search and replace in `*.ts`, whole word, match case (F2 only renames one function at a time) |
| `fromLib`, `_fromLib` (parameters) | `fromLibrary`, `_fromLibrary` | the same |

Good to do in the same pass (same rule, not needed by 3b):

| Old | New | How |
|---|---|---|
| `effCost` (method, about 90 uses) | `effectiveCost` | F2 |
| `orderedCands` (method) | `orderedCandidates` | F2 |
| `Cand` (type, `engine/game-types.ts`) | `Candidate` | F2 |
| `Perm` (class, `engine/game-types.ts`, about 300 uses) | `Permanent` | F2 |
| `fmt`, `fmtList`, `fmtPool` (`engine/log-format.ts`) | `formatLogPart`, `formatList`, `formatPool` | F2 |
| `REDUCE_FROM_GY2` (`engine/card-facts.ts`) | `REDUCE_FROM_GRAVEYARD_BY_2` | F2 |
| `_cd`, `_st`, `trig` (hook parameters) | `_card`, `_state`, `triggerOptions` | F2 on each, or search and replace whole word |
| `red`, `tot`, `nRoll`, `maxt`, `pool0` (locals in `game-core.ts`) | `reduction`, `total`, `rolloutCount`, `maxTurn`, `poolBefore` | F2 on each |

Watch out for:

- After the search and replace, look at the diff for a scope that now has two `fromGraveyard` (none today: `seeTheTruth` already has its own).
- The header comment of `game-core.ts` lists the hooks by name (`onToGy`): F2 does not change comments. Search the old names once more in `*.ts` and `*.md` at the end (`ENGINE.md`, the decks' `PLAN.md`).
- Log texts must not change (`'(from graveyard)'` stays). The regress check compares the log analyses, so it catches that.
- Run `npm run format` at the end (longer names move line breaks).

**B. Zone changes through engine functions. Done 2026-11-13.**

As built (it differs a little from the first sketch):

- `GameCore` has the functions every zone change goes through (section "zones / drawing" of `game-core.ts`): `takeCard(card, zone)`, `putCard(card, zone)` (the end of the list; in the library the bottom), `moveCard(card, fromZone, toZone)`, `takeTopCardsOfLibrary(count)`, `putCardsOnTopOfLibrary(cards)`, and for permanents `putOntoBattlefield(permanent)` and `takeFromBattlefield(permanent)`. Taking and putting are two steps because a spell is in no zone while it resolves, and results depend on that (Cabal Ritual counts the graveyard).
- With the log on they tell the recorder (`noteCardLeft`, `noteCardArrived` in `game-log-moves.ts`), so the move is written at that moment and in order. A card taken and not yet put is "on its way"; the move is written when it arrives (`hand => graveyard` for a sorcery, in one move: decided, as before).
- There is no switch for where a deck's moves come from. The recorder keeps its picture of the table up to date with what it is told, and at every log line compares it with the real table. What differs went around the functions: it is still written as a move (as in 3a), and listed in `Game.unrecordedCardMoves` for the test. So a deck's log gets exact place by place. A deck that takes a card by hand and then calls an engine function (`enter`, `toGraveyard`) still gets the right move: the missing origin is filled in from the comparison.
- All of the engine uses them (`game-core.ts`, `game.ts`, `pod-arena.ts`, `pod-table.ts`). Left as they are: whole-zone replacements, test setups, and `rockFirst`'s try-out of a rock (pushed and popped at once).
- The order of every list is as before: `--regress check` IDENTICAL for all six decks.

**C. The safety net. Done 2026-11-13.**

- `npm run sim -- <deck> --test` plays 50 seeds with the log on and prints how many zone changes went around the functions, with the seed, turn, log line and move of the first eight. `npm run pod -- --test` does the same for 20 pod games.
- At first a deck could say with `recordsExactMoves` that it was converted, and only then a change failed the test. Counts before the decks were converted: goldfish 0 (the engine alone), Sam & Frodo 117, Gale 310, Codie 639, Meren 1252, Aesi 2197, Mike 3543 (Mike has its own `draw`).
- Time for 3,000 games with the log against without: Meren 7.5 s / 5.6 s, Gale 29.0 / 27.1. Recording did not make the log cheaper: the comparison still runs at every line (it is the safety net and gives tapped and counters).
- The round trip was done with step 9, against the new board in `game-log-board.ts` instead of `Board` in `log-board.ts`: see "Status".

**D. The decks. Done 2026-11-13** (all six and the goldfish deck, in one pass). A script rewrote the plain cases in each deck's folder; the rest was done by hand: Gale's Scion and Gifts, Codie's Treasures, Lim-Dul's Vault and Reiterate loop, Meren's end-of-turn exile, Sam & Frodo's Crypt Incursion, Aesi's land puts and cast from the top. The order of every list and the moment of each change are as before: `--regress check` IDENTICAL for all six decks. Code that works on a copy of the game or on a kill-search state (Gale's `kill-moves.ts`, Codie's `solver.ts`) was left alone: those are not the game's zones.

**E. Clean up. Done 2026-11-13.** `recordsExactMoves` is removed, so the tests are strict for every deck. The comparison stays: it is the safety net and gives tapped and counters.

Later, outside this plan: with every zone change in one place, the engine can also take over the rules that hang on them ("when this leaves the battlefield", "whenever a card goes to your graveyard") instead of each deck calling its own hooks.

### 4. Pod: say who does what (`engine/pod-table.ts`, `pod-combat.ts`, `pod-interaction.ts`)

- The pod log becomes `GameEvent[]` with `player` and `activePlayer` set, instead of text with an `R3 meren:` prefix.
- Replace "opponent 2" and `opp life [39, 38, 40]` with the deck names (agreed 2026-11-13): `attack samfrodo with 1 creature: 1 damage (samfrodo 38)`. The pod knows the mapping (`opponentsOf`, `playerName`). The same deck twice in a pod stays `gale` and `gale#2`.
- A `turn-start` event carries every player's life, so each turn opens with the standings.
- Mark highlights: win attempts and their answers, counterspells, removal and wipes, eliminations, the win.
- This changes trace text only, not results. Check with the saved pod output.

### 5. Write the logs during a run (`engine/game-log-files.ts`, `runner.ts`, `pod.ts`)

- `Job` and `PodJob` get an optional `logFolder` and job number. With it set the worker plays with the log on, writes `games-<job>.jsonl` and returns one index row per game. A game that throws still writes its log so far.
- The main thread clears `session-logs/`, creates the run folder, writes `run.json` before the run and `index.json` after it.
- Add `session-logs/` to `.gitignore`. Add `--no-log` to `cli/args.ts`.
- Note for the goldfish table: one game gives both kill turns and is played in "protected" mode, so its log runs past the first kill found. That line gets a highlight.
- Measure a 16,000-game run per deck (time and folder size). If a folder passes about 300 MB, keep full events only for tagged games and replay the others on demand.

### 6. Readable text (`engine/game-log-text.ts`)

One function turns a `GameLog` into text. Used by `--trace`, the `tagged/` files and the viewer. The card moves are left out here (the readable lines say the same); `--moves` in the viewer shows them under each line. Sketch of a pod game:

```
Pod game, seed 1: samfrodo wins in round 8 (last standing)
Seats: 1 aesi, 2 samfrodo, 3 meren, 4 gale
Tags: win-stopped, average

== Round 3, meren ==   life: aesi 39, samfrodo 38, meren 40, gale 36
   play land Exotic Orchard
   cast Grist, the Hunger Tide
   attack samfrodo with 1 creature: 1 damage (samfrodo 37)
>> gale: counters Victimize with Counterspell
   end: hand Victimize, Swamp, Twilight Diviner
```

Lines by another player than the one whose turn it is start with that player's name. Highlights start with `>>`. A goldfish game looks the same with `== Turn 3 ==` headers.

### 7. Tags (`engine/game-log-tags.ts`)

- Two plain functions: goldfish rows in, tags out; pod rows in, tags out (the tables above).
- After the run: write the tags into `index.json`, write each tagged game as text into `tagged/`, and print a short "Games worth a look" list under the report with tag, seed, result and file path.

### 8. The viewer (`cli/logs-command.ts`, `npm run logs`)

```
npm run logs                               the runs of this session, with how many games carry each tag
npm run logs -- 01-meren-decklist          the tagged games of a run
npm run logs -- 01-meren-decklist --seed 412           one game as text
npm run logs -- 01-meren-decklist --tag average        every game with that tag
npm run logs -- 01-meren-decklist --seed 412 --highlights   only the highlights, with two lines around each
npm run logs -- 01-meren-decklist --seed 412 --moves   with the card moves under each line
npm run logs -- 01-meren-decklist --seed 412 --board   with the board at the end of each turn
npm run logs -- 01-meren-decklist --seed 412 --archidekt   the game as an Archidekt log (a pod: one file per player)
npm run logs -- decks/meren/logs/game1_t9_gray_merchant.txt --board   a real Archidekt log, shown the same way
```

The run name may be shortened to its number (`1`). Without a run, the latest is used.

### 9. The board at any point, and replay (what step 4 builds on)

- `boardAt(gameLog, eventIndex)` applies the moves up to that event and returns each player's hand, battlefield (tapped, counters), graveyard, exile, command zone, library size and life. Share the move-applying code with `Board` in `log-board.ts` instead of writing it twice.
- `readArchidektLog(file)` turns a real log into a `GameLog` (one event per line, grouped by turn), so everything above works on Pontus's real games.
- The Archidekt export: the moves of one player, one per line, as `T<turn>; <card>; <action>`. A simulated game can then be fed to `--analyze`.
- `replayGame(runFolder, seed)` reads `run.json`, plays the seed again and returns the `GameLog`. Needed if step 3 or 5 ended up storing less than everything, and handy for debugging. It stops with a clear message if a list file changed since the run (store a hash of each list in `run.json`). Test: the replayed events equal the stored ones for 20 seeds per deck and for a pod.
- The functions step 4 will call are then all there: `listRuns`, `readIndex`, `readGame`, `boardAt`, `readArchidektLog`, `replayGame`, `formatGameLog`. Keep them free of `console.log` so the web server can use them as they are.

### 10. Finish

- ENGINE.md: a "Game logs" entry under "What the engine provides".
- README: the `npm run logs` commands, `--no-log`, the `session-logs/` row in the layout table.
- ROADMAP: mark step 3 done, with the decisions above in two or three lines.
- Re-record regress baselines only if a new test was added (results themselves must not change).

## Order and size

Steps 1 to 4 change existing code and need the most care (regress after each). Step 3b is the biggest part of the plan (one pass per deck) and does not hold up the rest: steps 4 to 9 only need 3a, so 3b can run alongside or after them. Steps 5 to 8 are new files and give the first usable result: after step 8 the goal is met for reading games. Step 9 prepares step 4 of the roadmap.
