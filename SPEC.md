# Tracewell

> **The flight recorder for AI agents.** When your agent crashes at 3 AM, Tracewell shows you the black box: every tool call, every token, every prompt — and the one diff that broke it.

**Hook (the line that gets screenshotted):** *"Your agent didn't error. It overflowed. And here's the exact 4,400-token block someone added on Tuesday that did it."*

**Microcopy voice (terse, forensic, never cute):**
- Empty filter state: `No runs match. The agents behaved.`
- Replay label: `Replay is synthetic. Edits hit a recorded fixture, not a live model.`
- Failure cluster header: `6 runs, 1 root cause. Someone shipped a config change.`
- Diff tab CTA: `Compare to the last run that worked →`

| Field | Value |
|---|---|
| **Slug** | `tracewell` |
| **Lane fit** | L2 (Applied AI / AI Solutions Architect / FDE) primary; L1 (RevOps / AI Automation) secondary |
| **Live route** | `demos.dallascrilley.com/tracewell` |
| **Status** | Spec drafted; E3 "AI-native proof surface" hero candidate |
| **Build estimate** | ~2.5 weeks full / ~1.5 weeks trimmed (static-only path) |
| **Accent token** | `--signal: oklch(78% 0.17 90)` amber-phosphor — the flight-recorder readout glow |

---

## 1. Positioning

500 of 516 repos are private. A hiring manager browsing the public GitHub profile today sees WordPress stubs and CRUD skeletons that *actively contradict* the "AI Automation & Internal Tools Engineer" positioning. Tracewell exists to close AC3 of the job-ready portfolio: **at least one public, runnable artifact that lets a stranger verify the AI-engineering positioning without trusting private code.**

The 30-second proof: open `demos.dallascrilley.com/tracewell`, click a failed agent run in the timeline, watch the tool-call tree collapse to the exact step that blew up, see the token cost per node and the prompt diff against the last successful run. No explanation needed. The UI is self-evident to anyone who has debugged a production agent. That's the senior signal.

---

## 2. Problem & evidence

AI agents fail in production. Every team that ships one eventually asks the same question: *"It worked in dev — what did it actually do at 3 AM?"* Current tooling is a three-way miss:

- **Datadog / Sentry** — infrastructure-native, not agent-semantic. They know the Lambda timed out; they don't know which tool call consumed 4,200 tokens in a sub-chain, or that the prompt drifted from the version that succeeded on Monday.
- **LangSmith / Helicone** — dev-time tracing. Designed for prompt engineers running evals, not ops engineers debugging incidents at 3 AM. No incident timeline, no failure-mode grouping, no replay-with-edit affordance.
- **Zapier / n8n run history** — unstructured text. No tree, no diff, no token accounting per node. The failure is a wall of JSON.

Nobody renders an agent run as a clickable, replayable, diff-able timeline the way Sentry renders a stacktrace. That is the white space.

### Job-posting evidence (verbatim)

| Posting | Quote |
|---|---|
| **Ping Identity** | "Familiarity with agent tracing and monitoring concepts — you understand how to observe agent behavior in production (e.g., trace logs, token usage, latency, failure modes)." |
| **n8n Workflow Engineer** | "Instrument workflows for observability, error handling, retries, auditability, and versioning." |
| **StockX AI Automation** | "Build observability, logging, guardrails, and monitoring into AI systems." |
| **Flexionis** | "Audit existing workflows for bottlenecks and failure points... maintain 99%+ uptime across all critical automations." |

These postings name the vocabulary — trace logs, token usage, latency, failure modes, guardrails, auditability — verbatim. Tracewell renders exactly those concepts as an interactive UI.

---

## 3. Target role & proof narrative

**Primary audience:** Applied AI Engineer, AI Solutions Architect, Forward Deployed Engineer hiring managers.

**What 30 seconds proves:**

1. Dallas knows the vocabulary of production agent observability — not as a user but as a builder who designed the schema.
2. Dallas can render complex hierarchical data (a tool-call tree with cost attribution) as an immediately legible UI — the same skill FDE and Solutions Architect roles test in take-homes.
3. Dallas understands failure modes at the semantic level: prompt drift, tool timeout, context-window overflow, guardrail rejection — not just "the API returned 500."

