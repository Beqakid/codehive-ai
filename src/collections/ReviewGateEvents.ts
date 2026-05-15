import type { CollectionConfig } from 'payload'

export const ReviewGateEvents: CollectionConfig = {
  slug: 'review-gate-events',
  admin: { useAsTitle: 'runId', group: 'Milestone 3' },
  fields: [
    { name: 'runId', type: 'text', required: true, index: true },
    { name: 'projectId', type: 'text', required: true, index: true },
    { name: 'overallDecision', type: 'select', options: ['auto_approve', 'confirmation_required', 'approval_required', 'blocked'], required: true },
    { name: 'canProceed', type: 'checkbox', defaultValue: false },
    { name: 'requiresHumanApproval', type: 'checkbox', defaultValue: false },
    { name: 'checks', type: 'json' },
    { name: 'blockReasons', type: 'json' },
    { name: 'warnings', type: 'json' },
    { name: 'summary', type: 'text' },
    { name: 'approvedBy', type: 'text' },
    { name: 'approvedAt', type: 'date' },
  ],
}
