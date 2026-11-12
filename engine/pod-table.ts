/**
 * The shared state of one pod game: who is alive, who sits where, the counts the report is built from, and the
 * log. The rules that use this state live next to it:
 *   pod-combat.ts       blocks and combat damage
 *   pod-interaction.ts  removal, counterspells, answering a win, whom to attack
 *   pod-arena.ts        hands those rules to every deck's Game
 *
 * Each player keeps its own Game (hand, battlefield, mana and AI). The table owns the shared truth. Each Game sees
 * the other players only as arrays (life / library size / poison per opponent). Before another player's turn or
 * an off-turn event the table refreshes those arrays; afterwards it applies what changed to the real players.
 */
import * as C from './cards';
import { Config } from './game-types';
import { Game } from './game';
import { Rng } from './rng';
import { Deck } from './runner';
import { PodGame, PodSpec, PodStats } from './pod-types';

const decklists = new Map<string, C.Decklist>();
function loadDecklistOnce(file: string): C.Decklist {
  let decklist = decklists.get(file);
  if (!decklist) {
    decklist = C.loadDecklist(file);
    decklists.set(file, decklist);
  }
  return decklist;
}

/** What a Game's opponent arrays held when the table last wrote them (to see what the Game changed since). */
interface OpponentView {
  life: number[];
  library: number[];
  poison: number[];
}
type ViewKind = keyof OpponentView;

/** Settings read from `--set key=value`, with their defaults. */
interface PodSettings {
  protectUntilRound: number; // policy "mixed": protected until this round
  windowMana: number; // policy "window": go when every opponent has at most this much untapped mana
  holdChance: number; // chance a deck keeps answer mana up on a turn
  fireChance: number; // chance a deck uses its last instant removal on its own turn
  counterAtWeight: number; // a spell this important may be countered when cast
  counterAnyWeight: number; // a spell this important is always countered if possible
  threatMode: string; // who attacks aim at: leader | spread | weakest | damage
}

export class PodTable {
  readonly decks: Deck[];
  readonly games: Game<unknown>[];
  readonly playerCount: number;
  /** turnOrder[0] plays first. */
  readonly turnOrder: number[];
  /** seatOf[player] = the seat of that player (0 = first to play). */
  readonly seatOf: number[];
  /** opponentsOf[player] = the other players, in turn order after that player. */
  readonly opponentsOf: number[][];

  readonly settings: PodSettings;
  /** Are blocks and combat damage real (not each deck's goldfish combat rule)? */
  readonly isRealCombat: boolean;
  /** May the players answer wins, counter spells and use removal? */
  readonly answersEnabled: boolean;
  readonly random: Rng;

  readonly stats: PodStats;
  readonly isAlive: boolean[];
  readonly poison: number[];
  /** Why each player went out ("" = still in). */
  readonly outReason: string[];
  /** Players in the order they went out. */
  readonly outOrder: number[] = [];
  /** threats[player] = how dangerous that player looks (Game.threat), refreshed before each turn. */
  readonly threats: number[];
  /** damageDealt[i][j] = life player i took off player j. */
  readonly damageDealt: number[][];

  round = 0;
  /** All combat damage is prevented for the rest of this turn (Spore Frog). */
  fogActive = false;
  /** Creatures that already blocked this turn. */
  creaturesThatBlocked = new Set<unknown>();
  /** Combat damage one commander dealt to a player: "defender|attacker|card name" -> damage. */
  readonly commanderDamage = new Map<string, number>();
  /** Players who took 21 combat damage from one commander. */
  readonly commanderKilled = new Set<number>();

  /** The player whose turn it is (-1 between turns). */
  currentPlayer = -1;
  /** How many lines of the current player's own log are already in the pod log. */
  private loggedLineCount = 0;
  private readonly log: string[] = [];
  private readonly verbose: boolean;

  private opponentViews: OpponentView[];
  private offTurnDepth = 0;

