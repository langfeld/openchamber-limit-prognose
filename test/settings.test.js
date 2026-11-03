import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BAR_HEIGHTS, DEFAULT_SETTINGS, INTERVALS, normalizeSettings, TEXT_SIZES } from '../service/settings.js';

describe('normalizeSettings', () => {
  it('starts from the defaults: 100%, the Context meter\'s 4px, ten minutes, the Usage choice', () => {
    assert.deepEqual(normalizeSettings(null), { textSize: 100, barHeight: 4, interval: 10, providers: null });
    assert.deepEqual(normalizeSettings('nonsense'), normalizeSettings(undefined));
    assert.deepEqual(normalizeSettings([]), { ...DEFAULT_SETTINGS });
  });

  it('keeps allowed values and replaces the others with defaults', () => {
    assert.deepEqual(
      normalizeSettings({ textSize: 110, barHeight: 6, interval: 30, providers: ['claude'] }),
      { textSize: 110, barHeight: 6, interval: 30, providers: ['claude'] },
    );
    assert.deepEqual(
      normalizeSettings({ textSize: 108, barHeight: '4', interval: 1, providers: 'claude' }),
      { textSize: 100, barHeight: 4, interval: 10, providers: null },
    );
  });

  it('cleans the provider list', () => {
    assert.deepEqual(normalizeSettings({ providers: ['claude', 'claude', 'Codex', '../x', 'opencode-go', 7] }).providers, ['claude', 'opencode-go']);
    assert.deepEqual(normalizeSettings({ providers: [] }).providers, []);
  });

  it('offers what the pages can show', () => {
    // A header choice holds at most 16 options; the panel uses the same lists.
    assert.ok(TEXT_SIZES.length <= 16);
    for (const list of [TEXT_SIZES, BAR_HEIGHTS, INTERVALS]) assert.deepEqual([...list].sort((a, b) => a - b), list);
    assert.ok(TEXT_SIZES.includes(DEFAULT_SETTINGS.textSize));
    assert.ok(BAR_HEIGHTS.includes(DEFAULT_SETTINGS.barHeight));
    assert.ok(INTERVALS.includes(DEFAULT_SETTINGS.interval));
  });
});
