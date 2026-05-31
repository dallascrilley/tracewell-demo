import type { AgentRun } from './types.js';

// Module-level singleton — loaded once, reused for the session.
let _runs: AgentRun[] | null = null;
let _loadPromise: Promise<AgentRun[]> | null = null;

export async function loadRuns(): Promise<AgentRun[]> {
  if (_runs) return _runs;
  if (_loadPromise) return _loadPromise;

  _loadPromise = fetch('/data/runs.json')
    .then(r => r.json())
    .then((data: AgentRun[]) => {
      // Sort: newest first
      data.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
      _runs = data;
      return data;
    });

  return _loadPromise;
}

export function getRunById(id: string): AgentRun | undefined {
  return _runs?.find(r => r.id === id);
}

export function getLastSuccess(agentId: string, beforeTs: string): AgentRun | undefined {
  return _runs?.find(
    r => r.agent_id === agentId &&
         r.status === 'success' &&
         new Date(r.started_at).getTime() < new Date(beforeTs).getTime()
  );
}
