/**
 * @module riskEngine
 * @description Milestone 2 — Implementation risk scoring engine.
 * Evaluates the risk of a proposed change based on affected files,
 * protected file matches, dependency impact, and repo characteristics.
 * Output drives planner warnings and UI risk badges.
 */

import type { ProtectedFile } from './protectedFiles'
import type { DependencyEdge, RepoIntelligenceResult } from './repoIntelligence'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
export type RollbackComplexity = 'SIMPLE' | 'MODERATE' | 'COMPLEX'
export type ImplementationScope = 'MINIMAL' | 'MODERATE' | 'EXTENSIVE'

export interface RiskFactor {
  name: string
  triggered: boolean
  weight: number
  description: string
}

export interface RiskReport {
  runId: string
  projectId: string
  riskLevel: RiskLevel
  riskScore: number          // 0-100
  confidenceScore: number    // 0-100 — how confident we are in this score
  affectedFiles: string[]
  protectedFilesTouched: ProtectedFile[]
  rollbackComplexity: RollbackComplexity
  implementationScope: ImplementationScope
  factors: RiskFactor[]
  recommendations: string[]
  notRecommendedFiles: string[]
  createdAt: number
}

export interface RiskEngineInput {
  runId: string
  projectId: string
  affectedFiles: string[]
  protectedFilesTouched: ProtectedFile[]
  dependencyEdges: DependencyEdge[]
  repoIntelligence: RepoIntelligenceResult
  planComplexity?: 'simple' | 'moderate' | 'complex'
  estimatedHours?: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Risk factor definitions
// ─────────────────────────────────────────────────────────────────────────────

function buildRiskFactors(input: RiskEngineInput): RiskFactor[] {
  const {
    affectedFiles,
    protectedFilesTouched,
    dependencyEdges,
    repoIntelligence,
    planComplexity,
    estimatedHours,
  } = input

  const hasCritical = protectedFilesTouched.some((f) => f.riskLevel === 'CRITICAL')
  const hasHighProtected = protectedFilesTouched.some((f) => f.riskLevel === 'HIGH')
  const hasAuth = protectedFilesTouched.some((f) => f.protectionType === 'auth' || f.protectionType === 'rbac')
  const hasPayment = protectedFilesTouched.some((f) => f.protectionType === 'payment' || f.protectionType === 'billing')
  const hasMigration = protectedFilesTouched.some((f) => f.protectionType === 'migration' || f.protectionType === 'database')
  const hasDeployment = protectedFilesTouched.some((f) => f.protectionType === 'ci-cd' || f.protectionType === 'worker' || f.protectionType === 'deployment')
  const hasRealtime = protectedFilesTouched.some((f) => f.protectionType === 'realtime')

  // Count files with high inbound dependency count
  const inboundCounts = new Map<string, number>()
  for (const edge of dependencyEdges) {
    inboundCounts.set(edge.targetFile, (inboundCounts.get(edge.targetFile) ?? 0) + 1)
  }
  const affectedSharedDeps = affectedFiles.filter((f) => (inboundCounts.get(f) ?? 0) >= 3)

  return [
    {
      name: 'large_change_surface',
      triggered: affectedFiles.length >= 10,
      weight: 15,
      description: `${affectedFiles.length} files affected (threshold: 10)`,
    },
    {
      name: 'critical_protected_file',
      triggered: hasCritical,
      weight: 40,
      description: hasCritical
        ? `CRITICAL protected files touched: ${protectedFilesTouched.filter((f) => f.riskLevel === 'CRITICAL').map((f) => f.path).join(', ')}`
        : 'No CRITICAL protected files touched',
    },
    {
      name: 'high_protected_file',
      triggered: hasHighProtected && !hasCritical,
      weight: 20,
      description: hasHighProtected
        ? `HIGH protected files touched: ${protectedFilesTouched.filter((f) => f.riskLevel === 'HIGH').map((f) => f.path).join(', ')}`
        : 'No HIGH protected files touched',
    },
    {
      name: 'auth_involvement',
      triggered: hasAuth,
      weight: 35,
      description: hasAuth
        ? 'Authentication or RBAC files are in scope — security regression risk'
        : 'No auth files affected',
    },
    {
      name: 'payment_involvement',
      triggered: hasPayment,
      weight: 40,
      description: hasPayment
        ? 'Payment/billing files affected — financial system risk'
        : 'No payment files affected',
    },
    {
      name: 'migration_involvement',
      triggered: hasMigration,
      weight: 35,
      description: hasMigration
        ? 'Database migrations in scope — schema changes are irreversible'
        : 'No migrations affected',
    },
    {
      name: 'deployment_config_involvement',
      triggered: hasDeployment,
      weight: 25,
      description: hasDeployment
        ? 'Deployment/worker config affected — can break production'
        : 'No deployment config affected',
    },
    {
      name: 'realtime_involvement',
      triggered: hasRealtime,
      weight: 20,
      description: hasRealtime
        ? 'Realtime/WebSocket system affected'
        : 'No realtime systems affected',
    },
    {
      name: 'shared_dependency_impact',
      triggered: affectedSharedDeps.length > 0,
      weight: 15,
      description:
        affectedSharedDeps.length > 0
          ? `${affectedSharedDeps.length} shared dependency file(s) with 3+ dependents`
          : 'No high-impact shared dependencies',
    },
    {
      name: 'complex_implementation',
      triggered: planComplexity === 'complex' || (estimatedHours ?? 0) > 16,
      weight: 10,
      description:
        planComplexity === 'complex'
          ? 'Implementation rated as complex'
          : `Estimated ${estimatedHours ?? '?'} hours of work`,
    },
    {
      name: 'large_repo',
      triggered: repoIntelligence.fileMap.length > 200,
      weight: 5,
      description:
        repoIntelligence.fileMap.length > 200
          ? `Large repository (${repoIntelligence.fileMap.length} files) — higher blast radius`
          : `Manageable repository size (${repoIntelligence.fileMap.length} files)`,
    },
  ]
}

// ─────────────────────────────────────────────────────────────────────────────
// Score → level mapping
// ─────────────────────────────────────────────────────────────────────────────

function scoreToLevel(score: number): RiskLevel {
  if (score >= 70) return 'CRITICAL'
  if (score >= 45) return 'HIGH'
  if (score >= 20) return 'MEDIUM'
  return 'LOW'
}

function scoreToRollback(score: number, hasMigration: boolean): RollbackComplexity {
  if (hasMigration || score >= 70) return 'COMPLEX'
  if (score >= 35) return 'MODERATE'
  return 'SIMPLE'
}

function scoreToScope(affectedCount: number): ImplementationScope {
  if (affectedCount >= 15) return 'EXTENSIVE'
  if (affectedCount >= 5) return 'MODERATE'
  return 'MINIMAL'
}

// ─────────────────────────────────────────────────────────────────────────────
// Recommendations
// ─────────────────────────────────────────────────────────────────────────────

function buildRecommendations(
  factors: RiskFactor[],
  protectedFiles: ProtectedFile[],
  level: RiskLevel,
): string[] {
  const recs: string[] = []
  const triggered = factors.filter((f) => f.triggered)

  if (level === 'CRITICAL') {
    recs.push('🚨 CRITICAL risk — do not proceed without explicit human approval')
  }
  if (triggered.find((f) => f.name === 'auth_involvement')) {
    recs.push('Write auth regression tests BEFORE modifying any auth files')
    recs.push('Review all session/token handling after auth changes')
  }
  if (triggered.find((f) => f.name === 'payment_involvement')) {
    recs.push('Test payment flows in a sandbox environment before production')
    recs.push('Ensure idempotency keys are preserved during payment changes')
  }
  if (triggered.find((f) => f.name === 'migration_involvement')) {
    recs.push('Back up the database before running any new migrations')
    recs.push('Test migrations on a staging environment first')
    recs.push('Ensure a rollback migration is prepared')
  }
  if (triggered.find((f) => f.name === 'shared_dependency_impact')) {
    recs.push('Run the full test suite — shared dependency changes can cause unexpected breakage')
  }
  if (triggered.find((f) => f.name === 'deployment_config_involvement')) {
    recs.push('Test deployment config changes in a non-production environment')
    recs.push('Have a rollback plan ready for Worker/CI config changes')
  }
  if (level === 'LOW' || level === 'MEDIUM') {
    recs.push('Standard code review is sufficient for this change')
  }

  // Files to avoid
  const criticalPaths = protectedFiles
    .filter((f) => f.riskLevel === 'CRITICAL')
    .map((f) => f.path)
  if (criticalPaths.length > 0) {
    recs.push(`Consider alternative implementations that avoid: ${criticalPaths.join(', ')}`)
  }

  return recs
}

// ─────────────────────────────────────────────────────────────────────────────
// Main scoring function
// ─────────────────────────────────────────────────────────────────────────────

export function calculateRisk(input: RiskEngineInput): RiskReport {
  const factors = buildRiskFactors(input)
  const triggered = factors.filter((f) => f.triggered)

  // Weighted sum
  const rawScore = triggered.reduce((sum, f) => sum + f.weight, 0)
  // Cap at 100
  const riskScore = Math.min(100, rawScore)

  // Confidence: lower if few files are affected (harder to assess)
  const fileCount = input.affectedFiles.length
  const confidenceScore = fileCount === 0 ? 30 : fileCount <= 2 ? 55 : fileCount <= 8 ? 75 : 90

  const riskLevel = scoreToLevel(riskScore)
  const hasMigration = input.protectedFilesTouched.some(
    (f) => f.protectionType === 'migration' || f.protectionType === 'database',
  )
  const rollbackComplexity = scoreToRollback(riskScore, hasMigration)
  const implementationScope = scoreToScope(input.affectedFiles.length)

  const recommendations = buildRecommendations(factors, input.protectedFilesTouched, riskLevel)

  // Files NOT recommended for modification
  const notRecommendedFiles = input.protectedFilesTouched
    .filter((f) => f.riskLevel === 'CRITICAL')
    .map((f) => f.path)

  return {
    runId: input.runId,
    projectId: input.projectId,
    riskLevel,
    riskScore,
    confidenceScore,
    affectedFiles: input.affectedFiles,
    protectedFilesTouched: input.protectedFilesTouched,
    rollbackComplexity,
    implementationScope,
    factors,
    recommendations,
    notRecommendedFiles,
    createdAt: Date.now(),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatting helpers
// ─────────────────────────────────────────────────────────────────────────────

export function getRiskEmoji(level: RiskLevel): string {
  const map: Record<RiskLevel, string> = {
    LOW: '🟢',
    MEDIUM: '🟡',
    HIGH: '🔴',
    CRITICAL: '🚨',
  }
  return map[level]
}

export function getRiskColor(level: RiskLevel): string {
  const map: Record<RiskLevel, string> = {
    LOW: '#22c55e',
    MEDIUM: '#f59e0b',
    HIGH: '#ef4444',
    CRITICAL: '#7c3aed',
  }
  return map[level]
}

export function formatRiskSummary(report: RiskReport): string {
  const emoji = getRiskEmoji(report.riskLevel)
  return `${emoji} ${report.riskLevel} risk (score: ${report.riskScore}/100, confidence: ${report.confidenceScore}%) — ${report.implementationScope} scope, ${report.rollbackComplexity} rollback`
}
