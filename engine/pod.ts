/**
 * Pod simulation: several decks play against each other (see POD_PLAN.md).
 *
 * Each player keeps its own Game (its hand, battlefield, mana and AI). The pod owns the shared truth: who is alive,
 * each player's life (the player's own Game.myLife), library and poison, and the turn order. Before a player's turn
 * the pod writes the other players into that game's opponent arrays (life / lib / poison); after the turn it reads
 * the arrays back and applies what changed to the real players. So a deck's "each opponent loses 1" hits real decks.
 *
 * Step 1: a race. Shared life, elimination, declared wins (a combo or kill line wins on the spot).
 * Step 2: real combat. An attack goes at one chosen opponent, who blocks with its real untapped creatures by the
 * shared rule (assignBlocks); creatures die; 21 combat damage from one commander kills. (--set pod_race=true
 * switches this off: each deck's goldfish combat rule decides what connects, as in step 1.)
 * Step 3: interaction (engine/answers.ts lists the cards). When a deck declares a win in the middle of its turn, the
 * others may answer at instant speed with the mana they left untapped: a counterspell on a key spell, removal on a key
 * permanent. If that stops it, the card is gone and the turn goes on from there. A big spell (Gray Merchant, a commander,
 * Laboratory Maniac...) may be countered when it is cast. After its own turn a deck uses removal on the biggest threat's
 * best permanent and a board wipe when it is far behind on board. (--set pod_answers=false switches all of this off.)
 * Step 4: threat. Each player has a threat score (Game.threat: board, mana, hand, damage dealt, the deck's own "close to
 * winning"). Attacks lean to the biggest threat (--set threat=leader, the default), or spread (the player we've hurt
 * least), weakest (the lowest life) or damage (where the attack does most). Removal and counterspells aim at the biggest threat.
 *
 *   npm run pod -- gale meren samfrodo aesi mike -n 1000       (a deck may name its list: gale:lists/proposed.txt)
 */
import * as os from 'os';
import { Worker } from 'worker_threads';
import * as C from './cards';
import {
  Arena,
  Config,
  Fighter,
  FightResult,
  FightRow,
  Game,
  Target,
} from './game';
import { Answer } from './answers';
import { Rng } from './rng';
import { Deck, resolveList } from './runner';

export interface PodSpec {
  decks: string[]; // deck names, in the order given on the command line
  lists: string[]; // the decklist file of each
  cap: number; // the game is a draw after this many rounds
  set: Config; // settings applied to every deck (--set)
  threat?: string; // who attacks aim at: leader (default) | spread | weakest | damage
  /** When a deck with a kill line (Gale) goes for it without counter backup: any (default: at once) | protected (only with
   *  backup) | mixed (protected until round protect_until, default 9, then any) | window (with backup, or when every opponent
   *  has at most window_mana untapped mana, default 1, or no cards in hand). Keyed by deck name. */
  policy?: Record<string, string>;
}
export interface PodGame {
  winner: number | null; // index into spec.decks (null = no winner by the cap)
  turn: number; // the round the game ended in
  how: string; // "last standing" | "declared" (a combo / kill line / the deck's own win rule)
  why: string[]; // why[i] = how deck i was eliminated ("" = it wasn't): life | commander | poison | decked
  tried: number[]; // tried[i] = win attempts of deck i that the others could have answered
  stopped: number[]; // stopped[i] = of those, how many were stopped
  answers: number[]; // answers[i] = counterspells / removal deck i used to stop a win or counter a spell
  countered: number[]; // countered[i] = spells of deck i that were countered (not win attempts)
  removals: number[]; // removals[i] = removal spells and wipes deck i cast on its own turn
  removed: number[]; // removed[i] = permanents of deck i taken by targeted removal on another deck's turn (not a win attempt)
  waited: number[]; // waited[i] = turns deck i had a kill and waited (its policy: no counter backup yet)
  shields: number[]; // shields[i] = answers deck i's Kira / Rainshaper / Stormtamer countered
  out: number[]; // players eliminated, in order
  seat: number[]; // seat[i] = the seat (0 = first to play) of deck i
  log?: string[];
}
export interface PodJob {
  pod: PodSpec;
  seeds: number[];
}
export type PodJobResult = { games: PodGame[]; errors: [number, string][] };

const lists = new Map<string, C.Decklist>();
function decklist(file: string): C.Decklist {
  let d = lists.get(file);
  if (!d) {
    d = C.loadDecklist(file);
    lists.set(file, d);
  }
  return d;
}

/** May this blocker block this attacker? */
function canBlock(b: Fighter, a: Fighter): boolean {
  if (a.evasion === 'unblockable') return false;
  if (a.evasion === 'flying') return b.air;
  if (a.evasion === 'skulk') return b.power <= a.power;
  return true;
}
const kills = (x: Fighter, y: Fighter) =>
  x.power > 0 && (x.power >= y.toughness || x.deathtouch);
/** An attacker and its blocker fight: who dies. First strike kills before the other deals damage. */
export function duel(
  a: Fighter,
  b: Fighter,
): { aDies: boolean; bDies: boolean } {
  const ak = kills(a, b),
    bk = kills(b, a);
  if (a.first && !b.first && ak) return { aDies: false, bDies: true };
  if (b.first && !a.first && bk) return { aDies: true, bDies: false };
  return { aDies: bk, bDies: ak };
}
/** Does the blocker survive the block (and so is a "safe" block)? */
const survives = (b: Fighter, a: Fighter) => !duel(a, b).bDies;

