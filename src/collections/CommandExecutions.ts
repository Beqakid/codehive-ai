import type { CollectionConfig } from 'payload'

export const CommandExecutions: CollectionConfig = {
  slug: 'command-executions',
  admin: { useAsTitle: 'command', group: 'Milestone 4' },
  fields: [
    { name: 'runId', type: 'text', required: true, index: true },
    { name: 'workspaceId', type: 'text', required: true, index: true },
    { name: 'command', type: 'text', required: true },
    { name: 'step', type: 'text' },
    { name: 'exitCode', type: 'number', defaultValue: -1 },
    { name: 'stdout', type: 'textarea' },
    { name: 'stderr', type: 'textarea' },
    { name: 'durationMs', type: 'number', defaultValue: 0 },
    { name: 'startedAt', type: 'number' },
    { name: 'completedAt', type: 'number' },
    { name: 'allowed', type: 'checkbox', defaultValue: true },
    { name: 'metadata', type: 'json' },
  ],
}
