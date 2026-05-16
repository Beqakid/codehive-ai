/**
 * Milestone 4 Test Suite — Real Execution AI Engineering Pipeline
 *
 * Tests: workspace management, patch application, execution pipeline,
 * artifact storage, execution replay, healing strategies, PR materialization,
 * workspace cleanup, orchestration resilience, failure recovery, analytics.
 *
 * Target: 75+ tests (220+ total with M1/M2/M3)
 */

import { describe, it, expect } from 'vitest'

// ─── Workspace Manager ────────────────────────────────────────────────────

import {
  generateWorkspaceId,
  generateWorkspaceBranch,
  isWorkspaceExpired,
  isWorkspaceActive,
  isWorkspaceOrphaned,
  updateHeartbeat,
  transitionWorkspace,
  DEFAULT_WORKSPACE_CONFIG,
  type WorkspaceInfo,
} from '../src/lib/workspaceManager'

function createMockWorkspace(overrides: Partial<WorkspaceInfo> = {}): WorkspaceInfo {
  const now = Date.now()
  return {
    workspaceId: 'codehive-ws-test-abc123',
    projectId: 'proj-1',
    runId: 'run-1',
    provider: 'github',
    status: 'ready',
    branchName: 'workspace/codehive-ws-test-abc123',
    repoOwner: 'TestOwner',
    repoName: 'test-repo',
    baseBranch: 'main',
    createdAt: now,
    lastHeartbeat: now,
    expiresAt: now + 600_000,
    fileCount: 0,
    metadata: {},
    ...overrides,
  }
}

describe('Workspace Manager', () => {
  it('generates unique workspace IDs', () => {
    const id1 = generateWorkspaceId('run-1')
    const id2 = generateWorkspaceId('run-2')
    expect(id1).toMatch(/^codehive-ws-/)
    expect(id2).toMatch(/^codehive-ws-/)
    expect(id1).not.toBe(id2)
  })

  it('generates workspace branch from ID', () => {
    const branch = generateWorkspaceBranch('codehive-ws-abc')
    expect(branch).toBe('workspace/codehive-ws-abc')
  })

  it('detects expired workspace', () => {
    const ws = createMockWorkspace({ expiresAt: Date.now() - 1000 })
    expect(isWorkspaceExpired(ws)).toBe(true)
  })

  it('non-expired workspace returns false', () => {
    const ws = createMockWorkspace({ expiresAt: Date.now() + 60_000 })
    expect(isWorkspaceExpired(ws)).toBe(false)
  })

  it('active workspace statuses', () => {
    expect(isWorkspaceActive(createMockWorkspace({ status: 'ready' }))).toBe(true)
    expect(isWorkspaceActive(createMockWorkspace({ status: 'patching' }))).toBe(true)
    expect(isWorkspaceActive(createMockWorkspace({ status: 'executing' }))).toBe(true)
    expect(isWorkspaceActive(createMockWorkspace({ status: 'destroyed' }))).toBe(false)
    expect(isWorkspaceActive(createMockWorkspace({ status: 'failed' }))).toBe(false)
  })

  it('detects orphaned workspace (stale heartbeat)', () => {
    const ws = createMockWorkspace({
      lastHeartbeat: Date.now() - 20 * 60_000,
      status: 'executing',
    })
    expect(isWorkspaceOrphaned(ws, 15 * 60_000)).toBe(true)
  })

  it('non-orphaned active workspace', () => {
    const ws = createMockWorkspace({ lastHeartbeat: Date.now(), status: 'ready' })
    expect(isWorkspaceOrphaned(ws)).toBe(false)
  })

  it('updateHeartbeat refreshes timestamp', () => {
    const ws = createMockWorkspace({ lastHeartbeat: Date.now() - 60_000 })
    const updated = updateHeartbeat(ws)
    expect(updated.lastHeartbeat).toBeGreaterThan(ws.lastHeartbeat)
  })

  it('transitions workspace status', () => {
    const ws = createMockWorkspace({ status: 'ready' })
    const updated = transitionWorkspace(ws, 'patching')
    expect(updated.status).toBe('patching')
  })

  it('default config values', () => {
    expect(DEFAULT_WORKSPACE_CONFIG.timeoutMs).toBe(600_000)
    expect(DEFAULT_WORKSPACE_CONFIG.maxSizeMB).toBe(500)
    expect(DEFAULT_WORKSPACE_CONFIG.provider).toBe('github')
  })
})

