/**
 * @collection RepoIntelligence
 * @description Milestone 2 — Persisted repository intelligence scan results.
 * Stores architectural observations, tech stack, protected areas, env vars,
 * and route structure. Used to enrich future planning runs without re-scanning.
 */
import type { CollectionConfig } from 'payload'

export const RepoIntelligence: CollectionConfig = {
  slug: 'repo-intelligence',
  labels: {
    singular: 'Repo Intelligence',
    plural: 'Repo Intelligence Records',
  },
  admin: {
    defaultColumns: ['owner', 'repo', 'frameworkSummary', 'lastIndexedAt', 'projectId'],
    useAsTitle: 'repo',
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
      admin: { description: 'The Payload project ID this intelligence belongs to' },
    },
    {
      name: 'owner',
      type: 'text',
      required: true,
      admin: { description: 'GitHub repository owner (org or user)' },
    },
    {
      name: 'repo',
      type: 'text',
      required: true,
      admin: { description: 'GitHub repository name' },
    },
    {
      name: 'frameworkSummary',
      type: 'text',
      admin: { description: 'Short human-readable framework summary (e.g. "Next.js + Payload CMS application")' },
    },
    {
      name: 'architectureSummary',
      type: 'textarea',
      admin: { description: 'Full architecture description including tech stack, auth, routes, and deployment' },
    },
    {
      name: 'techStack',
      type: 'json',
      admin: { description: 'JSON array of detected frameworks and libraries' },
    },
    {
      name: 'importantFiles',
      type: 'json',
      admin: { description: 'JSON array of HIGH priority file paths' },
    },
    {
      name: 'protectedAreas',
      type: 'json',
      admin: { description: 'JSON array of protected area descriptions (directory-level)' },
    },
    {
      name: 'envVarsDetected',
      type: 'json',
      admin: { description: 'JSON array of detected environment variable names' },
    },
    {
      name: 'routeStructure',
      type: 'json',
      admin: { description: 'JSON array of detected HTTP route paths' },
    },
    {
      name: 'authSystem',
      type: 'text',
      admin: { description: 'Detected authentication system (e.g. "Payload CMS Auth", "Supabase Auth")' },
    },
    {
      name: 'lastIndexedAt',
      type: 'date',
      admin: { description: 'When this intelligence was last computed' },
    },
  ],
}
