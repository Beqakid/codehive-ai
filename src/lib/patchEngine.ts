/**
 * @module patchEngine
 * @description Milestone 3 — Safe patch generation engine.
 * Generates controlled code patches via AI, enforces limits,
 * validates against rules, and produces structured diffs.
 * Uses raw fetch() to Anthropic API (no SDK).
 */

import type { PatchOperation } from './codeGenerationRules'
import {
  DEFAULT_LIMITS,
  validatePatchInput,
  isFilePathAllowed,
  checkPatchSetLimits,
  type CodeGenLimits,
} from './codeGenerationRules'
import { generateDiff, buildDiffSummary, type FileDiff, type DiffSummary } from './diffEngine'
import type { RiskReport } from './riskEngine'
import type { ProtectedFile } from './protectedFiles'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface PatchFile {
  filePath: string
  operation: PatchOperation
  content: string
  reasoning: string
}

export interface PatchGenerationInput {
  projectId: string
  runId: string
  userRequest: string
  planMarkdown: string
  repoOwner: string
  repoName: string
  existingFiles: { path: string; content: string }[]
  repoArchitectureSummary?: string
  protectedFiles?: ProtectedFile[]
  riskReport?: RiskReport
  limits?: Partial<CodeGenLimits>
}

export interface PatchGenerationResult {
  success: boolean
  patches: PatchFile[]
  diffs: DiffSummary
  validationErrors: string[]
  warnings: string[]
  rejectedFiles: { filePath: string; reason: string }[]
  metadata: {
    filesGenerated: number
    totalLinesChanged: number
    durationMs: number
    model: string
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Prompt construction
// ─────────────────────────────────────────────────────────────────────────────

function buildPatchPrompt(input: PatchGenerationInput): string {
  const fileList = input.existingFiles.map((f) => `- ${f.path}`).join('\n')
  const fileContents = input.existingFiles
    .map((f) => `### ${f.path}\n\`\`\`\n${f.content.slice(0, 3000)}\n\`\`\``)
    .join('\n\n')

  const protectedWarnings = input.protectedFiles?.length
    ? `\n⚠️ PROTECTED FILES — DO NOT MODIFY:\n${input.protectedFiles.map((p) => `- ${p.filePath} (${p.protectionType}: ${p.reason})`).join('\n')}`
    : ''

  const riskContext = input.riskReport
    ? `\nRisk Level: ${input.riskReport.riskLevel} (score: ${input.riskReport.riskScore}/100)\nRollback Complexity: ${input.riskReport.rollbackComplexity}`
    : ''

  return `You are a code generation agent for CodeHive AI.

## Task
Generate SAFE, MINIMAL code patches to implement the following request.

## User Request
${input.userRequest}

## Implementation Plan
${input.planMarkdown}

## Repository: ${input.repoOwner}/${input.repoName}
${input.repoArchitectureSummary || ''}

## Existing Files
${fileList}

## File Contents
${fileContents}
${protectedWarnings}
${riskContext}

## RULES
1. Generate ONLY the files that need to change or be created.
2. Each file must be COMPLETE (not partial).
3. Do NOT modify protected files.
4. Do NOT add secrets, API keys, or credentials.
5. Do NOT use eval(), exec(), or spawn().
6. Do NOT modify package-lock.json, yarn.lock, or pnpm-lock.yaml.
7. Do NOT modify binary files.
8. Do NOT perform repo-wide refactors.
9. Keep changes minimal and focused.
10. Use TypeScript where the project uses TypeScript.
11. Follow the existing code style of the repository.

## OUTPUT FORMAT
Return ONLY a valid JSON array. No markdown fencing, no preamble.
Each element:
{
  "filePath": "path/to/file.ts",
  "operation": "add_file" | "modify_file" | "append_code",
  "content": "full file content here",
  "reasoning": "why this change is needed"
}
`
}

// ─────────────────────────────────────────────────────────────────────────────
// AI call
// ─────────────────────────────────────────────────────────────────────────────

async function callAI(prompt: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!resp.ok) {
    const errText = await resp.text()
    throw new Error(`Anthropic API error ${resp.status}: ${errText.slice(0, 300)}`)
  }

  const data = (await resp.json()) as { content: Array<{ type: string; text: string }> }
  const text = data.content?.find((c) => c.type === 'text')?.text || ''
  return text
}

// ─────────────────────────────────────────────────────────────────────────────
// JSON extraction — Claude sometimes wraps in markdown
// ─────────────────────────────────────────────────────────────────────────────

function extractJsonArray(raw: string): PatchFile[] {
  // Find first [ and last ]
  const start = raw.indexOf('[')
  const end = raw.lastIndexOf(']')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('AI response does not contain a valid JSON array')
  }
  const jsonStr = raw.slice(start, end + 1)
  const parsed = JSON.parse(jsonStr)
  if (!Array.isArray(parsed)) throw new Error('Parsed result is not an array')
  return parsed as PatchFile[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Main engine
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate safe patches via AI, validate them, and produce diffs.
 */
export async function generatePatches(input: PatchGenerationInput): Promise<PatchGenerationResult> {
  const startMs = Date.now()
  const limits: CodeGenLimits = { ...DEFAULT_LIMITS, ...input.limits }
  const validationErrors: string[] = []
  const warnings: string[] = []
  const rejectedFiles: { filePath: string; reason: string }[] = []

  // 1. Call AI
  const prompt = buildPatchPrompt(input)
  let rawPatches: PatchFile[]
  try {
    const aiResponse = await callAI(prompt)
    rawPatches = extractJsonArray(aiResponse)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      success: false,
      patches: [],
      diffs: buildDiffSummary([]),
      validationErrors: [`AI patch generation failed: ${msg}`],
      warnings: [],
      rejectedFiles: [],
      metadata: { filesGenerated: 0, totalLinesChanged: 0, durationMs: Date.now() - startMs, model: 'claude-sonnet-4-6' },
    }
  }

  // 2. Check set-level limits
  const limitsCheck = checkPatchSetLimits(rawPatches.length, 0, limits)
  if (!limitsCheck.allowed) {
    validationErrors.push(limitsCheck.reason!)
    return {
      success: false,
      patches: [],
      diffs: buildDiffSummary([]),
      validationErrors,
      warnings,
      rejectedFiles: [],
      metadata: { filesGenerated: rawPatches.length, totalLinesChanged: 0, durationMs: Date.now() - startMs, model: 'claude-sonnet-4-6' },
    }
  }

  // 3. Validate each patch
  const validPatches: PatchFile[] = []
  const fileDiffs: FileDiff[] = []
  let totalLines = 0

  const protectedPaths = new Set(input.protectedFiles?.map((p) => p.filePath) || [])

  for (const patch of rawPatches) {
    // Check file path allowed
    if (!isFilePathAllowed(patch.filePath)) {
      rejectedFiles.push({ filePath: patch.filePath, reason: 'Blocked file path pattern' })
      continue
    }

    // Check protected files
    if (protectedPaths.has(patch.filePath)) {
      rejectedFiles.push({ filePath: patch.filePath, reason: 'Protected file — requires approval' })
      continue
    }

    const linesChanged = patch.content.split('\n').length
    totalLines += linesChanged

    // Run rule validation
    const validation = validatePatchInput({
      filePath: patch.filePath,
      operation: patch.operation,
      content: patch.content,
      linesChanged,
    })

    if (!validation.allPassed) {
      const failedRules = validation.results.filter((r) => !r.passed).map((r) => r.message)
      rejectedFiles.push({ filePath: patch.filePath, reason: failedRules.join('; ') })
      continue
    }

    // Collect warnings
    for (const w of validation.warnings) {
      warnings.push(`${patch.filePath}: ${w.description}`)
    }

    validPatches.push(patch)

    // Generate diff
    const existingFile = input.existingFiles.find((f) => f.path === patch.filePath)
    const diff = generateDiff(
      patch.filePath,
      existingFile?.content ?? null,
      patch.content,
    )
    fileDiffs.push(diff)
  }

  // 4. Check total line limit
  const totalCheck = checkPatchSetLimits(validPatches.length, totalLines, limits)
  if (!totalCheck.allowed) {
    validationErrors.push(totalCheck.reason!)
  }

  const diffs = buildDiffSummary(fileDiffs)

  return {
    success: validationErrors.length === 0 && validPatches.length > 0,
    patches: validPatches,
    diffs,
    validationErrors,
    warnings,
    rejectedFiles,
    metadata: {
      filesGenerated: validPatches.length,
      totalLinesChanged: totalLines,
      durationMs: Date.now() - startMs,
      model: 'claude-sonnet-4-6',
    },
  }
}

/**
 * Generate patches WITHOUT AI call — for testing / programmatic use.
 * Validates and diffs pre-built patches.
 */
export function validateAndDiffPatches(
  patches: PatchFile[],
  existingFiles: { path: string; content: string }[],
  protectedFilePaths: string[] = [],
  limits: CodeGenLimits = DEFAULT_LIMITS,
): PatchGenerationResult {
  const startMs = Date.now()
  const validationErrors: string[] = []
  const warnings: string[] = []
  const rejectedFiles: { filePath: string; reason: string }[] = []
  const validPatches: PatchFile[] = []
  const fileDiffs: FileDiff[] = []
  let totalLines = 0

  const protectedSet = new Set(protectedFilePaths)

  const setCheck = checkPatchSetLimits(patches.length, 0, limits)
  if (!setCheck.allowed) {
    return {
      success: false, patches: [], diffs: buildDiffSummary([]),
      validationErrors: [setCheck.reason!], warnings, rejectedFiles,
      metadata: { filesGenerated: 0, totalLinesChanged: 0, durationMs: Date.now() - startMs, model: 'none' },
    }
  }

  for (const patch of patches) {
    if (!isFilePathAllowed(patch.filePath)) {
      rejectedFiles.push({ filePath: patch.filePath, reason: 'Blocked file path' })
      continue
    }
    if (protectedSet.has(patch.filePath)) {
      rejectedFiles.push({ filePath: patch.filePath, reason: 'Protected file' })
      continue
    }

    const linesChanged = patch.content.split('\n').length
    totalLines += linesChanged

    const validation = validatePatchInput({
      filePath: patch.filePath, operation: patch.operation,
      content: patch.content, linesChanged,
    })

    if (!validation.allPassed) {
      const reasons = validation.results.filter((r) => !r.passed).map((r) => r.message)
      rejectedFiles.push({ filePath: patch.filePath, reason: reasons.join('; ') })
      continue
    }

    for (const w of validation.warnings) warnings.push(`${patch.filePath}: ${w.description}`)

    validPatches.push(patch)
    const existing = existingFiles.find((f) => f.path === patch.filePath)
    fileDiffs.push(generateDiff(patch.filePath, existing?.content ?? null, patch.content))
  }

  return {
    success: validationErrors.length === 0 && validPatches.length > 0,
    patches: validPatches,
    diffs: buildDiffSummary(fileDiffs),
    validationErrors, warnings, rejectedFiles,
    metadata: { filesGenerated: validPatches.length, totalLinesChanged: totalLines, durationMs: Date.now() - startMs, model: 'none' },
  }
}
