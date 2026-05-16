/**
 * @module workspaceManager
 * @description Milestone 4 — Isolated workspace system.
 * Creates temporary cloned workspaces for safe patch application + execution.
 * Abstracts sandbox provider (GitHub-based for now, future-ready for E2B,
 * Cloudflare Sandboxes, Docker, Firecracker).
 *
 * Workspace lifecycle:
 *   1. create → clone repo into isolated branch
 *   2. apply patches
 *   3. execute validation pipeline
 *   4. capture outputs
 *   5. destroy workspace
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type WorkspaceProvider = 'github' | 'e2b' | 'cloudflare_sandbox' | 'docker' | 'local_mock'

export type WorkspaceStatus =
  | 'creating'
  | 'ready'
  | 'patching'
  | 'executing'
  | 'completed'
  | 'failed'
  | 'cleaning_up'
  | 'destroyed'
  | 'timed_out'
  | 'orphaned'

export interface WorkspaceConfig {
  provider: WorkspaceProvider
  repoOwner: string
  repoName: string
  baseBranch: string
  timeoutMs: number
  maxSizeMB: number
  enableHeartbeat: boolean
  heartbeatIntervalMs: number
}

export interface WorkspaceInfo {
  workspaceId: string
  projectId: string
  runId: string
  provider: WorkspaceProvider
  status: WorkspaceStatus
  branchName: string
  repoOwner: string
  repoName: string
  baseBranch: string
  createdAt: number
  lastHeartbeat: number
  expiresAt: number
  fileCount: number
  metadata: Record<string, unknown>
}

export interface WorkspaceCreateInput {
  projectId: string
  runId: string
  repoOwner: string
  repoName: string
  baseBranch?: string
  config?: Partial<WorkspaceConfig>
}

export interface WorkspaceCreateResult {
  success: boolean
  workspace: WorkspaceInfo | null
  error?: string
  durationMs: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Defaults
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_WORKSPACE_CONFIG: WorkspaceConfig = {
  provider: 'github',
  repoOwner: '',
  repoName: '',
  baseBranch: 'main',
  timeoutMs: 10 * 60 * 1000,   // 10 minutes
  maxSizeMB: 500,               // 500 MB max workspace
  enableHeartbeat: true,
  heartbeatIntervalMs: 30_000,   // 30 seconds
}

const WORKSPACE_PREFIX = 'codehive-ws'

// ─────────────────────────────────────────────────────────────────────────────
// Workspace ID generation
// ─────────────────────────────────────────────────────────────────────────────

export function generateWorkspaceId(runId: string): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 8)
  return `${WORKSPACE_PREFIX}-${runId.substring(0, 8)}-${timestamp}-${random}`
}

export function generateWorkspaceBranch(workspaceId: string): string {
  return `workspace/${workspaceId}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Create workspace (GitHub provider)
// ─────────────────────────────────────────────────────────────────────────────

export async function createWorkspace(
  input: WorkspaceCreateInput,
): Promise<WorkspaceCreateResult> {
  const startTime = Date.now()
  const config = { ...DEFAULT_WORKSPACE_CONFIG, ...input.config }

  const workspaceId = generateWorkspaceId(input.runId)
  const branchName = generateWorkspaceBranch(workspaceId)

  try {
    // Step 1: Get base branch SHA
    const token = process.env.GITHUB_TOKEN
    if (!token) throw new Error('GITHUB_TOKEN not configured')

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'codehive-ai/4.0',
    }

    const baseBranch = input.baseBranch || config.baseBranch
    const refResp = await fetch(
      `https://api.github.com/repos/${input.repoOwner}/${input.repoName}/git/ref/heads/${baseBranch}`,
      { headers },
    )
    if (!refResp.ok) {
      throw new Error(`Failed to get base branch SHA (${refResp.status})`)
    }
    const refData = (await refResp.json()) as { object: { sha: string } }
    const baseSha = refData.object.sha

    // Step 2: Create workspace branch
    const createResp = await fetch(
      `https://api.github.com/repos/${input.repoOwner}/${input.repoName}/git/refs`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: baseSha }),
      },
    )
    if (!createResp.ok) {
      const errBody = await createResp.text().catch(() => 'unknown')
      throw new Error(`Failed to create workspace branch (${createResp.status}): ${errBody.slice(0, 200)}`)
    }

    const now = Date.now()
    const workspace: WorkspaceInfo = {
      workspaceId,
      projectId: input.projectId,
      runId: input.runId,
      provider: config.provider,
      status: 'ready',
      branchName,
      repoOwner: input.repoOwner,
      repoName: input.repoName,
      baseBranch,
      createdAt: now,
      lastHeartbeat: now,
      expiresAt: now + config.timeoutMs,
      fileCount: 0,
      metadata: { baseSha },
    }

    return {
      success: true,
      workspace,
      durationMs: Date.now() - startTime,
    }
  } catch (err) {
    return {
      success: false,
      workspace: null,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - startTime,
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Workspace status checks
// ─────────────────────────────────────────────────────────────────────────────

export function isWorkspaceExpired(workspace: WorkspaceInfo): boolean {
  return Date.now() > workspace.expiresAt
}

export function isWorkspaceActive(workspace: WorkspaceInfo): boolean {
  return ['ready', 'patching', 'executing'].includes(workspace.status)
}

export function isWorkspaceOrphaned(
  workspace: WorkspaceInfo,
  staleDurationMs: number = 15 * 60 * 1000,
): boolean {
  const stale = Date.now() - workspace.lastHeartbeat > staleDurationMs
  return stale && isWorkspaceActive(workspace)
}

export function updateHeartbeat(workspace: WorkspaceInfo): WorkspaceInfo {
  return { ...workspace, lastHeartbeat: Date.now() }
}

export function transitionWorkspace(
  workspace: WorkspaceInfo,
  status: WorkspaceStatus,
): WorkspaceInfo {
  return { ...workspace, status, lastHeartbeat: Date.now() }
}

// ─────────────────────────────────────────────────────────────────────────────
// Workspace branch deletion (cleanup)
// ─────────────────────────────────────────────────────────────────────────────

export async function deleteWorkspaceBranch(
  workspace: WorkspaceInfo,
): Promise<{ success: boolean; error?: string }> {
  try {
    const token = process.env.GITHUB_TOKEN
    if (!token) throw new Error('GITHUB_TOKEN not configured')

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'codehive-ai/4.0',
    }

    const resp = await fetch(
      `https://api.github.com/repos/${workspace.repoOwner}/${workspace.repoName}/git/refs/heads/${workspace.branchName}`,
      { method: 'DELETE', headers },
    )

    if (!resp.ok && resp.status !== 422) {
      // 422 = ref already deleted, which is fine
      throw new Error(`Failed to delete branch (${resp.status})`)
    }

    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}
