/**
 * @module productAgent
 * @description Milestone 5 — Enhanced Product Agent.
 * Analyzes coding requests and produces structured product specifications.
 * Uses modelRouter for provider selection with automatic fallback.
 * Supports both streaming and non-streaming modes.
 *
 * Exports: runProductAgent, runProductAgentStreaming, ProductAgentInput,
 *          ProductAgentOutput, ProductAgentResult.
 */

import type { RepoContext } from '../lib/github'
import {
  callModel,
  callModelStreaming,
  extractJsonFromResponse,
} from '../lib/modelRouter'
import type { ModelCallResult } from '../lib/modelRouter'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ProductAgentOutput {
  summary: string
  acceptanceCriteria: string[]
  scope: { included: string[]; excluded: string[] }
  estimatedComplexity: 'low' | 'medium' | 'high'
  risks: string[]
  clarifications: string[]
}

export interface ProductAgentInput {
  title: string
  description: string
  projectName: string
  repoContext?: RepoContext
  memoryContext?: string
}

export interface ProductAgentResult {
  output: ProductAgentOutput
  markdown: string
  model: string
  provider: string
  durationMs: number
  fromFallback: boolean
  score: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Prompts
// ─────────────────────────────────────────────────────────────────────────────

function buildSystemPrompt(): string {
  return `You are a senior product manager. Analyze coding requests and produce clear, actionable product specifications.

You MUST respond with TWO sections:
1. A markdown product specification (for human reading)
2. A JSON block with structured data

Format your response EXACTLY like this:

<markdown>
(your full markdown product spec here)
</markdown>

<json>
{
  "summary": "2-3 sentence summary of what will be built",
  "acceptanceCriteria": ["criterion 1", "criterion 2"],
  "scope": { "included": ["item 1"], "excluded": ["item 1"] },
  "estimatedComplexity": "low" | "medium" | "high",
  "risks": ["risk 1"],
  "clarifications": ["question 1"]
}
</json>

Be concise, structured, and actionable.`
}

function buildUserPrompt(input: ProductAgentInput): string {
  let prompt = `# Coding Request
**Project:** ${input.projectName}
**Title:** ${input.title}
**Description:** ${input.description}`

  if (input.repoContext) {
    const rc = input.repoContext
    prompt += `\n\n## Repository: ${rc.owner}/${rc.repo}\n${rc.description || ''}`
    if (rc.structure) {
      prompt += `\n\n### File Structure\n${rc.structure}`
    }
    if (rc.files && rc.files.length > 0) {
      prompt += `\n\n### Key Files`
      for (const f of rc.files) {
        prompt += `\n\n#### ${f.path}\n\`\`\`\n${f.content.slice(0, 3000)}\n\`\`\``
      }
    }
  }

  if (input.memoryContext) {
    prompt += `\n\n## Prior Context from Memory\n${input.memoryContext}`
  }

  prompt += `\n\nWrite a product specification including:
1. **Summary** — 2-3 sentences describing what will be built
2. **Acceptance Criteria** — measurable criteria for completion
3. **Scope** — what's included and excluded
4. **Estimated Complexity** — low/medium/high with reasoning
5. **Risks** — potential issues or blockers
6. **Clarifications** — questions that should be answered before starting`

  return prompt
}

// ─────────────────────────────────────────────────────────────────────────────
// Response parsing
// ─────────────────────────────────────────────────────────────────────────────

function parseResponse(raw: string): { output: ProductAgentOutput; markdown: string } {
  // Extract markdown section
  let markdown = raw
  const mdMatch = raw.match(/<markdown>([\s\S]*?)<\/markdown>/)
  if (mdMatch) {
    markdown = mdMatch[1].trim()
  }

  // Extract JSON section
  let output: ProductAgentOutput
  const jsonMatch = raw.match(/<json>([\s\S]*?)<\/json>/)
  if (jsonMatch) {
    output = extractJsonFromResponse<ProductAgentOutput>(jsonMatch[1])
  } else {
    // Fallback: try to find JSON anywhere in the response
    output = extractJsonFromResponse<ProductAgentOutput>(raw)
  }

  // Validate and normalize
  output.summary = output.summary || ''
  output.acceptanceCriteria = Array.isArray(output.acceptanceCriteria)
    ? output.acceptanceCriteria
    : []
  output.scope = output.scope || { included: [], excluded: [] }
  output.scope.included = Array.isArray(output.scope.included) ? output.scope.included : []
  output.scope.excluded = Array.isArray(output.scope.excluded) ? output.scope.excluded : []
  output.estimatedComplexity = ['low', 'medium', 'high'].includes(output.estimatedComplexity)
    ? output.estimatedComplexity
    : 'medium'
  output.risks = Array.isArray(output.risks) ? output.risks : []
  output.clarifications = Array.isArray(output.clarifications) ? output.clarifications : []

  return { output, markdown }
}

function computeScore(output: ProductAgentOutput): number {
  let score = 50
  if (output.summary.length > 20) score += 10
  if (output.acceptanceCriteria.length >= 2) score += 10
  if (output.scope.included.length >= 1) score += 10
  if (output.risks.length >= 1) score += 10
  if (output.clarifications.length >= 0) score += 5
  if (output.estimatedComplexity) score += 5
  return Math.min(100, score)
}

// ─────────────────────────────────────────────────────────────────────────────
// Non-streaming runner
// ─────────────────────────────────────────────────────────────────────────────

export async function runProductAgent(
  input: ProductAgentInput,
): Promise<ProductAgentResult> {
  const startTime = Date.now()

  const result: ModelCallResult = await callModel('product', {
    systemPrompt: buildSystemPrompt(),
    userPrompt: buildUserPrompt(input),
  })

  const { output, markdown } = parseResponse(result.content)
  const score = computeScore(output)

  return {
    output,
    markdown,
    model: result.model,
    provider: result.provider,
    durationMs: Date.now() - startTime,
    fromFallback: result.fromFallback,
    score,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Streaming runner
// ─────────────────────────────────────────────────────────────────────────────

export async function runProductAgentStreaming(
  input: ProductAgentInput,
  onChunk: (text: string) => void,
): Promise<ProductAgentResult> {
  const startTime = Date.now()

  const result: ModelCallResult = await callModelStreaming(
    'product',
    {
      systemPrompt: buildSystemPrompt(),
      userPrompt: buildUserPrompt(input),
    },
    onChunk,
  )

  const { output, markdown } = parseResponse(result.content)
  const score = computeScore(output)

  return {
    output,
    markdown,
    model: result.model,
    provider: result.provider,
    durationMs: Date.now() - startTime,
    fromFallback: result.fromFallback,
    score,
  }
}
