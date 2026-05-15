/**
 * @module codeGenerationRules
 * @description Milestone 3 — Code generation rules and limits.
 * Defines what AI may and may not do, configurable per-project limits,
 * and pattern-based restrictions for safe code modification.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type PatchOperation = 'add_file' | 'modify_file' | 'append_code'

/** Operations we explicitly block */
export type BlockedOperation =
  | 'delete_file'
  | 'rename_file'
  | 'binary_modify'
  | 'package_lock_modify'
  | 'node_modules_modify'
  | 'repo_wide_refactor'
  | 'production_db_migration'
  | 'auth_rewrite'
  | 'deployment_config_rewrite'
  | 'payment_rewrite'

export interface CodeGenLimits {
  maxFilesPerRun: number
  maxLinesPerFile: number
  maxTotalLineChanges: number
  maxFileSizeBytes: number
  maxSelfHealAttempts: number
}

export interface CodeGenRule {
  id: string
  description: string
  check: (patch: PatchCheckInput) => RuleResult
}

export interface PatchCheckInput {
  filePath: string
  operation: PatchOperation
  content?: string
  originalContent?: string
  linesChanged: number
}

export interface RuleResult {
  passed: boolean
  ruleId: string
  message: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Default limits
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_LIMITS: CodeGenLimits = {
  maxFilesPerRun: 15,
  maxLinesPerFile: 500,
  maxTotalLineChanges: 2000,
  maxFileSizeBytes: 100_000, // 100KB
  maxSelfHealAttempts: 3,
}

// ─────────────────────────────────────────────────────────────────────────────
// Supported operations
// ─────────────────────────────────────────────────────────────────────────────

export const SUPPORTED_OPERATIONS: ReadonlySet<PatchOperation> = new Set([
  'add_file',
  'modify_file',
  'append_code',
])

export const BLOCKED_OPERATIONS: ReadonlySet<BlockedOperation> = new Set([
  'delete_file',
  'rename_file',
  'binary_modify',
  'package_lock_modify',
  'node_modules_modify',
  'repo_wide_refactor',
  'production_db_migration',
  'auth_rewrite',
  'deployment_config_rewrite',
  'payment_rewrite',
])

// ─────────────────────────────────────────────────────────────────────────────
// Blocked file patterns
// ─────────────────────────────────────────────────────────────────────────────

const BLOCKED_FILE_PATTERNS: RegExp[] = [
  /node_modules\//,
  /package-lock\.json$/,
  /pnpm-lock\.yaml$/,
  /yarn\.lock$/,
  /\.env($|\.)/,
  /\.git\//,
  /dist\//,
  /\.next\//,
  /\.wrangler\//,
]

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.webp', '.avif',
  '.woff', '.woff2', '.ttf', '.eot',
  '.zip', '.tar', '.gz', '.bz2',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx',
  '.mp3', '.mp4', '.wav', '.avi', '.mov',
  '.exe', '.dll', '.so', '.dylib',
  '.wasm',
])

// ─────────────────────────────────────────────────────────────────────────────
// Dangerous content patterns
// ─────────────────────────────────────────────────────────────────────────────

export interface DangerousPattern {
  id: string
  pattern: RegExp
  description: string
  severity: 'warn' | 'block'
}

