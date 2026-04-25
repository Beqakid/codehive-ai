import type { CollectionConfig } from 'payload'
import { adminOrAboveAccess, anyLoggedInAccess, superAdminAccess } from '../access/roles'

export const AgentRuns: CollectionConfig = {
  slug: 'agent-runs',
  admin: {
    useAsTitle: 'agentName',
  },
  access: {
    create: adminOrAboveAccess,
    read: anyLoggedInAccess,
    update: adminOrAboveAccess,
    delete: superAdminAccess,
  },
  fields: [
    {
      name: 'agentName',
      type: 'select',
      required: true,
      options: [
        { label: 'Product Agent', value: 'product' },
        { label: 'Architect Agent', value: 'architect' },
        { label: 'Reviewer Agent', value: 'reviewer' },
        { label: 'Orchestrator', value: 'orchestrator' },
      ],
    },
    {
      name: 'codingRequest',
      type: 'relationship',
      relationTo: 'coding-requests',
      required: true,
    },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'running',
      options: [
        { label: 'Running', value: 'running' },
        { label: 'Completed', value: 'completed' },
        { label: 'Failed', value: 'failed' },
      ],
    },
    {
      name: 'input',
      type: 'json',
      admin: {
        description: 'Input passed to the agent',
      },
    },
    {
      name: 'output',
      type: 'json',
      admin: {
        description: 'Output returned by the agent',
      },
    },
    {
      name: 'durationMs',
      type: 'number',
      admin: {
        description: 'Execution time in milliseconds',
      },
    },
    {
      name: 'errorMessage',
      type: 'text',
    },
  ],
}
