/**
 * @collection LearnedFixes
 * @description Milestone 5 — Proven fix strategies indexed by error pattern.
 * Agents consult this collection before attempting repairs, preferring
 * high-confidence fixes with strong success records.
 */
import type { CollectionConfig } from 'payload'

export const LearnedFixes: CollectionConfig = {
  slug: 'learned-fixes',
  labels: {
    singular: 'Learned Fix',
    plural: 'Learned Fixes',
  },
  admin: {
    useAsTitle: 'fixDescription',
    defaultColumns: ['repoName', 'fixStrategy', 'successCount', 'failCount', 'confidence', 'projectId'],
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
      admin: { description: 'The project this fix belongs to' },
    },
    {
      name: 'repoName',
      type: 'text',
      required: true,
      index: true,
      admin: { description: 'Repository name (owner/repo)' },
    },
    {
      name: 'errorPattern',
      type: 'textarea',
      required: true,
      admin: { description: 'The error fingerprint / pattern this fix addresses' },
    },
    {
      name: 'fixDescription',
      type: 'textarea',
      required: true,
      admin: { description: 'Human-readable description of the fix' },
    },
    {
      name: 'fixStrategy',
      type: 'select',
      required: true,
      options: [
        { label: 'Import Fix', value: 'import_fix' },
        { label: 'Type Fix', value: 'type_fix' },
        { label: 'Lint Autofix', value: 'lint_autofix' },
        { label: 'Syntax Fix', value: 'syntax_fix' },
        { label: 'Path Fix', value: 'path_fix' },
        { label: 'Format Fix', value: 'format_fix' },
        { label: 'Build Fix', value: 'build_fix' },
        { label: 'Test Fix', value: 'test_fix' },
        { label: 'Custom', value: 'custom' },
      ],
      admin: { description: 'Strategy category for this fix' },
    },
    {
      name: 'successCount',
      type: 'number',
      defaultValue: 0,
      admin: { description: 'Number of times this fix succeeded' },
    },
    {
      name: 'failCount',
      type: 'number',
      defaultValue: 0,
      admin: { description: 'Number of times this fix failed' },
    },
    {
      name: 'confidence',
      type: 'number',
      min: 0,
      max: 100,
      admin: { description: 'Confidence score 0-100' },
    },
    {
      name: 'lastUsed',
      type: 'text',
      admin: { description: 'ISO date string of last usage' },
    },
    {
      name: 'sourceRunId',
      type: 'text',
      admin: { description: 'The run ID that originally produced this fix' },
    },
  ],
}
