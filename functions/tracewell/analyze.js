/**
 * Tracewell — server-side agent-trace analyzer (Cloudflare Pages Function).
 *
 * Accepts a recorded agent-run trace export — a single run object or an array
 * of runs in the Tracewell run shape (id, agent_id, status, steps[…]) — and
 * diagnoses each run ENTIRELY from the uploaded steps: classifies the failure
 * mode, pins the root-cause step, and returns a fix playbook. No live model, no
 * stored data, no third-party calls: you paste/upload your own trace, the
 * server inspects it, and hands back findings the client renders.
 *
 * Honest boundary: this analyzes a recorded trace (a point-in-time export), not
 * a live agent connection. The detection rules are real; the trace is yours.
 *
 * The pure helpers below are exported so they can be unit-tested without a
 * network or a Workers runtime (see ../../tests/tracewell-analyze.test.js).
 */

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...init.headers,
    },
    ...init,
  });
}

// ─── Failure-mode playbook ───────────────────────────────────────────────────
// Real remediation guidance keyed by the diagnosed failure mode. Kept in sync
// with the client copy in src/components/tracewell/diagnose.ts (content only —
// the classification logic below is the source of truth).

export const PLAYBOOK = {
  context_overflow: {
    title: 'Context window blew past the model limit',
    system_owner: 'Prompt assembly / context builder',
    fix: 'Cap injected context: trim the policy/RAG payload to what the step actually needs, summarize long reference docs, and add a pre-flight token-budget check that fails fast before the model call — not after the tokens are already spent.',
  },
  tool_timeout: {
    title: 'Tool call timed out',
    system_owner: 'Tool integration / downstream service',
    fix: 'Set an explicit per-tool timeout with retry + backoff, and provide a degraded fallback so one slow dependency does not take the whole run down.',
  },
  guardrail_reject: {
    title: 'Guardrail blocked the output',
    system_owner: 'Safety / guardrail config',
    fix: 'Inspect which guardrail fired and why, tighten the upstream prompt so the model stops producing the blocked content, and log the rejection reason so policy drift stays visible.',
  },
  hallucination_detected: {
    title: 'Unverified / fabricated output',
    system_owner: 'Grounding / retrieval',
    fix: 'Require the step to cite retrieved sources and reject answers with no grounding; add a verification pass before the output is consumed downstream.',
  },
  missing_input: {
    title: 'Required input was missing',
    system_owner: 'Upstream data / orchestration',
    fix: 'Validate required inputs at the step boundary and short-circuit with a clear error instead of calling the model on empty or partial input.',
  },
  agent_error: {
    title: 'Step failed',
    system_owner: 'Agent runtime',
    fix: 'Inspect the step error and add a guard for this failure class so it surfaces as a handled error with context, not an opaque crash.',
  },
};

const SEVERITY_RANK = { critical: 3, warning: 2, healthy: 1 };

// ─── Classification ──────────────────────────────────────────────────────────

const PATTERNS = [
  ['context_overflow', /context[\s_-]?(length|window|overflow)|token.*(exceed|limit)|too many tokens|maximum context/i],
  ['tool_timeout', /\btime[\s_-]?d?\s?out\b|timeout|deadline|etimedout|deadline exceeded/i],
  ['guardrail_reject', /guardrail|policy violation|blocked|refus|content[\s_-]?filter|safety/i],
  ['hallucination_detected', /hallucinat|fabricat|unverified|no source|ungrounded/i],
  ['missing_input', /missing|required|not provided|empty input|null input|undefined input/i],
];

/** First failed step, else (for degraded runs) the slowest step, else null. */
export function findRootStep(run) {
  const steps = Array.isArray(run.steps) ? run.steps : [];
  const failed = steps.find((s) => s.status === 'failed');
  if (failed) return failed;
  if (run.status === 'degraded' && steps.length) {
    return steps.reduce((a, b) => ((b.latency_ms || 0) > (a.latency_ms || 0) ? b : a));
  }
  return null;
}

