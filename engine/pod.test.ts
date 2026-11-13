/** Checks of the pod's shared blocking rule on hand-built combats. Run: npm run pod -- --test */
import { Evasion, Fighter, Permanent } from './game-types';
import { assignBlocks, duel } from './pod-blocking';
import { ANSWERS } from './answers';
import * as C from './cards';
import { Rng } from './rng';
import { CFG as MIKE_CFG } from '../decks/mike/config';
import { MikeGame } from '../decks/mike/game';
import { VNWXT, LABORATORY_MANIAC, JACE } from '../decks/mike/cards';

const repeatName = (cardName: string, count: number) =>
  new Array(count).fill(cardName) as string[];
/** A Mike board: untapped Islands, permanents, a hand; Vnwxt is the commander (in the command zone unless on the battlefield). */
function mike(
  islands: number,
  battlefieldNames: string[],
  hand: string[],
): MikeGame {
  const game = new MikeGame([VNWXT], repeatName('Island', 40), new Rng(1), {
    ...MIKE_CFG,
  });
  game.startTurn();
  game.turn = 6;
  for (const cardName of [
    ...repeatName('Island', islands),
    ...battlefieldNames,
  ]) {
    const card = C.get(cardName);
    const permanent = new Permanent(card, card.land);
    permanent.sick = false;
    game.battlefield.push(permanent);
    if (cardName === VNWXT) game.command = [];
  }
  game.hand = hand.map((cardName) => C.get(cardName));
  return game;
}

let nextPermanentId = 0;
/** A creature: f("Bear", 2, 2). opts: evasion, air (flying or reach), deathtouch, value (default 10 + 10 x power), commander. */
function makeFighter(
  name: string,
  power: number,
  toughness: number,
  overrides: Partial<Fighter> & { evasion?: Evasion } = {},
): Fighter {
  return {
    permanent: { id: nextPermanentId++ } as unknown as Permanent,
    name,
    power,
    toughness,
    evasion: 'none',
    air: false,
    deathtouch: false,
    value: 10 + 10 * power,
    commander: false,
    ...overrides,
  };
}

