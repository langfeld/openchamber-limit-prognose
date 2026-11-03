// The extension's panel in the right-hand rail: its settings. Every change is
// saved to the service at once; the section follows it from there, and this
// panel follows changes made elsewhere the same way.

import { connectHost } from '@openchamber/sdk';
import { applyHostReady, mountButton, mountCheckbox, mountSelect } from '@openchamber/sdk/ui';

import { BAR_HEIGHTS, INTERVALS, normalizeSettings, TEXT_SIZES } from '../service/settings.js';
import { messagesFor } from './i18n.js';

/** The SDK's own root size, which the panel's controls are drawn for. */
const SDK_ROOT_PX = 14;
const SETTINGS_RETRY_MS = 5 * 1000;

const STYLE = `
:root { color-scheme: light dark; }
html, body { margin: 0; padding: 0; background: transparent; }
body { font-family: var(--oc-font, system-ui, sans-serif); color: var(--oc-fg, CanvasText); font-size: 0.875rem; line-height: 1.45; }
.lp-panel { display: flex; flex-direction: column; gap: 1.5rem; max-width: 34rem; padding: 0.75rem 1rem 1.5rem; }
.lp-panel h2 { margin: 0 0 0.5rem; font-size: 0.875rem; font-weight: 600; }
.lp-muted { margin: 0; color: var(--oc-muted, GrayText); font-size: 0.8125rem; }
.lp-group { display: flex; flex-direction: column; gap: 0.625rem; }
.lp-group > .lp-muted { margin-top: -0.25rem; }
.lp-error { margin: 0; color: var(--oc-error-text, #d33); font-size: 0.8125rem; }
.lp-legend { margin: 0; padding-inline-start: 1.1rem; display: grid; gap: 0.375rem; color: var(--oc-muted, GrayText); font-size: 0.8125rem; }
`;

const host = connectHost();
const root = document.getElementById('root');
const style = document.createElement('style');
style.textContent = STYLE;
document.head.append(style);

let messages = messagesFor('de');
let settings = normalizeSettings(null);
let version = 0;
/** `{ following, providers }` from the service, or `{ error }`. */
let choices = null;
let note = null;
let booted = false;
let handles = [];

