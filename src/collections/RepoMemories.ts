/**
 * @collection RepoMemories
 * @description Milestone 5 — Persistent memory entries per repository.
 * Stores architecture knowledge, protected areas, previous outcomes,
 * error patterns, successful fixes, and user preferences that agents
 * consult before each run.
 */
import type { CollectionConfig } from 'payload'

export const RepoMemories: CollectionConfig = {
  slug: 'repo-memories',
  labels: {
    singular: 'Repo Memory',
    plural: 'Repo Memories',
  },
  admin: {
    useAsTitle: 'content',
    defaultColumns: ['repoName', 'memoryType', 'confidence', 'active', 'projectId'],
  },
  access: {
    read: () => true,
    create: () => true,
    update: () => true,
    delete: () => true,
  },
  fields: [
    {
      name: 'projectId',
      type: 'text',
      required: true,
      index: true,
      admin: { description: 'The project this memory belongs to' },
    },
    {
      name: 'repoName',
      type: 'text',
      required: true,
      index: true,
      admin: { description: 'Repository name (owner/repo)' },
    },
    {
      name: 'memoryType',
      type: 'select',
      required: true,
      options: [
        { label: 'Repo Architecture', value: 'repo_architecture' },
        { label: 'Protected Area', value: 'protected_area' },
        { label: 'Previous Outcome', value: 'previous_outcome' },
        { label: 'Repeated Error', value: 'repeated_error' },
        { label: 'Successful Fix', value: 'successful_fix' },
        { label: 'Failed Repair', value: 'failed_repair' },
        { label: 'Project Rule', value: 'project_rule' },
        { label: 'User Preference', value: 'user_preference' },
        { label: 'Do Not Touch', value: 'do_not_touch' },
        { label: 'Successful Pattern', value: 'successful_pattern' },
      ],
      admin: { description: 'Category of this memory entry' },
    },
    {
      name: 'content',
      type: 'textarea',
      required: true,
      admin: { description: 'The memory content / description' },
    },
    {
      name: 'confidence',
      type: 'number',
      min: 0,
      max: 100,
      admin: { description: 'Confidence score 0-100' },
    },
    {
      name: 'sourceRunId',
      type: 'text',
      admin: { description: 'The run ID that produced this memory' },
    },
    {
      name: 'tags',
      type: 'json',
      admin: { description: 'JSON array of string tags for search/filtering' },
    },
    {
      name: 'active',
      type: 'checkbox',
      defaultValue: true,
      admin: { description: 'Whether this memory is currently active' },
    },
  ],
}
