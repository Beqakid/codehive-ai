import type { CollectionConfig } from 'payload'

export const WorkspaceSnapshots: CollectionConfig = {
  slug: 'workspace-snapshots',
  admin: { useAsTitle: 'snapshotId', group: 'Milestone 4' },
  fields: [
    { name: 'snapshotId', type: 'text', required: true, index: true },
    { name: 'workspaceId', type: 'text', required: true, index: true },
    { name: 'runId', type: 'text', required: true, index: true },
    { name: 'phase', type: 'select', options: ['pre_patch', 'post_patch', 'post_execution', 'post_heal'], required: true },
    { name: 'filesSnapshot', type: 'json' },
    { name: 'commitSha', type: 'text' },
    { name: 'fileCount', type: 'number', defaultValue: 0 },
    { name: 'metadata', type: 'json' },
  ],
}
