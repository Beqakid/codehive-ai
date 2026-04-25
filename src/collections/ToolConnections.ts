import type { CollectionConfig } from 'payload'
import { superAdminAccess, adminOrAboveAccess, anyLoggedInAccess } from '../access/roles'

export const ToolConnections: CollectionConfig = {
  slug: 'tool-connections',
  admin: {
    useAsTitle: 'name',
  },
  access: {
    create: superAdminAccess,
    read: anyLoggedInAccess,
    update: adminOrAboveAccess,
    delete: superAdminAccess,
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'type',
      type: 'select',
      required: true,
      options: [
        { label: 'GitHub', value: 'github' },
        { label: 'OpenAI', value: 'openai' },
        { label: 'Anthropic', value: 'anthropic' },
        { label: 'Gemini', value: 'gemini' },
        { label: 'Custom', value: 'custom' },
      ],
    },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'active',
      options: [
        { label: 'Active', value: 'active' },
        { label: 'Inactive', value: 'inactive' },
        { label: 'Error', value: 'error' },
      ],
    },
    {
      name: 'config',
      type: 'json',
      admin: {
        description: 'Connection configuration (keys, endpoints, etc.)',
      },
    },
    {
      name: 'project',
      type: 'relationship',
      relationTo: 'projects',
    },
  ],
}
