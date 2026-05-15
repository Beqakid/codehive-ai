/**
 * @module patchValidator
 * @description Milestone 3 — Patch validation engine.
 * Validates AI-generated patches BEFORE they are written to any branch.
 * Checks: syntax sanity, malformed patches, oversized rejection,
 * dangerous patterns, duplicate imports, secret exposure, invalid paths.
 */

import type { PatchFile } from './patchEngine'
import { isFilePathAllowed, DANGEROUS_PATTERNS, DEFAULT_LIMITS, type CodeGenLimits } from './codeGenerationRules'
import { isFileProtected } from './protectedFiles'
import type { ScopeCheckResult } from './editScopeManager'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ValidationSeverity = 'error' | 'warning' | 'info'

export interface ValidationIssue {
  severity: ValidationSeverity
  code: string
  filePath: string
  message: string
  line?: number
}

export interface PatchValidationResult {
  valid: boolean
  issues: ValidationIssue[]
  errors: ValidationIssue[]
  warnings: ValidationIssue[]
  summary: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Individual validators
// ─────────────────────────────────────────────────────────────────────────────

function validateFilePath(patch: PatchFile): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  if (!patch.filePath || patch.filePath.trim() === '') {
    issues.push({ severity: 'error', code: 'EMPTY_PATH', filePath: patch.filePath, message: 'File path is empty' })
    return issues
  }

  // Absolute paths
  if (patch.filePath.startsWith('/')) {
    issues.push({ severity: 'error', code: 'ABSOLUTE_PATH', filePath: patch.filePath, message: 'Absolute paths not allowed — must be relative to repo root' })
  }

  // Path traversal
  if (patch.filePath.includes('..')) {
    issues.push({ severity: 'error', code: 'PATH_TRAVERSAL', filePath: patch.filePath, message: 'Path traversal (..) not allowed' })
  }

  // Blocked patterns
  if (!isFilePathAllowed(patch.filePath)) {
    issues.push({ severity: 'error', code: 'BLOCKED_PATH', filePath: patch.filePath, message: 'File path matches a blocked pattern' })
  }

  // Protected file check
  if (isFileProtected(patch.filePath)) {
    issues.push({ severity: 'warning', code: 'PROTECTED_FILE', filePath: patch.filePath, message: 'File is protected — requires approval gate' })
  }

  return issues
}

function validateContent(patch: PatchFile, limits: CodeGenLimits): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  if (!patch.content && patch.operation !== 'add_file') {
    issues.push({ severity: 'error', code: 'EMPTY_CONTENT', filePath: patch.filePath, message: 'Patch content is empty for modify operation' })
    return issues
  }

  if (!patch.content) return issues

  const lines = patch.content.split('\n')

  // Max lines
  if (lines.length > limits.maxLinesPerFile) {
    issues.push({ severity: 'error', code: 'OVERSIZED', filePath: patch.filePath, message: `File has ${lines.length} lines (max ${limits.maxLinesPerFile})` })
  }

  // Max size
  const sizeBytes = new TextEncoder().encode(patch.content).length
  if (sizeBytes > limits.maxFileSizeBytes) {
    issues.push({ severity: 'error', code: 'OVERSIZED_BYTES', filePath: patch.filePath, message: `File is ${sizeBytes} bytes (max ${limits.maxFileSizeBytes})` })
  }

  return issues
}

function validateSyntaxSanity(patch: PatchFile): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  if (!patch.content) return issues

  const ext = patch.filePath.slice(patch.filePath.lastIndexOf('.')).toLowerCase()
  const tsLike = ['.ts', '.tsx', '.js', '.jsx'].includes(ext)

  if (tsLike) {
    // Check balanced braces
    let braceCount = 0
    let parenCount = 0
    let bracketCount = 0
    const lines = patch.content.split('\n')

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      // Skip strings/comments roughly
      const cleaned = line.replace(/\/\/.*$/, '').replace(/'[^']*'/g, '').replace(/"[^"]*"/g, '').replace(/`[^`]*`/g, '')
      for (const c of cleaned) {
        if (c === '{') braceCount++
        else if (c === '}') braceCount--
        else if (c === '(') parenCount++
        else if (c === ')') parenCount--
        else if (c === '[') bracketCount++
        else if (c === ']') bracketCount--
      }
    }

    if (braceCount !== 0) {
      issues.push({ severity: 'error', code: 'UNBALANCED_BRACES', filePath: patch.filePath, message: `Unbalanced braces: ${braceCount > 0 ? `${braceCount} unclosed` : `${-braceCount} extra closing`}` })
    }
    if (parenCount !== 0) {
      issues.push({ severity: 'warning', code: 'UNBALANCED_PARENS', filePath: patch.filePath, message: `Unbalanced parentheses: off by ${Math.abs(parenCount)}` })
    }

    // Duplicate imports
    const importLines = lines.filter((l) => l.trim().startsWith('import '))
    const importSources = importLines.map((l) => {
      const match = l.match(/from\s+['"]([^'"]+)['"]/)
      return match?.[1]
    }).filter(Boolean)
    const duplicates = importSources.filter((s, i) => importSources.indexOf(s) !== i)
    if (duplicates.length > 0) {
      issues.push({ severity: 'warning', code: 'DUPLICATE_IMPORT', filePath: patch.filePath, message: `Duplicate import sources: ${[...new Set(duplicates)].join(', ')}` })
    }
  }

  return issues
}

