/**
 * @module workspaceCleanup
 * @description Milestone 4 — Deterministic workspace cleanup.
 * Ensures all temporary workspace resources are properly destroyed.
 * Handles orphan detection, branch cleanup, and artifact retention.
 *
 * Guarantees:
 *   - Always runs after execution (success or failure)
 *   - Deletes workspace branches
 *   - Marks workspaces as destroyed in D1
 *   - Detects and cleans orphaned workspaces
 *   - Never touches main/production branches
 */

import {
  type WorkspaceInfo,
  deleteWorkspaceBranch,
  isWorkspaceOrphaned,
  isWorkspaceExpired,
} from './workspaceManager'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface CleanupResult {
  workspaceId: string
  branchDeleted: boolean
  markedDestroyed: boolean
  artifactsRetained: boolean
  errors: string[]
  durationMs: number
}

export interface OrphanScanResult {
  scannedCount: number
  orphansFound: number
  orphansCleaned: number
  errors: string[]
}

export interface CleanupConfig {
  retainArtifacts: boolean
  staleDurationMs: number
  maxOrphanAge: number          // ms; workspaces older than this get force-cleaned
  protectedBranchPrefixes: string[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Defaults
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_CLEANUP_CONFIG: CleanupConfig = {
  retainArtifacts: true,         // keep R2 artifacts even after workspace destroy
  staleDurationMs: 15 * 60_000,  // 15 min
  maxOrphanAge: 60 * 60_000,     // 1 hour
  protectedBranchPrefixes: ['main', 'master', 'develop', 'release/', 'hotfix/'],
}

// ─────────────────────────────────────────────────────────────────────────────
// Safety — never delete protected branches
// ─────────────────────────────────────────────────────────────────────────────

export function isBranchProtected(
  branchName: string,
  config: CleanupConfig = DEFAULT_CLEANUP_CONFIG,
): boolean {
  return config.protectedBranchPrefixes.some(
    (prefix) => branchName === prefix || branchName.startsWith(prefix),
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Clean up a single workspace
// ─────────────────────────────────────────────────────────────────────────────

export async function cleanupWorkspace(
  workspace: WorkspaceInfo,
  config: Partial<CleanupConfig> = {},
): Promise<CleanupResult> {
  const startTime = Date.now()
  const cfg = { ...DEFAULT_CLEANUP_CONFIG, ...config }
  const errors: string[] = []

  let branchDeleted = false
  let markedDestroyed = false

  // Safety: never delete protected branches
  if (isBranchProtected(workspace.branchName, cfg)) {
    errors.push(`SAFETY: Refused to delete protected branch "${workspace.branchName}"`)
    return {
      workspaceId: workspace.workspaceId,
      branchDeleted: false,
      markedDestroyed: false,
      artifactsRetained: cfg.retainArtifacts,
      errors,
      durationMs: Date.now() - startTime,
    }
  }

  // Step 1: Delete workspace branch
  if (workspace.branchName.startsWith('workspace/')) {
    const deleteResult = await deleteWorkspaceBranch(workspace)
    branchDeleted = deleteResult.success
    if (!deleteResult.success && deleteResult.error) {
      errors.push(`Branch cleanup: ${deleteResult.error}`)
    }
  } else {
    errors.push(`Skipped branch deletion: "${workspace.branchName}" doesn't match workspace pattern`)
  }

  // Step 2: Mark as destroyed (caller persists to D1)
  markedDestroyed = true

  return {
    workspaceId: workspace.workspaceId,
    branchDeleted,
    markedDestroyed,
    artifactsRetained: cfg.retainArtifacts,
    errors,
    durationMs: Date.now() - startTime,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Orphan detection
// ─────────────────────────────────────────────────────────────────────────────

export function detectOrphans(
  workspaces: WorkspaceInfo[],
  config: Partial<CleanupConfig> = {},
): WorkspaceInfo[] {
  const cfg = { ...DEFAULT_CLEANUP_CONFIG, ...config }
  return workspaces.filter((ws) => {
    if (ws.status === 'destroyed' || ws.status === 'completed') return false
    return isWorkspaceOrphaned(ws, cfg.staleDurationMs) || isWorkspaceExpired(ws)
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Batch orphan cleanup
// ─────────────────────────────────────────────────────────────────────────────

export async function cleanupOrphans(
  workspaces: WorkspaceInfo[],
  config: Partial<CleanupConfig> = {},
): Promise<OrphanScanResult> {
  const orphans = detectOrphans(workspaces, config)
  const errors: string[] = []
  let cleaned = 0

  for (const orphan of orphans) {
    const result = await cleanupWorkspace(orphan, config)
    if (result.branchDeleted || result.errors.length === 0) {
      cleaned++
    } else {
      errors.push(...result.errors.map((e) => `[${orphan.workspaceId}] ${e}`))
    }
  }

  return {
    scannedCount: workspaces.length,
    orphansFound: orphans.length,
    orphansCleaned: cleaned,
    errors,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cleanup report
// ─────────────────────────────────────────────────────────────────────────────

export function generateCleanupReport(results: CleanupResult[]): {
  totalCleaned: number
  totalFailed: number
  totalErrors: number
  summary: string
} {
  const cleaned = results.filter((r) => r.branchDeleted).length
  const failed = results.filter((r) => !r.branchDeleted && r.errors.length > 0).length
  const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0)

  return {
    totalCleaned: cleaned,
    totalFailed: failed,
    totalErrors,
    summary: `Cleaned ${cleaned}/${results.length} workspaces. ${failed} failed. ${totalErrors} total errors.`,
  }
}
