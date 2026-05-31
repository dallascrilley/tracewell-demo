import type { AgentRun, AgentStep } from './types.js';
import { fmtTokens, fmtLatency, fmtTimestamp, statusLabel } from './format.js';
import { renderToolCallTree, selectTreeNode } from './ToolCallTree.js';
import { mountTraceRibbon } from './TraceRibbon.js';
import { buildCanonicalDiff, renderDiff } from './PromptDiff.js';
import { getLastSuccess } from './store.js';

const REPLAY_FIXTURE_URL = '/data/runs-replay-fixture.json';

let _replayFixture: Record<string, unknown> | null = null;

async function getReplayFixture(): Promise<Record<string, unknown>> {
  if (_replayFixture) return _replayFixture;
  const r = await fetch(REPLAY_FIXTURE_URL);
  _replayFixture = await r.json();
  return _replayFixture!;
}

export function mountRunInspector(container: HTMLElement): void {
  // Inspector starts hidden; openRun() shows it
  const closeBtn = container.querySelector('.tw-inspector-close');
  closeBtn?.addEventListener('click', () => closeInspector(container));
}

export function openRun(container: HTMLElement, run: AgentRun): void {
  // Update layout
  document.querySelector('.tw-layout')?.classList.add('tw-inspector-open');
  container.classList.remove('tw-hidden');

  // Header
  const runIdEl = container.querySelector('.tw-inspector-run-id');
  const agentEl = container.querySelector('.tw-inspector-agent');
  if (runIdEl) runIdEl.textContent = run.id;
  if (agentEl) agentEl.textContent = `${run.agent_id} · ${fmtTimestamp(run.started_at)} · ${statusLabel(run.status)}`;

  // Ribbon
  const ribbonWrap = container.querySelector('.tw-ribbon-wrap') as HTMLElement;
  if (ribbonWrap) {
    mountTraceRibbon({
      container: ribbonWrap,
      steps: run.steps,
      onStepChange: (step) => {
        const idx = run.steps.indexOf(step);
        handleStepSelect(container, run, step, idx);
        // Sync tree
        const treePanel = container.querySelector('.tw-tree-panel') as HTMLElement;
        if (treePanel) selectTreeNode(treePanel, idx);
      },
    });
  }

  // Tree
  const treePanel = container.querySelector('.tw-tree-panel') as HTMLElement;
  if (treePanel) {
    // Auto-open to first failing step
    const failIdx = run.steps.findIndex(s => s.status === 'failed');
    const initIdx = failIdx >= 0 ? failIdx : 0;

    renderToolCallTree(treePanel, run.steps, (step, idx) => {
      handleStepSelect(container, run, step, idx);
      // Sync ribbon
      const ribbonContainer = container.querySelector('.tw-ribbon-wrap') as HTMLElement;
      if (ribbonContainer) {
        const ticks = ribbonContainer.querySelectorAll('.tw-ribbon-tick');
        ticks[idx]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      }
    }, initIdx);

    // Trigger initial detail render
    if (run.steps[initIdx]) {
      handleStepSelect(container, run, run.steps[initIdx], initIdx);
    }
  }
}

function closeInspector(container: HTMLElement): void {
  container.classList.add('tw-hidden');
  document.querySelector('.tw-layout')?.classList.remove('tw-inspector-open');
}

function handleStepSelect(
  container: HTMLElement,
  run: AgentRun,
  step: AgentStep,
  idx: number
): void {
  const detail = container.querySelector('.tw-detail-panel') as HTMLElement;
  if (!detail) return;
  detail.innerHTML = buildDetailHtml(run, step);
  wireDetailHandlers(detail, run, step);
}

