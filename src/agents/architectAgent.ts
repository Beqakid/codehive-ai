/**
 * Architect Agent — Phase 1 Mock
 *
 * Takes the product spec and produces an architecture design including
 * components, data models, API endpoints, and file structure.
 *
 * In Phase 2 this will call an LLM. For now it returns structured mock output.
 */

import type { ProductSpec } from './productAgent'

export interface ArchitectureDesign {
  overview: string
  components: Array<{
    name: string
    type: 'frontend' | 'backend' | 'shared' | 'database'
    description: string
    dependencies: string[]
  }>
  dataModels: Array<{
    name: string
    fields: Array<{ name: string; type: string; required: boolean }>
  }>
  apiEndpoints: Array<{
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
    path: string
    description: string
  }>
  fileStructure: string[]
  techStack: string[]
}

export interface ArchitectAgentInput {
  title: string
  description: string
  productSpec: ProductSpec
}

export async function runArchitectAgent(input: ArchitectAgentInput): Promise<ArchitectureDesign> {
  await new Promise((resolve) => setTimeout(resolve, 100))

  return {
    overview: `Architecture design for "${input.title}". This design implements the product spec with ${input.productSpec.userStories.length} user stories using a modular approach.`,
    components: [
      {
        name: `${input.title.replace(/\s+/g, '')}Service`,
        type: 'backend',
        description: `Core service handling business logic for ${input.title}`,
        dependencies: ['payload', 'database'],
      },
      {
        name: `${input.title.replace(/\s+/g, '')}API`,
        type: 'backend',
        description: `API route handlers for ${input.title}`,
        dependencies: ['next.js', 'payload'],
      },
      {
        name: `${input.title.replace(/\s+/g, '')}UI`,
        type: 'frontend',
        description: `Frontend components for ${input.title}`,
        dependencies: ['react', 'next.js'],
      },
    ],
    dataModels: [
      {
        name: input.title.replace(/\s+/g, ''),
        fields: [
          { name: 'id', type: 'number', required: true },
          { name: 'title', type: 'string', required: true },
          { name: 'status', type: 'enum', required: true },
          { name: 'createdAt', type: 'datetime', required: true },
          { name: 'updatedAt', type: 'datetime', required: true },
        ],
      },
    ],
    apiEndpoints: [
      {
        method: 'GET',
        path: `/api/${input.title.toLowerCase().replace(/\s+/g, '-')}`,
        description: `List all ${input.title} records`,
      },
      {
        method: 'POST',
        path: `/api/${input.title.toLowerCase().replace(/\s+/g, '-')}`,
        description: `Create a new ${input.title} record`,
      },
    ],
    fileStructure: [
      `src/collections/${input.title.replace(/\s+/g, '')}.ts`,
      `src/app/(frontend)/${input.title.toLowerCase().replace(/\s+/g, '-')}/page.tsx`,
      `src/app/(frontend)/api/${input.title.toLowerCase().replace(/\s+/g, '-')}/route.ts`,
    ],
    techStack: [
      'Payload CMS 3.x',
      'Next.js 15',
      'Cloudflare Workers',
      'D1 SQLite',
      'R2 Storage',
      'TypeScript',
    ],
  }
}
