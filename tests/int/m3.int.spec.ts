/**
 * Milestone 3 integration tests
 * Tests: patch engine, diff engine, code generation rules, edit scope,
 * patch validator, sandbox runner, self-healing, review gates,
 * run state machine (M3 states), rollback planning
 *
 * Target: 45+ passing tests
 */
import { describe, it, expect } from 'vitest'

// ── Code generation rules ─────────────────────────────────────────────────
import {
  validatePatchInput,
  isOperationSupported,
  isFilePathAllowed,
  checkPatchSetLimits,
  DEFAULT_LIMITS,
  SUPPORTED_OPERATIONS,
  BLOCKED_OPERATIONS,
} from '../../src/lib/codeGenerationRules'

describe('M3 — Code Generation Rules', () => {
  it('should identify supported operations', () => {
    expect(isOperationSupported('add_file')).toBe(true)
    expect(isOperationSupported('modify_file')).toBe(true)
    expect(isOperationSupported('append_code')).toBe(true)
    expect(isOperationSupported('delete_file')).toBe(false)
    expect(isOperationSupported('rename_file')).toBe(false)
  })

  it('should have default limits defined', () => {
    expect(DEFAULT_LIMITS.maxFilesPerRun).toBe(15)
    expect(DEFAULT_LIMITS.maxLinesPerFile).toBe(500)
    expect(DEFAULT_LIMITS.maxTotalLineChanges).toBe(2000)
    expect(DEFAULT_LIMITS.maxSelfHealAttempts).toBe(3)
  })

  it('should block node_modules paths', () => {
    expect(isFilePathAllowed('node_modules/express/index.js')).toBe(false)
    expect(isFilePathAllowed('src/lib/helper.ts')).toBe(true)
  })

  it('should block .env files', () => {
    expect(isFilePathAllowed('.env')).toBe(false)
    expect(isFilePathAllowed('.env.local')).toBe(false)
    expect(isFilePathAllowed('.env.production')).toBe(false)
  })

  it('should block binary files', () => {
    expect(isFilePathAllowed('icon.png')).toBe(false)
    expect(isFilePathAllowed('font.woff2')).toBe(false)
    expect(isFilePathAllowed('app.wasm')).toBe(false)
  })

  it('should block package lock files', () => {
    expect(isFilePathAllowed('package-lock.json')).toBe(false)
    expect(isFilePathAllowed('pnpm-lock.yaml')).toBe(false)
    expect(isFilePathAllowed('yarn.lock')).toBe(false)
  })

  it('should allow standard source files', () => {
    expect(isFilePathAllowed('src/components/Button.tsx')).toBe(true)
    expect(isFilePathAllowed('src/lib/utils.ts')).toBe(true)
    expect(isFilePathAllowed('docs/README.md')).toBe(true)
  })

  it('should check patch set limits — file count', () => {
    const result = checkPatchSetLimits(20, 100)
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('20 files')
  })

  it('should check patch set limits — line count', () => {
    const result = checkPatchSetLimits(5, 3000)
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('3000 lines')
  })

  it('should pass within limits', () => {
    const result = checkPatchSetLimits(5, 200)
    expect(result.allowed).toBe(true)
  })

  it('should detect dangerous patterns in content', () => {
    const result = validatePatchInput({
      filePath: 'src/test.ts',
      operation: 'add_file',
      content: 'const apiKey = "sk-1234567890abcdef"',
      linesChanged: 1,
    })
    expect(result.allPassed).toBe(false)
  })

  it('should detect DROP TABLE in content', () => {
    const result = validatePatchInput({
      filePath: 'src/db.ts',
      operation: 'modify_file',
      content: 'db.run("DROP TABLE users;")',
      linesChanged: 1,
    })
    expect(result.allPassed).toBe(false)
  })

  it('should pass clean content', () => {
    const result = validatePatchInput({
      filePath: 'src/helper.ts',
      operation: 'add_file',
      content: 'export function add(a: number, b: number) { return a + b }',
      linesChanged: 1,
    })
    expect(result.allPassed).toBe(true)
  })
})

// ── Diff engine ───────────────────────────────────────────────────────────
import { generateDiff, buildDiffSummary, formatUnifiedDiff } from '../../src/lib/diffEngine'

