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
import * as C from '../cards/cards';
import { Config, Permanent } from '../game/game-types';
import { Game } from '../game/game';
import {
  EventKind,
  GameEvent,
  GameLog,
  PlayerCounters,
  buildEvent,
  setPlayerCounters,
} from '../game-log/game-log';
import { Rng } from '../util/rng';
import { Deck } from '../run/runner';
import { PodGame, PodSpec, PodStats } from '../../shared/pod-types';

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
  /** Goaded creatures and the players who goaded them (rule 701.15). A goad lasts until the goader's next turn. */
  readonly goaders = new Map<Permanent, Set<number>>();

  /** The player whose turn it is (-1 between turns). */
  currentPlayer = -1;
  /** Whose turn the log lines belong to: the current player, or between turns the player whose turn just ended. */
  private turnPlayerInLog = -1;
  /** How many lines of the current player's own log are already in the pod log. */
  private loggedLineCount = 0;
  private readonly log: GameEvent[] = [];
  private readonly verbose: boolean;
  private readonly seed: number;

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
    this.seed = seed;
    this.decks = spec.decks.map((name) => allDecks[name]);

    this.turnOrder = Array.from({ length: playerCount }, (_, i) => i);
    new Rng(seed * 7919 + 17).shuffle(this.turnOrder);
    this.seatOf = new Array<number>(playerCount);
    this.turnOrder.forEach((player, seat) => (this.seatOf[player] = seat));
    this.opponentsOf = this.decks.map((_, player) =>
      Array.from(
        { length: playerCount - 1 },
        (_, offset) =>
          this.turnOrder[(this.seatOf[player] + 1 + offset) % playerCount],
      ),
    );

    this.games = this.decks.map((deck, player) => {
      const decklist = loadDecklistOnce(spec.lists[player]);
      const config: Config = {
        ...deck.config,
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
      game.playerInLog = player;
      return game;
    });
    this.games.forEach((game, player) => {
      game.opponentNames = this.opponentsOf[player].map((opponent) =>
        this.playerName(opponent),
      );
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

  /** The player of this game, or of the game a planner copy was made from. Only for questions that read the table
   *  (an opponent's board, hand, graveyard): a copy must never change the other players. */
  playerOrCopyOf(game: Game<unknown>): number {
    const player = this.games.indexOf(game);
    return player >= 0 ? player : game.playerInLog;
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
      log: this.verbose ? this.gameLog() : undefined,
    };
  }

  // ================================================================ log

  /** The log of the game so far, with who played. */
  gameLog(): GameLog {
    return {
      seed: this.seed,
      players: this.games.map((game, player) => ({
        name: this.playerName(player),
        deckName: this.spec.decks[player],
        commanders: game.commanderNames,
        seat: this.seatOf[player],
        librarySize: loadDecklistOnce(this.spec.lists[player]).library.length,
      })),
      events: this.log,
    };
  }

  /** A line by one player in the pod log (only when the log is on). cards: the card names in the text. */
  sayAs(
    player: number,
    text: string,
    kind: EventKind = 'note',
    cards: string[] = [],
  ): void {
    if (!this.verbose) return;
    this.flushCurrentPlayerLog();
    const event = buildEvent(
      kind,
      this.round,
      text,
      cards,
      this.lifeTotals(),
      this.playerCounters(),
    );
    event.player = player;
    event.activePlayer =
      this.turnPlayerInLog >= 0 ? this.turnPlayerInLog : player;
    event.moves = this.collectCardMoves();
    this.log.push(event);
  }

  /** A line worth jumping to when reading the game. */
  sayHighlight(player: number, text: string, cards: string[] = []): void {
    if (!this.verbose) return;
    this.sayAs(player, text, 'note', cards);
    this.log[this.log.length - 1].isHighlight = true;
  }

  private lifeTotals(): number[] {
    return this.games.map((game) => game.myLife);
  }

  /** Every player's energy and experience (kept by its own game) and poison (kept by the table). */
  private playerCounters(): PlayerCounters[] {
    return this.games.map((game, player) => ({
      energy: game.energyCounters,
      experience: game.experienceCounters,
      poison: this.poison[player],
    }));
  }

  /** What changed on every player's table since their last log lines. */
  private collectCardMoves(): GameEvent['moves'] {
    return this.games.flatMap((game) => game.collectCardMoves());
  }

  /** Puts what changed after the last log line on that line (at the end of the game). */
  logRemainingCardMoves(): void {
    if (!this.verbose) return;
    this.flushCurrentPlayerLog();
    const lastEvent = this.log[this.log.length - 1];
    if (lastEvent) lastEvent.moves.push(...this.collectCardMoves());
  }

  /** Copies what the current player's own game has logged since last time into the pod log. */
  flushCurrentPlayerLog(): void {
    if (!this.verbose || this.currentPlayer < 0) return;
    const gameLog = this.games[this.currentPlayer].log;
    for (const event of gameLog.slice(this.loggedLineCount))
      this.logGameLine(this.currentPlayer, event);
    this.loggedLineCount = gameLog.length;
  }

  /** Puts what the players' games logged before the first turn (their opening hands) into the pod log. */
  logOpeningHands(): void {
    if (!this.verbose) return;
    for (const player of this.turnOrder)
      for (const event of this.games[player].log)
        this.logGameLine(player, event);
  }

  /** Marks the start of a player's turn for the log. */
  startTurnLog(player: number): void {
    this.currentPlayer = player;
    this.turnPlayerInLog = player;
    this.loggedLineCount = this.games[player].log.length;
  }

  /** Puts a line of a player's own game into the pod log: the round, who it is, and every player's life and
   *  counters as that player's game saw them when the line was written. */
  private logGameLine(player: number, event: GameEvent): void {
    const [ownLife, ...opponentLife] = event.life;
    const [ownCounters, ...opponentCounters] = event.playerCounters ?? [];
    const life = this.lifeTotals();
    const counters = this.playerCounters();
    life[player] = ownLife;
    counters[player].energy = ownCounters?.energy ?? 0;
    counters[player].experience = ownCounters?.experience ?? 0;
    this.opponentsOf[player].forEach((opponent, slot) => {
      if (!this.isAlive[opponent]) return;
      life[opponent] = opponentLife[slot];
      counters[opponent].poison = opponentCounters[slot]?.poison ?? 0;
    });
    event.life = life;
    setPlayerCounters(event, counters);
    event.turn = this.round;
    event.player = player;
    event.activePlayer =
      this.turnPlayerInLog >= 0 ? this.turnPlayerInLog : player;
    this.log.push(event);
  }

  // ================================================================ elimination

  eliminate(player: number, reason: string): void {
    if (!this.isAlive[player]) return;
    this.isAlive[player] = false;
    this.outOrder.push(player);
    this.outReason[player] = reason;
    this.endGoadsBy(player);
    this.endEffectsUntilNextTurnOf(player);
    this.endControlOfPlayerWhoLeft(player);
    this.sayAs(player, `is out (${reason})`, 'out');
    if (this.games[player].hasInitiative) this.passInitiativeFrom(player);
  }

  /** Rule 726.4: the initiative goes to the active player, or to the next player in turn order if the active player
   *  is the one leaving (or nobody's turn is on). The new holder ventures into Undercity as it takes it. */
  private passInitiativeFrom(leavingPlayer: number): void {
    this.games[leavingPlayer].hasInitiative = false;
    const activePlayer = this.turnPlayerInLog;
    const heir =
      activePlayer >= 0 && this.isAlive[activePlayer]
        ? activePlayer
        : this.livingOpponents(leavingPlayer)[0];
    if (heir === undefined) return;
    const takeIt = () => this.games[heir].takeInitiative();
    if (heir === this.currentPlayer) takeIt();
    else this.runOffTurn(takeIt);
  }

  // ================================================================ forced attacks and goad

  /** This player takes the initiative: only one player has it at a time. */
  takeInitiative(player: number): void {
    this.games.forEach(
      (game, other) => (game.hasInitiative = other === player),
    );
  }

  /** `goader` goads this creature: until the goader's next turn it attacks each combat, someone else if able. */
  goad(goader: number, creature: Permanent): void {
    const goaders = this.goaders.get(creature) ?? new Set<number>();
    goaders.add(goader);
    this.goaders.set(creature, goaders);
  }

  /** Players' creatures that can't attack a player until that player's next turn (Twisted Caverns). */
  private readonly cannotAttackPlayers = new Map<Permanent, Set<number>>();
  /** Effects that end when a player's next turn starts (or the player leaves): what ends them. */
  private readonly effectsUntilNextTurn: { player: number; end: () => void }[] =
    [];

  /** `end` runs when `player`'s next turn starts. */
  endAtNextTurnOf(player: number, end: () => void): void {
    this.effectsUntilNextTurn.push({ player, end });
  }

  private endEffectsUntilNextTurnOf(player: number): void {
    for (const effect of this.effectsUntilNextTurn.slice())
      if (effect.player === player) {
        effect.end();
        this.effectsUntilNextTurn.splice(
          this.effectsUntilNextTurn.indexOf(effect),
          1,
        );
      }
  }

  /** `creature` can't attack `player` until `player`'s next turn. */
  forbidAttackingUntilNextTurn(player: number, creature: Permanent): void {
    const forbidden = this.cannotAttackPlayers.get(creature) ?? new Set();
    forbidden.add(player);
    this.cannotAttackPlayers.set(creature, forbidden);
    this.endAtNextTurnOf(player, () => {
      forbidden.delete(player);
      if (forbidden.size === 0) this.cannotAttackPlayers.delete(creature);
    });
  }

  /** The opponents (as `player`'s slots) that this creature of `player`'s can't attack. */
  forbiddenAttackSlots(player: number, creature: Permanent): number[] {
    const forbidden = this.cannotAttackPlayers.get(creature);
    if (!forbidden) return [];
    return [...forbidden]
      .map((other) => this.opponentsOf[player].indexOf(other))
      .filter((slot) => slot >= 0);
  }

  /** The goads this player made end (its turn starts, or it left the game). */
  private endGoadsBy(player: number): void {
    for (const [creature, goaders] of this.goaders) {
      goaders.delete(player);
      if (goaders.size === 0) this.goaders.delete(creature);
    }
  }

  /** Must this creature attack each combat if able: its own text, a card such as Thantis on any battlefield, or goad? */
  mustAttack(creature: Permanent): boolean {
    return (
      C.attacksEachCombat(creature.card) ||
      this.goaders.has(creature) ||
      this.games.some(
        (game, player) =>
          this.isAlive[player] &&
          game.battlefield.some((permanent) =>
            C.makesAllCreaturesAttack(permanent.card),
          ),
      )
    );
  }

  /** The opponents (as `player`'s slots) that goaded this creature of `player`'s. */
  goaderSlots(player: number, creature: Permanent): number[] {
    const goaders = this.goaders.get(creature);
    if (!goaders) return [];
    return [...goaders]
      .map((goader) => this.opponentsOf[player].indexOf(goader))
      .filter((slot) => slot >= 0);
  }

  /** A player who leaves the game takes its cards with it, and what it took from others goes back to their owners
   *  (Volatile Stormdrake's exchange ends). */
  private endControlOfPlayerWhoLeft(player: number): void {
    const leavingGame = this.games[player];
    for (const permanent of leavingGame.battlefield.slice())
      if (permanent.owner !== null)
        leavingGame.giveControlTo(permanent, permanent.owner);
    for (const otherGame of this.games)
      for (const permanent of otherGame.battlefield.slice())
        if (permanent.owner === leavingGame)
          otherGame.giveControlTo(permanent, leavingGame);
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
    game.opponentLibrarySizes = library.slice();
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
    const arrayName = kind === 'library' ? 'opponentLibrarySizes' : kind;
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
        before.library[slot] - game.opponentLibrarySizes[slot],
        targetGame.library.length,
      );
      if (milled > 0) {
        for (let card = 0; card < milled; card++)
          targetGame.toGraveyard(targetGame.takeTopCardsOfLibrary(1)[0], true);
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
      library: game.opponentLibrarySizes.slice(),
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
          for (const event of this.games[player].log.slice(logLengths[index])) {
            this.flushCurrentPlayerLog();
            this.logGameLine(player, event);
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
      game.opponentLibrarySizes = game.opponentLibrarySizes.map((size, slot) =>
        this.isAlive[this.opponentsOf[player][slot]] ? size + 1 : size,
      );
    game.podHold =
      this.settings.holdChance >= 1 ||
      this.random.random() < this.settings.holdChance;
    game.pendingCrackback = 0; // no goldfish crackback in a pod: the other decks attack for real
    this.fogActive = false;
    this.creaturesThatBlocked = new Set();
    this.endGoadsBy(player);
    this.endEffectsUntilNextTurnOf(player);
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
