/** Rules checks on hand-built boards. Run: npm run sim -- aesi --test */
import * as C from "../../../engine/cards";
import { Cost } from "../../../engine/cards";
import { Perm } from "../../../engine/game";
import { Rng } from "../../../engine/rng";
import { CFG } from "../config";
import { keepsHand, DEFAULT_MULLIGAN } from "../../../engine/mulligan";
import { MULLIGAN } from "../mulligan";
import { AesiGame, AESI, RETREAT, KODAMA, MELOKU, UYO, MINDSWEEPER, COBRA, OMNI, KIRI, HARU, BSZ, SWARM, CHAMBER, TOK } from "../game";

const rep = (n: string, k: number) => new Array(k).fill(n) as string[];

function board(bf: string[] = [], hand: string[] = [], library: string[] = [...rep("Forest", 30), ...rep("Island", 30)],
               lands = [...rep("Forest", 4), ...rep("Island", 4)]): AesiGame {
  const g = new AesiGame([], library, new Rng(1), { ...CFG });
  g.startTurn();
  g.turn = 6;
  g.command = [];
  for (const l of lands) {
    const cd = C.get(l);
    const p = new Perm(cd, cd.land);
    p.sick = false;
    g.bf.push(p);
  }
  for (const n of bf) {
    const p = new Perm(C.get(n));
    p.sick = false;
    g.bf.push(p);
  }
  g.hand = hand.map((n) => C.get(n));
  return g;
}