  constructor(
    allDecks: Record<string, Deck>,
    private readonly spec: PodSpec,
    seed: number,
    verbose: boolean,
  ) {
    const playerCount = spec.decks.length;
    this.playerCount = playerCount;
    this.verbose = verbose;
    this.decks = spec.decks.map((name) => allDecks[name]);

    this.turnOrder = Array.from({ length: playerCount }, (_, i) => i);
    new Rng(seed * 7919 + 17).shuffle(this.turnOrder);
    this.seatOf = new Array<number>(playerCount);
    this.turnOrder.forEach((player, seat) => (this.seatOf[player] = seat));
    this.opponentsOf = this.decks.map((_, player) =>
      Array.from(
        { length: playerCount - 1 },
        (_, k) => this.turnOrder[(this.seatOf[player] + 1 + k) % playerCount],
      ),
    );

    this.games = this.decks.map((deck, player) => {
      const decklist = loadDecklistOnce(spec.lists[player]);
      const config: Config = {
        ...deck.cfg,
        opponents: playerCount - 1,
        ...(deck.podCfg ? deck.podCfg(playerCount) : {}),
        ...spec.set,
      };
      const game = new deck.Game(
        decklist.commanders,
        decklist.library,
        new Rng(seed * 1009 + player * 101 + 7),
        config,
        verbose,
        spec.set.pod_protected ? 'protected' : 'any',
      );
      game.onPlay = this.seatOf[player] === 0; // only the first player skips the first draw
      return game;
    });

    const set = spec.set;
    this.isRealCombat = !set.pod_race;
    this.answersEnabled = this.isRealCombat && set.pod_answers !== false;
    this.settings = {
      protectUntilRound: (set.protect_until as number) ?? 9,
      windowMana: (set.window_mana as number) ?? 1,
      holdChance: (set.hold_chance as number) ?? 1,
      fireChance: (set.fire_chance as number) ?? 0,
      counterAtWeight: (set.counter_at as number) ?? 60,
      counterAnyWeight: (set.counter_any as number) ?? 85,
      threatMode: spec.threat ?? 'leader',
    };
    this.random = new Rng(seed * 31 + 5);

    const zeroPerPlayer = () => new Array<number>(playerCount).fill(0);
    this.stats = {
      tried: zeroPerPlayer(),
      stopped: zeroPerPlayer(),
      answers: zeroPerPlayer(),
      countered: zeroPerPlayer(),
      removals: zeroPerPlayer(),
      removed: zeroPerPlayer(),
      waited: zeroPerPlayer(),
      shields: zeroPerPlayer(),
    };
    this.isAlive = new Array<boolean>(playerCount).fill(true);
    this.poison = zeroPerPlayer();
    this.outReason = new Array<string>(playerCount).fill('');
    this.threats = zeroPerPlayer();
    this.damageDealt = Array.from({ length: playerCount }, zeroPerPlayer);
    this.opponentViews = this.games.map(() => ({
      life: [],
      library: [],
      poison: [],
    }));
  }

  // ================================================================ players, policies, results

  /** The deck's name, with #seat added when the same deck is in the pod twice. */
  playerName(player: number): string {
    const name = this.spec.decks[player];
    return (
      name + (this.spec.decks.indexOf(name) !== player ? `#${player + 1}` : '')
    );
  }

  /** The pod policy of a deck's kill line: any | protected | mixed | window. */
  policyOf(player: number): string {
    return this.spec.policy?.[this.spec.decks[player]] ?? 'any';
  }

  /** The opponents of a player who are still in the game. */
  livingOpponents(player: number): number[] {
    return this.opponentsOf[player].filter((other) => this.isAlive[other]);
  }

  livingPlayers(): number[] {
    return this.isAlive.flatMap((alive, player) => (alive ? [player] : []));
  }

  /** The player a Game belongs to. */
  playerOf(game: Game<unknown>): number {
    return this.games.indexOf(game);
  }

  /** The total power of a player's creatures. */
  boardPower(player: number): number {
    const game = this.games[player];
    return game
      .creatures()
      .reduce((total, creature) => total + game.power(creature), 0);
  }

  /** The finished game, as the report wants it. */
  result(winner: number | null, turn: number, how: string): PodGame {
    return {
      ...this.stats,
      winner,
      turn,
      how,
      out: this.outOrder,
      why: this.outReason,
      seat: this.seatOf,
      log: this.verbose ? this.log : undefined,
    };
  }

  // ================================================================ log

  /** Writes a line to the pod log (only when tracing). */
  say(text: string): void {
    if (!this.verbose) return;
    this.flushCurrentPlayerLog();
    this.log.push(text);
  }

  /** A line by one player, with the round and name in front. */
  sayAs(player: number, text: string): void {
    this.say(`R${this.round} ${this.playerName(player)}: ${text}`);
  }

  /** Copies what the current player's own game has logged since last time into the pod log. */
  flushCurrentPlayerLog(): void {
    if (!this.verbose || this.currentPlayer < 0) return;
    const gameLog = this.games[this.currentPlayer].log;
    for (const line of gameLog.slice(this.loggedLineCount))
      this.logGameLine(this.currentPlayer, line);
    this.loggedLineCount = gameLog.length;
  }

  /** Marks the start of a player's turn for the log. */
  startTurnLog(player: number): void {
    this.currentPlayer = player;
    this.loggedLineCount = this.games[player].log.length;
  }

  /** Copies the game lines of a player from `fromIndex` on (pod log lines have no turn number). */
  private logGameLine(player: number, line: string): void {
    this.log.push(
      `R${this.round} ${this.playerName(player)}: ${line.replace(/^T\d+: /, '')}`,
    );
  }

  // ================================================================ elimination

  eliminate(player: number, reason: string): void {
    if (!this.isAlive[player]) return;
    this.isAlive[player] = false;
    this.outOrder.push(player);
    this.outReason[player] = reason;
    this.say(`R${this.round}: ${this.playerName(player)} is out (${reason})`);
  }

  /** Eliminates every player who has lost by life, commander damage or poison. */
  eliminateLosers(): void {
    for (let player = 0; player < this.playerCount; player++) {
      if (!this.isAlive[player]) continue;
      if (this.commanderKilled.has(player)) this.eliminate(player, 'commander');
      else if (this.games[player].myLife <= 0 || this.games[player].died)
        this.eliminate(player, 'life');
      else if (this.poison[player] >= 10) this.eliminate(player, 'poison');
    }
  }