describe('M3 — Diff Engine', () => {
  it('should generate diff for new file', () => {
    const diff = generateDiff('new.ts', null, 'line1\nline2\nline3')
    expect(diff.operation).toBe('add')
    expect(diff.additions).toBe(3)
    expect(diff.deletions).toBe(0)
    expect(diff.hunks.length).toBeGreaterThan(0)
  })

  it('should generate diff for modified file', () => {
    const diff = generateDiff('mod.ts', 'old line 1\nold line 2', 'old line 1\nnew line 2')
    expect(diff.operation).toBe('modify')
    expect(diff.additions).toBeGreaterThanOrEqual(1)
  })

  it('should build diff summary', () => {
    const d1 = generateDiff('a.ts', null, 'content a')
    const d2 = generateDiff('b.ts', 'old', 'new')
    const summary = buildDiffSummary([d1, d2])
    expect(summary.totalFiles).toBe(2)
    expect(summary.filesAdded).toContain('a.ts')
    expect(summary.filesModified).toContain('b.ts')
  })

  it('should format unified diff text', () => {
    const diff = generateDiff('test.ts', null, 'hello\nworld')
    const text = formatUnifiedDiff(diff)
    expect(text).toContain('--- /dev/null')
    expect(text).toContain('+++ b/test.ts')
    expect(text).toContain('+hello')
  })
})

// ── Edit scope manager ────────────────────────────────────────────────────
import {
  createDefaultScope,
  checkFileScope,
  checkFilesScope,
} from '../../src/lib/editScopeManager'

describe('M3 — Edit Scope Manager', () => {
  const scope = createDefaultScope('proj-1')

  it('should allow standard component files', () => {
    const result = checkFileScope('src/components/Button.tsx', scope)
    expect(result.permission).toBe('allowed')
  })

  it('should allow test files', () => {
    const result = checkFileScope('tests/unit/helper.test.ts', scope)
    expect(result.permission).toBe('allowed')
  })

  it('should restrict auth files', () => {
    const result = checkFileScope('src/auth/login.ts', scope)
    expect(result.permission).toBe('restricted')
  })

  it('should restrict payment files', () => {
    const result = checkFileScope('src/payments/stripe.ts', scope)
    expect(result.permission).toBe('restricted')
  })

  it('should block .env files', () => {
    const result = checkFileScope('.env.local', scope)
    expect(result.permission).toBe('blocked')
  })

  it('should block node_modules', () => {
    const result = checkFileScope('node_modules/express/index.js', scope)
    expect(result.permission).toBe('blocked')
  })

  it('should block wrangler.toml', () => {
    const result = checkFileScope('wrangler.toml', scope)
    expect(result.permission).toBe('blocked')
  })

  it('should block migration files', () => {
    const result = checkFileScope('src/migrations/001_init.ts', scope)
    expect(result.permission).toBe('blocked')
  })

  it('should block GitHub workflows', () => {
    const result = checkFileScope('.github/workflows/deploy.yml', scope)
    expect(result.permission).toBe('blocked')
  })

  it('should check multiple files at once', () => {
    const result = checkFilesScope(
      ['src/components/A.tsx', '.env', 'src/auth/login.ts'],
      scope,
    )
    expect(result.allowed).toContain('src/components/A.tsx')
    expect(result.blocked).toContain('.env')
    expect(result.restricted).toContain('src/auth/login.ts')
  })
})

// ── Patch validator ───────────────────────────────────────────────────────
import { validatePatch, validatePatchSet } from '../../src/lib/patchValidator'

