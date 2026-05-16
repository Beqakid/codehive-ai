/**
 * @module repoIntelligenceAgent
 * @description Milestone 5 — Repo Intelligence Agent.
 * Analyzes repository structure, dependencies, and architecture to produce
 * a structured intelligence report. Identifies impacted areas, protected files,
 * and provides recommendations for safe code generation.
 *
 * Uses cost-efficient model (GPT-4.1-mini or Haiku) since this is structured extraction.
 * Non-streaming only.
 *
 * Exports: runRepoIntelligenceAgent, RepoIntelligenceInput,
 *          RepoIntelligenceOutput, RepoIntelligenceResult.
 */

import {
  callModel,
  extractJsonFromResponse,
} from '../lib/modelRouter'
import type { ModelCallResult } from '../lib/modelRouter'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface RepoIntelligenceOutput {
  architecture: string
  techStack: string[]
  impactedAreas: string[]
  dependencies: string[]
  protectedAreas: string[]
  recommendations: string[]
}

export interface RepoIntelligenceInput {
  projectName: string
  fileList: string[]
  packageDependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  protectedFiles?: string[]
  configFiles?: Array<{ path: string; content: string }>
  taskDescription?: string
}

export interface RepoIntelligenceResult {
  output: RepoIntelligenceOutput
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
  return `You are a senior software architect specializing in repository analysis and codebase intelligence.
Your job is to analyze a repository's structure, dependencies, and architecture, then produce a structured intelligence report.

You MUST respond with ONLY a valid JSON object — no markdown, no explanation, no preamble.
Start your response with { immediately.

Your response must match this exact structure:
{
  "architecture": "Description of the overall architecture pattern (e.g., monorepo, microservices, MVC, etc.)",
  "techStack": ["technology1", "technology2"],
  "impactedAreas": ["area that may be affected by changes"],
  "dependencies": ["key external dependency"],
  "protectedAreas": ["files/directories that should not be modified without review"],
  "recommendations": ["recommendation for safe code changes"]
}`
}

function buildUserPrompt(input: RepoIntelligenceInput): string {
  let prompt = `# Repository Analysis: ${input.projectName}\n`

  if (input.taskDescription) {
    prompt += `\n## Task Context\n${input.taskDescription}\n`
  }

  // File structure
  prompt += `\n## File Structure (${input.fileList.length} files)\n`
  const fileSample = input.fileList.slice(0, 200)
  prompt += `\`\`\`\n${fileSample.join('\n')}\n\`\`\``
  if (input.fileList.length > 200) {
    prompt += `\n... and ${input.fileList.length - 200} more files`
  }

  // Dependencies
  if (input.packageDependencies && Object.keys(input.packageDependencies).length > 0) {
    prompt += `\n\n## Production Dependencies\n\`\`\`json\n${JSON.stringify(input.packageDependencies, null, 2)}\n\`\`\``
  }
  if (input.devDependencies && Object.keys(input.devDependencies).length > 0) {
    prompt += `\n\n## Dev Dependencies\n\`\`\`json\n${JSON.stringify(input.devDependencies, null, 2)}\n\`\`\``
  }

  // Protected files
  if (input.protectedFiles && input.protectedFiles.length > 0) {
    prompt += `\n\n## Known Protected Files\n${input.protectedFiles.map((f) => `- ${f}`).join('\n')}`
  }

  // Config files
  if (input.configFiles && input.configFiles.length > 0) {
    prompt += `\n\n## Configuration Files`
    for (const cf of input.configFiles) {
      prompt += `\n\n### ${cf.path}\n\`\`\`\n${cf.content.slice(0, 2000)}\n\`\`\``
    }
  }

  prompt += `\n\nAnalyze this repository and return a JSON intelligence report. Start with { immediately.`
  return prompt
}

// ─────────────────────────────────────────────────────────────────────────────
// Score computation
// ─────────────────────────────────────────────────────────────────────────────

function computeScore(output: RepoIntelligenceOutput): number {
  let score = 40
  if (output.architecture && output.architecture.length > 10) score += 15
  if (output.techStack.length >= 2) score += 10
  if (output.impactedAreas.length >= 1) score += 10
  if (output.dependencies.length >= 1) score += 5
  if (output.protectedAreas.length >= 1) score += 10
  if (output.recommendations.length >= 1) score += 10
  return Math.min(100, score)
}

// ─────────────────────────────────────────────────────────────────────────────
// Runner
// ─────────────────────────────────────────────────────────────────────────────

export async function runRepoIntelligenceAgent(
  input: RepoIntelligenceInput,
): Promise<RepoIntelligenceResult> {
  const startTime = Date.now()

  const result: ModelCallResult = await callModel('repo_intelligence', {
    systemPrompt: buildSystemPrompt(),
    userPrompt: buildUserPrompt(input),
    jsonMode: true,
  })

  const output = extractJsonFromResponse<RepoIntelligenceOutput>(result.content)

  // Validate and normalize
  output.architecture = output.architecture || 'unknown'
  output.techStack = Array.isArray(output.techStack) ? output.techStack : []
  output.impactedAreas = Array.isArray(output.impactedAreas) ? output.impactedAreas : []
  output.dependencies = Array.isArray(output.dependencies) ? output.dependencies : []
  output.protectedAreas = Array.isArray(output.protectedAreas) ? output.protectedAreas : []
  output.recommendations = Array.isArray(output.recommendations) ? output.recommendations : []

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
