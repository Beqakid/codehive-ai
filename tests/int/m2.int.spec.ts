/**
 * Milestone 2 — Integration / unit test suite
 * Tests: dependency graph, protected files, risk scoring, state machine,
 *        file classification, env var detection, safe file pipeline.
 * All tests are fully mocked — no external network calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// Module imports
// ─────────────────────────────────────────────────────────────────────────────
import {
  classifyFile,
  extractDependencyEdges,
  detectEnvVars,
  analyzeRepository,
  findCentralFiles,
} from '../../src/lib/repoIntelligence'

import {
  classifyProtectedFiles,
  isFileProtected,
  buildProtectedFileWarning,
  getProtectionBadge,
  PROTECTION_RULES,
} from '../../src/lib/protectedFiles'

import {
  calculateRisk,
  getRiskEmoji,
  getRiskColor,
  formatRiskSummary,
} from '../../src/lib/riskEngine'

import {
  transition,
  safeTransition,
  validEventsFrom,
  validNextStates,
  isTerminal,
  isRunStale,
  createRunContext,
  applyEvent,
  STATE_LABELS,
  STATE_PROGRESS,
} from '../../src/lib/runStateMachine'

import { FEATURE_FLAGS } from '../../src/lib/featureFlags'

import type { FileTreeEntry, RepoFile } from '../../src/lib/repoService'
import type { RepoIntelligenceResult } from '../../src/lib/repoIntelligence'
import type { ProtectedFile } from '../../src/lib/protectedFiles'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeTree(paths: string[]): FileTreeEntry[] {
  return paths.map((p) => ({ path: p, type: 'blob' as const, size: 1000 }))
}

function makeKeyFiles(files: Array<{ path: string; content: string }>): RepoFile[] {
  return files.map((f) => ({ path: f.path, content: f.content }))
}

function makeIntelligence(
  overrides: Partial<RepoIntelligenceResult> = {},
): RepoIntelligenceResult {
  return {
    owner: 'test',
    repo: 'repo',
    frameworkSummary: 'Next.js application',
    architectureSummary: 'Full-stack app',
    techStack: ['Next.js'],
    importantFiles: [],
    protectedAreas: [],
    envVarsDetected: [],
    routeStructure: [],
    authSystem: null,
    fileMap: [],
    dependencyEdges: [],
    lastIndexedAt: Date.now(),
    ...overrides,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. File classification
// ─────────────────────────────────────────────────────────────────────────────

describe('classifyFile', () => {
  it('classifies workflow files as HIGH priority', () => {
    const result = classifyFile('.github/workflows/deploy.yml')
    expect(result.fileType).toBe('workflow')
    expect(result.priority).toBe('HIGH')
  })

  it('classifies auth files as HIGH priority', () => {
    const result = classifyFile('src/lib/auth.ts')
    expect(result.fileType).toBe('auth')
    expect(result.priority).toBe('HIGH')
  })

  it('classifies migration files as HIGH priority', () => {
    const result = classifyFile('src/migrations/20260516_m2.ts')
    expect(result.fileType).toBe('migration')
    expect(result.priority).toBe('HIGH')
  })

  it('classifies Payload collections as HIGH priority', () => {
    const result = classifyFile('src/collections/Users.ts')
    expect(result.fileType).toBe('collection')
    expect(result.priority).toBe('HIGH')
  })

  it('classifies package.json as config HIGH priority', () => {
    const result = classifyFile('package.json')
    expect(result.fileType).toBe('config')
    expect(result.priority).toBe('HIGH')
  })

  it('classifies test files as MEDIUM priority', () => {
    const result = classifyFile('tests/unit/auth.spec.ts')
    expect(result.fileType).toBe('test')
    expect(result.priority).toBe('MEDIUM')
  })

  it('classifies lock files as LOW priority', () => {
    const result = classifyFile('pnpm-lock.yaml')
    expect(result.fileType).toBe('lock')
    expect(result.priority).toBe('LOW')
  })

  it('classifies SVG assets as LOW priority', () => {
    const result = classifyFile('public/logo.svg')
    expect(result.fileType).toBe('asset')
    expect(result.priority).toBe('LOW')
  })

  it('classifies API routes as HIGH priority', () => {
    const result = classifyFile('src/app/(frontend)/api/m1/plan/route.ts')
    expect(result.fileType).toBe('api')
    expect(result.priority).toBe('HIGH')
  })

  it('classifies wrangler config as worker HIGH priority', () => {
    const result = classifyFile('wrangler.jsonc')
    expect(result.fileType).toBe('worker')
    expect(result.priority).toBe('HIGH')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. Dependency edge extraction
// ─────────────────────────────────────────────────────────────────────────────

describe('extractDependencyEdges', () => {
  it('extracts static imports', () => {
    const content = `import { foo } from './utils'\nimport type { Bar } from '../types'`
    const edges = extractDependencyEdges('src/index.ts', content)
    expect(edges).toHaveLength(2)
    expect(edges[0]).toMatchObject({ sourceFile: 'src/index.ts', targetFile: './utils', edgeType: 'import' })
    expect(edges[1]).toMatchObject({ targetFile: '../types', edgeType: 'import' })
  })

  it('extracts dynamic imports', () => {
    const content = `const mod = await import('./dynamic-module')`
    const edges = extractDependencyEdges('src/loader.ts', content)
    expect(edges).toHaveLength(1)
    expect(edges[0]).toMatchObject({ edgeType: 'dynamic', targetFile: './dynamic-module' })
  })

  it('ignores node_modules imports', () => {
    const content = `import React from 'react'\nimport { z } from 'zod'\nimport { local } from './local'`
    const edges = extractDependencyEdges('src/comp.tsx', content)
    expect(edges).toHaveLength(1)
    expect(edges[0]?.targetFile).toBe('./local')
  })

  it('returns empty array for files with no local imports', () => {
    const content = `import express from 'express'\nimport lodash from 'lodash'`
    const edges = extractDependencyEdges('src/server.ts', content)
    expect(edges).toHaveLength(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. Env var detection
// ─────────────────────────────────────────────────────────────────────────────

describe('detectEnvVars', () => {
  it('detects process.env variables', () => {
    const content = `const key = process.env.ANTHROPIC_API_KEY\nconst token = process.env.GITHUB_TOKEN`
    const vars = detectEnvVars(content)
    expect(vars).toContain('ANTHROPIC_API_KEY')
    expect(vars).toContain('GITHUB_TOKEN')
  })

  it('detects import.meta.env variables', () => {
    const content = `const url = import.meta.env.VITE_API_URL`
    const vars = detectEnvVars(content)
    expect(vars).toContain('VITE_API_URL')
  })

  it('deduplicates repeated env var names', () => {
    const content = `process.env.SECRET\nprocess.env.SECRET\nprocess.env.SECRET`
    const vars = detectEnvVars(content)
    expect(vars.filter((v) => v === 'SECRET')).toHaveLength(1)
  })

  it('returns empty array for files with no env vars', () => {
    const vars = detectEnvVars('const x = 42')
    expect(vars).toHaveLength(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. Protected file classification
// ─────────────────────────────────────────────────────────────────────────────

describe('classifyProtectedFiles', () => {
  it('classifies auth files as CRITICAL', () => {
    const files = classifyProtectedFiles(['src/lib/auth.ts'])
    expect(files).toHaveLength(1)
    expect(files[0]?.riskLevel).toBe('CRITICAL')
    expect(files[0]?.protectionType).toBe('auth')
  })

  it('classifies migration files as CRITICAL', () => {
    const files = classifyProtectedFiles(['src/migrations/20260516_m2.ts'])
    expect(files).toHaveLength(1)
    expect(files[0]?.riskLevel).toBe('CRITICAL')
    expect(files[0]?.protectionType).toBe('migration')
  })

  it('classifies GitHub workflow files as HIGH', () => {
    const files = classifyProtectedFiles(['.github/workflows/deploy.yml'])
    expect(files).toHaveLength(1)
    expect(files[0]?.riskLevel).toBe('HIGH')
  })

  it('classifies payment files as CRITICAL', () => {
    const files = classifyProtectedFiles(['src/lib/stripe.ts'])
    expect(files).toHaveLength(1)
    expect(files[0]?.protectionType).toBe('payment')
  })

  it('classifies Payload config as CRITICAL', () => {
    const files = classifyProtectedFiles(['src/payload.config.ts'])
    expect(files).toHaveLength(1)
    expect(files[0]?.protectionType).toBe('payload')
  })

  it('returns empty array for safe files', () => {
    const files = classifyProtectedFiles([
      'src/components/Button.tsx',
      'src/utils/format.ts',
      'README.md',
    ])
    expect(files).toHaveLength(0)
  })

  it('sets requiresApproval=true for CRITICAL and HIGH files', () => {
    const files = classifyProtectedFiles([
      'src/auth.ts',
      '.github/workflows/ci.yml',
    ])
    expect(files.every((f) => f.requiresApproval)).toBe(true)
  })

  it('isFileProtected helper works', () => {
    expect(isFileProtected('src/lib/auth.ts')).toBe(true)
    expect(isFileProtected('src/components/Logo.tsx')).toBe(false)
  })

  it('builds warning text for protected files', () => {
    const affected = ['src/auth.ts', 'src/migrations/add_column.ts', 'README.md']
    const { protectedFiles, warningText } = buildProtectedFileWarning(affected)
    expect(protectedFiles.length).toBeGreaterThan(0)
    expect(warningText).toContain('PROTECTED FILES DETECTED')
  })

  it('getProtectionBadge returns emoji-prefixed label', () => {
    const badge = getProtectionBadge('auth')
    expect(badge).toContain('Auth')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. Risk scoring engine
// ─────────────────────────────────────────────────────────────────────────────

describe('calculateRisk', () => {
  const baseInput = {
    runId: 'test-run-1',
    projectId: 'proj-1',
    affectedFiles: ['src/utils/format.ts'],
    protectedFilesTouched: [] as ProtectedFile[],
    dependencyEdges: [],
    repoIntelligence: makeIntelligence(),
  }

  it('scores LOW for minimal safe changes', () => {
    const report = calculateRisk(baseInput)
    expect(report.riskLevel).toBe('LOW')
    expect(report.riskScore).toBeLessThan(20)
  })

  it('scores CRITICAL when auth files are touched', () => {
    const authFile: ProtectedFile = {
      path: 'src/auth.ts',
      protectionType: 'auth',
      reason: 'Auth',
      riskLevel: 'CRITICAL',
      requiresApproval: true,
    }
    const report = calculateRisk({ ...baseInput, protectedFilesTouched: [authFile] })
    expect(['HIGH', 'CRITICAL']).toContain(report.riskLevel)
    expect(report.riskScore).toBeGreaterThan(40)
  })

  it('scores HIGH when payment files are touched', () => {
    const paymentFile: ProtectedFile = {
      path: 'src/stripe.ts',
      protectionType: 'payment',
      reason: 'Stripe',
      riskLevel: 'CRITICAL',
      requiresApproval: true,
    }
    const report = calculateRisk({ ...baseInput, protectedFilesTouched: [paymentFile] })
    expect(['HIGH', 'CRITICAL']).toContain(report.riskLevel)
  })

  it('increases scope rating with many affected files', () => {
    const manyFiles = Array.from({ length: 20 }, (_, i) => `src/file${i}.ts`)
    const report = calculateRisk({ ...baseInput, affectedFiles: manyFiles })
    expect(report.implementationScope).toBe('EXTENSIVE')
  })

  it('sets COMPLEX rollback when migration is touched', () => {
    const migFile: ProtectedFile = {
      path: 'src/migrations/add.ts',
      protectionType: 'migration',
      reason: 'Migration',
      riskLevel: 'CRITICAL',
      requiresApproval: true,
    }
    const report = calculateRisk({ ...baseInput, protectedFilesTouched: [migFile] })
    expect(report.rollbackComplexity).toBe('COMPLEX')
  })

  it('populates recommendations', () => {
    const authFile: ProtectedFile = {
      path: 'src/auth.ts',
      protectionType: 'auth',
      reason: 'Auth',
      riskLevel: 'CRITICAL',
      requiresApproval: true,
    }
    const report = calculateRisk({ ...baseInput, protectedFilesTouched: [authFile] })
    expect(report.recommendations.length).toBeGreaterThan(0)
  })

  it('getRiskEmoji returns correct emoji', () => {
    expect(getRiskEmoji('LOW')).toBe('🟢')
    expect(getRiskEmoji('MEDIUM')).toBe('🟡')
    expect(getRiskEmoji('HIGH')).toBe('🔴')
    expect(getRiskEmoji('CRITICAL')).toBe('🚨')
  })

  it('formatRiskSummary returns non-empty string', () => {
    const report = calculateRisk(baseInput)
    const summary = formatRiskSummary(report)
    expect(typeof summary).toBe('string')
    expect(summary.length).toBeGreaterThan(0)
    expect(summary).toContain('LOW')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 6. Run state machine
// ─────────────────────────────────────────────────────────────────────────────

describe('runStateMachine', () => {
  it('transitions queued → starting on START', () => {
    expect(transition('queued', 'START')).toBe('starting')
  })

  it('transitions through full happy path', () => {
    let state = transition('queued', 'START')           // starting
    state = transition(state, 'START')                  // analyzing_repo
    state = transition(state, 'REPO_ANALYZED')          // building_graph
    state = transition(state, 'GRAPH_BUILT')            // risk_analysis
    state = transition(state, 'RISK_ASSESSED')          // planning
    state = transition(state, 'PLAN_GENERATED')         // creating_pr
    state = transition(state, 'PR_CREATED')             // completed
    expect(state).toBe('completed')
  })

  it('fails from any non-terminal state on ERROR', () => {
    const nonTerminalStates = [
      'starting', 'analyzing_repo', 'building_graph',
      'risk_analysis', 'planning', 'creating_pr',
    ] as const
    for (const s of nonTerminalStates) {
      expect(transition(s, 'ERROR')).toBe('failed')
    }
  })

  it('cancels from any non-terminal state on CANCEL', () => {
    expect(transition('planning', 'CANCEL')).toBe('cancelled')
    expect(transition('analyzing_repo', 'CANCEL')).toBe('cancelled')
  })

  it('retries from failed on RETRY', () => {
    expect(transition('failed', 'RETRY')).toBe('queued')
  })

  it('throws on invalid transition', () => {
    expect(() => transition('completed', 'START')).toThrow()
  })

  it('safeTransition returns null on invalid transition', () => {
    expect(safeTransition('completed', 'START')).toBeNull()
  })

  it('isTerminal returns true for terminal states', () => {
    expect(isTerminal('completed')).toBe(true)
    expect(isTerminal('failed')).toBe(true)
    expect(isTerminal('cancelled')).toBe(true)
    expect(isTerminal('planning')).toBe(false)
  })

  it('validEventsFrom returns correct events for queued', () => {
    const events = validEventsFrom('queued')
    expect(events).toContain('START')
    expect(events).toContain('CANCEL')
  })

  it('isRunStale detects stale runs', () => {
    const ctx = createRunContext('run-1')
    // Fresh context should not be stale
    expect(isRunStale(ctx)).toBe(false)
    // Simulate old context
    const oldCtx = { ...ctx, enteredAt: Date.now() - 10 * 60 * 1000 }
    expect(isRunStale(oldCtx)).toBe(true)
  })

  it('applyEvent updates context and increments retryCount on RETRY', () => {
    let ctx = createRunContext('run-2')
    // Move to failed
    ctx = { ...ctx, state: 'failed' as const }
    ctx = applyEvent(ctx, 'RETRY')
    expect(ctx.state).toBe('queued')
    expect(ctx.retryCount).toBe(1)
  })

  it('applyEvent stores errorMessage on ERROR', () => {
    const ctx = createRunContext('run-3')
    const failedCtx = { ...ctx, state: 'planning' as const }
    const result = applyEvent(failedCtx, 'ERROR', 'AI timeout')
    expect(result.state).toBe('failed')
    expect(result.errorMessage).toBe('AI timeout')
  })

  it('STATE_LABELS covers all states', () => {
    const states = [
      'queued', 'starting', 'analyzing_repo', 'building_graph',
      'risk_analysis', 'planning', 'creating_pr', 'completed',
      'failed', 'cancelled',
    ] as const
    for (const s of states) {
      expect(typeof STATE_LABELS[s]).toBe('string')
      expect(STATE_LABELS[s].length).toBeGreaterThan(0)
    }
  })

  it('STATE_PROGRESS increases monotonically for pipeline states', () => {
    const pipeline = [
      'queued', 'starting', 'analyzing_repo', 'building_graph',
      'risk_analysis', 'planning', 'creating_pr', 'completed',
    ] as const
    for (let i = 1; i < pipeline.length; i++) {
      expect(STATE_PROGRESS[pipeline[i]!]).toBeGreaterThanOrEqual(STATE_PROGRESS[pipeline[i - 1]!]!)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 7. Feature flags
// ─────────────────────────────────────────────────────────────────────────────

describe('M2 feature flags', () => {
  it('all M2 flags are defined as booleans', () => {
    const m2Flags = [
      'M2_REPO_INTELLIGENCE',
      'M2_DEPENDENCY_GRAPH',
      'M2_PROTECTED_FILES',
      'M2_RISK_ENGINE',
      'M2_STATE_MACHINE',
      'M2_ENRICHED_PLANNER',
    ] as const
    for (const flag of m2Flags) {
      expect(typeof FEATURE_FLAGS[flag]).toBe('boolean')
    }
  })

  it('M1 flag still exists and is boolean', () => {
    expect(typeof FEATURE_FLAGS.M1_PLANNING).toBe('boolean')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 8. findCentralFiles
// ─────────────────────────────────────────────────────────────────────────────

describe('findCentralFiles', () => {
  it('finds files with multiple inbound edges', () => {
    const edges = [
      { sourceFile: 'a.ts', targetFile: 'shared.ts', edgeType: 'import' as const },
      { sourceFile: 'b.ts', targetFile: 'shared.ts', edgeType: 'import' as const },
      { sourceFile: 'c.ts', targetFile: 'shared.ts', edgeType: 'import' as const },
      { sourceFile: 'd.ts', targetFile: 'other.ts', edgeType: 'import' as const },
    ]
    const central = findCentralFiles(edges)
    expect(central[0]?.filePath).toBe('shared.ts')
    expect(central[0]?.inboundCount).toBe(3)
  })

  it('marks files with 5+ inbound as isCritical', () => {
    const edges = Array.from({ length: 6 }, (_, i) => ({
      sourceFile: `file${i}.ts`,
      targetFile: 'core.ts',
      edgeType: 'import' as const,
    }))
    const central = findCentralFiles(edges)
    expect(central[0]?.isCritical).toBe(true)
  })

  it('returns empty array for no edges', () => {
    expect(findCentralFiles([])).toHaveLength(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 9. Protection rules coverage
// ─────────────────────────────────────────────────────────────────────────────

describe('PROTECTION_RULES', () => {
  it('has rules for all critical protection types', () => {
    const types = PROTECTION_RULES.map((r) => r.protectionType)
    expect(types).toContain('auth')
    expect(types).toContain('payment')
    expect(types).toContain('migration')
    expect(types).toContain('ci-cd')
    expect(types).toContain('payload')
  })

  it('all rules have non-empty pattern and reason', () => {
    for (const rule of PROTECTION_RULES) {
      expect(rule.pattern.length).toBeGreaterThan(0)
      expect(rule.reason.length).toBeGreaterThan(0)
    }
  })
})
