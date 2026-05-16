/**
 * @collection ProjectRules
 * @description Milestone 5 — Per-project rules that agents must follow.
 * Includes do-not-modify directives, approval requirements, style guides,
 * testing requirements, deployment rules, and security rules.
 */
import type { CollectionConfig } from 'payload'

export const ProjectRules: CollectionConfig = {
  slug: 'project-rules',
  labels: {
    singular: 'Project Rule',
    plural: 'Project Rules',
  },
  admin: {
    useAsTitle: 'rule',
    defaultColumns: ['repoName', 'ruleType', 'severity', 'active', 'projectId'],
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
      admin: { description: 'The project this rule belongs to' },
    },
    {
      name: 'repoName',
      type: 'text',
      required: true,
      index: true,
      admin: { description: 'Repository name (owner/repo)' },
    },
    {
      name: 'rule',
      type: 'textarea',
      required: true,
      admin: { description: 'The rule description / directive' },
    },
    {
      name: 'ruleType',
      type: 'select',
      required: true,
      options: [
        { label: 'Do Not Modify', value: 'do_not_modify' },
        { label: 'Requires Approval', value: 'requires_approval' },
        { label: 'Style Guide', value: 'style_guide' },
        { label: 'Testing Requirement', value: 'testing_requirement' },
        { label: 'Deployment Rule', value: 'deployment_rule' },
        { label: 'Security Rule', value: 'security_rule' },
        { label: 'Custom', value: 'custom' },
      ],
      admin: { description: 'Category of this rule' },
    },
    {
      name: 'severity',
      type: 'select',
      required: true,
      options: [
        { label: 'Info', value: 'info' },
        { label: 'Warning', value: 'warning' },
        { label: 'Critical', value: 'critical' },
      ],
      admin: { description: 'How critical this rule is' },
    },
    {
      name: 'active',
      type: 'checkbox',
      defaultValue: true,
      admin: { description: 'Whether this rule is currently enforced' },
    },
    {
      name: 'sourceRunId',
      type: 'text',
      admin: { description: 'The run ID that created this rule (if auto-generated)' },
    },
    {
      name: 'addedBy',
      type: 'text',
      admin: { description: 'Who added this rule: "system" or "user"' },
    },
  ],
}