describe('M3 — Patch Validator', () => {
  it('should validate a clean patch', () => {
    const result = validatePatch({
      filePath: 'src/helper.ts',
      operation: 'add_file',
      content: 'export const x = 1',
      reasoning: 'test',
    })
    expect(result.valid).toBe(true)
    expect(result.errors.length).toBe(0)
  })

  it('should reject empty file path', () => {
    const result = validatePatch({
      filePath: '',
      operation: 'add_file',
      content: 'hello',
      reasoning: 'test',
    })
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.code === 'EMPTY_PATH')).toBe(true)
  })

  it('should reject absolute paths', () => {
    const result = validatePatch({
      filePath: '/etc/passwd',
      operation: 'modify_file',
      content: 'hacked',
      reasoning: 'test',
    })
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.code === 'ABSOLUTE_PATH')).toBe(true)
  })

  it('should reject path traversal', () => {
    const result = validatePatch({
      filePath: '../../../etc/passwd',
      operation: 'modify_file',
      content: 'x',
      reasoning: 'test',
    })
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.code === 'PATH_TRAVERSAL')).toBe(true)
  })

  it('should reject invalid operation', () => {
    const result = validatePatch({
      filePath: 'src/test.ts',
      operation: 'delete_file' as any,
      content: '',
      reasoning: 'test',
    })
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.code === 'INVALID_OPERATION')).toBe(true)
  })

  it('should warn about unbalanced braces in TS files', () => {
    const result = validatePatch({
      filePath: 'src/broken.ts',
      operation: 'add_file',
      content: 'function foo() {\n  return 1\n',
      reasoning: 'test',
    })
    expect(result.errors.some((e) => e.code === 'UNBALANCED_BRACES')).toBe(true)
  })

  it('should detect oversized files', () => {
    const bigContent = 'x\n'.repeat(600)
    const result = validatePatch({
      filePath: 'src/big.ts',
      operation: 'add_file',
      content: bigContent,
      reasoning: 'test',
    })
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.code === 'OVERSIZED')).toBe(true)
  })

  it('should validate a full patch set', () => {
    const patches = [
      { filePath: 'src/a.ts', operation: 'add_file' as const, content: 'export const a = 1', reasoning: 'test' },
      { filePath: 'src/b.ts', operation: 'add_file' as const, content: 'export const b = 2', reasoning: 'test' },
    ]
    const result = validatePatchSet(patches)
    expect(result.valid).toBe(true)
  })

  it('should reject patch set exceeding file limit', () => {
    const patches = Array.from({ length: 20 }, (_, i) => ({
      filePath: `src/file${i}.ts`,
      operation: 'add_file' as const,
      content: 'x',
      reasoning: 'test',
    }))
    const result = validatePatchSet(patches)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.code === 'TOO_MANY_FILES')).toBe(true)
  })
})

// ── Patch engine ──────────────────────────────────────────────────────────
import { validateAndDiffPatches } from '../../src/lib/patchEngine'

describe('M3 — Patch Engine', () => {
  it('should validate and diff a clean patch set', () => {
    const result = validateAndDiffPatches(
      [{ filePath: 'src/util.ts', operation: 'add_file', content: 'export const x = 1', reasoning: 'add util' }],
      [],
    )
    expect(result.success).toBe(true)
    expect(result.patches.length).toBe(1)
    expect(result.diffs.totalFiles).toBe(1)
  })

  it('should reject protected file patches', () => {
    const result = validateAndDiffPatches(
      [{ filePath: 'src/auth/session.ts', operation: 'modify_file', content: 'x', reasoning: 'test' }],
      [],
      ['src/auth/session.ts'],
    )
    expect(result.rejectedFiles.length).toBe(1)
    expect(result.rejectedFiles[0].reason).toContain('Protected')
  })

  it('should reject blocked path patches', () => {
    const result = validateAndDiffPatches(
      [{ filePath: 'node_modules/express/index.js', operation: 'modify_file', content: 'x', reasoning: 'test' }],
      [],
    )
    expect(result.rejectedFiles.length).toBe(1)
  })

  it('should handle mixed valid + rejected patches', () => {
    const result = validateAndDiffPatches(
      [
        { filePath: 'src/good.ts', operation: 'add_file', content: 'export const a = 1', reasoning: 'good' },
        { filePath: '.env', operation: 'modify_file', content: 'SECRET=abc', reasoning: 'bad' },
      ],
      [],
    )
    expect(result.patches.length).toBe(1)
    expect(result.rejectedFiles.length).toBe(1)
  })
})

// ── Sandbox runner ────────────────────────────────────────────────────────
import { createSandboxConfig, formatSandboxSummary, type SandboxRunResult } from '../../src/lib/sandboxRunner'

