// Local service of the Limit-Prognose extension. OpenChamber starts it on the
// first request of one of its pages and passes the pages' requests through.
//
// It reads the usage OpenChamber already reports (`/api/quota/:provider` on the
// desktop app's own local server) and answers with the weekly windows and the
// forecast for each. Every quota read reaches the provider's API, so an answer
// is kept for a few minutes and requests that arrive together share one read.
//
// OpenChamber gives a request to this service 20 seconds. A read therefore
// has a budget below that: a provider that does not answer in time is
// reported on its own, with its last good windows when there are any.
//
// It also keeps the extension's settings (`daten/einstellungen.json`), tells
// waiting pages about changes, and notes the forecasts once an hour per window
// (`daten/verlauf.jsonl`) so their accuracy can be checked later.

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildForecast, weeklyWindowLength } from './forecast.js';
import { normalizeSettings } from './settings.js';

const port = Number(process.env.OPENCHAMBER_SERVICE_PORT);
const token = process.env.OPENCHAMBER_SERVICE_TOKEN ?? '';
if (!port || !token) {
  console.error('OPENCHAMBER_SERVICE_PORT and OPENCHAMBER_SERVICE_TOKEN are required');
  process.exit(1);
}

// OpenChamber does not pass its data folder to services, so this is the default one.
const OPENCHAMBER_DIR = path.join(os.homedir(), '.config', 'openchamber');
const OPENCHAMBER_SETTINGS_FILE = path.join(OPENCHAMBER_DIR, 'settings.json');
const OPENCHAMBER_PREFERENCES_FILE = path.join(OPENCHAMBER_DIR, 'preferences.json');

// OpenChamber passes no such variables; the tests point them elsewhere and shorten the waits.
const DATA_DIR = process.env.LIMIT_PROGNOSE_DATA_DIR
  || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'daten');
const SETTINGS_FILE = path.join(DATA_DIR, 'einstellungen.json');
const HISTORY_FILE = path.join(DATA_DIR, 'verlauf.jsonl');
/** A refresh within this time of the last read answers from it, so clicks cannot flood the providers. */
const REFRESH_MIN_MS = Number(process.env.LIMIT_PROGNOSE_REFRESH_MIN_MS) || 30 * 1000;
/** Whole read, below the 20 s OpenChamber waits. */
const READ_BUDGET_MS = Number(process.env.LIMIT_PROGNOSE_READ_BUDGET_MS) || 15_000;
/** How long a page's wait for new settings is held open, below the same 20 s. */
const SETTINGS_WAIT_MS = Number(process.env.LIMIT_PROGNOSE_SETTINGS_WAIT_MS) || 15_000;
const CACHE_MS = 5 * 60 * 1000;
const LIST_TIMEOUT_MS = 5_000;
const HISTORY_EVERY_MS = 60 * 60 * 1000;

// Order and names of OpenChamber's own Usage section (`QUOTA_PROVIDERS`, 2.6.0).
// Providers a later version adds follow in the order OpenChamber lists them.
const PROVIDER_NAMES = new Map([
  ['claude', 'Claude'], ['cline-pass', 'ClinePass'], ['codex', 'Codex'], ['cursor', 'Cursor'],
  ['github-copilot', 'GitHub Copilot'], ['google', 'Google'], ['antigravity', 'Antigravity'],
  ['kimi-for-coding', 'Kimi for Coding'], ['nano-gpt', 'NanoGPT'], ['openrouter', 'OpenRouter'],
  ['zai-coding-plan', 'z.ai'], ['zhipuai-coding-plan', 'Zhipu AI Coding Plan'],
  ['minimax-cn-coding-plan', 'MiniMax Coding Plan (minimaxi.com)'], ['minimax-coding-plan', 'MiniMax Coding Plan (minimax.io)'],
  ['ollama-cloud', 'Ollama Cloud'], ['wafer', 'Wafer.ai'], ['opencode-go', 'OpenCode Go'], ['opencode', 'OpenCode Zen'],
  ['deepinfra', 'DeepInfra'], ['deepseek', 'DeepSeek'], ['exe-dev', 'exe.dev'], ['hyper', 'Charm Hyper'],
  ['neuralwatt', 'NeuralWatt'], ['kilo', 'Kilo Code'], ['zenmux', 'ZenMux'], ['xai', 'xAI'],
]);
const PROVIDER_ORDER = [...PROVIDER_NAMES.keys()];

