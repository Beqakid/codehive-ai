/**
 * @module orchestrator
 * @description Main AI agent pipeline orchestrator. Coordinates Product, Architect,
 * UI/UX, and Reviewer agents in sequence with live SSE streaming. Fetches GitHub repo
 * context, saves AgentRuns/AgentPlan to Payload, and creates GitHub branches and PRs.
 * Exports: runOrchestrator, parseReviewVerdict, SSEEvent.
 * @note All Payload operations use overrideAccess: true (system-level).
 */

import type { Payload } from 'payload'
import { runProductAgent } from './productAgent'
import { runArchitectAgent } from './architectAgent'
import { runUIUXAgent } from './uiuxAgent'
import { runReviewerAgent } from './reviewerAgent'
import {
  getRepoContext,
  parseGithubUrl,
  getDefaultBranchSha,
  createBranch,
  createOrUpdateFile,
  createPullRequest,
} from '../lib/github'
import { withRetry } from '../lib/retry'

export type SSEEvent =
  | { type: 'start'; message: string }
  | { type: 'github_context'; files: number; structure: string }
  | { type: 'agent_start'; agent: string; message: string }
  | { type: 'chunk'; agent: string; text: string }
  | { type: 'agent_done'; agent: string }
  | { type: 'agent_output'; agent: string; content: string }
  | { type: 'verdict'; approved: boolean; score: number | null; reason: string }
  | { type: 'pr_created'; url: string }
  | { type: 'plan_saved'; planId: number }
  | { type: 'done' }
  | { type: 'error'; message: string }

/**
 * Extract numeric review score from review text.
 */
