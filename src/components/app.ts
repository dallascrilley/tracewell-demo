// Tracewell app entry — bundled by Astro/Vite
import type { AgentRun, AgentStep } from './types.js';
import { loadRuns } from './store.js';
import {
  fmtTokens, fmtLatency, fmtTimestamp, tokenClass,
  failureBadgeClass, statusLabel, stepStatusIcon
} from './format.js';
import {
  diagnoseRuns, buildRollup, buildClusters, pickHeadline,
  type Finding, type Rollup, type Cluster,
} from './diagnose.js';
import { diff_match_patch } from 'diff-match-patch';

// ─── Diff helper ────────────────────────────────────────────────────
const dmp = new diff_match_patch();

function renderDiffHtml(textA: string, textB: string): string {
  const diffs = dmp.diff_main(textA, textB);
  dmp.diff_cleanupSemantic(diffs);
  const lines: string[] = [];
  for (const [op, text] of diffs) {
    const parts = text.split('\n');
    for (const chunk of parts) {
      if (!chunk.trim()) continue;
      if (op === 0) {
        lines.push(`<div class="tw-diff-line tw-diff-equal"><span class="tw-diff-sign"> </span><span>${esc(chunk)}</span></div>`);
      } else if (op === 1) {
        lines.push(`<div class="tw-diff-line tw-diff-insert"><span class="tw-diff-sign">+</span><span>${esc(chunk)}</span></div>`);
      } else if (op === -1) {
        lines.push(`<div class="tw-diff-line tw-diff-delete"><span class="tw-diff-sign">−</span><span>${esc(chunk)}</span></div>`);
      }
    }
  }
  return lines.join('');
}

function buildCanonicalDiffHtml(): string {
  const v3 = `[COMPLIANCE POLICY — v3 — 410 tokens]
# Compliance Policy v3
## Data Handling
All contracts must include GDPR-compliant data handling clauses (Art. 13-14).
Verify DPA is attached or referenced in Exhibit A.
Maximum liability cap: 2x annual contract value.
Auto-renewal notice window: minimum 60 days.`;

  const v4 = `[COMPLIANCE POLICY — v4 — 4,400 tokens]
# Compliance Policy v4 — COMPREHENSIVE EDITION
## Data Handling (GDPR, CCPA, HIPAA Cross-Reference)
All contracts must include GDPR-compliant data handling clauses (Art. 13-14).
Verify DPA is attached or referenced in Exhibit A.
Maximum liability cap: 2x annual contract value.
Auto-renewal notice window: minimum 60 days.

### CCPA Addendum (Added 2026-05-27)
California Consumer Privacy Act compliance required for all customers with California operations.
Must include: right to deletion clauses, data portability provisions, opt-out mechanisms.
Reference: CCPA § 1798.100-1798.199 (full statutory text appended below)
[... 1,800 tokens of statutory CCPA text ...]

### HIPAA Safe Harbor Provisions (Added 2026-05-27)
For healthcare-adjacent customers, BAA must be executed prior to data processing.
PHI handling: minimum necessary standard, access logging, breach notification <60 days.
[... 900 tokens of HIPAA provisions ...]

### SOC 2 Type II Attestation Requirements
Annual audit required. Report must be less than 12 months old at time of contract execution.
[... 600 tokens of SOC 2 requirements ...]

### PCI-DSS Scope Determination
If payment card data transits through Customer systems...
[... 500 tokens of PCI requirements ...]`;

  return renderDiffHtml(v3, v4);
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Diagnosis state (derived from the loaded runs) ─────────────────
let allRuns: AgentRun[] = [];
let findings: Finding[] = [];
let clusters: Cluster[] = [];
let rollup: Rollup = { total: 0, failed: 0, degraded: 0, success: 0, by_mode: {} };
let activeCluster: Cluster | null = null;
let activeMode: string | null = null;
let selectedRunId: string | null = null;

/** Recompute findings / clusters / rollup from the current runs. */
function recomputeDiagnosis(): void {
  findings = diagnoseRuns(allRuns);
  clusters = buildClusters(allRuns);
  rollup = buildRollup(allRuns);
}

/** Most recent successful run for an agent before a timestamp, within the current set. */
function findLastSuccess(agentId: string, beforeTs: string): AgentRun | undefined {
  const before = new Date(beforeTs).getTime();
  return allRuns.find(r => r.agent_id === agentId && r.status === 'success' && new Date(r.started_at).getTime() < before);
}

// ─── Timeline ──────────────────────────────────────────────────────
function renderTimeline(runs: AgentRun[]): void {
  const list = document.querySelector('.tw-run-list') as HTMLElement;
  const countEl = document.querySelector('.tw-timeline-count');
  if (!list) return;
  if (countEl) countEl.textContent = `${runs.length} runs`;
  list.setAttribute('aria-busy', 'false');

  if (runs.length === 0) {
    list.innerHTML = '<p class="tw-timeline-empty">No runs match. The agents behaved.</p>';
    return;
  }

  list.innerHTML = runs.map((run, i) => {
    const totalTok = run.total_tokens_in + run.total_tokens_out;
    const shimmer = i === 0 ? ' tw-shimmer' : '';
    const sel = run.id === selectedRunId ? ' tw-selected' : '';
    const badge = run.failure_mode
      ? `<span class="tw-failure-badge ${failureBadgeClass(run.failure_mode as any)}">${run.failure_mode}</span>`
      : '';
    return `<div class="tw-run-row${shimmer}${sel}" data-run-id="${run.id}" role="button" tabindex="0">
      <div>
        <div class="tw-run-id tw-mono">${run.id}</div>
        <div class="tw-run-meta">${fmtTimestamp(run.started_at)}</div>
        ${badge}
      </div>
      <div class="tw-run-agent">${run.agent_id}</div>
      <div class="tw-run-status tw-status-${run.status}">
        <span class="tw-status-dot"></span>${statusLabel(run.status as any)}
      </div>
      <div class="tw-run-tokens ${tokenClass(totalTok)} tw-mono">${fmtTokens(totalTok)} tok</div>
      <div class="tw-run-latency tw-mono">${fmtLatency(run.total_latency_ms)}</div>
    </div>`;
  }).join('');

  list.querySelectorAll('.tw-run-row').forEach(row => {
    const handler = () => {
      const id = (row as HTMLElement).dataset.runId;
      const run = allRuns.find(r => r.id === id);
      if (run) selectRun(run);
    };
    row.addEventListener('click', handler);
    row.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') handler();
    });
  });
}

