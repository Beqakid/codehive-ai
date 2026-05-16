/**
 * @module healingPolicy
 * @description Milestone 5 — Self-healing policy enforcement.
 * Determines whether a self-healing attempt should be allowed based on:
 *   - Category of failure
 *   - Number of attempts per category
 *   - Blocked patterns
 *   - Previous outcomes for this fingerprint
 *   - Learned fix availability
 *
 * Extends M4 healingStrategies with policy-level decisions.
 */

import type { FailureFingerprint, FailureCategory } from './failureFingerprint'
import type { MemoryEntry } from './memoryStore'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface HealingPolicyConfig {
  /** Global max healing attempts per run */
  maxAttemptsPerRun: number
  /** Max attempts per error category */
  maxAttemptsPerCategory: Record<string, number>
  /** Blocked categories — never auto-heal */
  blockedCategories: string[]
  /** Blocked file patterns — never modify */
  blockedFilePatterns: string[]
  /** Min confidence to attempt healing */
  minConfidence: number
  /** Use learned fixes from memory */
  useLearnedFixes: boolean
  /** Require post-repair reviewer check */
  requirePostRepairReview: boolean
}

export interface HealingDecision {
  allowed: boolean
  reason: string
  strategy: string
  confidence: number
  useLearnedFix: boolean
  learnedFixContent?: string
  retryAfterFix: boolean
  requiresReview: boolean
}

export interface HealingPolicyState {
  totalAttempts: number
  attemptsByCategory: Record<string, number>
  attemptsByFingerprint: Record<string, number>
  successByFingerprint: Record<string, boolean>
  blockedFingerprints: Set<string>
}

// ─────────────────────────────────────────────────────────────────────────────
// Default config
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_HEALING_POLICY: HealingPolicyConfig = {
  maxAttemptsPerRun: 5,
  maxAttemptsPerCategory: {
    type_error: 3,
    syntax_error: 2,
    import_error: 3,
    lint_error: 2,
    build_error: 2,
    test_failure: 2,
    runtime_error: 1,
    dependency_error: 1,
    config_error: 1,
    unknown: 0,
  },
  blockedCategories: [
    'config_error', // deployment/config changes are dangerous
  ],
  blockedFilePatterns: [
    'auth', 'authentication', 'authorization',
    'payment', 'stripe', 'billing',
    'migration', 'migrate',
    'deploy', 'wrangler', 'cloudflare',
    'package.json', 'package-lock',
    '.env', 'secrets',
  ],
  minConfidence: 0.5,
  useLearnedFixes: true,
  requirePostRepairReview: true,
}

// ─────────────────────────────────────────────────────────────────────────────
// Policy state management
// ─────────────────────────────────────────────────────────────────────────────

export function createPolicyState(): HealingPolicyState {
  return {
    totalAttempts: 0,
    attemptsByCategory: {},
    attemptsByFingerprint: {},
    successByFingerprint: {},
    blockedFingerprints: new Set(),
  }
}

export function recordAttempt(
  state: HealingPolicyState,
  fingerprint: FailureFingerprint,
  success: boolean,
): HealingPolicyState {
  const newState = { ...state }
  newState.totalAttempts++
  newState.attemptsByCategory[fingerprint.category] =
    (newState.attemptsByCategory[fingerprint.category] || 0) + 1
  newState.attemptsByFingerprint[fingerprint.hash] =
    (newState.attemptsByFingerprint[fingerprint.hash] || 0) + 1
  newState.successByFingerprint[fingerprint.hash] = success

  if (!success && (newState.attemptsByFingerprint[fingerprint.hash] || 0) >= 2) {
    newState.blockedFingerprints = new Set(state.blockedFingerprints)
    newState.blockedFingerprints.add(fingerprint.hash)
  }

  return newState
}

// ─────────────────────────────────────────────────────────────────────────────
// Policy evaluation
// ─────────────────────────────────────────────────────────────────────────────

