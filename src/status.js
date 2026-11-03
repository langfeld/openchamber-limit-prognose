// The Work Status section's page. It asks the extension's service for the
// forecast while the section is open, redraws on every answer, and follows the
// extension's settings, which the service announces as they change.

import { connectHost } from '@openchamber/sdk';
import { applyHostReady } from '@openchamber/sdk/ui';

import { normalizeSettings } from '../service/settings.js';
import { messagesFor } from './i18n.js';
import { renderSection } from './render.js';
import { STYLE } from './style.js';
import { barGeometry, measureFrameWidth, rootFontSize, spacingScaleFor } from './text-scale.js';

/** After a failed read the next one follows in 30 s, then each wait doubles up to the interval. */
const RETRY_MS = 30 * 1000;
/** A forecast that starts or a window that resets is read this long after the moment. */
const EVENT_DELAY_MS = 60 * 1000;
/** A reading taken before its reset is read again after this long, not right away. */
const RESET_RETRY_MS = 5 * 60 * 1000;
/** Pause before waiting for settings again after the wait itself failed. */
const SETTINGS_RETRY_MS = 5 * 1000;
// Header controls carry text only; this character draws the two arrows of the
// Usage section's refresh icon. Like that icon it is disabled while a read runs.
const REFRESH_LABEL = '🗘';

const host = connectHost();
const root = document.getElementById('root');
const style = document.createElement('style');
style.textContent = STYLE;
document.head.append(style);

let messages = messagesFor('de');
let settings = normalizeSettings(null);
let settingsVersion = 0;
let data = null;
let problem = null;
let loading = true;
/** The first snapshot began loading; `started` once the first read is out. */
let booted = false;
let started = false;
let controlsSupported = false;
let controlsShown = false;
/** What the page measured and set, sent along with each reading for checking (`/health`). */
let frame = {};
let spaceScale = 1;
let inFlight = 0;
let requested = 0;
/** The latest request that settled decides whether a problem shows. */
let settled = 0;
let failures = 0;
let timer = null;

const render = () => {
  root.replaceChildren(renderSection({
    data,
    problem,
    loading,
    reading: inFlight > 0,
    messages,
    now: Date.now(),
    onRefresh: controlsShown ? null : () => void load(true),
  }));
};

/** Text size and bar height from the settings, spacing worked out from the frame's width. */
const applyScale = () => {
  const html = document.documentElement;
  html.style.fontSize = rootFontSize(settings.textSize);
  const width = measureFrameWidth();
  spaceScale = spacingScaleFor(width, settings.textSize);
  const dpr = window.devicePixelRatio || 1;
  const geometry = barGeometry({ barHeight: settings.barHeight, textSize: settings.textSize, spaceScale, dpr });
  html.style.setProperty('--lp-space', String(spaceScale));
  html.style.setProperty('--lp-bar-h', `${geometry.bar}px`);
  html.style.setProperty('--lp-mark-h', `${geometry.mark}px`);
  html.style.setProperty('--lp-mark-w', `${geometry.markWidth}px`);
  html.style.setProperty('--lp-mark-top', `${geometry.markTop}px`);
  frame = {
    width,
    inner: window.innerWidth,
    client: html.clientWidth,
    dpr,
    textSize: settings.textSize,
    spaceScale,
    bar: geometry.bar,
  };
};

const publishControls = () => {
  if (!controlsSupported) return;
  host.setStatusControls([{ kind: 'button', id: 'refresh', label: REFRESH_LABEL, disabled: inFlight > 0 }]).then(
    () => {
      if (controlsShown) return;
      controlsShown = true;
      render();
    },
    () => {
      if (!controlsShown) return;
      controlsShown = false;
      render();
    },
  );
};

/** Whether the service failed or could not read every provider. */
const troubled = () => Boolean(problem) || (data?.providers ?? []).some((provider) => provider.stale || provider.error);

