// The service against a stand-in for OpenChamber's local server, started the
// way OpenChamber starts it: port and token in the environment, nothing else
// except its data folder and the waits, shortened for the test.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const SERVICE = fileURLToPath(new URL('../service/main.js', import.meta.url));
const TOKEN = 'test-token';
const WEEK = 7 * 24 * 60 * 60 * 1000;
const READ_BUDGET_MS = 1500;
const REFRESH_MIN_MS = 300;
const SETTINGS_WAIT_MS = 400;
const DEFAULTS = { textSize: 100, barHeight: 4, interval: 10, providers: null };

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const freePort = () => new Promise((resolve, reject) => {
  const probe = net.createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const { port } = probe.address();
    probe.close(() => resolve(port));
  });
});

const hits = new Map();
/** What the stand-in answers; each test sets what it needs. */
let behavior;
const fakeOpenChamber = http.createServer(async (req, res) => {
  hits.set(req.url, (hits.get(req.url) ?? 0) + 1);
  const reply = (status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  const resetAt = Date.now() + WEEK / 2;
  const weekly = (usedPercent) => ({ usedPercent, windowSeconds: 604800, resetAt });
  if (req.url === '/api/quota/providers') return reply(200, { providers: behavior.configured });
  if (req.url === '/api/quota/claude') {
    if (behavior.claude === 'fail') return reply(200, { providerId: 'claude', providerName: 'Claude', ok: false, configured: true, error: 'Request failed (429)', usage: null });
    return reply(200, {
      providerId: 'claude', providerName: 'Claude', ok: true, configured: true, fetchedAt: Date.now(),
      usage: {
        windows: { '7d': weekly(30) },
        models: { Fable: { windows: { '7d': weekly(60) } }, Opus: { windows: { '7d': weekly(5) } } },
      },
    });
  }
  if (req.url === '/api/quota/codex') return reply(500, { error: 'boom' });
  if (req.url === '/api/quota/opencode-go') {
    await pause(READ_BUDGET_MS * 2);
    return reply(200, { providerId: 'opencode-go', providerName: 'OpenCode Go', ok: true, configured: true, usage: { windows: { weekly: weekly(10) } } });
  }
  if (req.url === '/api/quota/github-copilot-addon') return reply(200, { providerId: 'github-copilot-addon', ok: true, configured: true, usage: { windows: { '7d': weekly(1) } } });
  return reply(404, { error: 'not found' });
});

let home;
let dataDir;
let settingsFile;
let preferencesFile;
let openChamberPort;
let servicePort;
let child;

const writeJson = (file, value) => fs.writeFile(file, JSON.stringify(value));
const ask = (pathname, token = TOKEN, init = {}) => fetch(`http://127.0.0.1:${servicePort}${pathname}`, {
  ...init,
  headers: token ? { authorization: `Bearer ${token}` } : {},
});
const askJson = async (method, pathname, body) => {
  const response = await ask(pathname, TOKEN, { method, ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }) });
  return { status: response.status, body: await response.json() };
};
/** A refresh after the service's minimum wait between refreshes. */
const refresh = async () => {
  await pause(REFRESH_MIN_MS + 50);
  return askJson('GET', '/forecast?refresh=1');
};

before(async () => {
  home = await fs.mkdtemp(path.join(os.tmpdir(), 'limit-prognose-'));
  dataDir = path.join(home, 'daten');
  settingsFile = path.join(home, '.config', 'openchamber', 'settings.json');
  preferencesFile = path.join(home, '.config', 'openchamber', 'preferences.json');
  await fs.mkdir(path.dirname(settingsFile), { recursive: true });
  openChamberPort = await freePort();
  await new Promise((resolve) => fakeOpenChamber.listen(openChamberPort, '127.0.0.1', resolve));
  servicePort = await freePort();
  child = spawn(process.execPath, [SERVICE], {
    env: {
      PATH: process.env.PATH,
      HOME: home,
      OPENCHAMBER_SERVICE_PORT: String(servicePort),
      OPENCHAMBER_SERVICE_TOKEN: TOKEN,
      LIMIT_PROGNOSE_DATA_DIR: dataDir,
      LIMIT_PROGNOSE_READ_BUDGET_MS: String(READ_BUDGET_MS),
      LIMIT_PROGNOSE_REFRESH_MIN_MS: String(REFRESH_MIN_MS),
      LIMIT_PROGNOSE_SETTINGS_WAIT_MS: String(SETTINGS_WAIT_MS),
    },
    stdio: 'ignore',
  });
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      if ((await ask('/health')).ok) return;
    } catch {
      // Not listening yet.
    }
    await pause(100);
  }
  throw new Error('service did not start');
});