export function evaluateHealingPolicy(
  fingerprint: FailureFingerprint,
  state: HealingPolicyState,
  learnedFixes: MemoryEntry[],
  config: HealingPolicyConfig = DEFAULT_HEALING_POLICY,
): HealingDecision {
  // ── Check global attempt limit ─────────────────────────────────────────
  if (state.totalAttempts >= config.maxAttemptsPerRun) {
    return blocked(`Global attempt limit reached (${state.totalAttempts}/${config.maxAttemptsPerRun})`)
  }

  // ── Check blocked categories ───────────────────────────────────────────
  if (config.blockedCategories.includes(fingerprint.category)) {
    return blocked(`Category "${fingerprint.category}" is blocked by policy`)
  }

  // ── Check category attempt limit ───────────────────────────────────────
  const categoryAttempts = state.attemptsByCategory[fingerprint.category] || 0
  const categoryMax = config.maxAttemptsPerCategory[fingerprint.category] ?? 1
  if (categoryAttempts >= categoryMax) {
    return blocked(`Category "${fingerprint.category}" attempt limit reached (${categoryAttempts}/${categoryMax})`)
  }

  // ── Check blocked fingerprints ─────────────────────────────────────────
  if (state.blockedFingerprints.has(fingerprint.hash)) {
    return blocked(`Fingerprint ${fingerprint.hash} is blocked after repeated failures`)
  }

  // ── Check blocked file patterns ────────────────────────────────────────
  const fileLower = fingerprint.filePattern.toLowerCase()
  for (const pattern of config.blockedFilePatterns) {
    if (fileLower.includes(pattern.toLowerCase())) {
      return blocked(`File matches blocked pattern "${pattern}"`)
    }
  }

  // ── Check severity ─────────────────────────────────────────────────────
  if (fingerprint.severity === 'critical') {
    return blocked('Critical severity errors require human intervention')
  }

  // ── Check for learned fixes ────────────────────────────────────────────
  if (config.useLearnedFixes && learnedFixes.length > 0) {
    const bestFix = learnedFixes[0]
    return {
      allowed: true,
      reason: `Learned fix available with confidence ${bestFix.confidence}`,
      strategy: 'learned_fix',
      confidence: bestFix.confidence,
      useLearnedFix: true,
      learnedFixContent: bestFix.content,
      retryAfterFix: true,
      requiresReview: config.requirePostRepairReview,
    }
  }

  // ── Allow with appropriate strategy ────────────────────────────────────
  const strategy = selectStrategy(fingerprint.category)

  return {
    allowed: true,
    reason: `Auto-heal allowed for "${fingerprint.category}" (attempt ${categoryAttempts + 1}/${categoryMax})`,
    strategy,
    confidence: fingerprint.severity === 'low' ? 0.8 : fingerprint.severity === 'medium' ? 0.6 : 0.4,
    useLearnedFix: false,
    retryAfterFix: true,
    requiresReview: config.requirePostRepairReview,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Strategy selection
// ─────────────────────────────────────────────────────────────────────────────

function selectStrategy(category: FailureCategory): string {
  switch (category) {
    case 'type_error':
      return 'type_mismatch'
    case 'syntax_error':
      return 'syntax_repair'
    case 'import_error':
      return 'import_fix'
    case 'lint_error':
      return 'lint_autofix'
    case 'build_error':
      return 'path_correction'
    case 'test_failure':
      return 'test_expectation_fix'
    case 'dependency_error':
      return 'missing_dependency'
    default:
      return 'unknown'
  }
}

function blocked(reason: string): HealingDecision {
  return {
    allowed: false,
    reason,
    strategy: 'none',
    confidence: 0,
    useLearnedFix: false,
    retryAfterFix: false,
    requiresReview: false,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SUPPORTED vs BLOCKED reference
// ─────────────────────────────────────────────────────────────────────────────

/** Healing categories that are SUPPORTED for auto-repair */
export const SUPPORTED_HEALING: FailureCategory[] = [
  'type_error',
  'syntax_error',
  'import_error',
  'lint_error',
  'build_error',
  'test_failure',
]

/** Operations that are BLOCKED from auto-repair */
export const BLOCKED_OPERATIONS = [
  'auth rewrites',
  'payment changes',
  'database migrations',
  'dependency upgrades (unless approved)',
  'deployment config changes',
  'broad refactors',
] as const