/** A read that failed; `code` names the cause for the page. */
class Failure extends Error {
  constructor(code, detail = null) {
    super(detail ?? code);
    this.code = code;
    this.detail = detail;
  }
}

const readJson = async (file) => JSON.parse(await fs.readFile(file, 'utf8'));

// ----- OpenChamber -----

/**
 * The port from `settings.json`, which the desktop app rewrites on every start,
 * and the Usage section's choices from `preferences.json`, where 2.6.0 keeps
 * them; `settings.json` still holds an older copy, used when they are missing.
 */
const readOpenChamber = async () => {
  let settings;
  try {
    settings = await readJson(OPENCHAMBER_SETTINGS_FILE);
  } catch {
    throw new Failure('settings');
  }
  let fields = {};
  try {
    fields = (await readJson(OPENCHAMBER_PREFERENCES_FILE))?.fields ?? {};
  } catch {
    // Older data folders have no preferences file.
  }
  const preference = (key) => (fields[key] && 'value' in fields[key] ? fields[key].value : settings[key]);
  const localPort = settings.desktopLocalPort;
  if (!Number.isInteger(localPort) || localPort <= 0) throw new Failure('port');
  const shownProviders = preference('usageDropdownProviders');
  const selectedModels = preference('usageSelectedModels');
  return {
    origin: `http://127.0.0.1:${localPort}`,
    shownProviders: Array.isArray(shownProviders) ? shownProviders : null,
    selectedModels: selectedModels && typeof selectedModels === 'object' ? selectedModels : {},
  };
};

const getJson = async (origin, pathname, timeoutMs) => {
  let response;
  try {
    response = await fetch(`${origin}${pathname}`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(Math.max(1, timeoutMs)),
    });
  } catch (error) {
    throw new Failure(error?.name === 'TimeoutError' ? 'timeout' : 'unreachable');
  }
  if (response.status === 401 || response.status === 403) throw new Failure('denied');
  let body = null;
  try {
    body = await response.json();
  } catch (error) {
    // The budget can also run out while the body arrives.
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') throw new Failure('timeout');
  }
  if (!response.ok || body === null || typeof body !== 'object') {
    throw new Failure('failed', typeof body?.error === 'string' ? body.error : `HTTP ${response.status}`);
  }
  return body;
};

/** Configured providers in the Usage section's order. */
const configuredProviders = async (origin, timeoutMs) => {
  const listed = await getJson(origin, '/api/quota/providers', timeoutMs);
  const configured = Array.isArray(listed.providers) ? listed.providers.filter((id) => typeof id === 'string') : [];
  return [
    ...PROVIDER_ORDER.filter((id) => configured.includes(id)),
    ...configured.filter((id) => !PROVIDER_ORDER.includes(id)),
  ];
};

// ----- Settings -----

let settings = normalizeSettings(null);
// Counted from the clock, so a restarted service is ahead of every page that
// knew the last one, and no page misses a change for an older number.
let settingsVersion = Date.now();
let saving = Promise.resolve();
const settingsWaiters = new Set();

const settingsLoaded = (async () => {
  try {
    settings = normalizeSettings(await readJson(SETTINGS_FILE));
  } catch {
    // No file yet: the defaults.
  }
})();

const saveSettings = async (next) => {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const temporary = `${SETTINGS_FILE}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`);
  await fs.rename(temporary, SETTINGS_FILE);
};

const settingsAnswer = () => ({ version: settingsVersion, settings });

/** Holds a page's request until the settings change or the wait runs out. */
const waitForSettings = (since) => new Promise((resolve) => {
  if (settingsVersion > since) {
    resolve();
    return;
  }
  const waiter = () => {
    clearTimeout(timer);
    settingsWaiters.delete(waiter);
    resolve();
  };
  const timer = setTimeout(waiter, SETTINGS_WAIT_MS);
  settingsWaiters.add(waiter);
});

// ----- Forecast -----

/** Last good quota result per provider, for a read that fails later. */
const lastGood = new Map();

