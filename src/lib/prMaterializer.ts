/**
 * @module prMaterializer
 * @description Milestone 4 — Production PR materialization pipeline.
 * Creates real, production-ready PRs with full context: diffs, test results,
 * validation summaries, rollback plans, risk scores, and artifact links.
 *
 * Flow:
 *   1. Collect execution results from workspace
 *   2. Generate comprehensive PR body
 *   3. Push final workspace state to PR branch
 *   4. Create PR with all context
 *   5. Link artifacts
 */

import type { PatchFile } from './patchEngine'
import type { DiffSummary } from './diffEngine'
import type { ExecutionPipelineResult } from './executionPipeline'
import type { ArtifactRecord } from './artifactStorage'
import type { HealingAttempt } from './healingStrategies'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface PRMaterializeInput {
  projectId: string
  runId: string
  workspaceId: string
  repoOwner: string
  repoName: string
  workspaceBranch: string
  baseBranch: string
  userRequest: string
  patches: PatchFile[]
  diffs: DiffSummary
  executionResult: ExecutionPipelineResult
  riskScore: number
  riskLevel: string
  rollbackPlan: RollbackSummary
  healingAttempts: HealingAttempt[]
  artifacts: ArtifactRecord[]
  reviewGateDecision: string
}

export interface PRMaterializeResult {
  success: boolean
  prUrl: string | null
  prNumber: number | null
  prBranch: string
  prBody: string
  error?: string
  durationMs: number
}

export interface RollbackSummary {
  complexity: string
  filesToRevert: string[]
  reversalStrategy: string
  dependencyRisks: string[]
  cleanupSteps: string[]
}

// ─────────────────────────────────────────────────────────────────────────────
// PR body generation
// ─────────────────────────────────────────────────────────────────────────────

export function generatePRBody(input: PRMaterializeInput): string {
  const sections: string[] = []

  // Header
  sections.push(`## 🐝 CodeHive AI — Automated Code Change`)
  sections.push(``)
  sections.push(`> **Request:** ${input.userRequest}`)
  sections.push(`> **Run ID:** \`${input.runId}\``)
  sections.push(`> **Workspace:** \`${input.workspaceId}\``)
  sections.push(``)

  // Summary
  sections.push(`### 📊 Summary`)
  sections.push(`| Metric | Value |`)
  sections.push(`|--------|-------|`)
  sections.push(`| Files Changed | ${input.patches.length} |`)
  sections.push(`| Lines Added | +${input.diffs.totalAdditions} |`)
  sections.push(`| Lines Removed | -${input.diffs.totalDeletions} |`)
  sections.push(`| Risk Score | ${input.riskScore}/100 (${input.riskLevel}) |`)
  sections.push(`| Review Gate | ${input.reviewGateDecision} |`)
  sections.push(``)

  // Files changed
  sections.push(`### 📁 Files Changed`)
  for (const patch of input.patches) {
    const icon = patch.operation === 'add_file' ? '🆕' : '✏️'
    sections.push(`- ${icon} \`${patch.filePath}\` — ${patch.reasoning}`)
  }
  sections.push(``)

  // Execution results
  sections.push(`### ✅ Execution Results`)
  if (input.executionResult.success) {
    sections.push(`All pipeline steps passed successfully.`)
  } else {
    sections.push(`⚠️ Pipeline had failures. Failed step: \`${input.executionResult.failedStep || 'unknown'}\``)
  }
  sections.push(``)
  sections.push(`| Step | Status | Duration |`)
  sections.push(`|------|--------|----------|`)
  for (const step of input.executionResult.steps) {
    const icon = step.status === 'passed' ? '✅' : step.status === 'failed' ? '❌' : '⏭️'
    sections.push(`| ${step.step} | ${icon} ${step.status} | ${step.durationMs}ms |`)
  }
  sections.push(``)

  // Self-healing
  if (input.healingAttempts.length > 0) {
    sections.push(`### 🔧 Self-Healing Attempts`)
    sections.push(`| # | Strategy | Target | Outcome |`)
    sections.push(`|---|----------|--------|---------|`)
    for (const attempt of input.healingAttempts) {
      const icon = attempt.outcome === 'fixed' ? '✅' : attempt.outcome === 'partial' ? '🟡' : '❌'
      sections.push(`| ${attempt.attemptNumber} | ${attempt.strategy} | \`${attempt.targetFile}\` | ${icon} ${attempt.outcome} |`)
    }
    sections.push(``)
  }

  // Rollback plan
  sections.push(`### 🔄 Rollback Plan`)
  sections.push(`- **Complexity:** ${input.rollbackPlan.complexity}`)
  sections.push(`- **Strategy:** ${input.rollbackPlan.reversalStrategy}`)
  if (input.rollbackPlan.dependencyRisks.length > 0) {
    sections.push(`- **Dependency Risks:** ${input.rollbackPlan.dependencyRisks.join(', ')}`)
  }
  sections.push(`- **Files to Revert:** ${input.rollbackPlan.filesToRevert.map((f) => `\`${f}\``).join(', ')}`)
  if (input.rollbackPlan.cleanupSteps.length > 0) {
    sections.push(`- **Cleanup Steps:**`)
    for (const step of input.rollbackPlan.cleanupSteps) {
      sections.push(`  - ${step}`)
    }
  }
  sections.push(``)

  // Artifacts
  if (input.artifacts.length > 0) {
    sections.push(`### 📦 Artifacts`)
    for (const art of input.artifacts) {
      sections.push(`- \`${art.type}\`: ${art.key} (${formatBytes(art.sizeBytes)})`)
    }
    sections.push(``)
  }

  // Footer
  sections.push(`---`)
  sections.push(`*Generated by CodeHive AI v4.0 — Milestone 4*`)

  return sections.join('\n')
}

