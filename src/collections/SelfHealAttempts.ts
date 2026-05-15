import type { CollectionConfig } from 'payload'

export const SelfHealAttempts: CollectionConfig = {
  slug: 'self-heal-attempts',
  admin: { useAsTitle: 'runId', group: 'Milestone 3' },
  fields: [
    { name: 'runId', type: 'text', required: true, index: true },
    { name: 'projectId', type: 'text', required: true, index: true },
    { name: 'attemptNumber', type: 'number', required: true },
    { name: 'errorCategory', type: 'text' },
    { name: 'errorMessage', type: 'text' },
    { name: 'healAction', type: 'text' },
    { name: 'patchApplied', type: 'json' },
    { name: 'success', type: 'checkbox', defaultValue: false },
    { name: 'resultMessage', type: 'text' },
    { name: 'durationMs', type: 'number' },
  ],
}
