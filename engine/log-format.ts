/** How the game log prints cards, lists and mana pools. */
import { CardDef } from './cards';

export function formatLogPart(x: unknown): string {
  if (x instanceof CardDef) return x.name;
  if (Array.isArray(x))
    return formatList(
      x.map((item) => (item instanceof CardDef ? item.name : item)),
    );
  return String(x);
}

export function formatList(items: unknown[]): string {
  return (
    '[' +
    items
      .map((x) => (typeof x === 'string' ? `'${x}'` : String(x)))
      .join(', ') +
    ']'
  );
}

export function formatPool(pool: Record<string, number>): string {
  return (
    '{' +
    Object.entries(pool)
      .map(([colour, amount]) => `'${colour}': ${amount}`)
      .join(', ') +
    '}'
  );
}
