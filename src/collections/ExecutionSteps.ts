import type { CollectionConfig } from 'payload'

export const ExecutionSteps: CollectionConfig = {
  slug: 'execution-steps',
  admin: { useAsTitle: 'step', group: 'Milestone 4' },
  fields: [
    { name: 'runId', type: 'text', required: true, index: true },
    { name: 'workspaceId', type: 'text', required: true, index: true },
    { name: 'step', type: 'select', options: ['install', 'lint', 'build', 'typecheck', 'test', 'custom'], required: true },
    { name: 'command', type: 'text', required: true },
    { name: 'status', type: 'select', options: ['pending', 'running', 'passed', 'failed', 'skipped', 'timed_out'], defaultValue: 'pending' },
    { name: 'exitCode', type: 'number', defaultValue: -1 },
    { name: 'stdout', type: 'textarea' },
    { name: 'stderr', type: 'textarea' },
    { name: 'durationMs', type: 'number', defaultValue: 0 },
    { name: 'startedAt', type: 'number' },
    { name: 'completedAt', type: 'number' },
    { name: 'retryCount', type: 'number', defaultValue: 0 },
  ],
}
