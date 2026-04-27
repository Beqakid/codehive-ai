import type { CollectionConfig } from 'payload'
import { adminOrAboveAccess, anyLoggedInAccess, superAdminAccess } from '../access/roles'

export const Projects: CollectionConfig = {
  slug: 'projects',
  admin: {
    useAsTitle: 'name',
  },
  access: {
    create: anyLoggedInAccess,
    read: anyLoggedInAccess,
    update: anyLoggedInAccess,
    delete: adminOrAboveAccess,
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'description',
      type: 'textarea',
    },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'active',
      options: [
        { label: 'Active', value: 'active' },
        { label: 'Archived', value: 'archived' },
        { label: 'Paused', value: 'paused' },
      ],
    },
    {
      name: 'owner',
      type: 'relationship',
      relationTo: 'users',
      required: false,
    },
    {
      name: 'repoUrl',
      type: 'text',
      admin: {
        description: 'GitHub repository URL',
      },
    },
  ],
}
