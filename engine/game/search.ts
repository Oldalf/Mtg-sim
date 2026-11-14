/**
 * Kill-search driver shared by every deck.
 *
 * A deck supplies a snapshot type (with hasWon(), searchKey() and a killLine field) and these functions:
 *   children(st)       next snapshots (each one with .killLine extended by a description; render(path)
 *                      turns the winning path into text, so it's only built once)
 *   protected(st)      true if a counterspell can still back up the kill
 *   uncertain(st)      true if a won leaf is only won "on average" (then chance is asked)
 *   chance(root, st)   the probability that such a line really wins (below minChance: rejected)
 * search(root, budget) returns 2 (win with counter backup), 1 (win), 0 (no win found). After a call:
 *   lastLine  the winning line (step descriptions), lastLineProbability its chance (null = certain),
 *   bestMiss  the best chance among rejected lines (or null).
 * Results are cached per position: the search is deterministic, so a repeat costs nothing.
 */

export interface Snapshot {
  killLine: unknown;
  hasWon(): boolean;
  searchKey(): string;
  fullKey(): string;
}

export interface KillSearchOptions<S extends Snapshot> {
  children: (state: S) => S[];
  protected: (state: S) => boolean;
  uncertain?: (state: S) => boolean;
  chance?: (root: S, state: S) => number;
  minChance?: number;
  depth?: number;
  prepare?: (root: S) => void;
  render?: (path: unknown) => string[];
}

export class KillSearch<S extends Snapshot> {
  readonly minChance: number;
  readonly stats = [0, 0]; // cache hits, misses
  lastLine: string[] | null = null;
  lastLineProbability: number | null = null;
  bestMiss: number | null = null;
  private cache = new Map<
    string,
    [number, string[] | null, number | null, number | null]
  >();

  constructor(private options: KillSearchOptions<S>) {
    this.minChance = options.minChance ?? 0.9;
  }

  search(root: S, budget = 2500): number {
    this.options.prepare?.(root);
    const cacheKey = root.fullKey() + '|' + budget;
    const hit = this.cache.get(cacheKey);
    if (hit !== undefined) {
      this.stats[0]++;
      [, this.lastLine, this.lastLineProbability, this.bestMiss] = hit;
      return hit[0];
    }
    this.stats[1]++;
    const result = this.run(root, budget);
    if (this.cache.size > 300000) this.cache.clear();
    this.cache.set(cacheKey, [
      result,
      this.lastLine,
      this.lastLineProbability,
      this.bestMiss,
    ]);
    return result;
  }

  private run(root: S, budget: number): number {
    const options = this.options;
    const seen = new Set<string>();
    let best = 0;
    let line: unknown = null;
    let prob: number | null = null;
    let miss: number | null = null;
    let nodes = 0;
    root.killLine = null;
    const uncertain = options.uncertain ?? (() => false);
    const minChance = this.minChance;

    const searchFrom = (state: S, depth: number): void => {
      if (state.hasWon()) {
        const winLevel = options.protected(state) ? 2 : 1;
        // same level as the best line so far: only worth a look if that one is uncertain
        const isUncertain = uncertain(state);
        if (
          winLevel < best ||
          (winLevel === best && (prob === null || prob >= 0.98 || !isUncertain))
        )
          return;
        let lineProbability: number | null = null;
        if (isUncertain) {
          lineProbability = options.chance!(root, state);
          if (lineProbability < minChance) {
            if (miss === null || lineProbability > miss) miss = lineProbability;
            return;
          }
          if (winLevel === best && lineProbability <= (prob as number)) return;
        }
        best = winLevel;
        line = state.killLine;
        prob = lineProbability;
        return;
      }
      if (depth === 0 || nodes >= budget) return;
      const stateKey = state.searchKey();
      if (seen.has(stateKey)) return;
      seen.add(stateKey);
      nodes++;
      for (const child of options.children(state)) {
        searchFrom(child, depth - 1);
        if (best === 2) return;
      }
    };

    searchFrom(root, options.depth ?? 9);
    this.lastLine = best
      ? options.render
        ? options.render(line)
        : (line as string[])
      : null;
    this.lastLineProbability = prob;
    this.bestMiss = miss;
    return best;
  }
}