/** How long the answer stays current: until a forecast starts or a window resets. */
const untilChange = () => {
  let wait = Infinity;
  const now = Date.now();
  for (const provider of data?.providers ?? []) {
    for (const window of provider.windows) {
      // A reading from before its reset: the provider has not caught up yet.
      if (window.status === 'reset') wait = Math.min(wait, RESET_RETRY_MS);
      for (const moment of [window.forecastFrom, window.resetAt]) {
        if (typeof moment === 'number' && moment > now) wait = Math.min(wait, moment - now + EVENT_DELAY_MS);
      }
    }
  }
  return wait;
};

/** Every scheduled read skips the service's five-minute cache: the interval is the user's. */
const schedule = () => {
  clearTimeout(timer);
  const interval = settings.interval * 60 * 1000;
  let delay = troubled() ? Math.min(interval, RETRY_MS * 2 ** Math.max(0, failures - 1)) : interval;
  delay = Math.min(delay, untilChange());
  timer = setTimeout(() => void load(true), delay);
};

const load = async (refresh) => {
  const seq = ++requested;
  inFlight += 1;
  publishControls();
  render();
  let answer = null;
  let failure = null;
  try {
    const query = { frame: JSON.stringify(frame) };
    if (refresh) query.refresh = '1';
    const result = await host.serviceRequest({ method: 'GET', path: '/forecast', query });
    let body = null;
    try {
      body = JSON.parse(result.body);
    } catch {
      // Answered below as a failed read.
    }
    if (result.status === 200 && Array.isArray(body?.providers)) answer = body;
    else failure = typeof body?.error === 'string' && body.error in messages.errors ? body.error : 'failed';
  } catch {
    // The host could not reach the service: stopped, starting, or rebuilt.
    failure = 'service';
  }
  inFlight -= 1;
  // An answer that arrives late must not replace a newer one.
  if (answer && (!data || answer.fetchedAt >= data.fetchedAt)) data = answer;
  if (seq > settled) {
    settled = seq;
    problem = failure;
    failures = troubled() ? failures + 1 : 0;
  }
  loading = false;
  publishControls();
  render();
  schedule();
};

const applySettings = (version, next) => {
  if (version <= settingsVersion) return;
  const previous = settings;
  settingsVersion = version;
  settings = normalizeSettings(next);
  applyScale();
  if (!started) return;
  if (JSON.stringify(previous.providers) !== JSON.stringify(settings.providers)) {
    void load(true);
    return;
  }
  if (previous.interval !== settings.interval) schedule();
  render();
};

const readSettings = async (path, query) => {
  const result = await host.serviceRequest({ method: 'GET', path, query });
  const body = JSON.parse(result.body);
  if (result.status !== 200 || typeof body?.version !== 'number') throw new Error('settings unavailable');
  applySettings(body.version, body.settings);
};

/** Waits on the service for changed settings for as long as the frame lives. */
const followSettings = async () => {
  for (;;) {
    try {
      await readSettings('/settings/wait', { since: String(settingsVersion) });
    } catch {
      await new Promise((resolve) => setTimeout(resolve, SETTINGS_RETRY_MS));
    }
  }
};

// Registered before the host is ready, as the SDK asks.
host.onStatusControl((event) => {
  if (event.id === 'refresh') void load(true);
});

// A project change clears the section's header controls.
host.onDirectory(() => publishControls());

host.onReady((context) => {
  // `applyHostReady` sets the root to 0.875rem on every snapshot; the text size replaces it.
  applyHostReady(context, document.documentElement);
  applyScale();
  messages = messagesFor(context.locale);
  document.documentElement.lang = messages.locale;
  controlsSupported = Boolean(context.features?.statusControls);
  publishControls();
  render();
  if (booted) return;
  booted = true;
  // The settings first, so the forecast is not drawn at 100% and then jumps.
  void readSettings('/settings').catch(() => {}).finally(() => {
    started = true;
    void load(false);
    void followSettings();
  });
});

window.addEventListener('resize', applyScale);

// The section's frame follows the content, up to the host's limit.
new ResizeObserver(() => {
  void host.setHeight(Math.ceil(root.getBoundingClientRect().height)).catch(() => {});
}).observe(root);
