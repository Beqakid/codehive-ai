/**
 * @module codeAgent
 * @description Milestone 5 — Code Agent.
 * Generates code patches based on an architecture plan. Produces structured
 * patch operations (add_file, modify_file, append_code) with full file contents.
 * Obeys scope rules and protected file constraints.
 *
 * Uses Claude Sonnet (primary) via modelRouter with extended token limits.
 * Non-streaming only — returns JSON.
 *
 * Exports: runCodeAgent, CodeAgentInput, CodeAgentOutput, CodeAgentResult.
 */

import {
  callModel,
  extractJsonFromResponse,
} from '../lib/modelRouter'
import type { ModelCallResult } from '../lib/modelRouter'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface CodePatch {
  filePath: string
  operation: 'add_file' | 'modify_file' | 'append_code'
  content: string
  reasoning: string
}

export interface CodeAgentOutput {
  patches: CodePatch[]
  summary: string
  confidence: number // 0-100
  score: number // 0-100
}

export interface ScopeRules {
  allowedPaths?: string[]
  blockedPaths?: string[]
  protectedFiles?: string[]
  maxNewFiles?: number
}

export interface CodeAgentInput {
  projectName: string
  title: string
  architectPlan: string
  existingFiles?: Array<{ path: string; content: string }>
  scopeRules?: ScopeRules
  productSpec?: string
  repoIntelligence?: string
}

export interface CodeAgentResult {
  output: CodeAgentOutput
  model: string
  provider: string
  durationMs: number
  fromFallback: boolean
  score: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Prompts
// ─────────────────────────────────────────────────────────────────────────────

function buildSystemPrompt(scopeRules?: ScopeRules): string {
  let rules = `You are an expert software engineer. Generate code patches based on an architecture plan.

RULES:
- Return ONLY valid JSON — no markdown fences, no explanation outside the JSON object
- Start your response with { — do NOT write any text before the opening brace
- Use full file content for each patch — return the COMPLETE file content
- For "modify_file" operations, return the full modified file content
- For "add_file" operations, return the complete new file content
- For "append_code" operations, return only the code to append
- Be conservative — implement exactly what the architecture plan specifies
- Include clear reasoning for each patch
- Set confidence and score (0-100) reflecting how well patches implement the plan`

  if (scopeRules) {
    if (scopeRules.blockedPaths && scopeRules.blockedPaths.length > 0) {
      rules += `\n\nBLOCKED PATHS — do NOT create or modify files in these paths:\n${scopeRules.blockedPaths.map((p) => `- ${p}`).join('\n')}`
    }
    if (scopeRules.protectedFiles && scopeRules.protectedFiles.length > 0) {
      rules += `\n\nPROTECTED FILES — do NOT modify these files:\n${scopeRules.protectedFiles.map((p) => `- ${p}`).join('\n')}`
    }
    if (scopeRules.allowedPaths && scopeRules.allowedPaths.length > 0) {
      rules += `\n\nALLOWED PATHS — only create/modify files under these paths:\n${scopeRules.allowedPaths.map((p) => `- ${p}`).join('\n')}`
    }
    if (scopeRules.maxNewFiles) {
      rules += `\n\nMAX NEW FILES: ${scopeRules.maxNewFiles}`
    }
  }

  rules += `\n\nYour response must be EXACTLY this JSON structure:
{
  "patches": [
    {
      "filePath": "relative/path/to/file.ts",
      "operation": "add_file" | "modify_file" | "append_code",
      "content": "full file content here",
      "reasoning": "why this change is needed"
    }
  ],
  "summary": "Brief description of all changes",
  "confidence": 85,
  "score": 85
}`

  return rules
}

function buildUserPrompt(input: CodeAgentInput): string {
  let prompt = `# Code Generation Request
**Project:** ${input.projectName}
**Title:** ${input.title}

## Architecture Plan
${input.architectPlan}`

  if (input.productSpec) {
    prompt += `\n\n## Product Specification\n${input.productSpec}`
  }

  if (input.repoIntelligence) {
    prompt += `\n\n## Repository Intelligence\n${input.repoIntelligence}`
  }

  if (input.existingFiles && input.existingFiles.length > 0) {
    prompt += `\n\n## Existing Source Files`
    for (const f of input.existingFiles) {
      prompt += `\n\n### ${f.path}\n\`\`\`\n${f.content.slice(0, 6000)}\n\`\`\``
    }
  }

  prompt += `\n\nGenerate code patches to implement this architecture plan. Return JSON only — start with { immediately.`
  return prompt
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

function validatePatches(output: CodeAgentOutput, scopeRules?: ScopeRules): CodeAgentOutput {
  // Filter out patches that violate scope rules
  if (scopeRules) {
    output.patches = output.patches.filter((patch) => {
      // Check blocked paths
      if (scopeRules.blockedPaths) {
        for (const blocked of scopeRules.blockedPaths) {
          if (patch.filePath.startsWith(blocked)) {
            console.warn(`Code Agent: Filtered blocked patch for ${patch.filePath}`)
            return false
          }
        }
      }

      // Check protected files
      if (scopeRules.protectedFiles) {
        if (
          patch.operation === 'modify_file' &&
          scopeRules.protectedFiles.includes(patch.filePath)
        ) {
          console.warn(`Code Agent: Filtered protected file patch for ${patch.filePath}`)
          return false
        }
      }

      // Check allowed paths
      if (scopeRules.allowedPaths && scopeRules.allowedPaths.length > 0) {
        const allowed = scopeRules.allowedPaths.some((p) => patch.filePath.startsWith(p))
        if (!allowed) {
          console.warn(`Code Agent: Filtered out-of-scope patch for ${patch.filePath}`)
          return false
        }
      }

      return true
    })
  }

  // Validate patch operations
  const validOps = ['add_file', 'modify_file', 'append_code']
  output.patches = output.patches.filter((p) => {
    if (!validOps.includes(p.operation)) {
      p.operation = 'modify_file' // default fallback
    }
    return p.filePath && p.content
  })

  return output
}

// ─────────────────────────────────────────────────────────────────────────────
// Runner
// ─────────────────────────────────────────────────────────────────────────────

export async function runCodeAgent(
  input: CodeAgentInput,
): Promise<CodeAgentResult> {
  const startTime = Date.now()

  const result: ModelCallResult = await callModel('code', {
    systemPrompt: buildSystemPrompt(input.scopeRules),
    userPrompt: buildUserPrompt(input),
  })

  let output = extractJsonFromResponse<CodeAgentOutput>(result.content)

  // Validate and normalize
  output.patches = Array.isArray(output.patches) ? output.patches : []
  output.summary = output.summary || ''
  output.confidence = typeof output.confidence === 'number' && output.confidence >= 0 && output.confidence <= 100
    ? output.confidence
    : 50
  output.score = typeof output.score === 'number' && output.score >= 0 && output.score <= 100
    ? output.score
    : output.confidence

  // Enforce scope rules
  output = validatePatches(output, input.scopeRules)

  return {
    output,
    model: result.model,
    provider: result.provider,
    durationMs: Date.now() - startTime,
    fromFallback: result.fromFallback,
    score: output.score,
  }
}