**Why it reads as senior, not junior:**

A junior demo would show a dashboard of counts. Tracewell shows a *reasoning surface*: click a node, see the exact prompt snapshot that entered it, see the diff against the last successful run of the same step, and see the token budget consumed by every branch. This is the demo you show when you want someone to think "this person has debugged real agents in production, not just built weekend prototypes."

### Objection → proof

Each row is a real hiring concern the demo neutralizes in under a minute of browsing — no resume, no call, no trust in private code required.

| Role | The concern in their head | What Tracewell proves |
|---|---|---|
| **Applied AI Engineer** | "Has this person actually run agents in prod, or just chained API calls?" | The schema models failure modes (`context_overflow`, `guardrail_reject`) you only name after you've been paged for them. The data tells an incident story, not a happy path. |
| **Forward Deployed Engineer** | "Can they turn messy hierarchical data into a UI a customer grasps instantly?" | A nested tool-call tree with per-node cost attribution rendered legibly in one screen — the exact take-home FDE roles assign. |
| **AI Solutions Architect** | "Do they think in systems or in scripts?" | Failure-mode clustering across 50 runs surfaces a *single root cause* behind 6 incidents — root-cause thinking, not log-tailing. |
| **RevOps / Automation (L1)** | "Will they instrument what they build, or ship blind?" | Token spend, latency, and a replay affordance per step — observability designed in, matching the n8n/StockX 'instrument for auditability' ask verbatim. |
| **Any skeptic** | "Is this vaporware with fabricated numbers?" | Every token count is derived from real prompt lengths; the synthetic banner is loud and the limits are listed before the CTA. Honesty is the senior tell. |

---

## 4. The demo — core flow

The demo has two views: **Timeline** (the incident history) and **Run Inspector** (the deep-dive into a single run). Both are interactive; all data is synthetic and pre-recorded.

### 4.1 Timeline view (default landing)

A reverse-chronological feed of the last 50 synthetic agent runs. Each row shows:
- Run ID + timestamp
- Agent name (`lead-enrichment-agent`, `outreach-sequencer`, `contract-review-agent`)
- Status: `success` / `failed` / `degraded` (partial tool success)
- Total token spend (input + output, color-coded by cost tier)
- Wall-clock latency
- Failure-mode badge when applicable: `tool_timeout` · `context_overflow` · `guardrail_reject` · `hallucination_detected` · `missing_input`

Failure-mode grouping: a collapsible sidebar clusters the 50 runs by failure signature. The headline cluster reads `FP-01 · 6 runs · contract-review-agent · context_overflow · inject_context` — six incidents, one root cause. A second cluster `FP-02 · 3 runs · outreach-sequencer · tool_timeout · smtp_send` runs in parallel so the grouping visibly discriminates. This is the incident-timeline concept named in the IDEAS-FROM-JOBS demo angle.

**What's interactive:** clicking any row opens the Run Inspector. Clicking a failure-mode cluster filters the timeline to matching runs.

### 4.2 Run Inspector — the aha moment

The primary interactive surface. Opens for a selected run.

**Left panel — tool-call tree:**
Hierarchical tree of every step in the run. Each node shows:
- Step name + tool identifier
- Status icon (green check / red X / yellow warning)
- Token cost: input tokens / output tokens / cumulative branch cost
- Latency: step duration in ms

Clicking a node expands the step detail in the right panel.

**Right panel — step detail:**

Three tabs:

1. **Prompt snapshot** — the exact prompt text that entered this step, syntax-highlighted with the model parameters (temperature, max_tokens). A "Compare to last success" button diffs this snapshot against the same step in the most recent successful run of the same agent. Diff is inline, character-level, rendered like a git diff (red/green lines). This is the **"prompt-input diff vs. the previous successful run"** called out in the demo angle.

2. **Output** — the raw model output or tool return value, truncated at 1,000 chars with a "Show full" toggle. If the step failed, the error message is highlighted with a human-readable diagnosis from the failure-mode classifier.

