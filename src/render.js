// The section body: per provider a heading, per weekly window a row like the
// Usage section's, a bar and one line of forecast.
//
// The bar holds three readings: the solid part is what is used, the light part
// what the current pace adds until the reset, and the mark where an even pace
// would stand now. A fill left of the mark means the limit lasts.

import { formatDuration, formatMoment, formatPercent, formatReset, formatStamp } from './format.js';
import { PROVIDER_LOGOS } from './logos.js';

const STATUS_TONE = { ok: 'success', tight: 'warning', over: 'error', exhausted: 'error' };

// OpenChamber's `refresh` icon (Remix Icon `refresh-line`).
const REFRESH_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M5.46257 4.43262C7.21556 2.91688 9.5007 2 12 2C17.5228 2 22 6.47715 22 12C22 14.1361 21.3302 16.1158 20.1892 17.7406L17 12H20C20 7.58172 16.4183 4 12 4C9.84982 4 7.89777 4.84827 6.46023 6.22842L5.46257 4.43262ZM18.5374 19.5674C16.7844 21.0831 14.4993 22 12 22C6.47715 22 2 17.5228 2 12C2 9.86386 2.66979 7.88416 3.8108 6.25944L7 12H4C4 16.4183 7.58172 20 12 20C14.1502 20 16.1022 19.1517 17.5398 17.7716L18.5374 19.5674Z"/></svg>';

// Without a forecast there is no verdict to colour in; only the Usage
// section's own thresholds, 50% and 80% used, still apply.
const usageTone = (used) => (used >= 80 ? 'error' : used >= 50 ? 'warning' : 'neutral');

const el = (tag, className, ...children) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  for (const child of children) {
    if (child !== null && child !== undefined) node.append(child);
  }
  return node;
};

const toned = (text, tone) => {
  const node = el('span', 'lp-toned', text);
  node.dataset.tone = tone;
  return node;
};

// As OpenChamber's `getDisplayModelName`: an auth-source prefix is not part of the name.
const displayModelName = (name) => {
  const slash = name.indexOf('/');
  if (slash !== -1 && ['gemini', 'antigravity'].includes(name.slice(0, slash))) return name.slice(slash + 1);
  return name;
};

const windowLabel = (window, messages) => {
  const label = messages.windows[window.label] ?? window.label;
  return window.model ? `${displayModelName(window.model)} · ${label}` : label;
};

const caption = (window, now, messages) => {
  const node = el('div', 'lp-caption');
  if (window.status === 'ok' || window.status === 'tight') {
    node.append(`${messages.untilReset(formatPercent(window.projectedPercent))} · `, toned(messages[window.status], STATUS_TONE[window.status]));
  } else if (window.status === 'over') {
    node.append(
      `${messages.projected(formatPercent(window.projectedPercent))} · `,
      toned(messages.runsOut(formatMoment(window.exhaustAt, now, messages)), 'error'),
    );
  } else if (window.status === 'exhausted') {
    node.append(toned(messages.exhausted, 'error'));
  } else if (window.status === 'early') {
    node.append(messages.early(formatMoment(window.forecastFrom, now, messages)));
  } else if (window.status === 'reset') {
    node.append(messages.reset);
  } else {
    node.append(messages.unknown);
  }
  return node;
};

const tooltip = (window, now, messages) => {
  const text = messages.tooltip;
  const reset = window.resetAt === null ? null : formatReset(window.resetAt, now, messages);
  const pace = window.elapsedPercent === null
    ? null
    : text.pace(formatPercent(window.usedPercent), formatPercent(window.elapsedPercent));
  const lines = [];
  if (window.status === 'ok' || window.status === 'tight') {
    lines.push(pace, text.projection(formatPercent(window.projectedPercent), reset));
  } else if (window.status === 'over') {
    lines.push(pace, text.runsOut(
      formatMoment(window.exhaustAt, now, messages),
      formatDuration(window.resetAt - window.exhaustAt, messages),
    ));
  } else if (window.status === 'early') {
    lines.push(pace, text.early(formatMoment(window.forecastFrom, now, messages)));
  } else if (window.status === 'exhausted') {
    lines.push(text.exhausted, reset === null ? null : text.resetAt(reset));
  } else if (window.status === 'reset') {
    lines.push(text.reset);
  } else {
    lines.push(text.unknown);
  }
  if (pace && window.status !== 'exhausted') lines.push(text.mark);
  return lines.filter(Boolean).join('\n');
};

