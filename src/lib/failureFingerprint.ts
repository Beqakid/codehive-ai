/**
 * @module failureFingerprint
 * @description Milestone 5 — Failure fingerprinting system.
 * Creates unique, stable fingerprints for error patterns so we can:
 *   - Detect recurring failures
 *   - Look up known fixes
 *   - Track fix success rates
 *   - Avoid repeating failed repair attempts
 *
 * Fingerprints are based on:
 *   - Error category (type, lint, build, test, runtime)
 *   - Normalized error message (stripped of line numbers, paths)
 *   - Affected file pattern
 *   - Error code if available
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type FailureCategory =
  | 'type_error'
  | 'syntax_error'
  | 'import_error'
  | 'lint_error'
  | 'build_error'
  | 'test_failure'
  | 'runtime_error'
  | 'dependency_error'
  | 'config_error'
  | 'unknown'

export interface FailureFingerprint {
  hash: string
  category: FailureCategory
  normalizedMessage: string
  errorCode?: string
  filePattern: string
  rawMessage: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  isRecurring: boolean
  occurrenceCount: number
  firstSeen?: string
  lastSeen?: string
}

export interface FingerprintMatch {
  fingerprint: FailureFingerprint
  knownFix?: string
  fixConfidence: number
  previousAttempts: number
  lastOutcome: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Fingerprint generation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a stable fingerprint for an error message.
 */
export function generateFingerprint(
  errorMessage: string,
  filePath?: string,
  errorCode?: string,
): FailureFingerprint {
  const category = categorizeError(errorMessage)
  const normalized = normalizeErrorMessage(errorMessage)
  const filePattern = extractFilePattern(filePath || extractFilePath(errorMessage) || '')

  const hashInput = `${category}:${normalized}:${filePattern}:${errorCode || ''}`
  const hash = simpleHash(hashInput)

  return {
    hash,
    category,
    normalizedMessage: normalized,
    errorCode,
    filePattern,
    rawMessage: errorMessage.substring(0, 1000),
    severity: categorizeSeverity(category, errorMessage),
    isRecurring: false,
    occurrenceCount: 1,
  }
}

/**
 * Generate fingerprints for a batch of errors from execution output.
 */
export function generateFingerprintsFromOutput(
  stdout: string,
  stderr: string,
  step: string,
): FailureFingerprint[] {
  const combined = `${stdout}\n${stderr}`
  const errors = extractErrorLines(combined)

  const fingerprints = new Map<string, FailureFingerprint>()

  for (const error of errors) {
    const fp = generateFingerprint(error.message, error.file, error.code)
    if (fingerprints.has(fp.hash)) {
      const existing = fingerprints.get(fp.hash)!
      existing.occurrenceCount++
    } else {
      fingerprints.set(fp.hash, fp)
    }
  }

  return Array.from(fingerprints.values())
}

// ─────────────────────────────────────────────────────────────────────────────
// Error categorization
// ─────────────────────────────────────────────────────────────────────────────

function categorizeError(message: string): FailureCategory {
  const lower = message.toLowerCase()

  if (lower.includes('type') && (lower.includes('not assignable') || lower.includes('does not exist'))) {
    return 'type_error'
  }
  if (lower.includes('syntaxerror') || lower.includes('unexpected token') || lower.includes('unterminated')) {
    return 'syntax_error'
  }
  if (lower.includes('cannot find module') || lower.includes('module not found') || lower.includes('no exported member')) {
    return 'import_error'
  }
  if (lower.includes('eslint') || lower.includes('no-unused') || lower.includes('prefer-const')) {
    return 'lint_error'
  }
  if (lower.includes('build') && (lower.includes('failed') || lower.includes('error'))) {
    return 'build_error'
  }
  if (lower.includes('test') && (lower.includes('failed') || lower.includes('expect'))) {
    return 'test_failure'
  }
  if (lower.includes('cannot find package') || lower.includes('peer dep') || lower.includes('err_module_not_found')) {
    return 'dependency_error'
  }
  if (lower.includes('enoent') || lower.includes('config') && lower.includes('invalid')) {
    return 'config_error'
  }
  if (lower.includes('runtime') || lower.includes('referenceerror') || lower.includes('typeerror:')) {
    return 'runtime_error'
  }

  return 'unknown'
}

