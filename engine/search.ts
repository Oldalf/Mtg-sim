/**
 * Kill-search driver shared by every deck.
 *
 * A deck supplies a snapshot type (with won(), key() and a path field) and these functions:
 *   children(st)       next snapshots (each one with .path extended by a description; render(path)
 *                      turns the winning path into text, so it's only built once)
 *   protected(st)      true if a counterspell can still back up the kill
 *   uncertain(st)      true if a won leaf is only won "on average" (then chance is asked)
 *   chance(root, st)   the probability that such a line really wins (below minChance: rejected)
 * search(root, budget) returns 2 (win with counter backup), 1 (win), 0 (no win found). After a call:
 *   lastLine  the winning line (step descriptions), lastP its chance (null = certain),
 *   bestMiss  the best chance among rejected lines (or null).
 * Results are cached per position: the search is deterministic, so a repeat costs nothing.
 */

export interface Snapshot {
  path: unknown;
  won(): boolean;
  key(): string;
  fullKey(): string;
}

export interface KillSearchOptions<S extends Snapshot> {
  children: (st: S) => S[];
  protected: (st: S) => boolean;
  uncertain?: (st: S) => boolean;
  chance?: (root: S, st: S) => number;
  minChance?: number;
  depth?: number;
  prepare?: (root: S) => void;
  render?: (path: unknown) => string[];
}

export class KillSearch<S extends Snapshot> {
  readonly minChance: number;
  readonly stats = [0, 0]; // cache hits, misses
  lastLine: string[] | null = null;
  lastP: number | null = null;
  bestMiss: number | null = null;
  private cache = new Map<string, [number, string[] | null, number | null, number | null]>();

  constructor(private o: KillSearchOptions<S>) {
    this.minChance = o.minChance ?? 0.9;
  }

  search(root: S, budget = 2500): number {
    this.o.prepare?.(root);
    const ck = root.fullKey() + "|" + budget;
    const hit = this.cache.get(ck);
    if (hit !== undefined) {
      this.stats[0]++;
      [, this.lastLine, this.lastP, this.bestMiss] = hit;
      return hit[0];
    }
    this.stats[1]++;
    const r = this.run(root, budget);
    if (this.cache.size > 300000) this.cache.clear();
    this.cache.set(ck, [r, this.lastLine, this.lastP, this.bestMiss]);
    return r;
  }

  private run(root: S, budget: number): number {
    const o = this.o;
    const seen = new Set<string>();
    let best = 0;
    let line: unknown = null;
    let prob: number | null = null;
    let miss: number | null = null;
    let nodes = 0;
    root.path = null;
    const uncertain = o.uncertain ?? (() => false);
    const minChance = this.minChance;

    const dfs = (st: S, depth: number): void => {
      if (st.won()) {
        const r = o.protected(st) ? 2 : 1;
        // same level as the best line so far: only worth a look if that one is uncertain
        const unc = uncertain(st);
        if (r < best || (r === best && (prob === null || prob >= 0.98 || !unc))) return;
        let p: number | null = null;
        if (unc) {
          p = o.chance!(root, st);
          if (p < minChance) {
            if (miss === null || p > miss) miss = p;
            return;
          }
          if (r === best && p <= (prob as number)) return;
        }
        best = r;
        line = st.path;
        prob = p;
        return;
      }
      if (depth === 0 || nodes >= budget) return;
      const k = st.key();
      if (seen.has(k)) return;
      seen.add(k);
      nodes++;
      for (const ch of o.children(st)) {
        dfs(ch, depth - 1);
        if (best === 2) return;
      }
    };

    dfs(root, o.depth ?? 9);
    this.lastLine = best ? (o.render ? o.render(line) : (line as string[])) : null;
    this.lastP = prob;
    this.bestMiss = miss;
    return best;
  }
}
