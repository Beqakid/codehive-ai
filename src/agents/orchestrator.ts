/**
 * @module orchestrator
 * @description Main AI agent pipeline orchestrator. Coordinates Product, Architect,
 * and Reviewer agents in sequence with live SSE streaming. Fetches GitHub repo context,
 * saves AgentRuns/AgentPlan to Payload, and creates GitHub branches and PRs.
 * Exports: runOrchestrator, SSEEvent. Uses keyword-first verdict parsing with o4-mini fallback.
 * @note All Payload operations use overrideAccess: true (system-level).
 */

import type { Payload } from 'payload'
import { runProductAgent } from './productAgent'
import { runArchitectAgent } from './architectAgent'
import { runReviewerAgent } from './reviewerAgent'
import {
  getRepoContext,
  parseGithubUrl,
  getDefaultBranchSha,
  createBranch,
  createOrUpdateFile,
  createPullRequest,
} from '../lib/github'

export type SSEEvent =
  | { type: 'start'; message: string }
  | { type: 'github_context'; files: number; structure: string }
  | { type: 'agent_start'; agent: string; message: string }
  | { type: 'chunk'; agent: string; text: string }
  | { type: 'agent_done'; agent: string }
  | { type: 'verdict'; approved: boolean; score: number | null; reason: string }
  | { type: 'pr_created'; url: string }
  | { type: 'plan_saved'; planId: number }
  | { type: 'done' }
  | { type: 'error'; message: string }

/**
 * Extract numeric review score from review text.
 * Looks for patterns like "Overall Score: 7.2/10", "Score: 8/10", "Rating: 6.5/10"
 */
function extractReviewScore(reviewText: string): number | null {
  const patterns = [
    /(?:overall\s+)?score\s*:\s*(\d+(?:\.\d+)?)\s*\/\s*10/i,
    /(?:overall\s+)?rating\s*:\s*(\d+(?:\.\d+)?)\s*\/\s*10/i,
    /(\d+(?:\.\d+)?)\s*\/\s*10/,
  ]
  for (const pattern of patterns) {
    const match = reviewText.match(pattern)
    if (match?.[1]) {
      const score = parseFloat(match[1])
      if (score >= 0 && score <= 10) return score
    }
  }
  return null
}

/**
 * Extract the verdict reason — key concerns from the reviewer.
 * Looks for sections labeled "Critical Issues", "Concerns", "Blockers", etc.
 */