const hasWeeklyWindow = (result) => [
  ...Object.entries(result.usage?.windows ?? {}),
  ...Object.values(result.usage?.models ?? {}).flatMap((usage) => Object.entries(usage?.windows ?? {})),
].some(([label, window]) => weeklyWindowLength(label, window) !== null);

const read = async () => {
  const deadline = Date.now() + READ_BUDGET_MS;
  const { origin, shownProviders, selectedModels } = await readOpenChamber();
  const configured = await configuredProviders(origin, Math.min(LIST_TIMEOUT_MS, deadline - Date.now()));
  // The extension's own choice, else the Usage section's, else every provider it knows.
  const chosen = settings.providers ?? shownProviders;
  const ids = configured.filter((id) => (chosen ? chosen.includes(id) : PROVIDER_NAMES.has(id)));

  // One provider that cannot be read must not hide the others.
  const readings = await Promise.all(ids.map(async (id) => {
    const name = PROVIDER_NAMES.get(id) ?? id;
    let failure;
    try {
      const result = await getJson(origin, `/api/quota/${encodeURIComponent(id)}`, deadline - Date.now());
      if (result.configured === false) {
        lastGood.delete(id);
        return null;
      }
      if (result.ok === true) {
        const sampledAt = Date.now();
        lastGood.set(id, { result, sampledAt });
        return { id, name, result, sampledAt, failure: null };
      }
      failure = { code: 'provider', detail: typeof result.error === 'string' ? result.error : null };
    } catch (error) {
      const known = error instanceof Failure ? error : new Failure('failed');
      failure = { code: known.code, detail: known.detail };
    }
    const good = lastGood.get(id);
    return { id, name, result: good?.result ?? null, sampledAt: good?.sampledAt ?? null, failure };
  }));

  const forecast = buildForecast({ readings: readings.filter(Boolean), selectedModels, now: Date.now() });
  void recordHistory(forecast);
  return forecast;
};

const rounded = (value) => (value === null ? null : Math.round(value * 10) / 10);
/** The end of the record is enough to know when each window was last noted. */
const HISTORY_TAIL_BYTES = 64 * 1024;

/** When each window was last noted, read once from the record so a restart does not note it twice. */
const lastRecordedLoaded = (async () => {
  const last = new Map();
  let file;
  try {
    file = await fs.open(HISTORY_FILE, 'r');
    const { size } = await file.stat();
    const length = Math.min(size, HISTORY_TAIL_BYTES);
    const { buffer } = await file.read(Buffer.alloc(length), 0, length, size - length);
    // The first line of a cut tail may be partial; it simply does not parse.
    for (const line of buffer.toString('utf8').split('\n')) {
      try {
        const entry = JSON.parse(line);
        const id = `${entry.provider}/${entry.window}`;
        if (typeof entry.t === 'number' && entry.t > (last.get(id) ?? 0)) last.set(id, entry.t);
      } catch {
        // Not a whole line.
      }
    }
  } catch {
    // No record yet.
  } finally {
    await file?.close();
  }
  return last;
})();

/** One line per window and hour, from fresh readings only. A failed write loses that line, nothing else. */
const recordHistory = async (forecast) => {
  const lastRecorded = await lastRecordedLoaded;
  const lines = [];
  for (const provider of forecast.providers) {
    if (provider.stale || provider.error) continue;
    for (const window of provider.windows) {
      const id = `${provider.id}/${window.key}`;
      if (provider.sampledAt - (lastRecorded.get(id) ?? 0) < HISTORY_EVERY_MS) continue;
      lastRecorded.set(id, provider.sampledAt);
      lines.push(JSON.stringify({
        t: provider.sampledAt,
        provider: provider.id,
        window: window.key,
        status: window.status,
        used: window.usedPercent,
        elapsed: rounded(window.elapsedPercent),
        projected: rounded(window.projectedPercent),
        resetAt: window.resetAt,
      }));
    }
  }
  if (lines.length === 0) return;
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.appendFile(HISTORY_FILE, `${lines.join('\n')}\n`);
  } catch {
    // The forecast itself does not depend on the record.
  }
};

let cached = null;
let pending = null;