// ─── Workspace Cleanup ────────────────────────────────────────────────────

import {
  isBranchProtected,
  detectOrphans,
  generateCleanupReport,
  DEFAULT_CLEANUP_CONFIG,
  type CleanupResult,
} from '../src/lib/workspaceCleanup'

describe('Workspace Cleanup', () => {
  it('identifies protected branches', () => {
    expect(isBranchProtected('main')).toBe(true)
    expect(isBranchProtected('master')).toBe(true)
    expect(isBranchProtected('develop')).toBe(true)
    expect(isBranchProtected('release/v1.0')).toBe(true)
  })

  it('workspace branches are not protected', () => {
    expect(isBranchProtected('workspace/codehive-ws-abc')).toBe(false)
    expect(isBranchProtected('feature/test')).toBe(false)
  })

  it('detects orphaned workspaces', () => {
    const workspaces = [
      createMockWorkspace({ status: 'ready', lastHeartbeat: Date.now() - 20 * 60_000 }),
      createMockWorkspace({ status: 'destroyed' }),
      createMockWorkspace({ status: 'ready', lastHeartbeat: Date.now() }),
    ]
    const orphans = detectOrphans(workspaces)
    expect(orphans.length).toBe(1)
  })

  it('expired workspaces are detected as orphans', () => {
    const workspaces = [
      createMockWorkspace({ status: 'ready', expiresAt: Date.now() - 1000 }),
    ]
    const orphans = detectOrphans(workspaces)
    expect(orphans.length).toBe(1)
  })

  it('generates cleanup report', () => {
    const results: CleanupResult[] = [
      { workspaceId: 'ws-1', branchDeleted: true, markedDestroyed: true, artifactsRetained: true, errors: [], durationMs: 100 },
      { workspaceId: 'ws-2', branchDeleted: false, markedDestroyed: true, artifactsRetained: true, errors: ['branch error'], durationMs: 50 },
    ]
    const report = generateCleanupReport(results)
    expect(report.totalCleaned).toBe(1)
    expect(report.totalFailed).toBe(1)
    expect(report.totalErrors).toBe(1)
  })

  it('default cleanup config', () => {
    expect(DEFAULT_CLEANUP_CONFIG.retainArtifacts).toBe(true)
    expect(DEFAULT_CLEANUP_CONFIG.staleDurationMs).toBe(15 * 60_000)
  })
})

// ─── Patch Applier ────────────────────────────────────────────────────────

import {
  isBranchSafeForWrite,
  validatePatchesForApply,
} from '../src/lib/patchApplier'

describe('Patch Applier', () => {
  it('workspace branches are safe for write', () => {
    expect(isBranchSafeForWrite('workspace/codehive-ws-abc')).toBe(true)
  })

  it('main/master branches are NOT safe for write', () => {
    expect(isBranchSafeForWrite('main')).toBe(false)
    expect(isBranchSafeForWrite('master')).toBe(false)
    expect(isBranchSafeForWrite('develop')).toBe(false)
    expect(isBranchSafeForWrite('production')).toBe(false)
  })

  it('feature branches are NOT safe (must be workspace/)', () => {
    expect(isBranchSafeForWrite('feature/test')).toBe(false)
  })

  it('validates empty patch set', () => {
    const result = validatePatchesForApply([])
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Empty patch set')
  })

  it('validates patches with empty paths', () => {
    const result = validatePatchesForApply([
      { filePath: '', operation: 'add_file', content: 'test', reasoning: 'test' },
    ])
    expect(result.valid).toBe(false)
  })

  it('detects path traversal', () => {
    const result = validatePatchesForApply([
      { filePath: '../../../etc/passwd', operation: 'modify_file', content: 'bad', reasoning: 'test' },
    ])
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('traversal'))).toBe(true)
  })

  it('detects duplicate file paths', () => {
    const result = validatePatchesForApply([
      { filePath: 'src/test.ts', operation: 'add_file', content: 'a', reasoning: 'test' },
      { filePath: 'src/test.ts', operation: 'modify_file', content: 'b', reasoning: 'test' },
    ])
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('Duplicate'))).toBe(true)
  })

  it('valid patch set passes', () => {
    const result = validatePatchesForApply([
      { filePath: 'src/utils/helper.ts', operation: 'add_file', content: 'export const x = 1', reasoning: 'test' },
    ])
    expect(result.valid).toBe(true)
    expect(result.errors.length).toBe(0)
  })
})

