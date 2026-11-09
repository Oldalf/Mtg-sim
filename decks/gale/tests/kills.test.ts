/** Sanity checks: hand-built board states that must (or must not) be a kill. Run: npm run sim -- gale --test */
import * as C from "../../../engine/cards";
import { Perm } from "../../../engine/game";
import { Rng } from "../../../engine/rng";
import { CFG } from "../config";
import { GaleGame } from "../game";
import { search, finisherReachable } from "../kills";

const rep = (n: string, k: number) => new Array(k).fill(n) as string[];

interface Board {
  bf?: string[];
  hand?: string[];
  gy?: string[];
  lands?: string[];
}

function board({ bf = [], hand = [], gy = [], lands = [...rep("Island", 3), ...rep("Swamp", 3)] }: Board): GaleGame {
  const g = new GaleGame([], rep("Island", 60), new Rng(1), CFG);
  g.startTurn();
  g.turn = 5;
  for (const l of lands) {
    const cd = C.get(l);
    g.bf.push(new Perm(cd, cd.land));
  }
  for (const n of bf) {
    const p = new Perm(C.get(n));
    p.sick = false;
    g.bf.push(p);
  }
  g.hand = hand.map((n) => C.get(n));
  g.gy = gy.map((n) => C.get(n));
  return g;
}