3. **Replay (synthetic)** — a text area with the prompt pre-filled. An **"Edit & replay (synthetic)"** button re-runs the step against the synthetic response fixture, re-rendering the output panel with the new inputs. This is illustrative — the replay hits a local JS fixture, not a live model — but the affordance is fully functional and makes the concept immediately legible. A visible label reads: "Replay is synthetic — edits route to a recorded response fixture."

### 4.4 The signature moment — "the 3 AM replay" (cinematic walkthrough)

This is the one thing a viewer remembers. Build the entire demo to make these eight seconds land.

The viewer arrives on the timeline. The top row is still skeleton-shimmering as if it just streamed in. Their eye drops to the only row glowing amber-red: **`run_8f2a1c` · contract-review-agent · 03:14 · FAILED · context_overflow · 14,214 tok**. They click it.

The split-panel inspector slides in. The tool-call tree draws itself top-down — `load_contract` ✓, `inject_context` ✓, then `review_contract` ✗ pulsing red. Three nodes. The failure is obvious but the *cause* isn't yet. They click the red node.

The right panel snaps to the **Prompt snapshot** tab: a 14,214-token wall of text, and under it a single red error line — `context_length_exceeded: 14,214 > 8,192`. The token counter at the top reads in amber-phosphor, tabular and exact. A button sits beside it: **`Compare to the last run that worked →`**. They click it.

The panel splits into a diff. Monday's run (`run_7c4e9b`, 9,824 tokens, green) on the left; tonight's on the right. Everything is identical — the system prompt, the contract, the instructions — *except one contiguous green block on the right*: a 4,400-token `compliance_policy_v4.md` injection that did not exist on Monday. A caption underneath, plain and damning:

> `+4,390 tokens added at step inject_context. Source: compliance_policy_v3 → v4 on 2026-05-26. This is the regression.`

The viewer realizes, without a single word of explanation, that they just did a full production incident postmortem — symptom, blast radius, root cause, the exact change that caused it — in three clicks. **That is the screenshot.** That is the moment a staff engineer pastes into Slack with "ok this is actually good."

Optional flourish (Phase 3): a **`Replay without the v4 block`** button on the diff strips the offending injection, re-runs the step against the fixture, and the node flips green — 9,824 tokens, success. The viewer watches the fix they just diagnosed get verified. No live model; pure recorded fixture; fully labeled synthetic.

### 4.3 Synthetic data banner — framed as a trust signal

Persistent in the app shell, dismissible per session. The copy is not an apology; it is a demonstration that the builder knows the difference between a demo and a claim — which is itself a senior tell. Phrased as confidence, not a disclaimer:

> **Every number here is synthetic — and honestly labeled.** Tracewell is a portfolio demo: the 50 runs are fabricated, but the token counts are derived from real prompt lengths and the failure modes are ones you'd actually get paged for. No live model, no real systems, no invented benchmarks. *That discipline is the point.*

---

## 5. Brand & visual direction

**Name:** Tracewell (sentence case; lowercase in UI chrome; never "TraceWell" or "TRACEWELL")

**Tagline:** "Your agent failed in production. Here's the black box."

**Visual direction — `flight recorder`, not SaaS dashboard.** The metaphor is a cockpit voice/data recorder and an oscilloscope readout, not a Sentry clone. Concretely this means: a single charcoal instrument surface (no card-grid), one amber-phosphor signal color that *glows* the way a CRT readout does, hairline rules instead of boxes, and a strict monospaced-numeric grid so the whole thing reads like an instrument panel a flight investigator pulls from a wreck. Restraint is the aesthetic — one accent, heavy negative space, data as the only ornament.

This is deliberately distinct from the sibling demos so the four never blur: **Apexlint** is a paper-white code-review surface (diagnostics in the margin); **Funnelguard** is a bright marketing-ops audit (status chips, fix buttons); **Q2See** is a luminous flow-graph (Sankey ribbons). **Tracewell is the only dark one, and the only one whose signature visual is a horizontal time-axis with a phosphor glow** — a replayable timeline, not a node graph and not a document.

