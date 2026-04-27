/**
 * @module FixAttempts
 * @description Tracks each auto-fix attempt in the Run & Fix Until Stable loop.
 * Linked to an AgentPlan (which resolves to codingRequest → project).
 * Stores error context, fix details, confidence, and final status.
 */

import type { CollectionConfig } from 'payload'
import { anyLoggedInAccess, adminOrAboveAccess } from '../access/roles'

export const FixAttempts: CollectionConfig = {
  slug: 'fix-attempts',
  admin: {
    useAsTitle: 'id',
  },
  access: {
    create: anyLoggedInAccess,
    read: anyLoggedInAccess,
    update: anyLoggedInAccess,
    delete: adminOrAboveAccess,
  },
  fields: [
    {
      name: 'agentPlan',
      type: 'relationship',
      relationTo: 'agent-plans',
      required: true,
    },
    {
      name: 'branchName',
      type: 'text',
      required: true,
    },
    {
      name: 'prNumber',
      type: 'number',
    },
    {
      name: 'attemptNumber',
      type: 'number',
      required: true,
      defaultValue: 1,
    },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'pending',
      options: [
        { label: 'Pending', value: 'pending' },
        { label: 'Running', value: 'running' },
        { label: 'Committed', value: 'committed' },
        { label: 'Passed', value: 'passed' },
        { label: 'Failed', value: 'failed' },
        { label: 'Needs Human Review', value: 'needs_human_review' },
      ],
    },
    {
      name: 'errorCategory',
      type: 'select',
      options: [
        { label: 'Missing Dependency', value: 'missing_dependency' },
        { label: 'TypeScript Error', value: 'typescript_error' },
        { label: 'Test Failure', value: 'test_failure' },
        { label: 'Runtime Error', value: 'runtime_error' },
        { label: 'Lint Error', value: 'lint_error' },
        { label: 'Config Error', value: 'config_error' },
        { label: 'Environment Error', value: 'environment_error' },
        { label: 'Unknown', value: 'unknown' },
      ],
    },
    {
      name: 'failedCommand',
      type: 'text',
    },
    {
      name: 'exitCode',
      type: 'number',
    },
    {
      name: 'errorSummary',
      type: 'textarea',
    },
    {
      name: 'rawLogs',
      type: 'textarea',
      admin: { description: 'Truncated workflow logs (max 10KB)' },
    },
    {
      name: 'fixSummary',
      type: 'textarea',
    },
    {
      name: 'filesUpdated',
      type: 'json',
      admin: { description: 'Array of file paths updated by this fix' },
    },
    {
      name: 'commitSha',
      type: 'text',
    },
    {
      name: 'confidence',
      type: 'number',
      admin: { description: 'Fix agent confidence score (0-1)' },
    },
    {
      name: 'riskLevel',
      type: 'select',
      options: [
        { label: 'Low', value: 'low' },
        { label: 'Medium', value: 'medium' },
        { label: 'High', value: 'high' },
      ],
    },
    {
      name: 'needsHumanReview',
      type: 'checkbox',
      defaultValue: false,
    },
    {
      name: 'errorFingerprint',
      type: 'text',
      admin: { description: 'Hash for detecting repeated identical errors' },
    },
  ],
}
