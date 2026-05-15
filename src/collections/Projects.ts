import type { CollectionConfig } from 'payload'
import { adminOrAboveAccess, anyLoggedInAccess, ownerOrAdminAccess } from '../access/roles'

export const Projects: CollectionConfig = {
  slug: 'projects',
  admin: {
    useAsTitle: 'name',
  },
  access: {
    create: anyLoggedInAccess,
    read: ownerOrAdminAccess,
    update: ownerOrAdminAccess,
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
        description: 'GitHub repository URL (e.g. https://github.com/owner/repo)',
      },
    },
    // ─── Milestone 1 additions (additive, non-breaking) ──────────────────────
    {
      name: 'repoOwner',
      type: 'text',
      admin: {
        description: 'GitHub repository owner (username or org). Derived from repoUrl if blank.',
      },
    },
    {
      name: 'repoName',
      type: 'text',
      admin: {
        description: 'GitHub repository name. Derived from repoUrl if blank.',
      },
    },
    {
      name: 'defaultBranch',
      type: 'text',
      defaultValue: 'main',
      admin: {
        description: 'Default branch for this repository (e.g. main, master)',
      },
    },
  ],
}
