import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BASE_FONT_PX, barGeometry, hostRootPx, spacingScaleFor } from '../src/text-scale.js';

describe('hostRootPx', () => {
  it('takes the app\'s root from the body text OpenChamber passes', () => {
    // Body text is 0.875rem: 14px at 100%, 15.4px at 110%.
    assert.equal(hostRootPx('14px'), 16);
    assert.equal(hostRootPx('15.4px'), 17.6);
    assert.equal(hostRootPx('14.7px'), 16.8);
    assert.equal(hostRootPx(' 16.1px '), 18.4);
  });

  it('keeps the default without a usable value, as from OpenChamber before 2.7', () => {
    for (const value of [undefined, null, '', '1rem', '15.4', 'large', 42]) assert.equal(hostRootPx(value), BASE_FONT_PX);
  });

  it('keeps the default for a size the interface setting cannot have', () => {
    // The setting runs from 50% to 200%: body text from 7px to 28px.
    assert.equal(hostRootPx('7px'), 8);
    assert.equal(hostRootPx('28px'), 32);
    assert.equal(hostRootPx('6px'), BASE_FONT_PX);
    assert.equal(hostRootPx('40px'), BASE_FONT_PX);
  });
});

describe('spacingScaleFor', () => {
  it('finds no extra spacing at the default sizes', () => {
    // 300px panel, 0.75rem of spacing on each side at 16px.
    assert.equal(spacingScaleFor(276, 16), 1);
    // 110% text: 273.6px, which a frame shows as 274 or 273.
    assert.equal(spacingScaleFor(274, 17.6), 1);
    assert.equal(spacingScaleFor(273, 17.6), 1);
  });

  it('separates the spacing from the text size', () => {
    // 110% text and 150% spacing (factor √1.5) leave 300 - 1.5 × 17.6 × 1.2247 ≈ 267.67px.
    assert.equal(spacingScaleFor(267.67, 17.6), 1.225);
    // The same frame read as 100% text would need much more spacing.
    assert.equal(spacingScaleFor(267.67, 16), 1.347);
  });

  it('keeps the spacing at 1 for a width no setting explains', () => {
    assert.equal(spacingScaleFor(300, 16), 1);
    assert.equal(spacingScaleFor(200, 16), 1);
    assert.equal(spacingScaleFor(Number.NaN, 16), 1);
  });
});

describe('barGeometry', () => {
  it('draws bar, mark and day gap in whole device pixels', () => {
    // 4px at 110% would be 4.4px, which draws as 4 or 5 pixels depending on where the bar lands.
    assert.deepEqual(barGeometry({ barHeight: 4, rootPx: 17.6, spaceScale: 1 }), { bar: 4, mark: 11, markWidth: 2, markTop: -4, dayGap: 1 });
    assert.deepEqual(barGeometry({ barHeight: 4, rootPx: 16, spaceScale: 1 }), { bar: 4, mark: 10, markWidth: 2, markTop: -3, dayGap: 1 });
    // On a screen with two device pixels per CSS pixel, half pixels are whole ones.
    assert.deepEqual(barGeometry({ barHeight: 4, rootPx: 17.6, spaceScale: 1, dpr: 2 }), { bar: 4.5, mark: 11, markWidth: 2, markTop: -3.5, dayGap: 1 });
    assert.equal(barGeometry({ barHeight: 6, rootPx: 17.6, spaceScale: 1.225 }).bar, 8);
    // The gap grows with large text like everything else.
    assert.equal(barGeometry({ barHeight: 4, rootPx: 24, spaceScale: 1 }).dayGap, 2);
  });
});
