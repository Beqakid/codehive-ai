/**
 * @module LessonsLearned
 * @description Lessons captured from successful CI/CD fix attempts.
 * The Self-Fix Orchestrator writes here when a fix resolves a failing workflow.
 * The Fix Agent reads the top 3 matching lessons before each new attempt,
 * applying proven patterns before trying anything novel.
 */

import type { CollectionConfig } from 'payload'
import { anyLoggedInAccess, adminOrAboveAccess } from '../access/roles'

export const LessonsLearned: CollectionConfig = {
  slug: 'lessons-learned',
  admin: {
    useAsTitle: 'errorPattern',
    description: 'Lessons captured from successful CI/CD fix attempts',
    defaultColumns: ['errorCategory', 'errorPattern', 'successCount', 'confidence', 'project', 'createdAt'],
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
      name: 'errorCategory',
      type: 'text',
      required: true,
      index: true,
      admin: {
        description: 'Error category from errorParser (e.g. "test_failure", "type_error", "build_error")',
      },
    },
    {
      name: 'errorPattern',
      type: 'textarea',
      required: true,
      admin: { description: 'Short description of the error pattern that was observed' },
    },
    {
      name: 'fixApplied',
      type: 'textarea',
      required: true,
      admin: { description: 'What fix was applied that successfully resolved the issue' },
    },
    {
      name: 'filesChanged',
      type: 'text',
      admin: { description: 'Comma-separated list of files modified in the successful fix' },
    },
    {
      name: 'confidence',
      type: 'number',
      min: 0,
      max: 1,
      admin: { description: 'Fix Agent confidence score at time of successful fix (0.0–1.0)' },
    },
    {
      name: 'successCount',
      type: 'number',
      defaultValue: 1,
      admin: { description: 'How many times this lesson has been successfully applied' },
    },
    {
      name: 'tags',
      type: 'text',
      admin: {
        description: 'Comma-separated tags for search (e.g. "bcrypt,testing,typescript,node20")',
      },
    },
  ],
}
