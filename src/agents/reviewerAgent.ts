/**
 * @module reviewerAgent
 * @description Milestone 5 — Enhanced Reviewer Agent.
 * Reviews code changes and produces a formal verdict with structured scoring.
 * Deliberately uses a DIFFERENT model provider from the Code Agent for independence
 * (GPT-4.1 primary, ensuring cross-model review).
 *
 * Supports both streaming and non-streaming modes.
 *
 * Exports: runReviewerAgent, runReviewerAgentStreaming, ReviewerAgentInput,
 *          ReviewerAgentOutput, ReviewerAgentResult.
 */

import {
  callModel,
  callModelStreaming,
  extractJsonFromResponse,
} from '../lib/modelRouter'
import type { ModelCallResult } from '../lib/modelRouter'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ReviewerAgentOutput {
  decision: 'approve' | 'reject' | 'needs_changes'
  score: number // 0-100
  reasons: string[]
  riskyFiles: string[]
  missingTests: string[]
  rollbackConcerns: string[]
  securityIssues: string[]
  recommendation: string
  summary: string
}

export interface ReviewerAgentInput {
  title: string
  projectName: string
  diff?: string
  patches?: Array<{ filePath: string; operation: string; content: string; reasoning: string }>
  riskReport?: string
  testResults?: string
  rollbackPlan?: string
  productSpec?: string
  architecturePlan?: string
}

export interface ReviewerAgentResult {
  output: ReviewerAgentOutput
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
  return `You are a senior technical reviewer and security engineer. Review code changes critically but constructively.
Identify risks, security issues, missing tests, and rollback concerns.

You MUST respond with TWO sections:
1. A markdown review (for human reading)
2. A JSON block with the formal verdict

Format your response EXACTLY like this:

<markdown>
(your full markdown review here)
</markdown>

<json>
{
  "decision": "approve" | "reject" | "needs_changes",
  "score": 85,
  "reasons": ["reason for the decision"],
  "riskyFiles": ["path/to/risky/file.ts"],
  "missingTests": ["what tests should be added"],
  "rollbackConcerns": ["concern about rollback"],
  "securityIssues": ["security concern"],
  "recommendation": "overall recommendation",
  "summary": "brief verdict summary"
}
</json>

Scoring guidelines:
- 90-100: Excellent — safe to auto-merge
- 70-89: Good — minor concerns, safe with human glance
- 50-69: Moderate — needs_changes before merging
- 0-49: Poor — reject, significant issues

Be thorough. Check for:
- Type safety issues
- Missing error handling
- Security vulnerabilities (injection, auth bypass, data exposure)
- Missing or inadequate tests
- Breaking changes
- Rollback safety
- Performance concerns`
}

function buildUserPrompt(input: ReviewerAgentInput): string {
  let prompt = `# Code Review Request: "${input.title}"
**Project:** ${input.projectName}\n`

  if (input.productSpec) {
    prompt += `\n## Product Specification\n${input.productSpec}\n`
  }

  if (input.architecturePlan) {
    prompt += `\n## Architecture Plan\n${input.architecturePlan}\n`
  }

  if (input.diff) {
    prompt += `\n## Diff\n\`\`\`diff\n${input.diff.slice(0, 12000)}\n\`\`\``
  }

  if (input.patches && input.patches.length > 0) {
    prompt += `\n\n## Patches (${input.patches.length} files)`
    for (const patch of input.patches) {
      prompt += `\n\n### ${patch.operation}: ${patch.filePath}`
      prompt += `\n**Reasoning:** ${patch.reasoning}`
      prompt += `\n\`\`\`\n${patch.content.slice(0, 4000)}\n\`\`\``
    }
  }

  if (input.riskReport) {
    prompt += `\n\n## Risk Report\n${input.riskReport}`
  }

  if (input.testResults) {
    prompt += `\n\n## Test Results\n${input.testResults}`
  }

  if (input.rollbackPlan) {
    prompt += `\n\n## Rollback Plan\n${input.rollbackPlan}`
  }

  prompt += `\n\nReview these changes and provide your verdict.`
  return prompt
}

// ─────────────────────────────────────────────────────────────────────────────
// Response parsing
// ─────────────────────────────────────────────────────────────────────────────

function parseResponse(raw: string): { output: ReviewerAgentOutput; markdown: string } {
  // Extract markdown section
  let markdown = raw
  const mdMatch = raw.match(/<markdown>([\s\S]*?)<\/markdown>/)
  if (mdMatch) {
    markdown = mdMatch[1].trim()
  }

  // Extract JSON section
  let output: ReviewerAgentOutput
  const jsonMatch = raw.match(/<json>([\s\S]*?)<\/json>/)
  if (jsonMatch) {
    output = extractJsonFromResponse<ReviewerAgentOutput>(jsonMatch[1])
  } else {
    output = extractJsonFromResponse<ReviewerAgentOutput>(raw)
  }

  // Validate and normalize
  const validDecisions = ['approve', 'reject', 'needs_changes']
  if (!validDecisions.includes(output.decision)) {
    output.decision = 'needs_changes'
  }

  output.score = typeof output.score === 'number' && output.score >= 0 && output.score <= 100
    ? output.score
    : 50
  output.reasons = Array.isArray(output.reasons) ? output.reasons : []
  output.riskyFiles = Array.isArray(output.riskyFiles) ? output.riskyFiles : []
  output.missingTests = Array.isArray(output.missingTests) ? output.missingTests : []
  output.rollbackConcerns = Array.isArray(output.rollbackConcerns) ? output.rollbackConcerns : []
  output.securityIssues = Array.isArray(output.securityIssues) ? output.securityIssues : []
  output.recommendation = output.recommendation || ''
  output.summary = output.summary || ''

  return { output, markdown }
}

// ─────────────────────────────────────────────────────────────────────────────
// Non-streaming runner
// ─────────────────────────────────────────────────────────────────────────────

export async function runReviewerAgent(
  input: ReviewerAgentInput,
): Promise<ReviewerAgentResult> {
  const startTime = Date.now()

  const result: ModelCallResult = await callModel('reviewer', {
    systemPrompt: buildSystemPrompt(),
    userPrompt: buildUserPrompt(input),
  })

  const { output, markdown } = parseResponse(result.content)

  return {
    output,
    markdown,
    model: result.model,
    provider: result.provider,
    durationMs: Date.now() - startTime,
    fromFallback: result.fromFallback,
    score: output.score,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Streaming runner
// ─────────────────────────────────────────────────────────────────────────────

export async function runReviewerAgentStreaming(
  input: ReviewerAgentInput,
  onChunk: (text: string) => void,
): Promise<ReviewerAgentResult> {
  const startTime = Date.now()

  const result: ModelCallResult = await callModelStreaming(
    'reviewer',
    {
      systemPrompt: buildSystemPrompt(),
      userPrompt: buildUserPrompt(input),
    },
    onChunk,
  )

  const { output, markdown } = parseResponse(result.content)

  return {
    output,
    markdown,
    model: result.model,
    provider: result.provider,
    durationMs: Date.now() - startTime,
    fromFallback: result.fromFallback,
    score: output.score,
  }
}
