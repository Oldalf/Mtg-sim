/** Checks of the pod's shared blocking rule on hand-built combats. Run: npm run pod -- --test */
import { Evasion, Fighter, Perm } from './game-types';
import { assignBlocks, duel } from './pod-blocking';
import { ANSWERS } from './answers';
import * as C from './cards';
import { Rng } from './rng';
import { CFG as MIKE_CFG } from '../decks/mike/config';
import { MikeGame, VNWXT, MANIAC, JACE } from '../decks/mike/game';

const many = (n: string, k: number) => new Array(k).fill(n) as string[];
/** A Mike board: untapped Islands, permanents, a hand; Vnwxt is the commander (in the command zone unless on the battlefield). */
function mike(islands: number, bf: string[], hand: string[]): MikeGame {
  const g = new MikeGame([VNWXT], many('Island', 40), new Rng(1), {
    ...MIKE_CFG,
  });
  g.startTurn();
  g.turn = 6;
  for (const n of [...many('Island', islands), ...bf]) {
    const cd = C.get(n);
    const p = new Perm(cd, cd.land);
    p.sick = false;
    g.bf.push(p);
    if (n === VNWXT) g.command = [];
  }
  g.hand = hand.map((n) => C.get(n));
  return g;
}

let id = 0;
/** A creature: f("Bear", 2, 2). opts: evasion, air (flying or reach), deathtouch, value (default 10 + 10 x power), commander. */
function f(
  name: string,
  power: number,
  toughness: number,
  o: Partial<Fighter> & { evasion?: Evasion } = {},
): Fighter {
  return {
    p: { id: id++ } as unknown as Perm,
    name,
    power,
    toughness,
    evasion: 'none',
    air: false,
    deathtouch: false,
    value: 10 + 10 * power,
    commander: false,
    ...o,
  };
}