function buildDetailHtml(run: AgentRun, step: AgentStep): string {
  const totalTok = step.tokens_in + step.tokens_out;

  const tokClass = step.status === 'failed' ? 'tw-stat-fail'
    : step.status === 'success' ? 'tw-stat-ok'
    : '';

  const errorHtml = step.error
    ? `<div class="tw-detail-error">${escHtml(step.error)}</div>`
    : '';

  const statHtml = `
    <div class="tw-detail-stat">
      <span class="tw-detail-stat-label">TOKENS IN</span>
      <span class="tw-detail-stat-value tw-mono ${tokClass}">${fmtTokens(step.tokens_in)}</span>
    </div>
    <div class="tw-detail-stat">
      <span class="tw-detail-stat-label">TOKENS OUT</span>
      <span class="tw-detail-stat-value tw-mono">${fmtTokens(step.tokens_out)}</span>
    </div>
    <div class="tw-detail-stat">
      <span class="tw-detail-stat-label">LATENCY</span>
      <span class="tw-detail-stat-value tw-mono">${fmtLatency(step.latency_ms)}</span>
    </div>
    ${totalTok > 0 ? `<div class="tw-detail-stat">
      <span class="tw-detail-stat-label">TOTAL TOK</span>
      <span class="tw-detail-stat-value tw-mono ${step.tokens_in > 8000 ? 'tw-stat-fail' : ''}">${fmtTokens(totalTok)}</span>
    </div>` : ''}
  `;

  // Prompt tab
  const hasPrompt = step.prompt_snapshot && step.prompt_snapshot.length > 0;
  const isCanonicalFailure = run.id === 'run_8f2a1c' && step.name === 'review_contract';
  const canDiff = run.status === 'failed' && step.status === 'failed' && hasPrompt;

  const promptHtml = hasPrompt
    ? `<div class="tw-prompt-box">${escHtml(step.prompt_snapshot!)}</div>
       ${step.model_params ? `<div class="tw-prompt-params">
         <span class="tw-param">model: <strong>${step.model ?? 'n/a'}</strong></span>
         <span class="tw-param">temperature: <strong>${step.model_params.temperature}</strong></span>
         <span class="tw-param">max_tokens: <strong>${step.model_params.max_tokens.toLocaleString()}</strong></span>
       </div>` : ''}
       ${canDiff ? `<button class="tw-compare-btn" data-action="compare">Compare to the last run that worked →</button>
       <div class="tw-diff-wrap" id="tw-diff-container" style="display:none"></div>` : ''}`
    : `<p class="tw-detail-empty">No prompt — tool step.</p>`;

  // Output tab
  const outputText = step.output_snapshot;
  const truncLen = 1000;
  const outputHtml = outputText
    ? outputText.length > truncLen
      ? `<div class="tw-output-box" id="tw-output-box">${escHtml(outputText.slice(0, truncLen))}…</div>
         <button class="tw-show-full-btn" data-action="show-full">Show full output ↓</button>
         <div style="display:none" id="tw-output-full"><div class="tw-output-box">${escHtml(outputText)}</div></div>`
      : `<div class="tw-output-box">${escHtml(outputText)}</div>`
    : `<p class="tw-detail-empty">${step.error ? 'Step failed — no output.' : 'No output recorded.'}</p>`;

  // Replay tab
  const replayHtml = buildReplayHtml(run, step, isCanonicalFailure);

  return `
    <div class="tw-detail-header">
      <div>
        <div class="tw-detail-step-name">${step.name}${step.tool ? ` · ${step.tool}` : ''}</div>
        <div class="tw-detail-meta">${statHtml}</div>
        ${errorHtml}
      </div>
    </div>
    <div class="tw-tabs">
      <button class="tw-tab tw-active" data-tab="prompt">Prompt snapshot</button>
      <button class="tw-tab" data-tab="output">Output</button>
      <button class="tw-tab" data-tab="replay">Replay (synthetic)</button>
    </div>
    <div class="tw-tab-content tw-active" data-tab-content="prompt">${promptHtml}</div>
    <div class="tw-tab-content" data-tab-content="output">${outputHtml}</div>
    <div class="tw-tab-content" data-tab-content="replay">${replayHtml}</div>
  `;
}

function buildReplayHtml(run: AgentRun, step: AgentStep, isCanonical: boolean): string {
  const replayLabel = `<div class="tw-replay-notice">
    <span class="tw-replay-notice-icon">SYN</span>
    <span>Replay is synthetic — edits route to a recorded response fixture, not a live model.</span>
  </div>`;

  const prefilledPrompt = step.prompt_snapshot ?? step.output_snapshot ?? '';

  const fixButton = isCanonical
    ? `<button class="tw-replay-btn tw-replay-btn-fix" data-action="replay-fix">Replay without the v4 block →</button>`
    : '';

  return `${replayLabel}
    <textarea class="tw-replay-textarea" id="tw-replay-input" rows="5">${escHtml(prefilledPrompt.slice(0, 500))}</textarea>
    <div class="tw-replay-actions">
      <button class="tw-replay-btn" data-action="replay-run">Edit &amp; replay (synthetic)</button>
      ${fixButton}
    </div>
    <div id="tw-replay-output" style="display:none"></div>`;
}

