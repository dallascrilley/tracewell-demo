import type { AgentRun, FailureMode } from './types.js';
import { fmtTokens, fmtLatency, fmtTimestamp, tokenClass, failureBadgeClass, statusLabel } from './format.js';

export interface FailureCluster {
  id: string;          // "FP-01"
  label: string;       // human description
  agentId: string;
  failureMode: FailureMode;
  stepName: string;
  runIds: string[];
}

// The two canonical clusters from the spec
export const FAILURE_CLUSTERS: FailureCluster[] = [
  {
    id: 'FP-01',
    label: '6 runs · contract-review-agent · context_overflow · inject_context',
    agentId: 'contract-review-agent',
    failureMode: 'context_overflow',
    stepName: 'inject_context',
    runIds: ['run_8f2a1c', 'run_2d9e4f', 'run_a1b5c2', 'run_e7f3d8', 'run_c4a8b1', 'run_9d2e6a'],
  },
  {
    id: 'FP-02',
    label: '3 runs · outreach-sequencer · tool_timeout · smtp_send',
    agentId: 'outreach-sequencer',
    failureMode: 'tool_timeout',
    stepName: 'smtp_send',
    runIds: ['run_b3c7e1', 'run_f8a2d4', 'run_5e9b3c'],
  },
];

let _activeCluster: FailureCluster | null = null;
let _allRuns: AgentRun[] = [];
let _onRunSelect: ((run: AgentRun) => void) | null = null;
let _selectedRunId: string | null = null;

export function mountTimelineView(opts: {
  container: HTMLElement;
  runs: AgentRun[];
  onRunSelect: (run: AgentRun) => void;
}): void {
  const { container, runs, onRunSelect } = opts;
  _allRuns = runs;
  _onRunSelect = onRunSelect;
  renderTimeline(container, runs);
  mountSidebarClusters(runs);
}

export function setSelectedRun(runId: string): void {
  _selectedRunId = runId;
  document.querySelectorAll('.tw-run-row').forEach(row => {
    const r = row as HTMLElement;
    r.classList.toggle('tw-selected', r.dataset.runId === runId);
  });
}

function renderTimeline(container: HTMLElement, runs: AgentRun[]): void {
  const listEl = container.querySelector('.tw-run-list');
  if (!listEl) return;

  const countEl = container.querySelector('.tw-timeline-count');
  if (countEl) countEl.textContent = `${runs.length} runs`;

  if (runs.length === 0) {
    listEl.innerHTML = '<p class="tw-timeline-empty">No runs match. The agents behaved.</p>';
    return;
  }

  listEl.innerHTML = runs.map((run, i) => buildRunRow(run, i === 0)).join('');

  listEl.querySelectorAll('.tw-run-row').forEach(row => {
    (row as HTMLElement).addEventListener('click', () => {
      const id = (row as HTMLElement).dataset.runId;
      const run = _allRuns.find(r => r.id === id);
      if (run && _onRunSelect) _onRunSelect(run);
    });
  });
}

function buildRunRow(run: AgentRun, isNewest: boolean): string {
  const totalTok = run.total_tokens_in + run.total_tokens_out;
  const shimmerClass = isNewest ? ' tw-shimmer' : '';
  const selectedClass = run.id === _selectedRunId ? ' tw-selected' : '';

  const badgeHtml = run.failure_mode
    ? `<span class="tw-failure-badge ${failureBadgeClass(run.failure_mode)}">${run.failure_mode}</span>`
    : '';

  return `<div class="tw-run-row${shimmerClass}${selectedClass}" data-run-id="${run.id}" role="button" tabindex="0" aria-label="Run ${run.id}">
    <div>
      <div class="tw-run-id">${run.id}</div>
      <div class="tw-run-meta">${fmtTimestamp(run.started_at)}</div>
      ${badgeHtml}
    </div>
    <div class="tw-run-agent">${run.agent_id}</div>
    <div class="tw-run-status tw-status-${run.status}">
      <span class="tw-status-dot"></span>${statusLabel(run.status)}
    </div>
    <div class="tw-run-tokens ${tokenClass(totalTok)} tw-mono">${fmtTokens(totalTok)} tok</div>
    <div class="tw-run-latency tw-mono">${fmtLatency(run.total_latency_ms)}</div>
  </div>`;
}

function mountSidebarClusters(runs: AgentRun[]): void {
  const clusterList = document.querySelector('.tw-cluster-list');
  if (!clusterList) return;

  clusterList.innerHTML = FAILURE_CLUSTERS.map(cluster => `
    <div class="tw-cluster" data-cluster-id="${cluster.id}" role="button" tabindex="0" aria-label="Filter by ${cluster.id}">
      <div class="tw-cluster-id">${cluster.id}</div>
      <div class="tw-cluster-desc">${cluster.failureMode} · ${cluster.stepName}</div>
      <span class="tw-cluster-count ${cluster.failureMode === 'tool_timeout' ? 'tw-warning' : ''}">${cluster.runIds.length} runs</span>
    </div>
  `).join('');

  clusterList.querySelectorAll('.tw-cluster').forEach(el => {
    el.addEventListener('click', () => {
      const id = (el as HTMLElement).dataset.clusterId;
      const cluster = FAILURE_CLUSTERS.find(c => c.id === id);
      if (!cluster) return;

      if (_activeCluster?.id === cluster.id) {
        clearFilter();
        return;
      }

      activateCluster(cluster);
    });
  });
}

function activateCluster(cluster: FailureCluster): void {
  _activeCluster = cluster;

  // Update cluster UI
  document.querySelectorAll('.tw-cluster').forEach(el => {
    const c = el as HTMLElement;
    c.classList.toggle('tw-active', c.dataset.clusterId === cluster.id);
  });

  // Filter timeline
  const filtered = _allRuns.filter(r => cluster.runIds.includes(r.id));
  const container = document.querySelector('.tw-timeline-wrap') as HTMLElement;
  if (container) renderTimeline(container, filtered);

  // Show filter indicator
  const headerEl = document.querySelector('.tw-timeline-header');
  let filterEl = headerEl?.querySelector('.tw-filter-active') as HTMLElement;
  if (!filterEl && headerEl) {
    headerEl.insertAdjacentHTML('beforeend',
      `<div class="tw-filter-active">
        <span>${cluster.id}</span>
        <button class="tw-clear-filter" aria-label="Clear filter">×</button>
      </div>`
    );
    filterEl = headerEl.querySelector('.tw-filter-active') as HTMLElement;
    filterEl?.querySelector('.tw-clear-filter')?.addEventListener('click', clearFilter);
  }
}

function clearFilter(): void {
  _activeCluster = null;
  document.querySelectorAll('.tw-cluster').forEach(el => el.classList.remove('tw-active'));

  const filterEl = document.querySelector('.tw-filter-active');
  filterEl?.remove();

  const container = document.querySelector('.tw-timeline-wrap') as HTMLElement;
  if (container) renderTimeline(container, _allRuns);
}
