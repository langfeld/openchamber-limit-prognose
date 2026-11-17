// OpenChamber scales its interface with two settings: the text size
// ("Schriftgröße der Benutzeroberfläche") through the root font size, and the
// spacing ("Abstände") through `--padding-scale`, which every spacing token is
// multiplied with. The SDK sets the frame's own root to 14px, so the page sets
// both itself.
//
// The text size comes from the host: since OpenChamber 2.7 the ready context
// carries the app's body text in px (`theme.tokens.fontSize`), which is
// 0.875rem of the app's root on web and desktop, and every change to the
// setting sends a new snapshot. Older hosts pass none; the page then keeps the
// default size.
//
// The spacing is worked out from the frame's width: the Work Status panel is a
// fixed 300px wide, and between its edge and this frame sit the panel's padding
// (`p-2`) and the frame's margin (`mx-1`), 0.75rem of spacing on each side. At
// 100% of both the frame is 276px wide. The numbers are the layout of
// OpenChamber 2.6 and 2.7 (`WORK_STATUS_PANEL_WIDTH`, `WorkStatusPanel`,
// `WorkStatusExtensionSection`, `useHostTypography`).

const PANEL_WIDTH_PX = 300;
/** Panel padding and frame margin, both sides together, before the spacing scale. */
const INSET_REM = 1.5;
/** The app's root at 100%. */
export const BASE_FONT_PX = 16;
/** The app's body text in rem (`--text-markdown`), which the host passes in px. */
export const BODY_TEXT_REM = 0.875;
/** A frame comes in whole pixels, which moves the factor by up to this much. */
const DEFAULT_SPACING_LEEWAY = 0.03;

/**
 * The app's root in px from the body text the host passes ("15.4px" at 110%),
 * or the default without a usable value. The interface size runs from 50% to
 * 200%; a value outside it is not that setting.
 */
export const hostRootPx = (fontSize) => {
  const match = /^(\d+(?:\.\d+)?)px$/.exec(typeof fontSize === 'string' ? fontSize.trim() : '');
  if (!match) return BASE_FONT_PX;
  const rootPx = Math.round((Number(match[1]) / BODY_TEXT_REM) * 100) / 100;
  return rootPx >= BASE_FONT_PX * 0.5 && rootPx <= BASE_FONT_PX * 2 ? rootPx : BASE_FONT_PX;
};

/**
 * The spacing factor OpenChamber applies (the square root of the spacing
 * setting), from the frame's width and the app's root, or 1 when the width
 * fits no setting, which means another layout.
 */
export const spacingScaleFor = (frameWidth, rootPx) => {
  const scale = (PANEL_WIDTH_PX - frameWidth) / INSET_REM / rootPx;
  // The spacing setting runs from 50% to 200%: a factor from about 0.71 to 1.41.
  if (!Number.isFinite(scale) || scale < 0.65 || scale > 1.5) return 1;
  // That close to 1 it is the default setting, read off a rounded width.
  if (Math.abs(scale - 1) <= DEFAULT_SPACING_LEEWAY) return 1;
  return Math.round(scale * 1000) / 1000;
};

/**
 * The frame's width. A scrollbar, or the gutter OpenChamber reserves for one,
 * takes width from the document but not from the frame, so it is added back.
 */
export const measureFrameWidth = () => {
  const html = document.documentElement;
  return html.getBoundingClientRect().width + (window.innerWidth - html.clientWidth);
};

/**
 * Bar and mark in whole device pixels. A height like 4.4px draws as 4 or 5
 * pixels depending on where the bar lands, so two bars of the same size would
 * not look the same. `barHeight` is in px at 100% text size and spacing, like
 * the panel's own meter (`h-1`, 4px), and grows with both settings as it does.
 */
export const barGeometry = ({ barHeight, rootPx, spaceScale, dpr = 1 }) => {
  const factor = (rootPx / BASE_FONT_PX) * spaceScale;
  const snap = (px) => Math.max(1, Math.round(px * dpr)) / dpr;
  const bar = snap(barHeight * factor);
  // The mark stands 3px out above and below the bar.
  const mark = snap((barHeight + 6) * factor);
  return {
    bar,
    mark,
    markWidth: snap(2 * factor),
    markTop: -Math.round(((mark - bar) / 2) * dpr) / dpr,
    /** The day marks' gap, 1px at 100%. */
    dayGap: snap(factor),
  };
};
