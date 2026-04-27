/**
 * Reviewer Agent — Phase 2
 * Calls Anthropic Claude 3.7 Sonnet with streaming to review and critique the plan.
 * Uses native fetch — no additional packages required.
 */

import { parseAnthropicStream } from '../lib/stream-parsers'
import { withRetry } from '../lib/retry'

// Legacy interface kept for type compatibility
export interface ReviewFeedback {
  overallScore: number
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
  productSpec: string
  architectureDesign: string
}

export async function runReviewerAgent(
  input: ReviewerAgentInput,
  onChunk: (text: string) => void,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured')

  const systemPrompt = `You are a senior technical reviewer and security engineer. Review coding plans critically but constructively. Identify risks, security issues, and gaps. Use markdown formatting.`

  const userPrompt = `# Review Request: "${input.title}"

## Product Specification
${input.productSpec}

## Architecture Design
${input.architectureDesign}

Review this plan and provide:
1. **Overall Score** — 1-10 with justification
2. **Verdict** — approved / needs_revision / rejected
3. **Strengths** — what's well thought out
4. **Concerns** — issues with severity (low/medium/high/critical), category, description, and specific recommendation
5. **Security Notes** — authentication, authorization, data protection considerations
6. **Scalability Notes** — performance, Cloudflare Workers limits, D1 SQLite constraints
7. **Estimated Effort** — developer days with breakdown`

  const response = await withRetry(async () => {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-3-7-sonnet-20250219',
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        stream: true,
        max_tokens: 4000,
      }),
    })

    if (!res.ok || !res.body) {
      const err = await res.text()
      throw new Error(`Anthropic API error ${res.status}: ${err}`)
    }

    return res
  })

  return parseAnthropicStream(response.body!, onChunk)
}
