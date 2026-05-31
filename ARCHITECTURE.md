# Tracewell Architecture

## Stack

- **Astro 5** — static site generator, outputs fully static HTML/JS/CSS
- **TypeScript** — vanilla TS, no React/Vue/Svelte; keeps the bundle under 80 KB
- **diff-match-patch** — 4 KB gzipped; character-level diff for the prompt comparison
- **No backend, no API keys, no environment variables**

## Why vanilla TS instead of a framework

The UI is a single-page instrument panel with dense, monospaced data. A framework would add ~40 KB and indirection for no benefit. The component boundary is the module, not the framework component.

## Data model

```typescript
interface AgentRun {
  id: string;                    // "run_8f2a1c"
  agent_id: AgentId;
  started_at: string;            // ISO 8601
  ended_at: string;
  status: "success" | "failed" | "degraded";
  failure_mode: FailureMode | null;
  total_tokens_in: number;
  total_tokens_out: number;
  total_latency_ms: number;
  steps: AgentStep[];
}

interface AgentStep {
  id: string;
  parent_id: string | null;      // for nested tool calls
  name: string;
  tool: string | null;           // null for model steps
  status: "success" | "failed" | "skipped";
  tokens_in: number;
  tokens_out: number;
  latency_ms: number;
  prompt_snapshot: string;
  output_snapshot: string;
  error: string | null;
  model: string | null;
  model_params: { temperature: number; max_tokens: number } | null;
}
```

The 50-run dataset (`public/data/runs.json`) tells a structured incident narrative:
- **Mon** — baseline success (`run_7c4e9b`, compliance_policy v3, 9,824 tokens)
- **Tue** — regression ships (v3 → v4, +4,390 tokens, but short contracts hide it)
- **Wed 03:14** — detonation (`run_8f2a1c`, 14,214 tokens, `context_overflow`)
- **Wed–Thu** — cascade (6 identical failures, all rooted in v4)

Token counts are derived from actual prompt word counts ÷ 0.75, not invented.

## Key design decisions

### 1. Deterministic synthetic replay
The replay tab does not call a live model. It looks up a pre-recorded response fixture (`public/data/runs-replay-fixture.json`) by agent + step key. This keeps the demo zero-cost and zero-latency while preserving the interaction affordance.

### 2. Canonical diff for the signature moment
The v3→v4 diff is the demo's climax. Instead of computing it on every open, `PromptDiff.ts` exports `buildCanonicalDiff()` — a pre-computed diff with the exact annotation: "+4,390 tokens added at step inject_context. Source: compliance_policy_v3 → v4 on 2026-05-27. This is the regression." This guarantees the moment always lands in under 50 ms.

### 3. Trace ribbon as the primary spatial metaphor
The ribbon plots each step as a tick whose width is latency and whose height is token cost. A draggable playhead scrubs the run. This borrows from video editing UI applied to agent traces — a single, memorable interaction.

### 4. Failure-mode clustering
Runs are grouped by `(agent_id, failure_mode, step_name)` into clusters. Clicking a cluster filters the timeline. This surfaces root-cause thinking: six failures, one signature, one config change.

## File map

| File | Responsibility |
|---|---|
| `src/pages/index.astro` | Shell markup: nav, banner, timeline, inspector, about panel |
| `src/components/app.ts` | Bootstrap, timeline rendering, cluster filtering, event wiring |
| `src/components/store.ts` | Data loading singleton, run lookup, "last success" finder |
| `src/components/RunInspector.ts` | Inspector lifecycle: open, close, step selection, tab wiring |
| `src/components/TraceRibbon.ts` | Horizontal time-axis ticks + draggable playhead |
| `src/components/ToolCallTree.ts` | Recursive tree rendering, expand/collapse, node selection |
| `src/components/PromptDiff.ts` | diff-match-patch wrapper + canonical v3→v4 diff |
| `src/components/format.ts` | Token, latency, timestamp formatters |
| `src/components/types.ts` | Shared TypeScript interfaces |
| `src/styles/tracewell.css` | All styles — no CSS-in-JS, no utility framework |

## What was cut for scope

- **Real trace ingestion** — no SDK, no HTTP receiver, no OTLP
- **Multi-turn conversation diff** — system-prompt snapshots only
- **Persistent sessions** — no localStorage, no DB
- **Mobile optimization** — readable on mobile, but the dense instrument panel is desktop-first

## How to extend to production

A production version would need:
1. An ingestion endpoint (OpenTelemetry-compatible or custom SDK) to stream real agent runs
2. A time-series store (ClickHouse, TimescaleDB) for run history and aggregation
3. A real diff engine (not pre-computed) for arbitrary prompt comparisons
4. Alerting rules on failure-mode clusters ("6 context_overflows in 1 hour → page")
5. Auth and multi-tenant isolation

## Performance budget

- JS bundle: ~38 KB gzipped (Astro + diff-match-patch + app code)
- Data: ~100 KB (50 runs)
- First paint: < 1 s on desktop 3G
- Lighthouse performance target: ≥ 85