// ─── Sidebar agents (status derived from the loaded runs, not hardcoded) ──
function renderAgents(): void {
  const list = document.getElementById('tw-agent-list');
  if (!list) return;
  const order: string[] = [];
  const tally = new Map<string, { ok: number; degraded: number; failed: number }>();
  for (const run of allRuns) {
    if (!tally.has(run.agent_id)) { tally.set(run.agent_id, { ok: 0, degraded: 0, failed: 0 }); order.push(run.agent_id); }
    const t = tally.get(run.agent_id)!;
    if (run.status === 'failed') t.failed += 1;
    else if (run.status === 'degraded') t.degraded += 1;
    else t.ok += 1;
  }
  list.innerHTML = order.map(id => {
    const t = tally.get(id)!;
    // Worst status present sets the dot: any failure → red, else any degraded → amber, else green.
    const color = t.failed > 0 ? '--tw-failure' : t.degraded > 0 ? '--tw-degraded' : '--tw-success';
    const title = `${t.ok} ok · ${t.degraded} degraded · ${t.failed} failed`;
    return `<div style="font-size:11px;color:var(--tw-text-muted);padding:2px 8px;line-height:1.5;" title="${esc(title)}">
                <span style="color:var(${color})">●</span> ${esc(id)}
              </div>`;
  }).join('');
}

// ─── Sidebar clusters ──────────────────────────────────────────────
function renderClusters(): void {
  const list = document.querySelector('.tw-cluster-list') as HTMLElement;
  if (!list) return;
  if (!clusters.length) {
    list.innerHTML = '<div class="tw-cluster-empty" style="font-size:11px;color:var(--tw-text-faint);padding:2px 8px">No failures — every run is clean.</div>';
    return;
  }
  list.innerHTML = clusters.map(c => `
    <div class="tw-cluster${activeCluster?.id === c.id ? ' tw-active' : ''}" data-cluster-id="${c.id}" role="button" tabindex="0">
      <div class="tw-cluster-id">${c.failure_mode}</div>
      <div class="tw-cluster-desc">${c.agent_id}</div>
      <span class="tw-cluster-count${c.failure_mode === 'tool_timeout' ? ' tw-warning' : ''}">${c.run_ids.length} run${c.run_ids.length === 1 ? '' : 's'}</span>
    </div>`).join('');

  list.querySelectorAll('.tw-cluster').forEach(el => {
    const activate = () => {
      const id = (el as HTMLElement).dataset.clusterId;
      const c = clusters.find(x => x.id === id);
      if (!c) return;
      if (activeCluster?.id === id) {
        clearFilter();
      } else {
        activeCluster = c;
        activeMode = null;
        renderClusters();
        renderTimeline(allRuns.filter(r => c.run_ids.includes(r.id)));
        showFilterChip(`${c.agent_id} · ${c.failure_mode}`);
      }
    };
    el.addEventListener('click', activate);
    el.addEventListener('keydown', (e) => {
      const key = (e as KeyboardEvent).key;
      if (key === 'Enter' || key === ' ') {
        e.preventDefault();
        activate();
      }
    });
  });
}

/** Filter the timeline to every run diagnosed with a given failure mode. */
function filterByMode(mode: string): void {
  if (activeMode === mode) { clearFilter(); return; }
  activeCluster = null;
  activeMode = mode;
  syncModeChipPressed();
  renderClusters();
  const ids = new Set(clusters.filter(c => c.failure_mode === mode).flatMap(c => c.run_ids));
  renderTimeline(allRuns.filter(r => ids.has(r.id)));
  showFilterChip(mode);
}

