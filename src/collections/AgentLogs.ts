/**
 * AgentLogs collection — Milestone 1
 * Stores per-event log entries for every agent run.
 * One row per log event. queryable by runId.
 */
import type { CollectionConfig } from 'payload'
import { adminOrAboveAccess, anyLoggedInAccess } from '../access/roles'

export const AgentLogs: CollectionConfig = {
  slug: 'agent-logs',
  admin: {
    useAsTitle: 'message',
    defaultColumns: ['runId', 'level', 'event', 'message', 'createdAt'],
    description: 'Per-event log entries for agent runs',
  },
  access: {
    create: adminOrAboveAccess,
    read: anyLoggedInAccess,
    update: adminOrAboveAccess,
    delete: adminOrAboveAccess,
  },
  fields: [
    {
      name: 'runId',
      type: 'text',
      required: true,
      index: true,
      admin: { description: 'Agent run ID this log entry belongs to' },
    },
    {
      name: 'level',
      type: 'select',
      defaultValue: 'info',
      options: [
        { label: 'Info', value: 'info' },
        { label: 'Success', value: 'success' },
        { label: 'Warn', value: 'warn' },
        { label: 'Error', value: 'error' },
        { label: 'Debug', value: 'debug' },
      ],
    },
    {
      name: 'event',
      type: 'text',
      required: true,
      admin: {
        description: 'Event type identifier (e.g. repo_validated, plan_generated, pr_created)',
      },
    },
    {
      name: 'message',
      type: 'textarea',
      required: true,
    },
    {
      name: 'metadata',
      type: 'json',
      admin: { description: 'Optional structured data attached to this log entry' },
    },
  ],
  timestamps: true,
}
