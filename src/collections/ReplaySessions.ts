import type { CollectionConfig } from 'payload'

export const ReplaySessions: CollectionConfig = {
  slug: 'replay-sessions',
  admin: { useAsTitle: 'sessionId', group: 'Milestone 4' },
  fields: [
    { name: 'sessionId', type: 'text', required: true, index: true },
    { name: 'runId', type: 'text', required: true, index: true },
    { name: 'projectId', type: 'text', required: true, index: true },
    { name: 'workspaceId', type: 'text', required: true },
    { name: 'status', type: 'select', options: ['recording', 'completed', 'failed'], defaultValue: 'recording' },
    { name: 'startedAt', type: 'number' },
    { name: 'completedAt', type: 'number' },
    { name: 'events', type: 'json' },
    { name: 'totalSteps', type: 'number', defaultValue: 0 },
    { name: 'failedSteps', type: 'number', defaultValue: 0 },
    { name: 'healAttempts', type: 'number', defaultValue: 0 },
    { name: 'metadata', type: 'json' },
  ],
}
