/**
 * @module selfHealingLoop
 * @description Milestone 3 — Limited self-healing loop.
 * Detects specific error categories from sandbox results and attempts
 * ONE focused repair per error, up to a configurable limit.
 *
 * SUPPORTED: import errors, syntax errors, lint fixes, simple type mismatches.
 * NOT SUPPORTED: large refactors, auth rewrites, dependency upgrades.
 */

import type { SandboxRunResult, SandboxStepResult } from './sandboxRunner'
import type { PatchFile } from './patchEngine'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ErrorCategory =
  | 'import_error'
  | 'syntax_error'
  | 'type_error'
  | 'lint_error'
  | 'test_failure'
  | 'build_error'
  | 'unknown'

export type HealAction =
  | 'fix_import'
  | 'fix_syntax'
  | 'fix_type'
  | 'fix_lint'
  | 'skip'

export interface CategorizedError {
  category: ErrorCategory
  message: string
  filePath?: string
  line?: number
  healable: boolean
  suggestedAction: HealAction
}

export interface HealAttempt {
  attemptNumber: number
  error: CategorizedError
  action: HealAction
  patchApplied: PatchFile | null
  success: boolean
  resultMessage: string
  durationMs: number
}

export interface SelfHealResult {
  attempts: HealAttempt[]
  totalAttempts: number
  maxAttempts: number
  allFixed: boolean
  remainingErrors: CategorizedError[]
  summary: string
}

