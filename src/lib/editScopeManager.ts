/**
 * @module editScopeManager
 * @description Milestone 3 — Editable scope system.
 * Controls which files/directories AI is allowed to modify per project.
 * Integrates with protected files and risk engine.
 */

import { isFileProtected, classifyProtectedFiles, type ProtectedFile } from './protectedFiles'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ScopePermission = 'allowed' | 'restricted' | 'blocked'

export interface ScopeRule {
  pattern: string
  permission: ScopePermission
  reason: string
}

export interface EditScope {
  projectId: string
  allowedPatterns: string[]
  restrictedPatterns: string[]
  blockedPatterns: string[]
  customRules: ScopeRule[]
}

export interface ScopeCheckResult {
  filePath: string
  permission: ScopePermission
  reason: string
  protectedFile?: ProtectedFile
}

// ─────────────────────────────────────────────────────────────────────────────
// Default scope rules (sensible defaults for most projects)
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_ALLOWED_PATTERNS: string[] = [
  'src/components/**',
  'src/app/features/**',
  'src/app/(frontend)/**',
  'src/lib/**',
  'src/utils/**',
  'src/helpers/**',
  'src/hooks/**',
  'src/services/**',
  'src/types/**',
  'src/styles/**',
  'app/components/**',
  'app/features/**',
  'components/**',
  'lib/**',
  'utils/**',
  'helpers/**',
  'docs/**',
  'tests/**',
  '__tests__/**',
  'test/**',
]

export const DEFAULT_RESTRICTED_PATTERNS: string[] = [
  'src/auth/**',
  'src/payments/**',
  'src/billing/**',
  'auth/**',
  'payments/**',
  'middleware.*',
  'src/middleware.*',
]

export const DEFAULT_BLOCKED_PATTERNS: string[] = [
  '**/.env*',
  '**/node_modules/**',
  '**/package-lock.json',
  '**/pnpm-lock.yaml',
  '**/yarn.lock',
  '**/.git/**',
  '**/dist/**',
  '**/.next/**',
  '**/wrangler.toml',
  '**/wrangler.jsonc',
  '**/payload.config.ts',
  'src/migrations/**',
  '.github/workflows/**',
  '**/Dockerfile',
  '**/docker-compose*',
  'deploy/**',
  'infrastructure/**',
]

// ─────────────────────────────────────────────────────────────────────────────
// Glob matching — simple glob-to-regex for Workers compatibility
// ─────────────────────────────────────────────────────────────────────────────

function globToRegex(glob: string): RegExp {
  let regexStr = '^'
  let i = 0
  while (i < glob.length) {
    const c = glob[i]
    if (c === '*') {
      if (glob[i + 1] === '*') {
        // ** matches any depth
        regexStr += '.*'
        i += 2
        if (glob[i] === '/') i++ // skip trailing /
        continue
      }
      // * matches single level
      regexStr += '[^/]*'
    } else if (c === '?') {
      regexStr += '[^/]'
    } else if (c === '.') {
      regexStr += '\\.'
    } else if (c === '/') {
      regexStr += '/'
    } else {
      regexStr += c
    }
    i++
  }
  regexStr += '$'
  return new RegExp(regexStr)
}

function matchesAnyGlob(filePath: string, patterns: string[]): boolean {
  return patterns.some((pat) => globToRegex(pat).test(filePath))
}

// ─────────────────────────────────────────────────────────────────────────────
// Default scope
// ─────────────────────────────────────────────────────────────────────────────

export function createDefaultScope(projectId: string): EditScope {
  return {
    projectId,
    allowedPatterns: [...DEFAULT_ALLOWED_PATTERNS],
    restrictedPatterns: [...DEFAULT_RESTRICTED_PATTERNS],
    blockedPatterns: [...DEFAULT_BLOCKED_PATTERNS],
    customRules: [],
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Scope checking
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check whether a single file path is within the editable scope.
 * Priority: blocked > restricted > custom rules > allowed > default (restricted)
 */
export function checkFileScope(filePath: string, scope: EditScope): ScopeCheckResult {
  // 1. Check blocked patterns first (highest priority)
  if (matchesAnyGlob(filePath, scope.blockedPatterns)) {
    return { filePath, permission: 'blocked', reason: 'Matches blocked pattern' }
  }

  // 2. Check protected file system (from M2)
  if (isFileProtected(filePath)) {
    const classifications = classifyProtectedFiles([filePath])
    const pf = classifications[0]
    return {
      filePath,
      permission: 'restricted',
      reason: `Protected: ${pf?.reason || 'system-detected'}`,
      protectedFile: pf,
    }
  }

  // 3. Check custom rules
  for (const rule of scope.customRules) {
    if (globToRegex(rule.pattern).test(filePath)) {
      return { filePath, permission: rule.permission, reason: rule.reason }
    }
  }

  // 4. Check restricted patterns
  if (matchesAnyGlob(filePath, scope.restrictedPatterns)) {
    return { filePath, permission: 'restricted', reason: 'Matches restricted pattern — requires approval' }
  }

  // 5. Check allowed patterns
  if (matchesAnyGlob(filePath, scope.allowedPatterns)) {
    return { filePath, permission: 'allowed', reason: 'Within allowed scope' }
  }

  // 6. Default: new files in reasonable paths are allowed, others restricted
  if (filePath.startsWith('src/') || filePath.startsWith('app/') || filePath.startsWith('docs/') || filePath.startsWith('tests/')) {
    return { filePath, permission: 'allowed', reason: 'Standard source directory' }
  }

  return { filePath, permission: 'restricted', reason: 'Not in any allowed pattern — requires review' }
}

/**
 * Check multiple files against scope and return a summary.
 */
export function checkFilesScope(filePaths: string[], scope: EditScope): {
  results: ScopeCheckResult[]
  allowed: string[]
  restricted: string[]
  blocked: string[]
} {
  const results = filePaths.map((fp) => checkFileScope(fp, scope))
  return {
    results,
    allowed: results.filter((r) => r.permission === 'allowed').map((r) => r.filePath),
    restricted: results.filter((r) => r.permission === 'restricted').map((r) => r.filePath),
    blocked: results.filter((r) => r.permission === 'blocked').map((r) => r.filePath),
  }
}

/**
 * Get a human-readable summary of scope check results.
 */
export function formatScopeCheckSummary(results: ScopeCheckResult[]): string {
  const allowed = results.filter((r) => r.permission === 'allowed')
  const restricted = results.filter((r) => r.permission === 'restricted')
  const blocked = results.filter((r) => r.permission === 'blocked')

  const parts: string[] = []
  if (allowed.length) parts.push(`✅ ${allowed.length} files allowed`)
  if (restricted.length) parts.push(`⚠️ ${restricted.length} files restricted (need approval):\n${restricted.map((r) => `  - ${r.filePath}: ${r.reason}`).join('\n')}`)
  if (blocked.length) parts.push(`🚫 ${blocked.length} files blocked:\n${blocked.map((r) => `  - ${r.filePath}: ${r.reason}`).join('\n')}`)
  return parts.join('\n')
}