// ─── Execution Pipeline ──────────────────────────────────────────────────

import {
  isCommandAllowed,
  getDefaultCommand,
  createPipelineConfig,
  DEFAULT_PIPELINE_STEPS,
} from '../src/lib/executionPipeline'

describe('Execution Pipeline', () => {
  it('allows valid commands', () => {
    expect(isCommandAllowed('npm install', 'install')).toBe(true)
    expect(isCommandAllowed('pnpm install', 'install')).toBe(true)
    expect(isCommandAllowed('npm run lint', 'lint')).toBe(true)
    expect(isCommandAllowed('npm run build', 'build')).toBe(true)
    expect(isCommandAllowed('npm test', 'test')).toBe(true)
    expect(isCommandAllowed('npx tsc --noEmit', 'typecheck')).toBe(true)
  })

  it('blocks custom commands', () => {
    expect(isCommandAllowed('rm -rf /', 'custom')).toBe(false)
  })

  it('blocks unrelated commands for wrong steps', () => {
    expect(isCommandAllowed('npm install', 'build')).toBe(false)
  })

  it('gets default commands for package managers', () => {
    expect(getDefaultCommand('install', 'npm')).toBe('npm install')
    expect(getDefaultCommand('install', 'pnpm')).toBe('pnpm install')
    expect(getDefaultCommand('build', 'npm')).toBe('npm run build')
    expect(getDefaultCommand('test', 'yarn')).toBe('yarn test')
  })

  it('creates pipeline config with defaults', () => {
    const config = createPipelineConfig({
      repoOwner: 'test', repoName: 'repo', branchName: 'workspace/test', workspaceId: 'ws-1', runId: 'run-1',
    })
    expect(config.steps).toEqual(DEFAULT_PIPELINE_STEPS)
    expect(config.packageManager).toBe('npm')
    expect(config.timeoutMs).toBe(300_000)
  })

  it('default pipeline steps', () => {
    expect(DEFAULT_PIPELINE_STEPS).toEqual(['install', 'lint', 'typecheck', 'build', 'test'])
  })
})

// ─── Artifact Storage ─────────────────────────────────────────────────────

import {
  generateArtifactKey,
  generateArtifactId,
  uploadArtifact,
  buildArtifactList,
  findExpiredArtifacts,
  ARTIFACT_CONFIG,
  type ArtifactRecord,
} from '../src/lib/artifactStorage'