// ─────────────────────────────────────────────────────────────────────────────
// PR creation via GitHub API
// ─────────────────────────────────────────────────────────────────────────────

export async function materializePR(input: PRMaterializeInput): Promise<PRMaterializeResult> {
  const startTime = Date.now()

  try {
    const token = process.env.GITHUB_TOKEN
    if (!token) throw new Error('GITHUB_TOKEN not configured')

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'codehive-ai/4.0',
    }

    // Generate PR branch name from workspace branch
    const prBranch = `codehive/${input.runId}`
    const body = generatePRBody(input)
    const title = `🐝 CodeHive: ${input.userRequest.substring(0, 72)}`

    // Create PR branch from workspace branch
    const wsRefResp = await fetch(
      `https://api.github.com/repos/${input.repoOwner}/${input.repoName}/git/ref/heads/${input.workspaceBranch}`,
      { headers },
    )
    if (!wsRefResp.ok) {
      throw new Error(`Failed to get workspace branch ref (${wsRefResp.status})`)
    }
    const wsRefData = (await wsRefResp.json()) as { object: { sha: string } }

    // Create PR branch
    const createBranchResp = await fetch(
      `https://api.github.com/repos/${input.repoOwner}/${input.repoName}/git/refs`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ref: `refs/heads/${prBranch}`,
          sha: wsRefData.object.sha,
        }),
      },
    )

    if (!createBranchResp.ok) {
      const errBody = await createBranchResp.text().catch(() => 'unknown')
      // Branch might already exist — try to update it
      if (createBranchResp.status === 422) {
        const updateResp = await fetch(
          `https://api.github.com/repos/${input.repoOwner}/${input.repoName}/git/refs/heads/${prBranch}`,
          {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ sha: wsRefData.object.sha, force: true }),
          },
        )
        if (!updateResp.ok) {
          throw new Error(`Failed to update PR branch (${updateResp.status})`)
        }
      } else {
        throw new Error(`Failed to create PR branch (${createBranchResp.status}): ${errBody.slice(0, 200)}`)
      }
    }

    // Create the PR
    const prResp = await fetch(
      `https://api.github.com/repos/${input.repoOwner}/${input.repoName}/pulls`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          title,
          body,
          head: prBranch,
          base: input.baseBranch,
        }),
      },
    )

    if (!prResp.ok) {
      const errBody = await prResp.text().catch(() => 'unknown')
      throw new Error(`Failed to create PR (${prResp.status}): ${errBody.slice(0, 200)}`)
    }

    const prData = (await prResp.json()) as { html_url: string; number: number }

    return {
      success: true,
      prUrl: prData.html_url,
      prNumber: prData.number,
      prBranch,
      prBody: body,
      durationMs: Date.now() - startTime,
    }
  } catch (err) {
    return {
      success: false,
      prUrl: null,
      prNumber: null,
      prBranch: `codehive/${input.runId}`,
      prBody: '',
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - startTime,
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Generate rollback summary
// ─────────────────────────────────────────────────────────────────────────────

export function generateRollbackSummary(
  patches: PatchFile[],
  riskLevel: string,
): RollbackSummary {
  const filesToRevert = patches.map((p) => p.filePath)
  const newFiles = patches.filter((p) => p.operation === 'add_file').map((p) => p.filePath)
  const modifiedFiles = patches.filter((p) => p.operation === 'modify_file').map((p) => p.filePath)

  const cleanupSteps: string[] = []
  if (newFiles.length > 0) {
    cleanupSteps.push(`Delete new files: ${newFiles.join(', ')}`)
  }
  if (modifiedFiles.length > 0) {
    cleanupSteps.push(`Revert modified files to pre-patch state`)
  }

  let complexity = 'SIMPLE'
  const dependencyRisks: string[] = []

  if (patches.length > 5) {
    complexity = 'MODERATE'
  }
  if (patches.length > 10 || riskLevel === 'HIGH' || riskLevel === 'CRITICAL') {
    complexity = 'COMPLEX'
  }

  if (patches.some((p) => p.filePath.includes('package.json'))) {
    dependencyRisks.push('package.json modified — may need dependency reinstall')
  }
  if (patches.some((p) => p.filePath.includes('config'))) {
    dependencyRisks.push('Configuration files modified — may need service restart')
  }

  return {
    complexity,
    filesToRevert,
    reversalStrategy: newFiles.length > 0
      ? 'Delete new files + revert modified files to previous commit'
      : 'Revert all modified files to previous commit',
    dependencyRisks,
    cleanupSteps,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