function showFilterChip(label: string): void {
  clearFilterUI();
  const header = document.querySelector('.tw-timeline-header');
  header?.insertAdjacentHTML('beforeend',
    `<div class="tw-filter-active">
      <span>${label}</span>
      <button class="tw-clear-filter" aria-label="Clear filter">×</button>
    </div>`);
  document.querySelector('.tw-clear-filter')?.addEventListener('click', clearFilter);
}

function syncModeChipPressed(): void {
  document.querySelectorAll<HTMLButtonElement>('.tw-rollup-mode').forEach(btn => {
    btn.setAttribute('aria-pressed', String(btn.dataset.mode === activeMode));
  });
}

function clearFilter(): void {
  activeCluster = null;
  activeMode = null;
  syncModeChipPressed();
  clearFilterUI();
  renderTimeline(allRuns);
  renderClusters();
}

function clearFilterUI(): void {
  document.querySelector('.tw-filter-active')?.remove();
}

// ─── Hero (headline finding) + run-health rollup ───────────────────
function renderHero(): void {
  const card = document.getElementById('tw-hero-card');
  if (!card) return;
  const headline = pickHeadline(findings);
  if (!headline) {
    card.className = 'tw-hero-card tw-sev-clear';
    card.innerHTML = `
      <span class="tw-hero-eyebrow"><span class="tw-dot"></span>All clear</span>
      <h1 class="tw-hero-title">No failed runs in this trace.</h1>
      <p class="tw-hero-desc">Every run completed without a diagnosed failure. Paste a trace with failures to see the black box light up.</p>`;
    return;
  }
  const sevClass = headline.severity === 'warning' ? ' tw-sev-warning' : '';
  const sevLabel = headline.severity === 'warning' ? 'Degraded run' : 'Run failed in production';
  card.className = `tw-hero-card${sevClass}`;
  card.innerHTML = `
    <span class="tw-hero-eyebrow"><span class="tw-dot"></span>${sevLabel} · ${esc(headline.type.replace(/_/g, ' '))}</span>
    <h1 class="tw-hero-title">${esc(headline.title)}</h1>
    <p class="tw-hero-desc">${esc(headline.description)}</p>
    <div class="tw-hero-meta">
      <span class="tw-hero-chip">agent <strong>${esc(headline.agent_id)}</strong></span>
      ${headline.root_step_name ? `<span class="tw-hero-chip">root cause <strong>${esc(headline.root_step_name)}</strong></span>` : ''}
      <span class="tw-hero-chip">owner <strong>${esc(headline.system_owner)}</strong></span>
    </div>
    <div class="tw-hero-fix"><strong>The fix —</strong> ${esc(headline.fix)}</div>
    <button class="tw-hero-cta" id="tw-hero-cta" data-run-id="${esc(headline.run_id)}">Open the black box →</button>`;

  document.getElementById('tw-hero-cta')?.addEventListener('click', () => {
    const run = allRuns.find(r => r.id === headline.run_id);
    if (!run) return;
    selectRun(run);
    document.getElementById('tw-layout')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

const MODE_LABELS: Record<string, string> = {
  context_overflow: 'context overflow', tool_timeout: 'tool timeout',
  guardrail_reject: 'guardrail reject', hallucination_detected: 'hallucination',
  missing_input: 'missing input', agent_error: 'agent error',
};

function renderRollup(): void {
  const el = document.getElementById('tw-hero-rollup');
  if (!el) return;
  const { total, failed, degraded, success } = rollup;
  const pct = (n: number) => total ? (n / total) * 100 : 0;
  const modeChips = Object.entries(rollup.by_mode)
    .sort((a, b) => b[1] - a[1])
    .map(([mode, n]) => `<button class="tw-rollup-mode" data-mode="${esc(mode)}" aria-pressed="${activeMode === mode}"><strong>${n}</strong> ${esc(MODE_LABELS[mode] || mode)}</button>`)
    .join('');
  el.innerHTML = `
    <div class="tw-rollup-heading">Run health · last ${total}</div>
    <div class="tw-rollup-stats">
      <div class="tw-rollup-stat"><span class="tw-rollup-num tw-n-fail">${failed}</span><span class="tw-rollup-label">Failed</span></div>
      <div class="tw-rollup-stat"><span class="tw-rollup-num tw-n-degraded">${degraded}</span><span class="tw-rollup-label">Degraded</span></div>
      <div class="tw-rollup-stat"><span class="tw-rollup-num tw-n-success">${success}</span><span class="tw-rollup-label">Clean</span></div>
    </div>
    <div class="tw-rollup-bar" role="img" aria-label="${failed} failed, ${degraded} degraded, ${success} clean of ${total} runs">
      <span class="tw-b-fail" style="width:${pct(failed)}%"></span>
      <span class="tw-b-degraded" style="width:${pct(degraded)}%"></span>
      <span class="tw-b-success" style="width:${pct(success)}%"></span>
    </div>
    ${modeChips ? `<div class="tw-rollup-modes">${modeChips}</div>` : ''}`;

  el.querySelectorAll('.tw-rollup-mode').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = (btn as HTMLElement).dataset.mode;
      if (mode) { filterByMode(mode); document.getElementById('tw-layout')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    });
  });
}

