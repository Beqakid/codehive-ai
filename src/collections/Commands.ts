import type { CollectionConfig } from 'payload'
import { anyLoggedInAccess, adminOrAboveAccess } from '../access/roles'

export const Commands: CollectionConfig = {
  slug: 'commands',
  admin: {
    useAsTitle: 'prompt',
  },
  access: {
    create: anyLoggedInAccess,
    read: anyLoggedInAccess,
    update: anyLoggedInAccess,
    delete: adminOrAboveAccess,
  },
  fields: [
    {
      name: 'prompt',
      type: 'textarea',
      required: true,
    },
    {
      name: 'mode',
      type: 'select',
      defaultValue: 'plan_only',
      required: true,
      options: [
        { label: '📋 Plan Only', value: 'plan_only' },
        { label: '⚡ Plan + Code', value: 'plan_code' },
        { label: '🚀 Full Build', value: 'full_build' },
      ],
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
      name: 'project',
      type: 'relationship',
      relationTo: 'projects',
    },
    {
      name: 'codingRequest',
      type: 'relationship',
      relationTo: 'coding-requests',
    },
    {
      name: 'submittedBy',
      type: 'relationship',
      relationTo: 'users',
    },
  ],
}
