/**
 * @module healingStrategies
 * @description Milestone 4 — Advanced self-healing strategies.
 * Extends M3 self-healing with concrete repair implementations.
 * Each strategy targets a specific failure class with safe, scoped fixes.
 *
 * Supported repairs:
 *   - Import fixes (missing/wrong imports)
 *   - Missing dependency imports
 *   - Simple syntax repair
 *   - Lint autofix suggestions
 *   - Formatting issues
 *   - Simple type mismatches
 *   - Failed build path corrections
 *
 * NOT supported (blocked):
 *   - Auth rewrites
 *   - Dependency upgrades
 *   - Migration rewrites
 *   - Architecture rewrites
 *   - Deployment changes
 */

import type { PatchFile } from './patchEngine'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type HealingStrategyType =
  | 'import_fix'
  | 'missing_dependency'
  | 'syntax_repair'
  | 'lint_autofix'
  | 'format_fix'
  | 'type_mismatch'
  | 'path_correction'
  | 'unused_variable'
  | 'missing_export'
  | 'unknown'

export type HealingOutcome = 'fixed' | 'partial' | 'failed' | 'skipped' | 'blocked'

export interface HealingAttempt {
  attemptId: string
  runId: string
  workspaceId: string
  strategy: HealingStrategyType
  targetFile: string
  errorMessage: string
  suggestedFix: string
  patchGenerated: PatchFile | null
  outcome: HealingOutcome
  durationMs: number
  attemptNumber: number
  maxAttempts: number
  createdAt: number
}

export interface HealingConfig {
  maxAttempts: number
  enabledStrategies: HealingStrategyType[]
  blockedPatterns: string[]
  maxFilesPerAttempt: number
  maxLinesPerFix: number
}

export interface HealingAnalysis {
  strategy: HealingStrategyType
  confidence: number        // 0-1
  description: string
  targetFile: string
  suggestedFix: string
  canAutoFix: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Defaults
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_HEALING_CONFIG: HealingConfig = {
  maxAttempts: 3,
  enabledStrategies: [
    'import_fix',
    'missing_dependency',
    'syntax_repair',
    'lint_autofix',
    'format_fix',
    'type_mismatch',
    'path_correction',
    'unused_variable',
    'missing_export',
  ],
  blockedPatterns: [
    'auth', 'authentication', 'authorization',
    'payment', 'stripe', 'billing',
    'migration', 'migrate',
    'deploy', 'wrangler', 'cloudflare',
    'package.json', 'package-lock',
  ],
  maxFilesPerAttempt: 3,
  maxLinesPerFix: 50,
}

// ─────────────────────────────────────────────────────────────────────────────
// Error classification
// ─────────────────────────────────────────────────────────────────────────────

const ERROR_PATTERNS: Array<{ pattern: RegExp; strategy: HealingStrategyType; confidence: number }> = [
  // Import fixes
  { pattern: /Cannot find module '([^']+)'/i, strategy: 'import_fix', confidence: 0.9 },
  { pattern: /Module not found.*'([^']+)'/i, strategy: 'import_fix', confidence: 0.9 },
  { pattern: /has no exported member '([^']+)'/i, strategy: 'missing_export', confidence: 0.85 },
  { pattern: /is not exported from '([^']+)'/i, strategy: 'import_fix', confidence: 0.85 },

  // Missing dependencies
  { pattern: /Cannot find package '([^']+)'/i, strategy: 'missing_dependency', confidence: 0.7 },
  { pattern: /ERR_MODULE_NOT_FOUND/i, strategy: 'missing_dependency', confidence: 0.6 },

  // Syntax errors
  { pattern: /SyntaxError/i, strategy: 'syntax_repair', confidence: 0.8 },
  { pattern: /Unexpected token/i, strategy: 'syntax_repair', confidence: 0.8 },
  { pattern: /Unterminated string/i, strategy: 'syntax_repair', confidence: 0.85 },
  { pattern: /Missing semicolon/i, strategy: 'syntax_repair', confidence: 0.9 },

  // Type mismatches
  { pattern: /Type '([^']+)' is not assignable to type '([^']+)'/i, strategy: 'type_mismatch', confidence: 0.7 },
  { pattern: /Property '([^']+)' does not exist on type/i, strategy: 'type_mismatch', confidence: 0.65 },
  { pattern: /Argument of type '([^']+)' is not assignable/i, strategy: 'type_mismatch', confidence: 0.65 },

  // Lint issues
  { pattern: /eslint/i, strategy: 'lint_autofix', confidence: 0.8 },
  { pattern: /no-unused-vars/i, strategy: 'unused_variable', confidence: 0.9 },
  { pattern: /prefer-const/i, strategy: 'lint_autofix', confidence: 0.95 },

  // Path issues
  { pattern: /ENOENT.*no such file/i, strategy: 'path_correction', confidence: 0.7 },
  { pattern: /Cannot resolve.*path/i, strategy: 'path_correction', confidence: 0.65 },

  // Formatting
  { pattern: /prettier/i, strategy: 'format_fix', confidence: 0.9 },
  { pattern: /formatting/i, strategy: 'format_fix', confidence: 0.7 },
]

