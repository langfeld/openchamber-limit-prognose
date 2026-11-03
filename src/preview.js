// Development preview: the section in both Flexoki themes, drawn from quota
// readings through the service's own forecast code, without OpenChamber.
// Open preview/index.html after `npm run build`; `?theme=dark&zoom=2` shows one
// theme enlarged, `?size=110&space=1.22&bar=4` a text size, a spacing factor
// and a bar height.

import { buildForecast } from '../service/forecast.js';
import { messagesFor } from './i18n.js';
import { renderSection } from './render.js';
import { STYLE } from './style.js';
import { barGeometry, rootFontSize } from './text-scale.js';

// Made-up reset times and usage, not anyone's account.
const CLAUDE_RESET = new Date('2026-11-09T18:00:00+01:00').getTime(); // Mo., 9. Nov., 18:00
const CODEX_RESET = new Date('2026-11-08T08:30:00+01:00').getTime(); // So., 8. Nov., 8:30

const weekly = (label, usedPercent, resetAt, windowSeconds = 604800) => ({ [label]: { usedPercent, resetAt, windowSeconds } });

const claude = (used, fable, resetAt = CLAUDE_RESET) => ({
  providerId: 'claude', providerName: 'Claude', ok: true, configured: true,
  usage: { windows: weekly('7d', used, resetAt), models: { Fable: { windows: weekly('7d', fable, resetAt) } } },
});
const codex = (used) => ({
  providerId: 'codex', providerName: 'Codex', ok: true, configured: true,
  usage: { windows: { ...weekly('5h', 12, CODEX_RESET, 18000), ...weekly('weekly', used, CODEX_RESET) } },
});
const reading = (result, sampledAt, failure = null) => ({ id: result.providerId, name: result.providerName, result, sampledAt, failure });

const SCENARIOS = [
  {
    title: 'Mitte der Woche: Donnerstag, 5. Nov., 12:36',
    now: new Date('2026-11-05T12:36:00+01:00').getTime(),
    state: (now) => ({ data: buildForecast({ readings: [reading(claude(25, 41), now), reading(codex(52), now)], selectedModels: { claude: ['Fable'] }, now }) }),
  },
  {
    title: 'Kurz nach dem Reset: Dienstag, 3. Nov., 9:15',
    now: new Date('2026-11-03T09:15:00+01:00').getTime(),
    state: (now) => ({ data: buildForecast({ readings: [reading(claude(2, 0), now), reading(codex(4), now)], selectedModels: { claude: ['Fable'] }, now }) }),
  },
  {
    title: 'Randfälle: Sonntag, 8. Nov., 20:00',
    now: new Date('2026-11-08T20:00:00+01:00').getTime(),
    state: (now) => ({
      problem: 'unreachable',
      data: buildForecast({
        readings: [
          reading(claude(100, 97), now - 40 * 60 * 1000, { code: 'timeout', detail: null }),
          { id: 'codex', name: 'Codex', result: null, sampledAt: null, failure: { code: 'provider', detail: 'Request failed (429)' } },
          reading({ providerId: 'opencode-go', providerName: 'OpenCode Go', ok: true, configured: true, usage: { windows: { weekly: { usedPercent: 40, resetAt: null, windowSeconds: null } } } }, now),
          reading({ providerId: 'zai-coding-plan', providerName: 'z.ai', ok: true, configured: true, usage: { windows: weekly('weekly', 55, now - 60 * 1000) } }, now),
        ],
        selectedModels: {},
        now,
      }),
    }),
  },
  { title: 'Dienst antwortet nicht', now: Date.now(), state: () => ({ data: null, problem: 'service' }) },
];

const THEMES = {
  dark: {
    background: '#171515', panel: 'color-mix(in srgb, #dedcd3 3%, #171515)',
    '--oc-fg': '#dedcd3', '--oc-muted': '#8b8a83', '--oc-border': '#2b2a28d4',
    '--oc-success': '#A0AF54', '--oc-warning': '#DA702C', '--oc-error': '#d76459',
    '--oc-success-text': '#A0AF54', '--oc-warning-text': '#DA702C', '--oc-error-text': '#d76459',
  },
  light: {
    background: '#fffdf4', panel: 'color-mix(in srgb, #494741 3%, #fffdf4)',
    '--oc-fg': '#494741', '--oc-muted': '#6a6962', '--oc-border': '#e6e4db',
    '--oc-success': '#5e760a', '--oc-warning': '#b54f14', '--oc-error': '#AF3029',
    '--oc-success-text': '#5e760a', '--oc-warning-text': '#b54f14', '--oc-error-text': '#AF3029',
  },
};

const style = document.createElement('style');
style.textContent = `${STYLE}
body { margin: 0; padding: 16px; font-family: system-ui, sans-serif; background: #888; }
.theme { display: flex; flex-wrap: wrap; gap: 16px; padding: 16px; margin-bottom: 16px; border-radius: 8px; }
.case { width: 300px; }
.case h2 { margin: 0 0 6px; font: 600 12px system-ui, sans-serif; }
.panel { padding: 0.5rem; border-radius: 12px; }
.heading { display: flex; align-items: center; gap: 6px; height: 1.5rem; padding: 0 0.25rem; font-size: 0.75rem; font-weight: 600; }
.frame { margin: 0 0.25rem; }
`;
document.head.append(style);

const params = new URLSearchParams(location.search);
const zoom = Number(params.get('zoom'));
if (zoom > 0) document.body.style.zoom = String(zoom);
const size = Number(params.get('size')) || 100;
const space = Number(params.get('space')) || 1;
const geometry = barGeometry({ barHeight: Number(params.get('bar')) || 4, textSize: size, spaceScale: space, dpr: window.devicePixelRatio || 1 });
const html = document.documentElement;
html.style.fontSize = rootFontSize(size);
html.style.setProperty('--lp-space', String(space));
html.style.setProperty('--lp-bar-h', `${geometry.bar}px`);
html.style.setProperty('--lp-mark-h', `${geometry.mark}px`);
html.style.setProperty('--lp-mark-w', `${geometry.markWidth}px`);
html.style.setProperty('--lp-mark-top', `${geometry.markTop}px`);
const only = params.get('theme');

const messages = messagesFor('de');
for (const [name, theme] of Object.entries(THEMES)) {
  if (only && only !== name) continue;
  const section = document.createElement('div');
  section.className = 'theme';
  section.style.background = theme.background;
  for (const [key, value] of Object.entries(theme)) if (key.startsWith('--')) section.style.setProperty(key, value);
  for (const scenario of SCENARIOS) {
    const box = document.createElement('div');
    box.className = 'case';
    box.innerHTML = `<h2 style="color:${theme['--oc-fg']}">${scenario.title} · ${name}</h2>`;
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.style.background = theme.panel;
    panel.style.color = theme['--oc-muted'];
    panel.innerHTML = `<div class="heading" style="color:${theme['--oc-fg']}">Limit-Prognose<span style="flex:1"></span>↻</div>`;
    const frame = document.createElement('div');
    frame.className = 'frame';
    const state = scenario.state(scenario.now);
    frame.append(renderSection({ data: null, problem: null, loading: false, reading: false, onRefresh: null, ...state, messages, now: scenario.now }));
    panel.append(frame);
    box.append(panel);
    section.append(box);
  }
  document.body.append(section);
}