**Layout motif — the replayable trace ribbon.** Across the top of the inspector runs a thin horizontal time-axis (the "ribbon") with each step plotted as a tick whose width is its latency and whose height/intensity is its token cost. The failing step burns amber-red. A draggable playhead scrubs the ribbon; dragging it advances the tree and right-panel to that step's state. This scrub-the-incident interaction is the one signature motion — borrowed from a video scrubber, applied to an agent run. Nothing else in the portfolio moves like this.

**Palette (instrument surface, single signal):**
- Surface base: `oklch(16% 0.012 250)` — gunmetal charcoal, faint cool cast, never pure black
- Surface raised: `oklch(20% 0.014 250)` — panels lifted by a 1px `oklch(28% 0.02 250)` hairline, not a shadow box
- Signal (accent): `oklch(78% 0.17 90)` — amber-phosphor; the only saturated color; used for the active step, the playhead, and the readout numerals; apply a faint `text-shadow` glow at large sizes only
- Success: `oklch(72% 0.15 160)` — instrument green, desaturated
- Failure: `oklch(63% 0.21 28)` — ember red-orange (diagnostic, not alarm)
- Degraded: `oklch(74% 0.16 70)` — caution amber, distinct from the signal hue
- Text primary: `oklch(93% 0.004 250)`; secondary `oklch(64% 0.008 250)`; grid hairlines `oklch(28% 0.02 250)`

**Typography:**
- The numerals carry the design. `JetBrains Mono` for *all* token counts, latencies, timestamps, run IDs, and prompt snapshots — `font-variant-numeric: tabular-nums slashed-zero`. An instrument panel is monospaced.
- UI labels/headings: `Inter Tight` or `Geist` at tight tracking for chrome only. No decorative display face — the readout is the display.

**Anti-template bar (≥4 required):** scale contrast between the dense ribbon and the open prompt panel; rhythm from hairline grid vs. open negative space; depth via hairline-lifted panels (no drop-shadow cards); typographic character from the all-mono numeric system; color used purely semantically (one signal hue, three status hues, nothing decorative); designed hover/active states (a tree node on hover gets an amber left-edge tick, not a gray wash); the scrub-the-ribbon playhead motion that clarifies sequence.

**Motion budget (strict):** the playhead scrub (the signature), tree expand/collapse at `150ms ease-out`, and a single phosphor-shimmer on the newest timeline row to suggest "live." Nothing else animates. Honor `prefers-reduced-motion`: the playhead still drags, but the shimmer and tween are disabled.

---

## 6. Synthetic dataset — the incident, told in 50 runs

The data is not rows; it is a story with a cause. A builder should be able to implement this verbatim. The whole dataset is one week in the life of a fictional company's automation fleet, and a single bad config change rippling through it.

### The cast

- **Company:** *Redwood Labs* — a fictional B2B SaaS firm. Customers referenced in data are plausible-but-fake: *Acme Ventures LLC*, *Northwind Systems*, *Belmont Capital* (no real entities, no PII).
- **`lead-enrichment-agent`** — enriches inbound leads via a `clearbit_lookup` tool + a model summarization step. The reliable one; mostly green. Provides the "this is what healthy looks like" baseline.
- **`outreach-sequencer`** — drafts and schedules follow-up emails. Occasionally trips `guardrail_reject` when it drafts a non-compliant claim, and one `hallucination_detected` where it invents a customer's job title.
- **`contract-review-agent`** — the deep one (up to 8 steps): `load_contract → inject_context → review_contract → extract_clauses → flag_risks`. **This is the agent at the center of the incident.**

### The narrative arc (implement this exactly)

**Mon 2026-05-26 — the baseline.** `contract-review-agent` run `run_7c4e9b` succeeds cleanly: `inject_context` pulls `compliance_policy_v3.md` (410 tokens), total prompt 9,824 tokens, well under the 8,192… wait — under budget because v3 is small; the run completes green. This run is the **paired "last success"** every later failure diffs against. Keep it pristine.