const answer = (refresh) => {
  const age = cached ? Date.now() - cached.at : Infinity;
  if (age < (refresh ? REFRESH_MIN_MS : CACHE_MS)) return Promise.resolve(cached.body);
  // A read already under way is as fresh as a new one would be.
  if (!pending) {
    pending = read()
      .then((body) => {
        cached = { at: Date.now(), body };
        return body;
      })
      .finally(() => {
        pending = null;
      });
  }
  return pending;
};

/** Providers for the settings page: configured ones the Usage section knows, which are shown, which report a weekly window. */
const providerChoices = async () => {
  const { origin, shownProviders } = await readOpenChamber();
  const configured = await configuredProviders(origin, LIST_TIMEOUT_MS);
  const chosen = settings.providers ?? shownProviders;
  return {
    following: settings.providers === null,
    providers: configured
      .filter((id) => PROVIDER_NAMES.has(id) || chosen?.includes(id))
      .map((id) => {
        const good = lastGood.get(id);
        return {
          id,
          name: good?.result?.providerName || PROVIDER_NAMES.get(id) || id,
          selected: chosen ? chosen.includes(id) : true,
          weekly: good ? hasWeeklyWindow(good.result) : null,
        };
      }),
  };
};

// ----- HTTP -----

/** What the section last measured of its frame; read through `/health` when checking sizes. */
let frame = null;
const FRAME_MAX = 1000;

const send = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
};

const expected = Buffer.from(`Bearer ${token}`);
const authorized = (header) => {
  const given = Buffer.from(typeof header === 'string' ? header : '');
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
};

const readBody = (req) => new Promise((resolve, reject) => {
  let body = '';
  req.setEncoding('utf8');
  req.on('data', (chunk) => {
    body += chunk;
    if (body.length > 64_000) req.destroy(new Error('too large'));
  });
  req.on('end', () => resolve(body));
  req.on('error', reject);
});

const failureCode = (error) => (error instanceof Failure ? error.code : 'failed');

const routes = {
  'GET /health': async () => [200, { ok: true, frame }],
  'GET /settings': async () => [200, settingsAnswer()],
  'GET /settings/wait': async (url) => {
    await waitForSettings(Number(url.searchParams.get('since')) || 0);
    return [200, settingsAnswer()];
  },
  'PUT /settings': async (url, req) => {
    let next;
    try {
      next = normalizeSettings(JSON.parse(await readBody(req)));
    } catch {
      return [400, { error: 'invalid-settings' }];
    }
    // One save after the other, so the file and the answer always agree.
    const saved = saving.then(async () => {
      await saveSettings(next);
      const providersChanged = JSON.stringify(next.providers) !== JSON.stringify(settings.providers);
      settings = next;
      settingsVersion = Math.max(settingsVersion + 1, Date.now());
      // The next reading must show the new choice, also within the refresh wait.
      if (providersChanged) cached = null;
      for (const waiter of [...settingsWaiters]) waiter();
    });
    saving = saved.catch(() => {});
    try {
      await saved;
    } catch {
      return [500, { error: 'save-failed' }];
    }
    return [200, settingsAnswer()];
  },
  'GET /providers': async () => {
    try {
      return [200, await providerChoices()];
    } catch (error) {
      return [502, { error: failureCode(error) }];
    }
  },
  'GET /forecast': async (url) => {
    const measured = url.searchParams.get('frame');
    if (measured && measured.length <= FRAME_MAX) {
      try {
        const parsed = JSON.parse(measured);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) frame = { ...parsed, at: Date.now() };
      } catch {
        // Only for checking; a reading never depends on it.
      }
    }
    try {
      return [200, await answer(url.searchParams.get('refresh') === '1')];
    } catch (error) {
      return [502, { error: failureCode(error) }];
    }
  },
};

const server = http.createServer(async (req, res) => {
  if (!authorized(req.headers.authorization)) {
    send(res, 401, { error: 'unauthorized' });
    return;
  }
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  const route = routes[`${req.method} ${url.pathname}`];
  if (!route) {
    send(res, 404, { error: 'not-found' });
    return;
  }
  try {
    await settingsLoaded;
    const [status, body] = await route(url, req);
    send(res, status, body);
  } catch {
    send(res, 500, { error: 'failed' });
  }
});

server.listen(port, '127.0.0.1');