describe('M3 — Sandbox Runner', () => {
  it('should create sandbox config with defaults', () => {
    const config = createSandboxConfig('owner', 'repo', 'test-branch')
    expect(config.provider).toBe('github_actions')
    expect(config.repoOwner).toBe('owner')
    expect(config.branch).toBe('test-branch')
    expect(config.steps.length).toBe(4)
  })

  it('should allow config overrides', () => {
    const config = createSandboxConfig('owner', 'repo', 'branch', { provider: 'local_mock', timeoutMs: 30000 })
    expect(config.provider).toBe('local_mock')
    expect(config.timeoutMs).toBe(30000)
  })

  it('should format sandbox summary', () => {
    const result: SandboxRunResult = {
      provider: 'local_mock',
      success: true,
      steps: [
        { step: 'install', status: 'passed', exitCode: 0, stdout: '', stderr: '', durationMs: 100 },
        { step: 'build', status: 'passed', exitCode: 0, stdout: '', stderr: '', durationMs: 200 },
      ],
      totalDurationMs: 300,
      errors: [],
      summary: 'All passed',
    }
    const text = formatSandboxSummary(result)
    expect(text).toContain('All passed')
    expect(text).toContain('install')
    expect(text).toContain('build')
  })
})

// ── Self-healing loop ─────────────────────────────────────────────────────
import {
  categorizeError,
  planHealingAttempts,
  shouldAttemptHealing,
  DEFAULT_HEAL_CONFIG,
} from '../../src/lib/selfHealingLoop'

describe('M3 — Self-Healing Loop', () => {
  it('should categorize import errors', () => {
    const result = categorizeError('Cannot find module "express"')
    expect(result.category).toBe('import_error')
    expect(result.healable).toBe(true)
    expect(result.suggestedAction).toBe('fix_import')
  })

  it('should categorize syntax errors', () => {
    const result = categorizeError('SyntaxError: Unexpected token')
    expect(result.category).toBe('syntax_error')
    expect(result.healable).toBe(true)
  })

  it('should categorize type errors', () => {
    const result = categorizeError('Type "string" is not assignable to type "number"')
    expect(result.category).toBe('type_error')
    expect(result.healable).toBe(true)
  })

  it('should categorize test failures as unhealable', () => {
    const result = categorizeError('FAIL tests/unit/helper.test.ts')
    expect(result.category).toBe('test_failure')
    expect(result.healable).toBe(false)
  })

  it('should categorize unknown errors as unhealable', () => {
    const result = categorizeError('Something completely unexpected happened')
    expect(result.category).toBe('unknown')
    expect(result.healable).toBe(false)
  })

  it('should plan healing attempts within limit', () => {
    const errors = [
      categorizeError('Cannot find module "express"'),
      categorizeError('SyntaxError: Unexpected token'),
      categorizeError('Type "string" is not assignable'),
    ]
    const plan = planHealingAttempts(errors)
    expect(plan.healable.length).toBe(3)
    expect(plan.unhealable.length).toBe(0)
  })

  it('should respect max attempts limit', () => {
    const errors = Array.from({ length: 5 }, () =>
      categorizeError('Cannot find module "x"'),
    )
    const plan = planHealingAttempts(errors, { maxAttempts: 2, allowedCategories: ['import_error'] })
    expect(plan.healable.length).toBe(2)
    expect(plan.wouldExceedLimit).toBe(true)
  })

  it('should not attempt healing when max reached', () => {
    const errors = [categorizeError('Cannot find module "x"')]
    expect(shouldAttemptHealing(errors, 3)).toBe(false)
  })

  it('should not attempt healing for unhealable errors', () => {
    const errors = [categorizeError('Something unknown')]
    expect(shouldAttemptHealing(errors, 0)).toBe(false)
  })

  it('should attempt healing for healable errors', () => {
    const errors = [categorizeError('Cannot find module "x"')]
    expect(shouldAttemptHealing(errors, 0)).toBe(true)
  })
})

// ── Review gates ──────────────────────────────────────────────────────────
import { evaluateReviewGates, getGateDecisionIcon } from '../../src/lib/reviewGates'
import type { RiskReport } from '../../src/lib/riskEngine'

