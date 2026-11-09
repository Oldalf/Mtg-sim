# Mike (Vnwxt, Verbose Host): deck plan

Mono-blue card draw, bracket 2–3. "Mike" is the nickname (Mike Wazowski: one eye, tiny, with 20+ cards in hand). Run it with `npm run sim -- mike` (see the root README). Engine notes: the root `PLAN.md`; phases: the root `ROADMAP.md` (this is phase 4).

- **Lists:** `decklist.txt` is the list as Pontus first gave it (2026-11-09). The other files in `lists/` are test lists. `logs/` holds his real games.
- **Pontus's goals:** a fun, consistent deck that protects itself and has answers, but isn't oppressive; win around turn 10–11 on average. The draw plan is a gimmick first (a tiny creature holding 20+ cards), the win conditions second.

## How the deck wins (Pontus)

- **Mill yourself:** draw the whole library with Laboratory Maniac (or Jace, Wielder of Mysteries) on the battlefield. Living Conundrum and Ormos are the safety: if you draw too much without a win card (or it gets removed) they stop you from losing.
- **Twenty-Toed Toad:** when it attacks, you win with 20+ cards in hand (or 20 counters).
- **Psychosis Crawler:** every card drawn costs each opponent 1 life. Krang doubles it, Aurora Shifter can copy it.
- **A big swing:** Ominous Seas makes 8/8 Krakens; Hand of Vecna (and Nerd Rage at 10+ cards) turn a creature into a giant; Clinquant Skymage and Oneirophage grow with every draw. Flyers and unblockable creatures are meant to connect.
- **Speed:** Vnwxt is "Start your engines": speed rises once per turn of yours when an opponent loses life, to 4. At max speed every draw is doubled. Teferi's Ageless Insight doubles every draw but the first of the draw step.

## Simulation rules (agreed 2026-11-09)

- 3 goldfish opponents at 40 life, 92-card libraries, no interaction. Opponents' cards in logs are ignored. The simulator never plays on opponents' turns (instant-speed value, such as Spectral Sailor's flash, isn't counted).
- **Win:** any of — the mill (a draw from an empty library with Maniac or Jace on the battlefield), the Toad attacking with 20+ cards in hand or 20 counters, or all three opponents at 0 life. Second measure: first opponent dead.
- **Drawing:** Vnwxt at max speed ("draw two instead") and Teferi stack: one effect draw gives 4 cards with both, the draw step gives 3. Every card actually drawn triggers the payoffs (Crawler, Seas, Skymage, Oneirophage, Wizard Class level 3), twice with Krang. The second card each turn makes a Spawn (Messenger) or Faerie (Mystic) and a counter on Krang.
- **Drawing from an empty library:** win (Maniac / Jace) first, then Ormos (five counters), then Living Conundrum (skip), else we lose.
- **Safety rule for the AI:** without a win piece, Conundrum or Ormos on the battlefield, it stops drawing with 3 cards left in the library (`keep_library`). With one of them it may draw everything.
- **Speed:** an opponent only loses life from our own damage and drains (an attack by an unblockable or flying creature, Crawler). `--set speed_free=1` pretends an opponent loses life on every turn of ours (a real table does this more often).
- **Combat (as for Meren):** flyers and unblockable creatures always connect; half the ground attackers are blocked; crackback unless creatures stay home. Unblockable: Shoreline Looter, Looter il-Kor (shadow), Invisible Stalker, Slither Blade, Gingerbrute, anything with Aqueous Form, Rogue's Passage's target.
- **Mulligans:** the first is free (a new 7), then London. The rule is in `mulligan.ts`.
- Interaction (counterspells, bounce and removal) is held and never cast; the cards stay in hand and count for the Toad's twenty. Judge them separately.

## How the AI plays

