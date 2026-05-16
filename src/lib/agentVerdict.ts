/**
 * @module agentVerdict
 * @description Milestone 5 — Agent verdict and scoring system.
 * Aggregates signals from all agents in the pipeline to produce
 * a final production readiness verdict.
 *
 * Scores:
 *   - Implementation confidence (architect + code agent)
 *   - Risk score (risk engine + protected files)
 *   - Test confidence (test agent + execution results)
 *   - Reviewer approval (reviewer agent)
 *   - Production readiness (weighted aggregate)
 *
 * Actions:
 *   - proceed_to_pr: all green, auto-create PR
 *   - needs_human_review: medium confidence, create PR with review flag
 *   - blocked: critical risk or reviewer rejection
 *   - retry_with_fix: fixable failure detected
 *   - planning_only: no code changes recommended
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type VerdictAction =
  | 'proceed_to_pr'
  | 'needs_human_review'
  | 'blocked'
  | 'retry_with_fix'
  | 'planning_only'

export type ReviewerDecision = 'approve' | 'reject' | 'needs_changes'

export interface ReviewerVerdict {
  decision: ReviewerDecision
  reasons: string[]
  riskyFiles: string[]
  missingTests: string[]
  rollbackConcerns: string[]
  recommendation: string
  score: number // 0-100
}

export interface AgentScore {
  agentRole: string
  score: number // 0-100
  confidence: number // 0-1
  status: 'completed' | 'failed' | 'skipped'
  durationMs: number
  model: string
  provider: string
  summary: string
}

export interface VerdictInput {
  agentScores: AgentScore[]
  riskScore: number // 0-100 from risk engine
  riskLevel: string
  testsPassed: boolean
  testResults?: { total: number; passed: number; failed: number; skipped: number }
  lintPassed: boolean
  buildPassed: boolean
  reviewerVerdict?: ReviewerVerdict
  protectedFilesTouched: number
  totalFilesChanged: number
  totalLinesChanged: number
  healingAttempts: number
  healingSuccesses: number
  memoryConflicts: string[]
}

export interface ProductionVerdict {
  action: VerdictAction
  implementationConfidence: number // 0-100
  riskScore: number // 0-100
  testConfidence: number // 0-100
  reviewerApproval: ReviewerDecision | 'pending'
  productionReadiness: number // 0-100
  reasons: string[]
  warnings: string[]
  blockers: string[]
  timestamp: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Score weights
// ─────────────────────────────────────────────────────────────────────────────

const WEIGHTS = {
  implementation: 0.25,
  risk: 0.20,
  test: 0.25,
  reviewer: 0.20,
  healing: 0.10,
}

// ─────────────────────────────────────────────────────────────────────────────
// Verdict computation
// ─────────────────────────────────────────────────────────────────────────────

export function computeVerdict(input: VerdictInput): ProductionVerdict {
  const reasons: string[] = []
  const warnings: string[] = []
  const blockers: string[] = []

  // ── Implementation confidence ──────────────────────────────────────────
  const architectScore = input.agentScores.find((s) => s.agentRole === 'architect')
  const codeScore = input.agentScores.find((s) => s.agentRole === 'code')
  const implementationConfidence = Math.round(
    ((architectScore?.score || 0) + (codeScore?.score || 0)) / 2,
  )

  if (implementationConfidence >= 80) {
    reasons.push(`High implementation confidence (${implementationConfidence}%)`)
  } else if (implementationConfidence >= 50) {
    warnings.push(`Moderate implementation confidence (${implementationConfidence}%)`)
  } else {
    blockers.push(`Low implementation confidence (${implementationConfidence}%)`)
  }

  // ── Risk score (inverted — lower is better) ────────────────────────────
  const riskScore = input.riskScore
  const riskConfidence = 100 - riskScore // invert for readiness

  if (riskScore >= 70) {
    blockers.push(`High risk score (${riskScore}/100)`)
  } else if (riskScore >= 40) {
    warnings.push(`Moderate risk (${riskScore}/100)`)
  } else {
    reasons.push(`Low risk (${riskScore}/100)`)
  }

  if (input.protectedFilesTouched > 0) {
    warnings.push(`${input.protectedFilesTouched} protected file(s) touched`)
  }

  // ── Test confidence ────────────────────────────────────────────────────
  let testConfidence = 0
  if (input.testResults) {
    const { total, passed } = input.testResults
    testConfidence = total > 0 ? Math.round((passed / total) * 100) : 0
  } else {
    testConfidence = input.testsPassed ? 80 : 20
  }

  if (!input.buildPassed) {
    blockers.push('Build failed')
    testConfidence = Math.min(testConfidence, 10)
  }
  if (!input.lintPassed) {
    warnings.push('Lint check failed')
    testConfidence = Math.max(0, testConfidence - 15)
  }
  if (!input.testsPassed) {
    blockers.push('Tests failed')
  }

  // ── Reviewer approval ─────────────────────────────────────────────────
  const reviewerApproval = input.reviewerVerdict?.decision || 'pending'
  let reviewerScore = 50 // pending default

  if (input.reviewerVerdict) {
    reviewerScore = input.reviewerVerdict.score
    if (reviewerApproval === 'reject') {
      blockers.push(`Reviewer rejected: ${input.reviewerVerdict.reasons[0] || 'no reason given'}`)
    } else if (reviewerApproval === 'needs_changes') {
      warnings.push(`Reviewer requests changes: ${input.reviewerVerdict.reasons[0] || ''}`)
    } else {
      reasons.push('Reviewer approved')
    }

    if (input.reviewerVerdict.missingTests.length > 0) {
      warnings.push(`Missing tests: ${input.reviewerVerdict.missingTests.join(', ')}`)
    }
    if (input.reviewerVerdict.rollbackConcerns.length > 0) {
      warnings.push(`Rollback concerns: ${input.reviewerVerdict.rollbackConcerns.join(', ')}`)
    }
  }

  // ── Healing factor ────────────────────────────────────────────────────
  let healingScore = 100
  if (input.healingAttempts > 0) {
    healingScore = input.healingSuccesses > 0
      ? Math.round((input.healingSuccesses / input.healingAttempts) * 100)
      : 0
    if (input.healingAttempts > 2) {
      warnings.push(`${input.healingAttempts} healing attempts needed`)
    }
  }

  // ── Memory conflicts ──────────────────────────────────────────────────
  if (input.memoryConflicts.length > 0) {
    for (const conflict of input.memoryConflicts) {
      warnings.push(`Memory conflict: ${conflict}`)
    }
  }

  // ── Production readiness (weighted) ────────────────────────────────────
  const productionReadiness = Math.round(
    implementationConfidence * WEIGHTS.implementation +
    riskConfidence * WEIGHTS.risk +
    testConfidence * WEIGHTS.test +
    reviewerScore * WEIGHTS.reviewer +
    healingScore * WEIGHTS.healing,
  )

  // ── Determine action ──────────────────────────────────────────────────
  let action: VerdictAction

  if (blockers.length > 0) {
    // Check if any blockers are fixable
    const fixableBlockers = blockers.filter(
      (b) => b.includes('Tests failed') || b.includes('Lint') || b.includes('Build failed'),
    )
    if (fixableBlockers.length === blockers.length && input.healingAttempts < 3) {
      action = 'retry_with_fix'
    } else {
      action = 'blocked'
    }
  } else if (productionReadiness >= 80 && reviewerApproval === 'approve') {
    action = 'proceed_to_pr'
  } else if (productionReadiness >= 60) {
    action = 'needs_human_review'
  } else if (input.totalFilesChanged === 0) {
    action = 'planning_only'
  } else {
    action = 'needs_human_review'
  }

  return {
    action,
    implementationConfidence,
    riskScore,
    testConfidence,
    reviewerApproval,
    productionReadiness,
    reasons,
    warnings,
    blockers,
    timestamp: Date.now(),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Verdict serialization for storage
// ─────────────────────────────────────────────────────────────────────────────

export function serializeVerdict(verdict: ProductionVerdict): string {
  return JSON.stringify(verdict)
}

export function deserializeVerdict(raw: string): ProductionVerdict {
  return JSON.parse(raw) as ProductionVerdict
}

// ─────────────────────────────────────────────────────────────────────────────
// Verdict display helpers
// ─────────────────────────────────────────────────────────────────────────────

export function getVerdictEmoji(action: VerdictAction): string {
  switch (action) {
    case 'proceed_to_pr':
      return '✅'
    case 'needs_human_review':
      return '👀'
    case 'blocked':
      return '🚫'
    case 'retry_with_fix':
      return '🔧'
    case 'planning_only':
      return '📋'
  }
}

export function getVerdictLabel(action: VerdictAction): string {
  switch (action) {
    case 'proceed_to_pr':
      return 'Ready for PR'
    case 'needs_human_review':
      return 'Needs Human Review'
    case 'blocked':
      return 'Blocked'
    case 'retry_with_fix':
      return 'Retry With Fix'
    case 'planning_only':
      return 'Planning Only'
  }
}

export function getReadinessColor(score: number): string {
  if (score >= 80) return '#22c55e' // green
  if (score >= 60) return '#eab308' // yellow
  if (score >= 40) return '#f97316' // orange
  return '#ef4444' // red
}