**Tue 2026-05-27 — the regression ships.** A (synthetic, off-screen) config change swaps `compliance_policy_v3.md → v4.md`, ballooning the injected block from 410 → 4,400 tokens. Nobody notices: Tuesday's contracts happen to be short, so totals stay just under 8,192. **The bomb is armed but doesn't go off.** This is the credible part — regressions hide until input size crosses the line.

**Wed 2026-05-28, 03:14 — the page.** A larger contract (*MSA-2026-ACME-0088*, 6,200 words) hits the now-bloated pipeline. `run_8f2a1c`: prompt = 8,200 (contract) + 4,400 (v4 policy) + 1,614 (prior-contract context) = **14,214 tokens into an 8,192 window. `context_overflow`. Zero output. The 3 AM page.** This is the canonical failure and the signature-moment run.

**The cascade (this is what sells "system thinking").** It is not one failure — it is a *signature*. Across Wed–Thu, **6 `contract-review-agent` runs fail with the identical `context_overflow` root cause**, every one traceable to the v4 injection, every one diffable against a clean v3 predecessor. Tracewell's failure-mode sidebar clusters all 6 under one signature: `FP-01 · contract-review-agent · context_overflow · inject_context`. A second, unrelated cluster (`FP-02 · outreach-sequencer · tool_timeout` on a slow `smtp_send`) runs in parallel so the grouping has to actually discriminate — proving the clustering isn't faked to a single bucket.

**The resolution beat (for the optional replay).** The replay fixture for the failing `inject_context` step contains both the v4 (broken) and v3 (fixed) outputs, so the `Replay without the v4 block` button can flip the run green — closing the story the viewer just diagnosed.

### Agent run record schema

```ts
interface AgentRun {
  id: string;                         // "run_8f2a1c"
  agent_id: AgentId;                  // "lead-enrichment-agent"
  started_at: string;                 // ISO 8601
  ended_at: string;
  status: "success" | "failed" | "degraded";
  failure_mode: FailureMode | null;   // see enum below
  total_tokens_in: number;
  total_tokens_out: number;
  total_latency_ms: number;
  steps: AgentStep[];
}

interface AgentStep {
  id: string;                         // "step_3"
  parent_id: string | null;           // for nested tool calls
  name: string;                       // "inject_context"
  tool: string | null;                // null for model steps
  status: "success" | "failed" | "skipped";
  tokens_in: number;
  tokens_out: number;
  latency_ms: number;
  prompt_snapshot: string;            // full prompt text
  output_snapshot: string;            // model output or tool return
  error: string | null;
  model: string | null;               // "claude-sonnet-4-6", null for tool steps
  model_params: { temperature: number; max_tokens: number } | null;
}

type AgentId =
  | "lead-enrichment-agent"
  | "outreach-sequencer"
  | "contract-review-agent";

type FailureMode =
  | "tool_timeout"
  | "context_overflow"
  | "guardrail_reject"
  | "hallucination_detected"
  | "missing_input";
```

### Sample record — the canonical failure case

```json
{
  "id": "run_8f2a1c",
  "agent_id": "contract-review-agent",
  "started_at": "2026-05-28T03:14:22Z",
  "ended_at": "2026-05-28T03:14:51Z",
  "status": "failed",
  "failure_mode": "context_overflow",
  "total_tokens_in": 14214,
  "total_tokens_out": 0,
  "total_latency_ms": 29341,
  "steps": [
    {
      "id": "step_1",
      "parent_id": null,
      "name": "load_contract",
      "tool": "file_reader",
      "status": "success",
      "tokens_in": 0,
      "tokens_out": 0,
      "latency_ms": 312,
      "prompt_snapshot": null,
      "output_snapshot": "[CONTRACT_TEXT: 6,200 words / MSA-2026-ACME-0088]",
      "error": null,
      "model": null,
      "model_params": null
    },
    {
      "id": "step_2",
      "parent_id": null,
      "name": "inject_context",
      "tool": "context_builder",
      "status": "success",
      "tokens_in": 0,
      "tokens_out": 0,
      "latency_ms": 88,
      "prompt_snapshot": null,
      "output_snapshot": "[INJECTED: compliance_policy_v4.md (4,400 tokens) + 3 prior contracts]",
      "error": null,
      "model": null,
      "model_params": null
    },
    {
      "id": "step_3",
      "parent_id": null,
      "name": "review_contract",
      "tool": null,
      "status": "failed",
      "tokens_in": 14214,
      "tokens_out": 0,
      "latency_ms": 28941,
      "prompt_snapshot": "You are a contract review assistant...\n[COMPLIANCE POLICY — 4,400 tokens]\n[CONTRACT — 8,200 tokens]\n[PRIOR CONTRACT CONTEXT — 1,614 tokens]\nReview the contract for liability caps, auto-renewal clauses...",
      "output_snapshot": null,
      "error": "context_length_exceeded: prompt is 14,214 tokens; model max_tokens is 8,192",
      "model": "claude-sonnet-4-6",
      "model_params": { "temperature": 0.2, "max_tokens": 8192 }
    }
  ]
}
```

