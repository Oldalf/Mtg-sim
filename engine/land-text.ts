/**
 * Reads what a land does from its Scryfall text, for lands the engine has no entry for (card-facts.ts LANDS).
 * It understands the colours, "enters tapped" and its conditions (snarls, check lands, fast / slow / battle
 * lands), pain lands, "Activate only if you control a ...", and "scry 1".
 */
import { LandInfo } from './card-facts';

const COLOURS = ['W', 'U', 'B', 'R', 'G'];
const BASIC_LAND_TYPES = ['plains', 'island', 'swamp', 'mountain', 'forest'];

/** `oracle` is the card text, `typeLine` the lower-case type line. */
export function readLandFromText(oracle: string, typeLine: string): LandInfo {
  const hasType = (type: string) => typeLine.includes(type);
  const info: LandInfo = {
    mana: manaKind(oracle, typeLine),
    etb: entersTappedRule(oracle),
    island: hasType('island'),
    swamp: hasType('swamp'),
    forest: hasType('forest'),
    plains: hasType('plains'),
    mountain: hasType('mountain'),
    basic: hasType('basic'),
  };
  const condition = entersTappedCondition(oracle);
  if (condition) info.cond = condition;
  const painColours = painLandColours(oracle);
  if (painColours !== null) info.pain = painColours;
  if (/\{T\}: Add \{C\}\./.test(oracle)) info.colourless = true;
  const needsLandType = /Activate only if you control an? (\w+)/i.exec(oracle);
  if (needsLandType) info.colourIf = needsLandType[1].toLowerCase();
  if (/When this land enters, scry 1/i.test(oracle)) info.scry = true;
  return info;
}

/** What it taps for: one colour, a pair like "G/W" (a 2-colour deck treats it as "either colour"), A = any, C = colourless. */
function manaKind(oracle: string, typeLine: string): string {
  const makes: Record<string, boolean> = {
    W: oracle.includes('{W}') || typeLine.includes('plains'),
    U: oracle.includes('{U}') || typeLine.includes('island'),
    B: oracle.includes('{B}') || typeLine.includes('swamp'),
    R: oracle.includes('{R}') || typeLine.includes('mountain'),
    G: oracle.includes('{G}') || typeLine.includes('forest'),
  };
  const colours = COLOURS.filter((colour) => makes[colour]);
  if (oracle.includes('any color') || colours.length >= 3) return 'A';
  if (colours.length === 2) return colours.join('/');
  if (colours.length === 1) return colours[0];
  return 'C';
}

/** "tapped" or "untapped", or "reveal:forest,plains" for snarls: "As this land enters, you may reveal a Forest or Plains
 *  card from your hand. If you don't, it enters tapped". */
function entersTappedRule(oracle: string): string {
  const reveal = /you may reveal an? (\w+) or (\w+) card from your hand/i.exec(
    oracle,
  );
  if (
    reveal &&
    BASIC_LAND_TYPES.includes(reveal[1].toLowerCase()) &&
    BASIC_LAND_TYPES.includes(reveal[2].toLowerCase())
  )
    return `reveal:${reveal[1].toLowerCase()},${reveal[2].toLowerCase()}`;
  return oracle.includes('enters tapped') && !oracle.includes('unless')
    ? 'tapped'
    : 'untapped';
}

/** "Enters tapped unless ...": check:<types> (control a land of a type), fast, slow, or basics2 (battle lands). */
function entersTappedCondition(oracle: string): string | null {
  const check =
    /enters tapped unless you control an? (\w+)(?: or an? (\w+))?/i.exec(
      oracle,
    );
  if (check && BASIC_LAND_TYPES.includes(check[1].toLowerCase()))
    return (
      'check:' +
      [check[1], check[2]]
        .filter((type) => type)
        .map((type) => type.toLowerCase())
        .join(',')
    );
  if (/enters tapped unless you control two or fewer other lands/i.test(oracle))
    return 'fast';
  if (/enters tapped unless you control two or more other lands/i.test(oracle))
    return 'slow';
  if (/enters tapped unless you control two or more basic lands/i.test(oracle))
    return 'basics2';
  return null;
}

/** The colours that cost 1 life when the land taps for them ("GU"), or null if it is not a pain land. */
function painLandColours(oracle: string): string | null {
  const pain =
    /\{T\}: Add ((?:\{[WUBRG]\}(?:,? or |, )?)+)\.[^.{]*deals 1 damage to you/i.exec(
      oracle,
    );
  return pain ? (pain[1].match(/[WUBRG]/g) ?? []).join('') : null;
}
