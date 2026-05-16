/**
 * @module memoryAgent
 * @description Milestone 5 — Memory Agent.
 * Analyzes completed pipeline runs and extracts lessons learned for the
 * memory system. Identifies patterns from errors, fixes, healing cycles,
 * and reviewer feedback to improve future runs.
 *
 * Uses the cheapest model (Haiku/GPT-4.1-mini) since this is summarization work.
 * Non-streaming only.
 *
 * Exports: runMemoryAgent, MemoryAgentInput, MemoryAgentOutput,
 *          MemoryAgentResult, MemoryType.
 */

import {
  callModel,
  extractJsonFromResponse,
} from '../lib/modelRouter'
import type { ModelCallResult } from '../lib/modelRouter'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type MemoryType =
  | 'error_fix'
  | 'architecture_pattern'
  | 'code_pattern'
  | 'review_feedback'
  | 'scope_rule'
  | 'performance_insight'
  | 'dependency_issue'
  | 'test_pattern'

export interface LessonLearned {
  type: MemoryType
  content: string
  confidence: number // 0-1
}

export interface MemoryAgentOutput {
  lessonsLearned: LessonLearned[]
  updatedRules: string[]
  summary: string
}

export interface PatchRecord {
  filePath: string
  operation: string
  reasoning: string
}

export interface ErrorRecord {
  step: string
  message: string
  category: string
  wasFixed: boolean
}

export interface HealingRecord {
  attempt: number
  strategy: string
  success: boolean
  errorCategory: string
  fixSummary: string
}

export interface MemoryAgentInput {
  projectName: string
  taskTitle: string
  runOutcome: 'success' | 'partial_success' | 'failure'
  patchesApplied: PatchRecord[]
  errorsEncountered: ErrorRecord[]
  healingResults: HealingRecord[]
  verdictAction?: string
  verdictScore?: number
  reviewerDecision?: string
  reviewerReasons?: string[]
  totalDurationMs?: number
}

export interface MemoryAgentResult {
  output: MemoryAgentOutput
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
  return `You are an AI memory analyst. Analyze completed pipeline runs and extract lessons learned for future reference.
Your job is to identify patterns that should be remembered for future runs of the same project.

You MUST respond with ONLY a valid JSON object — no markdown, no explanation, no preamble.
Start your response with { immediately.

Types of lessons you can extract:
- "error_fix": A specific error pattern and how it was resolved
- "architecture_pattern": A structural pattern that worked well or poorly
- "code_pattern": A coding pattern or convention that should be followed
- "review_feedback": Reviewer feedback that should inform future code generation
- "scope_rule": A scope constraint that should be remembered
- "performance_insight": A performance observation
- "dependency_issue": A dependency problem and its resolution
- "test_pattern": A testing pattern or gap to remember

Your response must match this exact structure:
{
  "lessonsLearned": [
    {
      "type": "error_fix",
      "content": "Description of the lesson — what happened and what to do about it",
      "confidence": 0.85
    }
  ],
  "updatedRules": ["New rule or updated rule for future runs"],
  "summary": "Brief summary of what was learned from this run"
}

Rules:
- Extract 1-5 lessons per run — only meaningful, actionable lessons
- Confidence (0-1): how confident you are this lesson is correct and generalizable
- Only extract lessons that would help in future runs — skip obvious or trivial things
- For error fixes, include the error pattern so it can be matched later
- For review feedback, extract the actionable part
- updatedRules should be project-specific rules derived from this run`
}