/**
 * The shared blocking rule (one blocker per attacker). In order:
 * 1. a block the blocker survives (best if it also kills the attacker), biggest attackers first;
 * 2. a trade (both die) when the blocker is worth less than the attacker;
 * 3. if the damage still coming through is lethal: chump the biggest attackers, cheapest blockers first, with anything;
 * 4. if it leaves us at chumpLife or less, or an attacker has 8+ power: chump with tokens and cheap creatures only.
 * `lethal(dmg, unblocked)` says whether the unblocked attackers kill the defender.
 */
export function assignBlocks(
  att: Fighter[],
  blk: Fighter[],
  life: number,
  lethal: (unblocked: Fighter[]) => boolean,
  chumpLife = 10,
): (Fighter | null)[] {
  const out: (Fighter | null)[] = att.map(() => null);
  const free = blk.slice();
  /** Block attacker i with b. A menace attacker takes a second blocker too (the cheapest other one): false if there is none. */
  const take = (i: number, b: Fighter): boolean => {
    if (att[i].menace) {
      const others = free.filter((x) => x !== b && canBlock(x, att[i]));
      if (!others.length) return false;
      free.splice(
        free.indexOf(others.reduce((m, x) => (x.value < m.value ? x : m))),
        1,
      );
    }
    out[i] = b;
    free.splice(free.indexOf(b), 1);
    return true;
  };
  const order = att
    .map((_, i) => i)
    .sort((x, y) => att[y].power - att[x].power);
  const cheapest = (bs: Fighter[]) =>
    bs.reduce((m, b) => (b.value < m.value ? b : m));
  for (const i of order) {
    const a = att[i];
    const safe = free.filter((b) => canBlock(b, a) && survives(b, a));
    if (!safe.length) continue;
    const killers = safe.filter((b) => duel(a, b).aDies);
    take(i, cheapest(killers.length ? killers : safe));
  }
  for (const i of order) {
    if (out[i]) continue;
    const a = att[i];
    const trade = free.filter(
      (b) => canBlock(b, a) && duel(a, b).aDies && b.value < a.value,
    );
    if (trade.length) take(i, cheapest(trade));
  }
  const open = () => att.filter((_, i) => !out[i]);
  const dmg = () => open().reduce((s, a) => s + a.power, 0);
  const chump = (ok: (b: Fighter) => boolean, until: () => boolean) => {
    for (const i of order) {
      if (until()) return;
      if (out[i] || att[i].power <= 0) continue;
      const bs = free.filter((b) => ok(b) && canBlock(b, att[i]));
      if (bs.length) take(i, cheapest(bs));
    }
  };
  if (lethal(open()))
    chump(
      () => true,
      () => !lethal(open()),
    );
  const cheap = (b: Fighter) => b.value <= 20;
  if (!lethal(open()) && life - dmg() <= chumpLife)
    chump(cheap, () => life - dmg() > chumpLife);
  for (const i of order) {
    if (out[i] || att[i].power < 8) continue;
    const bs = free.filter((b) => cheap(b) && canBlock(b, att[i]));
    if (bs.length) take(i, cheapest(bs));
  }
  return out;
}