The paired baseline `run_7c4e9b` (Monday 2026-05-26) has `inject_context` pulling `compliance_policy_v3.md` (410 tokens). The diff between Monday and the 3 AM Wednesday failure is the single v3→v4 injection mutation (+4,390 tokens). This is the load-bearing diff the UI renders in the prompt-diff tab and the climax of the signature moment in §4.4.

### Full dataset shape

The bundled `runs.json` contains:
- 50 synthetic runs across 3 agents, spanning 7 synthetic days (2026-05-22 → 2026-05-28); the regression lands Tue 05-27, detonates Wed 05-28
- ~30 success, ~12 failed, ~8 degraded
- Failure modes distributed: **6× `context_overflow`** (the cascade — all `contract-review-agent`, all rooted in the v4 injection, forming cluster FP-01), 3× `tool_timeout` (the unrelated `outreach-sequencer` cluster FP-02), 2× `guardrail_reject`, 1× `hallucination_detected` — totaling 12 failures, with the 8 degraded runs being partial tool successes
- Each run has 2–8 steps; `contract-review-agent` has the deepest tree (up to 8: `load_contract → inject_context → review_contract → extract_clauses → flag_risks` plus nested tool calls)
- Every failure has a paired "last success" run to power the prompt diff; the cascade's six failures all diff against the pristine Monday `run_7c4e9b`

---

## 7. Technical architecture

### Stack

- **Framework:** Astro 5 (static output) + TypeScript — matches the demo-lab repo's existing stack; no new dependencies introduced at the build layer
- **UI components:** Vanilla TypeScript + CSS custom properties; no React/Vue/Svelte — keeps the bundle under the 80kb microsite JS budget
- **Data:** `runs.json` bundled as a static asset, loaded via `fetch('/tracewell/data/runs.json')` on first paint, stored in a module-level Map for the session
- **Diff rendering:** `diff-match-patch` (4kb gzipped) for the prompt diff — the only non-zero third-party dependency
- **No API keys, no environment variables, no stored traces** — the default data is static; the "Analyze your trace" panel posts pasted JSON to `POST /tracewell/analyze`, a Cloudflare Pages Function that classifies the trace server-side without live model calls

### Deploy path

Deploys as a subpath under the existing `demos.dallascrilley.com` Cloudflare Pages / Wrangler project. The Astro `base` config is set to `/tracewell`; `wrangler publish` to the `demos` Pages project. No separate project configuration.

### File layout (new files only)

```
demo-lab/
  products/tracewell/
    SPEC.md                    ← this file
  src/
    pages/
      tracewell/
        index.astro            ← timeline view + shell
        run/[id].astro         ← run inspector (static paths from runs.json)
    components/
      tracewell/
        TimelineView.ts        ← timeline render + filter
        RunInspector.ts        ← split-panel inspector
        ToolCallTree.ts        ← recursive tree component
        TraceRibbon.ts         ← horizontal time-axis + draggable playhead (signature motif)
        PromptDiff.ts          ← diff-match-patch wrapper
        SyntheticBanner.ts     ← persistent banner
    styles/
      tracewell.css            ← scoped tokens + layout
  public/
    tracewell/
      data/
        runs.json              ← 50-run synthetic dataset
        runs-replay-fixture.json ← replay response stubs
```

