# Tracewell

> **Your agent failed in production. Here's the black box.**

Tracewell is a client-side, interactive flight recorder for AI agent runs. It renders 50 synthetic agent executions as a clickable timeline with per-step token accounting, prompt diffing, and synthetic replay. No backend, no API keys, no live model calls.

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
