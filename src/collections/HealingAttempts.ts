import type { CollectionConfig } from 'payload'

export const HealingAttempts: CollectionConfig = {
  slug: 'healing-attempts',
  admin: { useAsTitle: 'attemptId', group: 'Milestone 4' },
  fields: [
    { name: 'attemptId', type: 'text', required: true, index: true },
    { name: 'runId', type: 'text', required: true, index: true },
    { name: 'workspaceId', type: 'text', required: true },
    { name: 'strategy', type: 'select', options: ['import_fix', 'missing_dependency', 'syntax_repair', 'lint_autofix', 'format_fix', 'type_mismatch', 'path_correction', 'unused_variable', 'missing_export', 'unknown'], required: true },
    { name: 'targetFile', type: 'text' },
    { name: 'errorMessage', type: 'textarea' },
    { name: 'suggestedFix', type: 'textarea' },
    { name: 'patchGenerated', type: 'json' },
    { name: 'outcome', type: 'select', options: ['fixed', 'partial', 'failed', 'skipped', 'blocked'], defaultValue: 'skipped' },
    { name: 'durationMs', type: 'number', defaultValue: 0 },
    { name: 'attemptNumber', type: 'number', defaultValue: 1 },
    { name: 'maxAttempts', type: 'number', defaultValue: 3 },
  ],
}
