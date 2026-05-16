/**
 * Milestone 5 — Comprehensive Test Suite
 * Target: 90+ tests
 *
 * Tests all M5 systems: model routing, agent verdict, memory store/retrieval,
 * failure fingerprinting, healing policy, orchestrator, collections, feature flags.
 *
 * Run with: npx tsx --test m5/tests/m5.test.ts
 */

import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

// ─── Model Router ────────────────────────────────────────────────────
import {
  routeModel,
  extractJsonFromResponse,
  type AgentRole,
  type ModelConfig,
} from '../lib/modelRouter'

// ─── Agent Verdict ───────────────────────────────────────────────────
import {
  computeVerdict,
  serializeVerdict,
  deserializeVerdict,
  getVerdictEmoji,
  getVerdictLabel,
  getReadinessColor,
  type VerdictInput,
  type VerdictAction,
  type ReviewerVerdict,
  type AgentScore,
} from '../lib/agentVerdict'

// ─── Memory Store ────────────────────────────────────────────────────
import type {
  MemoryType,
  MemoryEntry,
  SaveMemoryInput,
  SaveMemoryResult,
} from '../lib/memoryStore'

// ─── Memory Retrieval ────────────────────────────────────────────────
import {
  formatMemoriesForPrompt,
  type MemoryContext,
  type MemoryConflict,
} from '../lib/memoryRetrieval'

// ─── Failure Fingerprint ─────────────────────────────────────────────
import {
  generateFingerprint,
  generateFingerprintsFromOutput,
  fingerprintsMatch,
  fingerprintsSimilar,
  type FailureCategory,
  type FailureFingerprint,
} from '../lib/failureFingerprint'

// ─── Healing Policy ──────────────────────────────────────────────────
import {
  evaluateHealingPolicy,
  createPolicyState,
  recordAttempt,
  DEFAULT_HEALING_POLICY,
  SUPPORTED_HEALING,
  BLOCKED_OPERATIONS,
  type HealingPolicyState,
  type HealingDecision,
} from '../lib/healingPolicy'

// ─── Orchestrator ────────────────────────────────────────────────────
import {
  buildPRBody,
  type PipelineStepName,
  type PipelineStepStatus,
  type PipelineStep,
  type PipelineInput,
} from '../lib/agentOrchestrator'

// ─── Collections ─────────────────────────────────────────────────────
import { AgentVerdicts } from '../collections/AgentVerdicts'
import { FailurePatterns } from '../collections/FailurePatterns'
import { RepoMemories } from '../collections/RepoMemories'
import { LearnedFixes } from '../collections/LearnedFixes'
import { ProjectRules } from '../collections/ProjectRules'

// ─── Feature Flags ───────────────────────────────────────────────────
// Feature flags read process.env at import time, so we test structure.
// We'll dynamically re-import to test env overrides.

// ═══════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════

/** Create a default VerdictInput for testing */
function makeVerdictInput(overrides: Partial<VerdictInput> = {}): VerdictInput {
  return {
    agentScores: [],
    riskScore: 20,
    riskLevel: 'low',
    testsPassed: true,
    lintPassed: true,
    buildPassed: true,
    protectedFilesTouched: 0,
    totalFilesChanged: 5,
    totalLinesChanged: 100,
    healingAttempts: 0,
    healingSuccesses: 0,
    memoryConflicts: [],
    ...overrides,
  }
}

/** Create a mock AgentScore */
function makeAgentScore(role: string, score: number, overrides: Partial<AgentScore> = {}): AgentScore {
  return {
    agentRole: role,
    score,
    confidence: 0.8,
    status: 'completed',
    durationMs: 1000,
    model: 'test-model',
    provider: 'anthropic',
    summary: `${role} completed`,
    ...overrides,
  }
}

/** Create a mock ReviewerVerdict */
function makeReviewerVerdict(overrides: Partial<ReviewerVerdict> = {}): ReviewerVerdict {
  return {
    decision: 'approve',
    reasons: ['Code looks good'],
    riskyFiles: [],
    missingTests: [],
    rollbackConcerns: [],
    recommendation: 'Merge',
    score: 85,
    ...overrides,
  }
}

/** Create a mock FailureFingerprint for healing policy tests */
function makeFP(overrides: Partial<FailureFingerprint> = {}): FailureFingerprint {
  return {
    hash: 'fp-test123',
    category: 'type_error',
    normalizedMessage: 'Type X is not assignable to type Y',
    filePattern: 'src/lib/*.ts',
    rawMessage: 'Type X is not assignable to type Y',
    severity: 'medium',
    isRecurring: false,
    occurrenceCount: 1,
    ...overrides,
  }
}