function validateDangerousPatterns(patch: PatchFile): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  if (!patch.content) return issues

  for (const dp of DANGEROUS_PATTERNS) {
    if (dp.pattern.test(patch.content)) {
      issues.push({
        severity: dp.severity === 'block' ? 'error' : 'warning',
        code: `DANGEROUS_${dp.id.toUpperCase()}`,
        filePath: patch.filePath,
        message: dp.description,
      })
    }
  }

  return issues
}

function validateOperation(patch: PatchFile): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const validOps = ['add_file', 'modify_file', 'append_code']
  if (!validOps.includes(patch.operation)) {
    issues.push({ severity: 'error', code: 'INVALID_OPERATION', filePath: patch.filePath, message: `Unsupported operation: "${patch.operation}"` })
  }
  return issues
}

// ─────────────────────────────────────────────────────────────────────────────
// Main validation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate a single patch file.
 */
export function validatePatch(
  patch: PatchFile,
  limits: CodeGenLimits = DEFAULT_LIMITS,
): PatchValidationResult {
  const issues: ValidationIssue[] = [
    ...validateFilePath(patch),
    ...validateOperation(patch),
    ...validateContent(patch, limits),
    ...validateSyntaxSanity(patch),
    ...validateDangerousPatterns(patch),
  ]

  const errors = issues.filter((i) => i.severity === 'error')
  const warnings = issues.filter((i) => i.severity === 'warning')

  return {
    valid: errors.length === 0,
    issues,
    errors,
    warnings,
    summary: errors.length === 0
      ? `✅ Patch valid${warnings.length > 0 ? ` (${warnings.length} warning(s))` : ''}`
      : `❌ ${errors.length} error(s), ${warnings.length} warning(s)`,
  }
}

/**
 * Validate an entire patch set.
 */
export function validatePatchSet(
  patches: PatchFile[],
  limits: CodeGenLimits = DEFAULT_LIMITS,
  scopeResults?: ScopeCheckResult[],
): PatchValidationResult {
  const allIssues: ValidationIssue[] = []

  // Set-level checks
  if (patches.length > limits.maxFilesPerRun) {
    allIssues.push({
      severity: 'error', code: 'TOO_MANY_FILES', filePath: '<set>',
      message: `Patch set has ${patches.length} files (max ${limits.maxFilesPerRun})`,
    })
  }

  let totalLines = 0
  for (const patch of patches) {
    totalLines += (patch.content?.split('\n').length || 0)
    const result = validatePatch(patch, limits)
    allIssues.push(...result.issues)
  }

  if (totalLines > limits.maxTotalLineChanges) {
    allIssues.push({
      severity: 'error', code: 'TOO_MANY_LINES', filePath: '<set>',
      message: `Total ${totalLines} lines changed (max ${limits.maxTotalLineChanges})`,
    })
  }

  // Scope check integration
  if (scopeResults) {
    for (const sr of scopeResults) {
      if (sr.permission === 'blocked') {
        allIssues.push({
          severity: 'error', code: 'SCOPE_BLOCKED', filePath: sr.filePath,
          message: `Blocked by scope: ${sr.reason}`,
        })
      }
    }
  }

  const errors = allIssues.filter((i) => i.severity === 'error')
  const warnings = allIssues.filter((i) => i.severity === 'warning')

  return {
    valid: errors.length === 0,
    issues: allIssues,
    errors,
    warnings,
    summary: errors.length === 0
      ? `✅ All ${patches.length} patches valid`
      : `❌ ${errors.length} error(s) across ${patches.length} patches`,
  }
}
