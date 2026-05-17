import type { CollectionConfig } from 'payload'

export const RunEvents: CollectionConfig = {
  slug: 'run-events',
  admin: {
    useAsTitle: 'message',
    group: 'M6 — Async Orchestration',
  },
  fields: [
    { name: 'runId', type: 'text', required: true, index: true },
    { name: 'stepName', type: 'text' },
    {
      name: 'eventType',
      type: 'select',
      required: true,
      options: [
        { label: 'Run Started', value: 'run_started' },
        { label: 'Run Completed', value: 'run_completed' },
        { label: 'Run Failed', value: 'run_failed' },
        { label: 'Run Stalled', value: 'run_stalled' },
        { label: 'Run Cancelled', value: 'run_cancelled' },
        { label: 'Run Resumed', value: 'run_resumed' },
        { label: 'Step Started', value: 'step_started' },
        { label: 'Step Completed', value: 'step_completed' },
        { label: 'Step Failed', value: 'step_failed' },
        { label: 'Step Retry', value: 'step_retry' },
        { label: 'Heartbeat', value: 'heartbeat' },
      ],
    },
    { name: 'message', type: 'text', required: true },
    { name: 'data', type: 'textarea' },
    { name: 'emittedAt', type: 'text' },
  ],
}