function extractVerdictReason(reviewText: string, isApproved: boolean): string {
  if (isApproved) return 'Reviewer approved the plan.'

  // Try to find a summary of concerns
  const patterns = [
    /(?:critical\s+(?:issues?|concerns?|blockers?))[\s:]*\n([\s\S]{30,500}?)(?:\n\n|\n#{1,3}\s|$)/i,
    /(?:key\s+(?:issues?|concerns?|blockers?))[\s:]*\n([\s\S]{30,500}?)(?:\n\n|\n#{1,3}\s|$)/i,
    /(?:must\s+(?:fix|address|resolve))[\s:]*\n([\s\S]{30,500}?)(?:\n\n|\n#{1,3}\s|$)/i,
    /(?:final\s+verdict|recommendation)[\s:]*\n([\s\S]{30,500}?)(?:\n\n|\n#{1,3}\s|$)/i,
  ]

  for (const pattern of patterns) {
    const match = reviewText.match(pattern)
    if (match?.[1]) {
      return match[1].trim().slice(0, 500)
    }
  }

  // Fallback: grab the last 300 chars which usually contain the verdict
  return reviewText.slice(-300).trim()
}

/**
 * Keyword-first verdict parsing.
 * 1. Check for explicit NEEDS_REVISION / NOT_APPROVED / REJECTED keywords in FULL text
 * 2. Check for explicit APPROVED keyword (after ruling out negative keywords)
 * 3. Check numeric score (< 7.5 = not approved)
 * 4. Only fall back to o4-mini when ambiguous
 */
async function parseReviewVerdict(reviewText: string): Promise<{
  approved: boolean
  score: number | null
  reason: string
}> {
  const fullTextUpper = reviewText.toUpperCase()
  const score = extractReviewScore(reviewText)

  // ── Step 1: Explicit negative keywords (check FULL text) ──────────────
  const negativeKeywords = [
    'NEEDS_REVISION',
    'NEEDS REVISION',
    'NOT_APPROVED',
    'NOT APPROVED',
    'REJECTED',
    'DO NOT PROCEED',
    'CANNOT APPROVE',
    'RECOMMEND REVISION',
  ]
  const hasExplicitNegative = negativeKeywords.some((kw) => fullTextUpper.includes(kw))

  if (hasExplicitNegative) {
    const reason = extractVerdictReason(reviewText, false)
    return { approved: false, score, reason }
  }

  // ── Step 2: Low score = not approved ──────────────────────────────────
  if (score !== null && score < 7.5) {
    const reason = extractVerdictReason(reviewText, false)
    return { approved: false, score, reason: `Score ${score}/10 below threshold (7.5). ${reason}` }
  }

  // ── Step 3: Explicit positive keywords ────────────────────────────────
  const positiveKeywords = ['APPROVED', 'LGTM', 'READY TO PROCEED', 'SHIP IT', 'PROCEED WITH']
  const hasExplicitPositive = positiveKeywords.some((kw) => fullTextUpper.includes(kw))

  if (hasExplicitPositive && (score === null || score >= 7.5)) {
    const reason = extractVerdictReason(reviewText, true)
    return { approved: true, score, reason }
  }

  // ── Step 4: High score alone = approved ───────────────────────────────
  if (score !== null && score >= 8.0) {
    return { approved: true, score, reason: `Score ${score}/10 — reviewer gave high marks.` }
  }

  // ── Step 5: Ambiguous — use o4-mini as tiebreaker ─────────────────────
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    // No API key fallback — be conservative, require revision
    return {
      approved: false,
      score,
      reason: 'Could not determine verdict (no API key). Defaulting to needs revision.',
    }
  }

  try {
    // Send BOTH the beginning AND end of the review (where verdict usually is)
    const reviewHead = reviewText.slice(0, 2000)
    const reviewTail = reviewText.slice(-2000)
    const combinedText =
      reviewText.length <= 4000
        ? reviewText
        : `${reviewHead}\n\n[... middle truncated ...]\n\n${reviewTail}`

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'o4-mini',
        messages: [
          {
            role: 'user',
            content: `You are a plan evaluation assistant. Read the following technical review and determine if the overall verdict is APPROVED (ready to proceed to code generation) or NOT_APPROVED (needs revision, has critical issues, or is rejected).

IMPORTANT: Look for explicit verdict statements like "Final Verdict:", "Recommendation:", or score-based decisions. A score below 7.5/10 means NOT_APPROVED.

Respond with ONLY the word: APPROVED or NOT_APPROVED

---
${combinedText}`,
          },
        ],
        max_completion_tokens: 10,
      }),
    })

    if (!response.ok) {
      // API error — be conservative
      return { approved: false, score, reason: 'o4-mini API error — defaulting to needs revision.' }
    }

    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const verdict = json.choices?.[0]?.message?.content?.trim().toUpperCase() || ''
    const isApproved = verdict === 'APPROVED'
    const reason = extractVerdictReason(reviewText, isApproved)
    return { approved: isApproved, score, reason }
  } catch {
    return { approved: false, score, reason: 'Verdict parsing failed — defaulting to needs revision.' }
  }
}

