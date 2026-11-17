import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BAR_HEIGHTS, DEFAULT_SETTINGS, INTERVALS, normalizeSettings } from '../service/settings.js';

describe('normalizeSettings', () => {
  it('starts from the defaults: the Context meter\'s 4px, ten minutes, day marks, the Usage choice', () => {
    assert.deepEqual(normalizeSettings(null), { barHeight: 4, interval: 10, dayMarks: true, providers: null });
    assert.deepEqual(normalizeSettings('nonsense'), normalizeSettings(undefined));
    assert.deepEqual(normalizeSettings([]), { ...DEFAULT_SETTINGS });
  });

  it('keeps allowed values and replaces the others with defaults', () => {
    assert.deepEqual(
      normalizeSettings({ barHeight: 6, interval: 30, dayMarks: false, providers: ['claude'] }),
      { barHeight: 6, interval: 30, dayMarks: false, providers: ['claude'] },
    );
    assert.deepEqual(
      normalizeSettings({ barHeight: '4', interval: 1, dayMarks: 'off', providers: 'claude' }),
      { barHeight: 4, interval: 10, dayMarks: true, providers: null },
    );
  });

  it('drops the text size of version 1.1, which now follows OpenChamber', () => {
    assert.deepEqual(
      normalizeSettings({ textSize: 110, barHeight: 4, interval: 10, dayMarks: true, providers: null }),
      { barHeight: 4, interval: 10, dayMarks: true, providers: null },
    );
  });

  it('cleans the provider list', () => {
    assert.deepEqual(normalizeSettings({ providers: ['claude', 'claude', 'Codex', '../x', 'opencode-go', 7] }).providers, ['claude', 'opencode-go']);
    assert.deepEqual(normalizeSettings({ providers: [] }).providers, []);
  });

  it('offers what the panel can show', () => {
    for (const list of [BAR_HEIGHTS, INTERVALS]) assert.deepEqual([...list].sort((a, b) => a - b), list);
    assert.ok(BAR_HEIGHTS.includes(DEFAULT_SETTINGS.barHeight));
    assert.ok(INTERVALS.includes(DEFAULT_SETTINGS.interval));
  });
});
