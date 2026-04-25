/**
 * Orchestrator — Phase 1
 *
 * Coordinates the agent pipeline:
 * 1. Load CodingRequest from Payload
 * 2. Run Product Agent → save AgentRun
 * 3. Run Architect Agent → save AgentRun
 * 4. Run Reviewer Agent → save AgentRun
 * 5. Create consolidated AgentPlan
 * 6. Update CodingRequest status
 */

import type { Payload } from 'payload'
import { runProductAgent, type ProductSpec } from './productAgent'
import { runArchitectAgent, type ArchitectureDesign } from './architectAgent'
import { runReviewerAgent, type ReviewFeedback } from './reviewerAgent'

interface OrchestratorResult {
  agentPlan: any
  runs: {
    product: any
    architect: any
    reviewer: any
  }
}

async function createAgentRun(
  payload: Payload,
  agentName: 'product' | 'architect' | 'reviewer' | 'orchestrator',
  codingRequestId: number,
  input: any,
) {
  return payload.create({
    collection: 'agent-runs',
    data: {
      agentName,
      codingRequest: codingRequestId,
      status: 'running',
      input,
    },
  })
}

async function completeAgentRun(
  payload: Payload,
  runId: number,
  output: any,
  startTime: number,
) {
  return payload.update({
    collection: 'agent-runs',
    id: runId,
    data: {
      status: 'completed',
      output,
      durationMs: Date.now() - startTime,
    },
  })
}

async function failAgentRun(
  payload: Payload,
  runId: number,
  error: string,
  startTime: number,
) {
  return payload.update({
    collection: 'agent-runs',
    id: runId,
    data: {
      status: 'failed',
      errorMessage: error,
      durationMs: Date.now() - startTime,
    },
  })
}

export async function runOrchestrator(
  payload: Payload,
  codingRequestId: number,
): Promise<OrchestratorResult> {
  // 1. Load the CodingRequest
  const codingRequest = await payload.findByID({
    collection: 'coding-requests',
    id: codingRequestId,
    depth: 1, // populate relationships
  })

  if (!codingRequest) {
    throw new Error(`CodingRequest with id ${codingRequestId} not found`)
  }

  // Update status to planning
  await payload.update({
    collection: 'coding-requests',
    id: codingRequestId,
    data: { status: 'planning' },
  })

  const projectName =
    typeof codingRequest.project === 'object' && codingRequest.project !== null
      ? (codingRequest.project as any).name ?? 'Unknown Project'
      : 'Unknown Project'

  // 2. Run Product Agent
  let productSpec: ProductSpec
  const productRun = await createAgentRun(payload, 'product', codingRequestId, {
    title: codingRequest.title,
    description: codingRequest.description,
  })
  const productStart = Date.now()
  try {
    productSpec = await runProductAgent({
      title: codingRequest.title,
      description: codingRequest.description,
      projectName,
    })
    await completeAgentRun(payload, productRun.id, productSpec, productStart)
  } catch (err) {
    await failAgentRun(payload, productRun.id, String(err), productStart)
    throw new Error(`Product Agent failed: ${err}`)
  }

  // 3. Run Architect Agent
  let architectureDesign: ArchitectureDesign
  const architectRun = await createAgentRun(payload, 'architect', codingRequestId, {
    title: codingRequest.title,
    productSpec,
  })
  const architectStart = Date.now()
  try {
    architectureDesign = await runArchitectAgent({
      title: codingRequest.title,
      description: codingRequest.description,
      productSpec,
    })
    await completeAgentRun(payload, architectRun.id, architectureDesign, architectStart)
  } catch (err) {
    await failAgentRun(payload, architectRun.id, String(err), architectStart)
    throw new Error(`Architect Agent failed: ${err}`)
  }

  // 4. Run Reviewer Agent
  let reviewFeedback: ReviewFeedback
  const reviewerRun = await createAgentRun(payload, 'reviewer', codingRequestId, {
    title: codingRequest.title,
    productSpec,
    architectureDesign,
  })
  const reviewerStart = Date.now()
  try {
    reviewFeedback = await runReviewerAgent({
      title: codingRequest.title,
      productSpec,
      architectureDesign,
    })
    await completeAgentRun(payload, reviewerRun.id, reviewFeedback, reviewerStart)
  } catch (err) {
    await failAgentRun(payload, reviewerRun.id, String(err), reviewerStart)
    throw new Error(`Reviewer Agent failed: ${err}`)
  }

  // 5. Create the consolidated AgentPlan
  const finalPlan = {
    title: codingRequest.title,
    project: projectName,
    generatedAt: new Date().toISOString(),
    productSpec,
    architectureDesign,
    reviewFeedback,
    approved: reviewFeedback.verdict === 'approved',
  }

  const agentPlan = await payload.create({
    collection: 'agent-plans',
    data: {
      codingRequest: codingRequestId,
      productSpec,
      architectureDesign,
      reviewFeedback,
      finalPlan,
      status: reviewFeedback.verdict === 'approved' ? 'approved' : 'draft',
    },
  })

  // 6. Update CodingRequest status based on review verdict
  const newStatus = reviewFeedback.verdict === 'approved' ? 'approved' : 'submitted'
  await payload.update({
    collection: 'coding-requests',
    id: codingRequestId,
    data: { status: newStatus },
  })

  return {
    agentPlan,
    runs: {
      product: productRun,
      architect: architectRun,
      reviewer: reviewerRun,
    },
  }
}
