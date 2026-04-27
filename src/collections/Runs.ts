import type { CollectionConfig } from 'payload'
import { anyLoggedInAccess, adminOrAboveAccess } from '../access/roles'

export const Runs: CollectionConfig = {
  slug: 'runs',
  admin: {
    useAsTitle: 'id',
  },
  access: {
    create: anyLoggedInAccess,
    read: anyLoggedInAccess,
    update: anyLoggedInAccess,
    delete: adminOrAboveAccess,
  },
  fields: [
    {
      name: 'command',
      type: 'relationship',
      relationTo: 'commands',
      required: true,
    },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'pending',
      options: [
        { label: 'Pending', value: 'pending' },
        { label: 'Running', value: 'running' },
        { label: 'Completed', value: 'completed' },
        { label: 'Failed', value: 'failed' },
      ],
    },
    {
      name: 'mode',
      type: 'select',
      options: [
        { label: '📋 Plan Only', value: 'plan_only' },
        { label: '⚡ Plan + Code', value: 'plan_code' },
        { label: '🚀 Full Build', value: 'full_build' },
      ],
    },
    {
      name: 'logs',
      type: 'textarea',
      admin: { description: 'JSON-encoded log entries' },
    },
    {
      name: 'prUrl',
      type: 'text',
    },
    {
      name: 'planId',
      type: 'number',
    },
    {
      name: 'error',
      type: 'text',
    },
    {
      name: 'startedAt',
      type: 'date',
    },
    {
      name: 'completedAt',
      type: 'date',
    },
  ],
}