// ─── Run selection ─────────────────────────────────────────────────
function selectRun(run: AgentRun): void {
  selectedRunId = run.id;
  document.querySelectorAll('.tw-run-row').forEach(r => {
    (r as HTMLElement).classList.toggle('tw-selected', (r as HTMLElement).dataset.runId === run.id);
  });
  openInspector(run);
}

// ─── Inspector ─────────────────────────────────────────────────────
let currentRun: AgentRun | null = null;
let currentStepIndex = 0;

function openInspector(run: AgentRun): void {
  currentRun = run;
  const inspector = document.getElementById('tw-inspector') as HTMLElement;
  const layout = document.getElementById('tw-layout') as HTMLElement;
  inspector.classList.remove('tw-hidden');
  layout.classList.add('tw-inspector-open');

  // Header
  (inspector.querySelector('.tw-inspector-run-id') as HTMLElement).textContent = run.id;
  (inspector.querySelector('.tw-inspector-agent') as HTMLElement).textContent =
    `${run.agent_id} · ${fmtTimestamp(run.started_at)} · ${statusLabel(run.status as any)}`;

  // Ribbon
  const ribbonWrap = inspector.querySelector('.tw-ribbon-wrap') as HTMLElement;
  renderRibbon(ribbonWrap, run);

  // Tree — auto-focus first failing step
  const failIdx = run.steps.findIndex(s => s.status === 'failed');
  currentStepIndex = failIdx >= 0 ? failIdx : 0;
  const treePanel = inspector.querySelector('.tw-tree-panel') as HTMLElement;
  renderTree(treePanel, run);

  // Initial detail
  renderDetail(run, run.steps[currentStepIndex], currentStepIndex);
}

// ─── Trace ribbon ──────────────────────────────────────────────────
const REDUCED_MOTION = typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function renderRibbon(container: HTMLElement, run: AgentRun): void {
  const steps = run.steps;
  if (!steps.length) { container.innerHTML = '<div class="tw-ribbon-label">NO STEPS</div>'; return; }

  const totalLat = steps.reduce((s, st) => s + st.latency_ms, 0) || 1;
  const maxTok = Math.max(...steps.map(st => st.tokens_in + st.tokens_out), 1);

  const ticks = steps.map((st, i) => {
    const w = Math.max((st.latency_ms / totalLat) * 100, 2).toFixed(2);
    const op = (0.4 + ((st.tokens_in + st.tokens_out) / maxTok) * 0.6).toFixed(2);
    return `<div class="tw-ribbon-tick" data-step-index="${i}" data-status="${st.status}"
      style="width:${w}%;opacity:${op}" title="${st.name} · ${st.latency_ms}ms"
      role="button" tabindex="-1" aria-label="${st.name}"></div>`;
  }).join('');

  container.innerHTML = `
    <div class="tw-ribbon-label">TRACE RIBBON — drag or click to inspect step</div>
    <div class="tw-ribbon" id="tw-ribbon" role="slider" aria-valuemin="0" aria-valuemax="${steps.length - 1}" aria-valuenow="${currentStepIndex}">
      <div class="tw-ribbon-track">${ticks}</div>
      <div class="tw-playhead" id="tw-playhead"></div>
    </div>`;

  // Wire ribbon interactions
  const ribbon = container.querySelector('#tw-ribbon') as HTMLElement;
  const playhead = container.querySelector('#tw-playhead') as HTMLElement;

  function setStep(idx: number): void {
    if (!currentRun || idx < 0 || idx >= currentRun.steps.length) return;
    currentStepIndex = idx;
    ribbon.setAttribute('aria-valuenow', String(idx));

    // Position playhead
    const trackEl = ribbon.querySelector('.tw-ribbon-track') as HTMLElement;
    const tickEls = Array.from(ribbon.querySelectorAll('.tw-ribbon-tick')) as HTMLElement[];
    const trackW = trackEl.offsetWidth || ribbon.offsetWidth || 1;
    let acc = 0;
    tickEls.forEach((t, i) => { if (i < idx) acc += t.offsetWidth; });
    const center = acc + (tickEls[idx]?.offsetWidth ?? 0) / 2;
    const pct = (center / trackW) * 100;
    if (!REDUCED_MOTION) playhead.style.transition = 'left 150ms cubic-bezier(0.16,1,0.3,1)';
    playhead.style.left = `${pct}%`;

    tickEls.forEach((t, i) => t.classList.toggle('tw-active', i === idx));
    selectTreeNode(idx);
    renderDetail(currentRun, currentRun.steps[idx], idx);
  }

  // Tick clicks
  ribbon.querySelectorAll('.tw-ribbon-tick').forEach((t, i) => {
    t.addEventListener('click', (e) => { e.stopPropagation(); setStep(i); });
  });

  // Drag
  let dragging = false;
  function xToIdx(clientX: number): number {
    const rect = ribbon.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.min(Math.round(frac * (steps.length - 1)), steps.length - 1);
  }
  ribbon.addEventListener('mousedown', e => { dragging = true; setStep(xToIdx((e as MouseEvent).clientX)); });
  window.addEventListener('mousemove', e => { if (dragging) setStep(xToIdx((e as MouseEvent).clientX)); });
  window.addEventListener('mouseup', () => { dragging = false; });
  ribbon.addEventListener('touchstart', e => { dragging = true; setStep(xToIdx((e as TouchEvent).touches[0].clientX)); }, { passive: true });
  window.addEventListener('touchmove', e => { if (dragging) setStep(xToIdx((e as TouchEvent).touches[0].clientX)); }, { passive: true });
  window.addEventListener('touchend', () => { dragging = false; });
  ribbon.addEventListener('keydown', e => {
    const k = (e as KeyboardEvent).key;
    if (k === 'ArrowRight') { e.preventDefault(); setStep(currentStepIndex + 1); }
    if (k === 'ArrowLeft')  { e.preventDefault(); setStep(currentStepIndex - 1); }
    if (k === 'Home')        { e.preventDefault(); setStep(0); }
    if (k === 'End')         { e.preventDefault(); setStep(steps.length - 1); }
  });

  // Initialize playhead position
  setTimeout(() => setStep(currentStepIndex), 0);
}