/** Play one pod game. */
export function playPod(
  all: Record<string, Deck>,
  spec: PodSpec,
  seed: number,
  verbose = false,
): PodGame {
  const n = spec.decks.length;
  const decks = spec.decks.map((d) => all[d]);
  const order = Array.from({ length: n }, (_, i) => i);
  new Rng(seed * 7919 + 17).shuffle(order); // seats: order[0] plays first
  const seat = new Array<number>(n);
  order.forEach((p, s) => (seat[p] = s));
  const games: Game<unknown>[] = decks.map((deck, i) => {
    const d = decklist(spec.lists[i]);
    const cfg: Config = {
      ...deck.cfg,
      opponents: n - 1,
      ...(deck.podCfg ? deck.podCfg(n) : {}),
      ...spec.set,
    };
    const g = new deck.Game(
      d.commanders,
      d.library,
      new Rng(seed * 1009 + i * 101 + 7),
      cfg,
      verbose,
      spec.set.pod_protected ? 'protected' : 'any',
    );
    g.onPlay = seat[i] === 0; // only the first player skips the first draw
    return g;
  });
  const real = !spec.set.pod_race;
  const n0 = n;
  const interact = real && spec.set.pod_answers !== false;
  const tried = new Array<number>(n).fill(0),
    stopped = new Array<number>(n).fill(0),
    answers = new Array<number>(n).fill(0),
    removals = new Array<number>(n).fill(0);
  const countered = new Array<number>(n).fill(0);
  const removed = new Array<number>(n).fill(0),
    waited = new Array<number>(n).fill(0),
    shields = new Array<number>(n).fill(0);
  const policy = (i: number) => spec.policy?.[spec.decks[i]] ?? 'any';
  const protectUntil = (spec.set.protect_until as number) ?? 9,
    windowMana = (spec.set.window_mana as number) ?? 1;
  // how "ready" the table is: the chance a deck keeps answer mana up on a turn, and the chance it uses its last instant removal on its own turn
  const holdChance = (spec.set.hold_chance as number) ?? 1,
    fireChance = (spec.set.fire_chance as number) ?? 0;
  const mode = spec.threat ?? 'leader';
  const prng = new Rng(seed * 31 + 5);
  const threats = new Array<number>(n).fill(0);
  const dealt = Array.from({ length: n }, () => new Array<number>(n).fill(0)); // dealt[i][j] = life player i took off player j
  const counterAt = (spec.set.counter_at as number) ?? 60,
    counterAny = (spec.set.counter_any as number) ?? 85;
  // each player's opponents, in turn order after them
  const opps = games.map((_, i) => {
    const s = seat[i];
    return Array.from({ length: n - 1 }, (_, k) => order[(s + 1 + k) % n]);
  });
  const alive = new Array<boolean>(n).fill(true);
  const poison = new Array<number>(n).fill(0);
  const out: number[] = [];
  const why = new Array<string>(n).fill('');
  const log: string[] = [];
  let round = 0;
  let fog = false; // all combat damage is prevented for the rest of this turn (Spore Frog)
  let blocked = new Set<unknown>(); // creatures that already blocked this turn
  const cmd = new Map<string, number>(); // combat damage dealt to a player by one commander: "defender|attacker|card"
  const cmdDead = new Set<number>();
  let cur = -1,
    curAt = 0,
    curRound = 0; // the player whose turn it is, and how much of its log is already in the pod log
  const flush = () => {
    if (!verbose || cur < 0) return;
    for (const l of games[cur].log.slice(curAt))
      log.push(`R${curRound} ${name(cur)}: ${l.replace(/^T\d+: /, '')}`);
    curAt = games[cur].log.length;
  };
  const say = (s: string) => {
    if (verbose) {
      flush();
      log.push(s);
    }
  };
  const name = (i: number) =>
    spec.decks[i] +
    (spec.decks.indexOf(spec.decks[i]) !== i ? `#${i + 1}` : '');
  const eliminate = (i: number, reason: string, round: number) => {
    if (!alive[i]) return;
    alive[i] = false;
    out.push(i);
    why[i] = reason;
    say(`R${round}: ${name(i)} is out (${reason})`);
  };
  const arena: Arena = {
    edict: () => undefined,
    snipe: () => null,
    answerWin: () => false,
    go: () => true,
    wheel: (_g, mine) => mine,
    eachDraws: () => undefined,
    counter: () => false,
    prefer: () => 0,
    real: (g) => games.includes(g),
    say: (g, s) => say(`R${round} ${name(games.indexOf(g))}: ${s}`),
    board: (g, slot) => {
      const d = games[opps[games.indexOf(g)][slot]];
      return d.creatures().map((p) => d.power(p));
    },
    fight: (g, slot, att, apply): FightResult => {
      const i = games.indexOf(g),
        j = opps[i][slot],
        d = games[j];
      const life = g.life[slot];
      const key = (a: Fighter) => `${j}|${i}|${a.name}`;
      const lethal = (open: Fighter[]) =>
        !fog &&
        (open.reduce((s, a) => s + a.power, 0) >= life ||
          open.some(
            (a) => a.commander && (cmd.get(key(a)) ?? 0) + a.power >= 21,
          ));
      const blk = d.blockers().filter((b) => !blocked.has(b.p));
      const chumpLife = (d.cfg.chump_life as number) ?? 10;
      if (apply && interact && !fog) {
        // the defender answers the attack: instant removal on the biggest attacker that would connect, if the hit is lethal or leaves it low
        for (let tries = 0; tries < 3; tries++) {
          const b0 = assignBlocks(att, blk, life, lethal, chumpLife);
          const open0 = att.filter((_, k) => !b0[k]);
          const dmg0 = open0.reduce((t, a) => t + a.power, 0);
          if (!(lethal(open0) || (dmg0 > 0 && life - dmg0 <= chumpLife))) break;
          let cast = false;
          for (const a of open0.slice().sort((x, y) => y.power - x.power)) {
            const cd = d.hand.find((c) => {
              const an = d.answer(c);
              return (
                an?.kind === 'removal' &&
                an.instant &&
                Game.permOk(an, a.p.cd.types) &&
                g.podCanTarget(a.p, an) &&
                d.canPay(d.answerCost(c), true)
              );
            });
            if (!cd) continue;
            const an = d.answer(cd)!;
            d.podCast(cd);
            removals[j]++;
            hitWith(j, cd.name, i, a.p, an);
            if (!g.bf.includes(a.p)) att = att.filter((x) => x !== a);
            cast = true;
            break;
          }
          if (!cast) break;
        }
      }
      const bs = assignBlocks(att, blk, life, lethal, chumpLife);
      const rows: FightRow[] = att.map((a, k) => {
        const b = bs[k];
        const d2 = b && !fog ? duel(a, b) : { aDies: false, bDies: false };
        return { a, b, aDies: d2.aDies, bDies: d2.bDies };
      });
      const open = rows.filter((r) => r.b === null).map((r) => r.a);
      // trample: what the blocker doesn't soak up goes through
      const over = rows.reduce(
        (s, r) =>
          s +
          (r.b && r.a.trample
            ? Math.max(0, r.a.power - (r.a.deathtouch ? 1 : r.b.toughness))
            : 0),
        0,
      );
      let dmg = fog ? 0 : open.reduce((s, a) => s + a.power, 0) + over;
      let dead = lethal(open);
      if (!apply) return { rows, dmg, kills: dead };
      for (const r of rows) if (r.b) blocked.add(r.b.p);
      const def =
        dmg > 0
          ? interact
            ? d.podDefend(dmg, dead)
            : d.fogPrevent(dmg, dead)
              ? 'fog'
              : 'none'
          : 'none';
      if (def === 'fog') {
        fog = true;
        dmg = 0;
        dead = false;
        for (const r of rows) r.aDies = r.bDies = false;
        say(`R${round} ${name(j)}: prevents all combat damage this turn`);
      } else if (def === 'bounce') {
        say(
          `R${round} ${name(j)}: returns the attacking creatures to their owner's hand`,
        );
        removals[j]++;
        return {
          rows: rows.map((r) => ({ ...r, aDies: false, bDies: false })),
          dmg: 0,
          kills: false,
          bounced: true,
        };
      }
      for (const r of rows) {
        if (!r.b) continue;
        say(
          `R${round} ${name(j)}: ${r.b.name} blocks ${r.a.name}` +
            (r.aDies && r.bDies
              ? ' (both die)'
              : r.aDies
                ? ' and kills it'
                : r.bDies
                  ? ' and dies'
                  : ''),
        );
        if (r.bDies) d.dies(r.b.p);
      }
      if (dmg > 0)
        for (const a of open)
          if (a.commander) cmd.set(key(a), (cmd.get(key(a)) ?? 0) + a.power);
      if (dead && dmg < life) cmdDead.add(j);
      return { rows, dmg, kills: dead };
    },
  };
  // ---------------------------------------------------------------- removal (step 3)
  const living = (i: number) => opps[i].filter((j) => alive[j]);
  /** The best legal target among the opponents of player i: the biggest threat's most valuable permanent. */
  const bestTarget = (
    i: number,
    a: Answer,
    min = 0,
  ): { j: number; t: Target } | null => {
    for (const j of living(i).sort((x, y) => threats[y] - threats[x])) {
      const ts = games[j]
        .podTargets(a)
        .filter(
          (t) => (!t.token || t.power >= 4) && (t.commander || t.value >= min),
        );
      if (ts.length)
        return { j, t: ts.reduce((m, t) => (t.value > m.value ? t : m)) };
    }
    return null;
  };
  arena.edict = (g, nontoken) => {
    for (const j of living(games.indexOf(g))) {
      const d = games[j];
      const cs = d.creatures().filter((p) => !nontoken || !p.token);
      if (!cs.length) continue;
      const p = cs.reduce((m, q) =>
        d.blockValue(q) < d.blockValue(m) ? q : m,
      );
      say(`R${round} ${name(j)}: sacrifices ${p.cd.name}`);
      d.podRemove(p, 'sacrifice');
    }
  };
  arena.snipe = (g, a) => {
    const hit = bestTarget(games.indexOf(g), a);
    if (!hit) return null;
    hitWith(games.indexOf(g), 'Shriekmaw', hit.j, hit.t.p, a);
    return hit.t.name;
  };
  /** Player i's removal (card) hits player j's permanent p, unless j's Kira / Rainshaper / Stormtamer counters it. */
  const hitWith = (
    i: number,
    card: string,
    j: number,
    p: import('./game').Perm,
    a: Answer,
  ) => {
    const sh = games[j].podShield(p);
    if (sh) {
      shields[j]++;
      say(
        `R${round} ${name(i)}: ${card} on ${name(j)}'s ${p.cd.name} is countered by ${sh}`,
      );
      return;
    }
    say(
      `R${round} ${name(i)}: ${card} on ${name(j)}'s ${p.cd.name} (${a.how ?? 'destroy'})`,
    );
    removed[j]++;
    games[j].podSuffer(p, a);
  };
  const boardPower = (j: number) =>
    games[j].creatures().reduce((t, p) => t + games[j].power(p), 0);
  /** After its turn, player i uses removal on the biggest threat and a wipe when far behind on board. An instant that
   *  could stop a win stays in hand unless there is a second answer. */
  const afterTurn = (i: number) => {
    const g = games[i];
    const isHeld = (c: { name: string }) => {
      const a = g.answer(c as never);
      return !!a && a.instant && a.kind !== 'wipe';
    };
    for (const cd of g.hand.slice()) {
      const a = g.answer(cd);
      if (!a || !g.hand.includes(cd)) continue;
      if (a.kind === 'removal') {
        if (
          a.instant &&
          g.hand.filter(isHeld).length < 2 &&
          !(fireChance > 0 && prng.random() < fireChance)
        )
          continue;
        if (
          !bestTarget(i, a, (g.cfg.removal_min as number) ?? 45) ||
          !g.podCast(cd)
        )
          continue;
        removals[i]++;
        for (let k = 0; k < (a.count ?? 1); k++) {
          const hit = bestTarget(
            i,
            a,
            k === 0 ? ((g.cfg.removal_min as number) ?? 45) : 0,
          );
          if (!hit) break;
          hitWith(i, cd.name, hit.j, hit.t.p, a);
        }
      } else if (a.kind === 'wipe' && a.wipe !== 'attackers') {
        const mine = boardPower(i),
          top = Math.max(0, ...living(i).map(boardPower));
        if (!(top >= ((g.cfg.wipe_at as number) ?? 10) && mine * 2 <= top))
          continue;
        const everyone = [i, ...living(i)];
        const all = everyone.flatMap((k) =>
          games[k].creatures().map((p) => ({
            k,
            p,
            pw: games[k].power(p),
            tg: games[k].toughness(p),
          })),
        );
        let pay = 0;
        if (cd.name === 'Toxic Deluge') {
          pay = Math.max(0, ...all.filter((x) => x.k !== i).map((x) => x.tg));
          if (g.myLife - pay <= 10) continue;
        }
        const own = all.filter((x) => x.k === i).map((x) => x.pw);
        const floor = Math.min(...(own.length ? own : all.map((x) => x.pw)));
        const dies = all.filter((x) =>
          a.wipe === 'power3'
            ? x.pw >= 3
            : a.wipe === 'bigger'
              ? x.pw > floor
              : true,
        );
        if (!dies.some((x) => x.k !== i) || !g.podCast(cd)) continue;
        if (pay) g.loseLife(pay);
        removals[i]++;
        say(
          `R${round} ${name(i)}: ${cd.name}: ${dies.length} creature(s) ${a.wipe === 'bounce' ? 'return to hand' : 'die'}`,
        );
        for (const x of dies)
          games[x.k].podRemove(x.p, a.wipe === 'bounce' ? 'bounce' : 'destroy');
      }
    }
  };

  // ---------------------------------------------------------------- answering a win, countering a spell (step 3)
  arena.answerWin = (g) => {
    if (!interact) return false;
    const i = games.indexOf(g);
    const w = g.winAttempt();
    if (!w || (!w.spells.length && !w.perms.length)) return false;
    tried[i]++;
    say(`R${round}: ${name(i)} goes for the win`);
    const need = w.backup + 1;
    type Used = {
      j: number;
      card: string;
      target: string;
      how: string;
      shield?: string;
      a: Answer;
    };
    const used: Used[] = [];
    for (const j of opps[i]) {
      if (!alive[j] || used.filter((u) => !u.shield).length >= need) continue;
      for (const r of games[j].podRespond(
        w,
        need - used.filter((u) => !u.shield).length,
        g,
      ))
        used.push({ j, ...r });
    }
    for (const u of used) {
      answers[u.j]++;
      if (u.shield) {
        shields[i]++;
        say(
          `R${round}: ${name(u.j)}'s ${u.card} on ${u.target} is countered by ${u.shield}`,
        );
      }
    }
    const real = used.filter((u) => !u.shield);
    const back = g.podBurnCounters(real.slice(0, w.backup).map((u) => u.card)); // the winner answers back
    for (let k = 0; k < back.length; k++)
      say(
        `R${round}: ${name(real[k].j)}'s ${real[k].card} is countered by ${name(i)}'s ${back[k]}`,
      );
    const through = real.slice(back.length);
    if (!through.length) return false;
    stopped[i]++;
    const last = through[0];
    g.podLose(last.target, last.how, last.a);
    g.podWinStopped();
    say(
      `R${round}: ${name(last.j)} stops it: ${last.card} on ${last.target}. ${name(i)} plays on.`,
    );
    return true;
  };
  arena.counter = (g, cd) => {
    if (!interact) return false;
    const i = games.indexOf(g);
    const wgt = g.podWeight(cd);
    if (wgt < counterAt) return false;
    for (const j of opps[i]) {
      if (!alive[j]) continue;
      const d = games[j];
      const ok = d.hand.filter((c) => {
        const a = d.answer(c);
        return (
          a?.kind === 'counter' &&
          Game.spellOk(a, cd) &&
          d.canPay(d.answerCost(c), true)
        );
      });
      if (!ok.length) continue;
      const top = living(j).every((k) => k === i || threats[k] <= threats[i]);
      const held = d.hand.filter((c) => d.answer(c)?.kind === 'counter').length;
      if (!(wgt >= counterAny || (top && held >= 2))) continue;
      const c = ok[0];
      d.podCast(c);
      answers[j]++;
      const back = g.hand.find((x) => {
        const a = g.answer(x);
        return (
          a?.kind === 'counter' &&
          Game.spellOk(a, c) &&
          g.canPay(g.answerCost(x), true)
        );
      });
      if (back) {
        g.podCast(back);
        say(
          `R${round} ${name(j)}: ${c.name} on ${cd.name}; ${name(i)} counters it with ${back.name}`,
        );
        return false;
      }
      countered[i]++;
      say(`R${round} ${name(j)}: counters ${cd.name} with ${c.name}`);
      return true;
    }
    return false;
  };
  arena.go = (g) => {
    const i = games.indexOf(g);
    if (policy(i) !== 'window') return true;
    const open = living(i).every(
      (j) => games[j].openMana() <= windowMana || games[j].hand.length === 0,
    );
    if (!open) g.mode = 'protected'; // keep the kill intact for the rest of the turn and look for backup
    return open;
  };
  // ---------------------------------------------------------------- whom to attack (step 4)
  arena.prefer = (g, slot) => {
    const i = games.indexOf(g),
      j = opps[i][slot];
    const jitter = prng.random() * 2;
    if (mode === 'leader') {
      const top = Math.max(1, ...living(i).map((k) => threats[k]));
      return (12 * threats[j]) / top + jitter;
    }
    if (mode === 'spread') return -dealt[i][j] / 3 + jitter;
    if (mode === 'weakest') return 12 * (1 - games[j].myLife / 40) + jitter;
    return 0;
  };
  // ---------------------------------------------------------------- keeping the decks' views of each other in step
  // Each game holds its opponents as arrays (life / lib / poison). `base` is what the pod last wrote there; what a game
  // changed since then is applied to the real players (and to every other game's view of them).
  const base = games.map(() => ({
    life: [] as number[],
    lib: [] as number[],
    poison: [] as number[],
  }));
  const refresh = (k: number) => {
    const g = games[k],
      o = opps[k];
    const lib = o.map((j) => (alive[j] ? games[j].library.length : 0));
    g.life = o.map((j) => (alive[j] ? games[j].myLife : 0));
    g.lib = lib.slice();
    g.poison = o.map((j) => poison[j]);
    base[k] = { life: g.life.slice(), lib, poison: g.poison.slice() };
  };
  const touch = (
    k: number,
    j: number,
    what: 'life' | 'lib' | 'poison',
    n: number,
  ) => {
    for (let m = 0; m < n0; m++) {
      if (m === k || m === j) continue;
      const s = opps[m].indexOf(j);
      if (s < 0 || base[m][what].length <= s) continue;
      games[m][what][s] -= n;
      base[m][what][s] -= n;
    }
  };
  const applyOut = (k: number) => {
    const g = games[k],
      o = opps[k],
      b = base[k];
    if (!b.life.length) return;
    o.forEach((j, s) => {
      if (!alive[j]) return;
      const lost = b.life[s] - g.life[s];
      if (lost > 0) {
        games[j].loseLife(lost);
        dealt[k][j] += lost;
        touch(k, j, 'life', lost);
      }
      const milled = Math.min(b.lib[s] - g.lib[s], games[j].library.length);
      if (milled > 0) {
        for (let x = 0; x < milled; x++)
          games[j].toGy(games[j].library.shift()!, true);
        touch(k, j, 'lib', milled);
      }
      const pois = g.poison[s] - b.poison[s];
      if (pois > 0) {
        poison[j] += pois;
        touch(k, j, 'poison', -pois);
      }
    });
    base[k] = {
      life: g.life.slice(),
      lib: g.lib.slice(),
      poison: g.poison.slice(),
    };
  };
  let depth = 0;
  /** Something happens outside the turn order (a block, removal, an answer): the other decks' triggers count too. */
  const offTurn = <T>(fn: () => T): T => {
    if (depth > 0) return fn();
    depth++;
    try {
      if (cur >= 0) applyOut(cur);
      const ks = games.map((_, k) => k).filter((k) => k !== cur && alive[k]);
      const lens = ks.map((k) => games[k].log.length);
      for (const k of ks) refresh(k);
      const r = fn();
      ks.forEach((k, x) => {
        applyOut(k);
        if (verbose)
          for (const l of games[k].log.slice(lens[x])) {
            flush();
            log.push(`R${round} ${name(k)}: ${l.replace(/^T\d+: /, '')}`);
          }
      });
      return r;
    } finally {
      depth--;
    }
  };
  {
    const f0 = arena.fight,
      e0 = arena.edict,
      s0 = arena.snipe,
      w0 = arena.answerWin,
      c0 = arena.counter;
    arena.fight = (g, slot, att, apply) =>
      apply ? offTurn(() => f0(g, slot, att, apply)) : f0(g, slot, att, apply);
    arena.edict = (g, nontoken) => offTurn(() => e0(g, nontoken));
    arena.snipe = (g, a) => offTurn(() => s0(g, a));
    arena.answerWin = (g) => offTurn(() => w0(g));
    arena.counter = (g, cd) => offTurn(() => c0(g, cd));
  }
  // ---------------------------------------------------------------- "each player" effects
  arena.wheel = (g, mine) =>
    offTurn(() => {
      const i = games.indexOf(g);
      const n = Math.max(mine, ...living(i).map((j) => games[j].hand.length));
      for (const j of living(i)) {
        const d = games[j];
        for (const c of d.hand.splice(0)) d.toGy(c);
        d.draw(n);
      }
      say(`R${round}: every other player discards its hand and draws ${n}`);
      return n;
    });
  arena.eachDraws = (g, k) =>
    offTurn(() => {
      for (const j of living(games.indexOf(g))) games[j].draw(k);
    });
  if (real) for (const g of games) g.arena = arena;
  const sweep = (round: number) => {
    for (let j = 0; j < n; j++) {
      if (!alive[j]) continue;
      if (cmdDead.has(j)) eliminate(j, 'commander', round);
      else if (games[j].myLife <= 0 || games[j].died)
        eliminate(j, 'life', round);
      else if (poison[j] >= 10) eliminate(j, 'poison', round);
    }
  };
  const done = (winner: number | null, turn: number, how: string): PodGame => ({
    winner,
    turn,
    how,
    out,
    why,
    tried,
    stopped,
    answers,
    countered,
    removals,
    removed,
    waited,
    shields,
    seat,
    log: verbose ? log : undefined,
  });

  for (const g of games) g.setup();
  for (round = 1; round <= spec.cap; round++) {
    for (const i of order) {
      if (!alive[i]) continue;
      const g = games[i];
      if (g.library.length === 0 && !decks[i].ownsDecking) {
        // would draw from an empty library
        eliminate(i, 'decked', round);
        const left = alive.flatMap((a, j) => (a ? [j] : []));
        if (left.length === 1) {
          say(`R${round}: ${name(left[0])} WINS (last standing)`);
          return done(left[0], round, 'last standing');
        }
        continue;
      }
      // the other players, as this game's opponents (the engine takes 1 off each living opponent's library at the start of a turn)
      refresh(i);
      if (g.turn >= 1)
        g.lib = g.lib.map((x, k) => (alive[opps[i][k]] ? x + 1 : x));
      g.podHold = holdChance >= 1 || prng.random() < holdChance;
      g.pendingCrackback = 0; // no goldfish crackback in a pod: the other decks attack for real
      fog = false;
      blocked = new Set();
      for (let k = 0; k < n; k++) threats[k] = alive[k] ? games[k].threat() : 0;
      for (const x of games) x.podShielded.clear();
      const pol = policy(i);
      if (real)
        g.mode =
          pol === 'protected' || (pol === 'mixed' && round < protectUntil)
            ? 'protected'
            : 'any';
      const waits0 = g.podWaits;
      cur = i;
      curAt = g.log.length;
      curRound = round;
      const ended = g.takeTurn();
      g.pendingCrackback = 0;
      flush();
      cur = -1;
      if (g.podWaits > waits0) waited[i]++;
      // what this turn did to the others
      applyOut(i);
      if (g.died) eliminate(i, 'its own doing', round);
      sweep(round);
      const left = alive.flatMap((a, j) => (a ? [j] : []));
      if (ended && alive[i]) {
        // the deck says it has won: a combo, a kill line, or its own win rule (step 1: nobody can stop it)
        const how = left.length === 1 ? 'last standing' : 'declared';
        say(`R${round}: ${name(i)} WINS (${how})`);
        return done(i, round, how);
      }
      if (left.length === 1) {
        say(`R${round}: ${name(left[0])} WINS (last standing)`);
        return done(left[0], round, 'last standing');
      }
      if (left.length === 0) return done(null, round, 'nobody left');
      if (interact && alive[i]) offTurn(() => afterTurn(i));
    }
  }
  return done(null, spec.cap, 'cap');
}

