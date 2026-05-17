import type { CollectionConfig } from 'payload'

export const AsyncRuns: CollectionConfig = {
  slug: 'async-runs',
  admin: {
    useAsTitle: 'title',
    group: 'M6 — Async Orchestration',
  },
  fields: [
    { name: 'runId', type: 'text', required: true, index: true },
    { name: 'projectId', type: 'text', required: true, index: true },
    { name: 'projectName', type: 'text', required: true },
    { name: 'repoOwner', type: 'text', required: true },
    { name: 'repoName', type: 'text', required: true },
    { name: 'title', type: 'text', required: true },
    { name: 'description', type: 'textarea' },
    { name: 'branch', type: 'text', defaultValue: 'main' },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'queued',
      options: [
        { label: 'Queued', value: 'queued' },
        { label: 'Processing', value: 'processing' },
        { label: 'Completed', value: 'completed' },
        { label: 'Failed', value: 'failed' },
        { label: 'Cancelled', value: 'cancelled' },
        { label: 'Stalled', value: 'stalled' },
      ],
    },
    { name: 'currentStep', type: 'text' },
    { name: 'totalSteps', type: 'number', defaultValue: 12 },
    { name: 'completedSteps', type: 'number', defaultValue: 0 },
    { name: 'failedSteps', type: 'number', defaultValue: 0 },
    { name: 'heartbeatAt', type: 'text' },
    { name: 'startedAt', type: 'text' },
    { name: 'completedAt', type: 'text' },
    { name: 'durationMs', type: 'number', defaultValue: 0 },
    { name: 'error', type: 'textarea' },
    { name: 'metadata', type: 'textarea' },
  ],
}