No new Astro integrations, no new npm packages except `diff-match-patch`. All component files are plain TypeScript; no framework component files (`.astro` only at the page layer).

---

## 8. Scope: in / out

| In (demo does this) | Out (demo does not do this) |
|---|---|
| Render 50 synthetic runs in a timeline | Connect to real agents, LangChain, LangSmith, or any live model |
| Tool-call tree with token cost per node | Ingest real trace data (no SDK, no OTLP, no HTTP receiver) |
| Prompt diff against last successful run | Store user edits or sessions (no localStorage, no DB) |
| Edit & replay against a synthetic fixture | Make real LLM calls at replay time |
| Failure-mode grouping in the sidebar | Alert on real incidents |
| Synthetic data banner | Any auth, login, or user state |
| Honest-limits section on the landing page | Multi-agent orchestration graphs (single-agent tree only) |
| Responsive layout (mobile readable, not mobile-optimized) | Native mobile app |

---

## 9. Acceptance criteria

All must hold before the demo is promoted as a public portfolio asset:

- **AC-1 — HTTPS load.** `https://demos.dallascrilley.com/tracewell` loads with a valid TLS cert and returns HTTP 200.
- **AC-2 — Timeline renders.** The default view shows ≥ 10 synthetic run rows with status, agent name, timestamp, and token totals visible without horizontal scroll at 1440px viewport.
- **AC-3 — Run inspector opens.** Clicking any timeline row opens the Run Inspector with the tool-call tree visible. No dead clicks.
- **AC-4 — Tree nodes are interactive.** Clicking a tree node populates the right panel with prompt snapshot, output, and latency data for that step.
- **AC-5 — Prompt diff renders.** For a failed run with a known last-success pair, the "Compare to last success" button renders an inline character-level diff. The diff must show at least one meaningful token-count delta.
- **AC-6 — Replay affordance works.** The "Edit & replay (synthetic)" button in the Replay tab accepts text input and re-renders the output panel from the fixture. The synthetic-replay label is visible.
- **AC-7 — Failure-mode filter works.** Clicking a failure-mode cluster in the sidebar filters the timeline to matching runs only. A "Clear filter" control restores the full list.
- **AC-8 — Synthetic banner present.** The synthetic-data banner is visible in the app shell on first load. It is not hidden, collapsed, or rendered in a color that makes it unreadable.
- **AC-9 — No secrets.** `wrangler pages deployment list` shows no environment variables bound to the project. The `runs.json` asset contains no real email addresses, real company names, or any PII.
- **AC-10 — Honest-limits section.** The landing page (`/tracewell`) includes an honest-limits section with ≥ 3 clearly stated limitations before the CTA.
- **AC-11 — Lighthouse ≥ 85 performance.** `lighthouse https://demos.dallascrilley.com/tracewell --only-categories=performance` scores ≥ 85 on desktop.
- **AC-12 — No layout shift on tree expand.** Expanding a tree node must not shift the timeline panel or cause visible CLS.
- **AC-13 — Trace ribbon scrubs.** The inspector's horizontal trace ribbon renders one tick per step (width = latency, intensity = token cost) with the failing step burning ember-red. Dragging the playhead advances the tree + right panel to that step's state. Under `prefers-reduced-motion`, drag still works; tween/shimmer are disabled.
- **AC-14 — Single signal hue.** Only `--signal` (amber-phosphor) appears as a saturated accent; status hues are reserved for status. No second decorative accent color anywhere in the UI.

---

## 10. Build sequence

### Phase 1 — Data + shell (days 1–3)

1. Author `runs.json` (50 runs, 3 agents, all failure modes, every step populated). Author `runs-replay-fixture.json` (one stub response per agent-step combination).
2. Stand up the Astro page shell (`tracewell/index.astro`) with the correct base path and CSS token file. Confirm Wrangler deploys to `demos.dallascrilley.com/tracewell`.
3. Implement `TimelineView.ts` — render the 50 runs as a styled list. No interactivity yet. Confirm AC-2.

