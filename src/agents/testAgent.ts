/**
 * @module testAgent
 * @description Milestone 5 — Test Agent.
 * Interprets lint, test, and build output from CI/CD execution steps.
 * Categorizes failures by step, extracts individual errors, and determines
 * whether failures are fixable by the fix agent.
 *
 * Uses GPT-4.1 (primary) via modelRouter for debug/analysis capability.
 * Non-streaming only.
 *
 * Exports: runTestAgent, TestAgentInput, TestAgentOutput, TestAgentResult.
 */

import {
  callModel,
  extractJsonFromResponse,
} from '../lib/modelRouter'
import type { ModelCallResult } from '../lib/modelRouter'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface TestError {
  message: string
  file?: string
  severity: string
}

export interface TestCategory {
  step: string
  status: 'passed' | 'failed' | 'skipped'
  errorCount: number
  errors: TestError[]
}

export interface TestAgentOutput {
  overallStatus: 'passed' | 'failed' | 'partial'
  categories: TestCategory[]
  fixable: boolean
  fixSuggestions: string[]
  score: number // 0-100 test confidence
  summary: string
}

export interface ExecutionStep {
  name: string
  command: string
  exitCode: number | null
  stdout: string
  stderr: string
  durationMs?: number
}

export interface TestAgentInput {
  projectName: string
  steps: ExecutionStep[]
  patchesSummary?: string
}

export interface TestAgentResult {
  output: TestAgentOutput
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
  return `You are a senior CI/CD engineer and testing specialist. Analyze execution logs from lint, test, and build steps.
Categorize each failure, extract specific errors, and determine if failures are automatically fixable.

You MUST respond with ONLY a valid JSON object — no markdown, no explanation, no preamble.
Start your response with { immediately.

Your response must match this exact structure:
{
  "overallStatus": "passed" | "failed" | "partial",
  "categories": [
    {
      "step": "lint" | "test" | "build" | "typecheck" | "format" | "other",
      "status": "passed" | "failed" | "skipped",
      "errorCount": 0,
      "errors": [
        { "message": "error description", "file": "path/to/file.ts", "severity": "error" | "warning" | "info" }
      ]
    }
  ],
  "fixable": true,
  "fixSuggestions": ["suggestion for how to fix"],
  "score": 85,
  "summary": "Brief summary of test results"
}

Rules:
- "passed" = all steps succeeded (exit code 0)
- "failed" = any step has a non-zero exit code
- "partial" = some steps passed, some failed
- "fixable" = true if errors look like they can be fixed by an AI code agent
- Score 0-100: 100 = all passing, 0 = everything broken
- Be specific about error messages and affected files`
}

function buildUserPrompt(input: TestAgentInput): string {
  let prompt = `# CI/CD Execution Results for ${input.projectName}\n`

  if (input.patchesSummary) {
    prompt += `\n## Changes Applied\n${input.patchesSummary}\n`
  }

  prompt += `\n## Execution Steps (${input.steps.length} total)\n`

  for (const step of input.steps) {
    prompt += `\n### Step: ${step.name}`
    prompt += `\n**Command:** \`${step.command}\``
    prompt += `\n**Exit Code:** ${step.exitCode ?? 'unknown'}`
    if (step.durationMs) {
      prompt += `\n**Duration:** ${step.durationMs}ms`
    }

    if (step.stdout) {
      const truncated = step.stdout.slice(-4000) // last 4KB most relevant
      prompt += `\n\n**stdout:**\n\`\`\`\n${truncated}\n\`\`\``
    }

    if (step.stderr) {
      const truncated = step.stderr.slice(-4000)
      prompt += `\n\n**stderr:**\n\`\`\`\n${truncated}\n\`\`\``
    }
  }

  prompt += `\n\nAnalyze these execution results and return a JSON report. Start with { immediately.`
  return prompt
}

// ─────────────────────────────────────────────────────────────────────────────
// Runner
// ─────────────────────────────────────────────────────────────────────────────

export async function runTestAgent(
  input: TestAgentInput,
): Promise<TestAgentResult> {
  const startTime = Date.now()

  const result: ModelCallResult = await callModel('test', {
    systemPrompt: buildSystemPrompt(),
    userPrompt: buildUserPrompt(input),
    jsonMode: true,
  })

  const output = extractJsonFromResponse<TestAgentOutput>(result.content)

  // Validate and normalize
  const validStatuses = ['passed', 'failed', 'partial']
  if (!validStatuses.includes(output.overallStatus)) {
    output.overallStatus = 'failed'
  }

  output.categories = Array.isArray(output.categories) ? output.categories : []
  for (const cat of output.categories) {
    const validStepStatuses = ['passed', 'failed', 'skipped']
    if (!validStepStatuses.includes(cat.status)) {
      cat.status = 'failed'
    }
    cat.errorCount = typeof cat.errorCount === 'number' ? cat.errorCount : (cat.errors?.length || 0)
    cat.errors = Array.isArray(cat.errors) ? cat.errors : []
  }

  output.fixable = typeof output.fixable === 'boolean' ? output.fixable : false
  output.fixSuggestions = Array.isArray(output.fixSuggestions) ? output.fixSuggestions : []
  output.score = typeof output.score === 'number' && output.score >= 0 && output.score <= 100
    ? output.score
    : 0
  output.summary = output.summary || ''

  return {
    output,
    model: result.model,
    provider: result.provider,
    durationMs: Date.now() - startTime,
    fromFallback: result.fromFallback,
    score: output.score,
  }
}