export const DANGEROUS_PATTERNS: DangerousPattern[] = [
  { id: 'hardcoded_secret', pattern: /(?:api[_-]?key|secret|password|token)\s*[:=]\s*['"][^'"]{8,}['"]/i, description: 'Possible hardcoded secret/API key', severity: 'block' },
  { id: 'eval_usage', pattern: /\beval\s*\(/, description: 'Use of eval() is dangerous', severity: 'warn' },
  { id: 'rm_rf', pattern: /rm\s+-rf\s+\//, description: 'Destructive rm -rf command detected', severity: 'block' },
  { id: 'process_exit', pattern: /process\.exit\s*\(/, description: 'process.exit() can crash the worker', severity: 'warn' },
  { id: 'drop_table', pattern: /DROP\s+TABLE/i, description: 'SQL DROP TABLE detected', severity: 'block' },
  { id: 'delete_from_no_where', pattern: /DELETE\s+FROM\s+\w+\s*;/i, description: 'DELETE without WHERE clause', severity: 'block' },
  { id: 'exec_spawn', pattern: /(?:child_process|exec|spawn)\s*\(/, description: 'Shell execution detected', severity: 'warn' },
  { id: 'fs_write_sync', pattern: /fs\.(?:writeFileSync|unlinkSync|rmdirSync)/, description: 'Synchronous filesystem write', severity: 'warn' },
  { id: 'private_key', pattern: /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/, description: 'Private key content detected', severity: 'block' },
  { id: 'aws_key', pattern: /AKIA[0-9A-Z]{16}/, description: 'AWS access key detected', severity: 'block' },
]

// ─────────────────────────────────────────────────────────────────────────────
// Built-in rules
// ─────────────────────────────────────────────────────────────────────────────

export const BUILT_IN_RULES: CodeGenRule[] = [
  {
    id: 'no_blocked_paths',
    description: 'File path must not match blocked patterns',
    check: (input) => {
      for (const pat of BLOCKED_FILE_PATTERNS) {
        if (pat.test(input.filePath)) {
          return { passed: false, ruleId: 'no_blocked_paths', message: `File "${input.filePath}" matches blocked pattern: ${pat}` }
        }
      }
      return { passed: true, ruleId: 'no_blocked_paths', message: 'OK' }
    },
  },
  {
    id: 'no_binary_files',
    description: 'Cannot modify binary files',
    check: (input) => {
      const ext = input.filePath.slice(input.filePath.lastIndexOf('.')).toLowerCase()
      if (BINARY_EXTENSIONS.has(ext)) {
        return { passed: false, ruleId: 'no_binary_files', message: `Binary file modification blocked: ${input.filePath}` }
      }
      return { passed: true, ruleId: 'no_binary_files', message: 'OK' }
    },
  },
  {
    id: 'max_lines_per_file',
    description: 'Single file must not exceed max line limit',
    check: (input) => {
      if (input.linesChanged > DEFAULT_LIMITS.maxLinesPerFile) {
        return { passed: false, ruleId: 'max_lines_per_file', message: `File changes ${input.linesChanged} lines (max ${DEFAULT_LIMITS.maxLinesPerFile})` }
      }
      return { passed: true, ruleId: 'max_lines_per_file', message: 'OK' }
    },
  },
  {
    id: 'no_dangerous_patterns',
    description: 'Content must not contain dangerous patterns',
    check: (input) => {
      if (!input.content) return { passed: true, ruleId: 'no_dangerous_patterns', message: 'OK' }
      for (const dp of DANGEROUS_PATTERNS) {
        if (dp.severity === 'block' && dp.pattern.test(input.content)) {
          return { passed: false, ruleId: 'no_dangerous_patterns', message: `Dangerous pattern "${dp.id}": ${dp.description}` }
        }
      }
      return { passed: true, ruleId: 'no_dangerous_patterns', message: 'OK' }
    },
  },
  {
    id: 'max_file_size',
    description: 'Generated file must not exceed max size',
    check: (input) => {
      if (input.content && new TextEncoder().encode(input.content).length > DEFAULT_LIMITS.maxFileSizeBytes) {
        return { passed: false, ruleId: 'max_file_size', message: `File exceeds max size of ${DEFAULT_LIMITS.maxFileSizeBytes} bytes` }
      }
      return { passed: true, ruleId: 'max_file_size', message: 'OK' }
    },
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

export interface ValidationSummary {
  allPassed: boolean
  results: RuleResult[]
  blockedPatterns: DangerousPattern[]
  warnings: DangerousPattern[]
}

/**
 * Run all built-in rules against a single patch input.
 */
export function validatePatchInput(input: PatchCheckInput): ValidationSummary {
  const results = BUILT_IN_RULES.map((rule) => rule.check(input))
  const blockedPatterns: DangerousPattern[] = []
  const warnings: DangerousPattern[] = []

  if (input.content) {
    for (const dp of DANGEROUS_PATTERNS) {
      if (dp.pattern.test(input.content)) {
        if (dp.severity === 'block') blockedPatterns.push(dp)
        else warnings.push(dp)
      }
    }
  }

  return {
    allPassed: results.every((r) => r.passed) && blockedPatterns.length === 0,
    results,
    blockedPatterns,
    warnings,
  }
}

/**
 * Check if an operation is supported.
 */
export function isOperationSupported(op: string): op is PatchOperation {
  return SUPPORTED_OPERATIONS.has(op as PatchOperation)
}

/**
 * Check if a file path is allowed for modification.
 */
export function isFilePathAllowed(filePath: string): boolean {
  for (const pat of BLOCKED_FILE_PATTERNS) {
    if (pat.test(filePath)) return false
  }
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase()
  if (BINARY_EXTENSIONS.has(ext)) return false
  return true
}

/**
 * Check total patch set against limits.
 */
export function checkPatchSetLimits(
  fileCount: number,
  totalLines: number,
  limits: CodeGenLimits = DEFAULT_LIMITS,
): { allowed: boolean; reason?: string } {
  if (fileCount > limits.maxFilesPerRun) {
    return { allowed: false, reason: `Patch touches ${fileCount} files (max ${limits.maxFilesPerRun})` }
  }
  if (totalLines > limits.maxTotalLineChanges) {
    return { allowed: false, reason: `Patch changes ${totalLines} lines (max ${limits.maxTotalLineChanges})` }
  }
  return { allowed: true }
}
