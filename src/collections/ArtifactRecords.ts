import type { CollectionConfig } from 'payload'

export const ArtifactRecords: CollectionConfig = {
  slug: 'artifact-records',
  admin: { useAsTitle: 'artifactId', group: 'Milestone 4' },
  fields: [
    { name: 'artifactId', type: 'text', required: true, index: true },
    { name: 'projectId', type: 'text', required: true, index: true },
    { name: 'runId', type: 'text', required: true, index: true },
    { name: 'type', type: 'select', options: ['sandbox_log', 'build_log', 'test_report', 'lint_result', 'typecheck_result', 'diff', 'workspace_snapshot', 'execution_metadata', 'self_heal_log', 'pr_summary'], required: true },
    { name: 'r2Key', type: 'text', required: true },
    { name: 'sizeBytes', type: 'number', defaultValue: 0 },
    { name: 'mimeType', type: 'text', defaultValue: 'application/octet-stream' },
    { name: 'expiresAt', type: 'number' },
    { name: 'metadata', type: 'json' },
  ],
}