function wireDetailHandlers(detail: HTMLElement, run: AgentRun, step: AgentStep): void {
  // Tab switching
  detail.querySelectorAll('.tw-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const target = (tab as HTMLElement).dataset.tab;
      detail.querySelectorAll('.tw-tab').forEach(t => t.classList.remove('tw-active'));
      detail.querySelectorAll('.tw-tab-content').forEach(c => c.classList.remove('tw-active'));
      tab.classList.add('tw-active');
      detail.querySelector(`[data-tab-content="${target}"]`)?.classList.add('tw-active');
    });
  });

  // Show full output
  detail.querySelector('[data-action="show-full"]')?.addEventListener('click', (e) => {
    const btn = e.target as HTMLElement;
    const full = detail.querySelector('#tw-output-full') as HTMLElement;
    const truncated = detail.querySelector('#tw-output-box') as HTMLElement;
    if (full && truncated) {
      full.style.display = 'block';
      truncated.style.display = 'none';
      btn.style.display = 'none';
    }
  });

  // Compare diff
  detail.querySelector('[data-action="compare"]')?.addEventListener('click', () => {
    const diffContainer = detail.querySelector('#tw-diff-container') as HTMLElement;
    if (!diffContainer) return;

    const isVisible = diffContainer.style.display !== 'none';
    if (isVisible) {
      diffContainer.style.display = 'none';
      return;
    }

    diffContainer.style.display = 'block';

    // Use the canonical pre-built diff for the signature moment
    if (run.id === 'run_8f2a1c' && step.name === 'review_contract') {
      const { html, annotation } = buildCanonicalDiff();
      diffContainer.innerHTML = `
        <div class="tw-diff-header">
          <div class="tw-diff-col-label tw-diff-a">run_7c4e9b · Mon 2026-05-26 · 9,824 tok · SUCCESS</div>
          <div class="tw-diff-col-label">run_8f2a1c · Wed 2026-05-28 03:14 · 14,214 tok · FAILED</div>
        </div>
        <div class="tw-diff-body">${html}</div>
        <div class="tw-diff-annotation"><strong>+4,390 tokens</strong> added at step inject_context. Source: compliance_policy_v3 → v4 on 2026-05-27. <strong>This is the regression.</strong></div>
      `;
      return;
    }

    // Generic: diff against last success
    const lastSuccess = getLastSuccess(run.agent_id, run.started_at);
    if (!lastSuccess) {
      diffContainer.innerHTML = '<p class="tw-detail-empty">No previous success run found to diff against.</p>';
      return;
    }

    const successStep = lastSuccess.steps.find(s => s.name === step.name);
    if (!successStep?.prompt_snapshot || !step.prompt_snapshot) {
      diffContainer.innerHTML = '<p class="tw-detail-empty">Prompt snapshots unavailable for diff.</p>';
      return;
    }

    const { html } = renderDiff(successStep.prompt_snapshot, step.prompt_snapshot);
    diffContainer.innerHTML = `
      <div class="tw-diff-header">
        <div class="tw-diff-col-label tw-diff-a">${lastSuccess.id} · last success</div>
        <div class="tw-diff-col-label">${run.id} · this run</div>
      </div>
      <div class="tw-diff-body">${html}</div>
    `;
  });

  // Replay run
  detail.querySelector('[data-action="replay-run"]')?.addEventListener('click', async () => {
    const output = detail.querySelector('#tw-replay-output') as HTMLElement;
    if (!output) return;
    output.style.display = 'block';
    output.className = 'tw-replay-output';
    output.textContent = 'Running synthetic replay…';

    await simulateLatency(600);

    try {
      const fixture = await getReplayFixture();
      const agentFixture = (fixture as Record<string, Record<string, { output: string | null; error: string | null }>>)[run.agent_id];
      const stepKey = Object.keys(agentFixture || {})[0];
      const result = agentFixture?.[stepKey];

      if (result?.error) {
        output.className = 'tw-replay-output tw-replay-error';
        output.textContent = result.error;
      } else {
        output.className = 'tw-replay-output tw-replay-success';
        output.textContent = result?.output ?? 'No fixture output.';
      }
    } catch {
      output.className = 'tw-replay-output tw-replay-error';
      output.textContent = 'Fixture load failed.';
    }
  });

  // Replay fix (v3 strip)
  detail.querySelector('[data-action="replay-fix"]')?.addEventListener('click', async () => {
    const output = detail.querySelector('#tw-replay-output') as HTMLElement;
    if (!output) return;
    output.style.display = 'block';
    output.className = 'tw-replay-output';
    output.textContent = 'Replaying without v4 injection…';

    await simulateLatency(800);

    try {
      const fixture = await getReplayFixture();
      const fixed = (fixture as Record<string, Record<string, { output: string | null; tokens_in?: number }>>)
        ['contract-review-agent']['review_contract_v3_fixed'];
      output.className = 'tw-replay-output tw-replay-success';
      output.textContent = `✓ REPLAY SUCCESS — ${fixed.tokens_in?.toLocaleString() ?? '9,824'} tokens (under 8,192 limit)\n\n${fixed.output}`;

      // Flip the failing node to green in the tree
      const failNode = document.querySelector('.tw-tree-node[data-status="failed"]') as HTMLElement;
      if (failNode) {
        failNode.dataset.status = 'success-replay';
        const icon = failNode.querySelector('.tw-tree-status-icon');
        if (icon) {
          icon.className = 'tw-tree-status-icon tw-icon-success';
          icon.textContent = '✓';
        }
      }
    } catch {
      output.className = 'tw-replay-output tw-replay-error';
      output.textContent = 'Fixture load failed.';
    }
  });
}

function simulateLatency(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
