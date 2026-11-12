/**
 * Gale kill lines: the kill search and its pre-filter. The state is in kill-state.ts, the moves in kill-moves.ts.
 *
 * A stripped-down copy of the game ("KillSearchState") is searched depth-first over the actions that
 * matter for killing the table this turn: casting/activating combo pieces, rituals, mill spells
 * and Gale/Emet-Selch graveyard recasts.
 *
 * Opponent outcome is deterministic: creature cards milled are an *expected* fraction (pCre)
 * accumulated per library, so the search can't "peek". Lines that rely on that average (Konrad
 * chains) are checked against real shuffles (chainProb). A win = every opponent has life <= 0,
 * an empty library or 10+ poison counters.
 */
import { KillSearchState } from './kill-state';
import { CHAIN_MIN, chainProb } from './chain-probability';
import { children, isProtected, renderPath } from './kill-moves';
import { KillSearch } from '../../engine/search';

export const search = new KillSearch<KillSearchState>({
  children,
  protected: isProtected,
  uncertain: (state) => state.isAverageOnly, // won only "on average": check against real shuffles
  chance: chainProb,
  minChance: CHAIN_MIN,
  prepare: (root) => {
    root.opponentStepLog = null;
    root.opponentStepKey = '';
    root.isAverageOnly = false;
  },
  render: renderPath,
});

/** Cheap pre-filter so we only search when a kill is conceivable. */
export function finisherReachable(state: KillSearchState): boolean {
  const have = new Set(state.hand);
  const acc = new Set(state.hand);
  if (state.hasGale) for (const name of state.graveyardSpells) acc.add(name);
  const guildmageAvailable =
    state.hasGuildmage || have.has('Duskmantle Guildmage');
  const monumentAvailable =
    state.hasMonument || have.has('Riverchurn Monument');
  const hasCacophony = acc.has('Maddening Cacophony');
  if (guildmageAvailable) return true;
  // poison: Expansion Algorithm needs a poison counter already there, or a Prologue to go first
  if (
    acc.has('Expansion Algorithm') &&
    (Math.max(...state.opponentPoison) > 0 || acc.has('Prologue to Phyresis'))
  )
    return true;
  if (
    hasCacophony &&
    (monumentAvailable ||
      state.opponentLibrary.some((librarySize) => librarySize <= 16))
  )
    return true;
  if (state.mindskinnerCanAttack) return true;
  if (monumentAvailable && state.monumentCanExhaust) return true;
  const konrad = state.hasKonrad || have.has('Syr Konrad, the Grim');
  if (konrad && state.hasMindskinner) return true;
  // Konrad + a big mill: every creature card milled pings each opponent (more with Mindcrank). game4.
  const bigMill = [
    'Maddening Cacophony',
    'Traumatize',
    'Cut Your Losses',
    'Singularity Rupture',
    'Windfall',
  ];
  if (
    konrad &&
    (bigMill.some((name) => acc.has(name)) ||
      have.has('Jidoor, Aristocratic Capital'))
  )
    return true;
  if (
    ['Traumatize', 'Cut Your Losses', 'Singularity Rupture'].some((name) =>
      acc.has(name),
    ) ||
    have.has('Jidoor, Aristocratic Capital')
  ) {
    let alive = 0;
    for (let i = 0; i < state.opponentLibrary.length; i++)
      if (state.isOpponentAlive(i)) alive++;
    return (
      state.opponentLibrary.some((librarySize) => librarySize <= 2) ||
      alive <= 2
    );
  }
  return false;
}