### Phase 2 — Tree + inspector (days 4–7)

4. Implement `ToolCallTree.ts` — recursive tree from the steps array. Status icons, token labels, latency labels. Expand/collapse with `150ms ease-out` animation.
5. Implement `RunInspector.ts` — split-panel layout. Wire timeline row clicks to inspector. Confirm AC-3, AC-4.
6. Implement `TraceRibbon.ts` — time-axis ticks + draggable playhead bound to step state. This is the signature interaction; budget a full day. Confirm AC-13.
7. Implement `PromptDiff.ts` — wire `diff-match-patch`, render the inline diff for the canonical failure pair (v3→v4 injection). Confirm AC-5.

### Phase 3 — Replay + filter (days 8–10)

8. Implement the Replay tab — text area, fixture lookup, re-render; wire the `Replay without the v4 block` flip-to-green. Confirm AC-6.
9. Implement the failure-mode sidebar and filter (FP-01 cascade + FP-02). Confirm AC-7.
10. Add the synthetic banner and honest-limits section. Confirm AC-8, AC-10.

### Phase 4 — Polish + QA (days 11–13)

11. Typography pass: all-mono numerals, tabular-nums + slashed-zero on every token/latency/timestamp, amber-phosphor glow on the readout, scale contrast tree vs. timeline. Confirm AC-14.
12. Hover / focus / active states (amber left-edge tick on tree-node hover, not a gray wash); timeline-row states.
13. Responsive check at 375, 768, 1440. No horizontal overflow. Verify ribbon degrades gracefully on mobile.
14. Lighthouse run. Fix any performance issues. Confirm AC-11, AC-12.
15. Secret audit: grep `runs.json` for real-looking PII. Confirm AC-9.
16. Manual walkthrough of the signature moment (contract-review-agent, `run_8f2a1c`, 3 AM, context_overflow → diff → replay-to-green). Confirm all ACs together.

### Trim option (1.5 weeks)

Drop Phase 3 replay tab and failure-mode filter, but **keep the trace ribbon and the prompt diff** — they carry the signature moment. Ship timeline + tree + ribbon + prompt diff + banner + honest-limits. Satisfies the 30-second proof with ACs 1–5, 8–14.

---

## 11. Open questions / risks

| Question | Recommendation |
|---|---|
| **`diff-match-patch` vs. a hand-rolled character diff?** | Use `diff-match-patch` — it handles edge cases (Unicode, whitespace) correctly and is 4kb gzipped. Hand-rolling a character diff for a demo is a quality risk with no upside. |
| **Static routes vs. client-side routing for `/run/[id]`?** | Static routes via Astro `getStaticPaths` over the 50 run IDs. Avoids a client router dependency and keeps the build fully static. 50 pages is trivial at build time. |
| **Should the landing page (`/tracewell`) be a separate marketing page or the timeline itself?** | The timeline is the landing page — no interstitial marketing page. The honest-limits and proof narrative live in a collapsible "About this demo" panel pinned to the bottom of the shell. This gets the hiring manager into the data in one click. |
| **Risk: the synthetic data feels obviously fake.** | Mitigate by using realistic company names (fictional but plausible: "Acme Ventures LLC", "Redwood SaaS Inc."), realistic prompt text (actual contract-review boilerplate, not lorem ipsum), and realistic token counts derived from actual prompt lengths. The contract-review failure is the most credible because the root cause (a compliance_policy update bloating the context window) is a real production failure pattern. |
| **Risk: the prompt diff is the hardest surface to make legible.** | Scope the diff to system-prompt changes only in the MVP. Full message-array diffs (multi-turn) are complex to render clearly. The canonical failure case involves a single system-prompt mutation, which renders as a clean contiguous block diff — achievable in Phase 2. |
| **Does this conflict with Replay (existing product)?** | No — Replay does static analysis on Zap exports; Tracewell does live observability on running agents. Different audience (Zapier ops vs. agent engineers), different surface (export parsing vs. trace inspection), complementary product family narrative. |
