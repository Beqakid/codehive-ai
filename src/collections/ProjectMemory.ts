/**
 * @module ProjectMemory
 * @description Persistent memory entries written by the Project Manager Agent.
 * Stores lessons learned, decisions made, preferences, milestones, and context
 * that survives across all future conversations about a project.
 */

import type { CollectionConfig } from 'payload'
import { anyLoggedInAccess, adminOrAboveAccess } from '../access/roles'

export const ProjectMemory: CollectionConfig = {
  slug: 'project-memory',
  admin: {
    useAsTitle: 'summary',
    description: 'Persistent memory entries written by the Project Manager Agent',
    defaultColumns: ['summary', 'type', 'importance', 'project', 'createdAt'],
  },
  access: {
    create: anyLoggedInAccess,
    read: anyLoggedInAccess,
    update: anyLoggedInAccess,
    delete: adminOrAboveAccess,
  },
  fields: [
    {
      name: 'project',
      type: 'relationship',
      relationTo: 'projects',
      required: true,
      index: true,
    },
    {
      name: 'type',
      type: 'select',
      required: true,
      defaultValue: 'context',
      options: [
        { label: '💡 Lesson Learned', value: 'lesson' },
        { label: '✅ Decision Made', value: 'decision' },
        { label: '⚙️ Preference', value: 'preference' },
        { label: '🏆 Milestone', value: 'milestone' },
        { label: '📋 Context', value: 'context' },
      ],
    },
    {
      name: 'summary',
      type: 'text',
      required: true,
      admin: { description: 'Short title for this memory (max 150 chars)' },
    },
    {
      name: 'content',
      type: 'textarea',
      required: true,
      admin: { description: 'Full detail of this memory entry' },
    },
    {
      name: 'importance',
      type: 'select',
      defaultValue: 'medium',
      options: [
        { label: '🔴 Critical', value: 'critical' },
        { label: '🟠 High', value: 'high' },
        { label: '🟡 Medium', value: 'medium' },
        { label: '🟢 Low', value: 'low' },
      ],
    },
    {
      name: 'tags',
      type: 'text',
      admin: {
        description: 'Comma-separated tags for search (e.g. "bcrypt,testing,typescript,node20")',
      },
    },
    {
      name: 'source',
      type: 'select',
      defaultValue: 'agent',
      options: [
        { label: '🤖 Agent', value: 'agent' },
        { label: '👤 User', value: 'user' },
      ],
    },
  ],
}