export function runPodTests(): boolean {
  let allPassed = true;
  const check = (label: string, got: unknown, expect: unknown) => {
    const good = JSON.stringify(got) === JSON.stringify(expect);
    console.log(
      `${good ? 'OK ' : 'BAD'} ${label}: got ${JSON.stringify(got)}, expected ${JSON.stringify(expect)}`,
    );
    allPassed = allPassed && good;
  };
  /** Who blocks each attacker (null = nobody), at this life. */
  const blocks = (attackers: Fighter[], blk: Fighter[], life = 40) =>
    assignBlocks(
      attackers,
      blk,
      life,
      (open) =>
        open.reduce((total, fighter) => total + fighter.power, 0) >= life,
    ).map((fighter) => (fighter ? fighter.name : null));
  const token = { value: 5 };

  check(
    'a blocker that survives and kills blocks',
    blocks([makeFighter('Bear', 2, 2)], [makeFighter('Giant', 4, 4)]),
    ['Giant'],
  );
  check(
    "a wall that survives blocks even if it can't kill",
    blocks([makeFighter('Bear', 2, 2)], [makeFighter('Wall', 0, 4)]),
    ['Wall'],
  );
  check(
    'no block that only loses the blocker (life is high)',
    blocks([makeFighter('Giant', 4, 4)], [makeFighter('Bear', 2, 2)]),
    [null],
  );
  check(
    'a trade when the blocker is worth less',
    blocks(
      [makeFighter('Ogre', 4, 2, { value: 50 })],
      [makeFighter('Bear', 2, 2, { value: 30 })],
    ),
    ['Bear'],
  );
  check(
    'no trade when the blocker is worth more',
    blocks(
      [makeFighter('Elf', 2, 2, { value: 20 })],
      [makeFighter('Engine', 2, 2, { value: 60 })],
    ),
    [null],
  );
  check(
    'a deathtouch blocker trades with a big attacker',
    blocks(
      [makeFighter('Titan', 6, 6, { value: 70 })],
      [makeFighter('Snake', 1, 1, { deathtouch: true, ...token })],
    ),
    ['Snake'],
  );
  check(
    "a deathtouch attacker: no 'safe' block",
    blocks(
      [makeFighter('Asp', 1, 1, { deathtouch: true, value: 20 })],
      [makeFighter('Giant', 4, 4, { value: 60 })],
    ),
    [null],
  );
  check(
    'flying: only flying or reach blocks',
    blocks(
      [makeFighter('Drake', 2, 2, { evasion: 'flying' })],
      [makeFighter('Giant', 4, 4), makeFighter('Spider', 1, 3, { air: true })],
    ),
    ['Spider'],
  );
  check(
    'unblockable is never blocked, even when lethal',
    blocks(
      [makeFighter('Blade', 5, 1, { evasion: 'unblockable' })],
      [makeFighter('Giant', 4, 4)],
      5,
    ),
    [null],
  );
  check(
    "skulk: a creature with greater power can't block",
    blocks(
      [makeFighter('Gollum', 1, 2, { evasion: 'skulk' })],
      [makeFighter('Giant', 4, 4)],
    ),
    [null],
  );
  check(
    'skulk: a creature with equal or less power can',
    blocks(
      [makeFighter('Gollum', 1, 2, { evasion: 'skulk' })],
      [makeFighter('Wall', 0, 4)],
    ),
    ['Wall'],
  );
  check(
    'lethal: chump the biggest attacker with the cheapest creature',
    blocks(
      [makeFighter('Giant', 6, 6), makeFighter('Bear', 2, 2)],
      [
        makeFighter('Elf', 1, 1, { value: 20 }),
        makeFighter('Commander', 1, 1, { value: 130, commander: true }),
      ],
      7,
    ),
    ['Elf', null],
  );
  check(
    'lethal: even the commander chumps when that is what it takes',
    blocks(
      [makeFighter('Giant', 6, 6), makeFighter('Ogre', 5, 5)],
      [
        makeFighter('Elf', 1, 1, { value: 20 }),
        makeFighter('Commander', 1, 1, { value: 130, commander: true }),
      ],
      5,
    ),
    ['Elf', 'Commander'],
  );
  check(
    "not lethal, life stays high: the token doesn't chump",
    blocks(
      [makeFighter('Giant', 6, 6)],
      [makeFighter('Zombie', 2, 2, token)],
      30,
    ),
    [null],
  );
  check(
    'life would drop to 10 or less: a token chumps',
    blocks(
      [makeFighter('Giant', 6, 6)],
      [makeFighter('Zombie', 2, 2, token)],
      15,
    ),
    ['Zombie'],
  );
  check(
    "life would drop to 10 or less: a valuable creature doesn't chump",
    blocks(
      [makeFighter('Giant', 6, 6)],
      [makeFighter('Engine', 1, 1, { value: 50 })],
      15,
    ),
    [null],
  );
  check(
    'an 8-power attacker is chumped by a token at any life',
    blocks(
      [makeFighter('Kraken', 8, 8)],
      [makeFighter('Zombie', 2, 2, token)],
      40,
    ),
    ['Zombie'],
  );
  check(
    'one blocker blocks one attacker (the biggest it can safely stop)',
    blocks(
      [makeFighter('Bear', 2, 2), makeFighter('Ogre', 3, 3)],
      [makeFighter('Giant', 4, 4)],
    ),
    [null, 'Giant'],
  );

  // ---- first strike, menace
  check(
    'first strike: the attacker kills the blocker before it deals damage',
    duel(
      makeFighter('Knight', 2, 2, { first: true }),
      makeFighter('Bear', 2, 2),
    ),
    { attackerDies: false, blockerDies: true },
  );
  check(
    'first strike on the blocker',
    duel(
      makeFighter('Bear', 2, 2),
      makeFighter('Knight', 2, 2, { first: true }),
    ),
    { attackerDies: true, blockerDies: false },
  );
  check(
    "first strike that doesn't kill: normal damage both ways",
    duel(
      makeFighter('Squire', 1, 1, { first: true }),
      makeFighter('Bear', 2, 2),
    ),
    { attackerDies: true, blockerDies: false },
  );
  check(
    'no block into a first striker that would kill the blocker first',
    blocks(
      [makeFighter('Knight', 3, 1, { first: true })],
      [makeFighter('Bear', 2, 2)],
    ),
    [null],
  );
  check(
    "menace: one blocker can't block",
    blocks(
      [makeFighter('Rogue', 2, 2, { menace: true })],
      [makeFighter('Giant', 4, 4)],
    ),
    [null],
  );
  check(
    'menace: two blockers can',
    blocks(
      [makeFighter('Rogue', 2, 2, { menace: true })],
      [makeFighter('Giant', 4, 4), makeFighter('Elf', 1, 1)],
    ),
    ['Giant'],
  );
  check(
    '... and both are used up',
    blocks(
      [makeFighter('Rogue', 2, 2, { menace: true }), makeFighter('Bear', 2, 2)],
      [makeFighter('Giant', 4, 4), makeFighter('Elf', 1, 1)],
    ),
    ['Giant', null],
  );

  // ---- answers (step 3)
  const cards = (answers: { card: string; target: string }[]) =>
    answers.map((x) => `${x.card} > ${x.target}`);
  let game = mike(2, [], ['Negate']);
  check(
    'Negate counters a noncreature key spell',
    cards(
      game.podRespond(
        { spells: ['Traumatize'], perms: [], backup: 0 },
        1,
        mike(0, [], []),
      ),
    ),
    ['Negate > Traumatize'],
  );
  check(
    'the answer is cast: card to the graveyard, lands tapped',
    [
      game.hand.length,
      game.graveyard.map((card) => card.name),
      game.openMana(),
    ],
    [0, ['Negate'], 0],
  );
  game = mike(2, [], ['Negate']);
  check(
    "Negate can't counter a creature spell",
    cards(
      game.podRespond(
        { spells: [LABORATORY_MANIAC], perms: [], backup: 0 },
        1,
        mike(0, [], []),
      ),
    ),
    [],
  );
  game = mike(1, [], ['Negate']);
  check(
    'no answer without the mana open',
    cards(
      game.podRespond(
        { spells: ['Traumatize'], perms: [], backup: 0 },
        1,
        mike(0, [], []),
      ),
    ),
    [],
  );
  game = mike(2, [], ['Refute', 'Negate']);
  check(
    'a counterspell needs a spell on the stack: none against a permanent-only win',
    cards(
      game.podRespond(
        { spells: [], perms: [LABORATORY_MANIAC], backup: 0 },
        1,
        mike(0, [LABORATORY_MANIAC], []),
      ),
    ),
    [],
  );
  game = mike(1, [], ['Pongify']);
  check(
    'creature removal takes the creature, not the planeswalker',
    cards(
      game.podRespond(
        { spells: [], perms: [JACE, LABORATORY_MANIAC], backup: 0 },
        1,
        mike(0, [JACE, LABORATORY_MANIAC], []),
      ),
    ),
    ['Pongify > ' + LABORATORY_MANIAC],
  );
  game = mike(1, [], ['Pongify']);
  check(
    'creature removal has no target in a planeswalker-only win',
    cards(
      game.podRespond(
        { spells: [], perms: [JACE], backup: 0 },
        1,
        mike(0, [JACE], []),
      ),
    ),
    [],
  );
  game = mike(5, [], ['Pongify', 'Negate', 'Rapid Hybridization']);
  check(
    'two answers when the winner has backup',
    cards(
      game.podRespond(
        { spells: [], perms: [LABORATORY_MANIAC], backup: 1 },
        2,
        mike(0, [LABORATORY_MANIAC], []),
      ),
    ),
    [
      'Pongify > ' + LABORATORY_MANIAC,
      'Rapid Hybridization > ' + LABORATORY_MANIAC,
    ],
  );
  game = mike(4, [LABORATORY_MANIAC], ['Negate', 'Pongify']);
  game.turn = 6;
  check(
    'mana is held up for the cheapest instant answer (from round 5)',
    [
      game.answerCost(C.get('Pongify')).manaValue,
      game.answerCost(C.get('Negate')).manaValue,
    ],
    [1, 2],
  );
  // ---- legal targets and shields
  game = mike(2, [], ['Go for the Throat']);
  check(
    "Go for the Throat can't target an artifact creature",
    cards(
      game.podRespond(
        { spells: [], perms: ['Diversion Unit'], backup: 0 },
        1,
        mike(0, ['Diversion Unit'], []),
      ),
    ),
    [],
  );
  game = mike(2, [], ['Heartless Act']);
  let mikeGame = mike(0, [LABORATORY_MANIAC], []);
  mikeGame.findPermanent(LABORATORY_MANIAC)!.counters = 1;
  check(
    "Heartless Act can't destroy a creature with counters",
    cards(
      game.podRespond(
        { spells: [], perms: [LABORATORY_MANIAC], backup: 0 },
        1,
        mikeGame,
      ),
    ),
    [],
  );
  game = mike(1, [], ['Swords to Plowshares']);
  check(
    "hexproof: Living Conundrum can't be targeted",
    cards(
      game.podRespond(
        { spells: [], perms: ['Living Conundrum'], backup: 0 },
        1,
        mike(0, ['Living Conundrum'], []),
      ),
    ),
    [],
  );
  game = mike(2, [], ['Pongify', 'Rapid Hybridization']);
  mikeGame = mike(1, [LABORATORY_MANIAC, 'Siren Stormtamer'], []);
  const response = game.podRespond(
    { spells: [], perms: [LABORATORY_MANIAC], backup: 0 },
    1,
    mikeGame,
  );
  check(
    'Siren Stormtamer counters the first removal; the second gets through',
    response.map((x) => `${x.card}:${x.shield ?? 'hit'}`),
    ['Pongify:Siren Stormtamer', 'Rapid Hybridization:hit'],
  );
  check(
    '... and Stormtamer is sacrificed',
    mikeGame.isOnBattlefield('Siren Stormtamer'),
    false,
  );
  mikeGame = mike(0, [LABORATORY_MANIAC, 'Kira, Great Glass-Spinner'], []);
  check(
    'Kira counters the first spell at each creature each turn',
    [
      mikeGame.podShield(mikeGame.findPermanent(LABORATORY_MANIAC)!),
      mikeGame.podShield(mikeGame.findPermanent(LABORATORY_MANIAC)!),
    ],
    ['Kira, Great Glass-Spinner', null],
  );
  mikeGame = mike(3, [LABORATORY_MANIAC], []);
  mikeGame.podSuffer(
    mikeGame.findPermanent(LABORATORY_MANIAC)!,
    ANSWERS['Pongify'],
  );
  check(
    'Pongify: the owner gets a 3/3',
    mikeGame
      .creatures()
      .map(
        (permanent) => `${permanent.card.power}/${permanent.card.toughness}`,
      ),
    ['3/3'],
  );
  mikeGame = mike(3, [LABORATORY_MANIAC], []);
  mikeGame.myLife = 30;
  mikeGame.podSuffer(
    mikeGame.findPermanent(LABORATORY_MANIAC)!,
    ANSWERS['Swords to Plowshares'],
  );
  check(
    'Swords: the owner gains life equal to the power',
    mikeGame.myLife,
    30 + C.get(LABORATORY_MANIAC).power,
  );
  // losing the card the win was stopped at
  game = mike(3, [LABORATORY_MANIAC], []);
  game.podLose(LABORATORY_MANIAC, 'destroy');
  check(
    'a destroyed key creature goes to the graveyard',
    [
      game.isOnBattlefield(LABORATORY_MANIAC),
      game.graveyard.map((card) => card.name),
    ],
    [false, [LABORATORY_MANIAC]],
  );
  game = mike(6, [], ['Traumatize']);
  game.podLose('Traumatize', 'countered');
  check(
    'a countered spell: card in the graveyard, its mana spent',
    [
      game.hand.length,
      game.graveyard.map((card) => card.name),
      game.openMana(),
    ],
    [0, ['Traumatize'], 1],
  );
  // commanders
  game = mike(3, [VNWXT], []);
  const otherPermanent = game.findPermanent(VNWXT)!;
  check(
    'a commander on the battlefield is known as one',
    [game.isCommander(otherPermanent), game.blockValue(otherPermanent) > 100],
    [true, true],
  );
  game.podRemove(otherPermanent, 'destroy');
  check(
    'a removed commander returns to the command zone',
    [
      game.isOnBattlefield(VNWXT),
      game.command.map((card) => card.name),
      game.graveyard.length,
    ],
    [false, [VNWXT], 0],
  );
  game = mike(3, [VNWXT], []);
  game.podLose(VNWXT, 'exile');
  check(
    'a commander removed in response to the win goes to the command zone (castable again, with tax)',
    [game.isOnBattlefield(VNWXT), game.command.map((card) => card.name)],
    [false, [VNWXT]],
  );
  // Mike's mill win stopped: Laboratory Maniac removed in response to the draw = we draw from an empty library and lose
  game = mike(3, [LABORATORY_MANIAC], []);
  game.library = [];
  game.draw(1);
  game.podLose(LABORATORY_MANIAC, 'destroy');
  game.podWinStopped();
  check(
    'Maniac removed in response to the winning draw: we lose',
    [game.milled, game.died],
    [false, true],
  );
  game = mike(3, [LABORATORY_MANIAC, 'Living Conundrum'], []);
  game.library = [];
  game.draw(1);
  game.podLose(LABORATORY_MANIAC, 'destroy');
  game.podWinStopped();
  check(
    '... unless Living Conundrum skips the draw',
    [game.milled, game.died],
    [false, false],
  );
  return allPassed;
}
