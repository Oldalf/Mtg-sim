export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

const GAP = 8;

/**
 * Where the enlarged card goes: beside the small card (right first, then left) so it never covers it. When neither
 * side has room (a phone) it goes above or below, wherever there is more space. Always kept inside the window.
 */
export function placeZoomedCard(
  card: Box,
  zoomSize: { width: number; height: number },
  windowSize: { width: number; height: number },
): { left: number; top: number } {
  const { width, height } = zoomSize;
  const keepInside = (value: number, size: number, windowLength: number) =>
    Math.max(GAP, Math.min(value, windowLength - size - GAP));
  const centredTop = keepInside(
    card.top + card.height / 2 - height / 2,
    height,
    windowSize.height,
  );

  const rightEdge = card.left + card.width;
  if (rightEdge + GAP + width + GAP <= windowSize.width) {
    return { left: rightEdge + GAP, top: centredTop };
  }
  if (card.left - GAP - width >= GAP) {
    return { left: card.left - GAP - width, top: centredTop };
  }

  const spaceAbove = card.top;
  const spaceBelow = windowSize.height - (card.top + card.height);
  const top =
    spaceBelow >= spaceAbove
      ? card.top + card.height + GAP
      : card.top - GAP - height;
  return {
    left: keepInside(
      card.left + card.width / 2 - width / 2,
      width,
      windowSize.width,
    ),
    top: keepInside(top, height, windowSize.height),
  };
}