function buildUserPrompt(input: MemoryAgentInput): string {
  let prompt = `# Pipeline Run Analysis: ${input.projectName}
**Task:** ${input.taskTitle}
**Outcome:** ${input.runOutcome}`

  if (input.totalDurationMs) {
    prompt += `\n**Duration:** ${Math.round(input.totalDurationMs / 1000)}s`
  }

  if (input.verdictAction) {
    prompt += `\n**Verdict:** ${input.verdictAction} (score: ${input.verdictScore ?? 'n/a'})`
  }

  if (input.reviewerDecision) {
    prompt += `\n**Reviewer:** ${input.reviewerDecision}`
    if (input.reviewerReasons && input.reviewerReasons.length > 0) {
      prompt += `\n**Reviewer Reasons:**\n${input.reviewerReasons.map((r) => `- ${r}`).join('\n')}`
    }
  }

  // Patches
  if (input.patchesApplied.length > 0) {
    prompt += `\n\n## Patches Applied (${input.patchesApplied.length})`
    for (const patch of input.patchesApplied) {
      prompt += `\n- **${patch.operation}** ${patch.filePath}: ${patch.reasoning}`
    }
  }

  // Errors
  if (input.errorsEncountered.length > 0) {
    prompt += `\n\n## Errors Encountered (${input.errorsEncountered.length})`
    for (const err of input.errorsEncountered) {
      prompt += `\n- **[${err.category}]** ${err.step}: ${err.message} (${err.wasFixed ? '✅ fixed' : '❌ not fixed'})`
    }
  }

  // Healing
  if (input.healingResults.length > 0) {
    prompt += `\n\n## Healing Cycles (${input.healingResults.length})`
    for (const heal of input.healingResults) {
      prompt += `\n- Attempt ${heal.attempt} (${heal.strategy}): ${heal.errorCategory} — ${heal.fixSummary} (${heal.success ? '✅' : '❌'})`
    }
  }

  prompt += `\n\nAnalyze this run and extract lessons learned. Return JSON only — start with { immediately.`
  return prompt
}

// ─────────────────────────────────────────────────────────────────────────────
// Score computation
// ─────────────────────────────────────────────────────────────────────────────

function computeScore(output: MemoryAgentOutput): number {
  let score = 40
  if (output.lessonsLearned.length >= 1) score += 15
  if (output.lessonsLearned.length >= 3) score += 10
  if (output.updatedRules.length >= 1) score += 10
  if (output.summary && output.summary.length > 10) score += 10

  // Bonus for high-confidence lessons
  const avgConfidence = output.lessonsLearned.length > 0
    ? output.lessonsLearned.reduce((sum, l) => sum + l.confidence, 0) / output.lessonsLearned.length
    : 0
  if (avgConfidence >= 0.8) score += 15

  return Math.min(100, score)
}

// ─────────────────────────────────────────────────────────────────────────────
// Runner
// ─────────────────────────────────────────────────────────────────────────────

export async function runMemoryAgent(
  input: MemoryAgentInput,
): Promise<MemoryAgentResult> {
  const startTime = Date.now()

  const result: ModelCallResult = await callModel('memory', {
    systemPrompt: buildSystemPrompt(),
    userPrompt: buildUserPrompt(input),
    jsonMode: true,
  })

  const output = extractJsonFromResponse<MemoryAgentOutput>(result.content)

  // Validate and normalize
  output.lessonsLearned = Array.isArray(output.lessonsLearned) ? output.lessonsLearned : []
  for (const lesson of output.lessonsLearned) {
    const validTypes: MemoryType[] = [
      'error_fix', 'architecture_pattern', 'code_pattern', 'review_feedback',
      'scope_rule', 'performance_insight', 'dependency_issue', 'test_pattern',
    ]
    if (!validTypes.includes(lesson.type)) {
      lesson.type = 'code_pattern' // safe default
    }
    lesson.content = lesson.content || ''
    if (typeof lesson.confidence !== 'number' || lesson.confidence < 0 || lesson.confidence > 1) {
      lesson.confidence = 0.5
    }
  }

  output.updatedRules = Array.isArray(output.updatedRules) ? output.updatedRules : []
  output.summary = output.summary || ''

  const score = computeScore(output)

  return {
    output,
    model: result.model,
    provider: result.provider,
    durationMs: Date.now() - startTime,
    fromFallback: result.fromFallback,
    score,
  }
}
