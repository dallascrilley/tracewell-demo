import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  analyze, classifyFailure, findRootStep, diagnoseRun, PLAYBOOK,
} from '../functions/tracewell/analyze.js';

const here = dirname(fileURLToPath(import.meta.url));
const sampleTrace = readFileSync(join(here, '../public/data/sample-trace.json'), 'utf8');

test('classifyFailure prefers the declared failure_mode when valid', () => {
  const run = { failure_mode: 'tool_timeout', steps: [{ status: 'failed', error: 'context_length_exceeded' }] };
  assert.equal(classifyFailure(run, findRootStep(run)), 'tool_timeout');
});

test('classifyFailure infers the mode from the root step error when undeclared', () => {
  const overflow = { steps: [{ status: 'failed', error: 'context_length_exceeded: prompt is 14,214 tokens' }] };
  assert.equal(classifyFailure(overflow, findRootStep(overflow)), 'context_overflow');
  const timeout = { steps: [{ status: 'failed', error: 'tool_timeout: smtp_send did not return within 90000ms' }] };
  assert.equal(classifyFailure(timeout, findRootStep(timeout)), 'tool_timeout');
  const guardrail = { steps: [{ status: 'failed', error: 'output blocked by policy filter' }] };
  assert.equal(classifyFailure(guardrail, findRootStep(guardrail)), 'guardrail_reject');
});

test('classifyFailure falls back to agent_error for an unrecognized failure', () => {
  const run = { steps: [{ status: 'failed', error: 'kaboom 0x5f' }] };
  assert.equal(classifyFailure(run, findRootStep(run)), 'agent_error');
});

test('findRootStep returns the first failed step', () => {
  const run = { steps: [{ id: 'a', status: 'success' }, { id: 'b', status: 'failed' }, { id: 'c', status: 'failed' }] };
  assert.equal(findRootStep(run).id, 'b');
});

test('findRootStep returns the slowest step for a degraded run with no failure', () => {
  const run = { status: 'degraded', steps: [{ id: 'a', status: 'success', latency_ms: 100 }, { id: 'b', status: 'success', latency_ms: 9000 }] };
  assert.equal(findRootStep(run).id, 'b');
});

test('diagnoseRun returns null for a clean run and a finding for a failure', () => {
  assert.equal(diagnoseRun({ id: 'r1', status: 'success', steps: [] }), null);
  const f = diagnoseRun({ id: 'r2', agent_id: 'a', status: 'failed', failure_mode: 'context_overflow', steps: [{ id: 's1', name: 'review', status: 'failed', tokens_in: 14214, model_params: { max_tokens: 8192 } }] });
  assert.equal(f.severity, 'critical');
  assert.equal(f.type, 'context_overflow');
  assert.equal(f.root_step_name, 'review');
  assert.equal(f.fix, PLAYBOOK.context_overflow.fix);
  assert.match(f.description, /14,214 tokens in against a 8,192-token budget/);
});

test('analyze diagnoses every failed/degraded run in the sample trace', () => {
  const out = analyze(sampleTrace);
  assert.equal(out.source, 'uploaded');
  assert.equal(out.inputFormat, 'json-runs');
  assert.equal(out.stats.runs, 5);
  assert.equal(out.stats.failed, 3);
  assert.equal(out.stats.degraded, 1);
  assert.equal(out.stats.findings, 4); // 3 failed + 1 degraded; the 1 success yields none
  assert.equal(out.stats.critical, 3);
});

test('analyze rollup counts by status and groups clusters by agent + mode', () => {
  const out = analyze(sampleTrace);
  assert.deepEqual(out.rollup.by_mode, { context_overflow: 1, tool_timeout: 1, missing_input: 1, guardrail_reject: 1 });
  assert.equal(out.rollup.success, 1);
  assert.equal(out.clusters.length, 4);
});

test('headline is the most recent critical finding', () => {
  const out = analyze(sampleTrace);
  assert.equal(out.headline.severity, 'critical');
  assert.equal(out.headline.run_id, 'run_acme_88'); // 2026-05-28, the most recent critical
  assert.equal(out.headline.type, 'context_overflow');
});

test('analyze accepts a single run object, not only an array', () => {
  const single = JSON.stringify({ id: 'solo', agent_id: 'x', status: 'failed', steps: [{ id: 's', name: 'call', status: 'failed', error: 'tool_timeout: deadline exceeded' }] });
  const out = analyze(single);
  assert.equal(out.inputFormat, 'json-run');
  assert.equal(out.stats.findings, 1);
  assert.equal(out.findings[0].type, 'tool_timeout');
});

test('analyze normalizes a loose run (missing totals/ids) without throwing', () => {
  const loose = JSON.stringify([{ agent_id: 'y', steps: [{ name: 'a', status: 'failed', tokens_in: 10, error: 'missing required field' }] }]);
  const out = analyze(loose);
  assert.equal(out.runs[0].status, 'failed'); // inferred from the failed step
  assert.equal(out.runs[0].total_tokens_in, 10); // summed from steps
  assert.equal(out.findings[0].type, 'missing_input');
});

test('analyze rejects empty and malformed input', () => {
  assert.throws(() => analyze(''), /Paste or upload an agent-run trace/);
  assert.throws(() => analyze('{ not json'), /does not parse as JSON/);
  assert.throws(() => analyze('5'), /Unsupported JSON shape/);
  assert.throws(() => analyze('[]'), /No runs found/);
});
