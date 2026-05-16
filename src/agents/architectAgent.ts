/**
 * @module architectAgent
 * @description Milestone 5 — Enhanced Architect Agent.
 * Designs technical architecture for coding tasks using structured reasoning.
 * Uses modelRouter with extended thinking enabled for Anthropic (Claude Sonnet)
 * to produce high-quality architecture plans.
 *
 * Supports both streaming and non-streaming modes.
 *
 * Exports: runArchitectAgent, runArchitectAgentStreaming, ArchitectAgentInput,
 *          ArchitectAgentOutput, ArchitectAgentResult.
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

export interface ArchitectAgentOutput {
  overview: string
  approach: string
  components: Array<{ name: string; type: string; description: string }>
  filesToCreate: string[]
  filesToModify: string[]
  risks: string[]
  estimatedFiles: number
  score: number // 0-100 confidence
}

export interface ArchitectAgentInput {
  title: string
  projectName: string
  productSpec: string
  repoIntelligence?: string
  memoryContext?: string
  existingFiles?: Array<{ path: string; content: string }>
}

export interface ArchitectAgentResult {
  output: ArchitectAgentOutput
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
  return `You are a senior software architect. Design technical architecture for coding tasks.
Think deeply about component structure, dependencies, file organization, and risk.

You MUST respond with TWO sections:
1. A markdown architecture document (for human reading)
2. A JSON block with structured data

Format your response EXACTLY like this:

<markdown>
(your full markdown architecture document here)
</markdown>

<json>
{
  "overview": "High-level overview of the architecture",
  "approach": "Technical approach and key decisions",
  "components": [
    { "name": "ComponentName", "type": "api|ui|lib|config|test", "description": "What it does" }
  ],
  "filesToCreate": ["path/to/new/file.ts"],
  "filesToModify": ["path/to/existing/file.ts"],
  "risks": ["risk description"],
  "estimatedFiles": 5,
  "score": 85
}
</json>

Be thorough but practical. Focus on minimal, safe changes that accomplish the goal.
Score should reflect your confidence in the plan (0-100).`
}

function buildUserPrompt(input: ArchitectAgentInput): string {
  let prompt = `# Architecture Design Request
**Project:** ${input.projectName}
**Title:** ${input.title}

## Product Specification
${input.productSpec}`

  if (input.repoIntelligence) {
    prompt += `\n\n## Repository Intelligence\n${input.repoIntelligence}`
  }

  if (input.memoryContext) {
    prompt += `\n\n## Prior Context from Memory\n${input.memoryContext}`
  }

  if (input.existingFiles && input.existingFiles.length > 0) {
    prompt += `\n\n## Existing Source Files`
    for (const f of input.existingFiles) {
      prompt += `\n\n### ${f.path}\n\`\`\`\n${f.content.slice(0, 4000)}\n\`\`\``
    }
  }

  prompt += `\n\nDesign a technical architecture for this task. Include:
1. **Overview** — high-level description
2. **Approach** — technical approach and key decisions
3. **Components** — each component with name, type, and description
4. **Files to Create** — new files needed
5. **Files to Modify** — existing files to change
6. **Risks** — potential issues
7. **Estimated Files** — total file count
8. **Confidence Score** — 0-100`

  return prompt
}

// ─────────────────────────────────────────────────────────────────────────────
// Response parsing
// ─────────────────────────────────────────────────────────────────────────────

function parseResponse(raw: string): { output: ArchitectAgentOutput; markdown: string } {
  // Extract markdown section
  let markdown = raw
  const mdMatch = raw.match(/<markdown>([\s\S]*?)<\/markdown>/)
  if (mdMatch) {
    markdown = mdMatch[1].trim()
  }

  // Extract JSON section
  let output: ArchitectAgentOutput
  const jsonMatch = raw.match(/<json>([\s\S]*?)<\/json>/)
  if (jsonMatch) {
    output = extractJsonFromResponse<ArchitectAgentOutput>(jsonMatch[1])
  } else {
    output = extractJsonFromResponse<ArchitectAgentOutput>(raw)
  }

  // Validate and normalize
  output.overview = output.overview || ''
  output.approach = output.approach || ''
  output.components = Array.isArray(output.components) ? output.components : []
  output.filesToCreate = Array.isArray(output.filesToCreate) ? output.filesToCreate : []
  output.filesToModify = Array.isArray(output.filesToModify) ? output.filesToModify : []
  output.risks = Array.isArray(output.risks) ? output.risks : []
  output.estimatedFiles = typeof output.estimatedFiles === 'number'
    ? output.estimatedFiles
    : output.filesToCreate.length + output.filesToModify.length
  output.score = typeof output.score === 'number' && output.score >= 0 && output.score <= 100
    ? output.score
    : 70

  return { output, markdown }
}

// ─────────────────────────────────────────────────────────────────────────────
// Non-streaming runner
// ─────────────────────────────────────────────────────────────────────────────

export async function runArchitectAgent(
  input: ArchitectAgentInput,
): Promise<ArchitectAgentResult> {
  const startTime = Date.now()

  const result: ModelCallResult = await callModel('architect', {
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

export async function runArchitectAgentStreaming(
  input: ArchitectAgentInput,
  onChunk: (text: string) => void,
): Promise<ArchitectAgentResult> {
  const startTime = Date.now()

  const result: ModelCallResult = await callModelStreaming(
    'architect',
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
