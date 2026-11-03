// How far the current pace carries a weekly quota window.
//
// The pace is the average since the window began, nights and breaks included,
// because the weekly limit counts them too. The first day after a reset says
// too little about the week, so it gets no forecast yet.

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
/** Time a window has to run before its pace is projected. */
export const MIN_ELAPSED_MS = 24 * 60 * 60 * 1000;
/** Projected share from which the limit counts as tight. */
export const TIGHT_PERCENT = 85;
/** Leeway for providers that report a week a few seconds or minutes short. */
const WEEK_TOLERANCE_MS = 60 * 60 * 1000;

const WEEKLY_LABELS = new Set(['7d', 'weekly']);

const finite = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/**
 * Length of a weekly quota window in ms, or null for any other window.
 * OpenCode Go reports its weekly window without a duration, so the label
 * decides when the duration is missing.
 */
export const weeklyWindowLength = (label, window) => {
  const seconds = finite(window?.windowSeconds);
  if (seconds !== null && seconds > 0) {
    return Math.abs(seconds * 1000 - WEEK_MS) <= WEEK_TOLERANCE_MS ? seconds * 1000 : null;
  }
  return WEEKLY_LABELS.has(label) ? WEEK_MS : null;
};

/**
 * Forecast for one weekly window as of `now`, the time of its reading.
 *
 * `status` is one of
 * - `ok`, `tight`, `over`: projected to the reset; `over` with the time the limit runs out;
 * - `early`: the window's first day, no projection yet;
 * - `exhausted`: used up;
 * - `reset`: the reset lies before `now`, so the reading predates the new window;
 * - `unknown`: no share, or no reset time to count from.
 *
 * The verdict follows the whole percent the section shows, so a forecast shown
 * as 100% never reads as running out.
 */
export const forecastWindow = (window, now, windowMs = WEEK_MS) => {
  const used = finite(window?.usedPercent);
  const resetAt = finite(window?.resetAt);
  const result = {
    status: 'unknown',
    usedPercent: used,
    resetAt,
    elapsedPercent: null,
    projectedPercent: null,
    exhaustAt: null,
    forecastFrom: null,
  };
  if (used === null) return result;
  if (resetAt !== null && resetAt <= now) return { ...result, status: 'reset' };

  const elapsed = resetAt === null ? null : windowMs - Math.min(resetAt - now, windowMs);
  if (elapsed !== null) result.elapsedPercent = (elapsed / windowMs) * 100;
  if (used >= 100) return { ...result, status: 'exhausted' };
  if (elapsed === null) return result;
  if (elapsed < MIN_ELAPSED_MS) {
    return { ...result, status: 'early', forecastFrom: resetAt - windowMs + MIN_ELAPSED_MS };
  }

  const projected = (used * windowMs) / elapsed;
  const shown = Math.round(projected);
  if (shown > 100) {
    // At `used / elapsed` per millisecond, the rest of the limit lasts this long.
    return { ...result, status: 'over', projectedPercent: projected, exhaustAt: now + ((100 - used) * elapsed) / used };
  }
  return { ...result, status: shown >= TIGHT_PERCENT ? 'tight' : 'ok', projectedPercent: projected };
};

/**
 * The weekly windows of each provider, in the order of `readings`, with their
 * forecast.
 *
 * A reading is `{ id, name, result, sampledAt, failure }`: OpenChamber's
 * quota result and when it was taken, and `failure` when the latest attempt
 * failed. With a failure, `result` is the last good one, or null when there
 * never was one. Each window is projected as of its own reading.
 *
 * Providers without a weekly window are left out, also when their latest read
 * failed. A provider with earlier windows keeps them, marked `stale`; one that
 * was never read keeps its `error`, so the section can say so.
 *
 * Model windows follow OpenChamber's own Usage section: when the user picked
 * models for a provider, only those show.
 */
export const buildForecast = ({ readings, selectedModels = {}, now }) => {
  const providers = [];
  for (const { id, name, result, sampledAt, failure } of readings) {
    const provider = {
      id,
      name: result?.providerName || name || id,
      windows: [],
      sampledAt: result ? sampledAt : null,
      stale: null,
      error: null,
    };
    if (!result) {
      provider.error = failure ?? { code: 'failed', detail: null };
      providers.push(provider);
      continue;
    }

    const add = (key, label, model, window) => {
      const length = weeklyWindowLength(label, window);
      if (length === null) return;
      provider.windows.push({ key, label, model, ...forecastWindow(window, sampledAt, length) });
    };
    for (const [label, window] of Object.entries(result.usage?.windows ?? {})) {
      add(`window-${label}`, label, null, window);
    }
    const picked = Array.isArray(selectedModels[id]) ? selectedModels[id] : [];
    for (const [model, usage] of Object.entries(result.usage?.models ?? {})) {
      if (picked.length > 0 && !picked.includes(model)) continue;
      for (const [label, window] of Object.entries(usage?.windows ?? {})) {
        add(`model-${model}-${label}`, label, model, window);
      }
    }
    if (provider.windows.length === 0) continue;
    if (failure) provider.stale = failure;
    providers.push(provider);
  }
  return { fetchedAt: now, providers };
};
