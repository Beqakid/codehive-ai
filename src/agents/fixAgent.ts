/**
 * @module fixAgent
 * @description Milestone 5 — Enhanced Fix Agent.
 * Receives error context from failed CI/CD steps and proposes file corrections.
 * Uses modelRouter for provider selection with automatic fallback.
 * Supports healing policy, learned fixes from memory, and structured scoring.
 *
 * Returns strict JSON with full file replacements, confidence scores,
 * and risk assessment.
 *
 * Exports: runFixAgent, FixAgentInput, FixAgentResult.
 */

import {
  callModel,
  extractJsonFromResponse,
} from '../lib/modelRouter'
import type { ModelCallResult } from '../lib/modelRouter'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface MemoryEntry {
  errorCategory: string
  errorPattern: string
  fixApplied: string
  filesChanged?: string
  confidence?: number
}

export interface HealingDecision {
  shouldHeal: boolean
  strategy: string
  maxAttempts: number
  currentAttempt: number
  escalate: boolean
  reason?: string
}

export interface PreviousAttempt {
  attemptNumber: number
  errorCategory: string
  errorSummary: string
  fixSummary: string
  filesUpdated: string[]
  result: string
  confidence?: number
}

export interface FixAgentInput {
  projectName: string
  branchName: string
  failedCommand: string
  exitCode: number | null
  errorCategory: string
  errorSummary: string
  rawLogs: string
  repoFiles: Array<{ path: string; content: string }>
  packageJson?: string
  tsconfigJson?: string
  /** Lessons from past successful fixes — injected by memory system */
  lessons?: MemoryEntry[]
  /** Learned fixes retrieved from memory */
  learnedFixes?: MemoryEntry[]
  /** Healing policy decision */
  healingDecision?: HealingDecision
  previousAttempts: PreviousAttempt[]
}

export interface FixAgentResult {
  summary: string
  confidence: number
  rootCause: string
  filesToUpdate: Array<{ path: string; content: string }>
  commandsToRerun: string[]
  riskLevel: 'low' | 'medium' | 'high'
  needsHumanReview: boolean
  score: number // 0-100
}

// ─────────────────────────────────────────────────────────────────────────────
// Prompts
// ─────────────────────────────────────────────────────────────────────────────

function buildSystemPrompt(): string {
  return `You are an expert software engineer specializing in debugging and fixing CI/CD failures.
You receive failed workflow logs, error context, and source files from a GitHub Actions pipeline.
Your job is to analyze the failure, identify the root cause, and produce corrected file contents.

RULES:
- Return ONLY valid JSON — no markdown fences, no explanation outside the JSON object
- Start your response with { — do NOT write any text before the opening brace
- Use full file replacement — return the COMPLETE corrected file content for each file
- Only modify files that are directly related to the error
- Never delete files that aren't part of the error
- If the error is about missing dependencies, update package.json to add them
- If the error is a TypeScript type error, fix the types in the source files
- If tests fail, fix the implementation unless the test itself is clearly wrong
- Be conservative — make the minimum changes needed to fix the error
- If you are not confident the fix will work (< 65), set needsHumanReview to true
- If the fix is risky or changes many files, set riskLevel to "high"
- If lessons from previous successful fixes are provided, ALWAYS check them first
- Score (0-100) reflects overall quality and confidence of the fix

Your response must be EXACTLY this JSON structure (no other text before or after):
{
  "summary": "Brief description of what was fixed",
  "confidence": 0.85,
  "rootCause": "What caused the failure",
  "filesToUpdate": [
    { "path": "relative/file/path.ts", "content": "full corrected file content" }
  ],
  "commandsToRerun": ["npm test"],
  "riskLevel": "low",
  "needsHumanReview": false,
  "score": 85
}`
}