// ─── Tool call tree ────────────────────────────────────────────────
function renderTree(container: HTMLElement, run: AgentRun): void {
  container.innerHTML = buildTreeHtml(run.steps, null, 0);
  container.querySelectorAll('.tw-tree-node').forEach((node, i) => {
    node.addEventListener('click', () => {
      if (!currentRun) return;
      currentStepIndex = i;
      selectTreeNode(i);
      renderDetail(currentRun, currentRun.steps[i], i);
      // Sync ribbon
      syncRibbonToStep(i);
    });
  });
  selectTreeNode(currentStepIndex);
}

function selectTreeNode(idx: number): void {
  document.querySelectorAll('.tw-tree-node').forEach((n, i) => {
    (n as HTMLElement).classList.toggle('tw-selected', i === idx);
  });
}

function syncRibbonToStep(idx: number): void {
  const ticks = document.querySelectorAll('.tw-ribbon-tick');
  if (ticks[idx]) (ticks[idx] as HTMLElement).click();
}

function buildTreeHtml(steps: AgentStep[], parentId: string | null, depth: number): string {
  return steps
    .filter(s => s.parent_id === parentId)
    .map(step => {
      const idx = steps.indexOf(step);
      const totalTok = step.tokens_in + step.tokens_out;
      const indent = depth > 0
        ? Array.from({length: depth}).map(() => '<span class="tw-tree-indent" aria-hidden="true"></span>').join('')
        : '';
      const iconCls = step.status === 'success' ? 'tw-icon-success'
        : step.status === 'failed' ? 'tw-icon-failed' : 'tw-icon-skipped';
      const children = buildTreeHtml(steps, step.id, depth + 1);
      return `<div class="tw-tree-node" data-step-index="${idx}" data-status="${step.status}" role="treeitem" tabindex="0">
        <div class="tw-tree-node-head">
          ${indent}
          <span class="tw-tree-status-icon ${iconCls}" aria-hidden="true">${stepStatusIcon(step.status)}</span>
          <div>
            <div class="tw-tree-name">${step.name}</div>
            ${step.tool ? `<div class="tw-tree-tool">${step.tool}</div>` : ''}
            <div class="tw-tree-tokens">
              ${totalTok > 0 ? `${fmtTokens(step.tokens_in)} in · ${fmtTokens(step.tokens_out)} out · ` : ''}${fmtLatency(step.latency_ms)}
            </div>
          </div>
        </div>
      </div>${children}`;
    }).join('');
}

