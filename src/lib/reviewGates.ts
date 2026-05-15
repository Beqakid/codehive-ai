/**
 * @module reviewGates
 * @description Milestone 3 — Review gate system.
 * Enforces approval requirements before risky modifications proceed.
 * Gates are based on risk level, protected files, dependency spread,
 * and other M2 intelligence signals.
 */

import type { RiskLevel, RiskReport } from './riskEngine'
import type { ProtectedFile } from './protectedFiles'
import type { PatchFile } from './patchEngine'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type GateDecision = 'auto_approve' | 'confirmation_required' | 'approval_required' | 'blocked'

export interface ReviewGateCheck {
  gateId: string
  name: string
  decision: GateDecision
  reason: string
  details?: string
}

export interface ReviewGateResult {
  overallDecision: GateDecision
  checks: ReviewGateCheck[]
  canProceed: boolean
  requiresHumanApproval: boolean
  blockReasons: string[]
  warnings: string[]
  summary: string
}

export interface ReviewGateInput {
  patches: PatchFile[]
  riskReport: RiskReport | null
  protectedFiles: ProtectedFile[]
  totalLinesChanged: number
  affectedFileCount: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Risk-level to gate decision mapping
// ─────────────────────────────────────────────────────────────────────────────

const RISK_TO_DECISION: Record<RiskLevel, GateDecision> = {
  LOW: 'auto_approve',
  MEDIUM: 'confirmation_required',
  HIGH: 'approval_required',
  CRITICAL: 'blocked',
}

// ─────────────────────────────────────────────────────────────────────────────
// Gate checks
// ─────────────────────────────────────────────────────────────────────────────

function checkRiskLevel(riskReport: RiskReport | null): ReviewGateCheck {
  if (!riskReport) {
    return {
      gateId: 'risk_level',
      name: 'Risk Level Gate',
      decision: 'confirmation_required',
      reason: 'No risk report available — proceeding with caution',
    }
  }

  const decision = RISK_TO_DECISION[riskReport.riskLevel]
  return {
    gateId: 'risk_level',
    name: 'Risk Level Gate',
    decision,
    reason: `Risk level: ${riskReport.riskLevel} (score: ${riskReport.riskScore}/100)`,
    details: riskReport.riskLevel === 'CRITICAL'
      ? 'CRITICAL risk — changes must be manually reviewed and approved before proceeding'
      : undefined,
  }
}

function checkProtectedFiles(protectedFiles: ProtectedFile[], patches: PatchFile[]): ReviewGateCheck {
  const patchPaths = new Set(patches.map((p) => p.filePath))
  const touchedProtected = protectedFiles.filter((pf) => patchPaths.has(pf.path))

  if (touchedProtected.length === 0) {
    return {
      gateId: 'protected_files',
      name: 'Protected Files Gate',
      decision: 'auto_approve',
      reason: 'No protected files modified',
    }
  }

  // Check severity of protected files
  const hasAuth = touchedProtected.some((pf) => pf.protectionType === 'auth')
  const hasPayment = touchedProtected.some((pf) => pf.protectionType === 'payment')
  const hasMigration = touchedProtected.some((pf) => pf.protectionType === 'migration')
  const hasDeployment = touchedProtected.some((pf) => pf.protectionType === 'deployment')

  if (hasAuth || hasPayment || hasMigration) {
    return {
      gateId: 'protected_files',
      name: 'Protected Files Gate',
      decision: 'blocked',
      reason: `Critical protected files modified: ${touchedProtected.map((p) => p.path).join(', ')}`,
      details: 'Auth, payment, or migration files require manual implementation',
    }
  }

  if (hasDeployment) {
    return {
      gateId: 'protected_files',
      name: 'Protected Files Gate',
      decision: 'approval_required',
      reason: `Deployment config modified: ${touchedProtected.map((p) => p.path).join(', ')}`,
    }
  }

  return {
    gateId: 'protected_files',
    name: 'Protected Files Gate',
    decision: 'confirmation_required',
    reason: `${touchedProtected.length} protected file(s) modified`,
    details: touchedProtected.map((p) => `${p.path} (${p.protectionType})`).join(', '),
  }
}

function checkChangeSize(totalLines: number, fileCount: number): ReviewGateCheck {
  if (fileCount > 10 || totalLines > 1000) {
    return {
      gateId: 'change_size',
      name: 'Change Size Gate',
      decision: 'approval_required',
      reason: `Large change: ${fileCount} files, ${totalLines} lines`,
      details: 'Large patches have higher risk of unintended side effects',
    }
  }

  if (fileCount > 5 || totalLines > 300) {
    return {
      gateId: 'change_size',
      name: 'Change Size Gate',
      decision: 'confirmation_required',
      reason: `Medium change: ${fileCount} files, ${totalLines} lines`,
    }
  }

  return {
    gateId: 'change_size',
    name: 'Change Size Gate',
    decision: 'auto_approve',
    reason: `Small change: ${fileCount} files, ${totalLines} lines`,
  }
}

function checkDependencySpread(patches: PatchFile[]): ReviewGateCheck {
  // Count unique directories
  const dirs = new Set(patches.map((p) => {
    const parts = p.filePath.split('/')
    return parts.slice(0, -1).join('/')
  }))

  if (dirs.size > 5) {
    return {
      gateId: 'dependency_spread',
      name: 'Dependency Spread Gate',
      decision: 'confirmation_required',
      reason: `Changes span ${dirs.size} directories — wide blast radius`,
    }
  }

  return {
    gateId: 'dependency_spread',
    name: 'Dependency Spread Gate',
    decision: 'auto_approve',
    reason: `Changes contained in ${dirs.size} directory(ies)`,
  }
}

function checkAuthPaymentInvolvement(patches: PatchFile[]): ReviewGateCheck {
  const sensitivePatterns = [
    /auth/i, /login/i, /session/i, /token/i, /jwt/i,
    /payment/i, /billing/i, /stripe/i, /checkout/i, /subscription/i,
  ]

  const sensitiveFiles = patches.filter((p) =>
    sensitivePatterns.some((pat) => pat.test(p.filePath) || pat.test(p.content || '')),
  )

  if (sensitiveFiles.length > 0) {
    return {
      gateId: 'auth_payment',
      name: 'Auth/Payment Gate',
      decision: 'blocked',
      reason: `Patches involve auth/payment code: ${sensitiveFiles.map((f) => f.filePath).join(', ')}`,
      details: 'Auth and payment modifications are blocked for automated changes',
    }
  }

  return {
    gateId: 'auth_payment',
    name: 'Auth/Payment Gate',
    decision: 'auto_approve',
    reason: 'No auth/payment code involvement detected',
  }
}

function checkMigrationInvolvement(patches: PatchFile[]): ReviewGateCheck {
  const migrationFiles = patches.filter((p) =>
    /migrat/i.test(p.filePath) || /\.sql$/i.test(p.filePath) || /schema\.(ts|js|prisma)/i.test(p.filePath),
  )

  if (migrationFiles.length > 0) {
    return {
      gateId: 'migration',
      name: 'Migration Gate',
      decision: 'blocked',
      reason: `Database migration files detected: ${migrationFiles.map((f) => f.filePath).join(', ')}`,
      details: 'Database migrations must be manually reviewed and applied',
    }
  }

  return {
    gateId: 'migration',
    name: 'Migration Gate',
    decision: 'auto_approve',
    reason: 'No migration files involved',
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main gate evaluation
// ─────────────────────────────────────────────────────────────────────────────

const DECISION_PRIORITY: Record<GateDecision, number> = {
  auto_approve: 0,
  confirmation_required: 1,
  approval_required: 2,
  blocked: 3,
}

/**
 * Evaluate all review gates for a patch set.
 * The overall decision is the MOST restrictive gate result.
 */
export function evaluateReviewGates(input: ReviewGateInput): ReviewGateResult {
  const checks: ReviewGateCheck[] = [
    checkRiskLevel(input.riskReport),
    checkProtectedFiles(input.protectedFiles, input.patches),
    checkChangeSize(input.totalLinesChanged, input.affectedFileCount),
    checkDependencySpread(input.patches),
    checkAuthPaymentInvolvement(input.patches),
    checkMigrationInvolvement(input.patches),
  ]

  // Overall = most restrictive
  let overallDecision: GateDecision = 'auto_approve'
  for (const check of checks) {
    if (DECISION_PRIORITY[check.decision] > DECISION_PRIORITY[overallDecision]) {
      overallDecision = check.decision
    }
  }

  const blockReasons = checks
    .filter((c) => c.decision === 'blocked')
    .map((c) => c.reason)

  const warnings = checks
    .filter((c) => c.decision === 'confirmation_required' || c.decision === 'approval_required')
    .map((c) => `[${c.name}] ${c.reason}`)

  const canProceed = overallDecision !== 'blocked'
  const requiresHumanApproval = overallDecision === 'approval_required' || overallDecision === 'blocked'

  const summary = overallDecision === 'auto_approve'
    ? '✅ All review gates passed — auto-approval'
    : overallDecision === 'confirmation_required'
      ? `⚠️ Confirmation required — ${warnings.length} gate(s) flagged`
      : overallDecision === 'approval_required'
        ? `🔒 Approval required — ${warnings.length} gate(s) flagged`
        : `🚫 Blocked — ${blockReasons.length} gate(s) blocked`

  return {
    overallDecision,
    checks,
    canProceed,
    requiresHumanApproval,
    blockReasons,
    warnings,
    summary,
  }
}

/**
 * Get the icon/badge for a gate decision.
 */
export function getGateDecisionIcon(decision: GateDecision): string {
  switch (decision) {
    case 'auto_approve': return '✅'
    case 'confirmation_required': return '⚠️'
    case 'approval_required': return '🔒'
    case 'blocked': return '🚫'
  }
}

/**
 * Format review gate results for display.
 */
export function formatReviewGateSummary(result: ReviewGateResult): string {
  const lines: string[] = [
    `## Review Gates — ${result.summary}`,
    '',
    '| Gate | Decision | Reason |',
    '|------|----------|--------|',
  ]

  for (const check of result.checks) {
    const icon = getGateDecisionIcon(check.decision)
    lines.push(`| ${check.name} | ${icon} ${check.decision} | ${check.reason} |`)
  }

  if (result.blockReasons.length) {
    lines.push('', '### 🚫 Block Reasons')
    for (const r of result.blockReasons) lines.push(`- ${r}`)
  }

  return lines.join('\n')
}