export function runAesiTests(): boolean {
  let ok = true;
  const check = (label: string, got: unknown, expect: unknown) => {
    const good = JSON.stringify(got) === JSON.stringify(expect);
    console.log(`${good ? "OK " : "BAD"} ${label}: got ${JSON.stringify(got)}, expected ${JSON.stringify(expect)}`);
    ok = ok && good;
  };
  const army = (g: AesiGame) => g.bf.some((p) => p.cd === TOK.illusionArmy || p.cd === TOK.snakeArmy);

  // land drops: 1 + Aesi + Azusa (2) + Loot = 5
  let g = board([AESI, "Azusa, Lost but Seeking", "Loot, Exuberant Explorer"]);
  check("land drops with Aesi, Azusa and Loot", g.dropsAllowed(), 5);

  // Evolving Wilds with Aesi: two landfall triggers = two cards
  g = board([AESI], ["Evolving Wilds"]);
  const lib0 = g.library.length;
  g.playLandVia();
  check("Evolving Wilds with Aesi: 2 draws, the basic enters tapped", [lib0 - g.library.length - 1, g.landsBf().filter((p) => p.tapped).length], [2, 1]);

  // ability costs: Familiar makes Dokai's {4}{G}{G} cost {2}{G}{G}; Meloku's {1} stays {1}; Training Grounds + Familiar: {G}{G}
  g = board(["Biomancer's Familiar"]);
  check("Familiar: {4}{G}{G} -> 4 mana, {1} -> 1, {2} -> 1",
    [g.abilityCost(Cost.parse("{4}{G}{G}")).mv, g.abilityCost(new Cost(1)).mv, g.abilityCost(new Cost(2)).mv], [4, 1, 1]);
  g = board(["Biomancer's Familiar", "Training Grounds"]);
  check("Familiar + Training Grounds: {4}{G}{G} -> {G}{G}", g.abilityCost(Cost.parse("{4}{G}{G}")).mv, 2);

  // Retreat untaps Walking Atlas: one Atlas puts two lands
  g = board([RETREAT, "Walking Atlas"], ["Forest", "Island"]);
  g.dropsUsed = 1;
  g.playLandVia();
  g.playLandVia();
  check("Retreat + Atlas: one Atlas puts both lands (Retreat untaps it after the first)", [g.landsInHand().length, g.dropsUsed], [0, 1]);

  // Lotus Cobra: a mana per landfall
  g = board([COBRA], ["Forest"]);
  g.playLandVia();
  check("Lotus Cobra: one mana floating after a land", g.pool.U + g.pool.G, 1);

  // Kodama: a land drop puts a second land from hand
  g = board([KODAMA], ["Forest", "Island"]);
  g.playLandVia();
  check("Kodama: one land drop puts both lands", [g.landsInHand().length, g.dropsUsed], [0, 1]);

  // Simic Growth Chamber returns a tapped basic
  g = board([], [CHAMBER]);
  g.landsBf()[0].tapped = true;
  g.playLandVia();
  check("Simic Growth Chamber: enters tapped, returns a tapped basic", [g.perm(CHAMBER)!.tapped, g.landsInHand().map((c) => c.name)], [true, ["Forest"]]);

  // the loops
  // Retreat + Atlas + Simic Growth Chamber in hand + Aesi: endless landfall -> draw down to 5 cards
  g = board([AESI, RETREAT, "Walking Atlas"], [CHAMBER]);
  let L = g.loops();
  check("Retreat + Atlas + Chamber: endless landfall and draws, no endless mana", [L.landfall, L.draw, L.mana], [true, true, false]);
  g.comboSolve();
  check("  ... the solver draws the library down to 5", g.library.length, 5);

  // Retreat + Atlas + Mindsweeper + Familiar: mill everyone
  g = board([RETREAT, "Walking Atlas", MINDSWEEPER, "Biomancer's Familiar"]);
  g.checkKill();
  check("Retreat + Atlas + Mindsweeper + Familiar: everyone milled", g.lib, [0, 0, 0]);

  // without a reducer the Mindsweeper loop loses a mana each time: no loop; with Lotus Cobra it's endless mana
  g = board([RETREAT, "Walking Atlas", MINDSWEEPER]);
  check("Mindsweeper without a reducer: no loop", g.loops().landfall, false);
  g = board([RETREAT, "Walking Atlas", MINDSWEEPER, COBRA]);
  L = g.loops();
  check("Mindsweeper + Lotus Cobra: endless mana and mill", [L.mana, L.mill], [true, true]);

  // Oboro Breezecaller pays for itself (return one land, untap another)
  g = board([RETREAT, "Sakura-Tribe Scout", "Oboro Breezecaller", AESI]);
  L = g.loops();
  check("Breezecaller + Retreat + Scout: endless landfall, no reducer needed", [L.landfall, L.mana, L.draw], [true, false, true]);

  // Mirror-Mage returns three lands for {3}: even; with Familiar, +2 a loop = endless mana
  g = board([RETREAT, "Walking Atlas", "Soratami Mirror-Mage"]);
  check("Mirror-Mage: endless landfall without a reducer", [g.loops().landfall, g.loops().mana], [true, false]);
  g = board([RETREAT, "Walking Atlas", "Soratami Mirror-Mage", "Biomancer's Familiar"]);
  check("Mirror-Mage + Familiar: endless mana", g.loops().mana, true);

  // Kodama + Meloku: endless Illusions, they attack next turn
  g = board([KODAMA, MELOKU]);
  g.checkKill();
  check("Kodama + Meloku: an Illusion army, not a win yet", [army(g), g.oppsBeaten()], [true, false]);
  g.startTurn();
  g.combat();
  check("  ... the army kills everyone next turn", g.oppsBeaten(), true);

  // Uyo + Retreat + Atlas + Blue Sun's Zenith in hand (4 mana for X = 1): copies mill everyone
  g = board([UYO, RETREAT, "Walking Atlas"], [BSZ]);
  g.checkKill();
  check("Uyo + Retreat + Atlas + Blue Sun's Zenith: everyone milled", g.lib, [0, 0, 0]);

  // Uyo copying Endless Swarm: a Snake army
  g = board([UYO, RETREAT, "Walking Atlas"], [SWARM, "Island", "Forest"], undefined, [...rep("Forest", 6), ...rep("Island", 4)]);
  g.checkKill();
  check("Uyo + Retreat + Atlas + Endless Swarm: Snake army, epic", [army(g), g.epic], [true, true]);

  // Omniscience + Kiri-Onna + Haru-Onna: endless draws; the library has Kodama and Meloku -> Illusion army
  g = board([OMNI], [KIRI, HARU], [...rep("Forest", 20), KODAMA, MELOKU, ...rep("Island", 20)]);
  g.checkKill();
  check("Omniscience + Onnas: draws, casts Kodama + Meloku for free -> Illusion army",
    [g.onBf(KODAMA), g.onBf(MELOKU), army(g)], [true, true, true]);

  // Omniscience + Onnas with Mindsweeper, Familiar, Retreat and an old Walking Atlas: mill now (Pontus's turn 10)
  g = board([OMNI, "Walking Atlas", AESI], [KIRI, HARU], [...rep("Forest", 20), MINDSWEEPER, RETREAT, "Biomancer's Familiar", ...rep("Island", 20)]);
  g.checkKill();
  check("Pontus's turn 10: Omniscience + Onnas find Retreat, Familiar, Mindsweeper -> everyone milled", g.lib, [0, 0, 0]);

  // Endless Swarm: a Snake per card in hand, then epic stops spells; the next upkeep copies it
  g = board([], [SWARM, "Forest", "Island", "Growth Spiral"], undefined, rep("Forest", 8));
  g.castIS(C.get(SWARM));
  const snakes = () => g.bf.filter((p) => p.cd === TOK.snake).length;
  const s1 = snakes();
  const cast = g.castIS(C.get("Growth Spiral"));
  g.upkeep();
  check("Endless Swarm: 3 Snakes, no more spells, 3 more next upkeep", [s1, cast, snakes()], [3, false, 6]);

  // Patron of the Moon by moonfolk offering: sacrifice Floodbringer ({1}{U}) -> pay {4}{U}
  g = board(["Floodbringer"], ["Patron of the Moon"], undefined, rep("Island", 5));
  const pc = g.candidates(false).find((c) => c.cost.mv === 5 && c.score > 74);
  check("Patron of the Moon via Floodbringer: costs 5", pc !== undefined, true);

  // ---- lands as creatures (Nature's Revolt, Natural Affinity, Sylvan Awakening)
  // Nature's Revolt: a replayed land is a summoning-sick creature (no mana), so Kodama + Meloku stops paying for itself
  g = board([KODAMA, MELOKU, "Nature's Revolt"]);
  g.revolt = true;
  check("Nature's Revolt breaks Kodama + Meloku (replayed lands can't tap)", g.loops().landfall, false);
  g = board([KODAMA, MELOKU, "Nature's Revolt", RETREAT]);
  g.revolt = true;
  check("  ... but with Retreat (it untaps an older land each time) it works again", g.loops().landfall, true);
  g = board([KODAMA, MELOKU, "Nature's Revolt", COBRA]);
  g.revolt = true;
  check("  ... and with Lotus Cobra", g.loops().landfall, true);
  g = board([MELOKU, RETREAT, "Walking Atlas", "Nature's Revolt"]);
  g.revolt = true;
  check("Nature's Revolt breaks Retreat + Atlas + Meloku", g.loops().landfall, false);
  g = board([MELOKU, RETREAT, "Walking Atlas", "Sylvan Awakening"]);
  g.awakened = true;
  check("Sylvan Awakening doesn't (haste: replayed lands still tap)", g.loops().landfall, true);
  // a land that entered this turn can't tap under Revolt
  g = board(["Nature's Revolt"], ["Forest"]);
  g.revolt = true;
  g.playLandVia();
  check("Nature's Revolt: the land played this turn makes no mana", g.availMana(), 8);

  // land lock: Omniscience + Onnas + Natural Affinity in hand -> Kiri-Onna bounces every opponent's land
  g = board([OMNI], [KIRI, HARU, "Natural Affinity"]);
  g.checkKill();
  check("Omniscience + Onnas + Natural Affinity: land lock (counts as a win)", [g.locked, g.oppsBeaten()], [true, true]);
  g = board([OMNI], [KIRI, HARU, "Natural Affinity"]);
  g.cfg.land_lock_win = false;
  g.checkKill();
  check("  ... not with land_lock_win off", g.locked, false);

  // Sylvan Awakening: cast when our lands (2/2 haste, half blocked) kill the table
  g = board([], ["Sylvan Awakening"], undefined, [...rep("Forest", 6), ...rep("Island", 6)]);
  g.life = [4, 4, 4];
  const aw = g.candidates(false).find((c) => c.score === 98);
  check("Sylvan Awakening: 12 lands, 3 pay for it, 9 attack (5 unblocked = 10 damage) vs 12 life: no", aw === undefined, true);
  g.life = [3, 3, 3];
  check("  ... vs 9 life: yes", g.candidates(false).some((c) => c.score === 98), true);

  // ---- land tutors and utility lands
  // Sylvan Scrying with Retreat + Atlas out: gets Simic Growth Chamber -> the Retreat loop (Aesi draws)
  g = board([RETREAT, "Walking Atlas", AESI], ["Sylvan Scrying"], [...rep("Forest", 30), CHAMBER, ...rep("Island", 30)]);
  check("Retreat + Atlas: Sylvan Scrying wants the Chamber", g.landTutorTarget()?.name, CHAMBER);
  g.castIS(C.get("Sylvan Scrying"));
  g.checkKill();
  check("  ... and the loop draws the library down to 5", g.library.length, 5);
  // Crop Rotation puts the Chamber onto the battlefield; it returns itself (the loop wants it in hand)
  g = board([RETREAT, "Walking Atlas"], ["Crop Rotation"], [...rep("Forest", 30), "Guildless Commons", ...rep("Island", 30)]);
  g.castIS(C.get("Crop Rotation"));
  check("Crop Rotation -> Guildless Commons, which returns itself", g.hand.map((c) => c.name), ["Guildless Commons"]);
  // Uyo copies Explosive Vegetation: 4 basics for two returned lands
  g = board([UYO], ["Explosive Vegetation"]);
  const n0 = g.landsBf().length;
  g.castIS(C.get("Explosive Vegetation"));
  check("Uyo copies Explosive Vegetation: +4 lands, 2 back in hand", [g.landsBf().length - n0, g.landsInHand().length], [2, 2]);

  // ---- Elven Raft-Steerer, Tatyova, Nature's Lore
  g = board(["Elven Raft-Steerer", "Walking Atlas"], ["Forest", "Island"]);
  g.dropsUsed = 1;
  g.playLandVia();
  g.playLandVia();
  check("Elven Raft-Steerer untaps Walking Atlas like Retreat (both lands from one Atlas)", [g.landsInHand().length, g.dropsUsed], [0, 1]);
  g = board(["Elven Raft-Steerer", "Walking Atlas", "Soratami Mindsweeper", "Biomancer's Familiar"]);
  g.checkKill();
  check("Raft-Steerer + Atlas + Mindsweeper + Familiar: everyone milled", g.lib, [0, 0, 0]);
  g = board(["Tatyova, Benthic Druid"], ["Forest"]);
  const l0 = g.library.length;
  g.playLandVia();
  check("Tatyova: a land draws a card", l0 - g.library.length, 1);
  g = board(["Tatyova, Benthic Druid", "Retreat to Coralhelm", "Walking Atlas"], ["Simic Growth Chamber"]);
  g.checkKill();
  check("Tatyova alone is an engine: Retreat + Atlas + Chamber draws the library down to 5", g.library.length, 5);
  g = board([], ["Nature's Lore"], [...rep("Forest", 20), ...rep("Island", 20)]);
  const f0 = g.landsBf().filter((p) => !p.tapped).length;
  g.castIS(C.get("Nature's Lore"));
  check("Nature's Lore: a Forest, untapped", [g.landsBf().length, g.landsBf().filter((p) => !p.tapped).length - f0 + 2], [9, 1]);

  // ---- dual lands: the real "enters tapped unless" conditions, and the pain land
  const landTapped = (name: string, bf: string[], hand: string[] = []) => {
    const gg = board([], [name, ...hand], undefined, bf);
    gg.playLandVia(null, C.get(name));
    return gg.perm(name)!.tapped;
  };
  check("Hinterland Harbor: tapped with no Forest or Island", landTapped("Hinterland Harbor", []), true);
  check("  ... untapped with a Forest", landTapped("Hinterland Harbor", ["Forest"]), false);
  check("Botanical Sanctum: untapped with two other lands", landTapped("Botanical Sanctum", ["Forest", "Island"]), false);
  check("  ... tapped with three other lands", landTapped("Botanical Sanctum", ["Forest", "Island", "Forest"]), true);
  check("Vineglimmer Snarl: tapped with no Forest or Island in hand", landTapped("Vineglimmer Snarl", ["Forest"]), true);
  check("  ... untapped when it can reveal a Forest", landTapped("Vineglimmer Snarl", ["Forest"], ["Forest"]), false);
  check("Command Tower and Yavimaya Coast: untapped", [landTapped("Command Tower", []), landTapped("Yavimaya Coast", [])], [false, false]);
  check("Temple of Mystery: tapped", landTapped("Temple of Mystery", ["Forest"]), true);
  g = board([], [], undefined, ["Yavimaya Coast", "Island"]);
  g.pay(Cost.parse("{G}"));
  check("Yavimaya Coast: {G} costs 1 life", g.myLife, 39);
  g = board([], [], undefined, ["Yavimaya Coast"]);
  g.pay(new Cost(1));
  check("  ... {C} for a generic cost doesn't", g.myLife, 40);
  g = board([], [], undefined, ["Yavimaya Coast", "Island"]);
  g.canPay(Cost.parse("{G}"));
  g.canPay(Cost.parse("{G}"));
  check("  ... and just checking whether we can pay costs nothing", g.myLife, 40);

  // ---- land-fetch spells that never miss
  const forests = (gg: AesiGame) => gg.landsBf().filter((p) => p.cd.name === "Forest").length;
  g = board([], ["Three Visits"], [...rep("Forest", 20), ...rep("Island", 20)]);
  let f1 = forests(g);
  g.castIS(C.get("Three Visits"));
  check("Three Visits: a Forest, untapped", [forests(g) - f1, g.landsBf().slice(-1).every((p) => !p.tapped)], [1, true]);
  g = board([], ["Skyshroud Claim"], [...rep("Forest", 20), ...rep("Island", 20)]);
  f1 = forests(g);
  g.castIS(C.get("Skyshroud Claim"));
  check("Skyshroud Claim: two Forests, untapped", [forests(g) - f1, g.landsBf().slice(-2).every((p) => !p.tapped)], [2, true]);
  g = board([], ["Wood Elves"], [...rep("Forest", 20), ...rep("Island", 20)]);
  f1 = forests(g);
  g.castPerm(C.get("Wood Elves"));
  check("Wood Elves: a Forest, untapped, and a creature", [forests(g) - f1, g.onBf("Wood Elves")], [1, true]);
  g = board([], ["Search for Tomorrow"], [...rep("Forest", 20), ...rep("Island", 20)]);
  const n1 = g.landsBf().length;
  g.suspendSearch(C.get("Search for Tomorrow"));
  g.upkeep();
  const afterOne = g.landsBf().length - n1;
  g.upkeep();
  check("Search for Tomorrow: suspended for {G}, the land arrives at the second upkeep, untapped",
    [afterOne, g.landsBf().length - n1, g.landsBf().filter((p) => p.tapped).length], [0, 1, 1]);

  // ---- mulligan rule (decks/aesi/mulligan.ts, engine/mulligan.ts)
  const hand = (names: string[]) => names.map((n) => C.get(n));
  const keep = (names: string[], attempt = 0) => keepsHand(MULLIGAN, attempt, hand(names));
  const F = "Forest", I = "Island";
  check("mulligan: 3 lands with a Forest and spells is a keep", keep([F, I, I, "Kiri-Onna", "Uyo, Silent Prophet", "Omniscience", "Haru-Onna"]), true);
  check("mulligan: 4 Islands and no green source goes back", keep([I, I, I, I, "Kiri-Onna", "Uyo, Silent Prophet", "Omniscience"]), false);
  check("mulligan: 2 lands with green and cheap ramp is a keep", keep([F, I, "Rampant Growth", "Kiri-Onna", "Uyo, Silent Prophet", "Omniscience", "Haru-Onna"]), true);
  check("mulligan: 2 lands with green but no cheap ramp goes back", keep([F, I, "Kiri-Onna", "Uyo, Silent Prophet", "Omniscience", "Haru-Onna", "Patron of the Moon"]), false);
  check("mulligan: a one-lander goes back, even at 6 cards", [keep([F, "Rampant Growth", "Kiri-Onna", "Uyo, Silent Prophet", "Omniscience", "Haru-Onna", "Patron of the Moon"]), keep([F, "Rampant Growth", "Kiri-Onna", "Uyo, Silent Prophet", "Omniscience", "Haru-Onna", "Patron of the Moon"], 2)], [false, false]);
  check("mulligan: a fetch land counts as a green source", keep(["Evolving Wilds", I, I, "Kiri-Onna", "Uyo, Silent Prophet", "Omniscience", "Haru-Onna"]), true);
  check("mulligan: after the free mulligan 6 lands are kept (with green), the default rule isn't", [keep([F, F, F, I, I, I, "Kiri-Onna"], 1), keepsHand(DEFAULT_MULLIGAN, 1, hand([F, F, F, I, I, I, "Kiri-Onna"]))], [true, false]);

  return ok;
}
