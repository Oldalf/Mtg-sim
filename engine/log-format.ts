/** How the game log prints cards, lists and mana pools. */
import { CardDef } from './cards';

export function fmt(x: unknown): string {
  if (x instanceof CardDef) return x.name;
  if (Array.isArray(x))
    return fmtList(
      x.map((item) => (item instanceof CardDef ? item.name : item)),
    );
  return String(x);
}

export function fmtList(items: unknown[]): string {
  return (
    '[' +
    items
      .map((x) => (typeof x === 'string' ? `'${x}'` : String(x)))
      .join(', ') +
    ']'
  );
}

export function fmtPool(pool: Record<string, number>): string {
  return (
    '{' +
    Object.entries(pool)
      .map(([colour, amount]) => `'${colour}': ${amount}`)
      .join(', ') +
    '}'
  );
}
