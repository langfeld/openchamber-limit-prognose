// Sizes and colours of the Work Status panel's rows (13px rows, 11px meta, the
// Context meter's 4px bar by default), so the sections read as one vocabulary.
// As in the app, text sizes are in rem and follow the root font size, and
// spacing is in rem times the spacing factor (`--lp-space`, OpenChamber's
// `--padding-scale`). Bar and mark come in whole device pixels (`--lp-bar-h`
// and friends). The page sets all of them (`text-scale.js`). Colours are the
// host theme's, set on the root by `applyHostReady`. The frame already sits one
// step in from the panel's edge, like the app's rows, so the content takes no
// side padding.

const space = (rem) => `calc(${rem}rem * var(--lp-space, 1))`;

export const STYLE = `
:root { color-scheme: light dark; }
/* OpenChamber reserves a scrollbar gutter in every frame. Without it the rows
   end where the panel's own rows end; a section taller than its frame still
   scrolls. Doubled to outrank the host's \`:root\` rule. */
:root:root { scrollbar-gutter: auto; }
html, body { margin: 0; padding: 0; background: transparent; }
body {
  font-family: var(--oc-font, system-ui, sans-serif);
  font-size: 0.8125rem;
  line-height: 1.3;
  color: var(--oc-muted, GrayText);
  -webkit-font-smoothing: antialiased;
}
.lp { padding-bottom: ${space(0.125)}; }
.lp-provider { display: flex; align-items: center; gap: ${space(0.5)}; height: ${space(1.75)}; }
.lp-logo { display: inline-flex; flex: none; width: ${space(0.875)}; height: ${space(0.875)}; color: var(--oc-fg, CanvasText); }
.lp-logo svg { width: 100%; height: 100%; }
.lp-provider-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; color: var(--oc-fg, CanvasText); }
.lp-window { padding: ${space(0.125)} 0 ${space(0.5625)}; }
.lp-row { display: flex; align-items: baseline; gap: ${space(0.5)}; }
.lp-label { display: flex; flex: 1; min-width: 0; align-items: baseline; gap: ${space(0.375)}; }
.lp-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lp-reset { flex: none; font-size: 0.6875rem; white-space: nowrap; }
.lp-value { flex: none; font-variant-numeric: tabular-nums; }
.lp-bar { position: relative; height: var(--lp-bar-h, 4px); margin-top: ${space(0.375)}; border-radius: 999px; background: var(--oc-border, rgb(128 128 128 / 0.25)); }
.lp-forecast, .lp-used { position: absolute; top: 0; bottom: 0; inset-inline-start: 0; border-radius: 999px; }
.lp-forecast { background: color-mix(in srgb, var(--lp-tone) 35%, transparent); }
.lp-used { background: var(--lp-tone); }
.lp-mark { position: absolute; top: var(--lp-mark-top, -3px); width: var(--lp-mark-w, 2px); height: var(--lp-mark-h, 10px); margin-inline-start: calc(var(--lp-mark-w, 2px) / -2); border-radius: 1px; background: var(--oc-fg, CanvasText); opacity: 0.55; }
.lp-caption { margin-top: ${space(0.3125)}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.6875rem; }
.lp-note { margin: 0; padding: ${space(0.25)} 0 ${space(0.375)}; font-size: 0.75rem; }
.lp-provider + .lp-note { padding-top: 0; }
.lp-foot { margin: 0; font-size: 0.6875rem; }
.lp-refresh { display: inline-flex; vertical-align: middle; margin-inline-start: ${space(0.25)}; padding: 0 ${space(0.25)}; border: 0; background: none; color: inherit; font: inherit; cursor: pointer; }
.lp-refresh svg { width: 0.875rem; height: 0.875rem; }
.lp-refresh:hover { color: var(--oc-fg, CanvasText); }
.lp-refresh:disabled { opacity: 0.5; cursor: default; }
.lp-toned { color: var(--lp-text); }
[data-tone="success"] { --lp-tone: var(--oc-success, #3a3); --lp-text: var(--oc-success-text, #3a3); }
[data-tone="warning"] { --lp-tone: var(--oc-warning, #d80); --lp-text: var(--oc-warning-text, #d80); }
[data-tone="error"] { --lp-tone: var(--oc-error, #d33); --lp-text: var(--oc-error-text, #d33); }
[data-tone="neutral"] { --lp-tone: var(--oc-muted, GrayText); --lp-text: inherit; }
`;
