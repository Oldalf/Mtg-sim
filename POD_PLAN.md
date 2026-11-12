# Pod simulation: plan

Goal (Pontus, 2026-11-11): simulate several decks playing **against each other** in one pod, each following its own game plan: attack when it can, block when it can, and try to stop an incoming win. Use it to judge whether a group of decks makes a balanced, fun pod and whether each deck fits its bracket.

- **Pod size:** 3 to 6 decks. The first pod is 5: gale, meren, samfrodo, aesi, mike. Codie is left out of the pod for now (Pontus, 2026-11-11: he'll look at it another time).
- **Output per deck:** win rate, average win turn, and the early and late ends of its wins (10th and 90th percentile turn). Also: how each deck won, who was eliminated first, and win rate by seat.
- **Fewer games than a goldfish run:** a pod game is about 4 to 5 decks' worth of work, so 1,000 to 2,000 games per pod. At 1,000 games a win rate is good to about ±3 points.
- **Command (new, next to `npm run sim`):** `npm run pod -- gale meren samfrodo aesi mike -n 1000`. A deck may name a list: `gale:lists/proposed.txt`. `--eco`, `--trace`, `--seed` work as they do today.

## The approach: couple the existing games, don't rewrite them

Today each deck is a `Game` subclass that plays alone against opponents who are only numbers (`life[]`, `lib[]`, `poison[]`). Rewriting everything as one true multiplayer rules engine would throw away five working AIs. Instead:

- A **pod controller** owns the shared truth: each player's life, library size, poison, who is alive, whose turn it is.
- Each player keeps **its own `Game`** (its hand, battlefield, mana, AI). Its "opponents" arrays become a view of the other players in the pod.
- When a deck hurts an opponent (`hurtOpp`, `drainEach`, mill, poison), the controller applies it to the real player. When a deck is attacked, the controller takes creatures off its real battlefield and life off its real total.
- The goldfish stand-ins go away in a pod: "half the ground attackers are blocked" and the crackback rule are replaced by real blockers and real attacks from the other decks.

The goldfish simulator stays exactly as it is. Every step below must leave `--regress check` IDENTICAL for all six decks.

## Steps

### Step 0: make a game steppable (refactor, no behaviour change)
- Split `Game.play()` into `setup()` (mulligan) and `takeTurn()` (one full turn); `play()` just loops them.
- Route every "opponent" read and write through a few methods (`oppLife(i)`, `hurtOpp`, `millOpp`, `poisonOpp`, `oppAlive`) so a pod can supply them. Several decks touch `life[]` directly today; those move behind the methods.
- Check: all regress baselines IDENTICAL.

### Step 1: the race pod (shared life, no blocking, no interaction)
- The controller, seat order (random each game), turn loop, elimination (0 life, empty library on draw, 10 poison, 21 commander damage is skipped at first), a turn cap (17), and the `pod` command with its report.
- Each deck's damage, drain and mill go to real players. "Each opponent" effects hit everyone alive. Single-target effects use the target rule (below).
- A deck with a declared combo win (Gale's kill line, Aesi's loops, Mike's mill or Toad, later Codie) wins on the spot at this step.
- Check: a pod of one real deck and dummy players that do nothing must give the deck's goldfish numbers (within noise). This is the proof that the coupling is right.

### Step 2: real combat
- **Attacking:** each deck keeps choosing its attackers with its own rules, but against a chosen defender, and it sees that defender's real untapped creatures.
- **Blocking:** the defender blocks with untapped creatures by a simple shared rule: block to prevent lethal first; make a block that kills the attacker and keeps the blocker; chump only when the damage matters (life low, or a huge attacker); never block with a creature the deck marks as too valuable (its commander, its engines; each deck already has a value table). Flying, shadow and "can't be blocked" follow each deck's existing `evasive`.
- Creatures die for real (`dies`, death triggers fire: Meren likes this). Crackback and the "half are blocked" rule are off in a pod.
- Decks that never attacked in the goldfish model because it was pointless (Gale, Aesi's ground creatures) get a default: attack when no blocker can kill the attacker.

### Step 3: interaction
- **Mana held up:** on other players' turns a deck has the mana it left untapped at the end of its own turn. A cheap rule decides how much each deck leaves up when it holds a counterspell.
- **Counterspells** (Gale, Mike, Aesi's few; Codie later): used on an opponent's **win attempt**, else on a spell above a value threshold. A win attempt is: a declared kill line, a loop, a mill-win draw, a lethal drain or X spell, the key card of a combat kill.
- **A countered win attempt** costs the caster the countered card and the mana; the game goes on. For solver-found lines (Gale, later Codie) the line names its key spell.
- **Protection:** a deck that goes for the win with its own counterspell or protection up (the "with backup" measure) wins the counter war against one counterspell.
- **Targeted removal** (Meren, Sam & Frodo, Mike, Aesi): aimed at the most valuable permanent of the biggest threat, using the owner's own value table as the price list. **Board wipes and mass bounce** (Evacuation, Toxic Deluge, Aetherize...): cast when behind on board or facing lethal.
- Cards that are held and never cast in the goldfish model (each deck's `HOLD` list) get their real use here. This is the largest step: every deck needs its interaction cards wired, with tests.

### Step 4: who to attack and whom to stop (threat assessment)
- One shared **threat score** per player, visible to all: damage and drain dealt so far, board power, cards in hand, mana, and a deck-declared "close to winning" flag (Mike with Maniac out and a small library; Aesi with a loop piece and an untapper; Gale with a kill line minus one card; Meren's Gray Merchant devotion).
- Attacks, single-target drains, removal and counterspells go to the highest threat, with a little randomness, and to whoever can be killed this turn first.
- This is the part that most shapes the win rates, so it gets settings (`--set threat=spread` for "hit everyone evenly", `threat=leader`, `threat=weakest`) to see how much the result depends on it.

### Step 5: report, checks, then friends' decks (Codie: on hold)
- The report (see Output above), `--trace` for a readable play-by-play of one pod game, seat-order fairness (each deck sits in each seat equally often).
- A per-deck note in each `PLAN.md` of what its pod behaviour is.
- Decks from Pontus's friends (Codie is on hold, 2026-11-11). Each new deck still needs its goldfish model first; the pod layer is then mostly its interaction cards and its "close to winning" flag).

## What this will and won't tell you

- It will show relative strength: which deck wins most, how early, and how much that changes when the others interact. A deck that wins 45% of a 5-pod (20% is even) is too strong for that pod; one at 5% is too weak.
- It won't be a real game. No politics, no bluffing, no deals; the AIs are heuristic; interaction is rule-based. Read differences of 5+ points, not 1 to 2.
- Decks whose goldfish AI is still rough (Codie) will look weaker than they are.

## Decisions (Pontus, 2026-11-11)

1. **Target choice:** the highest threat (step 4), not spread evenly.
2. **First usable version:** steps 1 and 2 (a race with real combat), look at the numbers, then interaction.
3. **A countered combo:** the deck loses the countered card and the mana and plays on. Counterspells and instant-speed targeted removal are both used, and follow the rules of Magic (a counterspell needs a spell on the stack and the mana open; removal needs a legal target).
4. **Commander rules:** 21 commander damage, counted per commander (partners separately: Sam and Frodo each need their own 21). Commander tax when a removed commander is recast.
5. **Turn cap:** 17 rounds; a game with no winner by then is a draw and is reported.
6. **Games per run:** 1,000 by default (`-n` changes it).

## Status

- **Step 0 done (2026-11-11):** `Game.setup()` and `Game.takeTurn()`; `play()` loops them. All regress baselines IDENTICAL. Instead of moving every opponent read behind methods, the pod writes the other players into the game's `life / lib / poison` arrays before its turn and reads the changes back afterwards (`engine/pod.ts`), so no deck had to change.
- **Step 1 done (2026-11-11):** `engine/pod.ts` and `npm run pod -- <3 to 6 decks>` (`-n`, `--eco`, `--trace N --seed S`, `--turns`, `--set`). Random seats, only the first player skips the first draw, elimination (life, poison, drawing from an empty library; Mike handles its own library), a declared win ends the game. Pod settings per deck: Meren and Sam & Frodo need every other player dead (their goldfish win rules were "2 dead or 100 damage" and "3 dead"). The goldfish crackback is switched off; each deck's own "half the ground attackers are blocked" rule still decides what connects until step 2.
- **First race numbers** (300 games, eco, ±6 points; no blocking, no interaction, so this favours the combo decks): Gale 27%, Aesi 26%, Mike 22%, Sam & Frodo 15%, Meren 10%; games last 7.6 rounds on average. Gale and Aesi win only by declaring a combo; Meren and Sam & Frodo only by being the last one standing.
- **Step 2 done (2026-11-11): real combat.**
  - An attack goes at one opponent. The defender blocks with its real untapped creatures by the shared rule (`assignBlocks` in `engine/pod.ts`, 18 tests: `npm run pod -- --test`): a block the blocker survives; a trade when the blocker is worth less; chump blocks when the hit is lethal (with anything), when it leaves 10 life or less, or against 8+ power (tokens and cheap creatures only). Flying needs flying or reach; skulk (Gollum, Frodo as Ring-bearer) can't be blocked by greater power; "can't be blocked" is never blocked. One blocker per attacker, a creature blocks once per turn. No trample, first strike or menace yet.
  - Creatures die for real on both sides (death triggers fire). 21 combat damage from one commander kills (counted per commander card).
  - **Attacker choice** (`planAttack`, `arenaCombat` in `engine/game.ts`): a creature stays home if it would be blocked without killing its blocker, or would die for less than it kills; a lethal attack sends everything. **Home guards:** if an opponent's board could kill us next turn, the smallest attackers stay home as blockers. **Defender choice** until step 4: the opponent the attack does most to (a kill first), so the player with the fewest blockers is hit most.
  - Per deck: Meren and Mike use the shared rule; Meren sacrifices Spore Frog to prevent all combat damage when the hit is lethal or 6+ (`fog_at`). Aesi's land creatures are 2/2 and attack by the same rule. Gale's creatures attack when nothing can stop them (Mindskinner as before). Sam & Frodo: Frodo and Gollum each pick an opponent who can't block them, the rest of the team follows the shared rule; Pippin's all-in pump is not used in a pod yet.
  - `--set pod_race=true` switches real combat off (step 1 behaviour).
- **Check with do-nothing players (done):** new deck `goldfish` (draws, never plays). `npm run pod -- gale goldfish goldfish goldfish --set pod_race=true` gives Gale's goldfish numbers: won by turn 6 / 7 / 8 = 11.2% / 32.6% / 56.5% in the pod, 11.3% / 33.2% / 57.9% in `npm run sim -- gale` (2,000 games each, different seeds). Aesi: 44.9% / 68.0% / 83.9% by turn 8 / 9 / 10 against 43.4% / 69.0% / 84.5%. The coupling is right.
- **Numbers with real combat** (2,000 games, ±2 points; still no interaction): Aesi 26.4%, Mike 20.9%, Gale 20.6%, Sam & Frodo 17.6%, Meren 14.4%. Average game 7.9 rounds, no draws. Against the race: Gale down from 27% (it is the first one out in 45% of games: few blockers, so everyone attacks it), Meren up from 10%. Nobody died to commander damage.
- **Fix after step 2 (2026-11-11):** a commander on the battlefield wasn't recognised as a commander, so commander damage never counted and commanders chump blocked like any creature. Fixed (`commanderNames`); the step 2 numbers above are from before the fix. With it (and no interaction): Aesi 25.6%, Mike 20.6%, Gale 19.4%, Sam & Frodo 17.5%, Meren 16.9%.
- **Step 3 done (2026-11-11): interaction, first version.**
  - **The cards** are one shared table, `engine/answers.ts`: 16 counterspells, 13 instant removal spells, Aether Gale, and the wipes (Toxic Deluge, Singularity Rupture, Dusk, Fell the Mighty, Evacuation, Aetherize). 34 tests: `npm run pod -- --test`.
  - **Answering a win.** A deck that declares a win describes it (`winAttempt()`): the key spells and the key permanents, most important first. Gale: the spells and permanents of its kill line. Aesi: the loop's finisher (Blue Sun's Zenith, Endless Swarm, Eternal Dominion) and the loop pieces. Mike: Laboratory Maniac / Jace for a mill win, the Toad for a Toad win. The others answer in turn order, by the rules: a counterspell needs a key spell it may target (Negate: noncreature) and the mana untapped; removal needs a key permanent of a type it can hit. A winner with backup (Gale's "with counter backup", Mike's counterspell + 2 mana or Siren Stormtamer, Aesi's Kira or a counterspell) answers one answer back per backup.
  - **A stopped win** (changed 2026-11-11, Pontus: taking the turn back felt wrong): the answer happens in the middle of the turn, when the deck declares the win. The answer is spent, the countered spell goes to the graveyard (exile if it was cast from there) and its mana is tapped, a removed permanent is destroyed / exiled / bounced (a commander goes to the command zone). The turn goes on from there with what is left: the deck may find another way to win and then needs to be answered again (at most 4 tries a turn). Aesi's loop has already drawn its cards; only the damage to the opponents is put back. Mike's mill win: removing Laboratory Maniac / Jace in response means Mike draws from its empty library and loses (unless Living Conundrum or Ormos). Not modelled: the mana Gale spent on the earlier steps of a kill line that was countered at a later step.
  - **Mana held up:** from round 5 (`hold_from`) a deck with an instant answer in hand keeps the mana for its cheapest one untapped on its own turn.
  - **Removal on a deck's own turn** (after its plays): aimed at the most valuable permanent (the owner's own card values, +30 for a commander) of the biggest threat (board power, permanents, hand size; step 4 refines this). Sorcery-speed removal is always used; an instant only if a second answer stays in hand. **Wipes:** when the biggest opposing board has 10+ power (`wipe_at`) and at least twice ours. Aetherize: cast when attacked for lethal or 6+ (`fog_at`).
  - **Meren's creatures:** the "each player sacrifices" creatures and Deadly Brew now make every opponent sacrifice its least valuable creature; Shriekmaw destroys the biggest threat's best creature.
  - **Commander tax:** a removed commander returns to the command zone and costs {2} more per earlier cast (the engine default now; Gale, Meren and Mike already counted casts).
  - `--set pod_answers=false` switches step 3 off; `--set hold_from=99` keeps the answers but holds no mana; `--set pod_protected=true` makes Gale wait for counter backup.
- **Numbers with interaction** (2,000 games, ±2 points): Aesi 23.4%, Mike 23.2%, Sam & Frodo 22.6%, Meren 18.4%, Gale 12.3%. Average game 8.9 rounds (7.9 without). Win attempts stopped: Gale 48% of its 0.21 per game, Aesi 27% of 0.31, Mike 8% of 0.18. Gale is the first one out in 50% of games.
  - Without mana held up (`hold_from=99`) almost nothing is stopped: Gale 18.2%, Aesi 26.3%. Holding mana is what makes the answers work.
  - Gale waiting for backup (`pod_protected=true`) is worse for it: 8.6%.
- **Not done yet in step 3:**
  - Counterspells are only used on a declared win. Nothing counters a big spell that isn't a win (Gray Merchant, a commander), so Meren's and Sam & Frodo's wins (drain and combat, "last standing") are never answered.
  - Not wired: Diversion Unit, Siren Stormtamer's own ability, Soratami Savant and Mirror-Mage, Wash Out, Shire Shirriff, Volatile Stormdrake, Vindictive Lich's sacrifice mode, Insidious Fungus, Bushwhack's fight, Crypt Incursion. Removal doesn't check colour ("nonblack") or hexproof; Kira only protects Aesi's win.
  - A countered commander spell doesn't raise the tax.
- **Counterspell gap closed (2026-11-11):** a spell is checked when it is cast (`Arena.counter`, from `castPerm` / `castInstantOrSorcery`). Its weight is 10 x mana value, +30 for a commander, + a key bonus (`KEY_SPELLS` in `engine/answers.ts`: Gray Merchant +40, Laboratory Maniac +55, Retreat to Coralhelm +55, Duskmantle Guildmage +50...). Anyone counters at 85 or more (`counter_any`); from 60 (`counter_at`) a player counters only if it holds two counterspells and the caster is its biggest threat. The caster counters back if it can. A countered commander goes back to the command zone, and the cast still counts for the tax.
- **Step 4 done (2026-11-11): threat.** `Game.threat()`: board power, 3 per nonland permanent (1 per mana rock), 0.5 per land, half the hand, a tenth of the damage dealt so far, plus 25 x the deck's own `podClose()` (0 to 1): Gale (Gale out, Guildmage / Mindskinner / Monument, 8+ instants and sorceries in the graveyard, 8+ mana), Aesi (Retreat or Omniscience, a land-putter, Aesi, 9+ lands), Mike (Maniac / Jace with a small library, the Toad near twenty), Meren (Meren, devotion 8+, 8+ creatures in the graveyard, Priest / Zulaport), Sam & Frodo (the Ring's tempts, Sam, Frodo, 4+ Food). Scores are taken at the start of each turn.
  - **Attacks** add a preference to the attack's own score: `--set threat=leader` (default: up to 12 for the biggest threat), `spread` (minus a third of the life we've already taken from that player), `weakest` (up to 12 for the lowest life), `damage` (none: where the attack does most, as in step 2). A kill always comes first. A little randomness (0 to 2).
  - **Removal and counterspells** aim at the biggest threat in every mode.
- **Numbers, steps 1 to 4** (2,000 games each, full power, ±2 points):

  | threat= | Gale | Meren | Sam & Frodo | Aesi | Mike |
  |---|---|---|---|---|---|
  | leader (default) | 19.3% | 19.7% | 14.4% | 20.1% | 26.4% |
  | damage | 13.7% | 16.9% | 22.6% | 20.1% | 26.6% |
  | spread | 16.1% | 18.3% | 21.6% | 20.3% | 23.6% |
  | weakest | 13.4% | 18.3% | 23.0% | 19.9% | 25.3% |

  With `leader`: Gale is first out in 36% of games (48% with `damage`), Sam & Frodo in 17% (4%): the attacks go to the board leader instead of the player with the fewest blockers. Average game 8.9 rounds. Win attempts stopped: Gale 48% (0.34 a game), Aesi 26%, Mike 7%. Spells countered per game: Aesi 0.33, Meren 0.20.
  - **Why Gale is stopped so often** (400 traced games): mostly instant creature removal on a permanent its kill line needs: Gale herself, Duskmantle Guildmage, The Mindskinner (Meren's Heartless Act / Infernal Grasp / Beast Within, Mike's Rapid Hybridization, Sam & Frodo's Swords / Path). Gale's own counterspells don't protect a creature from removal unless the line was found "with counter backup".
- **Targeting rules (2026-11-11):** removal checks its own limits (`not` in `engine/answers.ts`): Go for the Throat (nonartifact), Heartless Act (no counters), Shriekmaw (nonartifact, nonblack). Hexproof and shroud can't be targeted (Invisible Stalker, Living Conundrum; Volatile Stormdrake's "hexproof from abilities" doesn't stop spells). Shields counter a removal spell aimed at a creature (`Game.podShield`): Kira, Great Glass-Spinner (the first spell at each creature each turn), Soratami Rainshaper ({3} and a land back to hand: shroud), Siren Stormtamer ({U}, sacrifice it). Kira and Stormtamer no longer count as "backup" for Aesi and Mike: they work as shields, on every targeted removal, not only on win attempts. What the owner gets: Pongify / Rapid Hybridization / Beast Within a 3/3, Path to Exile a basic land, Swords life equal to the power, Reality Shift a 2/2; Infernal Grasp costs its caster 2 life, Anguished Unmaking 3. `--set pod_legal=false` switches the limits, hexproof and shields off (a check).
- **Gale's policies** (`--set policy=gale:...`): `any` (default: go at the first kill found), `protected` (only with counter backup: a counterspell and the mana for it after the line), `mixed` (protected until round `protect_until`, default 9, then any), `window` (with backup, or when every opponent has at most `window_mana` (1) untapped mana or no cards in hand: reading the table). While Gale waits it keeps the kill intact and plays on (protected-mode development), so its other spells may draw out counterspells first. The answer-back now uses a counterspell that can actually target the answer, and only while Gale has the mana.
- **Results (2,000 games each, eco, ±2 points, threat=leader):**

  | run | Gale | Meren | Sam & Frodo | Aesi | Mike | Gale: attempts / game, stopped, turns waited |
  |---|---|---|---|---|---|---|
  | targeting rules on, Gale `any` (default) | 19.3% | 19.6% | 14.8% | 20.4% | 25.9% | 0.34, 48%, 0 |
  | targeting rules off (`pod_legal=false`) | 19.2% | 19.8% | 15.2% | 20.3% | 25.5% | 0.34, 48%, 0 |
  | Gale `protected` | 12.8% | 20.7% | 15.8% | 22.1% | 28.6% | 0.14, 26%, 0.31 |
  | Gale `mixed` (protected until round 9) | 16.1% | 19.9% | 15.3% | 21.4% | 27.2% | 0.21, 38%, 0.24 |
  | Gale `window` | 18.2% | 19.6% | 14.8% | 20.7% | 26.6% | 0.25, 37%, 0.19 |

  - The targeting rules barely move the win rates. Aesi's wins are stopped less (24% against 27%: Kira and Rainshaper counter 0.04 removal spells a game), Mike's too (9% against 11%: Stormtamer, hexproof Living Conundrum). Gale has no shields, and its key creatures are blue-black non-artifacts with no counters, so every removal spell can target them.
  - For Gale, going at once is best. Waiting for backup halves the stopped rate but gives the others the turns: in `protected`, Gale goes for the win 0.14 times a game instead of 0.34, and the time goes to Mike and Aesi.
  - No baiting happens: none of Gale's spells are countered (0.00 a game), and its permanents are removed only 0.12 times a game outside a win attempt. The other decks keep their last instant answer for a win attempt (the `afterTurn` rule), so nothing draws it out early. That is the "always ready" table again.
- **Six gaps fixed (2026-11-11)** (found by a review of what the pod leaves out):
  1. **Triggers on other players' turns were lost (a bug).** Each game holds its opponents as arrays that the pod only synced on its own turn, so a drain from a creature dying on someone else's turn (blocking, removal, a wipe, an edict) was overwritten. Now every game's view is synced around every pod event (`runOffTurn` in `engine/pod-table.ts`): Vindictive Lich, Junji, Mirkwood Bats, Marionette Apprentice, Syr Konrad count. Their log lines show in `--trace` too.
  2. **"Each player" effects:** Windfall (Gale, Mike) makes every other player discard its hand and draw as many as the biggest hand discarded (`Arena.wheel`); Folio of Fancies makes the others draw; Butcher of Malakir makes each opponent sacrifice a creature when one of Meren's dies. Flux leaves opponents' hands alone (they choose what to discard, so they keep their answers).
  3. **Removal on attackers:** a defender facing a lethal attack, or one that leaves it at 10 life or less, casts instant removal on the biggest attacker that would connect, before blocks (up to 3 spells).
  4. **Defence:** after its second main phase a deck casts creatures from hand as blockers (cheapest first) when the biggest opposing board would leave it at 10 life or less (`Game.podDefence`, a shared rule; `--set pod_defence=false` turns it off). Each deck's own AI still doesn't plan for defence.
  5. **Combat:** trample, first strike / double strike, menace (two blockers); the creatures not sent at the first opponent may attack up to two more; Sam & Frodo use Pippin's +3/+3 and haste for an attack that kills a player; Gale's combat damage with The Mindskinner out becomes milling. 7 more tests (49).
  6. **How ready the table is:** `--set hold_chance=0.5` (a deck keeps answer mana up on half its turns), `--set fire_chance=0.5` (half the time a deck uses its last instant removal on its own turn instead of holding it). Defaults keep the old behaviour (always hold, never fire).
- **Results after the fixes (2,000 games each, eco, ±2 points, threat=leader, Gale any):**

  | run | Gale | Meren | Sam & Frodo | Aesi | Mike | Gale stopped | Aesi stopped |
  |---|---|---|---|---|---|---|---|
  | all fixes (default) | 19.2% | 20.9% | 15.2% | 20.3% | 24.3% | 45% | 21% |
  | without the defence rule | 18.9% | 21.5% | 15.8% | 19.9% | 23.8% | 45% | 24% |
  | hold_chance=0.5 | 22.3% | 20.3% | 12.9% | 22.6% | 21.8% | 29% | 11% |
  | fire_chance=0.5 | 22.3% | 21.3% | 13.3% | 18.9% | 24.1% | 30% | 14% |
  | both 0.5 | 25.1% | 19.9% | 11.4% | 21.9% | 21.6% | 17% | 8% |

  - The fixes moved little: Meren up a point (its off-turn drains now count), Mike and Sam & Frodo down a little. The defence rule is within noise.
  - How ready the table is matters most for Gale: holding answer mana on half the turns, or firing the last removal early half the time, takes Gale from 19% to 22% and its stopped rate from 45% to 29-30%; both together put Gale on top at 25% (stopped 17%). Sam & Frodo lose the most (11-13%): firing removal early hits their creatures (0.79 removals taken a game).
- **Next:** the rest of step 3's list (unwired cards), then step 5 (report polish, friends' decks).

## Order of work and size

Step 0 is small. Step 1 gives the first pod numbers (a race). Step 2 makes creature decks honest. Step 3 is the big one and is done deck by deck. Step 4 is tuning. Each step ends with tests on hand-built boards, the regress check, and a short entry here.