export function extractReviewScore(reviewText: string): number | null {
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
 */
function extractVerdictReason(reviewText: string, isApproved: boolean): string {
  if (isApproved) return 'Reviewer approved the plan.'

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

  return reviewText.slice(-300).trim()
}

/**
 * Keyword-first verdict parsing with score threshold gate and o4-mini tiebreaker.
 * Exported so re-review route can reuse it.
 */
export async function parseReviewVerdict(reviewText: string): Promise<{
  approved: boolean
  score: number | null
  reason: string
}> {
  const fullTextUpper = reviewText.toUpperCase()
  const score = extractReviewScore(reviewText)

  // Step 1: High score overrides any negative keywords
  if (score !== null && score >= 7.5) {
    return { approved: true, score, reason: 'Reviewer approved the plan.' }
  }

  // Step 2: Explicit negative keywords (only when score is low/unknown)
  const negativeKeywords = [
    'NEEDS_REVISION', 'NEEDS REVISION', 'NOT_APPROVED', 'NOT APPROVED',
    'REJECTED', 'DO NOT PROCEED', 'CANNOT APPROVE', 'RECOMMEND REVISION',
  ]
  const hasExplicitNegative = negativeKeywords.some((kw) => fullTextUpper.includes(kw))

  if (hasExplicitNegative) {
    const reason = extractVerdictReason(reviewText, false)
    return { approved: false, score, reason }
  }

  // Step 3: Low score = not approved
  if (score !== null && score < 7.5) {
    const reason = extractVerdictReason(reviewText, false)
    return { approved: false, score, reason: `Score ${score}/10 below threshold (7.5). ${reason}` }
  }

  // Step 4: Explicit positive keywords
  const positiveKeywords = ['APPROVED', 'LGTM', 'READY TO PROCEED', 'SHIP IT', 'PROCEED WITH']
  const hasExplicitPositive = positiveKeywords.some((kw) => fullTextUpper.includes(kw))

  if (hasExplicitPositive && (score === null || score >= 7.5)) {
    const reason = extractVerdictReason(reviewText, true)
    return { approved: true, score, reason }
  }

  // Step 5: High score alone = approved
  if (score !== null && score >= 8.0) {
    return { approved: true, score, reason: `Score ${score}/10 — reviewer gave high marks.` }
  }

  // Step 6: Ambiguous — use o4-mini as tiebreaker
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return {
      approved: false,
      score,
      reason: 'Could not determine verdict (no API key). Defaulting to needs revision.',
    }
  }

  try {
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
            content: `You are a plan evaluation assistant. Read the following technical review and determine if the overall verdict is APPROVED (ready to proceed to code generation) or NOT_APPROVED (needs revision, has critical issues, or is rejected).\n\nIMPORTANT: Look for explicit verdict statements like "Final Verdict:", "Recommendation:", or score-based decisions. A score below 7.5/10 means NOT_APPROVED.\n\nRespond with ONLY the word: APPROVED or NOT_APPROVED\n\n---\n${combinedText}`,
          },
        ],
        max_completion_tokens: 10,
      }),
    })

    if (!response.ok) {
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

  // 1. Load CodingRequest
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
  onEvent({ type: 'agent_output', agent: 'product', content: productSpec })

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
  onEvent({ type: 'agent_output', agent: 'architect', content: architectureDesign })

  // 5. UI/UX Design Agent (Claude Sonnet 4.6)
  onEvent({
    type: 'agent_start',
    agent: 'uiux',
    message: '🎨 UI/UX Designer crafting interface blueprint...',
  })
  const uiuxStart = Date.now()

  const uiuxRun = await payload.create({
    collection: 'agent-runs',
    overrideAccess: true,
    data: {
      agentName: 'uiux',
      codingRequest: codingRequestId,
      status: 'running',
      input: { title: codingRequest.title, productSpec, architectureDesign },
    },
  })

  let uiuxDesign = ''
  try {
    uiuxDesign = await runUIUXAgent(
      {
        title: codingRequest.title,
        description: codingRequest.description,
        productSpec,
        architectureDesign,
      },
      (text) => onEvent({ type: 'chunk', agent: 'uiux', text }),
    )
    await payload.update({
      collection: 'agent-runs',
      id: uiuxRun.id,
      overrideAccess: true,
      data: {
        status: 'completed',
        output: { markdown: uiuxDesign },
        durationMs: Date.now() - uiuxStart,
      },
    })
  } catch (err) {
    await payload.update({
      collection: 'agent-runs',
      id: uiuxRun.id,
      overrideAccess: true,
      data: {
        status: 'failed',
        errorMessage: String(err),
        durationMs: Date.now() - uiuxStart,
      },
    })
    throw new Error(`UI/UX Agent failed: ${String(err)}`)
  }
  onEvent({ type: 'agent_done', agent: 'uiux' })
  onEvent({ type: 'agent_output', agent: 'uiux', content: uiuxDesign })

  // 6. Reviewer Agent (Claude Sonnet)
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
  onEvent({ type: 'agent_output', agent: 'reviewer', content: reviewFeedback })

  // 7. Parse review verdict
  onEvent({ type: 'start', message: '🧠 Evaluating review verdict...' })
  const verdict = await parseReviewVerdict(reviewFeedback)
  onEvent({
    type: 'verdict',
    approved: verdict.approved,
    score: verdict.score,
    reason: verdict.reason,
  })

  // 8. Save AgentPlan — uiuxDesign stored in finalPlan JSON (no schema migration needed)
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
        uiuxDesign: uiuxDesign,
      },
      verdictReason: verdict.reason.slice(0, 2000),
      reviewScore: verdict.score,
      status: verdict.approved ? 'approved' : 'needs_revision',
    },
  })
  onEvent({ type: 'plan_saved', planId: agentPlan.id })

  // 9. Create GitHub PR
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

## 🎨 UI/UX Design

${uiuxDesign}

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

      const prUrl = await withRetry(
        () =>
          createPullRequest(
            parsedRepo.owner,
            parsedRepo.repo,
            `[Agent Plan] ${codingRequest.title}`,
            `## 🤖 AI-Generated Plan\n\nThis PR was automatically created by **CodeHive AI** agents.\n\n| Field | Value |\n|---|---|\n| **Coding Request** | #${codingRequestId} |\n| **Project** | ${projectName} |\n| **Review Score** | ${verdict.score !== null ? `${verdict.score}/10` : 'N/A'} |\n| **Status** | ${verdict.approved ? '✅ Approved' : '⚠️ Needs Revision'} |\n\n${!verdict.approved ? `### ⚠️ Reviewer Concerns\n\n${verdict.reason}\n\n` : ''}See \`agent-plans/plan-request-${codingRequestId}.md\` for the full plan.`,
            branchName,
            defaultBranch,
          ),
        { maxRetries: 2, baseDelayMs: 2000 },
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
            uiuxDesign: uiuxDesign,
          },
        },
      })
    } catch (err) {
      onEvent({ type: 'start', message: `⚠️ GitHub PR creation failed: ${String(err)}` })
    }
  }

  // 10. Update CodingRequest status
  await payload.update({
    collection: 'coding-requests',
    id: codingRequestId,
    overrideAccess: true,
    data: { status: verdict.approved ? 'approved' : 'submitted' },
  })

  onEvent({ type: 'done' })
}
