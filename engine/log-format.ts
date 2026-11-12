/** How the game log prints cards, lists and mana pools. */
import { CardDef } from './cards';

export function fmt(x: unknown): string {
  if (x instanceof CardDef) return x.name;
  if (Array.isArray(x))
    return fmtList(x.map((v) => (v instanceof CardDef ? v.name : v)));
  return String(x);
}

export function fmtList(xs: unknown[]): string {
  return (
    '[' +
    xs.map((x) => (typeof x === 'string' ? `'${x}'` : String(x))).join(', ') +
    ']'
  );
}

export function fmtPool(p: Record<string, number>): string {
  return (
    '{' +
    Object.entries(p)
      .map(([k, v]) => `'${k}': ${v}`)
      .join(', ') +
    '}'
  );
}
