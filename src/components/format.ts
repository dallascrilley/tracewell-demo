import type { FailureMode, RunStatus } from './types.js';

export function fmtTokens(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return n.toString();
}

export function fmtLatency(ms: number): string {
  if (ms >= 60000) return (ms / 60000).toFixed(1) + 'm';
  if (ms >= 1000)  return (ms / 1000).toFixed(1) + 's';
  return ms + 'ms';
}

export function fmtTimestamp(iso: string): string {
  const d = new Date(iso);
  const mo = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  const da = d.getUTCDate().toString().padStart(2, '0');
  const hr = d.getUTCHours().toString().padStart(2, '0');
  const mi = d.getUTCMinutes().toString().padStart(2, '0');
  return `${mo} ${da} · ${hr}:${mi}`;
}

export function tokenClass(n: number): string {
  if (n >= 12000) return 'tw-tokens-high';
  if (n >= 7000)  return 'tw-tokens-mid';
  return 'tw-tokens-ok';
}

export function failureBadgeClass(fm: FailureMode): string {
  switch (fm) {
    case 'tool_timeout':         return 'tw-badge-timeout';
    case 'guardrail_reject':     return 'tw-badge-guardrail';
    case 'hallucination_detected': return 'tw-badge-hallucination';
    case 'missing_input':        return 'tw-badge-missing';
    default:                     return '';
  }
}

export function statusLabel(s: RunStatus): string {
  switch (s) {
    case 'success':  return 'SUCCESS';
    case 'failed':   return 'FAILED';
    case 'degraded': return 'DEGRADED';
  }
}

export function stepStatusIcon(s: string): string {
  switch (s) {
    case 'success': return '✓';
    case 'failed':  return '✗';
    default:        return '·';
  }
}
