/**
 * @module selfFixOrchestrator
 * @description "Run & Fix Until Stable" orchestrator. Triggers GitHub Actions workflows,
 * monitors results, and when tests fail, invokes the Fix Agent to propose corrections.
 * Commits fixes to the same PR branch and re-runs the workflow — up to 3 attempts.
 * Safety: never auto-merges, stops on low confidence/high risk, detects repeated errors.
 * Self-improvement: reads top 3 lessons before each fix; writes a new lesson on success.
 * Exports: runAndFixUntilStable, FixSSEEvent.
 */

import type { Payload } from 'payload'
import { runFixAgent, type FixAgentInput } from './fixAgent'
import { parseWorkflowError, type ParsedError } from '../lib/errorParser'
import { createOrUpdateFile } from '../lib/github'

const MAX_FIX_ATTEMPTS = 3
const POLL_INTERVAL_MS = 5000
const MAX_POLL_ATTEMPTS = 60       // 60 × 5s = 5 min per workflow run
const INITIAL_CHECK_ATTEMPTS = 3
const MAX_WAIT_AFTER_TRIGGER = 30  // 30 × 5s = 2.5 min for triggered workflow
const MAX_LOG_SIZE = 10000

export type FixSSEEvent =
  | { type: 'status'; phase: string; message: string }
  | { type: 'workflow_start'; runId: number; attempt: number }
  | { type: 'workflow_polling'; elapsed: number; status: string }
  | { type: 'workflow_result'; success: boolean; conclusion: string; logsUrl: string }
  | { type: 'error_parsed'; category: string; summary: string; filesFound: number }
  | { type: 'fix_start'; attempt: number; maxAttempts: number }
  | {
      type: 'fix_agent_response'
      summary: string
      confidence: number
      riskLevel: string
      filesCount: number
    }
  | { type: 'fix_committed'; attempt: number; filesUpdated: string[]; commitMessage: string }
  | { type: 'fix_rejected'; attempt: number; reason: string }
  | { type: 'attempt_result'; attempt: number; status: string; message: string }
  | {
      type: 'done'
      finalStatus: 'passed' | 'failed' | 'needs_human_review'
      totalAttempts: number
      message: string
    }
  | { type: 'error'; message: string }

interface WorkflowRun {
  id: number
  status: string
  conclusion: string | null
  html_url: string
  jobs_url: string
  created_at?: string
}

interface WorkflowJob {
  id: number
  name: string
  status: string
  conclusion: string | null
  steps: Array<{ name: string; status: string; conclusion: string | null }>
}

type LessonEntry = {
  errorCategory: string
  errorPattern: string
  fixApplied: string
  filesChanged?: string
  confidence?: number
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function ghFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = process.env.GITHUB_TOKEN
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'codehive-ai/5.0',
    ...((options.headers as Record<string, string>) || {}),
  }
  if (token) headers.Authorization = `Bearer ${token}`
  return fetch(url, { ...options, headers })
}

// ── Lessons Helpers ─────────────────────────────────────────────────────

/**
 * Load up to 3 lessons matching the error category for this project.
 * Falls back to general project lessons if fewer than 3 category-specific ones exist.
 */
async function loadLessons(
  payload: Payload,
  projectId: number,
  errorCategory: string,
): Promise<LessonEntry[]> {
  try {
    // Primary: lessons matching this exact error category, sorted by successCount desc
    const byCategory = await payload.find({
      collection: 'lessons-learned',
      where: {
        and: [
          { project: { equals: projectId } },
          { errorCategory: { equals: errorCategory } },
        ],
      },
      sort: '-successCount',
      limit: 3,
      overrideAccess: true,
    })

    if (byCategory.docs.length >= 3) {
      return byCategory.docs.map((d) => ({
        errorCategory: String(d.errorCategory || ''),
        errorPattern: String(d.errorPattern || ''),
        fixApplied: String(d.fixApplied || ''),
        filesChanged: d.filesChanged ? String(d.filesChanged) : undefined,
        confidence: typeof d.confidence === 'number' ? d.confidence : undefined,
      }))
    }

    // Backfill: general lessons for this project (any category)
    const needed = 3 - byCategory.docs.length
    const general = await payload.find({
      collection: 'lessons-learned',
      where: {
        and: [
          { project: { equals: projectId } },
          { errorCategory: { not_equals: errorCategory } },
        ],
      },
      sort: '-successCount',
      limit: needed,
      overrideAccess: true,
    })

    const combined = [...byCategory.docs, ...general.docs].slice(0, 3)
    return combined.map((d) => ({
      errorCategory: String(d.errorCategory || ''),
      errorPattern: String(d.errorPattern || ''),
      fixApplied: String(d.fixApplied || ''),
      filesChanged: d.filesChanged ? String(d.filesChanged) : undefined,
      confidence: typeof d.confidence === 'number' ? d.confidence : undefined,
    }))
  } catch {
    // Non-critical — don't block the fix loop
    return []
  }
}