export function runKillTests(): boolean {
  let ok = true;
  const check = (label: string, g: GaleGame, expect: number) => {
    const L = g.light();
    const r = finisherReachable(L) ? search.search(L, 5000) : 0; // same pre-filter the game uses
    console.log(`${r === expect ? "OK " : "BAD"} ${label}: got ${r}, expected ${expect}`);
    ok = ok && r === expect;
  };
  const I = (n: number) => rep("Island", n), S = (n: number) => rep("Swamp", n);

  check("Guildmage+Mindcrank on board, Cacophony in hand (5 mana)",
    board({ bf: ["Duskmantle Guildmage", "Mindcrank"], hand: ["Maddening Cacophony"] }), 1);
  check("... plus Counterspell & 2 extra mana -> protected",
    board({ bf: ["Duskmantle Guildmage", "Mindcrank"], hand: ["Maddening Cacophony", "Counterspell"], lands: [...I(5), ...S(3)] }), 2);
  check("Guildmage + kicked Cacophony (9 mana)",
    board({ bf: ["Duskmantle Guildmage"], hand: ["Maddening Cacophony"], lands: [...I(6), ...S(3)] }), 1);
  check("Guildmage + kicked Cacophony with only 8 mana -> no",
    board({ bf: ["Duskmantle Guildmage"], hand: ["Maddening Cacophony"], lands: [...I(5), ...S(3)] }), 0);
  check("Kicked Cacophony + Monument exhaust (12 mana incl. casting monument)",
    board({ hand: ["Maddening Cacophony", "Riverchurn Monument"], lands: [...I(9), ...S(3)] }), 1);
  check("Mindskinner (can attack) + Konrad on board", board({ bf: ["The Mindskinner", "Syr Konrad, the Grim"] }), 1);
  check("Gale: Dark Ritual from hand -> Cacophony from gy resolves BEFORE ritual mana (4 lands) -> no",
    board({ bf: ["Gale, Waterdeep Prodigy", "Duskmantle Guildmage", "Mindcrank"], hand: ["Dark Ritual"],
      gy: ["Maddening Cacophony"], lands: [...I(2), ...S(2)] }), 0);
  check("Gale: Cacophony from hand -> Dark Ritual from gy, ritual mana activates Guildmage (4 lands)",
    board({ bf: ["Gale, Waterdeep Prodigy", "Duskmantle Guildmage", "Mindcrank"], hand: ["Maddening Cacophony"],
      gy: ["Dark Ritual"], lands: [...I(2), ...S(2)] }), 1);
  check("Gale: High Tide from hand -> kicked Cacophony from gy, Guildmage active (8 Islands + 2 Swamps)",
    board({ bf: ["Gale, Waterdeep Prodigy", "Duskmantle Guildmage"], hand: ["High Tide"], gy: ["Maddening Cacophony"],
      lands: [...I(5), ...S(2)] }), 0);
  check("Guildmage + Mindcrank + Windfall", board({ bf: ["Duskmantle Guildmage", "Mindcrank"], hand: ["Windfall"] }), 1);
  check("Guildmage + Mindcrank + Konrad activation",
    board({ bf: ["Duskmantle Guildmage", "Mindcrank", "Syr Konrad, the Grim"] }), 1);
  check("Guildmage + Singularity Rupture (9 mana)",
    board({ bf: ["Duskmantle Guildmage"], hand: ["Singularity Rupture"], lands: [...I(5), ...S(4)] }), 1);
  check("Nothing relevant", board({ hand: ["Opt", "Ponder"] }), 0);
  check("Traumatize alone kills nobody",
    board({ bf: ["Duskmantle Guildmage"], hand: ["Traumatize"], lands: [...I(6), ...S(3)] }), 0);
  check("game4: Konrad + Mindcrank on board, kicked Cacophony (8 mana incl. Sol Ring, Signet, Homunculus)",
    board({ bf: ["Syr Konrad, the Grim", "Mindcrank", "Sol Ring", "Arcane Signet", "Curious Homunculus"],
      hand: ["Maddening Cacophony"], lands: ["Island", "Swamp", "Reliquary Tower", "Island"] }), 1);
  // stacking High Tides, Bubbling Muck, Energybending (game5). Guildmage + kicked Cacophony needs 9 mana.
  const GM = ["Duskmantle Guildmage"];
  check("One High Tide, 4 Islands + 2 Swamps: the Island paying for it gets no bonus (8 mana) -> no",
    board({ bf: GM, hand: ["High Tide", "Maddening Cacophony"], lands: [...I(4), ...S(2)] }), 0);
  check("Two High Tides stack, 4 Islands + 2 Swamps (9 mana)",
    board({ bf: GM, hand: ["High Tide", "High Tide", "Maddening Cacophony"], lands: [...I(4), ...S(2)] }), 1);
  check("Two High Tides, 3 Islands + 2 Swamps (only 7 mana) -> no",
    board({ bf: GM, hand: ["High Tide", "High Tide", "Maddening Cacophony"], lands: [...I(3), ...S(2)] }), 0);
  check("Gale: High Tide from hand, then Muck from hand -> Gale recasts High Tide from graveyard",
    board({ bf: ["Gale, Waterdeep Prodigy", ...GM], hand: ["High Tide", "Bubbling Muck", "Maddening Cacophony"],
      lands: [...I(4), ...S(2)] }), 1);
  check("Muck alone, 5 Islands + 1 Swamp + Sol Ring (8 mana) -> no",
    board({ bf: [...GM, "Sol Ring"], hand: ["Bubbling Muck", "Maddening Cacophony"], lands: [...I(5), ...S(1)] }), 0);
  check("Energybending (Sol Ring pays) makes every land a Swamp for Muck",
    board({ bf: [...GM, "Sol Ring"], hand: ["Energybending", "Bubbling Muck", "Maddening Cacophony"],
      lands: [...I(5), ...S(1)] }), 1);
  check("Energybending (paid with lands) + Muck, 5 Islands + 2 Swamps (8 mana) -> no",
    board({ bf: GM, hand: ["Energybending", "Bubbling Muck", "Maddening Cacophony"], lands: [...I(5), ...S(2)] }), 0);
  check("Energybending made free by Mocking Sprite + Geist taps no lands: every land a Swamp for Muck",
    board({ bf: [...GM, "Mocking Sprite", "Geist of Saint Thalia"],
      hand: ["Energybending", "Bubbling Muck", "Maddening Cacophony"], lands: [...I(6), ...S(1)] }), 1);
  let g = board({ bf: [...GM, "Sol Ring"], hand: ["Maddening Cacophony"], lands: [...I(1), ...S(4)] });
  g.ht = 1;
  check("High Tide already resolved, 1 Island + 4 Swamps + Sol Ring (8 mana) -> no", g, 0);
  g = board({ bf: [...GM, "Sol Ring"], hand: ["Energybending", "Maddening Cacophony"], lands: [...I(1), ...S(4)] });
  g.ht = 1;
  check("High Tide already resolved, then Energybending turns the Swamps into Islands", g, 1);
  // Konrad chains are checked with real shuffles: about 68% / 100% / 45% in a separate random-deal check (the old Python tool, since removed)
  const KM = ["Syr Konrad, the Grim", "Mindcrank"];
  g = board({ bf: KM, hand: ["Maddening Cacophony"], lands: I(2) });
  g.lib = [86, 86, 86];
  check("Konrad + Mindcrank + unkicked Cacophony (wins ~68%) -> no", g, 0);
  g = board({ bf: KM, hand: ["Maddening Cacophony"], lands: I(6) });
  g.lib = [86, 86, 86];
  check("Konrad + Mindcrank + kicked Cacophony (wins ~100%)", g, 1);
  g = board({ bf: ["Syr Konrad, the Grim"], hand: ["Maddening Cacophony"], lands: I(6) });
  g.lib = [86, 86, 86];
  check("Konrad, no Mindcrank, kicked Cacophony (wins ~45%) -> no", g, 0);
  // Poison: Prologue to Phyresis (1 poison) + Expansion Algorithm (proliferate X times, {X}{U}{U})
  const PA = ["Prologue to Phyresis", "Expansion Algorithm"];
  check("Prologue + Algorithm X=9, 13 mana", board({ hand: PA, lands: I(13) }), 1);
  check("Prologue + Algorithm with 12 mana -> no", board({ hand: PA, lands: I(12) }), 0);
  check("Prologue + Algorithm, 2 reducers (Mocking Sprite + Geist): 1 + 9 = 10 mana",
    board({ bf: ["Mocking Sprite", "Geist of Saint Thalia"], hand: PA, lands: I(10) }), 1);
  check("... same with 9 mana -> no", board({ bf: ["Mocking Sprite", "Geist of Saint Thalia"], hand: PA, lands: I(9) }), 0);
  g = board({ hand: ["Expansion Algorithm"], lands: I(11) });
  g.poison = [1, 1, 1];
  check("Prologue cast on an earlier turn (1 poison each): Algorithm X=9 alone, 11 mana", g, 1);
  g = board({ hand: ["Expansion Algorithm"], lands: I(10) });
  g.poison = [1, 1, 1];
  check("... with 10 mana -> no", g, 0);
  g = board({ bf: ["Gale, Waterdeep Prodigy"], hand: ["Expansion Algorithm"], gy: ["Prologue to Phyresis"], lands: I(12) });
  g.poison = [1, 1, 1];
  check("Gale: Algorithm X=8 from hand recasts Prologue from graveyard first (1+1+8), 12 mana", g, 1);
  check("Algorithm with no poison anywhere -> no", board({ hand: ["Expansion Algorithm"], lands: I(13) }), 0);
  // Turnabout untaps every land: 4 Islands + Swamp, High Tide (7 mana left), Turnabout (-4, +9) = 12
  check("Guildmage + High Tide + Turnabout + kicked Cacophony",
    board({ bf: ["Duskmantle Guildmage"], hand: ["High Tide", "Turnabout", "Maddening Cacophony"], lands: [...I(4), ...S(1)] }), 1);
  check("... without Turnabout -> no",
    board({ bf: ["Duskmantle Guildmage"], hand: ["High Tide", "Maddening Cacophony"], lands: [...I(4), ...S(1)] }), 0);
  // untap effects after High Tide: 4 Islands + Swamp, High Tide leaves 7 mana (Guildmage + kicked Cacophony = 9)
  check("High Tide + Peregrine Drake (-5, untap 5: +9) + kicked Cacophony",
    board({ bf: ["Duskmantle Guildmage"], hand: ["High Tide", "Peregrine Drake", "Maddening Cacophony"], lands: [...I(4), ...S(1)] }), 1);
  check("High Tide + Opt countered by your own Rewind (-1 -4, untap 4 Islands: +8) + kicked Cacophony",
    board({ bf: ["Duskmantle Guildmage"], hand: ["High Tide", "Opt", "Rewind", "Maddening Cacophony"], lands: [...I(4), ...S(1)] }), 1);
  // rituals (Guildmage + kicked Cacophony = 9 mana)
  check("Energy Tap on Konrad (+5): 6 lands - 1 + 5 = 10",
    board({ bf: ["Duskmantle Guildmage", "Syr Konrad, the Grim"], hand: ["Energy Tap", "Maddening Cacophony"], lands: [...I(4), ...S(2)] }), 1);
  check("Energy Tap on Guildmage only (+2): 6 - 1 + 2 = 7 -> no",
    board({ bf: ["Duskmantle Guildmage"], hand: ["Energy Tap", "Maddening Cacophony"], lands: [...I(4), ...S(2)] }), 0);
  // Drain Power: an opponent has one land per turn, half of them untapped (rounded down)
  g = board({ bf: ["Duskmantle Guildmage"], hand: ["Drain Power", "Maddening Cacophony"], lands: [...I(5), ...S(2)] });
  g.turn = 10;
  check("Drain Power on turn 10 (5 of 10 lands untapped): 7 - 2 + 5 = 10", g, 1);
  g = board({ bf: ["Duskmantle Guildmage"], hand: ["Drain Power", "Maddening Cacophony"], lands: [...I(5), ...S(2)] });
  g.turn = 7;
  check("Drain Power on turn 7 (3 of 7 untapped): 7 - 2 + 3 = 8 -> no", g, 0);
  check("Cabal Ritual without threshold: 7 - 2 + 3 = 8 -> no",
    board({ bf: ["Duskmantle Guildmage"], hand: ["Cabal Ritual", "Maddening Cacophony"], lands: [...I(5), ...S(2)] }), 0);
  check("Cabal Ritual with threshold (7 cards in graveyard): 7 - 2 + 5 = 10",
    board({ bf: ["Duskmantle Guildmage"], hand: ["Cabal Ritual", "Maddening Cacophony"], lands: [...I(5), ...S(2)],
      gy: [...I(4), "Opt", "Ponder", "Brainstorm"] }), 1);
  console.log(ok ? "ALL OK" : "SOME FAILED");
  return ok;
}
