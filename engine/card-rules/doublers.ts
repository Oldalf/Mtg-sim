/**
 * Doublers: more tokens, counters or mana while they are on the battlefield (GameCore.createTokens, addCounters, tap).
 */
import type { CardRules } from './card-rules';

export const DOUBLERS: CardRules[] = [
  {
    names: ['Doubling Season'],
    // CHECK WHEN ANOTHER DECK PLAYS IT: only counters put through GameCore.addCounters double (planeswalker loyalty,
    // and counters a rule adds directly, don't).
    tokenMultiplier: () => 2,
    counterMultiplier: () => 2,
  },
  {
    names: ['Parallel Lives'],
    tokenMultiplier: () => 2,
  },
  {
    names: ['Nyxbloom Ancient'],
    // CHECK WHEN ANOTHER DECK PLAYS IT: every source tapped through GameCore.tap makes three times the mana.
    manaMultiplier: () => 3,
  },
];