/**
 * Write or increment a lesson after a successful fix.
 * Called when the workflow passes after one or more fix attempts.
 */
async function writeLessonAfterSuccess(
  payload: Payload,
  projectId: number,
  lastAttempt: {
    errorCategory: string
    errorSummary: string
    fixSummary: string
    filesUpdated: string[]
    confidence?: number
  },
): Promise<void> {
  try {
    const filesChanged = lastAttempt.filesUpdated.join(', ')
    const fixKey = lastAttempt.fixSummary.slice(0, 60)

    // Check if a near-identical lesson already exists (same category + similar fix summary)
    const existing = await payload.find({
      collection: 'lessons-learned',
      where: {
        and: [
          { project: { equals: projectId } },
          { errorCategory: { equals: lastAttempt.errorCategory } },
          { fixApplied: { contains: fixKey } },
        ],
      },
      limit: 1,
      overrideAccess: true,
    })

    if (existing.docs.length > 0) {
      // Increment successCount on the existing lesson
      const doc = existing.docs[0]
      const currentCount = typeof doc.successCount === 'number' ? doc.successCount : 1
      await payload.update({
        collection: 'lessons-learned',
        id: doc.id,
        overrideAccess: true,
        data: { successCount: currentCount + 1 },
      })
    } else {
      // Create a new lesson entry
      await payload.create({
        collection: 'lessons-learned',
        overrideAccess: true,
        data: {
          project: projectId,
          errorCategory: lastAttempt.errorCategory,
          errorPattern: lastAttempt.errorSummary.slice(0, 500),
          fixApplied: lastAttempt.fixSummary,
          filesChanged,
          confidence: lastAttempt.confidence ?? null,
          successCount: 1,
        },
      })
    }
  } catch {
    // Non-critical — don't block the main flow
  }
}

// ── GitHub Helpers ──────────────────────────────────────────────────────

async function findLatestWorkflowRun(
  owner: string,
  repo: string,
  branch: string,
): Promise<WorkflowRun | null> {
  const url = `https://api.github.com/repos/${owner}/${repo}/actions/runs?branch=${encodeURIComponent(branch)}&per_page=5`
  const resp = await ghFetch(url)
  if (!resp.ok) return null
  const data = (await resp.json()) as { workflow_runs: WorkflowRun[] }
  return data.workflow_runs?.[0] ?? null
}

