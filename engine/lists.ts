/** Small helpers for working with lists. */

/** Element with the lowest key. On a tie the first one wins, so results stay the same from run to run. */
export function firstMin<T>(xs: T[], key: (x: T) => number): T {
  let best = xs[0],
    bk = key(best);
  for (let i = 1; i < xs.length; i++) {
    const k = key(xs[i]);
    if (k < bk) {
      best = xs[i];
      bk = k;
    }
  }
  return best;
}

/** Element with the highest key. On a tie the first one wins. */
export function firstMax<T>(xs: T[], key: (x: T) => number): T {
  let best = xs[0],
    bk = key(best);
  for (let i = 1; i < xs.length; i++) {
    const k = key(xs[i]);
    if (k > bk) {
      best = xs[i];
      bk = k;
    }
  }
  return best;
}

/** Removes the first occurrence of an item. Throws if it is missing, which would be a bug in the caller. */
export function removeOrThrow<T>(list: T[], item: T): void {
  const index = list.indexOf(item);
  if (index < 0) throw new Error(`not in list: ${String(item)}`);
  list.splice(index, 1);
}

/** Removes the first occurrence of an item. Does nothing if it is missing. */
export function removeIfPresent<T>(list: T[], item: T): void {
  const index = list.indexOf(item);
  if (index >= 0) list.splice(index, 1);
}

/** Sorts in place, highest key first. Equal keys keep their order. */
export function sortDesc<T>(xs: T[], key: (x: T) => number): T[] {
  const ks = new Map<T, number>();
  for (const x of xs) ks.set(x, key(x));
  return xs.sort((a, b) => ks.get(b)! - ks.get(a)!);
}