- Turn planner (as for the other decks): it tries its best 4 plays on copies of the game and keeps the best, scored by `positionValue` (damage dealt, speed, mana, hand size, board, the mill's progress when it is safe, Ominous Seas counters).
- Laboratory Maniac / Jace: cast as soon as convenient (`maniac_early=1`), or only when the library is down to 14 cards (`maniac_early=0`, `maniac_at`).
- Aurora Shifter becomes a copy of the best non-legendary creature when it has two energy (Crawler first); Jace +1 mills us when the mill is safe.

(Results, rankings and open questions follow in the sections below.)

## Results (`decklist.txt`, 16,000 games, planner on)

Win by turn 9 / 10 / 11 / 12 / 14: **about 59.5 / 83 / 94 / 98 / 99.7%**; the 90th-percentile game wins on turn 11. Vnwxt comes down on turn 2.05 on average, and max speed is reached by turn 8 in 97% of games. We never deck ourselves (0.0%).

How the games are won: Toad about 35%, damage (Krakens, Hand of Vecna, Crawler, flyers) about 51%, mill about 14%. With a counterspell in hand and two mana untapped at the win: about 85%.

Sensitivity (8,000 games, win by turn 9 / 10 / 11):
| Setting | Result |
|---|---|
| default | 59.6 / 83.3 / 94.5 |
| old mulligan rule (keep 2–5 lands) | 58.1 / 82.6 / 94.1 (the deck's rule is +1.5 by turn 9, within noise) |
| Maniac / Jace only when the library is at 14 or less (`maniac_early=0`) | 54.2 / 79.4 / 92.6; mill wins 6% instead of 14% |
| planner off | 43.0 / 70.5 / 87.8 (the planner is worth about 16 points by turn 10) |
| `speed_free=1` (an opponent loses life every turn of ours) | 74.3 / 91.8 / 98.0 |

So the simulator's AI is about a turn faster than the turn 10–11 Pontus expects. His game 1 (a human with a draw-heavy start and some slow choices) was won on turn 11–12.

## Pontus's game 1 (`logs/game1_t11_mill.txt`)

Drew the entire library on turn 11 (Slick Imitator copying a big Pull from Tomorrow at max speed, with Living Conundrum on the battlefield), with Laboratory Maniac still in hand, so the win comes on the next draw. Speed reached 4 on turn 5. Ominous Seas made a Kraken on turn 9. Aurora Shifter became a Psychosis Crawler copy (his marker). The analyzer reads the speed and energy trackers ("Start Your Engines! // Max Speed", "Energy Reserve"), the Lore counters (Hand of Vecna on Vnwxt), Spawn, Kraken and Faerie tokens. There is no kill finder for the analyzer (the AI replay is what it gives): with his draws in his order the AI doesn't win before turn 10, because Toad, Crawler and Jace sit deep in that order. Jace never appears in that log.

## Card ranking (6,000 games, seen by turn 4; correlation, not proof)

- **Best:** Twenty-Toed Toad (1.0 turns sooner), Psychosis Crawler, Loyal Drake, Harmonized Trio, Teferi's Ageless Insight, Sol Ring, Jace, Shoreline Looter, Looter il-Kor, Spectral Sailor, Gingerbrute.
- **Worst (draw-section cards in bold):** Pensive Professor, Thought Vessel, **Shielded Aether Thief**, Living Conundrum (it is protection; only used as the safety net), Aqueous Form, Ominous Seas (it helps late, not early), Hand of Vecna, **Wizard Class**, Slick Imitator.
- Removal and counterspells aren't judged (nothing to target in a goldfish game).

## Fblthp, Impossibly Lost (8,000 games each, in place of a weak draw card)

Pontus is considering it for more card draw. Swapped for each of seven draw cards: win by turn 9 / 10 vs the original 57.8 / 82.6:
- Shielded Aether Thief +2.2 / +1.7; Roil Cartographer +2.0 / +1.5; Strix Lookout +1.7 / +1.2; Wizard Class +1.6 / +0.8; Consider +0.6 / +0.4; Tune the Narrative −0.1 / −0.1; Treasure Cruise −0.8 / 0.0.
- All within noise (about ±2), so Fblthp is roughly neutral to slightly positive: it is best in place of Shielded Aether Thief or Roil Cartographer. Test lists: `lists/fblthp_for_*.txt`.

## Not modelled / open

- Thunderclap Drake's sacrifice (copy the next instant or sorcery once per time the commander was cast), Atomic Microsizer's trigger, Amonkhet Raceway's haste, Castle Vantress's scry, The Water Crystal's mill, Folio of Fancies's opponents drawing too, Pensive Professor's increment, Body of Knowledge's damage draw, Volatile Stormdrake's exchange (no creature to take in a goldfish game), Harmonized Trio's prepared state (modelled as: tap Trio and two creatures, cast a copy of Brainstorm for {U}).
- Interaction is held and never cast. Judge counterspells and bounce yourself.
- Whether Laboratory Maniac / Jace should be held until the library is low (safer against removal, about 4 points slower here).
- Mulligan rule is in `mulligan.ts`; cut ideas from Pontus: none yet (no cut tests before he names them).
