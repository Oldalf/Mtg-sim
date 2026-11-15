import { placeZoomedCard } from './zoom-placement';

const zoomSize = { width: 250, height: 349 };
const desktop = { width: 1400, height: 900 };

describe('placeZoomedCard', () => {
  it('goes to the right of the card when there is room', () => {
    const place = placeZoomedCard(
      { left: 100, top: 300, width: 100, height: 140 },
      zoomSize,
      desktop,
    );
    expect(place.left).toBe(208);
    expect(place.top).toBe(300 + 70 - 349 / 2);
  });

  it('goes to the left at the right edge of the window', () => {
    const place = placeZoomedCard(
      { left: 1300, top: 300, width: 80, height: 112 },
      zoomSize,
      desktop,
    );
    expect(place.left).toBe(1300 - 8 - 250);
  });

  it('stays inside the window at the top', () => {
    const place = placeZoomedCard(
      { left: 100, top: 0, width: 100, height: 140 },
      zoomSize,
      desktop,
    );
    expect(place.top).toBe(8);
  });

  it('goes above or below on a phone, never over the card', () => {
    const phone = { width: 390, height: 800 };
    const card = { left: 170, top: 500, width: 52, height: 73 };
    const place = placeZoomedCard(card, zoomSize, phone);
    const overlapsCard =
      place.top < card.top + card.height && place.top + 349 > card.top;
    expect(overlapsCard).toBe(false);
    expect(place.left).toBeGreaterThanOrEqual(8);
    expect(place.left + 250).toBeLessThanOrEqual(382);
  });
});
