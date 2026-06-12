export const GUIDED_TOURS = {
  tracewell: {
    repoLabel: 'Tracewell',
    repoUrl: 'https://github.com/dallascrilley/tracewell-demo',
    steps: [
      {
        label: 'Bring a run trace',
        body: 'Paste or upload a recorded agent run with steps, status, token counts, latency, errors, and model parameters.',
      },
      {
        label: 'Classify failure server-side',
        body: 'Analyze your trace sends the run to the backend, which identifies the failure mode, root-cause step, and suggested repair.',
      },
      {
        label: 'Inspect the black box',
        body: 'Timeline, tool tree, prompt diff, and token readouts make the failed run reviewable without rerunning the agent.',
      },
    ],
  },
} as const;
