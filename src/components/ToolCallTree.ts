import type { AgentStep } from './types.js';
import { fmtTokens, fmtLatency, stepStatusIcon } from './format.js';

export function renderToolCallTree(
  container: HTMLElement,
  steps: AgentStep[],
  onStepSelect: (step: AgentStep, index: number) => void,
  initialIndex = 0
): void {
  container.innerHTML = buildTree(steps, null, 0);

  let selectedIndex = initialIndex;

  const nodes = container.querySelectorAll('.tw-tree-node');
  nodes.forEach((node, i) => {
    node.addEventListener('click', () => {
      selectNode(i);
    });
    node.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') {
        e.preventDefault();
        selectNode(i);
      }
    });
  });

  function selectNode(index: number): void {
    selectedIndex = index;
    nodes.forEach((n, i) => {
      (n as HTMLElement).classList.toggle('tw-selected', i === index);
    });
    onStepSelect(steps[index], index);
  }

  // Auto-select initial node
  if (nodes.length > initialIndex) {
    (nodes[initialIndex] as HTMLElement).classList.add('tw-selected');
  }
}

export function selectTreeNode(container: HTMLElement, index: number): void {
  const nodes = container.querySelectorAll('.tw-tree-node');
  nodes.forEach((n, i) => {
    (n as HTMLElement).classList.toggle('tw-selected', i === index);
  });
}

function buildTree(steps: AgentStep[], parentId: string | null, depth: number): string {
  return steps
    .filter(s => s.parent_id === parentId)
    .map((step, _i) => {
      const idx = steps.indexOf(step);
      const totalTok = step.tokens_in + step.tokens_out;
      const indentHtml = depth > 0
        ? `<span class="tw-tree-indent" aria-hidden="true"></span>`.repeat(depth)
        : '';

      const iconClass = step.status === 'success' ? 'tw-icon-success'
        : step.status === 'failed' ? 'tw-icon-failed'
        : 'tw-icon-skipped';

      const children = buildTree(steps, step.id, depth + 1);

      return `<div class="tw-tree-node" data-step-id="${step.id}" data-status="${step.status}" data-step-index="${idx}" role="button" tabindex="0" aria-label="Step ${step.name}">
        <div class="tw-tree-node-head">
          ${indentHtml}
          <span class="tw-tree-status-icon ${iconClass}" aria-hidden="true">${stepStatusIcon(step.status)}</span>
          <div>
            <div class="tw-tree-name">${step.name}</div>
            ${step.tool ? `<div class="tw-tree-tool">${step.tool}</div>` : ''}
            ${totalTok > 0 ? `<div class="tw-tree-tokens">${fmtTokens(step.tokens_in)} in · ${fmtTokens(step.tokens_out)} out · ${fmtLatency(step.latency_ms)}</div>` : `<div class="tw-tree-tokens">${fmtLatency(step.latency_ms)}</div>`}
          </div>
        </div>
      </div>${children}`;
    }).join('');
}