  // ================================================================ the decks' views of each other

  /** Writes the other players into this game's opponent arrays (life / library / poison). */
  refreshView(player: number): void {
    const game = this.games[player];
    const opponents = this.opponentsOf[player];
    const library = opponents.map((other) =>
      this.isAlive[other] ? this.games[other].library.length : 0,
    );
    game.life = opponents.map((other) =>
      this.isAlive[other] ? this.games[other].myLife : 0,
    );
    game.lib = library.slice();
    game.poison = opponents.map((other) => this.poison[other]);
    this.opponentViews[player] = {
      life: game.life.slice(),
      library,
      poison: game.poison.slice(),
    };
  }

  /** What player `source` did to opponent `target`: the other players' views of `target` must change too. */
  private updateOtherViews(
    source: number,
    target: number,
    kind: ViewKind,
    amount: number,
  ): void {
    const arrayName = kind === 'library' ? 'lib' : kind;
    for (let other = 0; other < this.playerCount; other++) {
      if (other === source || other === target) continue;
      const slot = this.opponentsOf[other].indexOf(target);
      if (slot < 0 || this.opponentViews[other][kind].length <= slot) continue;
      this.games[other][arrayName][slot] -= amount;
      this.opponentViews[other][kind][slot] -= amount;
    }
  }

  /** Applies what a game changed in its opponent arrays (life lost, cards milled, poison) to the real players. */
  applyChangesFrom(player: number): void {
    const game = this.games[player];
    const before = this.opponentViews[player];
    if (!before.life.length) return;
    this.opponentsOf[player].forEach((target, slot) => {
      if (!this.isAlive[target]) return;
      const lifeLost = before.life[slot] - game.life[slot];
      if (lifeLost > 0) {
        this.games[target].loseLife(lifeLost);
        this.damageDealt[player][target] += lifeLost;
        this.updateOtherViews(player, target, 'life', lifeLost);
      }
      const targetGame = this.games[target];
      const milled = Math.min(
        before.library[slot] - game.lib[slot],
        targetGame.library.length,
      );
      if (milled > 0) {
        for (let card = 0; card < milled; card++)
          targetGame.toGy(targetGame.library.shift()!, true);
        this.updateOtherViews(player, target, 'library', milled);
      }
      const poisonGained = game.poison[slot] - before.poison[slot];
      if (poisonGained > 0) {
        this.poison[target] += poisonGained;
        this.updateOtherViews(player, target, 'poison', -poisonGained);
      }
    });
    this.opponentViews[player] = {
      life: game.life.slice(),
      library: game.lib.slice(),
      poison: game.poison.slice(),
    };
  }

  /** Runs something that happens outside the turn order (a block, removal, an answer) so that the other decks'
   *  triggers count too: their views are refreshed first, and what they did is applied afterwards. */
  runOffTurn<T>(action: () => T): T {
    if (this.offTurnDepth > 0) return action();
    this.offTurnDepth++;
    try {
      if (this.currentPlayer >= 0) this.applyChangesFrom(this.currentPlayer);
      const others = this.games
        .map((_, player) => player)
        .filter(
          (player) => player !== this.currentPlayer && this.isAlive[player],
        );
      const logLengths = others.map((player) => this.games[player].log.length);
      for (const player of others) this.refreshView(player);
      const result = action();
      others.forEach((player, index) => {
        this.applyChangesFrom(player);
        if (this.verbose)
          for (const line of this.games[player].log.slice(logLengths[index])) {
            this.flushCurrentPlayerLog();
            this.logGameLine(player, line);
          }
      });
      return result;
    } finally {
      this.offTurnDepth--;
    }
  }

  // ================================================================ start of a turn

  /** Gets the table ready for a player's turn: that player's view of the others, the threat scores, the turn's flags. */
  prepareTurn(player: number): void {
    const game = this.games[player];
    this.refreshView(player);
    // the engine takes 1 off each living opponent's library at the start of a turn
    if (game.turn >= 1)
      game.lib = game.lib.map((size, slot) =>
        this.isAlive[this.opponentsOf[player][slot]] ? size + 1 : size,
      );
    game.podHold =
      this.settings.holdChance >= 1 ||
      this.random.random() < this.settings.holdChance;
    game.pendingCrackback = 0; // no goldfish crackback in a pod: the other decks attack for real
    this.fogActive = false;
    this.creaturesThatBlocked = new Set();
    for (let other = 0; other < this.playerCount; other++)
      this.threats[other] = this.isAlive[other]
        ? this.games[other].threat()
        : 0;
    for (const other of this.games) other.podShielded.clear();
    const policy = this.policyOf(player);
    if (this.isRealCombat)
      game.mode =
        policy === 'protected' ||
        (policy === 'mixed' && this.round < this.settings.protectUntilRound)
          ? 'protected'
          : 'any';
  }
}