describe('M3 — Review Gates', () => {
  it('should auto-approve low-risk, small, safe changes', () => {
    const result = evaluateReviewGates({
      patches: [{ filePath: 'src/utils/helper.ts', operation: 'add_file', content: 'export const x = 1', reasoning: '' }],
      riskReport: { riskLevel: 'LOW', riskScore: 10, confidenceScore: 80, rollbackComplexity: 'SIMPLE', implementationScope: 'MINIMAL', triggeredFactors: [], recommendations: [], affectedFilesCount: 1, protectedFilesCount: 0 } as RiskReport,
      protectedFiles: [],
      totalLinesChanged: 20,
      affectedFileCount: 1,
    })
    expect(result.overallDecision).toBe('auto_approve')
    expect(result.canProceed).toBe(true)
  })

  it('should block changes touching auth files', () => {
    const result = evaluateReviewGates({
      patches: [{ filePath: 'src/auth/login.ts', operation: 'modify_file', content: 'x', reasoning: '' }],
      riskReport: null,
      protectedFiles: [{ filePath: 'src/auth/login.ts', protectionType: 'auth', reason: 'Auth file', severity: 'critical' }],
      totalLinesChanged: 10,
      affectedFileCount: 1,
    })
    expect(result.overallDecision).toBe('blocked')
    expect(result.canProceed).toBe(false)
  })

  it('should require confirmation for medium risk', () => {
    const result = evaluateReviewGates({
      patches: [{ filePath: 'src/api/route.ts', operation: 'modify_file', content: 'x', reasoning: '' }],
      riskReport: { riskLevel: 'MEDIUM', riskScore: 45, confidenceScore: 70, rollbackComplexity: 'MODERATE', implementationScope: 'MODERATE', triggeredFactors: [], recommendations: [], affectedFilesCount: 3, protectedFilesCount: 0 } as RiskReport,
      protectedFiles: [],
      totalLinesChanged: 150,
      affectedFileCount: 3,
    })
    expect(result.overallDecision).toBe('confirmation_required')
  })

  it('should block changes touching payment files', () => {
    const result = evaluateReviewGates({
      patches: [{ filePath: 'src/billing/stripe.ts', operation: 'modify_file', content: 'stripe.charges.create()', reasoning: '' }],
      riskReport: null,
      protectedFiles: [],
      totalLinesChanged: 5,
      affectedFileCount: 1,
    })
    expect(result.overallDecision).toBe('blocked')
    expect(result.blockReasons.length).toBeGreaterThan(0)
  })

  it('should block migration files', () => {
    const result = evaluateReviewGates({
      patches: [{ filePath: 'migrations/001_init.sql', operation: 'add_file', content: 'CREATE TABLE x', reasoning: '' }],
      riskReport: null,
      protectedFiles: [],
      totalLinesChanged: 5,
      affectedFileCount: 1,
    })
    expect(result.overallDecision).toBe('blocked')
  })

  it('should return correct gate icons', () => {
    expect(getGateDecisionIcon('auto_approve')).toBe('✅')
    expect(getGateDecisionIcon('blocked')).toBe('🚫')
    expect(getGateDecisionIcon('approval_required')).toBe('🔒')
  })
})

// ── Run state machine (M3 states) ─────────────────────────────────────────
import {
  transition,
  safeTransition,
  validEventsFrom,
  isTerminal,
  isRunStale,
  createRunContext,
  applyEvent,
  STATE_LABELS,
  STATE_PROGRESS,
} from '../../src/lib/runStateMachine'