function categorizeSeverity(
  category: FailureCategory,
  message: string,
): 'low' | 'medium' | 'high' | 'critical' {
  switch (category) {
    case 'lint_error':
      return 'low'
    case 'type_error':
    case 'syntax_error':
      return 'medium'
    case 'import_error':
    case 'build_error':
    case 'test_failure':
      return 'high'
    case 'dependency_error':
    case 'config_error':
    case 'runtime_error':
      return message.toLowerCase().includes('critical') ? 'critical' : 'high'
    default:
      return 'medium'
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalization
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalize an error message to create a stable signature.
 * Strips line numbers, absolute paths, timestamps, and varying details.
 */
function normalizeErrorMessage(message: string): string {
  let normalized = message

  // Strip line:column numbers
  normalized = normalized.replace(/\(\d+,\d+\)/g, '(LINE,COL)')
  normalized = normalized.replace(/:\d+:\d+/g, ':LINE:COL')

  // Strip absolute paths, keep relative
  normalized = normalized.replace(/\/[^\s:]+\//g, '.../')

  // Strip timestamps
  normalized = normalized.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/g, 'TIMESTAMP')

  // Strip hex addresses
  normalized = normalized.replace(/0x[0-9a-f]+/gi, 'ADDR')

  // Collapse whitespace
  normalized = normalized.replace(/\s+/g, ' ').trim()

  // Truncate
  return normalized.substring(0, 300)
}

/**
 * Extract a pattern from a file path (e.g., "src/lib/*.ts").
 */
function extractFilePattern(filePath: string): string {
  if (!filePath) return '*'

  const parts = filePath.split('/')
  if (parts.length <= 1) return filePath

  // Keep directory + extension pattern
  const ext = filePath.split('.').pop() || ''
  const dir = parts.slice(0, -1).join('/')
  return `${dir}/*.${ext}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Error extraction from output
// ─────────────────────────────────────────────────────────────────────────────

interface ExtractedError {
  message: string
  file?: string
  code?: string
  line?: number
}

function extractErrorLines(output: string): ExtractedError[] {
  const errors: ExtractedError[] = []
  const lines = output.split('\n')

  const errorPatterns = [
    // TypeScript errors: src/file.ts(10,5): error TS2345: ...
    /^(.+\.tsx?)\((\d+),(\d+)\):\s*error\s+(TS\d+):\s*(.+)/,
    // ESLint errors: /path/file.ts:10:5 error ...
    /^(.+\.tsx?):(\d+):(\d+)\s+(error|warning)\s+(.+)/,
    // Generic "Error:" prefix
    /^(?:Error|ERROR|error):\s*(.+)/,
    // Test failures: FAIL src/test.ts
    /^FAIL\s+(.+)/,
    // npm ERR!
    /^npm ERR!\s*(.+)/,
    // Build errors
    /^(?:Build|Compile)\s+(?:error|failed):\s*(.+)/i,
  ]

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    for (const pattern of errorPatterns) {
      const match = trimmed.match(pattern)
      if (match) {
        const errorInfo: ExtractedError = {
          message: match[match.length - 1] || trimmed,
          file: match[1]?.endsWith('.ts') || match[1]?.endsWith('.tsx') ? match[1] : undefined,
          code: match[4]?.startsWith('TS') ? match[4] : undefined,
          line: match[2] ? parseInt(match[2], 10) : undefined,
        }
        errors.push(errorInfo)
        break
      }
    }
  }

  // If no patterns matched, try to find error-like lines
  if (errors.length === 0) {
    for (const line of lines) {
      const lower = line.toLowerCase().trim()
      if (
        (lower.includes('error') || lower.includes('failed') || lower.includes('exception')) &&
        lower.length > 10 &&
        lower.length < 500
      ) {
        errors.push({ message: line.trim() })
      }
    }
  }

  return errors.slice(0, 20) // cap at 20
}

function extractFilePath(message: string): string | null {
  const patterns = [
    /(?:\.\/)?(?:src\/[^\s:()]+\.[tj]sx?)/,
    /(?:at\s+)([^\s:()]+\.[tj]sx?)/,
  ]
  for (const pattern of patterns) {
    const match = message.match(pattern)
    if (match) return match[1] || match[0]
  }
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// Simple hash (deterministic, no crypto dependency)
// ─────────────────────────────────────────────────────────────────────────────

function simpleHash(input: string): string {
  let hash = 0
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i)
    hash = ((hash << 5) - hash + char) | 0
  }
  return `fp-${(hash >>> 0).toString(36)}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Comparison
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if two fingerprints represent the same failure.
 */
export function fingerprintsMatch(a: FailureFingerprint, b: FailureFingerprint): boolean {
  return a.hash === b.hash
}

/**
 * Check if a fingerprint is likely a variant of another.
 */
export function fingerprintsSimilar(a: FailureFingerprint, b: FailureFingerprint): boolean {
  if (a.hash === b.hash) return true
  if (a.category !== b.category) return false

  // Check normalized message overlap
  const wordsA = a.normalizedMessage.split(' ').filter((w) => w.length > 3)
  const wordsB = new Set(b.normalizedMessage.split(' ').filter((w) => w.length > 3))
  const overlap = wordsA.filter((w) => wordsB.has(w)).length
  const overlapRatio = overlap / Math.max(wordsA.length, 1)

  return overlapRatio > 0.6
}
