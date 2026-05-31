import type { AgentStep } from './types.js';

export interface TraceRibbonOptions {
  container: HTMLElement;
  steps: AgentStep[];
  onStepChange: (step: AgentStep) => void;
}

const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function mountTraceRibbon(opts: TraceRibbonOptions): void {
  const { container, steps, onStepChange } = opts;
  if (!steps.length) {
    container.innerHTML = '<div class="tw-ribbon-label">NO STEPS</div>';
    return;
  }

  const totalLatency = steps.reduce((s, st) => s + st.latency_ms, 0) || 1;
  const maxTokens = Math.max(...steps.map(st => st.tokens_in + st.tokens_out), 1);

  const ticksHtml = steps.map((step, i) => {
    const widthPct = Math.max((step.latency_ms / totalLatency) * 100, 2);
    const intensity = (step.tokens_in + step.tokens_out) / maxTokens;
    const opacity = 0.4 + intensity * 0.6;
    return `<div class="tw-ribbon-tick"
      data-step-index="${i}"
      data-status="${step.status}"
      style="width:${widthPct.toFixed(2)}%;opacity:${opacity.toFixed(2)}"
      title="${step.name} — ${step.latency_ms}ms"
      role="button"
      tabindex="0"
      aria-label="Step ${step.name}">
    </div>`;
  }).join('');

  container.innerHTML = `
    <div class="tw-ribbon-label">TRACE RIBBON — drag to scrub</div>
    <div class="tw-ribbon" role="slider" aria-valuemin="0" aria-valuemax="${steps.length - 1}" aria-valuenow="0">
      <div class="tw-ribbon-track">${ticksHtml}</div>
      <div class="tw-playhead" style="left:0%"></div>
    </div>
  `;

  const ribbon = container.querySelector('.tw-ribbon') as HTMLElement;
  const playhead = container.querySelector('.tw-playhead') as HTMLElement;
  let currentIndex = 0;

  function setActiveStep(index: number): void {
    if (index < 0 || index >= steps.length) return;
    currentIndex = index;

    // Move playhead to center of tick
    const ticks = ribbon.querySelectorAll('.tw-ribbon-tick');
    let offsetPct = 0;
    const track = ribbon.querySelector('.tw-ribbon-track') as HTMLElement;
    const trackWidth = track.offsetWidth || ribbon.offsetWidth;

    let accumulatedWidth = 0;
    ticks.forEach((tick, i) => {
      const w = (tick as HTMLElement).offsetWidth;
      if (i < index) accumulatedWidth += w;
      else if (i === index) {
        const center = accumulatedWidth + w / 2;
        offsetPct = (center / (trackWidth || 1)) * 100;
      }
    });

    if (REDUCED_MOTION) {
      playhead.style.left = `${offsetPct}%`;
    } else {
      playhead.style.transition = `left 150ms cubic-bezier(0.16,1,0.3,1)`;
      playhead.style.left = `${offsetPct}%`;
    }

    ribbon.setAttribute('aria-valuenow', index.toString());

    // Highlight active tick
    ticks.forEach((t, i) => {
      (t as HTMLElement).classList.toggle('tw-active', i === index);
    });

    onStepChange(steps[index]);
  }

  // Click on tick
  ribbon.querySelectorAll('.tw-ribbon-tick').forEach((tick, i) => {
    tick.addEventListener('click', (e) => {
      e.stopPropagation();
      setActiveStep(i);
    });
    tick.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') setActiveStep(i);
    });
  });

  // Drag scrub
  let isDragging = false;

  function getIndexFromX(clientX: number): number {
    const rect = ribbon.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.min(Math.round(fraction * (steps.length - 1)), steps.length - 1);
  }

  ribbon.addEventListener('mousedown', (e) => {
    isDragging = true;
    setActiveStep(getIndexFromX((e as MouseEvent).clientX));
  });

  window.addEventListener('mousemove', (e) => {
    if (isDragging) setActiveStep(getIndexFromX((e as MouseEvent).clientX));
  });

  window.addEventListener('mouseup', () => { isDragging = false; });

  ribbon.addEventListener('touchstart', (e) => {
    isDragging = true;
    setActiveStep(getIndexFromX((e as TouchEvent).touches[0].clientX));
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (isDragging) setActiveStep(getIndexFromX((e as TouchEvent).touches[0].clientX));
  }, { passive: true });

  window.addEventListener('touchend', () => { isDragging = false; });

  // Keyboard
  ribbon.addEventListener('keydown', (e) => {
    const ke = e as KeyboardEvent;
    if (ke.key === 'ArrowRight') { e.preventDefault(); setActiveStep(currentIndex + 1); }
    if (ke.key === 'ArrowLeft')  { e.preventDefault(); setActiveStep(currentIndex - 1); }
    if (ke.key === 'Home')       { e.preventDefault(); setActiveStep(0); }
    if (ke.key === 'End')        { e.preventDefault(); setActiveStep(steps.length - 1); }
  });

  // Initialize at step 0
  setActiveStep(0);
}

export function setRibbonStep(container: HTMLElement, index: number): void {
  const ticks = container.querySelectorAll('.tw-ribbon-tick');
  ticks[index]?.dispatchEvent(new MouseEvent('click'));
}