export function runPodTests(): boolean {
  let ok = true;
  const check = (label: string, got: unknown, expect: unknown) => {
    const good = JSON.stringify(got) === JSON.stringify(expect);
    console.log(
      `${good ? 'OK ' : 'BAD'} ${label}: got ${JSON.stringify(got)}, expected ${JSON.stringify(expect)}`,
    );
    ok = ok && good;
  };
  /** Who blocks each attacker (null = nobody), at this life. */
  const blocks = (att: Fighter[], blk: Fighter[], life = 40) =>
    assignBlocks(
      att,
      blk,
      life,
      (open) => open.reduce((s, a) => s + a.power, 0) >= life,
    ).map((b) => (b ? b.name : null));
  const token = { value: 5 };

  check(
    'a blocker that survives and kills blocks',
    blocks([f('Bear', 2, 2)], [f('Giant', 4, 4)]),
    ['Giant'],
  );
  check(
    "a wall that survives blocks even if it can't kill",
    blocks([f('Bear', 2, 2)], [f('Wall', 0, 4)]),
    ['Wall'],
  );
  check(
    'no block that only loses the blocker (life is high)',
    blocks([f('Giant', 4, 4)], [f('Bear', 2, 2)]),
    [null],
  );
  check(
    'a trade when the blocker is worth less',
    blocks([f('Ogre', 4, 2, { value: 50 })], [f('Bear', 2, 2, { value: 30 })]),
    ['Bear'],
  );
  check(
    'no trade when the blocker is worth more',
    blocks([f('Elf', 2, 2, { value: 20 })], [f('Engine', 2, 2, { value: 60 })]),
    [null],
  );
  check(
    'a deathtouch blocker trades with a big attacker',
    blocks(
      [f('Titan', 6, 6, { value: 70 })],
      [f('Snake', 1, 1, { deathtouch: true, ...token })],
    ),
    ['Snake'],
  );
  check(
    "a deathtouch attacker: no 'safe' block",
    blocks(
      [f('Asp', 1, 1, { deathtouch: true, value: 20 })],
      [f('Giant', 4, 4, { value: 60 })],
    ),
    [null],
  );
  check(
    'flying: only flying or reach blocks',
    blocks(
      [f('Drake', 2, 2, { evasion: 'flying' })],
      [f('Giant', 4, 4), f('Spider', 1, 3, { air: true })],
    ),
    ['Spider'],
  );
  check(
    'unblockable is never blocked, even when lethal',
    blocks(
      [f('Blade', 5, 1, { evasion: 'unblockable' })],
      [f('Giant', 4, 4)],
      5,
    ),
    [null],
  );
  check(
    "skulk: a creature with greater power can't block",
    blocks([f('Gollum', 1, 2, { evasion: 'skulk' })], [f('Giant', 4, 4)]),
    [null],
  );
  check(
    'skulk: a creature with equal or less power can',
    blocks([f('Gollum', 1, 2, { evasion: 'skulk' })], [f('Wall', 0, 4)]),
    ['Wall'],
  );
  check(
    'lethal: chump the biggest attacker with the cheapest creature',
    blocks(
      [f('Giant', 6, 6), f('Bear', 2, 2)],
      [
        f('Elf', 1, 1, { value: 20 }),
        f('Commander', 1, 1, { value: 130, commander: true }),
      ],
      7,
    ),
    ['Elf', null],
  );
  check(
    'lethal: even the commander chumps when that is what it takes',
    blocks(
      [f('Giant', 6, 6), f('Ogre', 5, 5)],
      [
        f('Elf', 1, 1, { value: 20 }),
        f('Commander', 1, 1, { value: 130, commander: true }),
      ],
      5,
    ),
    ['Elf', 'Commander'],
  );
  check(
    "not lethal, life stays high: the token doesn't chump",
    blocks([f('Giant', 6, 6)], [f('Zombie', 2, 2, token)], 30),
    [null],
  );
  check(
    'life would drop to 10 or less: a token chumps',
    blocks([f('Giant', 6, 6)], [f('Zombie', 2, 2, token)], 15),
    ['Zombie'],
  );
  check(
    "life would drop to 10 or less: a valuable creature doesn't chump",
    blocks([f('Giant', 6, 6)], [f('Engine', 1, 1, { value: 50 })], 15),
    [null],
  );
  check(
    'an 8-power attacker is chumped by a token at any life',
    blocks([f('Kraken', 8, 8)], [f('Zombie', 2, 2, token)], 40),
    ['Zombie'],
  );
  check(
    'one blocker blocks one attacker (the biggest it can safely stop)',
    blocks([f('Bear', 2, 2), f('Ogre', 3, 3)], [f('Giant', 4, 4)]),
    [null, 'Giant'],
  );

  // ---- first strike, menace
  check(
    'first strike: the attacker kills the blocker before it deals damage',
    duel(f('Knight', 2, 2, { first: true }), f('Bear', 2, 2)),
    { aDies: false, bDies: true },
  );
  check(
    'first strike on the blocker',
    duel(f('Bear', 2, 2), f('Knight', 2, 2, { first: true })),
    { aDies: true, bDies: false },
  );
  check(
    "first strike that doesn't kill: normal damage both ways",
    duel(f('Squire', 1, 1, { first: true }), f('Bear', 2, 2)),
    { aDies: true, bDies: false },
  );
  check(
    'no block into a first striker that would kill the blocker first',
    blocks([f('Knight', 3, 1, { first: true })], [f('Bear', 2, 2)]),
    [null],
  );
  check(
    "menace: one blocker can't block",
    blocks([f('Rogue', 2, 2, { menace: true })], [f('Giant', 4, 4)]),
    [null],
  );
  check(
    'menace: two blockers can',
    blocks(
      [f('Rogue', 2, 2, { menace: true })],
      [f('Giant', 4, 4), f('Elf', 1, 1)],
    ),
    ['Giant'],
  );
  check(
    '... and both are used up',
    blocks(
      [f('Rogue', 2, 2, { menace: true }), f('Bear', 2, 2)],
      [f('Giant', 4, 4), f('Elf', 1, 1)],
    ),
    ['Giant', null],
  );

  // ---- answers (step 3)
  const cards = (xs: { card: string; target: string }[]) =>
    xs.map((x) => `${x.card} > ${x.target}`);
  let g = mike(2, [], ['Negate']);
  check(
    'Negate counters a noncreature key spell',
    cards(
      g.podRespond(
        { spells: ['Traumatize'], perms: [], backup: 0 },
        1,
        mike(0, [], []),
      ),
    ),
    ['Negate > Traumatize'],
  );
  check(
    'the answer is cast: card to the graveyard, lands tapped',
    [g.hand.length, g.gy.map((c) => c.name), g.openMana()],
    [0, ['Negate'], 0],
  );
  g = mike(2, [], ['Negate']);
  check(
    "Negate can't counter a creature spell",
    cards(
      g.podRespond(
        { spells: [MANIAC], perms: [], backup: 0 },
        1,
        mike(0, [], []),
      ),
    ),
    [],
  );
  g = mike(1, [], ['Negate']);
  check(
    'no answer without the mana open',
    cards(
      g.podRespond(
        { spells: ['Traumatize'], perms: [], backup: 0 },
        1,
        mike(0, [], []),
      ),
    ),
    [],
  );
  g = mike(2, [], ['Refute', 'Negate']);
  check(
    'a counterspell needs a spell on the stack: none against a permanent-only win',
    cards(
      g.podRespond(
        { spells: [], perms: [MANIAC], backup: 0 },
        1,
        mike(0, [MANIAC], []),
      ),
    ),
    [],
  );
  g = mike(1, [], ['Pongify']);
  check(
    'creature removal takes the creature, not the planeswalker',
    cards(
      g.podRespond(
        { spells: [], perms: [JACE, MANIAC], backup: 0 },
        1,
        mike(0, [JACE, MANIAC], []),
      ),
    ),
    ['Pongify > ' + MANIAC],
  );
  g = mike(1, [], ['Pongify']);
  check(
    'creature removal has no target in a planeswalker-only win',
    cards(
      g.podRespond(
        { spells: [], perms: [JACE], backup: 0 },
        1,
        mike(0, [JACE], []),
      ),
    ),
    [],
  );
  g = mike(5, [], ['Pongify', 'Negate', 'Rapid Hybridization']);
  check(
    'two answers when the winner has backup',
    cards(
      g.podRespond(
        { spells: [], perms: [MANIAC], backup: 1 },
        2,
        mike(0, [MANIAC], []),
      ),
    ),
    ['Pongify > ' + MANIAC, 'Rapid Hybridization > ' + MANIAC],
  );
  g = mike(4, [MANIAC], ['Negate', 'Pongify']);
  g.turn = 6;
  check(
    'mana is held up for the cheapest instant answer (from round 5)',
    [g.answerCost(C.get('Pongify')).mv, g.answerCost(C.get('Negate')).mv],
    [1, 2],
  );
  // ---- legal targets and shields
  g = mike(2, [], ['Go for the Throat']);
  check(
    "Go for the Throat can't target an artifact creature",
    cards(
      g.podRespond(
        { spells: [], perms: ['Diversion Unit'], backup: 0 },
        1,
        mike(0, ['Diversion Unit'], []),
      ),
    ),
    [],
  );
  g = mike(2, [], ['Heartless Act']);
  let o = mike(0, [MANIAC], []);
  o.perm(MANIAC)!.counters = 1;
  check(
    "Heartless Act can't destroy a creature with counters",
    cards(g.podRespond({ spells: [], perms: [MANIAC], backup: 0 }, 1, o)),
    [],
  );
  g = mike(1, [], ['Swords to Plowshares']);
  check(
    "hexproof: Living Conundrum can't be targeted",
    cards(
      g.podRespond(
        { spells: [], perms: ['Living Conundrum'], backup: 0 },
        1,
        mike(0, ['Living Conundrum'], []),
      ),
    ),
    [],
  );
  g = mike(2, [], ['Pongify', 'Rapid Hybridization']);
  o = mike(1, [MANIAC, 'Siren Stormtamer'], []);
  const r = g.podRespond({ spells: [], perms: [MANIAC], backup: 0 }, 1, o);
  check(
    'Siren Stormtamer counters the first removal; the second gets through',
    r.map((x) => `${x.card}:${x.shield ?? 'hit'}`),
    ['Pongify:Siren Stormtamer', 'Rapid Hybridization:hit'],
  );
  check('... and Stormtamer is sacrificed', o.onBf('Siren Stormtamer'), false);
  o = mike(0, [MANIAC, 'Kira, Great Glass-Spinner'], []);
  check(
    'Kira counters the first spell at each creature each turn',
    [o.podShield(o.perm(MANIAC)!), o.podShield(o.perm(MANIAC)!)],
    ['Kira, Great Glass-Spinner', null],
  );
  o = mike(3, [MANIAC], []);
  o.podSuffer(o.perm(MANIAC)!, ANSWERS['Pongify']);
  check(
    'Pongify: the owner gets a 3/3',
    o.creatures().map((p) => `${p.cd.power}/${p.cd.toughness}`),
    ['3/3'],
  );
  o = mike(3, [MANIAC], []);
  o.myLife = 30;
  o.podSuffer(o.perm(MANIAC)!, ANSWERS['Swords to Plowshares']);
  check(
    'Swords: the owner gains life equal to the power',
    o.myLife,
    30 + C.get(MANIAC).power,
  );
  // losing the card the win was stopped at
  g = mike(3, [MANIAC], []);
  g.podLose(MANIAC, 'destroy');
  check(
    'a destroyed key creature goes to the graveyard',
    [g.onBf(MANIAC), g.gy.map((c) => c.name)],
    [false, [MANIAC]],
  );
  g = mike(6, [], ['Traumatize']);
  g.podLose('Traumatize', 'countered');
  check(
    'a countered spell: card in the graveyard, its mana spent',
    [g.hand.length, g.gy.map((c) => c.name), g.openMana()],
    [0, ['Traumatize'], 1],
  );
  // commanders
  g = mike(3, [VNWXT], []);
  const vn = g.perm(VNWXT)!;
  check(
    'a commander on the battlefield is known as one',
    [g.isCommander(vn), g.blockValue(vn) > 100],
    [true, true],
  );
  g.podRemove(vn, 'destroy');
  check(
    'a removed commander returns to the command zone',
    [g.onBf(VNWXT), g.command.map((c) => c.name), g.gy.length],
    [false, [VNWXT], 0],
  );
  g = mike(3, [VNWXT], []);
  g.podLose(VNWXT, 'exile');
  check(
    'a commander removed in response to the win goes to the command zone (castable again, with tax)',
    [g.onBf(VNWXT), g.command.map((c) => c.name)],
    [false, [VNWXT]],
  );
  // Mike's mill win stopped: Laboratory Maniac removed in response to the draw = we draw from an empty library and lose
  g = mike(3, [MANIAC], []);
  g.library = [];
  g.draw(1);
  g.podLose(MANIAC, 'destroy');
  g.podWinStopped();
  check(
    'Maniac removed in response to the winning draw: we lose',
    [g.milled, g.died],
    [false, true],
  );
  g = mike(3, [MANIAC, 'Living Conundrum'], []);
  g.library = [];
  g.draw(1);
  g.podLose(MANIAC, 'destroy');
  g.podWinStopped();
  check(
    '... unless Living Conundrum skips the draw',
    [g.milled, g.died],
    [false, false],
  );
  return ok;
}