beforeEach(async () => {
  behavior = { configured: ['claude', 'codex', 'opencode-go'], claude: 'ok' };
  // 2.6.0 keeps the Usage choices in preferences.json; settings.json holds an older copy.
  await writeJson(settingsFile, {
    desktopLocalPort: openChamberPort,
    usageDropdownProviders: ['claude'],
    usageSelectedModels: { claude: ['Opus'] },
  });
  await writeJson(preferencesFile, {
    version: 1,
    fields: {
      usageDropdownProviders: { updatedAt: 1, value: ['claude', 'codex', 'github-copilot'] },
      usageSelectedModels: { updatedAt: 1, value: { claude: ['Fable'] } },
    },
  });
  await askJson('PUT', '/settings', DEFAULTS);
});

after(async () => {
  child?.kill();
  await new Promise((resolve) => fakeOpenChamber.close(resolve));
  await fs.rm(home, { recursive: true, force: true });
});

describe('forecast', () => {
  it('refuses requests without the token OpenChamber gave it', async () => {
    assert.equal((await ask('/forecast', null)).status, 401);
    assert.equal((await ask('/forecast', 'wrong')).status, 401);
    assert.equal((await ask('/settings', 'Bearer x')).status, 401);
  });

  it('answers with the weekly windows of the providers the Usage section shows', async () => {
    const { status, body } = await askJson('GET', '/forecast');
    assert.equal(status, 200);
    assert.deepEqual(body.providers.map((provider) => provider.id), ['claude', 'codex']);
    const [claude, codex] = body.providers;
    // The choices come from preferences.json: Fable, not Opus.
    assert.deepEqual(claude.windows.map((window) => [window.key, window.status]), [['window-7d', 'ok'], ['model-Fable-7d', 'over']]);
    assert.deepEqual(codex.error, { code: 'failed', detail: 'boom' });
    assert.equal(codex.name, 'Codex');
    // Configured but not shown in the Usage section: never read.
    assert.equal(hits.get('/api/quota/opencode-go'), undefined);
  });

  it('keeps an answer instead of reading the providers again', async () => {
    const before = hits.get('/api/quota/claude');
    assert.equal((await ask('/forecast')).status, 200);
    assert.equal(hits.get('/api/quota/claude'), before);
  });

  it('reads again on refresh, once for requests that arrive together', async () => {
    await pause(REFRESH_MIN_MS + 50);
    const before = hits.get('/api/quota/claude');
    const answers = await Promise.all([ask('/forecast?refresh=1'), ask('/forecast?refresh=1')]);
    assert.deepEqual(answers.map((answer) => answer.status), [200, 200]);
    assert.equal(hits.get('/api/quota/claude'), before + 1);
  });

  it('answers a refresh right after a read from that read', async () => {
    await refresh();
    const before = hits.get('/api/quota/claude');
    assert.equal((await ask('/forecast?refresh=1')).status, 200);
    assert.equal(hits.get('/api/quota/claude'), before);
  });

  it('shows the last good windows when a provider fails, marked stale', async () => {
    const good = await refresh();
    behavior.claude = 'fail';
    const { status, body } = await refresh();
    assert.equal(status, 200);
    const claude = body.providers.find((provider) => provider.id === 'claude');
    assert.deepEqual(claude.stale, { code: 'provider', detail: 'Request failed (429)' });
    assert.equal(claude.sampledAt, good.body.providers[0].sampledAt);
    assert.deepEqual(claude.windows.map((window) => window.key), ['window-7d', 'model-Fable-7d']);
  });

  it('reports a provider that misses the time budget on its own', async () => {
    await writeJson(preferencesFile, { version: 1, fields: { usageDropdownProviders: { value: ['claude', 'opencode-go'] } } });
    const started = Date.now();
    const { status, body } = await refresh();
    assert.equal(status, 200);
    assert.ok(Date.now() - started < READ_BUDGET_MS + 1000, 'answers within the budget');
    assert.deepEqual(body.providers.map((provider) => [provider.id, provider.error?.code ?? null]), [['claude', null], ['opencode-go', 'timeout']]);
  });

  it('reads only the providers the Usage section knows when no choice is saved', async () => {
    behavior.configured = ['claude', 'github-copilot-addon'];
    await writeJson(preferencesFile, { version: 1, fields: {} });
    await writeJson(settingsFile, { desktopLocalPort: openChamberPort });
    const { body } = await refresh();
    assert.deepEqual(body.providers.map((provider) => provider.id), ['claude']);
    assert.equal(hits.get('/api/quota/github-copilot-addon'), undefined);
    // Every model shows without a saved pick.
    assert.equal(body.providers[0].windows.length, 3);
  });

  it('names the cause when the reading fails as a whole', async () => {
    await writeJson(settingsFile, { usageDropdownProviders: ['claude'] });
    let answer = await refresh();
    assert.deepEqual([answer.status, answer.body], [502, { error: 'port' }]);

    await writeJson(settingsFile, { desktopLocalPort: await freePort() });
    answer = await refresh();
    assert.deepEqual([answer.status, answer.body], [502, { error: 'unreachable' }]);

    await fs.rm(settingsFile);
    answer = await refresh();
    assert.deepEqual([answer.status, answer.body], [502, { error: 'settings' }]);
  });

  it('notes each window once an hour', async () => {
    await refresh();
    const lines = (await fs.readFile(path.join(dataDir, 'verlauf.jsonl'), 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
    const claude = lines.filter((line) => line.provider === 'claude').map((line) => line.window);
    assert.ok(claude.includes('window-7d') && claude.includes('model-Fable-7d'));
    // Several readings so far, one line per window.
    assert.equal(new Set(claude).size, claude.length);
    assert.deepEqual(Object.keys(lines[0]).sort(), ['elapsed', 'projected', 'provider', 'resetAt', 'status', 't', 'used', 'window']);
    await refresh();
    const again = (await fs.readFile(path.join(dataDir, 'verlauf.jsonl'), 'utf8')).trim().split('\n');
    assert.equal(again.length, lines.length);
  });

  it('does not note a window twice after a restart, and counts settings on', async () => {
    await refresh();
    const before = (await fs.readFile(path.join(dataDir, 'verlauf.jsonl'), 'utf8')).trim().split('\n').length;
    const { body: { version: oldVersion } } = await askJson('GET', '/settings');
    // A second service on the same data folder stands in for the restarted one.
    const port = await freePort();
    const restarted = spawn(process.execPath, [SERVICE], {
      env: { PATH: process.env.PATH, HOME: home, OPENCHAMBER_SERVICE_PORT: String(port), OPENCHAMBER_SERVICE_TOKEN: TOKEN, LIMIT_PROGNOSE_DATA_DIR: dataDir },
      stdio: 'ignore',
    });
    try {
      let answered = false;
      for (let attempt = 0; attempt < 50 && !answered; attempt++) {
        try {
          const response = await fetch(`http://127.0.0.1:${port}/forecast`, { headers: { authorization: `Bearer ${TOKEN}` } });
          answered = response.ok;
        } catch {
          await pause(100);
        }
      }
      assert.ok(answered, 'the second service answered');
      await pause(100);
      const after = (await fs.readFile(path.join(dataDir, 'verlauf.jsonl'), 'utf8')).trim().split('\n').length;
      assert.equal(after, before);
      // A page that knew the old service must see the new one as newer.
      const settings = await fetch(`http://127.0.0.1:${port}/settings`, { headers: { authorization: `Bearer ${TOKEN}` } });
      const { version, settings: kept } = await settings.json();
      assert.ok(version > oldVersion);
      assert.deepEqual(kept, DEFAULTS);
    } finally {
      restarted.kill();
    }
  });

  it('remembers the frame the section measured, for checking the sizes', async () => {
    await pause(REFRESH_MIN_MS + 50);
    const measured = { width: 274, inner: 274, client: 274, dpr: 1, textSize: 110, spaceScale: 1, bar: 4 };
    await ask(`/forecast?frame=${encodeURIComponent(JSON.stringify(measured))}`);
    const health = await (await ask('/health')).json();
    assert.equal(health.ok, true);
    const { at, ...frame } = health.frame;
    assert.deepEqual(frame, measured);
    assert.equal(typeof at, 'number');
    // Anything else is ignored, and the reading still answers.
    assert.equal((await ask('/forecast?frame=%7Bbroken')).status, 200);
  });
});

describe('settings', () => {
  it('keeps settings, cleans them, and saves them to its data folder', async () => {
    const { body: current } = await askJson('GET', '/settings');
    assert.deepEqual(current.settings, DEFAULTS);
    const { status, body } = await askJson('PUT', '/settings', { ...DEFAULTS, textSize: 110, barHeight: 999 });
    assert.equal(status, 200);
    assert.ok(body.version > current.version);
    assert.deepEqual(body.settings, { ...DEFAULTS, textSize: 110 });
    const saved = JSON.parse(await fs.readFile(path.join(dataDir, 'einstellungen.json'), 'utf8'));
    assert.deepEqual(saved, { ...DEFAULTS, textSize: 110 });
    assert.equal((await askJson('PUT', '/settings', '{ not json')).status, 400);
  });

  it('tells a waiting page about a change at once, and otherwise after the wait', async () => {
    const { body: current } = await askJson('GET', '/settings');
    const waiting = askJson('GET', `/settings/wait?since=${current.version}`);
    await pause(50);
    await askJson('PUT', '/settings', { ...DEFAULTS, interval: 30 });
    const told = await waiting;
    assert.ok(told.body.version > current.version);
    assert.equal(told.body.settings.interval, 30);

    const started = Date.now();
    const quiet = await askJson('GET', `/settings/wait?since=${told.body.version}`);
    assert.equal(quiet.body.version, told.body.version);
    assert.ok(Date.now() - started >= SETTINGS_WAIT_MS - 50);
  });

  it('shows the providers its settings choose, and reads at once when the choice changes', async () => {
    await refresh();
    await askJson('PUT', '/settings', { ...DEFAULTS, providers: ['codex'] });
    const before = hits.get('/api/quota/claude');
    // No refresh and within the cache time, still a new reading.
    const { body } = await askJson('GET', '/forecast');
    assert.deepEqual(body.providers.map((provider) => provider.id), ['codex']);
    assert.equal(hits.get('/api/quota/claude'), before);
  });

  it('lists the providers for the settings page', async () => {
    await refresh();
    const { status, body } = await askJson('GET', '/providers');
    assert.equal(status, 200);
    assert.equal(body.following, true);
    assert.deepEqual(body.providers, [
      { id: 'claude', name: 'Claude', selected: true, weekly: true },
      { id: 'codex', name: 'Codex', selected: true, weekly: null },
      { id: 'opencode-go', name: 'OpenCode Go', selected: false, weekly: null },
    ]);
    await askJson('PUT', '/settings', { ...DEFAULTS, providers: ['opencode-go'] });
    const chosen = await askJson('GET', '/providers');
    assert.equal(chosen.body.following, false);
    assert.deepEqual(chosen.body.providers.map((provider) => [provider.id, provider.selected]), [['claude', false], ['codex', false], ['opencode-go', true]]);
  });
});
