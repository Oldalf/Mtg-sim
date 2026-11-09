/** Seeded random numbers (xoshiro128**): the same seed always plays the same game. */
export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(seed: number) {
    // splitmix32 to spread the seed over the state
    let s = seed >>> 0;
    const next = () => {
      s = (s + 0x9e3779b9) >>> 0;
      let z = s;
      z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
      z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
      return (z ^ (z >>> 16)) >>> 0;
    };
    this.a = next();
    this.b = next();
    this.c = next();
    this.d = next();
  }

  /** Uniform in [0, 1). */
  random(): number {
    const r = Math.imul(rotl(Math.imul(this.b, 5) >>> 0, 7), 9) >>> 0;
    const t = (this.b << 9) >>> 0;
    this.c ^= this.a;
    this.d ^= this.b;
    this.b ^= this.c;
    this.a ^= this.d;
    this.c ^= t;
    this.d = rotl(this.d, 11);
    return r / 4294967296;
  }

  /** Integer in [0, n). */
  below(n: number): number {
    return Math.floor(this.random() * n);
  }

  /** Fisher-Yates shuffle in place. */
  shuffle<T>(a: T[]): void {
    for (let i = a.length - 1; i > 0; i--) {
      const j = this.below(i + 1);
      const x = a[i];
      a[i] = a[j];
      a[j] = x;
    }
  }

  /** A copy that continues the same sequence. */
  clone(): Rng {
    const r = Object.create(Rng.prototype) as Rng;
    r.a = this.a;
    r.b = this.b;
    r.c = this.c;
    r.d = this.d;
    return r;
  }
}

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}
