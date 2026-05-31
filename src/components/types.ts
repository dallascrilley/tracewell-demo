export type AgentId =
  | "lead-enrichment-agent"
  | "outreach-sequencer"
  | "contract-review-agent";

export type FailureMode =
  | "tool_timeout"
  | "context_overflow"
  | "guardrail_reject"
  | "hallucination_detected"
  | "missing_input";

export type RunStatus = "success" | "failed" | "degraded";
export type StepStatus = "success" | "failed" | "skipped";

export interface ModelParams {
  temperature: number;
  max_tokens: number;
}

export interface AgentStep {
  id: string;
  parent_id: string | null;
  name: string;
  tool: string | null;
  status: StepStatus;
  tokens_in: number;
  tokens_out: number;
  latency_ms: number;
  prompt_snapshot: string | null;
  output_snapshot: string | null;
  error: string | null;
  model: string | null;
  model_params: ModelParams | null;
}

export interface AgentRun {
  id: string;
  agent_id: AgentId;
  started_at: string;
  ended_at: string;
  status: RunStatus;
  failure_mode: FailureMode | null;
  total_tokens_in: number;
  total_tokens_out: number;
  total_latency_ms: number;
  steps: AgentStep[];
}

export interface ReplayFixture {
  description: string;
  tokens_in?: number;
  tokens_out?: number;
  latency_ms?: number;
  output: string | null;
  error: string | null;
}
