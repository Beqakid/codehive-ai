/**
 * Reviewer Agent — Phase 1 Mock
 *
 * Reviews the product spec and architecture design, providing feedback
 * on quality, security, scalability, and potential issues.
 *
 * In Phase 2 this will call an LLM. For now it returns structured mock output.
 */

import type { ProductSpec } from './productAgent'
import type { ArchitectureDesign } from './architectAgent'

export interface ReviewFeedback {
  overallScore: number // 1-10
  verdict: 'approved' | 'needs_revision' | 'rejected'
  strengths: string[]
  concerns: Array<{
    severity: 'low' | 'medium' | 'high' | 'critical'
    category: string
    description: string
    recommendation: string
  }>
  securityNotes: string[]
  scalabilityNotes: string[]
  estimatedEffort: string
}

export interface ReviewerAgentInput {
  title: string
  productSpec: ProductSpec
  architectureDesign: ArchitectureDesign
}

export async function runReviewerAgent(input: ReviewerAgentInput): Promise<ReviewFeedback> {
  await new Promise((resolve) => setTimeout(resolve, 100))

  return {
    overallScore: 8,
    verdict: 'approved',
    strengths: [
      'Well-defined user stories with clear acceptance criteria',
      `Modular architecture with ${input.architectureDesign.components.length} well-separated components`,
      'Appropriate tech stack for the Cloudflare Workers environment',
      'Good separation of concerns between frontend and backend',
    ],
    concerns: [
      {
        severity: 'medium',
        category: 'Error Handling',
        description: 'Error handling strategy should be defined upfront',
        recommendation:
          'Add a centralized error handling utility with typed error classes',
      },
      {
        severity: 'low',
        category: 'Testing',
        description: 'Test strategy should include integration tests',
        recommendation: 'Add integration test plan alongside unit tests',
      },
    ],
    securityNotes: [
      'Ensure all API endpoints validate authentication',
      'Use Payload access control for authorization',
      'Sanitize all user inputs before processing',
      'API keys and secrets must use environment variables, never hardcoded',
    ],
    scalabilityNotes: [
      'D1 SQLite has row/size limits — plan for data archival if needed',
      'R2 storage is suitable for media but consider CDN caching for static assets',
      'Cloudflare Workers have CPU time limits — keep operations lightweight',
    ],
    estimatedEffort: `${input.productSpec.userStories.length * 2}-${input.productSpec.userStories.length * 4} developer days based on ${input.productSpec.estimatedComplexity} complexity`,
  }
}
