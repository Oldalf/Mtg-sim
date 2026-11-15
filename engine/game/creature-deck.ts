/**
 * The base of a deck that wins by beating the opponents down: creatures, combat, drains. It has what Edgar, Meren
 * and Sam & Frodo each wrote for themselves: the win (config.win_dead opponents at 0 life), the two numbers a game
 * returns (the win turn, the first opponent dead), the engine's goldfish combat, card values from the deck's VALUE
 * table, and a planner score from damage dealt, board, mana and cards. A light (pod-only) deck extends it and adds
 * its values, its own cards' rules and its candidates.
 */
import { CardDef } from '../cards/cards';
import { GameWithoutKillSearch } from './game';
import { Permanent } from './game-types';

export abstract class CreatureDeckGame extends GameWithoutKillSearch {
  /** How much the AI wants each card on the battlefield (the deck's VALUE table). */
  abstract readonly values: Record<string, number>;

  battlefieldValue(card: CardDef): number {
    return this.values[card.name] ?? (card.isCreature ? 40 : 30);
  }

  /** Lands: much wanted while mana is short, little once there's plenty. Other cards: their battlefield value. */
  override cardValue(card: CardDef): number {
    if (card.land !== null) {
      const manaAndLands = this.manaSources() + this.countLandsHand();
      return manaAndLands <= 3
        ? 80
        : manaAndLands <= 6
          ? 60
          : manaAndLands <= 8
            ? 40
            : 15;
    }
    return this.battlefieldValue(card);
  }

  override reanimationValue(card: CardDef): number {
    return this.battlefieldValue(card);
  }

  // ================================================================ the win
  hasWon(): boolean {
    return (
      this.life.filter((life) => life <= 0).length >=
      (this.config.win_dead as number)
    );
  }

  override areOpponentsBeaten(): boolean {
    return this.hasWon();
  }

  /** Would this much extra damage, dealt to the weakest opponents first, win? */
  override winsWith(damage: number): boolean {
    const life = this.life.slice();
    let damageLeft = damage;
    while (damageLeft > 0) {
      let weakestIndex = -1;
      for (let i = 0; i < life.length; i++)
        if (life[i] > 0 && (weakestIndex < 0 || life[i] < life[weakestIndex]))
          weakestIndex = i;
      if (weakestIndex < 0) break;
      const hit = Math.min(damageLeft, life[weakestIndex]);
      life[weakestIndex] -= hit;
      damageLeft -= hit;
    }
    return (
      life.filter((lifeLeft) => lifeLeft <= 0).length >=
      (this.config.win_dead as number)
    );
  }

  override checkKill(): number {
    if (this.died) return 2; // the game is over (lost)
    if (this.hasWon()) {
      if (this.unprotectedKillTurn === null) {
        this.unprotectedKillTurn = this.turn;
        this.say(`WIN: ${this.describeOpponentLife()}`);
      }
      return 2;
    }
    return 0;
  }

  /** The two numbers of a game: the win turn, and the turn the first opponent died. */
  override play(): [number | null, number | null] {
    super.play();
    return [
      this.died ? null : this.unprotectedKillTurn,
      this.firstOpponentDeadTurn,
    ];
  }

  // ================================================================ combat
  override combat(): void {
    this.creatureCombat();
  }

  /** Lifelink creatures that connected gain us their power. */
  override onCombatDamage(connected: Permanent[]): void {
    for (const permanent of connected)
      if (permanent.card.keywords.has('lifelink'))
        this.gainLife(this.power(permanent));
  }

  // ================================================================ the planner's score
  /** The planner's score for a position with no win yet (higher is better): damage dealt, the board, mana and
   *  cards in hand, and our life. A deck adds its own engines on top. */
  override positionValue(): number {
    if (this.died) return -5000;
    let value = 0;
    const startLife = this.config.opp_life as number;
    for (const life of this.life) value += 3 * (startLife - Math.max(0, life));
    for (const permanent of this.creatures())
      value +=
        6 * this.power(permanent) * (permanent.card.flying ? 1.5 : 1) +
        0.25 * this.battlefieldValue(permanent.card);
    for (const permanent of this.battlefield)
      if (permanent.land === null && !permanent.card.isCreature)
        value += 0.4 * this.battlefieldValue(permanent.card);
    value += 25 * Math.min(10, this.manaSources());
    value +=
      0.4 * this.hand.reduce((total, card) => total + this.cardValue(card), 0);
    value +=
      this.myLife <= 0
        ? -3000
        : this.myLife < 15
          ? -10 * (15 - this.myLife)
          : 0.3 * Math.min(40, this.myLife - 15);
    return value;
  }

  /** A pod: how close to winning the others think we are, by default from the power on our board. */
  override podClose(): number {
    const power = this.creatures().reduce(
      (total, permanent) => total + this.power(permanent),
      0,
    );
    return Math.min(1, power / 40);
  }
}
