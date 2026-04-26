/**
 * Orchestrator — Phase 2
 *
 * Coordinates the agent pipeline with live SSE streaming:
 * 1. Load CodingRequest from Payload
 * 2. Fetch GitHub repo context
 * 3. Run Product Agent (OpenAI GPT-4o) → stream chunks
 * 4. Run Architect Agent (Anthropic Claude) → stream chunks
 * 5. Run Reviewer Agent (OpenAI GPT-4o) → stream chunks
 * 6. Save AgentRuns + AgentPlan to Payload
 * 7. Create GitHub branch + file + PR
 * 8. Update CodingRequest status
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
  | { type: 'pr_created'; url: string }
  | { type: 'plan_saved'; planId: number }
  | { type: 'done' }
  | { type: 'error'; message: string }

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
  })

  if (!codingRequest) {
    throw new Error(`CodingRequest ${codingRequestId} not found`)
  }

  await payload.update({
    collection: 'coding-requests',
    id: codingRequestId,
    data: { status: 'planning' },
  })

  const projectObj = codingRequest.project
  const projectName =
    typeof projectObj === 'object' && projectObj !== null && 'name' in projectObj
      ? String((projectObj as Record<string, unknown>).name)
      : 'Unknown Project'
  const repoUrl =
    typeof projectObj === 'object' && projectObj !== null && 'repoUrl' in projectObj
      ? String((projectObj as Record<string, unknown>).repoUrl || '')
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
      data: { status: 'failed', errorMessage: String(err), durationMs: Date.now() - productStart },
    })
    throw new Error(`Product Agent failed: ${String(err)}`)
  }
  onEvent({ type: 'agent_done', agent: 'product' })

  // 4. Architect Agent
  onEvent({
    type: 'agent_start',
    agent: 'architect',
    message: '🏗️ Architect Agent designing system...',
  })
  const architectStart = Date.now()

  const architectRun = await payload.create({
    collection: 'agent-runs',
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
      data: {
        status: 'failed',
        errorMessage: String(err),
        durationMs: Date.now() - architectStart,
      },
    })
    throw new Error(`Architect Agent failed: ${String(err)}`)
  }
  onEvent({ type: 'agent_done', agent: 'architect' })

  // 5. Reviewer Agent
  onEvent({
    type: 'agent_start',
    agent: 'reviewer',
    message: '🔎 Reviewer Agent critiquing plan...',
  })
  const reviewerStart = Date.now()

  const reviewerRun = await payload.create({
    collection: 'agent-runs',
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
      data: {
        status: 'failed',
        errorMessage: String(err),
        durationMs: Date.now() - reviewerStart,
      },
    })
    throw new Error(`Reviewer Agent failed: ${String(err)}`)
  }
  onEvent({ type: 'agent_done', agent: 'reviewer' })

  // 6. Save AgentPlan
  const isApproved = reviewFeedback.toLowerCase().includes('approved')
  const agentPlan = await payload.create({
    collection: 'agent-plans',
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
      status: isApproved ? 'approved' : 'draft',
    },
  })
  onEvent({ type: 'plan_saved', planId: agentPlan.id })

  // 7. Create GitHub PR (optional — needs GITHUB_TOKEN)
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
        `## 🤖 AI-Generated Plan\n\nThis PR was automatically created by **CodeHive AI** agents.\n\n| Field | Value |\n|---|---|\n| **Coding Request** | #${codingRequestId} |\n| **Project** | ${projectName} |\n| **Status** | ${isApproved ? '✅ Approved' : '📝 Needs Review'} |\n\nSee \`agent-plans/plan-request-${codingRequestId}.md\` for the full plan.`,
        branchName,
        defaultBranch,
      )

      onEvent({ type: 'pr_created', url: prUrl })

      // Update finalPlan with PR URL
      await payload.update({
        collection: 'agent-plans',
        id: agentPlan.id,
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

  // 8. Update CodingRequest status
  await payload.update({
    collection: 'coding-requests',
    id: codingRequestId,
    data: { status: isApproved ? 'approved' : 'submitted' },
  })

  onEvent({ type: 'done' })
}
