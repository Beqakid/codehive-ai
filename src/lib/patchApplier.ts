/**
 * @module patchApplier
 * @description Milestone 4 — Patch application engine.
 * Applies generated patches to REAL files in workspace branches via GitHub API.
 * Validates before write, supports atomic batch commits, preserves formatting,
 * rejects blocked/malformed diffs, and stores pre/post snapshots.
 *
 * Safety:
 *   - Never writes to main/master/production branches
 *   - Validates all file paths against blocked list
 *   - Atomic: all-or-nothing commit
 *   - Stores pre-patch snapshot for rollback
 */

import type { PatchFile } from './patchEngine'
import { isFilePathAllowed } from './codeGenerationRules'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface PatchApplyInput {
  workspace: {
    workspaceId: string
    repoOwner: string
    repoName: string
    branchName: string
  }
  patches: PatchFile[]
  commitMessage: string
  runId: string
}

export interface FileSnapshot {
  filePath: string
  contentBefore: string | null   // null = new file
  contentAfter: string
  operation: string
}

export interface PatchApplyResult {
  success: boolean
  appliedFiles: string[]
  rejectedFiles: { path: string; reason: string }[]
  snapshots: FileSnapshot[]
  commitSha: string | null
  errors: string[]
  durationMs: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Safety
// ─────────────────────────────────────────────────────────────────────────────

const PROTECTED_BRANCHES = ['main', 'master', 'develop', 'production']

export function isBranchSafeForWrite(branchName: string): boolean {
  return !PROTECTED_BRANCHES.includes(branchName) && branchName.startsWith('workspace/')
}

// ─────────────────────────────────────────────────────────────────────────────
// GitHub helpers
// ─────────────────────────────────────────────────────────────────────────────

function githubHeaders(): Record<string, string> {
  const token = process.env.GITHUB_TOKEN
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
    'User-Agent': 'codehive-ai/4.0',
  }
}

