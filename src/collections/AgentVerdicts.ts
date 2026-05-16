/**
 * @collection AgentVerdicts
 * @description Milestone 5 — Final verdict for each agent run.
 * Captures confidence scores, risk assessments, reviewer decisions,
 * and recommended actions. The Review Gate Agent writes here;
 * downstream agents and the PR pipeline read it for go/no-go decisions.
 */
import type { CollectionConfig } from 'payload'

export const AgentVerdicts: CollectionConfig = {
  slug: 'agent-verdicts',
  labels: {
    singular: 'Agent Verdict',
    plural: 'Agent Verdicts',
  },
  admin: {
    useAsTitle: 'runId',
    defaultColumns: ['runId', 'projectId', 'reviewerApproval', 'recommendedAction', 'implementationConfidence', 'riskScore'],
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
      unique: true,
      index: true,
      admin: { description: 'The unique agent run ID' },
    },
    {
      name: 'projectId',
      type: 'text',
      required: true,
      index: true,
      admin: { description: 'The project this verdict belongs to' },
    },
    {
      name: 'implementationConfidence',
      type: 'number',
      min: 0,
      max: 100,
      admin: { description: 'Confidence in the implementation quality 0-100' },
    },
    {
      name: 'riskScore',
      type: 'number',
      min: 0,
      max: 100,
      admin: { description: 'Overall risk score 0-100' },
    },
    {
      name: 'testConfidence',
      type: 'number',
      min: 0,
      max: 100,
      admin: { description: 'Confidence in test coverage/pass rate 0-100' },
    },
    {
      name: 'reviewerApproval',
      type: 'select',
      options: [
        { label: 'Approve', value: 'approve' },
        { label: 'Reject', value: 'reject' },
        { label: 'Needs Changes', value: 'needs_changes' },
        { label: 'Pending', value: 'pending' },
      ],
      admin: { description: 'Reviewer agent approval status' },
    },
    {
      name: 'productionReadiness',
      type: 'number',
      min: 0,
      max: 100,
      admin: { description: 'Production readiness score 0-100' },
    },
    {
      name: 'recommendedAction',
      type: 'select',
      options: [
        { label: 'Proceed to PR', value: 'proceed_to_pr' },
        { label: 'Needs Human Review', value: 'needs_human_review' },
        { label: 'Blocked', value: 'blocked' },
        { label: 'Retry with Fix', value: 'retry_with_fix' },
        { label: 'Planning Only', value: 'planning_only' },
      ],
      admin: { description: 'Recommended next action for the pipeline' },
    },
    {
      name: 'reviewerReasons',
      type: 'json',
      admin: { description: 'JSON array of reviewer reasoning strings' },
    },
    {
      name: 'riskyFiles',
      type: 'json',
      admin: { description: 'JSON array of file paths flagged as risky' },
    },
    {
      name: 'missingTests',
      type: 'json',
      admin: { description: 'JSON array of files/areas lacking test coverage' },
    },
    {
      name: 'rollbackConcerns',
      type: 'json',
      admin: { description: 'JSON array of rollback concerns' },
    },
    {
      name: 'agentScores',
      type: 'json',
      admin: { description: 'JSON object with per-agent scores { planner, coder, tester, reviewer }' },
    },
    {
      name: 'pipelineDurationMs',
      type: 'number',
      admin: { description: 'Total pipeline duration in milliseconds' },
    },
  ],
}
