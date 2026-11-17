// Day marks: gaps that split a weekly bar into the days since its reset. Each
// part is one day's share of the limit, the budget an even pace uses in a day,
// so a fill reaching past the part the mark stands in already uses the budget
// of the days ahead.
//
// The gaps are cut with a mask, so they show whatever lies behind the panel
// (the card, or the glass of the overlay) and need no colour of their own.
// A hard stop is drawn per pixel without smoothing, so a gap one pixel wide
// stays one crisp pixel at any position. Each gap is a layer of its own, which
// keeps every gradient at four stops; Skia draws gradients of up to eight
// intervals analytically and longer ones through a lookup texture, which a
// single gradient with all six gaps (25 stops) would need. The page is always
// left to right (German or English texts).
//
// At 1:1, every gap measured exactly one pixel. A page drawn scaled down, as
// in a browser preview of a larger viewport, loses some gaps: a gap smaller
// than a device pixel holds no pixel centre.

export const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
/** No gap this close to the end, for windows reported a little longer than a week. */
const END_LEEWAY_MS = 60 * 60 * 1000;

/** Where each day of a window ends, as fractions of the bar: 1/7 to 6/7 for a week. */
export const dayFractions = (windowMs = WEEK_MS) => {
  const length = Number.isFinite(windowMs) && windowMs > 0 ? windowMs : WEEK_MS;
  const fractions = [];
  for (let at = DAY_MS; at < length - END_LEEWAY_MS; at += DAY_MS) fractions.push(at / length);
  return fractions;
};

/** Opaque everywhere: the layer the gaps are cut from. */
const FULL_LAYER = 'linear-gradient(#000 0 0)';

/**
 * Mask layers with a gap of `--lp-day-gap` centred on each fraction, or null
 * without any. On top, one layer per gap, opaque only inside it; at the
 * bottom, one opaque layer. Combined with `mask-composite: exclude`, each gap
 * layer clears its gap out of everything below it, and the order or how a
 * browser treats the bottom layer's operator changes nothing.
 */
export const dayMaskImage = (fractions) => {
  if (fractions.length === 0) return null;
  const half = 'var(--lp-day-gap, 1px) / 2';
  const gaps = fractions.map((fraction) => {
    const at = `${(fraction * 100).toFixed(4)}%`;
    return `linear-gradient(to right, transparent calc(${at} - ${half}), #000 0 calc(${at} + ${half}), transparent 0)`;
  });
  return [...gaps, FULL_LAYER].join(', ');
};

/**
 * The day of the window a reading falls on, of how many, and how many days'
 * budget the use amounts to; null without a share or a time to count from.
 */
export const dayProgress = ({ usedPercent, elapsedPercent, windowMs }) => {
  if (typeof usedPercent !== 'number' || typeof elapsedPercent !== 'number') return null;
  const length = Number.isFinite(windowMs) && windowMs > 0 ? windowMs : WEEK_MS;
  const days = Math.round(length / DAY_MS);
  return {
    day: Math.min(days, Math.floor((elapsedPercent * length) / (100 * DAY_MS)) + 1),
    days,
    // One division at the end keeps round numbers round (20% of a week is 1.4 days, not 1.4000000000000001).
    budgetDays: (usedPercent * length) / (100 * DAY_MS),
  };
};
