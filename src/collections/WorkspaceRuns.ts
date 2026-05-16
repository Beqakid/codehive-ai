import type { CollectionConfig } from 'payload'

export const WorkspaceRuns: CollectionConfig = {
  slug: 'workspace-runs',
  admin: { useAsTitle: 'workspaceId', group: 'Milestone 4' },
  fields: [
    { name: 'workspaceId', type: 'text', required: true, index: true },
    { name: 'runId', type: 'text', required: true, index: true },
    { name: 'projectId', type: 'text', required: true, index: true },
    { name: 'provider', type: 'select', options: ['github', 'e2b', 'cloudflare_sandbox', 'docker', 'local_mock'], defaultValue: 'github' },
    { name: 'status', type: 'select', options: ['creating', 'ready', 'patching', 'executing', 'completed', 'failed', 'cleaning_up', 'destroyed', 'timed_out', 'orphaned'], defaultValue: 'creating' },
    { name: 'branchName', type: 'text', required: true },
    { name: 'repoOwner', type: 'text', required: true },
    { name: 'repoName', type: 'text', required: true },
    { name: 'baseBranch', type: 'text', defaultValue: 'main' },
    { name: 'lastHeartbeat', type: 'number' },
    { name: 'expiresAt', type: 'number' },
    { name: 'fileCount', type: 'number', defaultValue: 0 },
    { name: 'metadata', type: 'json' },
    { name: 'cleanupResult', type: 'json' },
    { name: 'durationMs', type: 'number' },
    { name: 'errorMessage', type: 'text' },
  ],
}
