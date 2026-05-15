/**
 * @module protectedFiles
 * @description Milestone 2 — Protected file classification system.
 * Identifies files that must never be silently modified by AI agents.
 * Future code agents MUST request approval before touching protected files.
 * Risk score increases automatically for plans that touch protected files.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ProtectionType =
  | 'auth'
  | 'billing'
  | 'deployment'
  | 'migration'
  | 'env'
  | 'secrets'
  | 'ci-cd'
  | 'worker'
  | 'payload'
  | 'rbac'
  | 'payment'
  | 'realtime'
  | 'database'

export interface ProtectedFile {
  path: string
  protectionType: ProtectionType
  reason: string
  riskLevel: 'MEDIUM' | 'HIGH' | 'CRITICAL'
  requiresApproval: boolean
}

export interface ProtectionRule {
  /** Glob-style pattern tested against file path (case-insensitive substring match) */
  pattern: string
  protectionType: ProtectionType
  reason: string
  riskLevel: 'MEDIUM' | 'HIGH' | 'CRITICAL'
}

// ─────────────────────────────────────────────────────────────────────────────
// Protection rules registry
// ─────────────────────────────────────────────────────────────────────────────

export const PROTECTION_RULES: ProtectionRule[] = [
  // Auth & sessions
  { pattern: '/auth/', protectionType: 'auth', reason: 'Authentication module', riskLevel: 'CRITICAL' },
  { pattern: 'auth.ts', protectionType: 'auth', reason: 'Authentication config', riskLevel: 'CRITICAL' },
  { pattern: 'session.ts', protectionType: 'auth', reason: 'Session management', riskLevel: 'CRITICAL' },
  { pattern: 'jwt.ts', protectionType: 'auth', reason: 'JWT handling', riskLevel: 'CRITICAL' },
  { pattern: 'middleware.ts', protectionType: 'auth', reason: 'Request middleware (auth/routing)', riskLevel: 'HIGH' },
  { pattern: 'roles.ts', protectionType: 'rbac', reason: 'Role-Based Access Control', riskLevel: 'CRITICAL' },
  { pattern: 'access.ts', protectionType: 'rbac', reason: 'Access control rules', riskLevel: 'CRITICAL' },
  { pattern: '/access/', protectionType: 'rbac', reason: 'Access control directory', riskLevel: 'CRITICAL' },
  { pattern: 'permissions.ts', protectionType: 'rbac', reason: 'Permission definitions', riskLevel: 'CRITICAL' },

  // Billing & payments
  { pattern: 'stripe', protectionType: 'payment', reason: 'Stripe payment integration', riskLevel: 'CRITICAL' },
  { pattern: '/billing/', protectionType: 'billing', reason: 'Billing module', riskLevel: 'CRITICAL' },
  { pattern: '/payment', protectionType: 'payment', reason: 'Payment processing', riskLevel: 'CRITICAL' },
  { pattern: 'webhook', protectionType: 'payment', reason: 'Webhook endpoint (potential payment/auth webhook)', riskLevel: 'HIGH' },
  { pattern: 'paddle.', protectionType: 'payment', reason: 'Paddle billing integration', riskLevel: 'CRITICAL' },
  { pattern: 'lemonsqueezy', protectionType: 'payment', reason: 'Lemon Squeezy integration', riskLevel: 'CRITICAL' },

  // Database
  { pattern: '/migrations/', protectionType: 'migration', reason: 'Database migration — irreversible schema changes', riskLevel: 'CRITICAL' },
  { pattern: 'migration_', protectionType: 'migration', reason: 'Database migration file', riskLevel: 'CRITICAL' },
  { pattern: 'schema.prisma', protectionType: 'database', reason: 'Prisma schema — modifying breaks migrations', riskLevel: 'CRITICAL' },
  { pattern: 'drizzle.config', protectionType: 'database', reason: 'Drizzle ORM config', riskLevel: 'HIGH' },

  // Environment & secrets
  { pattern: '.env', protectionType: 'env', reason: 'Environment variables — may contain secrets', riskLevel: 'CRITICAL' },
  { pattern: '.env.local', protectionType: 'secrets', reason: 'Local environment secrets', riskLevel: 'CRITICAL' },
  { pattern: '.env.production', protectionType: 'secrets', reason: 'Production secrets', riskLevel: 'CRITICAL' },
  { pattern: 'secrets.ts', protectionType: 'secrets', reason: 'Secret management module', riskLevel: 'CRITICAL' },

  // Deployment & CI/CD
  { pattern: '.github/workflows/', protectionType: 'ci-cd', reason: 'CI/CD pipeline — changes affect all deployments', riskLevel: 'HIGH' },
  { pattern: 'deploy.yml', protectionType: 'ci-cd', reason: 'Deployment workflow', riskLevel: 'HIGH' },
  { pattern: 'wrangler.toml', protectionType: 'worker', reason: 'Cloudflare Worker config', riskLevel: 'HIGH' },
  { pattern: 'wrangler.jsonc', protectionType: 'worker', reason: 'Cloudflare Worker config', riskLevel: 'HIGH' },
  { pattern: 'wrangler.json', protectionType: 'worker', reason: 'Cloudflare Worker config', riskLevel: 'HIGH' },
  { pattern: 'Dockerfile', protectionType: 'deployment', reason: 'Container build config', riskLevel: 'HIGH' },
  { pattern: 'docker-compose', protectionType: 'deployment', reason: 'Docker compose config', riskLevel: 'HIGH' },

  // Framework config
  { pattern: 'payload.config', protectionType: 'payload', reason: 'Payload CMS core configuration', riskLevel: 'CRITICAL' },
  { pattern: 'next.config', protectionType: 'deployment', reason: 'Next.js build config', riskLevel: 'HIGH' },
  { pattern: 'tsconfig.json', protectionType: 'deployment', reason: 'TypeScript compiler config', riskLevel: 'MEDIUM' },

  // Realtime
  { pattern: '/realtime/', protectionType: 'realtime', reason: 'Realtime system', riskLevel: 'HIGH' },
  { pattern: 'socket.ts', protectionType: 'realtime', reason: 'WebSocket server', riskLevel: 'HIGH' },
  { pattern: 'websocket', protectionType: 'realtime', reason: 'WebSocket implementation', riskLevel: 'HIGH' },
]

