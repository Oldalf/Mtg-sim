/** Small helpers for working with lists. */

/** Element with the lowest key. On a tie the first one wins, so results stay the same from run to run. */
export function firstMin<T>(items: T[], key: (x: T) => number): T {
  let best = items[0],
    bestKey = key(best);
  for (let i = 1; i < items.length; i++) {
    const candidateKey = key(items[i]);
    if (candidateKey < bestKey) {
      best = items[i];
      bestKey = candidateKey;
    }
  }
  return best;
}

/** Element with the highest key. On a tie the first one wins. */
export function firstMax<T>(items: T[], key: (x: T) => number): T {
  let best = items[0],
    bestKey = key(best);
  for (let i = 1; i < items.length; i++) {
    const candidateKey = key(items[i]);
    if (candidateKey > bestKey) {
      best = items[i];
      bestKey = candidateKey;
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
export function sortDesc<T>(items: T[], key: (x: T) => number): T[] {
  const keys = new Map<T, number>();
  for (const x of items) keys.set(x, key(x));
  return items.sort((first, second) => keys.get(second)! - keys.get(first)!);
}
