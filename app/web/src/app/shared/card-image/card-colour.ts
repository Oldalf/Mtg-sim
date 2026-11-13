export type CardColour =
  'white' | 'blue' | 'black' | 'red' | 'green' | 'gold' | 'colorless' | 'land';

const COLOUR_OF_SYMBOL: Record<string, CardColour> = {
  W: 'white',
  U: 'blue',
  B: 'black',
  R: 'red',
  G: 'green',
};

/**
 * The colour a card without an image is shown in: from the colour symbols of its mana cost (two or more colours
 * are gold), lands brown, everything else colourless. A hybrid or Phyrexian symbol counts for each colour in it.
 */
export function colourOfCard(
  manaCost: string | undefined,
  typeLine: string | undefined,
): CardColour {
  const coloursInCost = new Set<CardColour>();
  for (const symbol of (manaCost ?? '').matchAll(/[WUBRG]/g))
    coloursInCost.add(COLOUR_OF_SYMBOL[symbol[0]]);
  if (coloursInCost.size > 1) return 'gold';
  if (coloursInCost.size === 1) return [...coloursInCost][0];
  return /\bland\b/i.test(typeLine ?? '') ? 'land' : 'colorless';
}