async function triggerWorkflowViaPush(
  owner: string,
  repo: string,
  branch: string,
): Promise<boolean> {
  const token = process.env.GITHUB_TOKEN
  if (!token) return false

  const path = '.sandbox-trigger'
  const content = btoa(`fix-run-${Date.now()}`)

  const getResp = await ghFetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`,
  )
  let sha: string | undefined
  if (getResp.ok) {
    const existing = (await getResp.json()) as { sha: string }
    sha = existing.sha
  }

  const body: Record<string, unknown> = {
    message: '🔄 trigger fix-loop workflow',
    content,
    branch,
  }
  if (sha) body.sha = sha

  const putResp = await ghFetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  )
  return putResp.ok
}

async function waitForWorkflowRun(
  owner: string,
  repo: string,
  branch: string,
  afterRunId: number | null,
  onEvent: (event: FixSSEEvent) => void,
): Promise<WorkflowRun | null> {
  // Quick check for existing new run
  for (let i = 1; i <= INITIAL_CHECK_ATTEMPTS; i++) {
    const run = await findLatestWorkflowRun(owner, repo, branch)
    if (run && (afterRunId === null || run.id !== afterRunId)) return run
    onEvent({
      type: 'status',
      phase: 'workflow',
      message: `⏳ Checking for workflow... (${i}/${INITIAL_CHECK_ATTEMPTS})`,
    })
    await sleep(POLL_INTERVAL_MS)
  }

  // Trigger new run via push
  onEvent({
    type: 'status',
    phase: 'workflow',
    message: '🔧 No new workflow run found — triggering one...',
  })
  const triggered = await triggerWorkflowViaPush(owner, repo, branch)
  if (!triggered) {
    onEvent({
      type: 'error',
      message: '❌ Could not trigger workflow. Check GITHUB_TOKEN permissions.',
    })
    return null
  }

  onEvent({
    type: 'status',
    phase: 'workflow',
    message: '✅ Push sent — waiting for GitHub Actions...',
  })

  for (let i = 1; i <= MAX_WAIT_AFTER_TRIGGER; i++) {
    await sleep(POLL_INTERVAL_MS)
    const run = await findLatestWorkflowRun(owner, repo, branch)
    if (run && (afterRunId === null || run.id !== afterRunId)) return run
    if (i % 5 === 0) {
      onEvent({
        type: 'status',
        phase: 'workflow',
        message: `⏳ Waiting for workflow... (${i}/${MAX_WAIT_AFTER_TRIGGER})`,
      })
    }
  }

  return null
}

async function pollWorkflowUntilComplete(
  owner: string,
  repo: string,
  runId: number,
  onEvent: (event: FixSSEEvent) => void,
): Promise<WorkflowRun> {
  let run: WorkflowRun = {
    id: runId,
    status: 'queued',
    conclusion: null,
    html_url: '',
    jobs_url: '',
  }

  for (let i = 1; i <= MAX_POLL_ATTEMPTS; i++) {
    const resp = await ghFetch(
      `https://api.github.com/repos/${owner}/${repo}/actions/runs/${runId}`,
    )
    if (resp.ok) {
      run = (await resp.json()) as WorkflowRun
      if (run.status === 'completed') break
    }

    const elapsed = i * (POLL_INTERVAL_MS / 1000)
    if (i % 3 === 0) {
      onEvent({ type: 'workflow_polling', elapsed, status: run.status })
    }
    await sleep(POLL_INTERVAL_MS)
  }

  return run
}

async function getWorkflowLogs(
  owner: string,
  repo: string,
  runId: number,
): Promise<string> {
  const jobsResp = await ghFetch(
    `https://api.github.com/repos/${owner}/${repo}/actions/runs/${runId}/jobs`,
  )
  if (!jobsResp.ok) return 'Could not fetch workflow jobs'

  const jobsData = (await jobsResp.json()) as { jobs: WorkflowJob[] }
  let allLogs = ''

  for (const job of jobsData.jobs) {
    const logsResp = await ghFetch(
      `https://api.github.com/repos/${owner}/${repo}/actions/jobs/${job.id}/logs`,
    )
    if (logsResp.ok) {
      const text = await logsResp.text()
      allLogs += `\n=== Job: ${job.name} (${job.conclusion}) ===\n${text}\n`
    } else {
      allLogs += `\n=== Job: ${job.name} (${job.conclusion}) ===\n`
      for (const step of job.steps) {
        allLogs += `  Step: ${step.name} — ${step.conclusion ?? step.status}\n`
      }
    }
  }

  return allLogs.slice(0, MAX_LOG_SIZE)
}

