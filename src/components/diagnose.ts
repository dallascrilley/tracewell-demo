// Tracewell — client-side trace diagnosis.
//
// Mirrors the server engine in functions/tracewell/analyze.js so the default
// (synthetic) view renders the same hero / rollup / clusters the live backend
// produces for an uploaded trace. The server remains the source of truth for
// uploads; this is the read-only counterpart for the runs we ship.

import type { AgentRun, AgentStep } from './types.js';

export type Severity = 'critical' | 'warning';

export interface Finding {
  id: string;
  run_id: string;
  agent_id: string;
  severity: Severity;
  type: string;
  title: string;
  root_step_id: string | null;
  root_step_name: string | null;
  system_owner: string;
  description: string;
  fix: string;
  started_at: string;
  tokens_in: number;
  latency_ms: number;
}

export interface Rollup {
  total: number;
  failed: number;
  degraded: number;
  success: number;
  by_mode: Record<string, number>;
}

export interface Cluster {
  id: string;
  agent_id: string;
  failure_mode: string;
  run_ids: string[];
}

interface Play { title: string; system_owner: string; fix: string; }

export const PLAYBOOK: Record<string, Play> = {
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

const SEVERITY_RANK: Record<string, number> = { critical: 3, warning: 2, healthy: 1 };

const PATTERNS: [string, RegExp][] = [
  ['context_overflow', /context[\s_-]?(length|window|overflow)|token.*(exceed|limit)|too many tokens|maximum context/i],
  ['tool_timeout', /\btime[\s_-]?d?\s?out\b|timeout|deadline|etimedout|deadline exceeded/i],
  ['guardrail_reject', /guardrail|policy violation|blocked|refus|content[\s_-]?filter|safety/i],
  ['hallucination_detected', /hallucinat|fabricat|unverified|no source|ungrounded/i],
  ['missing_input', /missing|required|not provided|empty input|null input|undefined input/i],
];

export function findRootStep(run: AgentRun): AgentStep | null {
  const steps = run.steps || [];
  const failed = steps.find((s) => s.status === 'failed');
  if (failed) return failed;
  if (run.status === 'degraded' && steps.length) {
    return steps.reduce((a, b) => ((b.latency_ms || 0) > (a.latency_ms || 0) ? b : a));
  }
  return null;
}

export function classifyFailure(run: AgentRun, rootStep: AgentStep | null): string {
  if (run.failure_mode && PLAYBOOK[run.failure_mode]) return run.failure_mode;
  const haystack = `${rootStep?.error || ''} ${rootStep?.status || ''} ${run.failure_mode || ''}`;
  for (const [mode, re] of PATTERNS) if (re.test(haystack)) return mode;
  return 'agent_error';
}

function severityOf(run: AgentRun): Severity | 'healthy' {
  if (run.status === 'failed') return 'critical';
  if (run.status === 'degraded') return 'warning';
  return 'healthy';
}

function describe(run: AgentRun, rootStep: AgentStep | null, mode: string): string {
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

export function diagnoseRun(run: AgentRun): Finding | null {
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

export function diagnoseRuns(runs: AgentRun[]): Finding[] {
  return runs.map(diagnoseRun).filter((f): f is Finding => f !== null);
}

export function buildRollup(runs: AgentRun[]): Rollup {
  const rollup: Rollup = { total: runs.length, failed: 0, degraded: 0, success: 0, by_mode: {} };
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

export function buildClusters(runs: AgentRun[]): Cluster[] {
  const map = new Map<string, Cluster>();
  for (const run of runs) {
    if (run.status === 'success') continue;
    const mode = classifyFailure(run, findRootStep(run));
    const key = `${run.agent_id}·${mode}`;
    if (!map.has(key)) map.set(key, { id: key, agent_id: run.agent_id, failure_mode: mode, run_ids: [] });
    map.get(key)!.run_ids.push(run.id);
  }
  return [...map.values()].sort((a, b) => b.run_ids.length - a.run_ids.length);
}

/** Signature demo run — pre-computed prompt diff and replay fix. */
export const SIGNATURE_RUN_ID = 'run_8f2a1c';

export function pickHeadline(findings: Finding[]): Finding | null {
  if (!findings.length) return null;
  const signature = findings.find(f => f.run_id === SIGNATURE_RUN_ID);
  if (signature) return signature;
  return [...findings].sort((a, b) => {
    const s = (SEVERITY_RANK[b.severity] || 0) - (SEVERITY_RANK[a.severity] || 0);
    if (s) return s;
    return new Date(b.started_at || 0).getTime() - new Date(a.started_at || 0).getTime();
  })[0];
}