describe('M3 — Run State Machine (extended)', () => {
  it('should support M3 patch generation flow', () => {
    let state = transition('planning', 'PATCHES_GENERATED')
    expect(state).toBe('patch_generation')
    state = transition(state, 'PATCHES_VALIDATED')
    expect(state).toBe('patch_validation')
    state = transition(state, 'SANDBOX_PASSED')
    expect(state).toBe('sandbox_execution')
    state = transition(state, 'TESTS_PASSED')
    expect(state).toBe('test_execution')
    state = transition(state, 'REVIEW_PASSED')
    expect(state).toBe('review_gate')
    state = transition(state, 'READY_FOR_PR')
    expect(state).toBe('pr_ready')
    state = transition(state, 'PR_CREATED')
    expect(state).toBe('completed')
  })

  it('should support self-healing loop back', () => {
    let state = transition('test_execution', 'SELF_HEAL_DONE')
    expect(state).toBe('self_healing')
    state = transition(state, 'PATCHES_VALIDATED')
    expect(state).toBe('patch_validation')
  })

  it('should still support M1/M2 plan-only flow', () => {
    let state = transition('queued', 'START')
    state = transition(state, 'START')
    state = transition(state, 'REPO_ANALYZED')
    state = transition(state, 'GRAPH_BUILT')
    state = transition(state, 'RISK_ASSESSED')
    state = transition(state, 'PLAN_GENERATED')
    state = transition(state, 'PR_CREATED')
    expect(state).toBe('completed')
  })

  it('should allow ERROR from all M3 states', () => {
    const m3States = ['patch_generation', 'patch_validation', 'sandbox_execution', 'test_execution', 'self_healing', 'review_gate', 'pr_ready'] as const
    for (const s of m3States) {
      expect(transition(s, 'ERROR')).toBe('failed')
    }
  })

  it('should allow CANCEL from all M3 states', () => {
    const m3States = ['patch_generation', 'patch_validation', 'sandbox_execution', 'test_execution', 'self_healing', 'review_gate', 'pr_ready'] as const
    for (const s of m3States) {
      expect(transition(s, 'CANCEL')).toBe('cancelled')
    }
  })

  it('should have labels for all M3 states', () => {
    expect(STATE_LABELS.patch_generation).toBe('Generating Code Patches')
    expect(STATE_LABELS.sandbox_execution).toBe('Running Sandbox')
    expect(STATE_LABELS.self_healing).toBe('Self-Healing')
    expect(STATE_LABELS.review_gate).toBe('Awaiting Review')
    expect(STATE_LABELS.pr_ready).toBe('Preparing PR')
  })

  it('should have progress values for all M3 states', () => {
    expect(STATE_PROGRESS.patch_generation).toBe(45)
    expect(STATE_PROGRESS.review_gate).toBe(82)
    expect(STATE_PROGRESS.pr_ready).toBe(90)
  })

  it('should detect stale M3 runs', () => {
    const ctx = { state: 'patch_generation' as const, runId: 'r1', enteredAt: Date.now() - 10 * 60 * 1000, retryCount: 0 }
    expect(isRunStale(ctx)).toBe(true)
  })
})

// ── Feature flags ─────────────────────────────────────────────────────────
import { FEATURE_FLAGS } from '../../src/lib/featureFlags'

describe('M3 — Feature Flags', () => {
  it('should have all M3 feature flags defined', () => {
    expect(typeof FEATURE_FLAGS.M3_PATCH_GENERATION).toBe('boolean')
    expect(typeof FEATURE_FLAGS.M3_EDIT_SCOPE).toBe('boolean')
    expect(typeof FEATURE_FLAGS.M3_PATCH_VALIDATION).toBe('boolean')
    expect(typeof FEATURE_FLAGS.M3_SANDBOX).toBe('boolean')
    expect(typeof FEATURE_FLAGS.M3_SELF_HEALING).toBe('boolean')
    expect(typeof FEATURE_FLAGS.M3_REVIEW_GATES).toBe('boolean')
    expect(typeof FEATURE_FLAGS.M3_DIFF_REVIEW).toBe('boolean')
    expect(typeof FEATURE_FLAGS.M3_ROLLBACK_PLANNING).toBe('boolean')
  })

  it('should default all M3 flags to true', () => {
    expect(FEATURE_FLAGS.M3_PATCH_GENERATION).toBe(true)
    expect(FEATURE_FLAGS.M3_REVIEW_GATES).toBe(true)
    expect(FEATURE_FLAGS.M3_SELF_HEALING).toBe(true)
  })

  it('should preserve M1/M2 flags', () => {
    expect(typeof FEATURE_FLAGS.M1_PLANNING).toBe('boolean')
    expect(typeof FEATURE_FLAGS.M2_REPO_INTELLIGENCE).toBe('boolean')
    expect(typeof FEATURE_FLAGS.M2_RISK_ENGINE).toBe('boolean')
  })
})
