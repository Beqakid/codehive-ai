import type { CollectionConfig } from 'payload'

export const PatchRuns: CollectionConfig = {
  slug: 'patch-runs',
  admin: { useAsTitle: 'runId', group: 'Milestone 3' },
  fields: [
    { name: 'runId', type: 'text', required: true, index: true },
    { name: 'projectId', type: 'text', required: true, index: true },
    { name: 'status', type: 'select', options: ['pending', 'generating', 'validating', 'sandbox', 'review', 'completed', 'failed'], defaultValue: 'pending' },
    { name: 'patchCount', type: 'number', defaultValue: 0 },
    { name: 'totalLinesChanged', type: 'number', defaultValue: 0 },
    { name: 'patches', type: 'json' },
    { name: 'diffs', type: 'json' },
    { name: 'rejectedFiles', type: 'json' },
    { name: 'validationErrors', type: 'json' },
    { name: 'warnings', type: 'json' },
    { name: 'aiModel', type: 'text' },
    { name: 'durationMs', type: 'number' },
    { name: 'errorMessage', type: 'text' },
  ],
}