export function runPodJob(
  all: Record<string, Deck>,
  job: PodJob,
): PodJobResult {
  const r: PodJobResult = { games: [], errors: [] };
  for (const s of job.seeds) {
    try {
      r.games.push(playPod(all, job.pod, s));
    } catch (e) {
      r.errors.push([
        s,
        e instanceof Error ? (e.stack ?? e.message) : String(e),
      ]);
    }
  }
  return r;
}

/** Play seeds 1..n in worker threads (the same bundle runs as each worker; see sim.ts). */
export async function simulatePod(
  spec: PodSpec,
  n: number,
  workers: number,
  duty: number,
): Promise<PodJobResult> {
  const seeds = Array.from({ length: n }, (_, i) => i + 1);
  const chunk = Math.max(1, Math.floor(n / (workers * 8)));
  const jobs: PodJob[] = [];
  for (let i = 0; i < n; i += chunk)
    jobs.push({ pod: spec, seeds: seeds.slice(i, i + chunk) });
  const results: PodJobResult[] = new Array(jobs.length);
  let next = 0;
  const pool = Array.from(
    { length: Math.min(workers, jobs.length) },
    () => new Worker(__filename, { workerData: 'sim-worker' }),
  );
  await Promise.all(
    pool.map(
      (w) =>
        new Promise<void>((resolve, reject) => {
          const give = () => {
            if (next >= jobs.length) {
              w.terminate().then(() => resolve());
              return;
            }
            const idx = next++;
            const t0 = Date.now();
            w.once('message', (r: PodJobResult) => {
              results[idx] = r;
              const rest =
                duty < 100 ? (Date.now() - t0) * (100 / duty - 1) : 0;
              if (rest > 1) setTimeout(give, rest);
              else give();
            });
            w.postMessage(jobs[idx]);
          };
          w.on('error', reject);
          give();
        }),
    ),
  );
  const all: PodJobResult = {
    games: results.flatMap((r) => r.games),
    errors: results.flatMap((r) => r.errors),
  };
  if (all.errors.length)
    console.log(
      `!! ${all.errors.length} game(s) hit a simulator bug and were skipped (seeds ${all.errors
        .slice(0, 10)
        .map((e) => e[0])
        .join(', ')}). First error:\n${all.errors[0][1]}`,
    );
  return all;
}

