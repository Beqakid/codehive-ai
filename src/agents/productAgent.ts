/**
 * Product Agent — Phase 1 Mock
 *
 * Analyzes a coding request and produces a structured product specification
 * including user stories, acceptance criteria, and scope definition.
 *
 * In Phase 2 this will call an LLM. For now it returns structured mock output.
 */

export interface ProductSpec {
  summary: string
  userStories: Array<{
    id: string
    title: string
    description: string
    acceptanceCriteria: string[]
  }>
  scope: {
    included: string[]
    excluded: string[]
  }
  estimatedComplexity: 'low' | 'medium' | 'high'
}

export interface ProductAgentInput {
  title: string
  description: string
  projectName: string
}

export async function runProductAgent(input: ProductAgentInput): Promise<ProductSpec> {
  // Simulate processing time
  await new Promise((resolve) => setTimeout(resolve, 100))

  return {
    summary: `Product specification for "${input.title}" in project "${input.projectName}". ${input.description}`,
    userStories: [
      {
        id: 'US-001',
        title: `Implement ${input.title}`,
        description: `As a developer, I want to ${input.description.toLowerCase()}, so that the feature is available to users.`,
        acceptanceCriteria: [
          'Feature is implemented according to the description',
          'All edge cases are handled',
          'Unit tests cover the main functionality',
          'Documentation is updated',
        ],
      },
      {
        id: 'US-002',
        title: `Test ${input.title}`,
        description: `As a QA engineer, I want to verify that ${input.title.toLowerCase()} works correctly.`,
        acceptanceCriteria: [
          'Integration tests pass',
          'No regressions in existing functionality',
          'Performance benchmarks are met',
        ],
      },
    ],
    scope: {
      included: [
        'Core feature implementation',
        'Unit tests',
        'Basic error handling',
        'TypeScript types',
      ],
      excluded: [
        'Performance optimization (Phase 2)',
        'Advanced analytics (Phase 2)',
        'Third-party integrations (Phase 2)',
      ],
    },
    estimatedComplexity: 'medium',
  }
}
