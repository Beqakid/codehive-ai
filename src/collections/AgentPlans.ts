import type { CollectionConfig } from 'payload'
import { adminOrAboveAccess, anyLoggedInAccess, superAdminAccess } from '../access/roles'

export const AgentPlans: CollectionConfig = {
  slug: 'agent-plans',
  admin: {
    useAsTitle: 'id',
  },
  access: {
    create: adminOrAboveAccess,
    read: anyLoggedInAccess,
    update: adminOrAboveAccess,
    delete: superAdminAccess,
  },
  fields: [
    {
      name: 'codingRequest',
      type: 'relationship',
      relationTo: 'coding-requests',
      required: true,
    },
    {
      name: 'productSpec',
      type: 'json',
      required: true,
      admin: {
        description: 'Output from the Product Agent',
      },
    },
    {
      name: 'architectureDesign',
      type: 'json',
      required: true,
      admin: {
        description: 'Output from the Architect Agent',
      },
    },
    {
      name: 'reviewFeedback',
      type: 'json',
      required: true,
      admin: {
        description: 'Output from the Reviewer Agent',
      },
    },
    {
      name: 'finalPlan',
      type: 'json',
      required: true,
      admin: {
        description: 'Consolidated final plan',
      },
    },
    {
      name: 'verdictReason',
      type: 'textarea',
      admin: {
        description: 'Why the reviewer approved or flagged this plan',
      },
    },
    {
      name: 'reviewScore',
      type: 'number',
      admin: {
        description: 'Numeric score from the reviewer (0-10)',
      },
    },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'draft',
      options: [
        { label: 'Draft', value: 'draft' },
        { label: 'Needs Revision', value: 'needs_revision' },
        { label: 'Approved', value: 'approved' },
        { label: 'Rejected', value: 'rejected' },
        { label: 'Superseded', value: 'superseded' },
      ],
    },
  ],
}