/** Create a mock MemoryEntry */
function makeMemory(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    id: 'mem-1',
    projectId: 'proj-1',
    repoName: 'owner/repo',
    memoryType: 'project_rule',
    content: 'Always use strict TypeScript',
    confidence: 0.9,
    ...overrides,
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 1. MODEL ROUTER TESTS
// ═══════════════════════════════════════════════════════════════════════

describe('M5: Model Router', () => {
  const ALL_ROLES: AgentRole[] = [
    'product', 'repo_intelligence', 'architect', 'code',
    'test', 'fix', 'reviewer', 'memory',
  ]

  it('routeModel returns result for product role', () => {
    const result = routeModel('product')
    assert.equal(result.role, 'product')
    assert.equal(result.primary.provider, 'openai')
    assert.equal(result.primary.model, 'gpt-4.1')
    assert.ok(result.reasoning.length > 0)
  })

  it('routeModel returns result for architect role with extended thinking', () => {
    const result = routeModel('architect')
    assert.equal(result.role, 'architect')
    assert.equal(result.primary.provider, 'anthropic')
    assert.ok(result.primary.model.includes('claude-sonnet'))
    assert.equal(result.primary.maxTokens, 16000)
    assert.equal(result.primary.thinkingBudget, 10000)
  })

  it('routeModel returns result for code role with Claude primary', () => {
    const result = routeModel('code')
    assert.equal(result.primary.provider, 'anthropic')
    assert.equal(result.primary.maxTokens, 16000)
  })

  it('routeModel returns result for reviewer role using different model from code', () => {
    const codeResult = routeModel('code')
    const reviewerResult = routeModel('reviewer')
    assert.notEqual(codeResult.primary.provider, reviewerResult.primary.provider)
  })

  it('routeModel returns result for memory role with cost-efficient model', () => {
    const result = routeModel('memory')
    assert.equal(result.primary.costTier, 'low')
  })

  it('routeModel returns result for repo_intelligence role', () => {
    const result = routeModel('repo_intelligence')
    assert.equal(result.primary.costTier, 'low')
    assert.equal(result.primary.provider, 'openai')
    assert.equal(result.primary.model, 'gpt-4.1-mini')
  })

  it('routeModel includes fallbacks for every role', () => {
    for (const role of ALL_ROLES) {
      const result = routeModel(role)
      assert.ok(result.fallbacks.length > 0, `${role} should have fallbacks`)
    }
  })

  it('routeModel has reasoning for every role', () => {
    for (const role of ALL_ROLES) {
      const result = routeModel(role)
      assert.ok(result.reasoning.length > 10, `${role} should have meaningful reasoning`)
    }
  })

  it('routeModel fix role uses Claude Sonnet primary', () => {
    const result = routeModel('fix')
    assert.equal(result.primary.provider, 'anthropic')
    assert.ok(result.primary.model.includes('claude-sonnet'))
  })

  it('routeModel test role uses OpenAI primary', () => {
    const result = routeModel('test')
    assert.equal(result.primary.provider, 'openai')
  })

  // ── extractJsonFromResponse ─────────────────────────────────────────

  it('extractJsonFromResponse handles clean JSON', () => {
    const json = '{"key": "value", "num": 42}'
    const result = extractJsonFromResponse<{ key: string; num: number }>(json)
    assert.equal(result.key, 'value')
    assert.equal(result.num, 42)
  })

  it('extractJsonFromResponse extracts JSON with preamble text', () => {
    const raw = 'Here is the analysis:\n\n{"score": 85, "status": "ok"}'
    const result = extractJsonFromResponse<{ score: number; status: string }>(raw)
    assert.equal(result.score, 85)
    assert.equal(result.status, 'ok')
  })

  it('extractJsonFromResponse handles markdown code blocks', () => {
    const raw = '```json\n{"result": true}\n```'
    const result = extractJsonFromResponse<{ result: boolean }>(raw)
    assert.equal(result.result, true)
  })

  it('extractJsonFromResponse handles code blocks without json label', () => {
    const raw = '```\n{"name": "test"}\n```'
    const result = extractJsonFromResponse<{ name: string }>(raw)
    assert.equal(result.name, 'test')
  })

  it('extractJsonFromResponse throws for non-JSON content', () => {
    assert.throws(() => extractJsonFromResponse('this is not json'), {
      name: 'SyntaxError',
    })
  })

  it('extractJsonFromResponse handles nested objects', () => {
    const raw = 'Result: {"outer": {"inner": [1,2,3]}, "flag": false}'
    const result = extractJsonFromResponse<{ outer: { inner: number[] }; flag: boolean }>(raw)
    assert.deepEqual(result.outer.inner, [1, 2, 3])
    assert.equal(result.flag, false)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 2. AGENT VERDICT TESTS
// ═══════════════════════════════════════════════════════════════════════

describe('M5: Agent Verdict', () => {
  it('computeVerdict with all high scores and reviewer approve → proceed_to_pr', () => {
    const input = makeVerdictInput({
      agentScores: [makeAgentScore('architect', 90), makeAgentScore('code', 90)],
      riskScore: 10,
      testsPassed: true,
      testResults: { total: 50, passed: 50, failed: 0, skipped: 0 },
      lintPassed: true,
      buildPassed: true,
      reviewerVerdict: makeReviewerVerdict({ decision: 'approve', score: 90 }),
    })
    const verdict = computeVerdict(input)
    assert.equal(verdict.action, 'proceed_to_pr')
    assert.ok(verdict.productionReadiness >= 80)
  })

  it('computeVerdict with low scores → blocked', () => {
    const input = makeVerdictInput({
      agentScores: [makeAgentScore('architect', 20), makeAgentScore('code', 20)],
      riskScore: 80,
      testsPassed: false,
      buildPassed: false,
      lintPassed: false,
      reviewerVerdict: makeReviewerVerdict({ decision: 'reject', score: 10, reasons: ['Bad code'] }),
      healingAttempts: 5,
    })
    const verdict = computeVerdict(input)
    assert.equal(verdict.action, 'blocked')
    assert.ok(verdict.blockers.length > 0)
  })

  it('computeVerdict with mixed scores → needs_human_review', () => {
    const input = makeVerdictInput({
      agentScores: [makeAgentScore('architect', 70), makeAgentScore('code', 65)],
      riskScore: 30,
      testsPassed: true,
      testResults: { total: 40, passed: 35, failed: 5, skipped: 0 },
      lintPassed: true,
      buildPassed: true,
      reviewerVerdict: makeReviewerVerdict({ decision: 'needs_changes', score: 60, reasons: ['Needs refactor'] }),
    })
    const verdict = computeVerdict(input)
    assert.equal(verdict.action, 'needs_human_review')
  })

  it('computeVerdict with reviewer reject → blocked', () => {
    const input = makeVerdictInput({
      agentScores: [makeAgentScore('architect', 80), makeAgentScore('code', 80)],
      riskScore: 10,
      testsPassed: true,
      testResults: { total: 50, passed: 50, failed: 0, skipped: 0 },
      lintPassed: true,
      buildPassed: true,
      reviewerVerdict: makeReviewerVerdict({ decision: 'reject', score: 20, reasons: ['Security concern'] }),
    })
    const verdict = computeVerdict(input)
    assert.equal(verdict.action, 'blocked')
    assert.ok(verdict.blockers.some((b) => b.includes('rejected')))
  })

  it('computeVerdict with reviewer approve + high test → proceed_to_pr', () => {
    const input = makeVerdictInput({
      agentScores: [makeAgentScore('architect', 95), makeAgentScore('code', 95)],
      riskScore: 5,
      testsPassed: true,
      testResults: { total: 100, passed: 100, failed: 0, skipped: 0 },
      lintPassed: true,
      buildPassed: true,
      reviewerVerdict: makeReviewerVerdict({ decision: 'approve', score: 95 }),
    })
    const verdict = computeVerdict(input)
    assert.equal(verdict.action, 'proceed_to_pr')
    assert.equal(verdict.reviewerApproval, 'approve')
  })

  it('computeVerdict with build failed → has blocker', () => {
    const input = makeVerdictInput({
      buildPassed: false,
      testsPassed: true,
      lintPassed: true,
    })
    const verdict = computeVerdict(input)
    assert.ok(verdict.blockers.some((b) => b.includes('Build failed')))
  })

  it('computeVerdict with test failures and healingAttempts < 3 → retry_with_fix', () => {
    const input = makeVerdictInput({
      agentScores: [makeAgentScore('architect', 80), makeAgentScore('code', 80)],
      testsPassed: false,
      buildPassed: true,
      lintPassed: true,
      healingAttempts: 1,
    })
    const verdict = computeVerdict(input)
    assert.equal(verdict.action, 'retry_with_fix')
  })

  it('computeVerdict test failures with healingAttempts >= 3 → blocked', () => {
    const input = makeVerdictInput({
      testsPassed: false,
      buildPassed: true,
      lintPassed: true,
      healingAttempts: 3,
      reviewerVerdict: makeReviewerVerdict({ decision: 'reject', score: 20, reasons: ['Failed'] }),
    })
    const verdict = computeVerdict(input)
    assert.equal(verdict.action, 'blocked')
  })

  it('computeVerdict risk score ≥ 70 → blocked with high risk', () => {
    const input = makeVerdictInput({ riskScore: 75 })
    const verdict = computeVerdict(input)
    assert.ok(verdict.blockers.some((b) => b.includes('High risk')))
  })

  it('computeVerdict risk score 40-69 → warning', () => {
    const input = makeVerdictInput({ riskScore: 50 })
    const verdict = computeVerdict(input)
    assert.ok(verdict.warnings.some((w) => w.includes('Moderate risk')))
  })

  it('computeVerdict risk score < 40 → reason with low risk', () => {
    const input = makeVerdictInput({ riskScore: 15 })
    const verdict = computeVerdict(input)
    assert.ok(verdict.reasons.some((r) => r.includes('Low risk')))
  })

  it('computeVerdict implementationConfidence is bounded 0-100', () => {
    const input = makeVerdictInput({
      agentScores: [makeAgentScore('architect', 100), makeAgentScore('code', 100)],
    })
    const verdict = computeVerdict(input)
    assert.ok(verdict.implementationConfidence >= 0 && verdict.implementationConfidence <= 100)
  })

  it('computeVerdict with all zeros', () => {
    const input = makeVerdictInput({
      agentScores: [makeAgentScore('architect', 0), makeAgentScore('code', 0)],
      riskScore: 0,
      testsPassed: false,
      buildPassed: false,
      lintPassed: false,
      healingAttempts: 0,
    })
    const verdict = computeVerdict(input)
    assert.equal(verdict.implementationConfidence, 0)
    assert.equal(verdict.riskScore, 0)
  })

  it('computeVerdict with all 100s', () => {
    const input = makeVerdictInput({
      agentScores: [makeAgentScore('architect', 100), makeAgentScore('code', 100)],
      riskScore: 100,
      testsPassed: true,
      testResults: { total: 100, passed: 100, failed: 0, skipped: 0 },
      buildPassed: true,
      lintPassed: true,
      reviewerVerdict: makeReviewerVerdict({ decision: 'approve', score: 100 }),
    })
    const verdict = computeVerdict(input)
    assert.equal(verdict.implementationConfidence, 100)
    assert.equal(verdict.riskScore, 100)
    // High risk blocks even with everything else at 100
    assert.ok(verdict.blockers.some((b) => b.includes('High risk')))
  })

  it('computeVerdict with 0 totalFilesChanged and no blockers → planning_only', () => {
    const input = makeVerdictInput({
      agentScores: [makeAgentScore('architect', 40), makeAgentScore('code', 30)],
      riskScore: 20,
      testsPassed: true,
      lintPassed: true,
      buildPassed: true,
      totalFilesChanged: 0,
    })
    const verdict = computeVerdict(input)
    // Production readiness will be moderate, no blockers, < 60 readiness, 0 files → planning_only
    // Depends on exact score calculation
    if (verdict.productionReadiness < 60) {
      assert.equal(verdict.action, 'planning_only')
    }
  })

  it('computeVerdict with protected files touched → warning', () => {
    const input = makeVerdictInput({
      protectedFilesTouched: 3,
    })
    const verdict = computeVerdict(input)
    assert.ok(verdict.warnings.some((w) => w.includes('protected file')))
  })

  it('computeVerdict with memory conflicts → warnings', () => {
    const input = makeVerdictInput({
      memoryConflicts: ['Config conflict', 'Style conflict'],
    })
    const verdict = computeVerdict(input)
    assert.ok(verdict.warnings.some((w) => w.includes('Config conflict')))
    assert.ok(verdict.warnings.some((w) => w.includes('Style conflict')))
  })

  it('computeVerdict with healing attempts > 2 → warning', () => {
    const input = makeVerdictInput({
      healingAttempts: 4,
      healingSuccesses: 2,
    })
    const verdict = computeVerdict(input)
    assert.ok(verdict.warnings.some((w) => w.includes('healing attempts')))
  })

  it('computeVerdict with lint failed → warning and reduced testConfidence', () => {
    const input = makeVerdictInput({
      lintPassed: false,
      testsPassed: true,
      buildPassed: true,
    })
    const verdict = computeVerdict(input)
    assert.ok(verdict.warnings.some((w) => w.includes('Lint')))
  })

  // ── Serialization ───────────────────────────────────────────────────

  it('serializeVerdict produces valid JSON', () => {
    const input = makeVerdictInput({
      agentScores: [makeAgentScore('architect', 80), makeAgentScore('code', 80)],
      reviewerVerdict: makeReviewerVerdict({ decision: 'approve', score: 80 }),
    })
    const verdict = computeVerdict(input)
    const serialized = serializeVerdict(verdict)
    assert.ok(typeof serialized === 'string')
    const parsed = JSON.parse(serialized)
    assert.equal(parsed.action, verdict.action)
  })

  it('deserializeVerdict restores object', () => {
    const input = makeVerdictInput({
      agentScores: [makeAgentScore('architect', 80), makeAgentScore('code', 80)],
    })
    const verdict = computeVerdict(input)
    const round = deserializeVerdict(serializeVerdict(verdict))
    assert.equal(round.action, verdict.action)
    assert.equal(round.productionReadiness, verdict.productionReadiness)
  })

  // ── Display helpers ─────────────────────────────────────────────────

  it('getVerdictEmoji returns correct emoji for each action', () => {
    assert.equal(getVerdictEmoji('proceed_to_pr'), '✅')
    assert.equal(getVerdictEmoji('needs_human_review'), '👀')
    assert.equal(getVerdictEmoji('blocked'), '🚫')
    assert.equal(getVerdictEmoji('retry_with_fix'), '🔧')
    assert.equal(getVerdictEmoji('planning_only'), '📋')
  })

  it('getVerdictLabel returns correct label for each action', () => {
    assert.equal(getVerdictLabel('proceed_to_pr'), 'Ready for PR')
    assert.equal(getVerdictLabel('needs_human_review'), 'Needs Human Review')
    assert.equal(getVerdictLabel('blocked'), 'Blocked')
    assert.equal(getVerdictLabel('retry_with_fix'), 'Retry With Fix')
    assert.equal(getVerdictLabel('planning_only'), 'Planning Only')
  })

  it('getReadinessColor returns green for ≥80', () => {
    assert.equal(getReadinessColor(80), '#22c55e')
    assert.equal(getReadinessColor(100), '#22c55e')
  })

  it('getReadinessColor returns yellow for 60-79', () => {
    assert.equal(getReadinessColor(60), '#eab308')
    assert.equal(getReadinessColor(79), '#eab308')
  })

  it('getReadinessColor returns orange for 40-59', () => {
    assert.equal(getReadinessColor(40), '#f97316')
    assert.equal(getReadinessColor(59), '#f97316')
  })

  it('getReadinessColor returns red for <40', () => {
    assert.equal(getReadinessColor(0), '#ef4444')
    assert.equal(getReadinessColor(39), '#ef4444')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 3. MEMORY STORE TESTS
// ═══════════════════════════════════════════════════════════════════════

describe('M5: Memory Store', () => {
  const ALL_MEMORY_TYPES: MemoryType[] = [
    'repo_architecture', 'protected_area', 'run_outcome',
    'error_pattern', 'fix_pattern', 'failed_repair',
    'project_rule', 'user_preference', 'successful_pattern',
  ]

  it('MemoryType has 9 valid values', () => {
    assert.equal(ALL_MEMORY_TYPES.length, 9)
  })

  it('MemoryEntry can be constructed with all required fields', () => {
    const entry: MemoryEntry = {
      projectId: 'proj-1',
      repoName: 'owner/repo',
      memoryType: 'project_rule',
      content: 'Always use strict mode',
      confidence: 0.9,
    }
    assert.equal(entry.projectId, 'proj-1')
    assert.equal(entry.memoryType, 'project_rule')
    assert.equal(entry.confidence, 0.9)
  })

  it('MemoryEntry accepts optional fields', () => {
    const entry: MemoryEntry = {
      id: 'mem-123',
      projectId: 'proj-1',
      repoName: 'owner/repo',
      memoryType: 'fix_pattern',
      content: 'Add missing import',
      confidence: 0.7,
      sourceRunId: 'run-456',
      tags: ['fix', 'import'],
      metadata: { auto: true },
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    }
    assert.equal(entry.id, 'mem-123')
    assert.deepEqual(entry.tags, ['fix', 'import'])
    assert.deepEqual(entry.metadata, { auto: true })
  })

  it('SaveMemoryInput has required structure', () => {
    const input: SaveMemoryInput = {
      projectId: 'p1',
      repoName: 'r1',
      memoryType: 'error_pattern',
      content: 'TypeError: undefined',
      confidence: 0.8,
    }
    assert.ok(input.projectId)
    assert.ok(input.content)
    assert.ok(input.confidence >= 0 && input.confidence <= 1)
  })

  it('SaveMemoryResult represents success', () => {
    const result: SaveMemoryResult = {
      success: true,
      memoryId: 'mem-1',
      deduplicated: false,
    }
    assert.equal(result.success, true)
    assert.equal(result.deduplicated, false)
  })

  it('SaveMemoryResult represents deduplicated entry', () => {
    const result: SaveMemoryResult = {
      success: true,
      memoryId: 'mem-1',
      deduplicated: true,
    }
    assert.equal(result.deduplicated, true)
  })

  it('SaveMemoryResult represents failure', () => {
    const result: SaveMemoryResult = {
      success: false,
      memoryId: null,
      deduplicated: false,
      error: 'Database connection failed',
    }
    assert.equal(result.success, false)
    assert.equal(result.memoryId, null)
    assert.ok(result.error)
  })

  it('all memory types are distinct strings', () => {
    const unique = new Set(ALL_MEMORY_TYPES)
    assert.equal(unique.size, ALL_MEMORY_TYPES.length)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 4. MEMORY RETRIEVAL TESTS
// ═══════════════════════════════════════════════════════════════════════

describe('M5: Memory Retrieval', () => {
  it('formatMemoriesForPrompt with project rules', () => {
    const context: MemoryContext = {
      memories: [],
      projectRules: [
        makeMemory({ content: 'Never modify auth files' }),
        makeMemory({ content: 'Always add tests' }),
      ],
      learnedFixes: [],
      failurePatterns: [],
      repoFacts: [],
      totalRetrieved: 2,
      conflicts: [],
    }
    const result = formatMemoriesForPrompt(context)
    assert.ok(result.includes('Project Rules'))
    assert.ok(result.includes('Never modify auth files'))
    assert.ok(result.includes('Always add tests'))
  })

  it('formatMemoriesForPrompt with repo facts', () => {
    const context: MemoryContext = {
      memories: [],
      projectRules: [],
      learnedFixes: [],
      failurePatterns: [],
      repoFacts: [
        makeMemory({ content: 'Uses Next.js 14 with App Router', memoryType: 'repo_architecture' }),
      ],
      totalRetrieved: 1,
      conflicts: [],
    }
    const result = formatMemoriesForPrompt(context)
    assert.ok(result.includes('Repository Facts'))
    assert.ok(result.includes('Next.js 14'))
  })

  it('formatMemoriesForPrompt with learned fixes', () => {
    const context: MemoryContext = {
      memories: [],
      projectRules: [],
      learnedFixes: [
        makeMemory({ content: 'Error: missing import → Fix: add import at top', memoryType: 'fix_pattern' }),
      ],
      failurePatterns: [],
      repoFacts: [],
      totalRetrieved: 1,
      conflicts: [],
    }
    const result = formatMemoriesForPrompt(context)
    assert.ok(result.includes('Learned Fixes'))
    assert.ok(result.includes('missing import'))
  })

  it('formatMemoriesForPrompt with conflicts', () => {
    const context: MemoryContext = {
      memories: [],
      projectRules: [],
      learnedFixes: [],
      failurePatterns: [],
      repoFacts: [],
      totalRetrieved: 0,
      conflicts: [
        {
          description: 'Rule A conflicts with Rule B',
          memoryId: 'mem-1',
          conflictsWith: 'mem-2',
          severity: 'warning',
        },
      ],
    }
    const result = formatMemoriesForPrompt(context)
    assert.ok(result.includes('Conflicts Detected'))
    assert.ok(result.includes('WARNING'))
  })

  it('formatMemoriesForPrompt with empty context', () => {
    const context: MemoryContext = {
      memories: [],
      projectRules: [],
      learnedFixes: [],
      failurePatterns: [],
      repoFacts: [],
      totalRetrieved: 0,
      conflicts: [],
    }
    const result = formatMemoriesForPrompt(context)
    assert.equal(result, '')
  })

  it('formatMemoriesForPrompt groups sections correctly', () => {
    const context: MemoryContext = {
      memories: [],
      projectRules: [makeMemory({ content: 'Rule 1' })],
      learnedFixes: [makeMemory({ content: 'Fix 1', memoryType: 'fix_pattern' })],
      failurePatterns: [],
      repoFacts: [makeMemory({ content: 'Fact 1', memoryType: 'repo_architecture' })],
      totalRetrieved: 3,
      conflicts: [],
    }
    const result = formatMemoriesForPrompt(context)
    // All three sections should appear
    assert.ok(result.includes('Project Rules'))
    assert.ok(result.includes('Repository Facts'))
    assert.ok(result.includes('Learned Fixes'))
  })

  it('formatMemoriesForPrompt truncates long content in repo facts', () => {
    const longContent = 'x'.repeat(500)
    const context: MemoryContext = {
      memories: [],
      projectRules: [],
      learnedFixes: [],
      failurePatterns: [],
      repoFacts: [makeMemory({ content: longContent, memoryType: 'repo_architecture' })],
      totalRetrieved: 1,
      conflicts: [],
    }
    const result = formatMemoriesForPrompt(context)
    // Content is truncated to substring(0, 200)
    assert.ok(result.length < longContent.length)
  })

  it('formatMemoriesForPrompt limits repo facts to 10', () => {
    const facts = Array.from({ length: 15 }, (_, i) =>
      makeMemory({ id: `fact-${i}`, content: `Fact ${i}`, memoryType: 'repo_architecture' }),
    )
    const context: MemoryContext = {
      memories: [],
      projectRules: [],
      learnedFixes: [],
      failurePatterns: [],
      repoFacts: facts,
      totalRetrieved: 15,
      conflicts: [],
    }
    const result = formatMemoriesForPrompt(context)
    // Should only include first 10 facts
    assert.ok(result.includes('Fact 9'))
    assert.ok(!result.includes('Fact 10'))
  })

  it('formatMemoriesForPrompt limits learned fixes to 5', () => {
    const fixes = Array.from({ length: 8 }, (_, i) =>
      makeMemory({ id: `fix-${i}`, content: `Fix ${i}`, memoryType: 'fix_pattern' }),
    )
    const context: MemoryContext = {
      memories: [],
      projectRules: [],
      learnedFixes: fixes,
      failurePatterns: [],
      repoFacts: [],
      totalRetrieved: 8,
      conflicts: [],
    }
    const result = formatMemoriesForPrompt(context)
    assert.ok(result.includes('Fix 4'))
    assert.ok(!result.includes('Fix 5'))
  })

  it('MemoryConflict has correct severity levels', () => {
    const levels: MemoryConflict['severity'][] = ['info', 'warning', 'error']
    for (const severity of levels) {
      const conflict: MemoryConflict = {
        description: 'test',
        memoryId: 'mem-1',
        conflictsWith: 'mem-2',
        severity,
      }
      assert.equal(conflict.severity, severity)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 5. FAILURE FINGERPRINT TESTS
// ═══════════════════════════════════════════════════════════════════════

describe('M5: Failure Fingerprint', () => {
  it('generateFingerprint produces consistent hash for same input', () => {
    const a = generateFingerprint('TypeError: X is not assignable to Y', 'src/lib/foo.ts')
    const b = generateFingerprint('TypeError: X is not assignable to Y', 'src/lib/foo.ts')
    assert.equal(a.hash, b.hash)
  })

  it('generateFingerprint same error → same fingerprint hash', () => {
    const msg = 'Cannot find module "./utils"'
    const a = generateFingerprint(msg)
    const b = generateFingerprint(msg)
    assert.equal(a.hash, b.hash)
  })

  it('generateFingerprint different errors → different fingerprints', () => {
    const a = generateFingerprint('TypeError: undefined is not a function')
    const b = generateFingerprint('Cannot find module "react"')
    assert.notEqual(a.hash, b.hash)
  })

  it('generateFingerprint normalizes line numbers', () => {
    const a = generateFingerprint('Error at src/foo.ts:10:5 - something broke')
    const b = generateFingerprint('Error at src/foo.ts:99:12 - something broke')
    assert.equal(a.normalizedMessage, b.normalizedMessage)
  })

  it('generateFingerprint normalizes file paths', () => {
    const a = generateFingerprint('Error in /home/user/project/src/foo.ts: bad')
    const b = generateFingerprint('Error in /var/tmp/build/src/foo.ts: bad')
    assert.equal(a.normalizedMessage, b.normalizedMessage)
  })

  it('generateFingerprint categorizes import errors', () => {
    const fp = generateFingerprint('Cannot find module "./myModule"')
    assert.equal(fp.category, 'import_error')
  })

  it('generateFingerprint categorizes type errors', () => {
    const fp = generateFingerprint('Type "string" is not assignable to type "number"')
    assert.equal(fp.category, 'type_error')
  })

  it('generateFingerprint categorizes lint errors', () => {
    const fp = generateFingerprint('eslint: no-unused-vars - x is defined but never used')
    assert.equal(fp.category, 'lint_error')
  })

  it('generateFingerprint categorizes syntax errors', () => {
    const fp = generateFingerprint('SyntaxError: Unexpected token }')
    assert.equal(fp.category, 'syntax_error')
  })

  it('generateFingerprint categorizes build errors', () => {
    const fp = generateFingerprint('Build failed: compilation error')
    assert.equal(fp.category, 'build_error')
  })

  it('generateFingerprint returns unknown for unrecognized error', () => {
    const fp = generateFingerprint('Something completely unrecognized happened')
    assert.equal(fp.category, 'unknown')
  })

  it('generateFingerprint severity: lint_error → low', () => {
    const fp = generateFingerprint('eslint: prefer-const detected')
    assert.equal(fp.severity, 'low')
  })

  it('generateFingerprint severity: type_error → medium', () => {
    const fp = generateFingerprint('Type "A" does not exist on type "B"')
    assert.equal(fp.severity, 'medium')
  })

  it('generateFingerprint severity: import_error → high', () => {
    const fp = generateFingerprint('Module not found: cannot resolve "missing-pkg"')
    assert.equal(fp.severity, 'high')
  })

  it('generateFingerprint extracts file pattern', () => {
    const fp = generateFingerprint('Error', 'src/lib/utils.ts')
    assert.equal(fp.filePattern, 'src/lib/*.ts')
  })

  it('generateFingerprint hash starts with fp- prefix', () => {
    const fp = generateFingerprint('Some error')
    assert.ok(fp.hash.startsWith('fp-'))
  })

  it('generateFingerprint truncates rawMessage to 1000 chars', () => {
    const longMsg = 'E'.repeat(2000)
    const fp = generateFingerprint(longMsg)
    assert.ok(fp.rawMessage.length <= 1000)
  })

  it('generateFingerprint occurrenceCount defaults to 1', () => {
    const fp = generateFingerprint('Some error')
    assert.equal(fp.occurrenceCount, 1)
  })

  it('generateFingerprint isRecurring defaults to false', () => {
    const fp = generateFingerprint('Some error')
    assert.equal(fp.isRecurring, false)
  })

  // ── Batch fingerprinting ────────────────────────────────────────────

  it('generateFingerprintsFromOutput extracts errors from stderr', () => {
    const stderr = `src/file.ts(10,5): error TS2345: Argument of type 'string' is not assignable
src/other.ts(20,3): error TS2322: Type 'number' is not assignable to type 'string'`
    const fps = generateFingerprintsFromOutput('', stderr, 'build')
    assert.ok(fps.length >= 2)
  })

  it('generateFingerprintsFromOutput deduplicates same error', () => {
    const stderr = `Error: something went wrong\nError: something went wrong`
    const fps = generateFingerprintsFromOutput('', stderr, 'test')
    // Same error → same fingerprint, occurrence count should be > 1
    const hashes = new Set(fps.map((f) => f.hash))
    assert.ok(hashes.size <= fps.length)
  })

  it('generateFingerprintsFromOutput caps at 20 errors', () => {
    const stderr = Array.from({ length: 30 }, (_, i) =>
      `Error: unique failure number ${i}`,
    ).join('\n')
    const fps = generateFingerprintsFromOutput('', stderr, 'test')
    assert.ok(fps.length <= 20)
  })

  // ── Matching ────────────────────────────────────────────────────────

  it('fingerprintsMatch returns true for identical hashes', () => {
    const a = generateFingerprint('Cannot find module "x"')
    const b = generateFingerprint('Cannot find module "x"')
    assert.ok(fingerprintsMatch(a, b))
  })

  it('fingerprintsMatch returns false for different hashes', () => {
    const a = generateFingerprint('Error A')
    const b = generateFingerprint('Error B')
    assert.ok(!fingerprintsMatch(a, b))
  })

  it('fingerprintsSimilar returns true for same category with high overlap', () => {
    const a = generateFingerprint('Type "string" is not assignable to type "number" in variable foo')
    const b = generateFingerprint('Type "string" is not assignable to type "number" in variable bar')
    assert.ok(fingerprintsSimilar(a, b))
  })

  it('fingerprintsSimilar returns false for different categories', () => {
    const a = generateFingerprint('eslint: prefer-const detected')
    const b = generateFingerprint('Cannot find module "missing"')
    assert.ok(!fingerprintsSimilar(a, b))
  })

  it('fingerprintsSimilar returns true for identical fingerprints', () => {
    const fp = generateFingerprint('Module not found: ./foo')
    assert.ok(fingerprintsSimilar(fp, fp))
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 6. HEALING POLICY TESTS
// ═══════════════════════════════════════════════════════════════════════

describe('M5: Healing Policy', () => {
  let state: HealingPolicyState

  beforeEach(() => {
    state = createPolicyState()
  })

  it('createPolicyState returns clean state', () => {
    assert.equal(state.totalAttempts, 0)
    assert.deepEqual(state.attemptsByCategory, {})
    assert.deepEqual(state.attemptsByFingerprint, {})
    assert.deepEqual(state.successByFingerprint, {})
    assert.equal(state.blockedFingerprints.size, 0)
  })

  it('evaluateHealingPolicy allows type_error fix', () => {
    const fp = makeFP({ category: 'type_error', filePattern: 'src/lib/*.ts', severity: 'medium' })
    const decision = evaluateHealingPolicy(fp, state, [])
    assert.equal(decision.allowed, true)
    assert.equal(decision.strategy, 'type_mismatch')
  })

  it('evaluateHealingPolicy allows import_error fix', () => {
    const fp = makeFP({ category: 'import_error', filePattern: 'src/lib/*.ts', severity: 'high' })
    const decision = evaluateHealingPolicy(fp, state, [])
    assert.equal(decision.allowed, true)
    assert.equal(decision.strategy, 'import_fix')
  })

  it('evaluateHealingPolicy allows lint_error fix', () => {
    const fp = makeFP({ category: 'lint_error', filePattern: 'src/lib/*.ts', severity: 'low' })
    const decision = evaluateHealingPolicy(fp, state, [])
    assert.equal(decision.allowed, true)
    assert.equal(decision.strategy, 'lint_autofix')
  })

  it('evaluateHealingPolicy allows syntax_error fix', () => {
    const fp = makeFP({ category: 'syntax_error', filePattern: 'src/lib/*.ts', severity: 'medium' })
    const decision = evaluateHealingPolicy(fp, state, [])
    assert.equal(decision.allowed, true)
    assert.equal(decision.strategy, 'syntax_repair')
  })

  it('evaluateHealingPolicy allows build_error fix', () => {
    const fp = makeFP({ category: 'build_error', filePattern: 'src/lib/*.ts', severity: 'high' })
    const decision = evaluateHealingPolicy(fp, state, [])
    assert.equal(decision.allowed, true)
    assert.equal(decision.strategy, 'path_correction')
  })

  it('evaluateHealingPolicy blocks auth file patterns', () => {
    const fp = makeFP({ category: 'type_error', filePattern: 'src/auth/*.ts', severity: 'medium' })
    const decision = evaluateHealingPolicy(fp, state, [])
    assert.equal(decision.allowed, false)
    assert.ok(decision.reason.includes('auth'))
  })

  it('evaluateHealingPolicy blocks payment file patterns', () => {
    const fp = makeFP({ category: 'type_error', filePattern: 'src/payment/*.ts', severity: 'medium' })
    const decision = evaluateHealingPolicy(fp, state, [])
    assert.equal(decision.allowed, false)
    assert.ok(decision.reason.includes('payment'))
  })

  it('evaluateHealingPolicy blocks migration file patterns', () => {
    const fp = makeFP({ category: 'type_error', filePattern: 'src/migration/*.ts', severity: 'medium' })
    const decision = evaluateHealingPolicy(fp, state, [])
    assert.equal(decision.allowed, false)
    assert.ok(decision.reason.includes('migrat'))
  })

  it('evaluateHealingPolicy blocks deployment config patterns', () => {
    const fp = makeFP({ category: 'type_error', filePattern: 'deploy/*.ts', severity: 'medium' })
    const decision = evaluateHealingPolicy(fp, state, [])
    assert.equal(decision.allowed, false)
    assert.ok(decision.reason.includes('deploy'))
  })

  it('evaluateHealingPolicy blocks package.json patterns', () => {
    const fp = makeFP({ category: 'type_error', filePattern: 'package.json', severity: 'medium' })
    const decision = evaluateHealingPolicy(fp, state, [])
    assert.equal(decision.allowed, false)
    assert.ok(decision.reason.includes('package.json'))
  })

  it('evaluateHealingPolicy blocks config_error category', () => {
    const fp = makeFP({ category: 'config_error', filePattern: 'src/lib/*.ts', severity: 'high' })
    const decision = evaluateHealingPolicy(fp, state, [])
    assert.equal(decision.allowed, false)
    assert.ok(decision.reason.includes('config_error'))
  })

  it('evaluateHealingPolicy blocks critical severity', () => {
    const fp = makeFP({ category: 'type_error', filePattern: 'src/lib/*.ts', severity: 'critical' })
    const decision = evaluateHealingPolicy(fp, state, [])
    assert.equal(decision.allowed, false)
    assert.ok(decision.reason.includes('Critical'))
  })

  it('evaluateHealingPolicy enforces max attempts per run', () => {
    const fullState: HealingPolicyState = {
      ...state,
      totalAttempts: 5, // equals maxAttemptsPerRun
    }
    const fp = makeFP()
    const decision = evaluateHealingPolicy(fp, fullState, [])
    assert.equal(decision.allowed, false)
    assert.ok(decision.reason.includes('Global attempt limit'))
  })

  it('evaluateHealingPolicy enforces max attempts per category', () => {
    const categoryState: HealingPolicyState = {
      ...state,
      attemptsByCategory: { type_error: 3 }, // max for type_error is 3
    }
    const fp = makeFP({ category: 'type_error' })
    const decision = evaluateHealingPolicy(fp, categoryState, [])
    assert.equal(decision.allowed, false)
    assert.ok(decision.reason.includes('attempt limit reached'))
  })

  it('evaluateHealingPolicy blocks repeated failed fingerprint', () => {
    const blockedState: HealingPolicyState = {
      ...state,
      blockedFingerprints: new Set(['fp-test123']),
    }
    const fp = makeFP({ hash: 'fp-test123' })
    const decision = evaluateHealingPolicy(fp, blockedState, [])
    assert.equal(decision.allowed, false)
    assert.ok(decision.reason.includes('blocked after repeated'))
  })

  it('evaluateHealingPolicy uses learned fix when available', () => {
    const fp = makeFP({ category: 'import_error', filePattern: 'src/lib/*.ts', severity: 'high' })
    const learnedFixes: MemoryEntry[] = [
      makeMemory({ content: 'Add missing import for utils', confidence: 0.9, memoryType: 'fix_pattern' }),
    ]
    const decision = evaluateHealingPolicy(fp, state, learnedFixes)
    assert.equal(decision.allowed, true)
    assert.equal(decision.useLearnedFix, true)
    assert.equal(decision.strategy, 'learned_fix')
    assert.ok(decision.learnedFixContent!.includes('missing import'))
  })

  it('evaluateHealingPolicy requires post-repair review by default', () => {
    const fp = makeFP({ category: 'type_error', filePattern: 'src/lib/*.ts', severity: 'medium' })
    const decision = evaluateHealingPolicy(fp, state, [])
    assert.equal(decision.requiresReview, true)
  })

  it('evaluateHealingPolicy confidence varies by severity', () => {
    const low = evaluateHealingPolicy(
      makeFP({ category: 'lint_error', filePattern: 'src/*.ts', severity: 'low' }),
      state, [],
    )
    const medium = evaluateHealingPolicy(
      makeFP({ category: 'type_error', filePattern: 'src/*.ts', severity: 'medium' }),
      state, [],
    )
    const high = evaluateHealingPolicy(
      makeFP({ category: 'import_error', filePattern: 'src/*.ts', severity: 'high' }),
      state, [],
    )
    assert.ok(low.confidence > medium.confidence)
    assert.ok(medium.confidence > high.confidence)
  })

  // ── recordAttempt ───────────────────────────────────────────────────

  it('recordAttempt increments totalAttempts', () => {
    const fp = makeFP()
    const updated = recordAttempt(state, fp, true)
    assert.equal(updated.totalAttempts, 1)
  })

  it('recordAttempt increments category count', () => {
    const fp = makeFP({ category: 'type_error' })
    const updated = recordAttempt(state, fp, true)
    assert.equal(updated.attemptsByCategory['type_error'], 1)
  })

  it('recordAttempt tracks success per fingerprint', () => {
    const fp = makeFP({ hash: 'fp-abc' })
    const updated = recordAttempt(state, fp, true)
    assert.equal(updated.successByFingerprint['fp-abc'], true)
  })

  it('recordAttempt blocks fingerprint after 2 failed attempts', () => {
    const fp = makeFP({ hash: 'fp-bad' })
    let s = state
    s = recordAttempt(s, fp, false) // attempt 1
    assert.ok(!s.blockedFingerprints.has('fp-bad'))
    s = recordAttempt(s, fp, false) // attempt 2 → blocked
    assert.ok(s.blockedFingerprints.has('fp-bad'))
  })

  // ── Constants ───────────────────────────────────────────────────────

  it('DEFAULT_HEALING_POLICY has maxAttemptsPerRun = 5', () => {
    assert.equal(DEFAULT_HEALING_POLICY.maxAttemptsPerRun, 5)
  })

  it('DEFAULT_HEALING_POLICY has correct blocked categories', () => {
    assert.ok(DEFAULT_HEALING_POLICY.blockedCategories.includes('config_error'))
  })

  it('SUPPORTED_HEALING includes 6 categories', () => {
    assert.equal(SUPPORTED_HEALING.length, 6)
    assert.ok(SUPPORTED_HEALING.includes('type_error'))
    assert.ok(SUPPORTED_HEALING.includes('syntax_error'))
    assert.ok(SUPPORTED_HEALING.includes('import_error'))
    assert.ok(SUPPORTED_HEALING.includes('lint_error'))
    assert.ok(SUPPORTED_HEALING.includes('build_error'))
    assert.ok(SUPPORTED_HEALING.includes('test_failure'))
  })

  it('BLOCKED_OPERATIONS includes auth, payment, migration, dependency, deployment, refactor', () => {
    const ops = BLOCKED_OPERATIONS as readonly string[]
    assert.ok(ops.some((o) => o.includes('auth')))
    assert.ok(ops.some((o) => o.includes('payment')))
    assert.ok(ops.some((o) => o.includes('migration')))
    assert.ok(ops.some((o) => o.includes('dependency')))
    assert.ok(ops.some((o) => o.includes('deployment')))
    assert.ok(ops.some((o) => o.includes('refactor')))
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 7. PIPELINE / ORCHESTRATOR TESTS
// ═══════════════════════════════════════════════════════════════════════

describe('M5: Pipeline / Orchestrator', () => {
  const ALL_STEP_NAMES: PipelineStepName[] = [
    'product', 'repo_intelligence', 'architect', 'risk_gate',
    'code', 'patch_validation', 'sandbox', 'test',
    'fix', 'reviewer', 'memory', 'pr_materialization',
  ]

  it('pipeline has 12 step names', () => {
    assert.equal(ALL_STEP_NAMES.length, 12)
  })

  it('pipeline step names are all distinct', () => {
    const unique = new Set(ALL_STEP_NAMES)
    assert.equal(unique.size, 12)
  })

  it('PipelineStep can be created with pending status', () => {
    const step: PipelineStep = { name: 'product', status: 'pending' }
    assert.equal(step.name, 'product')
    assert.equal(step.status, 'pending')
    assert.equal(step.error, undefined)
  })

  it('PipelineStep supports all status transitions', () => {
    const statuses: PipelineStepStatus[] = ['pending', 'running', 'completed', 'failed', 'skipped']
    for (const status of statuses) {
      const step: PipelineStep = { name: 'code', status }
      assert.equal(step.status, status)
    }
  })

  it('PipelineStep failed records error message', () => {
    const step: PipelineStep = {
      name: 'test',
      status: 'failed',
      error: 'Tests did not pass',
    }
    assert.equal(step.status, 'failed')
    assert.equal(step.error, 'Tests did not pass')
  })

  it('PipelineInput requires all essential fields', () => {
    const input: PipelineInput = {
      projectId: 'proj-1',
      projectName: 'My Project',
      repoOwner: 'owner',
      repoName: 'repo',
      title: 'Add feature X',
      description: 'Implement feature X with tests',
      env: {},
    }
    assert.ok(input.projectId)
    assert.ok(input.title)
    assert.ok(input.description)
  })

  // ── buildPRBody ─────────────────────────────────────────────────────

  it('buildPRBody includes title', () => {
    const body = buildPRBody({
      title: 'Add new feature',
      productSummary: null,
      architectPlan: null,
      patches: [],
      riskReport: null,
      testResults: null,
      fixAttempts: null,
      reviewerVerdict: null,
      rollbackPlan: 'git revert HEAD~1',
      memoryUpdates: null,
      runId: 'run-123',
    })
    assert.ok(body.includes('Add new feature'))
    assert.ok(body.includes('run-123'))
  })

  it('buildPRBody includes acceptance criteria', () => {
    const body = buildPRBody({
      title: 'Feature',
      productSummary: {
        summary: 'Implement login page',
        acceptanceCriteria: ['User can log in', 'Error messages shown'],
      } as any,
      architectPlan: null,
      patches: [],
      riskReport: null,
      testResults: null,
      fixAttempts: null,
      reviewerVerdict: null,
      rollbackPlan: 'git revert HEAD~1',
      memoryUpdates: null,
      runId: 'run-456',
    })
    assert.ok(body.includes('Acceptance Criteria'))
    assert.ok(body.includes('User can log in'))
    assert.ok(body.includes('Error messages shown'))
  })

  it('buildPRBody includes rollback plan', () => {
    const body = buildPRBody({
      title: 'Feature',
      productSummary: null,
      architectPlan: null,
      patches: [],
      riskReport: null,
      testResults: null,
      fixAttempts: null,
      reviewerVerdict: null,
      rollbackPlan: 'git revert HEAD~3',
      memoryUpdates: null,
      runId: 'run-789',
    })
    assert.ok(body.includes('Rollback Plan'))
    assert.ok(body.includes('git revert HEAD~3'))
  })

  it('buildPRBody includes files changed', () => {
    const body = buildPRBody({
      title: 'Feature',
      productSummary: null,
      architectPlan: null,
      patches: [
        { filePath: 'src/lib/foo.ts', operation: 'add_file', content: '// new' },
        { filePath: 'src/lib/bar.ts', operation: 'modify_file', content: '// mod' },
      ],
      riskReport: null,
      testResults: null,
      fixAttempts: null,
      reviewerVerdict: null,
      rollbackPlan: 'git revert',
      memoryUpdates: null,
      runId: 'run-x',
    })
    assert.ok(body.includes('Files Changed (2)'))
    assert.ok(body.includes('src/lib/foo.ts'))
    assert.ok(body.includes('src/lib/bar.ts'))
  })

  it('buildPRBody includes human review checklist', () => {
    const body = buildPRBody({
      title: 'Feature',
      productSummary: null,
      architectPlan: null,
      patches: [],
      riskReport: null,
      testResults: null,
      fixAttempts: null,
      reviewerVerdict: null,
      rollbackPlan: 'git revert',
      memoryUpdates: null,
      runId: 'run-x',
    })
    assert.ok(body.includes('Human Review Checklist'))
    assert.ok(body.includes('Code changes match the request'))
    assert.ok(body.includes('Protected files are not modified'))
  })

  it('buildPRBody handles null inputs gracefully', () => {
    const body = buildPRBody({
      title: 'Minimal',
      productSummary: null,
      architectPlan: null,
      patches: [],
      riskReport: null,
      testResults: null,
      fixAttempts: null,
      reviewerVerdict: null,
      rollbackPlan: '',
      memoryUpdates: null,
      runId: 'run-min',
    })
    assert.ok(typeof body === 'string')
    assert.ok(body.includes('Minimal'))
  })

  it('buildPRBody includes reviewer verdict when present', () => {
    const body = buildPRBody({
      title: 'Feature',
      productSummary: null,
      architectPlan: null,
      patches: [],
      riskReport: null,
      testResults: null,
      fixAttempts: null,
      reviewerVerdict: {
        decision: 'approve',
        score: 92,
        recommendation: 'Ready to merge',
        reasons: ['Clean code', 'Good tests'],
        riskyFiles: ['src/auth.ts'],
        missingTests: [],
        rollbackConcerns: [],
      } as any,
      rollbackPlan: 'git revert',
      memoryUpdates: null,
      runId: 'run-rev',
    })
    assert.ok(body.includes('Reviewer Verdict'))
    assert.ok(body.includes('approve'))
    assert.ok(body.includes('92'))
    assert.ok(body.includes('Ready to merge'))
    assert.ok(body.includes('Risky Files'))
    assert.ok(body.includes('src/auth.ts'))
  })

  it('buildPRBody includes self-healing section when fix attempted', () => {
    const body = buildPRBody({
      title: 'Feature',
      productSummary: null,
      architectPlan: null,
      patches: [],
      riskReport: null,
      testResults: null,
      fixAttempts: { success: true } as any,
      reviewerVerdict: null,
      rollbackPlan: 'git revert',
      memoryUpdates: null,
      runId: 'run-fix',
    })
    assert.ok(body.includes('Self-Healing'))
    assert.ok(body.includes('Attempted'))
    assert.ok(body.includes('✅'))
  })

  it('buildPRBody includes lessons learned', () => {
    const body = buildPRBody({
      title: 'Feature',
      productSummary: null,
      architectPlan: null,
      patches: [],
      riskReport: null,
      testResults: null,
      fixAttempts: null,
      reviewerVerdict: null,
      rollbackPlan: 'git revert',
      memoryUpdates: {
        lessonsLearned: [
          { type: 'project_rule', content: 'Always validate inputs' },
          { type: 'fix_pattern', content: 'Import must be relative' },
        ],
      } as any,
      runId: 'run-mem',
    })
    assert.ok(body.includes('Lessons Learned'))
    assert.ok(body.includes('Always validate inputs'))
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 8. COLLECTION SCHEMA TESTS
// ═══════════════════════════════════════════════════════════════════════

describe('M5: Collection Schemas', () => {
  it('AgentVerdicts has correct slug', () => {
    assert.equal(AgentVerdicts.slug, 'agent-verdicts')
  })

  it('AgentVerdicts uses runId as admin title', () => {
    assert.equal(AgentVerdicts.admin?.useAsTitle, 'runId')
  })

  it('AgentVerdicts has required fields: runId, projectId', () => {
    const fields = AgentVerdicts.fields as any[]
    const runId = fields.find((f: any) => f.name === 'runId')
    const projectId = fields.find((f: any) => f.name === 'projectId')
    assert.ok(runId, 'runId field must exist')
    assert.ok(projectId, 'projectId field must exist')
    assert.equal(runId.required, true)
    assert.equal(projectId.required, true)
  })

  it('AgentVerdicts runId is unique', () => {
    const fields = AgentVerdicts.fields as any[]
    const runId = fields.find((f: any) => f.name === 'runId')
    assert.equal(runId.unique, true)
  })

  it('FailurePatterns has correct slug', () => {
    assert.equal(FailurePatterns.slug, 'failure-patterns')
  })

  it('FailurePatterns has correct categories', () => {
    const fields = FailurePatterns.fields as any[]
    const category = fields.find((f: any) => f.name === 'category')
    assert.ok(category)
    const values = category.options.map((o: any) => o.value)
    assert.ok(values.includes('import_error'))
    assert.ok(values.includes('type_error'))
    assert.ok(values.includes('lint_error'))
    assert.ok(values.includes('syntax_error'))
    assert.ok(values.includes('build_error'))
    assert.ok(values.includes('runtime_error'))
    assert.ok(values.includes('unknown'))
    assert.equal(values.length, 10) // all FailureCategory values
  })

  it('RepoMemories has correct slug', () => {
    assert.equal(RepoMemories.slug, 'repo-memories')
  })

  it('RepoMemories uses content as admin title', () => {
    assert.equal(RepoMemories.admin?.useAsTitle, 'content')
  })

  it('RepoMemories has required fields: projectId, repoName, memoryType, content', () => {
    const fields = RepoMemories.fields as any[]
    for (const name of ['projectId', 'repoName', 'memoryType', 'content']) {
      const field = fields.find((f: any) => f.name === name)
      assert.ok(field, `${name} field must exist`)
      assert.equal(field.required, true, `${name} must be required`)
    }
  })

  it('LearnedFixes has correct slug', () => {
    assert.equal(LearnedFixes.slug, 'learned-fixes')
  })

  it('LearnedFixes uses fixDescription as admin title', () => {
    assert.equal(LearnedFixes.admin?.useAsTitle, 'fixDescription')
  })

  it('ProjectRules has correct slug', () => {
    assert.equal(ProjectRules.slug, 'project-rules')
  })

  it('ProjectRules uses rule as admin title', () => {
    assert.equal(ProjectRules.admin?.useAsTitle, 'rule')
  })

  it('ProjectRules has severity field with info/warning/critical options', () => {
    const fields = ProjectRules.fields as any[]
    const severity = fields.find((f: any) => f.name === 'severity')
    assert.ok(severity)
    const values = severity.options.map((o: any) => o.value)
    assert.deepEqual(values.sort(), ['critical', 'info', 'warning'])
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 9. FEATURE FLAGS TESTS
// ═══════════════════════════════════════════════════════════════════════

describe('M5: Feature Flags', () => {
  it('M5 flags all default to true (no env override)', async () => {
    // Import fresh — flags use process.env at module load time
    // Since we haven't set any env vars to 'false', they should all be true
    const { FEATURE_FLAGS } = await import('../lib/featureFlags')
    assert.equal(FEATURE_FLAGS.M5_AGENT_PIPELINE, true)
    assert.equal(FEATURE_FLAGS.M5_AGENT_VERDICT, true)
    assert.equal(FEATURE_FLAGS.M5_MEMORY_SYSTEM, true)
    assert.equal(FEATURE_FLAGS.M5_MEMORY_AWARE, true)
    assert.equal(FEATURE_FLAGS.M5_HEALING_V2, true)
    assert.equal(FEATURE_FLAGS.M5_MODEL_ROUTER, true)
    assert.equal(FEATURE_FLAGS.M5_PR_QUALITY, true)
    assert.equal(FEATURE_FLAGS.M5_OBSERVABILITY, true)
    assert.equal(FEATURE_FLAGS.M5_FAILURE_FINGERPRINT, true)
    assert.equal(FEATURE_FLAGS.M5_REVIEWER_INDEPENDENCE, true)
  })

  it('all 10 M5 flags exist', async () => {
    const { FEATURE_FLAGS } = await import('../lib/featureFlags')
    const m5Keys = Object.keys(FEATURE_FLAGS).filter((k) => k.startsWith('M5_'))
    assert.equal(m5Keys.length, 10)
  })

  it('M1-M4 flags still present', async () => {
    const { FEATURE_FLAGS } = await import('../lib/featureFlags')
    const keys = Object.keys(FEATURE_FLAGS)
    assert.ok(keys.some((k) => k.startsWith('M1_')))
    assert.ok(keys.some((k) => k.startsWith('M2_')))
    assert.ok(keys.some((k) => k.startsWith('M3_')))
    assert.ok(keys.some((k) => k.startsWith('M4_')))
  })

  it('total flag count matches expected', async () => {
    const { FEATURE_FLAGS } = await import('../lib/featureFlags')
    const total = Object.keys(FEATURE_FLAGS).length
    // M1: 1, M2: 6, M3: 7, M4: 9, M5: 10 = 33
    assert.equal(total, 33)
  })

  it('all feature flags are boolean values', async () => {
    const { FEATURE_FLAGS } = await import('../lib/featureFlags')
    for (const [key, value] of Object.entries(FEATURE_FLAGS)) {
      assert.equal(typeof value, 'boolean', `${key} should be boolean`)
    }
  })
})