// ─── Detail panel ──────────────────────────────────────────────────
function renderDetail(run: AgentRun, step: AgentStep, idx: number): void {
  const detail = document.getElementById('tw-detail-panel') as HTMLElement;
  if (!detail) return;

  const totalTok = step.tokens_in + step.tokens_out;
  const tokCls = step.status === 'failed' ? 'tw-stat-fail'
    : step.status === 'success' ? 'tw-stat-ok' : '';
  const isCanonical = run.id === 'run_8f2a1c' && step.name === 'review_contract';
  const canDiff = run.status === 'failed' && step.status === 'failed' && !!step.prompt_snapshot;

  const errorHtml = step.error
    ? `<div class="tw-detail-error">${esc(step.error)}</div>` : '';

  const metaHtml = `
    <div class="tw-detail-stat">
      <span class="tw-detail-stat-label">TOKENS IN</span>
      <span class="tw-detail-stat-value tw-mono ${tokCls}">${fmtTokens(step.tokens_in)}</span>
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
      <span class="tw-detail-stat-label">TOTAL</span>
      <span class="tw-detail-stat-value tw-mono ${step.tokens_in > 8000 ? 'tw-stat-fail' : ''}">${fmtTokens(totalTok)}</span>
    </div>` : ''}`;

  const promptHtml = step.prompt_snapshot
    ? `<div class="tw-prompt-box">${esc(step.prompt_snapshot)}</div>
       ${step.model_params ? `<div class="tw-prompt-params">
         <span class="tw-param">model: <strong>${esc(step.model ?? 'n/a')}</strong></span>
         <span class="tw-param">temperature: <strong>${step.model_params.temperature}</strong></span>
         <span class="tw-param">max_tokens: <strong>${step.model_params.max_tokens.toLocaleString()}</strong></span>
       </div>` : ''}
       ${canDiff ? `<button class="tw-compare-btn" id="tw-compare-btn">Compare to the last run that worked →</button>
       <div id="tw-diff-container" style="display:none;margin-top:12px"></div>` : ''}`
    : '<p class="tw-detail-empty">No prompt — tool step (no model call).</p>';

  const outText = step.output_snapshot ?? '';
  const outputHtml = outText
    ? (outText.length > 1000
      ? `<div class="tw-output-box" id="tw-out-short">${esc(outText.slice(0,1000))}…</div>
         <button class="tw-show-full-btn" id="tw-show-full">Show full output ↓</button>
         <div id="tw-out-full" style="display:none"><div class="tw-output-box">${esc(outText)}</div></div>`
      : `<div class="tw-output-box">${esc(outText)}</div>`)
    : `<p class="tw-detail-empty">${step.error ? 'Step failed — no output.' : 'No output recorded.'}</p>`;

  const prePrompt = (step.prompt_snapshot ?? step.output_snapshot ?? '').slice(0, 400);
  const fixBtn = isCanonical
    ? `<button class="tw-replay-btn tw-replay-btn-fix" id="tw-replay-fix">Replay without the v4 block →</button>` : '';
  const replayHtml = `
    <div class="tw-replay-notice">
      <span class="tw-replay-notice-icon">SYN</span>
      <span>Replay is synthetic — edits route to a recorded response fixture, not a live model.</span>
    </div>
    <textarea class="tw-replay-textarea" id="tw-replay-input" rows="5">${esc(prePrompt)}</textarea>
    <div class="tw-replay-actions">
      <button class="tw-replay-btn" id="tw-replay-run">Edit &amp; replay (synthetic)</button>
      ${fixBtn}
    </div>
    <div id="tw-replay-output" style="display:none" class="tw-replay-output"></div>`;

  detail.innerHTML = `
    <div class="tw-detail-header">
      <div>
        <div class="tw-detail-step-name">${step.name}${step.tool ? ` · ${step.tool}` : ''}</div>
        <div class="tw-detail-meta">${metaHtml}</div>
        ${errorHtml}
      </div>
    </div>
    <div class="tw-tabs" role="tablist">
      <button class="tw-tab tw-active" data-tab="prompt" role="tab" aria-selected="true">Prompt snapshot</button>
      <button class="tw-tab" data-tab="output" role="tab" aria-selected="false">Output</button>
      <button class="tw-tab" data-tab="replay" role="tab" aria-selected="false">Replay (synthetic)</button>
    </div>
    <div class="tw-tab-content tw-active" data-tab-content="prompt">${promptHtml}</div>
    <div class="tw-tab-content" data-tab-content="output">${outputHtml}</div>
    <div class="tw-tab-content" data-tab-content="replay">${replayHtml}</div>`;

  wireDetail(detail, run, step);
}

function wireDetail(detail: HTMLElement, run: AgentRun, step: AgentStep): void {
  // Tabs
  detail.querySelectorAll('.tw-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const t = (tab as HTMLElement).dataset.tab;
      detail.querySelectorAll('.tw-tab').forEach(x => { x.classList.remove('tw-active'); (x as HTMLElement).setAttribute('aria-selected','false'); });
      detail.querySelectorAll('.tw-tab-content').forEach(x => x.classList.remove('tw-active'));
      tab.classList.add('tw-active'); (tab as HTMLElement).setAttribute('aria-selected','true');
      detail.querySelector(`[data-tab-content="${t}"]`)?.classList.add('tw-active');
    });
  });

  // Show full
  detail.querySelector('#tw-show-full')?.addEventListener('click', (e) => {
    const btn = e.target as HTMLElement;
    (detail.querySelector('#tw-out-full') as HTMLElement).style.display = 'block';
    (detail.querySelector('#tw-out-short') as HTMLElement).style.display = 'none';
    btn.style.display = 'none';
  });

  // Compare diff
  detail.querySelector('#tw-compare-btn')?.addEventListener('click', () => {
    const diffContainer = detail.querySelector('#tw-diff-container') as HTMLElement;
    if (diffContainer.style.display !== 'none') { diffContainer.style.display = 'none'; return; }
    diffContainer.style.display = 'block';

    if (run.id === 'run_8f2a1c' && step.name === 'review_contract') {
      diffContainer.innerHTML = `
        <div class="tw-diff-wrap">
          <div class="tw-diff-header">
            <div class="tw-diff-col-label tw-diff-a">run_7c4e9b · Mon 2026-05-26 · 9,824 tok · SUCCESS</div>
            <div class="tw-diff-col-label">run_8f2a1c · Wed 2026-05-28 03:14 · 14,214 tok · FAILED</div>
          </div>
          <div class="tw-diff-body">${buildCanonicalDiffHtml()}</div>
          <div class="tw-diff-annotation"><strong>+4,390 tokens</strong> added at step inject_context. Source: compliance_policy_v3 → v4 on 2026-05-27. <strong>This is the regression.</strong></div>
        </div>`;
      return;
    }

    const lastSuccess = findLastSuccess(run.agent_id, run.started_at);
    if (!lastSuccess) {
      diffContainer.innerHTML = '<p class="tw-detail-empty">No previous success run found to diff against.</p>';
      return;
    }
    const successStep = lastSuccess.steps.find(s => s.name === step.name);
    if (!successStep?.prompt_snapshot || !step.prompt_snapshot) {
      diffContainer.innerHTML = '<p class="tw-detail-empty">Prompt snapshots unavailable for diff.</p>';
      return;
    }
    const html = renderDiffHtml(successStep.prompt_snapshot, step.prompt_snapshot);
    diffContainer.innerHTML = `
      <div class="tw-diff-wrap">
        <div class="tw-diff-header">
          <div class="tw-diff-col-label tw-diff-a">${lastSuccess.id} · last success</div>
          <div class="tw-diff-col-label">${run.id} · this run</div>
        </div>
        <div class="tw-diff-body">${html}</div>
      </div>`;
  });

  // Replay
  detail.querySelector('#tw-replay-run')?.addEventListener('click', async () => {
    const out = detail.querySelector('#tw-replay-output') as HTMLElement;
    out.style.display = 'block';
    out.className = 'tw-replay-output';
    out.textContent = 'Running synthetic replay…';
    await new Promise(r => setTimeout(r, 600));
    try {
      const fixture = await fetch('/data/runs-replay-fixture.json').then(r => r.json());
      const agentFix = fixture[run.agent_id] as Record<string, {output:string|null;error:string|null}>;
      const key = Object.keys(agentFix)[0];
      const res = agentFix[key];
      if (res.error) {
        out.className = 'tw-replay-output tw-replay-error';
        out.textContent = res.error;
      } else {
        out.className = 'tw-replay-output tw-replay-success';
        out.textContent = res.output ?? 'No fixture output.';
      }
    } catch {
      out.className = 'tw-replay-output tw-replay-error';
      out.textContent = 'Fixture load failed.';
    }
  });

  detail.querySelector('#tw-replay-fix')?.addEventListener('click', async () => {
    const out = detail.querySelector('#tw-replay-output') as HTMLElement;
    out.style.display = 'block';
    out.className = 'tw-replay-output';
    out.textContent = 'Replaying without v4 injection…';
    await new Promise(r => setTimeout(r, 800));
    try {
      const fixture = await fetch('/data/runs-replay-fixture.json').then(r => r.json());
      const fixed = fixture['contract-review-agent']['review_contract_v3_fixed'] as {output:string;tokens_in:number};
      out.className = 'tw-replay-output tw-replay-success';
      out.textContent = `✓ REPLAY SUCCESS — ${fixed.tokens_in?.toLocaleString() ?? '9,824'} tokens (under 8,192 limit)\n\n${fixed.output}`;
      // Flip failing node green
      const failNode = document.querySelector('.tw-tree-node[data-status="failed"]') as HTMLElement;
      if (failNode) {
        failNode.dataset.status = 'success-replay';
        const icon = failNode.querySelector('.tw-tree-status-icon');
        if (icon) { icon.className = 'tw-tree-status-icon tw-icon-success'; icon.textContent = '✓'; }
      }
    } catch {
      out.className = 'tw-replay-output tw-replay-error';
      out.textContent = 'Fixture load failed.';
    }
  });
}

// ─── Import (real backend: POST /tracewell/analyze) ─────────────────
function setModeBadge(label: string): void {
  const badge = document.getElementById('tw-mode-badge');
  if (badge) badge.textContent = label;
}

/** Swap in a new run set (uploaded or default) and re-render every view. */
function setRuns(runs: AgentRun[]): void {
  allRuns = runs.slice().sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
  activeCluster = null;
  activeMode = null;
  selectedRunId = null;
  clearFilterUI();
  recomputeDiagnosis();
  renderHero();
  renderRollup();
  renderClusters();
  renderAgents();
  renderTimeline(allRuns);
}

async function runImport(raw: string, name: string): Promise<void> {
  const status = document.getElementById('tw-import-status');
  if (status) { status.textContent = 'Analyzing…'; status.className = 'tw-import-status'; }
  try {
    const res = await fetch('/tracewell/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ raw, name }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || `Server returned ${res.status}`);
    setRuns(data.runs as AgentRun[]);
    setModeBadge(`your trace · ${data.stats.findings} finding${data.stats.findings === 1 ? '' : 's'}`);
    if (status) {
      status.className = 'tw-import-status tw-import-status--ok';
      status.textContent = `Diagnosed ${name}: ${data.stats.findings} finding${data.stats.findings === 1 ? '' : 's'} across ${data.stats.runs} run${data.stats.runs === 1 ? '' : 's'} (${data.stats.critical} critical).`;
    }
    // Rewrite the synthetic banner to the honest uploaded-trace boundary.
    const banner = document.getElementById('tw-banner');
    if (banner) {
      banner.hidden = false;
      banner.classList.add('tw-banner--live');
      const icon = banner.querySelector('.tw-banner-icon');
      const text = banner.querySelector('.tw-banner-text');
      if (icon) icon.textContent = 'LIVE';
      if (text) text.innerHTML = `<strong>Your trace — ${data.stats.runs} run${data.stats.runs === 1 ? '' : 's'} diagnosed server-side.</strong> ` +
        `These findings were computed from the trace you provided (${esc(name)}), not synthetic data. ` +
        `Tracewell analyzed a recorded export — not a live agent — and stored nothing.`;
      document.getElementById('tw-layout')?.classList.add('tw-banner-visible');
    }
    document.getElementById('tw-import-panel')?.classList.add('tw-hidden');
    document.getElementById('tw-import-toggle')?.setAttribute('aria-expanded', 'false');
  } catch (err) {
    console.error('[Tracewell] Import failed:', err);
    if (status) {
      status.className = 'tw-import-status tw-import-status--err';
      status.textContent = err instanceof Error ? err.message : 'Import failed.';
    }
  }
}

function initImport(): void {
  const toggle = document.getElementById('tw-import-toggle');
  const panel = document.getElementById('tw-import-panel');
  const fileInput = document.getElementById('tw-import-file') as HTMLInputElement | null;
  const textarea = document.getElementById('tw-import-text') as HTMLTextAreaElement | null;
  const analyzeBtn = document.getElementById('tw-import-analyze');
  const sampleBtn = document.getElementById('tw-import-sample');

  toggle?.addEventListener('click', () => {
    const hidden = panel?.classList.toggle('tw-hidden');
    toggle.setAttribute('aria-expanded', String(!hidden));
  });

  fileInput?.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { if (textarea) textarea.value = String(reader.result || ''); runImport(textarea?.value || '', file.name); };
    reader.readAsText(file);
  });

  analyzeBtn?.addEventListener('click', () => {
    const raw = textarea?.value?.trim();
    if (!raw) {
      const s = document.getElementById('tw-import-status');
      if (s) { s.className = 'tw-import-status tw-import-status--err'; s.textContent = 'Paste trace JSON or choose a file first.'; }
      return;
    }
    runImport(raw, 'pasted-trace.json');
  });

  sampleBtn?.addEventListener('click', async () => {
    try {
      const text = await fetch('/data/sample-trace.json').then(r => r.text());
      if (textarea) textarea.value = text;
      runImport(text, 'sample-trace.json');
    } catch {
      const s = document.getElementById('tw-import-status');
      if (s) { s.className = 'tw-import-status tw-import-status--err'; s.textContent = 'Could not load sample.'; }
    }
  });
}

// ─── Boot ───────────────────────────────────────────────────────────
async function boot(): Promise<void> {
  // Banner dismiss
  const banner = document.getElementById('tw-banner') as HTMLElement;
  const dismissed = sessionStorage.getItem('tw-banner-dismissed');
  if (dismissed) {
    banner.hidden = true;
  } else {
    document.getElementById('tw-layout')?.classList.add('tw-banner-visible');
    document.getElementById('tw-banner-dismiss')?.addEventListener('click', () => {
      banner.hidden = true;
      sessionStorage.setItem('tw-banner-dismissed', '1');
      document.getElementById('tw-layout')?.classList.remove('tw-banner-visible');
    });
  }

  // About toggle
  const aboutToggle = document.getElementById('tw-about-toggle');
  const aboutSection = document.getElementById('tw-about');
  aboutToggle?.addEventListener('click', () => {
    const open = aboutSection?.classList.toggle('tw-open');
    aboutToggle.setAttribute('aria-expanded', String(!!open));
  });

  // Inspector close
  document.querySelector('.tw-inspector-close')?.addEventListener('click', () => {
    document.getElementById('tw-inspector')?.classList.add('tw-hidden');
    document.getElementById('tw-layout')?.classList.remove('tw-inspector-open');
  });

  initImport();

  // Load synthetic runs, then diagnose + render hero / rollup / clusters / timeline.
  allRuns = await loadRuns();
  recomputeDiagnosis();
  renderHero();
  renderRollup();
  renderClusters();
  renderAgents();
  renderTimeline(allRuns);
}

boot().catch(console.error);
