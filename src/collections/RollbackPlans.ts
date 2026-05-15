import type { CollectionConfig } from 'payload'

export const RollbackPlans: CollectionConfig = {
  slug: 'rollback-plans',
  admin: { useAsTitle: 'runId', group: 'Milestone 3' },
  fields: [
    { name: 'runId', type: 'text', required: true, index: true },
    { name: 'projectId', type: 'text', required: true, index: true },
    { name: 'filesTouched', type: 'json' },
    { name: 'reversalStrategy', type: 'textarea' },
    { name: 'dependencyRisks', type: 'textarea' },
    { name: 'cleanupConsiderations', type: 'textarea' },
    { name: 'migrationRisks', type: 'textarea' },
    { name: 'rollbackComplexity', type: 'select', options: ['SIMPLE', 'MODERATE', 'COMPLEX'], defaultValue: 'SIMPLE' },
    { name: 'rollbackMarkdown', type: 'textarea' },
  ],
}
