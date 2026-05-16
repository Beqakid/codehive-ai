/**
 * @collection FailurePatterns
 * @description Milestone 5 — Tracked failure patterns across runs.
 * Captures unique error fingerprints, categories, occurrence counts,
 * and resolution status to help agents avoid known pitfalls.
 */
import type { CollectionConfig } from 'payload'

export const FailurePatterns: CollectionConfig = {
  slug: 'failure-patterns',
  labels: {
    singular: 'Failure Pattern',
    plural: 'Failure Patterns',
  },
  admin: {
    useAsTitle: 'fingerprint',
    defaultColumns: ['repoName', 'category', 'occurrenceCount', 'resolved', 'lastSeen', 'projectId'],
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
      admin: { description: 'The project this pattern belongs to' },
    },
    {
      name: 'repoName',
      type: 'text',
      required: true,
      index: true,
      admin: { description: 'Repository name (owner/repo)' },
    },
    {
      name: 'fingerprint',
      type: 'text',
      required: true,
      index: true,
      admin: { description: 'Unique hash identifying this failure pattern' },
    },
    {
      name: 'category',
      type: 'select',
      required: true,
      options: [
        { label: 'Import Error', value: 'import_error' },
        { label: 'Type Error', value: 'type_error' },
        { label: 'Lint Error', value: 'lint_error' },
        { label: 'Syntax Error', value: 'syntax_error' },
        { label: 'Test Failure', value: 'test_failure' },
        { label: 'Build Error', value: 'build_error' },
        { label: 'Runtime Error', value: 'runtime_error' },
        { label: 'Config Error', value: 'config_error' },
        { label: 'Dependency Error', value: 'dependency_error' },
        { label: 'Unknown', value: 'unknown' },
      ],
      admin: { description: 'Error category classification' },
    },
    {
      name: 'pattern',
      type: 'textarea',
      required: true,
      admin: { description: 'Human-readable description of the failure pattern' },
    },
    {
      name: 'occurrenceCount',
      type: 'number',
      defaultValue: 1,
      admin: { description: 'Number of times this pattern has occurred' },
    },
    {
      name: 'lastSeen',
      type: 'text',
      admin: { description: 'ISO date string of last occurrence' },
    },
    {
      name: 'resolved',
      type: 'checkbox',
      defaultValue: false,
      admin: { description: 'Whether this failure pattern has been resolved' },
    },
    {
      name: 'resolution',
      type: 'textarea',
      admin: { description: 'Description of how this pattern was resolved' },
    },
    {
      name: 'sourceRunId',
      type: 'text',
      admin: { description: 'The run ID that first detected this pattern' },
    },
  ],
}
