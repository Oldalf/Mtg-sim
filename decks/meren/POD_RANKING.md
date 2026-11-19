# Meren: pod ranking of the cards (2026-11-19)

Meren with Skullclamp, Deadly Dispute and Greater Good in for Garruk's Packleader, Morbid Opportunist and Unearth, in the pod `npm run pod -- meren:<list> helga edgar teval -n 16000 --rank` (16,000 games per list, same seeds; the other three decks at their home lists). "Better" = Meren's pod win rate in the games where it had seen the card by the end of its fourth turn (in hand, on the battlefield, or in the graveyard), minus the games where it had not. Noise: about ±1 point per card at 16,000 games per list (a bit less for both lists together). It shows correlation, not proof, and it is biased: a card seen by turn 4 is also a game with more mana or a better draw, held removal and cards that are drawn late look worse than they are, and "seen" counts a card whatever it did. Basic lands are left out (Swamp and Forest: the games without one are mana-screwed games).

## List 1: decklist.txt (the original) with the three swaps

The original list, with the Witnesses, Solemn, Songs of the Damned and Puppeteer Clique.

| Card | Better (points) | Win with | Win without | Seen by T4 |
|---|---|---|---|---|
| Spore Frog | +12.6 | 36.6% | 23.9% | 12% |
| Sol Ring | +12.2 | 36.2% | 24.0% | 12% |
| Sakura-Tribe Elder | +8.5 | 32.9% | 24.4% | 12% |
| Grist, the Hunger Tide | +7.8 | 32.4% | 24.5% | 12% |
| Twilight Diviner | +7.4 | 32.0% | 24.5% | 12% |
| Protean Hulk | +6.5 | 31.2% | 24.7% | 12% |
| Saw in Half | +5.6 | 30.4% | 24.8% | 11% |
| Llanowar Elves | +5.2 | 30.0% | 24.9% | 11% |
| Wight of the Reliquary | +4.7 | 29.6% | 24.9% | 12% |
| Satyr Wayfinder | +4.6 | 29.5% | 24.9% | 12% |
| Liliana the Repentant | +4.6 | 29.5% | 24.9% | 12% |
| Fauna Shaman | +4.2 | 29.1% | 24.9% | 12% |
| Accursed Marauder | +4.2 | 29.1% | 25.0% | 12% |
| Simulacrum Shaper | +4.1 | 29.1% | 25.0% | 12% |
| Gray Merchant of Asphodel | +4.0 | 28.7% | 24.7% | 18% |
| Studious First-Year | +3.6 | 28.6% | 25.0% | 12% |
| Avenger of the Fallen | +3.2 | 28.2% | 25.1% | 11% |
| Vile Entomber | +3.0 | 28.1% | 25.1% | 13% |
| Twilight Mire | +2.9 | 28.0% | 25.0% | 14% |
| Grisly Salvage | +2.8 | 27.9% | 25.1% | 11% |
| Command Tower | +2.6 | 27.6% | 25.1% | 14% |
| Eldritch Evolution | +2.1 | 27.3% | 25.2% | 12% |
| Woe Strider | +1.8 | 27.0% | 25.2% | 12% |
| Exotic Orchard | +1.8 | 26.9% | 25.2% | 15% |
| Buried Alive | +1.7 | 27.0% | 25.2% | 12% |
| Grave Titan | +1.7 | 26.9% | 25.2% | 13% |
| Insidious Fungus | +1.6 | 26.9% | 25.3% | 11% |
| Umbral Collar Zealot | +1.2 | 26.5% | 25.3% | 13% |
| Viscera Seer | +1.2 | 26.4% | 25.2% | 18% |
| Llanowar Wastes | +1.2 | 26.4% | 25.3% | 14% |
| Vernal Fen | +1.1 | 26.4% | 25.3% | 14% |
| Tainted Wood | +1.1 | 26.4% | 25.3% | 15% |
| Persist | +0.5 | 25.9% | 25.4% | 12% |
| Woodland Cemetery | +0.5 | 25.9% | 25.4% | 14% |
| Breach the Multiverse | +0.4 | 25.8% | 25.4% | 11% |
| Mosswort Bridge | +0.3 | 25.7% | 25.4% | 14% |
| Diresight | +0.3 | 25.7% | 25.4% | 11% |
| Victimize | +0.3 | 25.7% | 25.4% | 11% |
| Dark Ritual | +0.3 | 25.7% | 25.4% | 12% |
| Necroblossom Snarl | +0.3 | 25.7% | 25.4% | 14% |
| Priest of Forgotten Gods | +0.2 | 25.7% | 25.4% | 12% |
| Shriekmaw | +0.0 | 25.5% | 25.4% | 11% |
| Deadly Dispute | -0.1 | 25.3% | 25.5% | 11% |
| Bojuka Bog | -0.5 | 25.0% | 25.5% | 13% |
| Village Rites | -0.5 | 25.0% | 25.5% | 11% |
| Blooming Marsh | -0.6 | 24.9% | 25.5% | 14% |
| Disciple of Bolas | -0.8 | 24.7% | 25.5% | 11% |
| Greater Good | -0.9 | 24.7% | 25.6% | 12% |
| Grave Researcher | -1.0 | 24.6% | 25.6% | 12% |
| Sepulchral Primordial | -1.0 | 24.6% | 25.6% | 15% |
| Lotleth Giant | -1.2 | 24.4% | 25.6% | 14% |
| Dina's Guidance | -1.2 | 24.4% | 25.6% | 11% |
| Decode Transmissions | -1.3 | 24.3% | 25.6% | 12% |
| Junji, the Midnight Sky | -1.4 | 24.2% | 25.6% | 11% |
| Puppeteer Clique | -1.5 | 24.1% | 25.6% | 12% |
| Phyrexian Arena | -1.5 | 24.1% | 25.6% | 11% |
| Songs of the Damned | -1.7 | 24.0% | 25.6% | 11% |
| Demon's Disciple | -1.7 | 23.9% | 25.6% | 11% |
| Rune-Scarred Demon | -2.0 | 23.7% | 25.7% | 12% |
| Plaguecrafter | -2.0 | 23.6% | 25.7% | 11% |
| Butcher of Malakir | -2.3 | 23.4% | 25.7% | 12% |
| Solemn Simulacrum | -3.1 | 22.8% | 25.8% | 13% |
| Deadly Brew | -3.6 | 22.3% | 25.9% | 11% |
| Skullclamp | -3.6 | 22.2% | 25.8% | 11% |
| Vindictive Lich | -3.7 | 22.1% | 25.9% | 12% |
| Grim Haruspex | -3.8 | 22.1% | 25.9% | 12% |
| Grim Servant | -4.2 | 21.8% | 25.9% | 12% |
| Vampiric Rites | -4.6 | 21.4% | 26.0% | 12% |
| Timeless Witness | -5.1 | 20.9% | 26.0% | 11% |
| Eternal Witness | -6.9 | 19.3% | 26.2% | 12% |
| Heartless Act | -7.9 | 18.4% | 26.3% | 11% |
| Infernal Grasp | -10.3 | 16.3% | 26.6% | 11% |
| Beast Within | -14.4 | 12.7% | 27.1% | 12% |