async function getFileFromBranch(
  owner: string,
  repo: string,
  branch: string,
  filePath: string,
): Promise<string | null> {
  const resp = await ghFetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${encodeURIComponent(branch)}`,
  )
  if (!resp.ok) return null
  const data = (await resp.json()) as { content?: string }
  if (!data.content) return null
  return atob(data.content.replace(/\n/g, ''))
}

async function getChangedFilesFromPR(
  owner: string,
  repo: string,
  prNumber: number,
): Promise<Array<{ filename: string; status: string }>> {
  const resp = await ghFetch(
    `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=100`,
  )
  if (!resp.ok) return []
  return (await resp.json()) as Array<{ filename: string; status: string }>
}

// ── Main Orchestrator ───────────────────────────────────────────────────

export async function runAndFixUntilStable(
  payload: Payload,
  input: {
    projectId: number
    planId: number
    prNumber: number
    branchName: string
    owner: string
    repo: string
  },
  onEvent: (event: FixSSEEvent) => void,
): Promise<void> {
  const { projectId, planId, prNumber, branchName, owner, repo } = input

  onEvent({
    type: 'status',
    phase: 'init',
    message: `🔄 Run & Fix Until Stable — PR #${prNumber} on ${owner}/${repo}`,
  })
  onEvent({
    type: 'status',
    phase: 'init',
    message: `🌿 Branch: ${branchName} | Max fix attempts: ${MAX_FIX_ATTEMPTS}`,
  })

  // Load project name
  let projectName = 'unknown'
  try {
    const project = await payload.findByID({
      collection: 'projects',
      id: projectId,
      overrideAccess: true,
    })
    projectName = (project as { name?: string }).name || 'unknown'
  } catch {
    // ignore
  }

  let currentAttempt = 0
  let lastRunId: number | null = null
  const previousAttempts: FixAgentInput['previousAttempts'] = []
  const seenFingerprints: Map<string, number> = new Map()

  while (currentAttempt <= MAX_FIX_ATTEMPTS) {
    const isInitialRun = currentAttempt === 0

    // ── Step 1: Find or trigger workflow ────────────────────────────
    onEvent({
      type: 'status',
      phase: 'workflow',
      message: isInitialRun
        ? '🔍 Looking for latest workflow run...'
        : `🔍 Looking for workflow run after fix attempt #${currentAttempt}...`,
    })

    const run = await waitForWorkflowRun(owner, repo, branchName, lastRunId, onEvent)
    if (!run) {
      onEvent({
        type: 'done',
        finalStatus: 'failed',
        totalAttempts: currentAttempt,
        message: '❌ Could not find or trigger a workflow run.',
      })
      return
    }

    lastRunId = run.id
    onEvent({ type: 'workflow_start', runId: run.id, attempt: currentAttempt })
    onEvent({
      type: 'status',
      phase: 'workflow',
      message: `🚀 Workflow #${run.id} — polling for completion...`,
    })

    // ── Step 2: Poll until complete ────────────────────────────────
    const completedRun = await pollWorkflowUntilComplete(owner, repo, run.id, onEvent)

    if (completedRun.status !== 'completed') {
      onEvent({
        type: 'done',
        finalStatus: 'failed',
        totalAttempts: currentAttempt,
        message: '⏰ Workflow timed out after 5 minutes.',
      })
      return
    }

    const success = completedRun.conclusion === 'success'
    onEvent({
      type: 'workflow_result',
      success,
      conclusion: completedRun.conclusion ?? 'unknown',
      logsUrl: completedRun.html_url,
    })

    // ── Step 3: If passed, we're done! ─────────────────────────────
    if (success) {
      // Mark the last fix attempt as passed
      if (currentAttempt > 0) {
        try {
          const attempts = await payload.find({
            collection: 'fix-attempts',
            where: {
              agentPlan: { equals: planId },
              attemptNumber: { equals: currentAttempt },
            },
            limit: 1,
            overrideAccess: true,
          })
          if (attempts.docs[0]) {
            await payload.update({
              collection: 'fix-attempts',
              id: attempts.docs[0].id,
              overrideAccess: true,
              data: { status: 'passed' },
            })
          }
        } catch {
          // non-critical
        }

        // ── Write lesson from this successful fix ──────────────────
        const lastAttempt = previousAttempts[previousAttempts.length - 1]
        if (lastAttempt) {
          onEvent({
            type: 'status',
            phase: 'lesson',
            message: '🧠 Writing lesson from successful fix...',
          })
          await writeLessonAfterSuccess(payload, projectId, lastAttempt)
        }
      }

      onEvent({
        type: 'done',
        finalStatus: 'passed',
        totalAttempts: currentAttempt,
        message: `✅ All tests passed${currentAttempt > 0 ? ` after ${currentAttempt} fix attempt(s)` : ' on first run'}!`,
      })
      return
    }

    // ── Step 4: Max attempts reached? ──────────────────────────────
    if (currentAttempt >= MAX_FIX_ATTEMPTS) {
      try {
        const attempts = await payload.find({
          collection: 'fix-attempts',
          where: {
            agentPlan: { equals: planId },
            attemptNumber: { equals: currentAttempt },
          },
          limit: 1,
          overrideAccess: true,
        })
        if (attempts.docs[0]) {
          await payload.update({
            collection: 'fix-attempts',
            id: attempts.docs[0].id,
            overrideAccess: true,
            data: { status: 'needs_human_review', needsHumanReview: true },
          })
        }
      } catch {
        // non-critical
      }

      onEvent({
        type: 'done',
        finalStatus: 'needs_human_review',
        totalAttempts: currentAttempt,
        message: `⚠️ Still failing after ${MAX_FIX_ATTEMPTS} fix attempts. Marked for human review.`,
      })
      return
    }

    // ── Step 5: Fetch logs and parse error ─────────────────────────
    currentAttempt++
    onEvent({ type: 'fix_start', attempt: currentAttempt, maxAttempts: MAX_FIX_ATTEMPTS })
    onEvent({
      type: 'status',
      phase: 'logs',
      message: '📋 Fetching workflow logs...',
    })

    const logs = await getWorkflowLogs(owner, repo, completedRun.id)
    const parsedError: ParsedError = parseWorkflowError(logs)

    onEvent({
      type: 'error_parsed',
      category: parsedError.category,
      summary: parsedError.summary.slice(0, 200),
      filesFound: parsedError.relevantFiles.length,
    })
    onEvent({
      type: 'status',
      phase: 'analysis',
      message: `🔎 Error: ${parsedError.category} | Command: ${parsedError.failedCommand} | ${parsedError.relevantFiles.length} files referenced`,
    })

    // ── Step 5b: Check for repeated errors ──────────────────────────
    const fpCount = (seenFingerprints.get(parsedError.fingerprint) ?? 0) + 1
    seenFingerprints.set(parsedError.fingerprint, fpCount)

    if (fpCount > 2) {
      try {
        await payload.create({
          collection: 'fix-attempts',
          overrideAccess: true,
          data: {
            agentPlan: planId,
            branchName,
            prNumber,
            attemptNumber: currentAttempt,
            status: 'needs_human_review',
            errorCategory: parsedError.category,
            failedCommand: parsedError.failedCommand,
            exitCode: parsedError.exitCode,
            errorSummary: parsedError.summary.slice(0, 2000),
            rawLogs: logs.slice(0, MAX_LOG_SIZE),
            needsHumanReview: true,
            errorFingerprint: parsedError.fingerprint,
          },
        })
      } catch {
        // non-critical
      }

      onEvent({
        type: 'done',
        finalStatus: 'needs_human_review',
        totalAttempts: currentAttempt,
        message: `⚠️ Same error repeated ${fpCount} times. Stopping to avoid infinite loop.`,
      })
      return
    }

    const broadenContext = fpCount === 2

    // ── Step 5c: Load lessons for this error category ───────────────
    onEvent({
      type: 'status',
      phase: 'lessons',
      message: '🧠 Loading lessons from past fixes...',
    })
    const lessons = await loadLessons(payload, projectId, parsedError.category)
    if (lessons.length > 0) {
      onEvent({
        type: 'status',
        phase: 'lessons',
        message: `📚 Injecting ${lessons.length} lesson(s) into Fix Agent context`,
      })
    }

    // ── Step 6: Create FixAttempt record ────────────────────────────
    let fixAttemptId: number | undefined
    try {
      const fa = await payload.create({
        collection: 'fix-attempts',
        overrideAccess: true,
        data: {
          agentPlan: planId,
          branchName,
          prNumber,
          attemptNumber: currentAttempt,
          status: 'running',
          errorCategory: parsedError.category,
          failedCommand: parsedError.failedCommand,
          exitCode: parsedError.exitCode,
          errorSummary: parsedError.summary.slice(0, 2000),
          rawLogs: logs.slice(0, MAX_LOG_SIZE),
          errorFingerprint: parsedError.fingerprint,
        },
      })
      fixAttemptId = fa.id
    } catch (err) {
      onEvent({
        type: 'error',
        message: `⚠️ Could not save fix attempt: ${String(err)}`,
      })
    }

    // ── Step 7: Gather context for Fix Agent ───────────────────────
    onEvent({
      type: 'status',
      phase: 'context',
      message: '📂 Fetching relevant files from branch...',
    })

    const errorFiles = parsedError.relevantFiles
    const prFiles = await getChangedFilesFromPR(owner, repo, prNumber)
    const prFilePaths = prFiles.map((f) => f.filename)

    const filesToFetch = broadenContext
      ? [...new Set([...errorFiles, ...prFilePaths])]
      : [...new Set([...errorFiles, ...prFilePaths.slice(0, 5)])]

    const repoFiles: Array<{ path: string; content: string }> = []
    for (const filePath of filesToFetch.slice(0, 15)) {
      const content = await getFileFromBranch(owner, repo, branchName, filePath)
      if (content) repoFiles.push({ path: filePath, content })
    }

    const packageJson = await getFileFromBranch(owner, repo, branchName, 'package.json')
    const tsconfigJson = await getFileFromBranch(owner, repo, branchName, 'tsconfig.json')

    onEvent({
      type: 'status',
      phase: 'context',
      message: `📄 Fetched ${repoFiles.length} source files${broadenContext ? ' (broadened context)' : ''}`,
    })

    // ── Step 8: Call Fix Agent (with lessons) ───────────────────────
    onEvent({
      type: 'status',
      phase: 'fix_agent',
      message: '🤖 Fix Agent (Claude Sonnet 4.6) analyzing failure...',
    })

    let fixResult
    try {
      fixResult = await runFixAgent(
        {
          projectName,
          branchName,
          failedCommand: parsedError.failedCommand,
          exitCode: parsedError.exitCode,
          errorCategory: parsedError.category,
          errorSummary: parsedError.summary,
          rawLogs: logs,
          repoFiles,
          packageJson: packageJson ?? undefined,
          tsconfigJson: tsconfigJson ?? undefined,
          lessons,
          previousAttempts,
        },
        (chunk) => {
          onEvent({ type: 'status', phase: 'fix_agent', message: `🤖 ${chunk}` })
        },
      )
    } catch (err) {
      const errMsg = `Fix Agent failed: ${String(err)}`
      onEvent({ type: 'error', message: errMsg })

      if (fixAttemptId) {
        try {
          await payload.update({
            collection: 'fix-attempts',
            id: fixAttemptId,
            overrideAccess: true,
            data: { status: 'failed', fixSummary: errMsg.slice(0, 2000) },
          })
        } catch {
          /* ignore */
        }
      }

      previousAttempts.push({
        attemptNumber: currentAttempt,
        errorCategory: parsedError.category,
        errorSummary: parsedError.summary.slice(0, 300),
        fixSummary: errMsg,
        filesUpdated: [],
        result: 'agent_error',
      })
      continue
    }

    onEvent({
      type: 'fix_agent_response',
      summary: fixResult.summary,
      confidence: fixResult.confidence,
      riskLevel: fixResult.riskLevel,
      filesCount: fixResult.filesToUpdate.length,
    })

    // ── Step 9: Safety checks ──────────────────────────────────────
    const shouldReject =
      fixResult.needsHumanReview ||
      fixResult.confidence < 0.65 ||
      fixResult.riskLevel === 'high' ||
      fixResult.filesToUpdate.length === 0

    if (shouldReject) {
      const reason =
        fixResult.filesToUpdate.length === 0
          ? 'No files to update'
          : fixResult.confidence < 0.65
            ? `Low confidence: ${(fixResult.confidence * 100).toFixed(0)}%`
            : fixResult.riskLevel === 'high'
              ? 'High risk level'
              : 'Fix agent flagged for human review'

      onEvent({ type: 'fix_rejected', attempt: currentAttempt, reason })

      if (fixAttemptId) {
        try {
          await payload.update({
            collection: 'fix-attempts',
            id: fixAttemptId,
            overrideAccess: true,
            data: {
              status: 'needs_human_review',
              fixSummary: fixResult.summary,
              confidence: fixResult.confidence,
              riskLevel: fixResult.riskLevel,
              needsHumanReview: true,
            },
          })
        } catch {
          /* ignore */
        }
      }

      onEvent({
        type: 'done',
        finalStatus: 'needs_human_review',
        totalAttempts: currentAttempt,
        message: `⚠️ Fix rejected: ${reason}. Marked for human review.`,
      })
      return
    }

    // ── Step 10: Commit fixed files ─────────────────────────────────
    onEvent({
      type: 'status',
      phase: 'commit',
      message: `📝 Committing ${fixResult.filesToUpdate.length} file(s) to branch...`,
    })

    const updatedPaths: string[] = []
    for (const file of fixResult.filesToUpdate) {
      try {
        await createOrUpdateFile(
          owner,
          repo,
          file.path,
          file.content,
          branchName,
          `fix(auto): ${fixResult.summary.slice(0, 50)} [attempt ${currentAttempt}]`,
        )
        updatedPaths.push(file.path)
      } catch (err) {
        onEvent({
          type: 'error',
          message: `⚠️ Failed to commit ${file.path}: ${String(err)}`,
        })
      }
    }

    if (updatedPaths.length === 0) {
      onEvent({ type: 'error', message: '❌ No files could be committed.' })
      if (fixAttemptId) {
        try {
          await payload.update({
            collection: 'fix-attempts',
            id: fixAttemptId,
            overrideAccess: true,
            data: { status: 'failed', fixSummary: 'No files committed' },
          })
        } catch {
          /* ignore */
        }
      }
      previousAttempts.push({
        attemptNumber: currentAttempt,
        errorCategory: parsedError.category,
        errorSummary: parsedError.summary.slice(0, 300),
        fixSummary: 'No files committed',
        filesUpdated: [],
        result: 'commit_failed',
        confidence: fixResult.confidence,
      })
      continue
    }

    onEvent({
      type: 'fix_committed',
      attempt: currentAttempt,
      filesUpdated: updatedPaths,
      commitMessage: `fix(auto): ${fixResult.summary.slice(0, 50)} [attempt ${currentAttempt}]`,
    })

    // Update FixAttempt record
    if (fixAttemptId) {
      try {
        await payload.update({
          collection: 'fix-attempts',
          id: fixAttemptId,
          overrideAccess: true,
          data: {
            status: 'committed',
            fixSummary: fixResult.summary,
            filesUpdated: updatedPaths,
            confidence: fixResult.confidence,
            riskLevel: fixResult.riskLevel,
          },
        })
      } catch {
        /* ignore */
      }
    }

    // Record for next attempt context (includes confidence for lesson writing)
    previousAttempts.push({
      attemptNumber: currentAttempt,
      errorCategory: parsedError.category,
      errorSummary: parsedError.summary.slice(0, 300),
      fixSummary: fixResult.summary,
      filesUpdated: updatedPaths,
      result: 'committed',
      confidence: fixResult.confidence,
    })

    onEvent({
      type: 'attempt_result',
      attempt: currentAttempt,
      status: 'committed',
      message: `✅ Fix attempt #${currentAttempt} committed — re-running workflow...`,
    })

    // Small delay to let GitHub process the push event
    await sleep(3000)
  }

  // Safety net
  onEvent({
    type: 'done',
    finalStatus: 'needs_human_review',
    totalAttempts: currentAttempt,
    message: '⚠️ Fix loop completed without resolution.',
  })
}