async function getFileContent(
  owner: string,
  repo: string,
  path: string,
  branch: string,
): Promise<{ content: string; sha: string } | null> {
  const headers = githubHeaders()
  const resp = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`,
    { headers },
  )
  if (!resp.ok) return null
  const data = (await resp.json()) as { content?: string; sha: string }
  if (!data.content) return null
  const decoded = atob(data.content.replace(/\n/g, ''))
  return { content: decoded, sha: data.sha }
}

function toBase64(str: string): string {
  try {
    return btoa(unescape(encodeURIComponent(str)))
  } catch {
    return btoa(str)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Apply patches via GitHub tree API (atomic commit)
// ─────────────────────────────────────────────────────────────────────────────

export async function applyPatches(input: PatchApplyInput): Promise<PatchApplyResult> {
  const startTime = Date.now()
  const errors: string[] = []
  const appliedFiles: string[] = []
  const rejectedFiles: { path: string; reason: string }[] = []
  const snapshots: FileSnapshot[] = []

  const { workspace, patches, commitMessage } = input

  // Safety: refuse to write to protected branches
  if (!isBranchSafeForWrite(workspace.branchName)) {
    return {
      success: false,
      appliedFiles: [],
      rejectedFiles: patches.map((p) => ({ path: p.filePath, reason: 'Protected branch' })),
      snapshots: [],
      commitSha: null,
      errors: [`SAFETY: Cannot write to branch "${workspace.branchName}"`],
      durationMs: Date.now() - startTime,
    }
  }

  // Validate all file paths first
  const validPatches: PatchFile[] = []
  for (const patch of patches) {
    const pathCheck = isFilePathAllowed(patch.filePath)
    if (!pathCheck.allowed) {
      rejectedFiles.push({ path: patch.filePath, reason: pathCheck.reason || 'Blocked path' })
      continue
    }
    validPatches.push(patch)
  }

  if (validPatches.length === 0) {
    return {
      success: false,
      appliedFiles: [],
      rejectedFiles,
      snapshots: [],
      commitSha: null,
      errors: ['All patches were rejected — no files to apply'],
      durationMs: Date.now() - startTime,
    }
  }

  try {
    const headers = githubHeaders()
    const { repoOwner, repoName, branchName } = workspace

    // Get current branch HEAD
    const refResp = await fetch(
      `https://api.github.com/repos/${repoOwner}/${repoName}/git/ref/heads/${branchName}`,
      { headers },
    )
    if (!refResp.ok) {
      throw new Error(`Failed to get branch ref (${refResp.status})`)
    }
    const refData = (await refResp.json()) as { object: { sha: string } }
    const baseSha = refData.object.sha

    // Get base tree
    const commitResp = await fetch(
      `https://api.github.com/repos/${repoOwner}/${repoName}/git/commits/${baseSha}`,
      { headers },
    )
    if (!commitResp.ok) {
      throw new Error(`Failed to get base commit (${commitResp.status})`)
    }
    const commitData = (await commitResp.json()) as { tree: { sha: string } }
    const baseTreeSha = commitData.tree.sha

    // Capture pre-patch snapshots and build tree entries
    const treeEntries: Array<{ path: string; mode: string; type: string; content: string }> = []

    for (const patch of validPatches) {
      // Get existing content for snapshot
      const existing = await getFileContent(repoOwner, repoName, patch.filePath, branchName)

      snapshots.push({
        filePath: patch.filePath,
        contentBefore: existing?.content ?? null,
        contentAfter: patch.content,
        operation: patch.operation,
      })

      treeEntries.push({
        path: patch.filePath,
        mode: '100644',
        type: 'blob',
        content: patch.content,
      })

      appliedFiles.push(patch.filePath)
    }

    // Create new tree
    const treeResp = await fetch(
      `https://api.github.com/repos/${repoOwner}/${repoName}/git/trees`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ base_tree: baseTreeSha, tree: treeEntries }),
      },
    )
    if (!treeResp.ok) {
      const errBody = await treeResp.text().catch(() => 'unknown')
      throw new Error(`Failed to create tree (${treeResp.status}): ${errBody.slice(0, 200)}`)
    }
    const treeData = (await treeResp.json()) as { sha: string }

    // Create commit
    const newCommitResp = await fetch(
      `https://api.github.com/repos/${repoOwner}/${repoName}/git/commits`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message: commitMessage,
          tree: treeData.sha,
          parents: [baseSha],
        }),
      },
    )
    if (!newCommitResp.ok) {
      throw new Error(`Failed to create commit (${newCommitResp.status})`)
    }
    const newCommitData = (await newCommitResp.json()) as { sha: string }

    // Update branch ref
    const updateRefResp = await fetch(
      `https://api.github.com/repos/${repoOwner}/${repoName}/git/refs/heads/${branchName}`,
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ sha: newCommitData.sha }),
      },
    )
    if (!updateRefResp.ok) {
      throw new Error(`Failed to update branch ref (${updateRefResp.status})`)
    }

    return {
      success: true,
      appliedFiles,
      rejectedFiles,
      snapshots,
      commitSha: newCommitData.sha,
      errors,
      durationMs: Date.now() - startTime,
    }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err))
    return {
      success: false,
      appliedFiles,
      rejectedFiles,
      snapshots,
      commitSha: null,
      errors,
      durationMs: Date.now() - startTime,
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Validate patch set before application
// ─────────────────────────────────────────────────────────────────────────────

export function validatePatchesForApply(patches: PatchFile[]): {
  valid: boolean
  errors: string[]
} {
  const errors: string[] = []

  if (patches.length === 0) {
    errors.push('Empty patch set')
  }

  for (const patch of patches) {
    if (!patch.filePath || patch.filePath.trim() === '') {
      errors.push('Patch has empty file path')
    }
    if (patch.content === undefined || patch.content === null) {
      errors.push(`Patch for "${patch.filePath}" has no content`)
    }
    if (patch.filePath.includes('..')) {
      errors.push(`Path traversal detected in "${patch.filePath}"`)
    }
  }

  // Check for duplicate file paths
  const paths = patches.map((p) => p.filePath)
  const dupes = paths.filter((p, i) => paths.indexOf(p) !== i)
  if (dupes.length > 0) {
    errors.push(`Duplicate file paths: ${[...new Set(dupes)].join(', ')}`)
  }

  return { valid: errors.length === 0, errors }
}
