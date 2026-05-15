import type { CollectionConfig } from 'payload'

export const ValidationResults: CollectionConfig = {
  slug: 'validation-results',
  admin: { useAsTitle: 'runId', group: 'Milestone 3' },
  fields: [
    { name: 'runId', type: 'text', required: true, index: true },
    { name: 'projectId', type: 'text', required: true, index: true },
    { name: 'valid', type: 'checkbox', defaultValue: false },
    { name: 'errorCount', type: 'number', defaultValue: 0 },
    { name: 'warningCount', type: 'number', defaultValue: 0 },
    { name: 'issues', type: 'json' },
    { name: 'scopeResults', type: 'json' },
    { name: 'summary', type: 'text' },
    { name: 'durationMs', type: 'number' },
  ],
}