/** Classify the failure mode from the run's declared mode, then its step errors. */
export function classifyFailure(run, rootStep) {
  if (run.failure_mode && PLAYBOOK[run.failure_mode]) return run.failure_mode;
  const haystack = `${rootStep?.error || ''} ${rootStep?.status || ''} ${run.failure_mode || ''}`;
  for (const [mode, re] of PATTERNS) {
    if (re.test(haystack)) return mode;
  }
  return 'agent_error';
}

function severityOf(run) {
  if (run.status === 'failed') return 'critical';
  if (run.status === 'degraded') return 'warning';
  return 'healthy';
}

/** Build a specific, data-grounded description sentence for a finding. */
function describe(run, rootStep, mode) {
  const agent = run.agent_id || 'agent';
  const where = rootStep ? `step ${rootStep.name}${rootStep.tool ? ` (${rootStep.tool})` : ''}` : 'the run';
  if (mode === 'context_overflow') {
    const tin = rootStep?.tokens_in || run.total_tokens_in || 0;
    const limit = rootStep?.model_params?.max_tokens;
    const over = limit && tin ? ` — ${tin.toLocaleString()} tokens in against a ${limit.toLocaleString()}-token budget` : tin ? ` — ${tin.toLocaleString()} tokens in` : '';
    return `${agent} failed at ${where}${over}. The prompt outgrew the model's context window, so the call never ran.`;
  }
  if (mode === 'tool_timeout') {
    const lat = rootStep?.latency_ms || run.total_latency_ms || 0;
    return `${agent} stalled at ${where}${lat ? ` after ${(lat / 1000).toFixed(1)}s` : ''}. The tool never returned in time and the run gave up.`;
  }
  const err = rootStep?.error ? ` — ${rootStep.error}` : '';
  return `${agent} hit a ${mode.replace(/_/g, ' ')} at ${where}${err}.`;
}

/** Diagnose one run → a finding, or null if the run succeeded. */
export function diagnoseRun(run) {
  const severity = severityOf(run);
  if (severity === 'healthy') return null;
  const rootStep = findRootStep(run);
  const mode = classifyFailure(run, rootStep);
  const play = PLAYBOOK[mode] || PLAYBOOK.agent_error;
  return {
    id: `F-${run.id}`,
    run_id: run.id,
    agent_id: run.agent_id || 'unknown-agent',
    severity,
    type: mode,
    title: play.title,
    root_step_id: rootStep?.id || null,
    root_step_name: rootStep?.name || null,
    system_owner: play.system_owner,
    description: describe(run, rootStep, mode),
    fix: play.fix,
    started_at: run.started_at || '',
    tokens_in: run.total_tokens_in || 0,
    latency_ms: run.total_latency_ms || 0,
  };
}

// ─── Rollup + clusters ─────────────────────────────────────────────────────────

export function buildRollup(runs) {
  const rollup = { total: runs.length, failed: 0, degraded: 0, success: 0, by_mode: {} };
  for (const run of runs) {
    if (run.status === 'failed') rollup.failed += 1;
    else if (run.status === 'degraded') rollup.degraded += 1;
    else rollup.success += 1;
    if (run.status !== 'success') {
      const mode = classifyFailure(run, findRootStep(run));
      rollup.by_mode[mode] = (rollup.by_mode[mode] || 0) + 1;
    }
  }
  return rollup;
}

export function buildClusters(runs) {
  const map = new Map();
  for (const run of runs) {
    if (run.status === 'success') continue;
    const mode = classifyFailure(run, findRootStep(run));
    const key = `${run.agent_id}·${mode}`;
    if (!map.has(key)) {
      map.set(key, { id: key, agent_id: run.agent_id, failure_mode: mode, run_ids: [] });
    }
    map.get(key).run_ids.push(run.id);
  }
  return [...map.values()].sort((a, b) => b.run_ids.length - a.run_ids.length);
}

/** The single most severe finding, for the hero. Severity first, then most recent. */
export function pickHeadline(findings) {
  if (!findings.length) return null;
  return [...findings].sort((a, b) => {
    const s = (SEVERITY_RANK[b.severity] || 0) - (SEVERITY_RANK[a.severity] || 0);
    if (s) return s;
    return new Date(b.started_at || 0).getTime() - new Date(a.started_at || 0).getTime();
  })[0];
}

