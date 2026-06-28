// Single-origin engine entry for EXTERNAL consumers (e.g. the demo-lab storefront).
//
// tracewell-demo is the canonical source of the trace-analysis engine + view
// modules. The standalone app imports the local source directly; this barrel is
// the published surface other repos depend on (via the package `exports` map) so
// the engine has ONE origin and can no longer drift.
//
// Re-exports the pure-engine subset only — the modules with no repo-specific
// coupling. INTENTIONALLY EXCLUDED:
//   - store.ts        — carries a repo-specific data-fetch path (chrome).
//   - RunInspector.ts — imports store.ts (path-coupled).
//   - app.ts          — page wiring entry.
// Those stay per-repo. `export *` keeps the published surface complete as the
// engine grows, so new exports can't silently fall out of the single origin.
export * from './types.js';
export * from './format.js';
export * from './diagnose.js';
export * from './PromptDiff.js';
export * from './SyntheticBanner.js';
export * from './TraceRibbon.js';
export * from './TimelineView.js';
export * from './ToolCallTree.js';