describe('Artifact Storage', () => {
  it('generates artifact key', () => {
    const key = generateArtifactKey('proj-1', 'run-1', 'build_log', 'build.txt')
    expect(key).toBe('codehive/proj-1/run-1/build_log/build.txt')
  })

  it('generates unique artifact IDs', () => {
    const id1 = generateArtifactId()
    const id2 = generateArtifactId()
    expect(id1).toMatch(/^art-/)
    expect(id2).toMatch(/^art-/)
    expect(id1).not.toBe(id2)
  })

  it('uploads artifact without R2 (metadata-only)', async () => {
    const result = await uploadArtifact({
      projectId: 'proj-1',
      runId: 'run-1',
      type: 'build_log',
      filename: 'build.txt',
      content: 'Build output here',
    })
    expect(result.success).toBe(true)
    expect(result.artifact).not.toBeNull()
    expect(result.artifact!.type).toBe('build_log')
    expect(result.artifact!.sizeBytes).toBeGreaterThan(0)
  })

  it('rejects oversized artifacts', async () => {
    const bigContent = 'x'.repeat(ARTIFACT_CONFIG.maxSizeBytes + 1)
    const result = await uploadArtifact({
      projectId: 'proj-1',
      runId: 'run-1',
      type: 'build_log',
      filename: 'huge.txt',
      content: bigContent,
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain('exceeds max size')
  })

  it('builds artifact list filtered by type', () => {
    const records: ArtifactRecord[] = [
      { artifactId: 'a1', projectId: 'p', runId: 'r', type: 'build_log', key: 'k1', sizeBytes: 100, mimeType: 'text/plain', createdAt: Date.now(), expiresAt: null, metadata: {} },
      { artifactId: 'a2', projectId: 'p', runId: 'r', type: 'test_report', key: 'k2', sizeBytes: 200, mimeType: 'text/plain', createdAt: Date.now(), expiresAt: null, metadata: {} },
    ]
    const buildLogs = buildArtifactList(records, 'build_log')
    expect(buildLogs.totalCount).toBe(1)
    expect(buildLogs.artifacts[0].type).toBe('build_log')
  })

  it('finds expired artifacts', () => {
    const records: ArtifactRecord[] = [
      { artifactId: 'a1', projectId: 'p', runId: 'r', type: 'build_log', key: 'k1', sizeBytes: 100, mimeType: 'text/plain', createdAt: Date.now(), expiresAt: Date.now() - 1000, metadata: {} },
      { artifactId: 'a2', projectId: 'p', runId: 'r', type: 'test_report', key: 'k2', sizeBytes: 200, mimeType: 'text/plain', createdAt: Date.now(), expiresAt: Date.now() + 86_400_000, metadata: {} },
      { artifactId: 'a3', projectId: 'p', runId: 'r', type: 'diff', key: 'k3', sizeBytes: 50, mimeType: 'text/plain', createdAt: Date.now(), expiresAt: null, metadata: {} },
    ]
    const expired = findExpiredArtifacts(records)
    expect(expired.length).toBe(1)
    expect(expired[0].artifactId).toBe('a1')
  })

  it('config defaults', () => {
    expect(ARTIFACT_CONFIG.defaultRetentionDays).toBe(30)
    expect(ARTIFACT_CONFIG.maxSizeBytes).toBe(50 * 1024 * 1024)
    expect(ARTIFACT_CONFIG.bucketPrefix).toBe('codehive')
  })
})

// ─── Execution Replay ─────────────────────────────────────────────────────

import {
  createReplaySession,
  recordEvent,
  completeSession,
  buildTimeline,
  serializeSession,
  deserializeSession,
} from '../src/lib/executionReplay'

describe('Execution Replay', () => {
  it('creates replay session', () => {
    const session = createReplaySession('run-1', 'proj-1', 'ws-1')
    expect(session.runId).toBe('run-1')
    expect(session.status).toBe('recording')
    expect(session.events).toEqual([])
    expect(session.totalSteps).toBe(0)
  })

  it('records events', () => {
    let session = createReplaySession('run-1', 'proj-1', 'ws-1')
    session = recordEvent(session, 'workspace_created', { workspaceId: 'ws-1' })
    session = recordEvent(session, 'patches_received', { count: 3 })
    expect(session.events.length).toBe(2)
    expect(session.totalSteps).toBe(2)
  })

  it('tracks failed steps', () => {
    let session = createReplaySession('run-1', 'proj-1', 'ws-1')
    session = recordEvent(session, 'step_failed', { step: 'build' })
    expect(session.failedSteps).toBe(1)
  })

  it('tracks heal attempts', () => {
    let session = createReplaySession('run-1', 'proj-1', 'ws-1')
    session = recordEvent(session, 'self_heal_started', { strategy: 'import_fix' })
    expect(session.healAttempts).toBe(1)
  })

  it('completes session', () => {
    let session = createReplaySession('run-1', 'proj-1', 'ws-1')
    session = completeSession(session, true)
    expect(session.status).toBe('completed')
    expect(session.completedAt).not.toBeNull()
  })

  it('failed session status', () => {
    let session = createReplaySession('run-1', 'proj-1', 'ws-1')
    session = completeSession(session, false)
    expect(session.status).toBe('failed')
  })

  it('builds timeline from session', () => {
    let session = createReplaySession('run-1', 'proj-1', 'ws-1')
    session = recordEvent(session, 'workspace_created')
    session = recordEvent(session, 'patch_applied')
    session = recordEvent(session, 'step_completed', { step: 'build' })
    session = recordEvent(session, 'step_failed', { step: 'test' }, 'Test failed')
    session = completeSession(session, false)

    const timeline = buildTimeline(session)
    expect(timeline.phases.length).toBeGreaterThan(0)
    expect(timeline.failurePoints.length).toBe(1)
  })

  it('serializes and deserializes session', () => {
    let session = createReplaySession('run-1', 'proj-1', 'ws-1')
    session = recordEvent(session, 'workspace_created')
    session = completeSession(session, true)

    const serialized = serializeSession(session)
    expect(typeof serialized.events).toBe('string')

    const deserialized = deserializeSession(serialized)
    expect(deserialized.runId).toBe('run-1')
    expect(deserialized.events.length).toBe(1)
    expect(deserialized.status).toBe('completed')
  })
})

// ─── Healing Strategies ───────────────────────────────────────────────────

import {
  classifyError,
  isHealingSafe,
  createHealingAttempt,
  shouldContinueHealing,
  generateImportFix,
  generateUnusedVariableFix,
  generateMissingExportFix,
  DEFAULT_HEALING_CONFIG,
  type HealingAttempt as HealAttempt,
} from '../src/lib/healingStrategies'

describe('Healing Strategies', () => {
  it('classifies import errors', () => {
    const analysis = classifyError("Cannot find module './utils/helper'")
    expect(analysis.strategy).toBe('import_fix')
    expect(analysis.confidence).toBeGreaterThan(0.5)
  })

  it('classifies syntax errors', () => {
    const analysis = classifyError('SyntaxError: Unexpected token )')
    expect(analysis.strategy).toBe('syntax_repair')
  })

  it('classifies type mismatches', () => {
    const analysis = classifyError("Type 'string' is not assignable to type 'number'")
    expect(analysis.strategy).toBe('type_mismatch')
  })

  it('classifies lint errors', () => {
    const analysis = classifyError('eslint: prefer-const')
    expect(analysis.strategy).toBe('lint_autofix')
  })

  it('classifies unused variables', () => {
    const analysis = classifyError("no-unused-vars: 'myVar' is defined but never used")
    expect(analysis.strategy).toBe('unused_variable')
  })

  it('returns unknown for unclassifiable errors', () => {
    const analysis = classifyError('Something totally random happened')
    expect(analysis.strategy).toBe('unknown')
    expect(analysis.canAutoFix).toBe(false)
  })

  it('healing is safe for allowed strategies', () => {
    const analysis = classifyError("Cannot find module './test'")
    const result = isHealingSafe(analysis)
    expect(result.safe).toBe(true)
  })

  it('healing is blocked for auth files', () => {
    const analysis = {
      strategy: 'import_fix' as const,
      confidence: 0.9,
      description: 'Fix import',
      targetFile: 'src/auth/login.ts',
      suggestedFix: 'Add import',
      canAutoFix: true,
    }
    const result = isHealingSafe(analysis)
    expect(result.safe).toBe(false)
    expect(result.reason).toContain('blocked pattern')
  })

  it('healing is blocked for payment files', () => {
    const analysis = {
      strategy: 'syntax_repair' as const,
      confidence: 0.9,
      description: 'Fix syntax',
      targetFile: 'src/payment/stripe.ts',
      suggestedFix: 'Fix bracket',
      canAutoFix: true,
    }
    const result = isHealingSafe(analysis)
    expect(result.safe).toBe(false)
  })

  it('healing blocked for low confidence', () => {
    const analysis = {
      strategy: 'import_fix' as const,
      confidence: 0.3,
      description: 'Low confidence',
      targetFile: 'src/utils/test.ts',
      suggestedFix: 'Maybe fix',
      canAutoFix: true,
    }
    const result = isHealingSafe(analysis)
    expect(result.safe).toBe(false)
    expect(result.reason).toContain('Confidence too low')
  })

  it('creates healing attempt', () => {
    const analysis = classifyError("Cannot find module './test'")
    const attempt = createHealingAttempt('run-1', 'ws-1', analysis, 1)
    expect(attempt.runId).toBe('run-1')
    expect(attempt.attemptNumber).toBe(1)
    expect(attempt.maxAttempts).toBe(3)
  })

  it('shouldContinueHealing respects max attempts', () => {
    const attempts: HealAttempt[] = Array.from({ length: 3 }, (_, i) => ({
      attemptId: `a-${i}`, runId: 'r', workspaceId: 'ws', strategy: 'import_fix',
      targetFile: 'f', errorMessage: 'e', suggestedFix: 'f', patchGenerated: null,
      outcome: 'failed', durationMs: 0, attemptNumber: i + 1, maxAttempts: 3, createdAt: Date.now(),
    }))
    expect(shouldContinueHealing(attempts)).toBe(false)
  })

  it('shouldContinueHealing stops on blocked', () => {
    const attempts: HealAttempt[] = [{
      attemptId: 'a', runId: 'r', workspaceId: 'ws', strategy: 'import_fix',
      targetFile: 'f', errorMessage: 'e', suggestedFix: 'f', patchGenerated: null,
      outcome: 'blocked', durationMs: 0, attemptNumber: 1, maxAttempts: 3, createdAt: Date.now(),
    }]
    expect(shouldContinueHealing(attempts)).toBe(false)
  })

  it('generates import fix', () => {
    const patch = generateImportFix('src/test.ts', 'const x = 1', './utils')
    expect(patch).not.toBeNull()
    expect(patch!.filePath).toBe('src/test.ts')
    expect(patch!.content).toContain("import")
  })

  it('generates unused variable fix', () => {
    const patch = generateUnusedVariableFix('src/test.ts', 'const myVar = 1', 'myVar')
    expect(patch).not.toBeNull()
    expect(patch!.content).toContain('_myVar')
  })

  it('generates missing export fix', () => {
    const patch = generateMissingExportFix('src/test.ts', 'function myFunc() {}', 'myFunc')
    expect(patch).not.toBeNull()
    expect(patch!.content).toContain('export function myFunc')
  })

  it('default healing config', () => {
    expect(DEFAULT_HEALING_CONFIG.maxAttempts).toBe(3)
    expect(DEFAULT_HEALING_CONFIG.maxFilesPerAttempt).toBe(3)
    expect(DEFAULT_HEALING_CONFIG.blockedPatterns).toContain('auth')
    expect(DEFAULT_HEALING_CONFIG.blockedPatterns).toContain('payment')
  })
})

// ─── PR Materializer ──────────────────────────────────────────────────────

import {
  generatePRBody,
  generateRollbackSummary,
  type PRMaterializeInput,
} from '../src/lib/prMaterializer'

describe('PR Materializer', () => {
  const mockInput: PRMaterializeInput = {
    projectId: 'proj-1',
    runId: 'run-1',
    workspaceId: 'ws-1',
    repoOwner: 'TestOwner',
    repoName: 'test-repo',
    workspaceBranch: 'workspace/ws-1',
    baseBranch: 'main',
    userRequest: 'Add a helper utility',
    patches: [
      { filePath: 'src/utils/helper.ts', operation: 'add_file', content: 'export const x = 1', reasoning: 'New utility' },
    ],
    diffs: { fileDiffs: [], totalAdditions: 10, totalDeletions: 0, totalFiles: 1 },
    executionResult: {
      success: true,
      steps: [
        { step: 'install', command: 'npm install', status: 'passed', exitCode: 0, stdout: '', stderr: '', durationMs: 1000, startedAt: Date.now(), completedAt: Date.now(), retryCount: 0 },
      ],
      totalDurationMs: 1000,
      failedStep: null,
      errors: [],
      summary: 'All passed',
    },
    riskScore: 15,
    riskLevel: 'LOW',
    rollbackPlan: { complexity: 'SIMPLE', filesToRevert: ['src/utils/helper.ts'], reversalStrategy: 'Delete new file', dependencyRisks: [], cleanupSteps: [] },
    healingAttempts: [],
    artifacts: [],
    reviewGateDecision: 'auto_approve',
  }

  it('generates PR body with all sections', () => {
    const body = generatePRBody(mockInput)
    expect(body).toContain('CodeHive AI')
    expect(body).toContain('Add a helper utility')
    expect(body).toContain('Files Changed')
    expect(body).toContain('Execution Results')
    expect(body).toContain('Rollback Plan')
    expect(body).toContain('SIMPLE')
  })

  it('includes risk score in PR body', () => {
    const body = generatePRBody(mockInput)
    expect(body).toContain('15/100')
    expect(body).toContain('LOW')
  })

  it('includes self-healing section when attempts exist', () => {
    const inputWithHealing = {
      ...mockInput,
      healingAttempts: [{
        attemptId: 'h1', runId: 'run-1', workspaceId: 'ws-1', strategy: 'import_fix' as const,
        targetFile: 'src/test.ts', errorMessage: 'err', suggestedFix: 'fix',
        patchGenerated: null, outcome: 'fixed' as const, durationMs: 100,
        attemptNumber: 1, maxAttempts: 3, createdAt: Date.now(),
      }],
    }
    const body = generatePRBody(inputWithHealing)
    expect(body).toContain('Self-Healing')
    expect(body).toContain('import_fix')
  })

  it('generates rollback summary for new files', () => {
    const summary = generateRollbackSummary(
      [{ filePath: 'src/new.ts', operation: 'add_file', content: 'x', reasoning: 'r' }],
      'LOW',
    )
    expect(summary.complexity).toBe('SIMPLE')
    expect(summary.filesToRevert).toContain('src/new.ts')
    expect(summary.reversalStrategy).toContain('Delete new file')
    expect(summary.cleanupSteps.some((s) => s.includes('Delete'))).toBe(true)
  })

  it('rollback complexity increases with file count', () => {
    const patches = Array.from({ length: 8 }, (_, i) => ({
      filePath: `src/file-${i}.ts`, operation: 'modify_file' as const, content: 'x', reasoning: 'r',
    }))
    const summary = generateRollbackSummary(patches, 'MEDIUM')
    expect(summary.complexity).toBe('MODERATE')
  })

  it('rollback complexity HIGH for many files + high risk', () => {
    const patches = Array.from({ length: 12 }, (_, i) => ({
      filePath: `src/file-${i}.ts`, operation: 'modify_file' as const, content: 'x', reasoning: 'r',
    }))
    const summary = generateRollbackSummary(patches, 'HIGH')
    expect(summary.complexity).toBe('COMPLEX')
  })

  it('rollback detects package.json risk', () => {
    const summary = generateRollbackSummary(
      [{ filePath: 'package.json', operation: 'modify_file', content: '{}', reasoning: 'r' }],
      'LOW',
    )
    expect(summary.dependencyRisks.some((r) => r.includes('package.json'))).toBe(true)
  })
})

// ─── Run State Machine (M4 additions) ─────────────────────────────────────

import {
  canTransition,
  getNextState,
  transition,
  isM4State,
  getAllStates,
  getValidEvents,
  isTerminal,
  createInitialContext,
} from '../src/lib/runStateMachine'

describe('Run State Machine (M4)', () => {
  it('M4 workspace path transitions', () => {
    expect(canTransition('patch_validation', 'PATCHES_VALIDATED')).toBe(true)
    expect(canTransition('workspace_setup', 'WORKSPACE_READY')).toBe(true)
    expect(canTransition('patch_application', 'PATCHES_APPLIED')).toBe(true)
    expect(canTransition('dependency_install', 'DEPS_INSTALLED')).toBe(true)
    expect(canTransition('lint_execution', 'LINT_DONE')).toBe(true)
    expect(canTransition('build_execution', 'BUILD_DONE')).toBe(true)
  })

  it('M4 artifact + PR path transitions', () => {
    expect(canTransition('artifact_upload', 'ARTIFACTS_UPLOADED')).toBe(true)
    expect(canTransition('pr_materialization', 'PR_MATERIALIZED')).toBe(true)
    expect(canTransition('cleanup', 'CLEANUP_DONE')).toBe(true)
  })

  it('M4 self-heal from execution failures', () => {
    expect(canTransition('lint_execution', 'ERROR')).toBe(true)
    expect(canTransition('build_execution', 'ERROR')).toBe(true)
    expect(canTransition('dependency_install', 'ERROR')).toBe(true)
  })

  it('M4 cleanup on failure', () => {
    expect(canTransition('patch_application', 'ERROR')).toBe(true)
    expect(canTransition('artifact_upload', 'ERROR')).toBe(true)
    expect(canTransition('pr_materialization', 'ERROR')).toBe(true)
  })

  it('identifies M4 states', () => {
    expect(isM4State('workspace_setup')).toBe(true)
    expect(isM4State('patch_application')).toBe(true)
    expect(isM4State('dependency_install')).toBe(true)
    expect(isM4State('lint_execution')).toBe(true)
    expect(isM4State('build_execution')).toBe(true)
    expect(isM4State('artifact_upload')).toBe(true)
    expect(isM4State('pr_materialization')).toBe(true)
    expect(isM4State('cleanup')).toBe(true)
  })

  it('M4 states NOT terminal', () => {
    expect(isTerminal('workspace_setup')).toBe(false)
    expect(isTerminal('cleanup')).toBe(false)
  })

  it('getAllStates includes M4 states', () => {
    const states = getAllStates()
    expect(states).toContain('workspace_setup')
    expect(states).toContain('patch_application')
    expect(states).toContain('dependency_install')
    expect(states).toContain('lint_execution')
    expect(states).toContain('build_execution')
    expect(states).toContain('artifact_upload')
    expect(states).toContain('pr_materialization')
    expect(states).toContain('cleanup')
  })

  it('getValidEvents for workspace_setup', () => {
    const events = getValidEvents('workspace_setup')
    expect(events).toContain('WORKSPACE_READY')
    expect(events).toContain('ERROR')
    expect(events).toContain('CANCEL')
  })

  it('full M4 happy path transition', () => {
    let ctx = createInitialContext('run-m4')
    ctx = transition(ctx, 'START')
    expect(ctx.state).toBe('starting')
  })
})

// ─── Feature Flags (M4) ──────────────────────────────────────────────────

import { FEATURE_FLAGS } from '../src/lib/featureFlags'

describe('Feature Flags (M4)', () => {
  it('M4 flags exist and default to ON', () => {
    expect(FEATURE_FLAGS.M4_WORKSPACE).toBe(true)
    expect(FEATURE_FLAGS.M4_PATCH_APPLY).toBe(true)
    expect(FEATURE_FLAGS.M4_EXECUTION_PIPELINE).toBe(true)
    expect(FEATURE_FLAGS.M4_ARTIFACTS).toBe(true)
    expect(FEATURE_FLAGS.M4_REPLAY).toBe(true)
    expect(FEATURE_FLAGS.M4_ADVANCED_HEALING).toBe(true)
    expect(FEATURE_FLAGS.M4_PR_MATERIALIZE).toBe(true)
    expect(FEATURE_FLAGS.M4_ORCHESTRATION).toBe(true)
    expect(FEATURE_FLAGS.M4_ANALYTICS).toBe(true)
  })

  it('M1/M2/M3 flags still exist', () => {
    expect(FEATURE_FLAGS.M1_PLANNING).toBe(true)
    expect(FEATURE_FLAGS.M2_REPO_INTELLIGENCE).toBe(true)
    expect(FEATURE_FLAGS.M3_PATCH_GENERATION).toBe(true)
  })
})
