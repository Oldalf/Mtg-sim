# Aesi: deck plan

Simic "reverse landfall" (based on DefCatMtg's list), bracket 3, built to be fun to play and fair to play against. Aesi draws a card for every land; moonfolk return lands to hand so they can be played again; extra land drops and "put a land onto the battlefield" creatures turn that into a stream of landfall triggers. Phase 3 of the root `ROADMAP.md`.

- Run: `npm run sim -- aesi` (more in the root README). Tests: `npm run sim -- aesi --test` (58 rules checks). Replay a real game: `--analyze logs/<file>.txt`.
- **Lists:** `decklist.txt` is the list as Pontus first gave it. `lists/package.txt` is the new list built on 2026-11-06 that he looked at on 2026-11-07 ("looks good"; see "Current state" and "Open"). The other files in `lists/` are test lists from the swap tests.
- **Pontus's preferences:** consistent, fun and fair rather than fast; no mana rocks (land theme); at most 39 lands; not more engine pieces; interaction and protection cards stay; cards that are sad without lands in hand go.

## How the deck wins (Pontus)

- **Main lines:** Endless Swarm or Eternal Dominion (epic, copied by Uyo so every upkeep gives several copies); Omniscience + Kiri-Onna + Haru-Onna (draw as many as needed, bounce every opposing creature); endless landfall loops (Retreat to Coralhelm or Elven Raft-Steerer + a "put a land" creature + a land returner).
- **Other wins:** mill (Soratami Mindsweeper loop, or a huge Blue Sun's Zenith copied by Uyo); Meloku's flyers (Kodama of the East Tree + Meloku is endless); big creatures.
- Extra land drops and putting lands (Atlas, Scout, PuPu UFO, Budoka) are separate; Pontus tracks them with two dice.
- Loops are shown at the table as "demonstrated" loops, so the sim shortcuts them.

## Simulation rules (agreed with Pontus)

- **Opponents:** 3, at 40 life, 92-card libraries, each drawing one a turn. **Win:** all three dead or milled out (counted on the turn we empty the library). Second measure: first opponent out.
- **Next-turn wins:** endless tokens (Meloku Illusions; Uyo copying Endless Swarm) win at the next attack (summoning sick, nothing has haste); 10+ Eternal Dominion copies win at the next upkeep (`dominion_win`).
- **Endless Swarm** without Uyo: cast only when its Snakes plus the next upkeep's copy kill at the next attack. **Eternal Dominion** without Uyo: only when nothing else is left (turn 12+).
- **Attacks:** flyers whenever they can; ground creatures only in an all-in that kills the table (half blocked, the biggest); no crackback.
- **Aesi's draw:** always, but keep 5 cards in the library (`keep_library`); the loop solver too. Tatyova's draw is not optional.
- **Hand size:** discard to 7 unless Graceful Adept or Reliquary Tower is out.
- **Interaction** (counters, Beast Within, Kira, Kiri-Onna's bounce) has no goldfish target: held, discarded first, not judged in rankings. The moonfolk among it still count as land returners.
- **Patron of the Moon's offering** is used (sacrifices the least useful moonfolk). **Land lock** (`land_lock_win`): with lands as creatures, bouncing every opponent's land over and over counts as a win (Pontus); `--set land_lock_win=0` turns it off.
- **AI policy `aesi_first`:** the turn planner never passes up casting Aesi when he is affordable (moved late-Aesi games from 11.6% to 11.3%: noise, kept because it is Pontus's intent). Planner on: about +4 points win by turn 10.

## How the cards are played (`game.ts`)

- **Land drops:** 1, plus 1 each for Aesi, Loot, Case of the Locked Hothouse, Druid Class level 2; Azusa 2; this turn only Explore 1, Summer Bloom 3, Azusa's Many Journeys 1. **Land puts** (no drop): Atlas, Scout, PuPu, Budoka (flips at 10 lands), Patron's {1}, Kodama, Growth Spiral. With an untapper out a "put" creature goes first.
- **Lands:** Evolving Wilds, Terramorphic Expanse and Fabled Passage crack at once (two landfalls, basic tapped; Passage untapped with 4+ lands). Simic Growth Chamber and Guildless Commons return a land (themselves when that sets up a loop). Case (solved at 7 lands) plays lands and casts good creatures from the top. Myriad Landscape: {2}, sacrifice, two basics. Demolition Field counts as a 2-mana "fetch a basic".
- **Dual lands have their real conditions** (Pontus: never assume untapped): Hinterland Harbor tapped unless we control a Forest or Island; Botanical Sanctum unless two or fewer other lands (comes back tapped in loops from three lands); Vineglimmer Snarl unless a Forest or Island can be revealed; Yavimaya Coast deals 1 damage only when tapped for a colour (dealt only when a payment is made); Temple of Mystery tapped, scry 1; Command Tower untapped. This is now shared engine code (`Game.entersTapped`), the same for every deck.
- **Landfall:** Aesi and Tatyova draw; Lotus Cobra adds a mana; Druid Class gains 1; Khalni gets a counter (3: two basics); Retreat to Coralhelm and Elven Raft-Steerer untap a tapped "put" creature (if a land is in hand), then Dokai, then Loot (Retreat alone can scry 1); Kodama puts a permanent of equal or lower mana value from hand.
- **Moonfolk outside a loop** return a land and replay it for a landfall trigger when there is a spare drop or "put" creature (when the ability costs {1} after reducers, or in main 2). Meloku turns spare tapped lands into Illusions at the end of the turn.
- **Cost reducers:** Familiar and Training Grounds take {2} off, Heartstone {1}, never below one mana; this includes Dokai and Loot. **Omniscience:** spells from hand are free (X = 0).
- **Ramp and fetch spells:** fetch the basic we need most. Nature's Lore / Three Visits: a Forest untapped. Skyshroud Claim: two Forests untapped. Wood Elves: a Forest untapped on entering. Search for Tomorrow: suspend {G} (basic untapped at the second upkeep) or cast for {2}{G}. Nissa's Pilgrimage has spell mastery with 2 instants/sorceries in the graveyard. Entish Restoration gets 3 with a 4-power creature. Grow from the Ashes is kicked when affordable. Fertile Footsteps, then Beanstalk Giant. Early Harvest when it pays for something big. Sylvan Scrying, Expedition Map and Crop Rotation get the Chamber when a loop is one land short, else the land with the most landfall.
- **Uyo outside a loop** copies ramp and draw spells (returning two lands that are replayed; Harrow's copy sacrifices nothing). Blue Sun's Zenith draws for us in main 2 (X ≥ 2).
- **Lands as creatures** (Nature's Revolt, Natural Affinity, Sylvan Awakening; not in the lists): a land that entered this turn is summoning sick and can't tap, so Revolt and Affinity break the loops that pay with replayed lands (they work again with Cobra, or Retreat untapping an older land); Awakening gives haste. Our lands attack only when lethal. These tested as resilience only: they never added wins in a goldfish game.

## The loop solver

A loop needs a way to **replay** a land (Retreat or Raft-Steerer untapping a "put" creature that isn't summoning sick; Kodama + Meloku) and a way to **return** it (Chamber; any moonfolk at its cost after reducers; Savant's counter isn't used).

Mana per loop = lands returned × (1, +1 with Cobra) + 1 for Breezecaller's untap − the ability's cost. 0 or more: endless landfall, endless uses of that ability, endless draws with Aesi or Tatyova. More than 0: endless mana too (then every moonfolk is a returner). Omniscience + Kiri-Onna + Haru-Onna (one in hand) gives endless draws.

The solver repeats until nothing changes: draw down to 5 → put every land in hand down → cast what helps (reducers, Cobra, the untapper, Kodama, Meloku, Mindsweeper, Uyo; free permanents with Omniscience, not the Onnas), keeping the loop's mana in reserve → look for a win: a Mindsweeper loop; Uyo copying Blue Sun's Zenith (X = 1, 4 mana); endless mana + Zenith with endless draws. Otherwise a next-turn win: Illusion army, or Uyo copying Endless Swarm / Eternal Dominion.

How games win (300 traced): Mindsweeper loop about half; endless mana + Zenith about 40%; Uyo + Zenith about 9%; Illusion army about 2%. The loop that starts it is most often Kodama + Meloku with Aesi, then Omniscience + Onnas, then an untapper + putter + Meloku / Mirror-Mage / Breezecaller.

## Consistency measures

Pontus: the deck should be consistently playable, not a useless spectator. `npm run sim -- aesi <lists> --diag -n 16000` compares lists on the same seeds:
- win by turn 10 / 12, no win by turn 14, the slow tail (turn the 90th-percentile game wins);
- **slow start** (Pontus): less than 60% of the mana of one land per turn spent, i.e. under 9 mana by turn 5 or under 13 by turn 6 (a game already won doesn't count);
- Aesi: average turn he comes down, share of still-running games without him at the end of turn 5 / 6 / 7; the turn of his first landfall draw;
- lands on turn 5, 5 lands or fewer after turn 6.

**Noise:** a different list order deals different hands, so lists are not paired. The same cards in another order differed by 2.4 points at 4,000 games and by under 1 at 16,000. Use 16,000 for any decision.

## Current state

`lists/package.txt` (100 cards, 39 lands, about 4.8 € of new cards) against `decklist.txt`:
- **Out:** Explore, Growth Spiral, Into the Wilds, Azusa's Many Journeys (cards that are sad without lands in hand; Pontus: a land-only hand is as bad as a spell-only one).
- **In:** Search for Tomorrow 0.16 €, Wood Elves 0.06 €, Skyshroud Claim 1.36 € (land-fetch spells that never miss); Elven Raft-Steerer 0.11 € (a second untapper); six duals instead of 3 Islands + 3 Forests: Command Tower 0.20 €, Vineglimmer Snarl 0.22 €, Hinterland Harbor 0.35 €, Yavimaya Coast 0.52 €, Botanical Sanctum 1.64 €, Temple of Mystery 0.14 €. Prices vary by printing.
- Nature's Lore (about 2.90 €) and Three Visits (about 4.89 €) play like Search for Tomorrow's land and tested the same. Pontus: Nature's Lore "works, not the most fun".

| 16,000 games | decklist.txt | Many Journeys kept | package |
|---|---|---|---|
| Win by turn 10 / 12 | 81.8 / 95.5% | 84.5 / 96.9% | **86.1 / 97.4%** |
| No win by turn 14 | 1.3% | 0.6% | 0.65% |
| Slow start | 12.7% | 10.4% | **9.7%** |
| No Aesi by turn 5 / 6 / 7 | 35.9 / 18.5 / 10.8% | 32.4 / 16.0 / 8.8% | **31.7 / 14.7 / 7.7%** |

Four other mixes of the fetch spells tested the same within noise, so the cheap set was picked. Keeping Many Journeys instead of Skyshroud Claim costs about 0.7 points of slow starts and 1.6 of win by turn 10.

**What the swap tests showed (4,000 games each; the evidence behind the list):**
- **Why slow starts happen:** no Forest by turn 4 in 7% of games, and 80% of those are slow starts (about 43% of all slow starts): nearly all the ramp costs {G}. Seeing Sol Ring, Sakura-Tribe Elder, Nissa's Pilgrimage, the Chamber, Demolition Field or Beanstalk Giant early helps most; clogging combo pieces (Uyo, Kodama, Omniscience, Dominion, Swarm) go with more slow starts. The rest are land-light draws no swap removes. The sim keeps any 7 with 2–5 lands, looser than a real keep, so real slow starts are probably fewer.
- **Aesi late (the 11% with no Aesi after turn 7):** about 72% have 5 or fewer mana sources, nearly all with no land in hand; the rest reach 6 mana only on that turn. With the planner off Aesi comes down earlier (turn 5.2) but the deck wins less (77% by turn 10): the planner prefers lands and mana.
- **Land-drop cards** (Explore, Summer Bloom, Many Journeys, Druid Class, Into the Wilds): each swapped for a Forest is slightly better, all five together much better (44 lands: win by turn 10 +6, slow start −3.8). That overstates it (flooding isn't counted), hence land-fetch spells instead of lands.
- **Raft-Steerer and Tatyova** win faster (+2.5 / +3.7 by turn 10, replacing Into the Wilds) but cost 3–5 mana, so they don't reduce slow starts. Raft-Steerer was added as a second untapper (the combos are found more reliably). Tatyova was left out (a second engine).
- **Utility lands** (Guildless Commons, Myriad Landscape, Fabled Passage) for basics are free: about the same or slightly better. **Land tutors** (Sylvan Scrying, Expedition Map, Crop Rotation) cost about a basic's worth: most loops start with Kodama + Meloku or the Onnas.
- **Excluded by Pontus:** mana rocks (they don't fit the land theme), more engine pieces, land lock as a plan.

## Pontus's game 1 (`logs/game1_t10_bsz_mill.txt`)

Won on turn 10: Omniscience + Onnas → Cobra, Retreat, Atlas, Uyo → endless mana → Blue Sun's Zenith copied about 25 times. The analyzer finds the first kill right after Omniscience on turn 10; the AI with the same draws wins on turn 10 in 84% of runs (turn 9: 1%), so the real game was on par. Probably off in the log: Terramorphic's Forest should enter tapped (T3); no Aesi draw after Budoka's Island (T8); Dokai's and Loot's abilities cost 4 with Familiar, not 6, and four land plays with three drops (T9); on T10 the Mindsweeper loop mills everyone without Zenith, and the Onna loop can be shortcut.

## Opening hands (`--hands`, 8,000 hands of `lists/package.txt`; the basis of the MULLIGANS section in `PRIMER.txt`)

Average win turn by lands in the 7: 0 lands 11.3, 1 land 10.1, 2 lands 9.1, 3 lands 8.6, 4 lands 8.4, 5 lands 8.3, 6 lands 8.8 (a fresh 7 averages 9.0, a mulligan to 6 9.3). A green source is worth about 1.1 turns. A 2-lander is only worth keeping with a green source and a cheap ramp piece (8.5). Best cards in the opening 7: Sol Ring (+1.4), Lotus Cobra (+0.9), Walking Atlas, Cultivate, Sakura-Tribe Scout, PuPu UFO (+0.4–0.5). Expensive blue creatures (Kiri-Onna, Patron, Mirror-Mage, Mindsweeper) are a drag in the opening 7 (−0.5).

**Mulligan rule** (`mulligan.ts`): keep 3–6 lands with a green source, or 2 lands with green and a cheap ramp piece; after the free mulligan 2–6 lands with green; always keep at 5. 12,000 games of the package list: win by turn 8 / 10 / 12 51.5 / 89.3 / 98.7% against 48.7 / 86.6 / 97.5% for "keep 2–5 lands" (average turn 8.51 against 8.64). Two simpler versions were worse or equal: keeping 2-landers with only green (88.0% by turn 10) and never keeping 2-landers on the first 7 (89.2%).

## Open

- **Pontus decides:** make `lists/package.txt` the default `decklist.txt` (then re-record the regress baseline); Many Journeys out or kept; Search for Tomorrow or Nature's Lore / Three Visits; which duals he already owns.
- **Not modelled yet:** Haru-Onna returning when a Spirit is cast without Omniscience; Familiar's adapt ability; PuPu UFO's Town ability; Likeness of the Seeker's untap.
- **To check:** the low-ranked cards (Mirror-Mage, Savant, Patron of the Moon, Uyo, Endless Swarm, Graceful Adept): is the AI playing them well, or are they weak in a goldfish game? The old ranking predates the package.
- More logs (the sim rarely wins via Uyo or Endless Swarm, so games that do would help), then further cut ideas.
- Housekeeping: `lists/` holds about 30 test lists from the swap tests; keep `package.txt`, `decklist.txt` and whichever Pontus wants.
