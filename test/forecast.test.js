import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildForecast, forecastWindow, MIN_ELAPSED_MS, WEEK_MS, weeklyWindowLength } from '../service/forecast.js';

const HOUR = 60 * 60 * 1000;
const now = Date.UTC(2026, 10, 5, 11, 36);
/** A window whose reset lies `elapsedHours` after the week began. */
const weekly = (usedPercent, elapsedHours) => ({ usedPercent, windowSeconds: 604800, resetAt: now + WEEK_MS - elapsedHours * HOUR });

describe('weeklyWindowLength', () => {
  it('takes the duration when there is one, with an hour of leeway', () => {
    assert.equal(weeklyWindowLength('7d', { windowSeconds: 604800 }), WEEK_MS);
    assert.equal(weeklyWindowLength('weekly', { windowSeconds: 604799 }), WEEK_MS - 1000);
    assert.equal(weeklyWindowLength('weekly', { windowSeconds: 604800 + 3600 }), WEEK_MS + HOUR);
    assert.equal(weeklyWindowLength('weekly', { windowSeconds: 604800 - 3601 }), null);
    assert.equal(weeklyWindowLength('5h', { windowSeconds: 18000 }), null);
    assert.equal(weeklyWindowLength('weekly', { windowSeconds: 18000 }), null);
  });

  it('falls back to the label without a duration, as OpenCode Go reports it', () => {
    assert.equal(weeklyWindowLength('weekly', { windowSeconds: null }), WEEK_MS);
    assert.equal(weeklyWindowLength('7d', {}), WEEK_MS);
    assert.equal(weeklyWindowLength('monthly', { windowSeconds: null }), null);
    assert.equal(weeklyWindowLength('credits_balance', {}), null);
  });
});

describe('forecastWindow', () => {
  it('projects the average pace since the reset to the next reset', () => {
    const result = forecastWindow(weekly(25, 84), now);
    assert.equal(result.status, 'ok');
    assert.equal(result.elapsedPercent, 50);
    assert.equal(result.projectedPercent, 50);
    assert.equal(result.exhaustAt, null);
  });

  it('calls a projection from 85% tight', () => {
    assert.equal(forecastWindow(weekly(42.5, 84), now).status, 'tight');
    assert.equal(forecastWindow(weekly(42, 84), now).status, 'ok');
    assert.equal(forecastWindow(weekly(50, 84), now).status, 'tight');
  });

  it('decides on the whole percent it shows', () => {
    // 100.4% shows as 100%: tight, not running out.
    assert.equal(forecastWindow(weekly(50.2, 84), now).status, 'tight');
    assert.equal(forecastWindow(weekly(50.3, 84), now).status, 'over');
    // 84.6% shows as 85%.
    assert.equal(forecastWindow(weekly(42.3, 84), now).status, 'tight');
  });

  it('says when the limit runs out ahead of the reset', () => {
    const result = forecastWindow(weekly(60, 84), now);
    assert.equal(result.status, 'over');
    assert.equal(result.projectedPercent, 120);
    // 60% in 84 hours leaves 40% for 56 hours.
    assert.equal(result.exhaustAt, now + 56 * HOUR);
    assert.ok(result.exhaustAt < result.resetAt);
  });

  it('counts with the length the provider reports', () => {
    const window = { usedPercent: 50, windowSeconds: 604800 - 3600, resetAt: now + (WEEK_MS - HOUR) / 2 };
    const result = forecastWindow(window, now, WEEK_MS - HOUR);
    assert.equal(result.elapsedPercent, 50);
    assert.equal(result.projectedPercent, 100);
  });

  it('gives no projection during the first day', () => {
    const result = forecastWindow(weekly(10, 6), now);
    assert.equal(result.status, 'early');
    assert.equal(result.projectedPercent, null);
    assert.equal(result.forecastFrom, now + 18 * HOUR);
    assert.equal(result.forecastFrom, result.resetAt - WEEK_MS + MIN_ELAPSED_MS);
  });

  it('projects from exactly one day on', () => {
    assert.equal(forecastWindow(weekly(1, 24), now).status, 'ok');
    assert.equal(forecastWindow(weekly(1, 24), now).projectedPercent, 7);
  });

  it('reports a used-up limit as exhausted, also early or without a reset time', () => {
    assert.equal(forecastWindow(weekly(100, 120), now).status, 'exhausted');
    assert.equal(forecastWindow(weekly(100, 3), now).status, 'exhausted');
    const noReset = forecastWindow({ usedPercent: 100, resetAt: null }, now);
    assert.equal(noReset.status, 'exhausted');
    assert.equal(noReset.elapsedPercent, null);
  });

  it('projects nothing from no use', () => {
    const result = forecastWindow(weekly(0, 100), now);
    assert.equal(result.status, 'ok');
    assert.equal(result.projectedPercent, 0);
  });

  it('marks a reading from before its reset', () => {
    assert.equal(forecastWindow({ usedPercent: 40, resetAt: now - HOUR }, now).status, 'reset');
    assert.equal(forecastWindow({ usedPercent: 100, resetAt: now - HOUR }, now).status, 'reset');
  });

  it('cannot forecast without a share or a reset time', () => {
    assert.equal(forecastWindow({ usedPercent: null, resetAt: now + HOUR }, now).status, 'unknown');
    assert.equal(forecastWindow({ usedPercent: 40, resetAt: null }, now).status, 'unknown');
  });
});

