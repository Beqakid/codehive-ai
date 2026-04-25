import type { CollectionConfig } from 'payload'
import {
  adminOrAboveAccess,
  anyLoggedInAccess,
  developerOrAboveAccess,
  superAdminAccess,
} from '../access/roles'

export const CodingRequests: CollectionConfig = {
  slug: 'coding-requests',
  admin: {
    useAsTitle: 'title',
  },
  access: {
    create: developerOrAboveAccess,
    read: anyLoggedInAccess,
    update: adminOrAboveAccess,
    delete: superAdminAccess,
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      name: 'description',
      type: 'textarea',
      required: true,
    },
    {
      name: 'project',
      type: 'relationship',
      relationTo: 'projects',
      required: true,
    },
    {
      name: 'requestedBy',
      type: 'relationship',
      relationTo: 'users',
      required: true,
    },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'draft',
      options: [
        { label: 'Draft', value: 'draft' },
        { label: 'Submitted', value: 'submitted' },
        { label: 'Planning', value: 'planning' },
        { label: 'Approved', value: 'approved' },
        { label: 'In Progress', value: 'in_progress' },
        { label: 'Completed', value: 'completed' },
        { label: 'Rejected', value: 'rejected' },
      ],
    },
    {
      name: 'priority',
      type: 'select',
      defaultValue: 'medium',
      options: [
        { label: 'Low', value: 'low' },
        { label: 'Medium', value: 'medium' },
        { label: 'High', value: 'high' },
        { label: 'Critical', value: 'critical' },
      ],
    },
  ],
}