const bar = (window) => {
  const used = Math.max(0, Math.min(100, window.usedPercent ?? 0));
  const node = el('div', 'lp-bar');
  node.dataset.tone = STATUS_TONE[window.status] ?? usageTone(used);
  node.setAttribute('role', 'progressbar');
  node.setAttribute('aria-valuemin', '0');
  node.setAttribute('aria-valuemax', '100');
  node.setAttribute('aria-valuenow', String(Math.round(used)));
  if (window.projectedPercent !== null) {
    const forecast = el('span', 'lp-forecast');
    forecast.style.width = `${Math.min(100, window.projectedPercent)}%`;
    node.append(forecast);
  }
  const fill = el('span', 'lp-used');
  fill.style.width = `${used}%`;
  node.append(fill);
  if (window.elapsedPercent !== null && window.status !== 'exhausted') {
    const mark = el('span', 'lp-mark');
    mark.style.insetInlineStart = `${window.elapsedPercent}%`;
    node.append(mark);
  }
  return node;
};

const renderWindow = (window, now, messages) => {
  const valueTone = window.status === 'tight' || window.status === 'over' || window.status === 'exhausted'
    ? STATUS_TONE[window.status]
    : window.status !== 'ok' && window.usedPercent !== null && window.usedPercent >= 50
      ? usageTone(window.usedPercent)
      : null;
  let value = null;
  if (window.usedPercent !== null) {
    const text = formatPercent(window.usedPercent);
    value = valueTone ? toned(text, valueTone) : el('span', null, text);
    value.classList.add('lp-value');
  }
  const row = el(
    'div',
    'lp-row',
    el(
      'span',
      'lp-label',
      el('span', 'lp-name', windowLabel(window, messages)),
      window.resetAt === null ? null : el('span', 'lp-reset', formatReset(window.resetAt, now, messages)),
    ),
    value,
  );
  const node = el('div', 'lp-window', row, bar(window), caption(window, now, messages));
  node.title = tooltip(window, now, messages);
  return node;
};

const reason = (failure, messages) => {
  if (!failure) return messages.reasons.failed;
  if ((failure.code === 'provider' || failure.code === 'failed') && failure.detail) return failure.detail;
  return messages.reasons[failure.code] ?? messages.reasons.failed;
};

/**
 * @param {{ data: object | null, problem: string | null, loading: boolean, reading: boolean,
 *   messages: object, now: number, onRefresh: (() => void) | null }} state
 * `data` is the service's newest answer and `problem` the message key of the
 * latest failed request; a failure after a good answer keeps that answer on
 * screen. `onRefresh` draws a refresh control of its own, for a host that
 * takes no header controls.
 */
export const renderSection = ({ data, problem, loading, reading, messages, now, onRefresh }) => {
  const root = el('div', 'lp');
  if (!data) {
    root.append(el('p', 'lp-note', loading ? messages.loading : (messages.errors[problem] ?? messages.errors.failed)));
    return root;
  }
  if (data.providers.length === 0) root.append(el('p', 'lp-note', messages.none));
  for (const provider of data.providers) {
    const logo = el('span', 'lp-logo');
    const svg = PROVIDER_LOGOS[provider.id];
    if (svg) logo.innerHTML = svg;
    root.append(el('div', 'lp-provider', logo, el('span', 'lp-provider-name', provider.name)));
    if (provider.error) {
      root.append(el('p', 'lp-note', messages.unavailable(reason(provider.error, messages))));
      continue;
    }
    if (provider.stale) {
      const note = el('p', 'lp-note', messages.stale(formatStamp(provider.sampledAt, now, messages)));
      note.title = reason(provider.stale, messages);
      root.append(note);
    }
    for (const window of provider.windows) root.append(renderWindow(window, now, messages));
  }
  const foot = el('p', 'lp-foot', messages.updated(formatStamp(data.fetchedAt, now, messages)));
  if (problem) {
    foot.append(' · ', toned(messages.refreshFailed, 'error'));
    foot.title = messages.errors[problem] ?? messages.errors.failed;
  }
  if (onRefresh) {
    const button = el('button', 'lp-refresh');
    // Inside the frame the app's own refresh icon can be drawn.
    button.innerHTML = REFRESH_ICON;
    button.type = 'button';
    button.title = messages.refresh;
    button.setAttribute('aria-label', messages.refresh);
    button.disabled = reading;
    button.addEventListener('click', onRefresh);
    foot.append(button);
  }
  root.append(foot);
  return root;
};
