# Tracewell

> **Your agent failed in production. Here's the black box.**

Tracewell is an interactive flight recorder for AI agent runs. It renders 50 synthetic agent executions as a clickable timeline with per-step token accounting, prompt diffing, and synthetic replay — all client-side. An optional **Analyze your trace** panel posts a pasted trace to a real Cloudflare Pages Function (`POST /tracewell/analyze`) that classifies failure modes server-side. No API keys, no live model calls, nothing stored.

**Live demo:** [demos.dallascrilley.com/tracewell](https://demos.dallascrilley.com/tracewell)

## What it proves

- **Production agent observability design** — models failure modes (`context_overflow`, `guardrail_reject`, `tool_timeout`) you only name after you've been paged for them.
- **Hierarchical data visualization** — a nested tool-call tree with per-node cost attribution rendered legibly in one screen.
- **Prompt diff and token accounting** — character-level diff against the last successful run, showing exactly what changed.
- **Failure-mode schema design** — clusters six incidents under one root cause, demonstrating system thinking.
- **Incident root-cause analysis** — the signature moment traces a 4,390-token config regression in three clicks.

## Run locally

```bash
pnpm install
pnpm dev
```

Open `http://localhost:4321`. The demo loads synthetic data from `public/data/runs.json`.

## Input schema — `POST /tracewell/analyze`

The endpoint takes a JSON body with your trace JSON **as a string** in `raw`:

```json
{ "raw": "<trace JSON as a string>", "name": "optional" }
```

`raw` must parse to one of three accepted shapes:

1. **A single run object** — identified by any of `steps`, `id`, or `agent_id`. Recognized run fields: `id`, `agent_id`, `status` (`failed|degraded|success`), `failure_mode`, `started_at`, `ended_at`, `steps[]`. Recognized step fields: `id`, `parent_id`, `name`, `tool`, `status` (`success|failed|skipped`), `tokens_in`, `tokens_out`, `latency_ms`, `error`, `model`, `model_params`. Missing fields are normalized with sensible defaults; unknown fields are ignored.
2. **An array of runs** — `[ <run>, <run>, … ]`
3. **A wrapped object** — `{ "runs": [ <run>, … ] }`

Minimal valid example:

```bash
curl -s https://demos.dallascrilley.com/tracewell/analyze \
  -H 'content-type: application/json' \
  -d '{"raw": "{\"id\":\"run_1\",\"agent_id\":\"support-bot\",\"status\":\"failed\",\"steps\":[{\"name\":\"send\",\"status\":\"failed\",\"error\":\"tool_timeout: deadline exceeded\"}]}"}'
```

Malformed input gets a field-specific `400` that names what was wrong and what was expected (missing/mistyped `raw`, unparseable trace JSON with the offending prefix echoed back, or an unsupported shape with the top-level keys it actually found).

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for design decisions, data schema, and tradeoffs.

## Honest limits

- **No live model** — replay routes to a local JSON fixture, not a real LLM.
- **No real agent data** — all runs, companies, and contracts are synthetic.
- **No ingestion SDK** — this does not instrument real agents; it visualizes pre-recorded data.
- **No persistent storage** — session state is in-memory only.
- **No multi-agent orchestration graphs** — single-agent linear step trees only.
- **Prompt diffs compare system-prompt snapshots**, not full multi-turn conversation histories.

## License

MIT