const request = async (method, path, body, query) => {
  const result = await host.serviceRequest({
    method,
    path,
    ...(query ? { query } : {}),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const parsed = JSON.parse(result.body);
  if (result.status !== 200) {
    const error = new Error('request failed');
    error.code = parsed?.error;
    throw error;
  }
  return parsed;
};

const accept = (answer) => {
  if (typeof answer?.version !== 'number' || answer.version <= version) return false;
  version = answer.version;
  settings = normalizeSettings(answer.settings);
  // The controls are drawn for the SDK's root; the text size scales them like the app.
  document.documentElement.style.fontSize = `${(SDK_ROOT_PX * settings.textSize) / 100}px`;
  return true;
};

const loadProviders = async () => {
  try {
    choices = await request('GET', '/providers');
  } catch (error) {
    choices = { error: error.code ?? 'service' };
  }
};

const save = async (patch) => {
  try {
    accept(await request('PUT', '/settings', { ...settings, ...patch }));
    note = null;
  } catch {
    note = messages.panel.saveFailed;
  }
  if ('providers' in patch) await loadProviders();
  render();
};

const toggleProvider = (id, checked) => {
  const selected = new Set((choices?.providers ?? []).filter((provider) => provider.selected).map((provider) => provider.id));
  if (checked) selected.add(id);
  else selected.delete(id);
  // Kept in the order the Usage section lists them.
  void save({ providers: (choices?.providers ?? []).map((provider) => provider.id).filter((providerId) => selected.has(providerId)) });
};

const reason = (code) => messages.reasons[code] ?? messages.errors[code] ?? messages.panel.serviceDown;

const heading = (tag, text) => {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
};

const muted = (text, className = 'lp-muted') => {
  const node = document.createElement('p');
  node.className = className;
  node.textContent = text;
  return node;
};

const mount = (parent, mountFn, props) => {
  const slot = document.createElement('div');
  parent.append(slot);
  handles.push(mountFn(slot, props));
};

const render = () => {
  for (const handle of handles) handle.dispose();
  handles = [];
  const text = messages.panel;
  const panel = document.createElement('div');
  panel.className = 'lp-panel';

  // The rail panel's own header already carries the name.
  const top = document.createElement('div');
  top.append(muted(text.intro));
  if (note) top.append(muted(note, 'lp-error'));
  panel.append(top);

  const providers = document.createElement('section');
  providers.className = 'lp-group';
  providers.append(heading('h2', text.providers), muted(text.providersHint));
  if (!choices) {
    providers.append(muted(messages.loading));
  } else if (choices.error) {
    providers.append(muted(text.providersUnavailable(reason(choices.error)), 'lp-error'));
  } else {
    for (const provider of choices.providers) {
      mount(providers, mountCheckbox, {
        label: provider.name,
        checked: provider.selected,
        description: provider.weekly === false ? text.noWeekly : undefined,
        onChange: (checked) => toggleProvider(provider.id, checked),
      });
    }
    if (choices.following) providers.append(muted(text.following));
    else mount(providers, mountButton, { label: text.followUsage, variant: 'outline', size: 'sm', onClick: () => void save({ providers: null }) });
  }
  panel.append(providers);

  const display = document.createElement('section');
  display.className = 'lp-group';
  display.append(heading('h2', text.display));
  mount(display, mountSelect, {
    label: text.textSize,
    value: String(settings.textSize),
    options: TEXT_SIZES.map((size) => ({ id: String(size), label: `${size} %` })),
    onChange: (id) => void save({ textSize: Number(id) }),
  });
  display.append(muted(text.textSizeHint));
  mount(display, mountSelect, {
    label: text.barHeight,
    value: String(settings.barHeight),
    options: BAR_HEIGHTS.map((px) => ({ id: String(px), label: text.barHeightOption(px) })),
    onChange: (id) => void save({ barHeight: Number(id) }),
  });
  panel.append(display);

  const reading = document.createElement('section');
  reading.className = 'lp-group';
  reading.append(heading('h2', text.reading));
  mount(reading, mountSelect, {
    label: text.interval,
    value: String(settings.interval),
    options: INTERVALS.map((minutes) => ({ id: String(minutes), label: text.intervalOption(minutes) })),
    onChange: (id) => void save({ interval: Number(id) }),
  });
  reading.append(muted(text.intervalHint));
  panel.append(reading);

  const legend = document.createElement('section');
  legend.className = 'lp-group';
  const list = document.createElement('ul');
  list.className = 'lp-legend';
  for (const item of text.legendItems) {
    const entry = document.createElement('li');
    entry.textContent = item;
    list.append(entry);
  }
  legend.append(heading('h2', text.legend), list);
  panel.append(legend);

  root.replaceChildren(panel);
};

/** Follows settings changed in another frame, for as long as the panel lives. */
const followSettings = async () => {
  for (;;) {
    try {
      if (accept(await request('GET', '/settings/wait', undefined, { since: String(version) }))) {
        await loadProviders();
        render();
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, SETTINGS_RETRY_MS));
    }
  }
};

host.onReady((context) => {
  applyHostReady(context, document.documentElement);
  messages = messagesFor(context.locale);
  document.documentElement.lang = messages.locale;
  // `applyHostReady` resets the root size on every snapshot.
  document.documentElement.style.fontSize = `${(SDK_ROOT_PX * settings.textSize) / 100}px`;
  render();
  if (booted) return;
  booted = true;
  void (async () => {
    try {
      accept(await request('GET', '/settings'));
    } catch {
      note = messages.panel.serviceDown;
    }
    await loadProviders();
    render();
    void followSettings();
  })();
});