describe('buildForecast', () => {
  const claude = {
    providerId: 'claude',
    providerName: 'Claude',
    ok: true,
    configured: true,
    usage: {
      windows: { '5h': { usedPercent: 30, windowSeconds: 18000, resetAt: now + HOUR }, '7d': weekly(25, 84) },
      models: {
        Fable: { windows: { '7d': weekly(60, 84) } },
        Opus: { windows: { '7d': weekly(10, 84) } },
      },
    },
  };
  const fresh = (result) => ({ id: result.providerId, name: result.providerName, result, sampledAt: now, failure: null });

  it('keeps only weekly windows and the models the user picked', () => {
    const { providers, fetchedAt } = buildForecast({ readings: [fresh(claude)], selectedModels: { claude: ['Fable'] }, now });
    assert.equal(fetchedAt, now);
    assert.deepEqual(providers.map((provider) => provider.id), ['claude']);
    assert.deepEqual(providers[0].windows.map((window) => window.key), ['window-7d', 'model-Fable-7d']);
    assert.equal(providers[0].windows[1].model, 'Fable');
    assert.equal(providers[0].windows[1].status, 'over');
    assert.equal(providers[0].stale, null);
    assert.equal(providers[0].sampledAt, now);
  });

  it('shows every model when none is picked', () => {
    const { providers } = buildForecast({ readings: [fresh(claude)], now });
    assert.deepEqual(providers[0].windows.map((window) => window.key), ['window-7d', 'model-Fable-7d', 'model-Opus-7d']);
  });

  it('leaves out providers without a weekly window, also when their latest read failed', () => {
    const copilot = { providerId: 'github-copilot', providerName: 'GitHub Copilot', ok: true, configured: true, usage: { windows: { monthly: { usedPercent: 5, windowSeconds: null, resetAt: now + HOUR } } } };
    const failing = { ...fresh(copilot), failure: { code: 'timeout', detail: null } };
    const { providers } = buildForecast({ readings: [fresh(copilot), failing, fresh(claude)], now });
    assert.deepEqual(providers.map((provider) => provider.id), ['claude']);
  });

  it('keeps the windows of a failed read from the last good one, projected as of then', () => {
    const earlier = now - 2 * HOUR;
    const reading = { id: 'claude', name: 'Claude', result: claude, sampledAt: earlier, failure: { code: 'timeout', detail: null } };
    const { providers } = buildForecast({ readings: [reading], selectedModels: { claude: ['Fable'] }, now });
    assert.deepEqual(providers[0].stale, { code: 'timeout', detail: null });
    assert.equal(providers[0].sampledAt, earlier);
    assert.equal(providers[0].windows[0].elapsedPercent, ((84 - 2) / 168) * 100);
  });

  it('keeps the error of a provider that was never read', () => {
    const never = { id: 'codex', name: 'Codex', result: null, sampledAt: null, failure: { code: 'provider', detail: 'Request failed (429)' } };
    const { providers } = buildForecast({ readings: [fresh(claude), never], now });
    assert.deepEqual(providers.map((provider) => [provider.id, provider.name, provider.error]), [
      ['claude', 'Claude', null],
      ['codex', 'Codex', { code: 'provider', detail: 'Request failed (429)' }],
    ]);
  });
});
