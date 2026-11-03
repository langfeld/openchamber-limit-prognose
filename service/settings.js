// The extension's settings and the values each may take. Shared by the
// service, which keeps them, and the pages, which offer and apply them.

/** Text sizes, as OpenChamber's "Schriftgröße der Benutzeroberfläche" percentages. */
export const TEXT_SIZES = [75, 80, 85, 90, 95, 100, 105, 110, 115, 120, 125, 130, 140, 150, 175, 200];
/** Bar heights in px at 100% text size; 4 is the Work Status panel's own meter (`h-1`). */
export const BAR_HEIGHTS = [3, 4, 5, 6, 8];
/** Minutes between readings. Below five the service's cache would answer anyway. */
export const INTERVALS = [5, 10, 15, 30, 60];

export const DEFAULT_SETTINGS = Object.freeze({
  textSize: 100,
  barHeight: 4,
  interval: 10,
  /** Provider ids to show; null follows the choice in OpenChamber's Usage section. */
  providers: null,
});

const PROVIDER_ID = /^[a-z0-9][a-z0-9.-]{0,63}$/;
const PROVIDERS_MAX = 64;

const pick = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);

/** Settings from untrusted JSON: the known keys with allowed values, defaults for the rest. */
export const normalizeSettings = (value) => {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const providers = Array.isArray(source.providers)
    ? [...new Set(source.providers.filter((id) => typeof id === 'string' && PROVIDER_ID.test(id)))].slice(0, PROVIDERS_MAX)
    : null;
  return {
    textSize: pick(source.textSize, TEXT_SIZES, DEFAULT_SETTINGS.textSize),
    barHeight: pick(source.barHeight, BAR_HEIGHTS, DEFAULT_SETTINGS.barHeight),
    interval: pick(source.interval, INTERVALS, DEFAULT_SETTINGS.interval),
    providers,
  };
};