export function classifyError(errorMessage: string): HealingAnalysis {
  for (const { pattern, strategy, confidence } of ERROR_PATTERNS) {
    const match = errorMessage.match(pattern)
    if (match) {
      return {
        strategy,
        confidence,
        description: `Detected ${strategy} pattern: ${match[0].substring(0, 100)}`,
        targetFile: extractFilePath(errorMessage) || 'unknown',
        suggestedFix: generateFixDescription(strategy, match),
        canAutoFix: confidence >= 0.6,
      }
    }
  }

  return {
    strategy: 'unknown',
    confidence: 0,
    description: 'Unable to classify error',
    targetFile: extractFilePath(errorMessage) || 'unknown',
    suggestedFix: '',
    canAutoFix: false,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Safety checks
// ─────────────────────────────────────────────────────────────────────────────

export function isHealingSafe(
  analysis: HealingAnalysis,
  config: HealingConfig = DEFAULT_HEALING_CONFIG,
): { safe: boolean; reason?: string } {
  // Check if strategy is enabled
  if (!config.enabledStrategies.includes(analysis.strategy)) {
    return { safe: false, reason: `Strategy "${analysis.strategy}" is disabled` }
  }

  // Check for blocked patterns in target file
  for (const blocked of config.blockedPatterns) {
    if (analysis.targetFile.toLowerCase().includes(blocked)) {
      return { safe: false, reason: `Target file matches blocked pattern "${blocked}"` }
    }
  }

  // Check confidence threshold
  if (analysis.confidence < 0.5) {
    return { safe: false, reason: `Confidence too low (${analysis.confidence})` }
  }

  return { safe: true }
}

// ─────────────────────────────────────────────────────────────────────────────
// Fix generation (produces patch files for safe fixes)
// ─────────────────────────────────────────────────────────────────────────────

export function generateImportFix(
  filePath: string,
  fileContent: string,
  missingModule: string,
): PatchFile | null {
  // Simple import fix: add import statement at top of file
  if (!missingModule || !fileContent) return null

  const importStatement = missingModule.startsWith('.')
    ? `import {} from '${missingModule}'\n`
    : `import ${missingModule.split('/').pop()} from '${missingModule}'\n`

  const fixedContent = importStatement + fileContent

  return {
    filePath,
    operation: 'modify_file',
    content: fixedContent,
    reasoning: `Added missing import for "${missingModule}"`,
  }
}

export function generateUnusedVariableFix(
  filePath: string,
  fileContent: string,
  variableName: string,
): PatchFile | null {
  if (!variableName || !fileContent) return null

  // Prefix unused variable with underscore
  const fixedContent = fileContent.replace(
    new RegExp(`\\b(const|let|var)\\s+${variableName}\\b`),
    `$1 _${variableName}`,
  )

  if (fixedContent === fileContent) return null

  return {
    filePath,
    operation: 'modify_file',
    content: fixedContent,
    reasoning: `Prefixed unused variable "${variableName}" with underscore`,
  }
}

export function generateMissingExportFix(
  filePath: string,
  fileContent: string,
  exportName: string,
): PatchFile | null {
  if (!exportName || !fileContent) return null

  // Check if the symbol exists but isn't exported
  const symbolPattern = new RegExp(`(function|const|class|type|interface)\\s+${exportName}\\b`)
  const match = fileContent.match(symbolPattern)
  if (!match) return null

  const fixedContent = fileContent.replace(
    match[0],
    `export ${match[0]}`,
  )

  return {
    filePath,
    operation: 'modify_file',
    content: fixedContent,
    reasoning: `Added export to "${exportName}"`,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Attempt tracking
// ─────────────────────────────────────────────────────────────────────────────

export function createHealingAttempt(
  runId: string,
  workspaceId: string,
  analysis: HealingAnalysis,
  attemptNumber: number,
  config: HealingConfig = DEFAULT_HEALING_CONFIG,
): HealingAttempt {
  return {
    attemptId: `heal-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
    runId,
    workspaceId,
    strategy: analysis.strategy,
    targetFile: analysis.targetFile,
    errorMessage: analysis.description,
    suggestedFix: analysis.suggestedFix,
    patchGenerated: null,
    outcome: 'skipped',
    durationMs: 0,
    attemptNumber,
    maxAttempts: config.maxAttempts,
    createdAt: Date.now(),
  }
}

export function shouldContinueHealing(
  attempts: HealingAttempt[],
  config: HealingConfig = DEFAULT_HEALING_CONFIG,
): boolean {
  if (attempts.length >= config.maxAttempts) return false
  // Stop if last attempt was blocked
  const lastAttempt = attempts[attempts.length - 1]
  if (lastAttempt?.outcome === 'blocked') return false
  return true
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function extractFilePath(errorMessage: string): string | null {
  // Match common patterns like "./src/file.ts", "src/file.ts(10,5)"
  const patterns = [
    /(?:\.\/)?(?:src\/[^\s:()]+\.[tj]sx?)/,
    /(?:at\s+)([^\s:()]+\.[tj]sx?)/,
    /File\s+'([^']+)'/,
  ]
  for (const pattern of patterns) {
    const match = errorMessage.match(pattern)
    if (match) return match[1] || match[0]
  }
  return null
}

function generateFixDescription(strategy: HealingStrategyType, match: RegExpMatchArray): string {
  switch (strategy) {
    case 'import_fix':
      return `Fix import for "${match[1] || 'module'}"`
    case 'missing_dependency':
      return `Add missing dependency "${match[1] || 'package'}"`
    case 'syntax_repair':
      return `Fix syntax error: ${match[0].substring(0, 80)}`
    case 'type_mismatch':
      return `Fix type mismatch: ${match[0].substring(0, 80)}`
    case 'lint_autofix':
      return `Apply lint fix: ${match[0].substring(0, 80)}`
    case 'unused_variable':
      return `Fix unused variable warning`
    case 'missing_export':
      return `Add missing export for "${match[1] || 'symbol'}"`
    case 'path_correction':
      return `Fix file path reference`
    case 'format_fix':
      return `Apply formatting fix`
    default:
      return `Apply fix for: ${match[0].substring(0, 80)}`
  }
}
