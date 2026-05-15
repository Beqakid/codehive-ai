import type { CollectionConfig } from 'payload'

export const SandboxRuns: CollectionConfig = {
  slug: 'sandbox-runs',
  admin: { useAsTitle: 'runId', group: 'Milestone 3' },
  fields: [
    { name: 'runId', type: 'text', required: true, index: true },
    { name: 'projectId', type: 'text', required: true, index: true },
    { name: 'provider', type: 'select', options: ['github_actions', 'local_mock', 'e2b', 'cloudflare_sandbox'], defaultValue: 'github_actions' },
    { name: 'success', type: 'checkbox', defaultValue: false },
    { name: 'steps', type: 'json' },
    { name: 'totalDurationMs', type: 'number' },
    { name: 'errors', type: 'json' },
    { name: 'summary', type: 'text' },
    { name: 'branch', type: 'text' },
  ],
}