// ─────────────────────────────────────────────────────────────────────────────
// Classification
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Classify a list of file paths and return which ones are protected.
 */
export function classifyProtectedFiles(filePaths: string[]): ProtectedFile[] {
  const result: ProtectedFile[] = []

  for (const filePath of filePaths) {
    const lower = filePath.toLowerCase()
    const matches: ProtectionRule[] = []

    for (const rule of PROTECTION_RULES) {
      if (lower.includes(rule.pattern.toLowerCase())) {
        matches.push(rule)
      }
    }

    if (matches.length === 0) continue

    // Pick the highest risk rule
    const highest = matches.reduce((prev, cur) => {
      const order: Record<string, number> = { CRITICAL: 3, HIGH: 2, MEDIUM: 1 }
      return (order[cur.riskLevel] ?? 0) > (order[prev.riskLevel] ?? 0) ? cur : prev
    })

    result.push({
      path: filePath,
      protectionType: highest.protectionType,
      reason: matches.map((m) => m.reason).join('; '),
      riskLevel: highest.riskLevel,
      requiresApproval: highest.riskLevel === 'CRITICAL' || highest.riskLevel === 'HIGH',
    })
  }

  return result
}

/**
 * Check if a single file path matches any protection rule.
 */
export function isFileProtected(filePath: string): boolean {
  const lower = filePath.toLowerCase()
  return PROTECTION_RULES.some((rule) => lower.includes(rule.pattern.toLowerCase()))
}

/**
 * Get a human-readable badge label for a protection type.
 */
export function getProtectionBadge(protectionType: ProtectionType): string {
  const badges: Record<ProtectionType, string> = {
    auth: '🔐 Auth',
    billing: '💳 Billing',
    deployment: '🚀 Deploy',
    migration: '🗄️ Migration',
    env: '🔑 Env',
    secrets: '🤫 Secrets',
    'ci-cd': '⚙️ CI/CD',
    worker: '☁️ Worker',
    payload: '📦 Payload',
    rbac: '🛡️ RBAC',
    payment: '💰 Payment',
    realtime: '⚡ Realtime',
    database: '🗃️ Database',
  }
  return badges[protectionType] ?? '⚠️ Protected'
}

/**
 * Given a plan's affected files list, return which ones are protected
 * and a formatted warning string.
 */
export function buildProtectedFileWarning(affectedFiles: string[]): {
  protectedFiles: ProtectedFile[]
  warningText: string
} {
  const protectedFiles = classifyProtectedFiles(affectedFiles)
  if (protectedFiles.length === 0) {
    return { protectedFiles: [], warningText: '' }
  }

  const critical = protectedFiles.filter((f) => f.riskLevel === 'CRITICAL')
  const high = protectedFiles.filter((f) => f.riskLevel === 'HIGH')

  const lines: string[] = ['⚠️ **PROTECTED FILES DETECTED** — Human approval required before modification:']
  for (const f of protectedFiles) {
    lines.push(`  - \`${f.path}\` (${f.riskLevel}) — ${f.reason}`)
  }
  if (critical.length > 0) {
    lines.push(`\n🚨 ${critical.length} CRITICAL file(s) — these MUST NOT be modified without explicit sign-off.`)
  }
  if (high.length > 0) {
    lines.push(`⚠️ ${high.length} HIGH-risk file(s) — require careful review.`)
  }

  return {
    protectedFiles,
    warningText: lines.join('\n'),
  }
}
