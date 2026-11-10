/** Rules checks on hand-built boards. Run: npm run sim -- mike --test */
import * as C from "../../../engine/cards";
import { Perm } from "../../../engine/game";
import { Rng } from "../../../engine/rng";
import { CFG } from "../config";
import { MikeGame, TOK, VNWXT, CRAWLER, SEAS, KRANG, TEFERI, MANIAC, JACE, TOAD, CONUNDRUM, ORMOS } from "../game";

const rep = (n: string, k: number) => new Array(k).fill(n) as string[];

function board(bf: string[] = [], hand: string[] = [], library = rep("Island", 40), gy: string[] = [],
               lands = rep("Island", 6), cfg = {}): MikeGame {
  const g = new MikeGame([], library, new Rng(1), { ...CFG, ...cfg });
  g.startTurn();
  g.turn = 6;
  g.drawStepOpen = false;
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
  g.gy = gy.map((n) => C.get(n));
  return g;
}

export function runMikeTests(): boolean {
  let ok = true;
  const check = (label: string, got: unknown, expect: unknown) => {
    const good = JSON.stringify(got) === JSON.stringify(expect);
    console.log(`${good ? "OK " : "BAD"} ${label}: got ${JSON.stringify(got)}, expected ${JSON.stringify(expect)}`);
    ok = ok && good;
  };

  // ---- drawing from an empty library
  let g = board([MANIAC], [], []);
  g.draw(1);
  check("Laboratory Maniac: drawing from an empty library wins", [g.milled, g.died], [true, false]);
  g = board([JACE], [], []);
  g.draw(1);
  check("Jace: drawing from an empty library wins", [g.milled, g.died], [true, false]);
  g = board([CONUNDRUM], [], []);
  g.draw(3);
  check("Living Conundrum: the draws are skipped", [g.milled, g.died, g.hand.length], [false, false, 0]);
  g = board([ORMOS], [], []);
  g.draw(2);
  check("Ormos: two empty draws = ten +1/+1 counters", [g.perm(ORMOS)!.counters, g.died], [10, false]);
  g = board([], [], []);
  g.draw(1);
  check("no protection: drawing from an empty library loses", g.died, true);
  g = board([MANIAC, CONUNDRUM], [], []);
  g.draw(1);
  check("Maniac and Conundrum together: we win (Maniac is chosen)", g.milled, true);

  // ---- doubling draws
  g = board([VNWXT], []);
  g.speed = 4;
  g.draw(1);
  check("Vnwxt at max speed: draw two instead", g.hand.length, 2);
  g = board([VNWXT], []);
  g.speed = 3;
  g.draw(1);
  check("Vnwxt below max speed: draw one", g.hand.length, 1);
  g = board([TEFERI], []);
  g.draw(1);
  check("Teferi's Ageless Insight: an effect draw gives two", g.hand.length, 2);
  g = board([TEFERI], []);
  g.drawStepOpen = true;
  g.draw(1);
  check("Teferi: the first draw of the draw step is just one card", g.hand.length, 1);
  g = board([TEFERI, VNWXT], []);
  g.speed = 4;
  g.draw(1);
  check("Teferi + Vnwxt (max speed): one effect draw gives four", g.hand.length, 4);
  g = board([TEFERI, VNWXT], []);
  g.speed = 4;
  g.drawStepOpen = true;
  g.draw(1);
  check("Teferi + Vnwxt: the draw step gives three (the first card is exempt from Teferi)", g.hand.length, 3);

  // ---- draw triggers
  g = board([CRAWLER], []);
  g.draw(3);
  check("Psychosis Crawler: each draw drains every opponent 1", g.life, [37, 37, 37]);
  g = board([CRAWLER, KRANG], []);
  g.draw(2);
  check("Krang doubles Psychosis Crawler's trigger", g.life, [36, 36, 36]);
  g = board([SEAS], []);
  g.draw(7);
  check("Ominous Seas: seven draws, seven counters, no Kraken", [g.perm(SEAS)!.counters, g.bf.filter((p) => p.cd === TOK.kraken).length], [7, 0]);
  g.draw(1);
  check("Ominous Seas: the eighth draw makes an 8/8 Kraken", [g.perm(SEAS)!.counters, g.bf.filter((p) => p.cd === TOK.kraken).length], [0, 1]);
  g = board(["Clinquant Skymage", "Oneirophage"], []);
  g.draw(2);
  check("Skymage and Oneirophage grow with each draw", g.bf.filter((p) => p.counters === 2).length, 2);
  g = board(["Emrakul's Messenger", "Mischievous Mystic"], []);
  g.draw(1);
  const none = g.bf.length;
  g.draw(1);
  check("Messenger / Mystic: only the second card each turn makes a Spawn and a Faerie", [none, g.bf.length], [8, 10]);

  // ---- speed
  g = board([VNWXT], []);
  g.speed = 1;
  g.hurtOpp(0, 3);
  g.hurtOpp(1, 3);
  check("speed rises once per turn when an opponent loses life", g.speed, 2);
  g.startTurn();
  g.hurtOpp(0, 1);
  check("...and again on the next turn", g.speed, 3);
  g = board([], []);
  g.hurtOpp(0, 3);
  check("without a speed card there is no speed", g.speed, 0);

  // ---- Toad
  g = board([TOAD], rep("Island", 20));
  check("Twenty-Toed Toad with twenty cards in hand wins", (g.checkKill(), g.oppsBeaten()), true);
  g = board([TOAD], rep("Island", 19));
  check("...with nineteen it does not", (g.checkKill(), g.oppsBeaten()), false);

  // ---- the AI's safety rule
  g = board([], [], rep("Island", 6));
  check("no protection: the AI will not draw into the last 3 cards", [g.drawOk(2), g.drawOk(4)], [true, false]);
  g = board([CONUNDRUM], [], rep("Island", 6));
  check("Living Conundrum on the battlefield: drawing everything is fine", g.drawOk(20), true);
  g = board([MANIAC], [], rep("Island", 6));
  check("a win piece on the battlefield: drawing everything is the plan", g.drawOk(20), true);

  // ---- Slick Imitator copies a Windfall (Pontus: 15 cards in hand = 30 drawn, then the copy discards 30 and draws 60)
  g = board([VNWXT, "Slick Imitator"], ["Windfall", ...rep("Brainstorm", 14)], rep("Island", 300));
  g.speed = 4;
  g.castIS(C.get("Windfall"));
  check("Windfall with 14 other cards at max speed, copied by Slick Imitator: 28 drawn, then 56", [g.hand.length, g.onBf("Slick Imitator")], [56, false]);
  g = board([VNWXT, MANIAC], ["Flux", ...rep("Brainstorm", 14)], rep("Island", 25));
  g.speed = 4;
  g.castIS(C.get("Flux"));
  check("Flux with a win piece out and a small library: the whole hand is refilled and the library runs out (win)", g.milled, true);

  // ---- the Water Crystal makes blue spells cheaper
  g = board(["The Water Crystal"], []);
  check("The Water Crystal: Pull from Tomorrow (X=3) costs one less", g.effCost(C.get("Pull from Tomorrow"), C.Cost.parse("{U}{U}").withGeneric(3)).mv, 4);

  return ok;
}