function buildUserPrompt(input: FixAgentInput): string {
  let prompt = `# Failed CI/CD Pipeline — Fix Required

## Project: ${input.projectName}
## Branch: ${input.branchName}
## Failed Command: ${input.failedCommand}
## Exit Code: ${input.exitCode ?? 'unknown'}
## Error Category: ${input.errorCategory}

## Error Summary
\`\`\`
${input.errorSummary}
\`\`\`

## Workflow Logs (truncated)
\`\`\`
${input.rawLogs.slice(0, 8000)}
\`\`\``

  // ── Healing decision context ───────────────────────────────────────────
  if (input.healingDecision) {
    prompt += `\n\n## Healing Policy`
    prompt += `\n- Strategy: ${input.healingDecision.strategy}`
    prompt += `\n- Attempt: ${input.healingDecision.currentAttempt} of ${input.healingDecision.maxAttempts}`
    if (input.healingDecision.reason) {
      prompt += `\n- Context: ${input.healingDecision.reason}`
    }
    if (input.healingDecision.escalate) {
      prompt += `\n- ⚠️ ESCALATION: previous strategies failed — try a fundamentally different approach`
    }
  }

  // ── Inject lessons from memory ─────────────────────────────────────────
  const allLessons = [...(input.lessons || []), ...(input.learnedFixes || [])]
  if (allLessons.length > 0) {
    // Deduplicate by errorPattern
    const seen = new Set<string>()
    const unique = allLessons.filter((l) => {
      if (seen.has(l.errorPattern)) return false
      seen.add(l.errorPattern)
      return true
    })

    prompt += `\n\n## ✅ Lessons from Previous Successful Fixes (CHECK THESE FIRST)`
    prompt += `\nThese patterns were observed in this project before and the fixes below resolved them.`
    prompt += `\nIf the current error matches any of these patterns, apply the same fix.`
    for (const lesson of unique) {
      prompt += `\n\n### Pattern: ${lesson.errorCategory}`
      prompt += `\n- Error pattern: ${lesson.errorPattern}`
      prompt += `\n- Fix that worked: ${lesson.fixApplied}`
      if (lesson.filesChanged) {
        prompt += `\n- Files typically involved: ${lesson.filesChanged}`
      }
      if (lesson.confidence !== undefined) {
        prompt += `\n- Agent confidence when applied: ${(lesson.confidence * 100).toFixed(0)}%`
      }
    }
  }

  if (input.packageJson) {
    prompt += `\n\n## package.json\n\`\`\`json\n${input.packageJson}\n\`\`\``
  }

  if (input.tsconfigJson) {
    prompt += `\n\n## tsconfig.json\n\`\`\`json\n${input.tsconfigJson}\n\`\`\``
  }

  if (input.repoFiles.length > 0) {
    prompt += `\n\n## Source Files (related to error)`
    for (const file of input.repoFiles) {
      prompt += `\n\n### ${file.path}\n\`\`\`\n${file.content.slice(0, 4000)}\n\`\`\``
    }
  }

  if (input.previousAttempts.length > 0) {
    prompt += `\n\n## Previous Fix Attempts (FAILED — do NOT repeat these approaches)`
    for (const attempt of input.previousAttempts) {
      prompt += `\n\n### Attempt ${attempt.attemptNumber}`
      prompt += `\n- Error: ${attempt.errorCategory}`
      prompt += `\n- Summary: ${attempt.errorSummary.slice(0, 200)}`
      prompt += `\n- Fix applied: ${attempt.fixSummary}`
      prompt += `\n- Files changed: ${attempt.filesUpdated.join(', ')}`
      if (attempt.confidence !== undefined) {
        prompt += `\n- Confidence: ${(attempt.confidence * 100).toFixed(0)}%`
      }
      prompt += `\n- Result: ${attempt.result}`
    }
    prompt += `\n\nIMPORTANT: The above fixes did NOT work. You must try a DIFFERENT approach.`
  }

  prompt += `\n\nAnalyze the error and return a JSON fix. Only modify files needed to resolve this specific failure. Start your response with { immediately.`
  return prompt
}

// ─────────────────────────────────────────────────────────────────────────────
// Runner
// ─────────────────────────────────────────────────────────────────────────────

export async function runFixAgent(
  input: FixAgentInput,
  onChunk?: (text: string) => void,
): Promise<FixAgentResult> {
  const startTime = Date.now()

  const result: ModelCallResult = await callModel('fix', {
    systemPrompt: buildSystemPrompt(),
    userPrompt: buildUserPrompt(input),
  })

  if (onChunk) onChunk(result.content.slice(0, 200))

  const parsed = extractJsonFromResponse<FixAgentResult>(result.content)

  // Validate required fields
  if (!parsed.summary || !parsed.rootCause || !Array.isArray(parsed.filesToUpdate)) {
    throw new Error('Fix Agent response missing required fields (summary, rootCause, filesToUpdate)')
  }

  // Normalize numeric confidence (0-1 scale)
  if (typeof parsed.confidence !== 'number' || parsed.confidence < 0 || parsed.confidence > 1) {
    // Handle case where model returns 0-100 instead of 0-1
    if (typeof parsed.confidence === 'number' && parsed.confidence > 1 && parsed.confidence <= 100) {
      parsed.confidence = parsed.confidence / 100
    } else {
      parsed.confidence = 0.5
    }
  }

  // Normalize riskLevel
  if (!['low', 'medium', 'high'].includes(parsed.riskLevel)) {
    parsed.riskLevel = 'medium'
  }

  // Normalize boolean
  if (typeof parsed.needsHumanReview !== 'boolean') {
    parsed.needsHumanReview = false
  }

  // Normalize score (0-100)
  if (typeof parsed.score !== 'number' || parsed.score < 0 || parsed.score > 100) {
    parsed.score = Math.round(parsed.confidence * 100)
  }

  // Normalize commandsToRerun
  if (!Array.isArray(parsed.commandsToRerun)) {
    parsed.commandsToRerun = []
  }

  // Log timing
  const durationMs = Date.now() - startTime
  console.log(
    `Fix Agent completed in ${durationMs}ms using ${result.provider}/${result.model}` +
    ` (confidence: ${(parsed.confidence * 100).toFixed(0)}%, score: ${parsed.score})`,
  )

  return parsed
}