/** The report: win rate, win turns (average, 10th and 90th percentile), how the wins came, first out, win rate by seat. */
export function printPod(spec: PodSpec, games: PodGame[]): void {
  const n = spec.decks.length,
    total = games.length;
  const pct = (x: number, of = total) =>
    (of ? ((100 * x) / of).toFixed(1) : '-').padStart(6) + '%';
  const label = spec.decks.map(
    (d, i) => d + (spec.decks.indexOf(d) !== i ? `#${i + 1}` : ''),
  );
  const w = Math.max(10, ...label.map((l) => l.length)) + 2;
  console.log(
    `\n${total} pod games, ${n} players, at most ${spec.cap} rounds. An even pod would give each deck ${(100 / n).toFixed(0)}%.`,
  );
  console.log(
    `Noise: about +/-${(196 * Math.sqrt(0.25 / Math.max(1, total))).toFixed(0)} points on a win rate.\n`,
  );
  console.log(
    'deck'.padEnd(w) +
      '   wins  avg turn  10%-90% turn  declared  standing  out first  ' +
      Array.from({ length: n }, (_, s) => `seat ${s + 1}`.padStart(8)).join(''),
  );
  for (let i = 0; i < n; i++) {
    const won = games.filter((g) => g.winner === i);
    const turns = won.map((g) => g.turn).sort((a, b) => a - b);
    const q = (p: number) =>
      turns.length
        ? String(
            turns[Math.min(turns.length - 1, Math.floor(p * turns.length))],
          )
        : '-';
    const avg = turns.length
      ? (turns.reduce((s, x) => s + x, 0) / turns.length).toFixed(2)
      : '-';
    const bySeat = Array.from({ length: n }, (_, s) => {
      const sat = games.filter((g) => g.seat[i] === s);
      return pct(sat.filter((g) => g.winner === i).length, sat.length).padStart(
        8,
      );
    }).join('');
    console.log(
      label[i].padEnd(w) +
        pct(won.length) +
        avg.padStart(10) +
        `${q(0.1)}-${q(0.9)}`.padStart(14) +
        pct(
          won.filter((g) => g.how === 'declared').length,
          won.length,
        ).padStart(10) +
        pct(
          won.filter((g) => g.how === 'last standing').length,
          won.length,
        ).padStart(10) +
        pct(games.filter((g) => g.out[0] === i).length).padStart(11) +
        '  ' +
        bySeat,
    );
  }
  const rounds = [4, 5, 6, 7, 8, 9, 10, 11, 12, 14].filter(
    (r) => r <= spec.cap,
  );
  console.log('\nWon by the end of round (share of all games):');
  console.log(
    'deck'.padEnd(w) + rounds.map((r) => String(r).padStart(7)).join(''),
  );
  for (let i = 0; i < n; i++)
    console.log(
      label[i].padEnd(w) +
        rounds
          .map((r) =>
            pct(games.filter((g) => g.winner === i && g.turn <= r).length),
          )
          .join(''),
    );
  const draws = games.filter((g) => g.winner === null).length;
  const ends = games.filter((g) => g.winner !== null).map((g) => g.turn);
  console.log(
    `\nNo winner by round ${spec.cap}: ${pct(draws).trim()}. Average game length: ${ends.length ? (ends.reduce((s, x) => s + x, 0) / ends.length).toFixed(2) : '-'} rounds.`,
  );
  const sum = (xs: number[]) => xs.reduce((t, x) => t + x, 0);
  if (
    games.some((g) => sum(g.tried) + sum(g.removals) + sum(g.countered) > 0)
  ) {
    console.log('\nInteraction, per game:');
    console.log(
      'deck'.padEnd(w) +
        '  win attempts   stopped  turns waited  spells countered  removal taken  shielded  answers used  removal / wipes cast',
    );
    for (let i = 0; i < n; i++) {
      const at = sum(games.map((g) => g.tried[i])),
        st = sum(games.map((g) => g.stopped[i]));
      const per = (f: (g: PodGame) => number, width: number) =>
        (sum(games.map(f)) / total).toFixed(2).padStart(width);
      console.log(
        label[i].padEnd(w) +
          (at / total).toFixed(2).padStart(14) +
          (at ? pct(st, at) : '      -').padStart(10) +
          per((g) => g.waited[i], 14) +
          per((g) => g.countered[i], 18) +
          per((g) => g.removed[i], 15) +
          per((g) => g.shields[i], 10) +
          (sum(games.map((g) => g.answers[i])) / total)
            .toFixed(2)
            .padStart(14) +
          (sum(games.map((g) => g.removals[i])) / total)
            .toFixed(2)
            .padStart(22),
      );
    }
  }
  const reasons = ['life', 'commander', 'poison', 'decked', 'its own doing'];
  console.log(
    '\nHow each deck went out (share of its games): ' +
      label
        .map((l, i) => {
          const parts = reasons
            .map(
              (r) =>
                [r, games.filter((g) => g.why[i] === r).length] as [
                  string,
                  number,
                ],
            )
            .filter((x) => x[1] > 0);
          return (
            `${l}: ` +
            (parts.length
              ? parts.map(([r, c]) => `${r} ${pct(c).trim()}`).join(', ')
              : 'never')
          );
        })
        .join('; ') +
      '.',
  );
  console.log(
    `"declared" = the deck's own win (a combo, a kill line, its win rule) with others still alive; "standing" = it was the last one left.`,
  );
}

