/** Seeded random numbers (xoshiro128**): the same seed always plays the same game. */
export class Rng {
  private state0: number;
  private state1: number;
  private state2: number;
  private state3: number;

  constructor(seed: number) {
    // splitmix32 to spread the seed over the state
    let seedState = seed >>> 0;
    const next = () => {
      seedState = (seedState + 0x9e3779b9) >>> 0;
      let mixed = seedState;
      mixed = Math.imul(mixed ^ (mixed >>> 16), 0x85ebca6b) >>> 0;
      mixed = Math.imul(mixed ^ (mixed >>> 13), 0xc2b2ae35) >>> 0;
      return (mixed ^ (mixed >>> 16)) >>> 0;
    };
    this.state0 = next();
    this.state1 = next();
    this.state2 = next();
    this.state3 = next();
  }

  /** Uniform in [0, 1). */
  random(): number {
    const output = Math.imul(rotl(Math.imul(this.state1, 5) >>> 0, 7), 9) >>> 0;
    const shifted = (this.state1 << 9) >>> 0;
    this.state2 ^= this.state0;
    this.state3 ^= this.state1;
    this.state1 ^= this.state2;
    this.state0 ^= this.state3;
    this.state2 ^= shifted;
    this.state3 = rotl(this.state3, 11);
    return output / 4294967296;
  }

  /** Integer in [0, n). */
  below(limit: number): number {
    return Math.floor(this.random() * limit);
  }

  /** Fisher-Yates shuffle in place. */
  shuffle<T>(items: T[]): void {
    for (let i = items.length - 1; i > 0; i--) {
      const swapIndex = this.below(i + 1);
      const held = items[i];
      items[i] = items[swapIndex];
      items[swapIndex] = held;
    }
  }

  /** A copy that continues the same sequence. */
  clone(): Rng {
    const copy = Object.create(Rng.prototype) as Rng;
    copy.state0 = this.state0;
    copy.state1 = this.state1;
    copy.state2 = this.state2;
    copy.state3 = this.state3;
    return copy;
  }
}

function rotl(value: number, bitCount: number): number {
  return ((value << bitCount) | (value >>> (32 - bitCount))) >>> 0;
}