export interface SelfHealConfig {
  maxAttempts: number
  allowedCategories: ErrorCategory[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Default config
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_HEAL_CONFIG: SelfHealConfig = {
  maxAttempts: 3,
  allowedCategories: ['import_error', 'syntax_error', 'type_error', 'lint_error'],
}

// Not healable
const UNHEALABLE_CATEGORIES: ReadonlySet<ErrorCategory> = new Set([
  'test_failure',
  'build_error',
  'unknown',
])

// ─────────────────────────────────────────────────────────────────────────────
// Error categorization
// ─────────────────────────────────────────────────────────────────────────────

const ERROR_PATTERNS: Array<{
  pattern: RegExp
  category: ErrorCategory
  action: HealAction
}> = [
  // Import errors
  { pattern: /Cannot find module ['"]([^'"]+)['"]/i, category: 'import_error', action: 'fix_import' },
  { pattern: /Module not found.*['"]([^'"]+)['"]/i, category: 'import_error', action: 'fix_import' },
  { pattern: /has no exported member ['"]([^'"]+)['"]/i, category: 'import_error', action: 'fix_import' },
  { pattern: /is not exported from ['"]([^'"]+)['"]/i, category: 'import_error', action: 'fix_import' },

  // Syntax errors
  { pattern: /SyntaxError:/i, category: 'syntax_error', action: 'fix_syntax' },
  { pattern: /Unexpected token/i, category: 'syntax_error', action: 'fix_syntax' },
  { pattern: /Unterminated string/i, category: 'syntax_error', action: 'fix_syntax' },
  { pattern: /Missing semicolon/i, category: 'syntax_error', action: 'fix_syntax' },

  // Type errors
  { pattern: /Type ['"]([^'"]+)['"] is not assignable/i, category: 'type_error', action: 'fix_type' },
  { pattern: /Property ['"]([^'"]+)['"] does not exist/i, category: 'type_error', action: 'fix_type' },
  { pattern: /Argument of type.*is not assignable/i, category: 'type_error', action: 'fix_type' },
  { pattern: /TS\d{4}:/i, category: 'type_error', action: 'fix_type' },

  // Lint errors
  { pattern: /eslint/i, category: 'lint_error', action: 'fix_lint' },
  { pattern: /no-unused-vars/i, category: 'lint_error', action: 'fix_lint' },
  { pattern: /prefer-const/i, category: 'lint_error', action: 'fix_lint' },

  // Test failures
  { pattern: /FAIL\s+.*\.test\./i, category: 'test_failure', action: 'skip' },
  { pattern: /AssertionError/i, category: 'test_failure', action: 'skip' },
  { pattern: /Expected.*received/i, category: 'test_failure', action: 'skip' },
]

/**
 * Categorize an error string into a structured error with healing metadata.
 */
export function categorizeError(errorText: string): CategorizedError {
  for (const ep of ERROR_PATTERNS) {
    if (ep.pattern.test(errorText)) {
      // Try to extract file path
      const fileMatch = errorText.match(/(?:^|\s)([\w./-]+\.(?:ts|tsx|js|jsx|mjs|cjs))(?::(\d+))?/m)
      return {
        category: ep.category,
        message: errorText.slice(0, 300),
        filePath: fileMatch?.[1],
        line: fileMatch?.[2] ? parseInt(fileMatch[2], 10) : undefined,
        healable: !UNHEALABLE_CATEGORIES.has(ep.category),
        suggestedAction: ep.action,
      }
    }
  }

  return {
    category: 'unknown',
    message: errorText.slice(0, 300),
    healable: false,
    suggestedAction: 'skip',
  }
}

/**
 * Extract errors from sandbox results.
 */
export function extractErrorsFromSandbox(result: SandboxRunResult): CategorizedError[] {
  const errors: CategorizedError[] = []

  for (const step of result.steps) {
    if (step.status === 'failed') {
      const errorText = step.stderr || step.stdout || `Step ${step.step} failed`
      // Split by newlines and categorize each meaningful error
      const lines = errorText.split('\n').filter((l) => l.trim().length > 10)
      if (lines.length > 0) {
        // Take up to 5 error lines per step
        for (const line of lines.slice(0, 5)) {
          errors.push(categorizeError(line))
        }
      } else {
        errors.push(categorizeError(errorText))
      }
    }
  }

  return errors
}

// ─────────────────────────────────────────────────────────────────────────────
// Healing strategies (generate fix patches)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a fix prompt for the AI based on categorized error.
 */
export function buildHealPrompt(
  error: CategorizedError,
  originalPatch: PatchFile | undefined,
  existingContent: string | undefined,
): string {
  return `You are a code repair agent. Fix the following error with MINIMAL changes.

## Error
Category: ${error.category}
Message: ${error.message}
${error.filePath ? `File: ${error.filePath}` : ''}
${error.line ? `Line: ${error.line}` : ''}

${originalPatch ? `## Original Generated Code\n\`\`\`\n${originalPatch.content.slice(0, 4000)}\n\`\`\`` : ''}
${existingContent ? `## Existing File Content\n\`\`\`\n${existingContent.slice(0, 4000)}\n\`\`\`` : ''}

## RULES
1. Make the SMALLEST possible fix.
2. Do NOT rewrite the entire file.
3. Do NOT add new dependencies.
4. Do NOT change unrelated code.
5. Return ONLY the complete fixed file content, no explanation.
`
}

/**
 * Attempt to heal errors from a sandbox run.
 * Returns healing results without actually calling the AI (that's done by the caller).
 */
export function planHealingAttempts(
  errors: CategorizedError[],
  config: SelfHealConfig = DEFAULT_HEAL_CONFIG,
): { healable: CategorizedError[]; unhealable: CategorizedError[]; wouldExceedLimit: boolean } {
  const healable = errors.filter(
    (e) => e.healable && config.allowedCategories.includes(e.category),
  )
  const unhealable = errors.filter(
    (e) => !e.healable || !config.allowedCategories.includes(e.category),
  )

  return {
    healable: healable.slice(0, config.maxAttempts),
    unhealable,
    wouldExceedLimit: healable.length > config.maxAttempts,
  }
}

/**
 * Create a summary of self-heal results.
 */
export function formatHealSummary(result: SelfHealResult): string {
  const lines: string[] = [
    `## Self-Heal Summary`,
    `Attempts: ${result.totalAttempts}/${result.maxAttempts}`,
    `Status: ${result.allFixed ? '✅ All errors fixed' : '⚠️ Some errors remain'}`,
    '',
  ]

  if (result.attempts.length > 0) {
    lines.push('### Attempts')
    for (const a of result.attempts) {
      const icon = a.success ? '✅' : '❌'
      lines.push(`${icon} Attempt ${a.attemptNumber}: ${a.error.category} → ${a.action} (${a.durationMs}ms)`)
      lines.push(`   ${a.resultMessage}`)
    }
  }

  if (result.remainingErrors.length > 0) {
    lines.push('', '### Remaining Errors')
    for (const e of result.remainingErrors) {
      lines.push(`- [${e.category}] ${e.message.slice(0, 100)}`)
    }
  }

  return lines.join('\n')
}

/**
 * Check if we should attempt self-healing based on the error profile.
 */
export function shouldAttemptHealing(
  errors: CategorizedError[],
  currentAttempt: number,
  config: SelfHealConfig = DEFAULT_HEAL_CONFIG,
): boolean {
  if (currentAttempt >= config.maxAttempts) return false
  if (errors.length === 0) return false
  return errors.some(
    (e) => e.healable && config.allowedCategories.includes(e.category),
  )
}