/** Parse "gale" or "gale:lists/proposed.txt" into a deck and its list file. */
export function podSpec(
  all: Record<string, Deck>,
  args: string[],
  cap: number,
  set: Config,
  threat?: string,
  policyArg?: string,
): PodSpec {
  if (args.length < 3 || args.length > 6)
    throw new Error(
      `a pod has 3 to 6 decks (got ${args.length}); decks: ${Object.keys(all).join(', ')}`,
    );
  const decks: string[] = [],
    files: string[] = [];
  for (const a of args) {
    const [d, l] = a.split(':');
    const deck = all[d];
    if (!deck)
      throw new Error(
        `unknown deck ${d}; choose from ${Object.keys(all).join(', ')}`,
      );
    decks.push(d);
    files.push(resolveList(deck, l ?? deck.defaultList));
  }
  if (threat && !['leader', 'spread', 'weakest', 'damage'].includes(threat))
    throw new Error(
      `threat=${threat}: choose leader, spread, weakest or damage`,
    );
  const policy: Record<string, string> = {};
  for (const p of (policyArg ?? '').split(',').filter(Boolean)) {
    const [d, v] = p.split(':');
    if (
      !decks.includes(d) ||
      !['any', 'protected', 'mixed', 'window'].includes(v)
    )
      throw new Error(
        `policy=${p}: use deck:any|protected|mixed|window (e.g. policy=gale:window)`,
      );
    policy[d] = v;
  }
  return { decks, lists: files, cap, set, threat, policy };
}

export const cores = (): number =>
  os.availableParallelism?.() ?? os.cpus().length;
