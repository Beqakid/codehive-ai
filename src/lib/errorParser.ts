/**
 * @module errorParser
 * @description Classifies GitHub Actions / CI workflow errors into categories.
 * Extracts failed commands, exit codes, relevant file paths, and generates
 * a fingerprint for detecting repeated identical errors.
 * Exports: parseWorkflowError, classifyError, ErrorCategory, ParsedError.
 */

export type ErrorCategory =
  | 'missing_dependency'
  | 'typescript_error'
  | 'test_failure'
  | 'runtime_error'
  | 'lint_error'
  | 'config_error'
  | 'environment_error'
  | 'unknown'

export interface ParsedError {
  category: ErrorCategory
  failedCommand: string
  exitCode: number | null
  summary: string
  relevantFiles: string[]
  fingerprint: string
}

const CATEGORY_PATTERNS: Array<{ category: ErrorCategory; patterns: RegExp[] }> = [
  {
    category: 'missing_dependency',
    patterns: [
      /Cannot find module ['"]([^'"]+)['"]/i,
      /Module not found/i,
      /ERR_MODULE_NOT_FOUND/i,
      /Could not resolve/i,
      /ERESOLVE/i,
      /npm ERR! 404/i,
      /No matching version found/i,
    ],
  },
  {
    category: 'typescript_error',
    patterns: [
      /TS\d{4,5}/,
      /error TS\d+/i,
      /Type '.*' is not assignable to type/i,
      /Property '.*' does not exist on type/i,
      /Cannot find name '.*'/i,
      /Argument of type '.*' is not assignable/i,
    ],
  },
  {
    category: 'test_failure',
    patterns: [
      /Expected.*Received/is,
      /FAIL\s+src\//,
      /Test Suites:.*failed/i,
      /Tests:.*failed/i,
      /expect\(.*\)\.(toBe|toEqual|toMatch|toThrow)/i,
      /AssertionError/i,
    ],
  },
  {
    category: 'runtime_error',
    patterns: [
      /ReferenceError/i,
      /TypeError/i,
      /SyntaxError/i,
      /RangeError/i,
      /URIError/i,
    ],
  },
  {
    category: 'lint_error',
    patterns: [
      /ESLint/i,
      /Parsing error/i,
      /no-unused-vars/i,
      /prettier/i,
    ],
  },
  {
    category: 'config_error',
    patterns: [
      /tsconfig/i,
      /jest\.config/i,
      /webpack\.config/i,
      /Configuration error/i,
      /Invalid configuration/i,
      /Could not find a config file/i,
    ],
  },
  {
    category: 'environment_error',
    patterns: [
      /ECONNREFUSED/i,
      /ENOTFOUND/i,
      /ETIMEDOUT/i,
      /missing.*env/i,
      /environment variable/i,
    ],
  },
]

export function classifyError(logs: string): ErrorCategory {
  for (const { category, patterns } of CATEGORY_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(logs)) return category
    }
  }
  return 'unknown'
}

export function extractFailedCommand(logs: string): string {
  const cmdPatterns = [
    /Run (npm [\w-]+)/i,
    /> (.+)\n.*Exit code: (\d+)/i,
    /npm ERR!.*lifecycle.*\n.*npm ERR!\s+(.*)/i,
  ]

  for (const pattern of cmdPatterns) {
    const match = logs.match(pattern)
    if (match) return match[1] || match[0]
  }

  if (/npm test/.test(logs)) return 'npm test'
  if (/npm run build/.test(logs) || /tsc/.test(logs)) return 'npm run build'
  if (/npm install/.test(logs) || /npm ci/.test(logs)) return 'npm ci'

  return 'unknown'
}

export function extractExitCode(logs: string): number | null {
  const match = logs.match(/[Ee]xit code[:\s]+(\d+)/i) || logs.match(/Process completed with exit code (\d+)/i)
  return match ? parseInt(match[1], 10) : null
}

export function extractRelevantFiles(logs: string): string[] {
  const files = new Set<string>()

  // Match file paths in error output (src/..., lib/..., test/... etc.)
  const pathPattern = /(?:src|lib|test|__tests__|dist)\/[\w/.%-]+\.(?:ts|tsx|js|jsx|json)/g
  let match
  while ((match = pathPattern.exec(logs)) !== null) {
    const filePath = match[0].trim()
    if (!filePath.includes('node_modules')) {
      files.add(filePath)
    }
  }

  // Also match "at ..." stacktrace paths
  const stackPattern = /at\s+.*\(([\w/.%-]+\.(?:ts|tsx|js|jsx)):(\d+):(\d+)\)/g
  while ((match = stackPattern.exec(logs)) !== null) {
    if (match[1] && !match[1].includes('node_modules')) {
      files.add(match[1])
    }
  }

  return Array.from(files).slice(0, 20)
}

export function generateErrorSummary(logs: string, _category: ErrorCategory): string {
  const lines = logs.split('\n')
  const errorLines: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (
      /error/i.test(line) ||
      /FAIL/i.test(line) ||
      /ERR!/i.test(line) ||
      /TS\d{4,5}/.test(line) ||
      /Cannot find/i.test(line) ||
      /not assignable/i.test(line) ||
      /Expected.*Received/i.test(line) ||
      /Module not found/i.test(line)
    ) {
      errorLines.push(line.trim())
      if (i + 1 < lines.length) errorLines.push(lines[i + 1].trim())
      if (i + 2 < lines.length) errorLines.push(lines[i + 2].trim())
    }
  }

  if (errorLines.length === 0) {
    return lines.slice(-20).join('\n').slice(0, 2000)
  }

  return [...new Set(errorLines)].join('\n').slice(0, 2000)
}

export function generateFingerprint(
  category: ErrorCategory,
  failedCommand: string,
  summary: string,
): string {
  const firstLine = summary.split('\n')[0] || ''
  const raw = `${category}:${failedCommand}:${firstLine.slice(0, 100)}`
  let hash = 0
  for (let i = 0; i < raw.length; i++) {
    const char = raw.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash |= 0
  }
  return `fp_${Math.abs(hash).toString(36)}`
}

export function parseWorkflowError(logs: string): ParsedError {
  const category = classifyError(logs)
  const failedCommand = extractFailedCommand(logs)
  const exitCode = extractExitCode(logs)
  const relevantFiles = extractRelevantFiles(logs)
  const summary = generateErrorSummary(logs, category)
  const fingerprint = generateFingerprint(category, failedCommand, summary)

  return { category, failedCommand, exitCode, summary, relevantFiles, fingerprint }
}