## List 2: lists/proposed.txt with the three swaps

The proposed list (Carrion Feeder, Stitcher's Supplier, Wood Elves, Ophiomancer and Skull Prophet in).

| Card | Better (points) | Win with | Win without | Seen by T4 |
|---|---|---|---|---|
| Spore Frog | +13.2 | 42.5% | 29.4% | 12% |
| Sol Ring | +11.5 | 41.1% | 29.6% | 12% |
| Sakura-Tribe Elder | +7.9 | 37.9% | 30.0% | 13% |
| Twilight Diviner | +6.9 | 37.1% | 30.1% | 13% |
| Grist, the Hunger Tide | +6.5 | 36.7% | 30.2% | 12% |
| Protean Hulk | +5.9 | 36.3% | 30.3% | 11% |
| Stitcher's Supplier | +5.9 | 36.2% | 30.3% | 12% |
| Ophiomancer | +5.6 | 35.9% | 30.3% | 12% |
| Vile Entomber | +5.6 | 35.9% | 30.3% | 12% |
| Gray Merchant of Asphodel | +5.1 | 35.2% | 30.1% | 18% |
| Accursed Marauder | +5.1 | 35.5% | 30.4% | 12% |
| Llanowar Elves | +5.0 | 35.4% | 30.4% | 12% |
| Liliana the Repentant | +4.8 | 35.2% | 30.4% | 12% |
| Wight of the Reliquary | +4.8 | 35.2% | 30.4% | 12% |
| Twilight Mire | +4.6 | 35.0% | 30.3% | 14% |
| Saw in Half | +3.8 | 34.4% | 30.6% | 12% |
| Simulacrum Shaper | +3.3 | 33.9% | 30.6% | 12% |
| Command Tower | +3.1 | 33.6% | 30.6% | 15% |
| Avenger of the Fallen | +2.7 | 33.4% | 30.7% | 12% |
| Priest of Forgotten Gods | +2.7 | 33.4% | 30.7% | 13% |
| Eldritch Evolution | +2.7 | 33.4% | 30.7% | 12% |
| Exotic Orchard | +2.2 | 32.9% | 30.7% | 16% |
| Necroblossom Snarl | +2.2 | 32.9% | 30.7% | 15% |
| Carrion Feeder | +2.1 | 32.9% | 30.7% | 12% |
| Buried Alive | +2.1 | 32.8% | 30.8% | 12% |
| Satyr Wayfinder | +2.0 | 32.8% | 30.8% | 12% |
| Tainted Wood | +2.0 | 32.7% | 30.7% | 15% |
| Vernal Fen | +2.0 | 32.7% | 30.7% | 15% |
| Grisly Salvage | +1.9 | 32.7% | 30.8% | 12% |
| Woe Strider | +1.8 | 32.6% | 30.8% | 12% |
| Woodland Cemetery | +1.7 | 32.4% | 30.8% | 15% |
| Breach the Multiverse | +1.5 | 32.4% | 30.8% | 12% |
| Skull Prophet | +1.5 | 32.3% | 30.8% | 13% |
| Fauna Shaman | +1.4 | 32.2% | 30.8% | 13% |
| Deadly Dispute | +1.0 | 31.9% | 30.9% | 12% |
| Blooming Marsh | +0.9 | 31.8% | 30.9% | 15% |
| Insidious Fungus | +0.9 | 31.8% | 30.9% | 12% |
| Dina's Guidance | +0.8 | 31.8% | 30.9% | 12% |
| Grave Titan | +0.7 | 31.6% | 30.9% | 13% |
| Viscera Seer | +0.6 | 31.5% | 30.9% | 18% |
| Umbral Collar Zealot | +0.5 | 31.5% | 30.9% | 12% |
| Diresight | +0.5 | 31.4% | 31.0% | 12% |
| Llanowar Wastes | +0.4 | 31.3% | 31.0% | 14% |
| Shriekmaw | +0.3 | 31.3% | 31.0% | 12% |
| Studious First-Year | +0.1 | 31.1% | 31.0% | 12% |
| Village Rites | -0.3 | 30.7% | 31.0% | 12% |
| Grave Researcher | -0.4 | 30.7% | 31.1% | 12% |
| Skullclamp | -0.5 | 30.6% | 31.1% | 12% |
| Wood Elves | -0.5 | 30.5% | 31.1% | 11% |
| Lotleth Giant | -0.6 | 30.5% | 31.1% | 15% |
| Victimize | -0.6 | 30.5% | 31.1% | 12% |
| Persist | -0.7 | 30.4% | 31.1% | 12% |
| Bojuka Bog | -0.8 | 30.3% | 31.1% | 13% |
| Sepulchral Primordial | -0.9 | 30.2% | 31.1% | 15% |
| Mosswort Bridge | -1.0 | 30.2% | 31.2% | 15% |
| Phyrexian Arena | -1.8 | 29.4% | 31.2% | 12% |
| Demon's Disciple | -1.8 | 29.4% | 31.2% | 12% |
| Greater Good | -2.3 | 29.0% | 31.3% | 12% |
| Butcher of Malakir | -2.5 | 28.8% | 31.3% | 13% |
| Dark Ritual | -2.5 | 28.8% | 31.3% | 12% |
| Plaguecrafter | -2.6 | 28.7% | 31.3% | 12% |
| Decode Transmissions | -2.7 | 28.7% | 31.3% | 12% |
| Junji, the Midnight Sky | -2.9 | 28.5% | 31.4% | 12% |
| Rune-Scarred Demon | -3.2 | 28.2% | 31.4% | 12% |
| Vampiric Rites | -3.3 | 28.1% | 31.4% | 12% |
| Grim Haruspex | -3.4 | 28.0% | 31.4% | 12% |
| Disciple of Bolas | -3.6 | 27.8% | 31.4% | 12% |
| Deadly Brew | -4.2 | 27.3% | 31.5% | 12% |
| Vindictive Lich | -4.4 | 27.1% | 31.6% | 12% |
| Grim Servant | -6.3 | 25.5% | 31.8% | 12% |
| Heartless Act | -13.4 | 19.2% | 32.6% | 12% |
| Infernal Grasp | -13.6 | 19.0% | 32.5% | 11% |
| Beast Within | -14.6 | 18.1% | 32.7% | 12% |

## Both lists together

The games of both lists added up; a card in only one list is marked.

| Card | Better (points) | Win with | Win without | Seen by T4 |
|---|---|---|---|---|
| Spore Frog | +13.0 | 39.6% | 26.7% | 12% |
| Sol Ring | +11.9 | 38.7% | 26.8% | 12% |
| Sakura-Tribe Elder | +8.2 | 35.4% | 27.2% | 12% |
| Twilight Diviner | +7.2 | 34.6% | 27.3% | 12% |
| Grist, the Hunger Tide | +7.2 | 34.6% | 27.4% | 12% |
| Protean Hulk | +6.2 | 33.7% | 27.5% | 12% |
| Stitcher's Supplier (one list) | +5.9 | 36.2% | 30.3% | 12% |
| Ophiomancer (one list) | +5.6 | 35.9% | 30.3% | 12% |
| Llanowar Elves | +5.2 | 32.8% | 27.6% | 12% |
| Wight of the Reliquary | +4.8 | 32.5% | 27.7% | 12% |
| Saw in Half | +4.8 | 32.4% | 27.7% | 12% |
| Liliana the Repentant | +4.8 | 32.4% | 27.6% | 12% |
| Accursed Marauder | +4.7 | 32.4% | 27.7% | 12% |
| Gray Merchant of Asphodel | +4.6 | 31.9% | 27.4% | 18% |
| Vile Entomber | +4.3 | 32.0% | 27.7% | 12% |
| Twilight Mire | +3.8 | 31.5% | 27.7% | 14% |
| Simulacrum Shaper | +3.8 | 31.6% | 27.8% | 12% |
| Satyr Wayfinder | +3.4 | 31.2% | 27.8% | 12% |
| Avenger of the Fallen | +3.1 | 30.9% | 27.9% | 12% |
| Fauna Shaman | +2.9 | 30.8% | 27.9% | 13% |
| Command Tower | +2.9 | 30.7% | 27.8% | 14% |
| Grisly Salvage | +2.5 | 30.4% | 27.9% | 11% |
| Eldritch Evolution | +2.4 | 30.3% | 27.9% | 12% |
| Carrion Feeder (one list) | +2.1 | 32.9% | 30.7% | 12% |
| Exotic Orchard | +2.0 | 29.9% | 27.9% | 15% |
| Buried Alive | +2.0 | 30.0% | 28.0% | 12% |
| Woe Strider | +1.9 | 29.9% | 28.0% | 12% |
| Studious First-Year | +1.8 | 29.8% | 28.0% | 12% |
| Vernal Fen | +1.6 | 29.6% | 28.0% | 15% |
| Tainted Wood | +1.6 | 29.6% | 28.0% | 15% |
| Priest of Forgotten Gods | +1.6 | 29.6% | 28.0% | 12% |
| Skull Prophet (one list) | +1.5 | 32.3% | 30.8% | 13% |
| Necroblossom Snarl | +1.3 | 29.3% | 28.0% | 15% |
| Insidious Fungus | +1.3 | 29.4% | 28.1% | 12% |
| Grave Titan | +1.2 | 29.3% | 28.1% | 13% |
| Woodland Cemetery | +1.2 | 29.2% | 28.1% | 15% |
| Breach the Multiverse | +1.1 | 29.2% | 28.1% | 12% |
| Viscera Seer | +0.9 | 29.0% | 28.1% | 18% |
| Umbral Collar Zealot | +0.8 | 29.0% | 28.1% | 12% |
| Llanowar Wastes | +0.8 | 28.9% | 28.1% | 14% |
| Diresight | +0.5 | 28.7% | 28.2% | 11% |
| Deadly Dispute | +0.5 | 28.7% | 28.2% | 12% |
| Shriekmaw | +0.3 | 28.5% | 28.2% | 12% |
| Blooming Marsh | +0.2 | 28.4% | 28.2% | 15% |
| Dina's Guidance | -0.0 | 28.2% | 28.2% | 12% |
| Persist | -0.0 | 28.2% | 28.2% | 12% |
| Victimize | -0.1 | 28.2% | 28.2% | 12% |
| Mosswort Bridge | -0.3 | 28.0% | 28.3% | 15% |
| Village Rites | -0.3 | 28.0% | 28.3% | 12% |
| Wood Elves (one list) | -0.5 | 30.5% | 31.1% | 11% |
| Grave Researcher | -0.6 | 27.7% | 28.3% | 12% |
| Bojuka Bog | -0.6 | 27.7% | 28.3% | 13% |
| Lotleth Giant | -0.7 | 27.6% | 28.3% | 14% |
| Sepulchral Primordial | -1.0 | 27.4% | 28.4% | 15% |
| Dark Ritual | -1.0 | 27.3% | 28.4% | 12% |
| Puppeteer Clique (one list) | -1.5 | 24.1% | 25.6% | 12% |
| Greater Good | -1.5 | 26.9% | 28.4% | 12% |
| Phyrexian Arena | -1.6 | 26.8% | 28.4% | 11% |
| Songs of the Damned (one list) | -1.7 | 24.0% | 25.6% | 11% |
| Demon's Disciple | -1.7 | 26.7% | 28.4% | 12% |
| Decode Transmissions | -1.9 | 26.6% | 28.5% | 12% |
| Skullclamp | -1.9 | 26.5% | 28.4% | 11% |
| Junji, the Midnight Sky | -2.1 | 26.4% | 28.5% | 12% |
| Disciple of Bolas | -2.2 | 26.3% | 28.5% | 12% |
| Plaguecrafter | -2.2 | 26.3% | 28.5% | 12% |
| Butcher of Malakir | -2.2 | 26.3% | 28.5% | 12% |
| Rune-Scarred Demon | -2.6 | 26.0% | 28.5% | 12% |
| Solemn Simulacrum (one list) | -3.1 | 22.8% | 25.8% | 13% |
| Grim Haruspex | -3.5 | 25.1% | 28.7% | 12% |
| Deadly Brew | -3.9 | 24.8% | 28.7% | 12% |
| Vampiric Rites | -3.9 | 24.8% | 28.7% | 12% |
| Vindictive Lich | -4.0 | 24.7% | 28.7% | 12% |
| Timeless Witness (one list) | -5.1 | 20.9% | 26.0% | 11% |
| Grim Servant | -5.2 | 23.6% | 28.9% | 12% |
| Eternal Witness (one list) | -6.9 | 19.3% | 26.2% | 12% |
| Heartless Act | -10.6 | 18.8% | 29.4% | 11% |
| Infernal Grasp | -11.9 | 17.7% | 29.6% | 11% |
| Beast Within | -14.5 | 15.4% | 29.9% | 12% |