// ─── Normalization ─────────────────────────────────────────────────────────────

const RUN_STATUS = new Set(['success', 'failed', 'degraded']);

/** Coerce a loose run object into the canonical shape the client renders. */
function normalizeRun(raw, i) {
  const steps = Array.isArray(raw.steps) ? raw.steps.map((s, j) => normalizeStep(s, j)) : [];
  const status = RUN_STATUS.has(raw.status) ? raw.status : (steps.some((s) => s.status === 'failed') ? 'failed' : 'success');
  return {
    id: String(raw.id || `run_${i + 1}`),
    agent_id: String(raw.agent_id || raw.agent || 'imported-agent'),
    started_at: raw.started_at || '',
    ended_at: raw.ended_at || '',
    status,
    failure_mode: raw.failure_mode || null,
    total_tokens_in: Number(raw.total_tokens_in) || steps.reduce((n, s) => n + s.tokens_in, 0),
    total_tokens_out: Number(raw.total_tokens_out) || steps.reduce((n, s) => n + s.tokens_out, 0),
    total_latency_ms: Number(raw.total_latency_ms) || steps.reduce((n, s) => n + s.latency_ms, 0),
    steps,
  };
}

function normalizeStep(raw, j) {
  return {
    id: String(raw.id || `step_${j + 1}`),
    parent_id: raw.parent_id ?? null,
    name: String(raw.name || `step_${j + 1}`),
    tool: raw.tool ?? null,
    status: ['success', 'failed', 'skipped'].includes(raw.status) ? raw.status : 'success',
    tokens_in: Number(raw.tokens_in) || 0,
    tokens_out: Number(raw.tokens_out) || 0,
    latency_ms: Number(raw.latency_ms) || 0,
    prompt_snapshot: raw.prompt_snapshot ?? null,
    output_snapshot: raw.output_snapshot ?? null,
    error: raw.error ?? null,
    model: raw.model ?? null,
    model_params: raw.model_params ?? null,
  };
}

// ─── Orchestration ───────────────────────────────────────────────────────────

/** Parse a trace export (JSON array of runs or single run), diagnose every run. */
export function analyze(raw) {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new Error('Paste or upload an agent-run trace (JSON: a run object or an array of runs).');
  }
  let parsed;
  try {
    parsed = JSON.parse(raw.trim());
  } catch {
    throw new Error('Input does not parse as JSON. Expected a run object or an array of runs.');
  }

  let inputFormat;
  let rawRuns;
  if (Array.isArray(parsed)) {
    rawRuns = parsed;
    inputFormat = 'json-runs';
  } else if (parsed && typeof parsed === 'object' && Array.isArray(parsed.runs)) {
    rawRuns = parsed.runs;
    inputFormat = 'json-wrapped';
  } else if (parsed && typeof parsed === 'object' && (parsed.steps || parsed.id || parsed.agent_id)) {
    rawRuns = [parsed];
    inputFormat = 'json-run';
  } else {
    throw new Error('Unsupported JSON shape — expected a run object (with steps) or an array of runs.');
  }

  if (!rawRuns.length) throw new Error('No runs found in the trace.');

  const runs = rawRuns.map(normalizeRun).sort((a, b) =>
    new Date(b.started_at || 0).getTime() - new Date(a.started_at || 0).getTime());

  const findings = runs.map(diagnoseRun).filter(Boolean);
  const rollup = buildRollup(runs);
  const clusters = buildClusters(runs);
  const headline = pickHeadline(findings);

  return {
    source: 'uploaded',
    inputFormat,
    runs,
    findings,
    clusters,
    rollup,
    headline,
    stats: {
      runs: runs.length,
      failed: rollup.failed,
      degraded: rollup.degraded,
      findings: findings.length,
      critical: findings.filter((f) => f.severity === 'critical').length,
    },
  };
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const { raw, name } = body || {};
    const result = analyze(raw);
    return json({ ...result, name: typeof name === 'string' && name ? name : 'uploaded-trace.json' });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Analysis failed.' }, { status: 400 });
  }
}
