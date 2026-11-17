import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DAY_MS, dayFractions, dayMaskImage, dayProgress } from '../src/day-marks.js';

const HOUR = 60 * 60 * 1000;
const WEEK = 7 * DAY_MS;

describe('dayFractions', () => {
  it('ends a day at each seventh of a week', () => {
    const fractions = dayFractions(WEEK);
    assert.equal(fractions.length, 6);
    fractions.forEach((fraction, index) => assert.ok(Math.abs(fraction - (index + 1) / 7) < 1e-12));
  });

  it('counts days from the start of a window reported a little shorter or longer', () => {
    const short = dayFractions(WEEK - HOUR);
    assert.equal(short.length, 6);
    assert.equal(short[5], (6 * DAY_MS) / (WEEK - HOUR));
    // No sliver of a gap within the last hour of a longer week.
    assert.equal(dayFractions(WEEK + HOUR).length, 6);
  });

  it('takes a week when the length is unknown', () => {
    for (const length of [undefined, null, Number.NaN, 0]) assert.deepEqual(dayFractions(length), dayFractions(WEEK));
  });
});

describe('dayMaskImage', () => {
  it('gives each gap a layer of its own, opaque only in the gap, over one opaque layer', () => {
    assert.equal(
      dayMaskImage([0.5]),
      'linear-gradient(to right, transparent calc(50.0000% - var(--lp-day-gap, 1px) / 2), '
        + '#000 0 calc(50.0000% + var(--lp-day-gap, 1px) / 2), transparent 0), linear-gradient(#000 0 0)',
    );
  });

  it('has nothing to cut without days', () => {
    assert.equal(dayMaskImage([]), null);
  });

  it('cuts six gaps into a week, with few stops per layer', () => {
    const mask = dayMaskImage(dayFractions(WEEK));
    assert.equal(mask.match(/linear-gradient\(/g).length, 7);
    assert.ok(mask.endsWith(', linear-gradient(#000 0 0)'));
    // Three colours, four stops a layer: Chromium draws up to eight intervals
    // exactly, more through a coarse texture.
    for (const layer of mask.split('linear-gradient(to right, ').slice(1)) {
      assert.equal(layer.match(/transparent/g).length, 2);
      assert.equal(layer.match(/#000/g).length, layer.includes('linear-gradient(#000 0 0)') ? 2 : 1);
    }
  });
});

describe('dayProgress', () => {
  it('names the running day and the use in days of budget', () => {
    // A fifth of the limit in the first day: more than a day's budget.
    assert.deepEqual(dayProgress({ usedPercent: 20, elapsedPercent: 10, windowMs: WEEK }), { day: 1, days: 7, budgetDays: 1.4 });
    assert.deepEqual(dayProgress({ usedPercent: 50, elapsedPercent: 50, windowMs: WEEK }), { day: 4, days: 7, budgetDays: 3.5 });
  });

  it('takes a week when the length is missing', () => {
    assert.equal(dayProgress({ usedPercent: 0, elapsedPercent: 99 }).day, 7);
  });

  it('needs a share and a time to count from', () => {
    assert.equal(dayProgress({ usedPercent: null, elapsedPercent: 10 }), null);
    assert.equal(dayProgress({ usedPercent: 10, elapsedPercent: null }), null);
  });
});
