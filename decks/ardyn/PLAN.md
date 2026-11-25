# Ardyn, the Usurper (Friend 3's deck): deck plan

Mono-black Demons, bracket 3 (Friend 3 mostly plays bracket 2; this deck is his exception). A friend's deck, **pod-only** (Pontus, 2026-11-15). Run it with `npm run pod -- ardyn ...`.

## Files

- `cards.ts`: names, `VALUE`, `HOLD`, the Demon check (`isDemon`, on the engine's `hasCreatureType`). `game.ts`: `ArdynGame` (extends `CreatureDeckGame`): its choices (Demon for Roaming Throne, Urza's Incubator and Herald's Horn), Ardyn himself, Unholy Annex (both count Starscourge's copies as Demons) and the cards other decks code too (Gray Merchant, Rune-Scarred Demon, Disciple of Bolas, Indulgent Tormentor, Sheoldred, Bontu's Monument, Herald's Horn; U1b step 3). Every other card's rules are in `engine/card-rules/` (`cost-and-mana`, `life-loss`, `aristocrats`, `permanents`, `self-mill`). `candidates.ts`. `tests/ardyn.test.ts`.

## How the deck wins (Pontus, 2026-11-15)

Demon tribal: extra enter triggers (Roaming Throne), copied abilities and many value effects.

## Simulation rules

- Win: every opponent at 0 life. Second measure: first opponent dead. Combat: the engine's.
- **Ardyn:** Demons have haste and lifelink (menace is not modelled). Starscourge at each of our combats: the best creature card in our graveyard is exiled and becomes a 5/5 black Demon token copy, with its own enter trigger.
- **Roaming Throne** names Demon: each triggered ability of another Demon triggers twice (the engine's `triggerCount`, which every card-rules trigger runs through).
- **Mana:** Crypt Ghast and Nirkana Revenant (+{B} per Swamp), Gauntlet of Power (+{B} per basic Swamp, +1/+1), Caged Sun (+{B} per Swamp, +1/+1), Throne of Eldraine (four colourless). Cost reducers: Jet Medallion, Bontu's Monument, Heartless Summoning (and its -1/-1), Urza's Incubator and Herald's Horn (Demon), Ancient Cellarspawn.
- **Drains and life:** Gray Merchant, Bontu's Monument, Ancient Cellarspawn, Indulgent Tormentor (the opponent pays 3 life), Archfiend of Despair (each end step, each opponent loses again what it lost this turn), Unholy Annex, Bloodletter of Aclazotz (opponents lose twice as much), Exquisite Blood and Bloodthirsty Conqueror (we gain it), Vilis (we draw what we lose).
- **Cards:** Rune-Scarred and Burning-Rune Demon tutor, Demonlord Belzenlok, Bloodgift Demon, Harvester of Souls, Disciple of Bolas, Phyrexian Arena, Herald's Horn, Demonic Counsel, Solemn.
- **Reanimation:** the engine's spells (Reanimate, Animate Dead, Necromancy, Rise of the Dark Realms), Will of the Abzan (both modes with Ardyn out), Sheoldred, Whispering One at upkeep. Our graveyard only.
- Removal is held in a goldfish game; the pod uses it as answers.

## Not modelled

Menace; Cabal Coffers, Cabal Stronghold, Nykthos and Magus of the Coffers's extra mana (played as plain sources); The Soul Stone's ability; K'rrik paying life for {B}; Lord of the Void, Rakshasa Debaser, Reaper from the Abyss, Archfiend of Depravity, Sheoldred's edict, Sower of Discord, Valgavoth's exile, Varragoth, Blood Speaker, Liliana, Burnished Hart, Expedition Map, Taborax's card draw; Ritual Chamber; another player's graveyard (Reanimate, Rise of the Dark Realms and Starscourge only look at ours).

## First numbers (2026-11-15)

Goldfish, 2,000 games: win by turn 10 / 12 / 14: 31.1 / 71.0 / 90.4%, average turn 11.18. First opponent dead by turn 10: 85.7%.
