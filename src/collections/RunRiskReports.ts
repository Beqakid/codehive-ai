/**
 * @collection RunRiskReports
 * @description Milestone 2 — Persisted risk analysis reports per agent run.
 * Captures risk level, score, confidence, affected/protected files,
 * rollback complexity, and recommendations.
 */
import type { CollectionConfig } from 'payload'

export const RunRiskReports: CollectionConfig = {
  slug: 'run-risk-reports',
  labels: {
    singular: 'Run Risk Report',
    plural: 'Run Risk Reports',
  },
  admin: {
    defaultColumns: ['runId', 'riskLevel', 'riskScore', 'implementationScope', 'projectId'],
    useAsTitle: 'runId',
  },
  access: {
    read: () => true,
    create: () => true,
    update: () => true,
    delete: () => true,
  },
  fields: [
    {
      name: 'runId',
      type: 'text',
      required: true,
      index: true,
      admin: { description: 'The agent run ID this report belongs to' },
    },
    {
      name: 'projectId',
      type: 'text',
      required: true,
      index: true,
      admin: { description: 'The project ID' },
    },
    {
      name: 'riskLevel',
      type: 'select',
      required: true,
      options: [
        { label: '🟢 LOW', value: 'LOW' },
        { label: '🟡 MEDIUM', value: 'MEDIUM' },
        { label: '🔴 HIGH', value: 'HIGH' },
        { label: '🚨 CRITICAL', value: 'CRITICAL' },
      ],
    },
    {
      name: 'riskScore',
      type: 'number',
      min: 0,
      max: 100,
      admin: { description: 'Numeric risk score 0-100' },
    },
    {
      name: 'confidenceScore',
      type: 'number',
      min: 0,
      max: 100,
      admin: { description: 'Confidence in the risk assessment 0-100%' },
    },
    {
      name: 'rollbackComplexity',
      type: 'select',
      options: [
        { label: 'Simple', value: 'SIMPLE' },
        { label: 'Moderate', value: 'MODERATE' },
        { label: 'Complex', value: 'COMPLEX' },
      ],
    },
    {
      name: 'implementationScope',
      type: 'select',
      options: [
        { label: 'Minimal', value: 'MINIMAL' },
        { label: 'Moderate', value: 'MODERATE' },
        { label: 'Extensive', value: 'EXTENSIVE' },
      ],
    },
    {
      name: 'affectedFiles',
      type: 'json',
      admin: { description: 'JSON array of file paths in scope' },
    },
    {
      name: 'protectedFilesTouched',
      type: 'json',
      admin: { description: 'JSON array of protected file paths touched by this plan' },
    },
    {
      name: 'recommendations',
      type: 'json',
      admin: { description: 'JSON array of risk mitigation recommendations' },
    },
  ],
}