export async function runOrchestrator(
  payload: Payload,
  codingRequestId: number,
  onEvent: (event: SSEEvent) => void,
): Promise<void> {
  onEvent({ type: 'start', message: '🚀 Loading coding request...' })

  // 1. Load CodingRequest with depth:2 to populate project.repoUrl
  const codingRequest = await payload.findByID({
    collection: 'coding-requests',
    id: codingRequestId,
    depth: 2,
    overrideAccess: true,
  })

  if (!codingRequest) {
    throw new Error(`CodingRequest ${codingRequestId} not found`)
  }

  await payload.update({
    collection: 'coding-requests',
    id: codingRequestId,
    overrideAccess: true,
    data: { status: 'planning' },
  })

  const projectObj = codingRequest.project
  const projectName =
    typeof projectObj === 'object' && projectObj !== null && 'name' in projectObj
      ? String((projectObj as unknown as Record<string, unknown>).name)
      : 'Unknown Project'
  const repoUrl =
    typeof projectObj === 'object' && projectObj !== null && 'repoUrl' in projectObj
      ? String((projectObj as unknown as Record<string, unknown>).repoUrl || '')
      : ''

  // 2. Fetch GitHub repo context
  let repoContext = undefined
  const parsedRepo = repoUrl ? parseGithubUrl(repoUrl) : null
  if (parsedRepo) {
    try {
      onEvent({
        type: 'start',
        message: `📂 Fetching repo context from ${parsedRepo.owner}/${parsedRepo.repo}...`,
      })
      repoContext = await getRepoContext(parsedRepo.owner, parsedRepo.repo)
      onEvent({
        type: 'github_context',
        files: repoContext.files.length,
        structure: repoContext.structure,
      })
    } catch (err) {
      onEvent({ type: 'start', message: `⚠️ Could not fetch repo context: ${String(err)}` })
    }
  }

  // 3. Product Agent
  onEvent({
    type: 'agent_start',
    agent: 'product',
    message: '📋 Product Agent analyzing requirements...',
  })
  const productStart = Date.now()

  const productRun = await payload.create({
    collection: 'agent-runs',
    overrideAccess: true,
    data: {
      agentName: 'product',
      codingRequest: codingRequestId,
      status: 'running',
      input: { title: codingRequest.title, description: codingRequest.description },
    },
  })

  let productSpec = ''
  try {
    productSpec = await runProductAgent(
      {
        title: codingRequest.title,
        description: codingRequest.description,
        projectName,
        repoContext,
      },
      (text) => onEvent({ type: 'chunk', agent: 'product', text }),
    )
    await payload.update({
      collection: 'agent-runs',
      id: productRun.id,
      overrideAccess: true,
      data: {
        status: 'completed',
        output: { markdown: productSpec },
        durationMs: Date.now() - productStart,
      },
    })
  } catch (err) {
    await payload.update({
      collection: 'agent-runs',
      id: productRun.id,
      overrideAccess: true,
      data: { status: 'failed', errorMessage: String(err), durationMs: Date.now() - productStart },
    })
    throw new Error(`Product Agent failed: ${String(err)}`)
  }
  onEvent({ type: 'agent_done', agent: 'product' })

  // 4. Architect Agent (Claude Sonnet + extended thinking)
  onEvent({
    type: 'agent_start',
    agent: 'architect',
    message: '🏗️ Architect Agent designing system (extended thinking enabled)...',
  })
  const architectStart = Date.now()

  const architectRun = await payload.create({
    collection: 'agent-runs',
    overrideAccess: true,
    data: {
      agentName: 'architect',
      codingRequest: codingRequestId,
      status: 'running',
      input: { title: codingRequest.title, productSpec },
    },
  })

  let architectureDesign = ''
  try {
    architectureDesign = await runArchitectAgent(
      {
        title: codingRequest.title,
        description: codingRequest.description,
        productSpec,
        repoContext,
      },
      (text) => onEvent({ type: 'chunk', agent: 'architect', text }),
    )
    await payload.update({
      collection: 'agent-runs',
      id: architectRun.id,
      overrideAccess: true,
      data: {
        status: 'completed',
        output: { markdown: architectureDesign },
        durationMs: Date.now() - architectStart,
      },
    })
  } catch (err) {
    await payload.update({
      collection: 'agent-runs',
      id: architectRun.id,
      overrideAccess: true,
      data: {
        status: 'failed',
        errorMessage: String(err),
        durationMs: Date.now() - architectStart,
      },
    })
    throw new Error(`Architect Agent failed: ${String(err)}`)
  }
  onEvent({ type: 'agent_done', agent: 'architect' })

  // 5. Reviewer Agent (Claude Sonnet)
  onEvent({
    type: 'agent_start',
    agent: 'reviewer',
    message: '🔎 Reviewer Agent critiquing plan...',
  })
  const reviewerStart = Date.now()

  const reviewerRun = await payload.create({
    collection: 'agent-runs',
    overrideAccess: true,
    data: {
      agentName: 'reviewer',
      codingRequest: codingRequestId,
      status: 'running',
      input: { title: codingRequest.title, productSpec, architectureDesign },
    },
  })

  let reviewFeedback = ''
  try {
    reviewFeedback = await runReviewerAgent(
      { title: codingRequest.title, productSpec, architectureDesign },
      (text) => onEvent({ type: 'chunk', agent: 'reviewer', text }),
    )
    await payload.update({
      collection: 'agent-runs',
      id: reviewerRun.id,
      overrideAccess: true,
      data: {
        status: 'completed',
        output: { markdown: reviewFeedback },
        durationMs: Date.now() - reviewerStart,
      },
    })
  } catch (err) {
    await payload.update({
      collection: 'agent-runs',
      id: reviewerRun.id,
      overrideAccess: true,
      data: {
        status: 'failed',
        errorMessage: String(err),
        durationMs: Date.now() - reviewerStart,
      },
    })
    throw new Error(`Reviewer Agent failed: ${String(err)}`)
  }
  onEvent({ type: 'agent_done', agent: 'reviewer' })

  // 6. Parse review verdict — keyword-first with o4-mini fallback
  onEvent({ type: 'start', message: '🧠 Evaluating review verdict...' })
  const verdict = await parseReviewVerdict(reviewFeedback)
  onEvent({
    type: 'verdict',
    approved: verdict.approved,
    score: verdict.score,
    reason: verdict.reason,
  })

  // 7. Save AgentPlan
  const agentPlan = await payload.create({
    collection: 'agent-plans',
    overrideAccess: true,
    data: {
      codingRequest: codingRequestId,
      productSpec: { markdown: productSpec },
      architectureDesign: { markdown: architectureDesign },
      reviewFeedback: { markdown: reviewFeedback },
      finalPlan: {
        title: codingRequest.title,
        project: projectName,
        generatedAt: new Date().toISOString(),
        repoUrl: repoUrl || null,
        prUrl: null,
      },
      verdictReason: verdict.reason.slice(0, 2000),
      reviewScore: verdict.score,
      status: verdict.approved ? 'approved' : 'needs_revision',
    },
  })
  onEvent({ type: 'plan_saved', planId: agentPlan.id })

  // 8. Create GitHub PR (optional — needs GITHUB_TOKEN)
  if (parsedRepo && process.env.GITHUB_TOKEN) {
    try {
      onEvent({ type: 'start', message: '📝 Creating GitHub PR with agent plan...' })

      const { branch: defaultBranch, sha } = await getDefaultBranchSha(
        parsedRepo.owner,
        parsedRepo.repo,
      )
      const branchName = `agent-plan/request-${codingRequestId}-${Date.now()}`

      await createBranch(parsedRepo.owner, parsedRepo.repo, branchName, sha)

      const planMarkdown = `# Agent Plan: ${codingRequest.title}

> Generated by CodeHive AI on ${new Date().toUTCString()}

---

## 📋 Product Specification

${productSpec}

---

## 🏗️ Architecture Design

${architectureDesign}

---

## 🔎 Review Feedback

${reviewFeedback}
`

      await createOrUpdateFile(
        parsedRepo.owner,
        parsedRepo.repo,
        `agent-plans/plan-request-${codingRequestId}.md`,
        planMarkdown,
        branchName,
        `feat: add AI agent plan for "${codingRequest.title}"`,
      )

      const prUrl = await createPullRequest(
        parsedRepo.owner,
        parsedRepo.repo,
        `[Agent Plan] ${codingRequest.title}`,
        `## 🤖 AI-Generated Plan\n\nThis PR was automatically created by **CodeHive AI** agents.\n\n| Field | Value |\n|---|---|\n| **Coding Request** | #${codingRequestId} |\n| **Project** | ${projectName} |\n| **Review Score** | ${verdict.score !== null ? `${verdict.score}/10` : 'N/A'} |\n| **Status** | ${verdict.approved ? '✅ Approved' : '⚠️ Needs Revision'} |\n\n${!verdict.approved ? `### ⚠️ Reviewer Concerns\n\n${verdict.reason}\n\n` : ''}See \`agent-plans/plan-request-${codingRequestId}.md\` for the full plan.`,
        branchName,
        defaultBranch,
      )

      onEvent({ type: 'pr_created', url: prUrl })

      await payload.update({
        collection: 'agent-plans',
        id: agentPlan.id,
        overrideAccess: true,
        data: {
          finalPlan: {
            title: codingRequest.title,
            project: projectName,
            generatedAt: new Date().toISOString(),
            repoUrl,
            prUrl,
          },
        },
      })
    } catch (err) {
      onEvent({ type: 'start', message: `⚠️ GitHub PR creation failed: ${String(err)}` })
    }
  }

  // 9. Update CodingRequest status
  await payload.update({
    collection: 'coding-requests',
    id: codingRequestId,
    overrideAccess: true,
    data: { status: verdict.approved ? 'approved' : 'submitted' },
  })

  onEvent({ type: 'done' })
}
