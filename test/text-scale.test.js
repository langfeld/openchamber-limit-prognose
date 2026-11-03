import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { barGeometry, rootFontSize, spacingScaleFor } from '../src/text-scale.js';

describe('spacingScaleFor', () => {
  it('finds no extra spacing at the default sizes', () => {
    // 300px panel, 0.75rem of spacing on each side at 16px.
    assert.equal(spacingScaleFor(276, 100), 1);
    // 110% text: 273.6px, which a frame shows as 274 or 273.
    assert.equal(spacingScaleFor(274, 110), 1);
    assert.equal(spacingScaleFor(273, 110), 1);
  });

  it('separates the spacing from the text size the user chose', () => {
    // 110% text and 150% spacing (factor √1.5) leave 300 - 1.5 × 17.6 × 1.2247 ≈ 267.67px.
    assert.equal(spacingScaleFor(267.67, 110), 1.225);
    // The same frame read as 100% text would need much more spacing.
    assert.equal(spacingScaleFor(267.67, 100), 1.347);
  });

  it('keeps the spacing at 1 for a width no setting explains', () => {
    assert.equal(spacingScaleFor(300, 100), 1);
    assert.equal(spacingScaleFor(200, 100), 1);
    assert.equal(spacingScaleFor(Number.NaN, 100), 1);
  });
});

describe('sizes', () => {
  it('sets the root like OpenChamber does', () => {
    assert.equal(rootFontSize(100), '16px');
    assert.equal(rootFontSize(110), '17.6px');
  });

  it('draws bar and mark in whole device pixels', () => {
    // 4px at 110% would be 4.4px, which draws as 4 or 5 pixels depending on where the bar lands.
    assert.deepEqual(barGeometry({ barHeight: 4, textSize: 110, spaceScale: 1 }), { bar: 4, mark: 11, markWidth: 2, markTop: -4 });
    assert.deepEqual(barGeometry({ barHeight: 4, textSize: 100, spaceScale: 1 }), { bar: 4, mark: 10, markWidth: 2, markTop: -3 });
    // On a screen with two device pixels per CSS pixel, half pixels are whole ones.
    assert.deepEqual(barGeometry({ barHeight: 4, textSize: 110, spaceScale: 1, dpr: 2 }), { bar: 4.5, mark: 11, markWidth: 2, markTop: -3.5 });
    assert.equal(barGeometry({ barHeight: 6, textSize: 110, spaceScale: 1.225 }).bar, 8);
  });
});
