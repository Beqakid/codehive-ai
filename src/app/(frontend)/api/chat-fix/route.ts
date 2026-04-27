/**
 * @module /api/chat-fix
 * @description Interactive fix chat API. Supports two actions:
 * - "chat": streams AI responses via SSE for conversational debugging
 * - "apply": commits proposed fix files to the branch and triggers sandbox
 * Single endpoint, TransformStream pattern (CF Workers compatible).
 */

import { getPayload } from 'payload'
import config from '@/payload.config'
import {
  streamChatFix,
  extractFixProposal,
  stripFixProposal,
  type ChatMessage,
  type FixContext,
} from '@/agents/chatFixAgent'
import { createOrUpdateFile, parseGithubUrl } from '@/lib/github'

export async function POST(req: Request) {
  const body = await req.json()
  const { action = 'chat', planId, messages, files } = body as {
    action?: 'chat' | 'apply'
    planId: number
    messages?: ChatMessage[]
    files?: Array<{ path: string; content: string }>
  }

  if (!planId) {
    return new Response(JSON.stringify({ error: 'planId required' }), { status: 400 })
  }

  const payloadConfig = await config
  const payload = await getPayload({ config: payloadConfig })

  const { readable, writable } = new TransformStream()
  const writer = writable.getWriter()
  const encoder = new TextEncoder()

  const write = (event: object) => {
    writer.write(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)).catch(() => {})
  }

  if (action === 'apply') {
    handleApply(payload, planId, files || [], write, writer)
  } else {
    handleChat(payload, planId, messages || [], write, writer)
  }

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}

// ── Chat Handler ─────────────────────────────────────────────────────

function handleChat(
  payload: ReturnType<typeof getPayload> extends Promise<infer T> ? T : never,
  planId: number,
  messages: ChatMessage[],
  write: (event: object) => void,
  writer: WritableStreamDefaultWriter,
) {
  ;(async () => {
    try {
      if (messages.length === 0) {
        write({ type: 'error', message: 'At least one message is required' })
        return
      }

      const context = await loadFixContext(payload, planId)

      const fullText = await streamChatFix(context, messages, (chunk) => {
        write({ type: 'chunk', text: chunk })
      })

      // Check for fix proposal in the response
      const proposal = extractFixProposal(fullText)
      const displayText = stripFixProposal(fullText)

      if (proposal) {
        write({
          type: 'fix_proposal',
          summary: proposal.summary,
          files: proposal.files,
        })
      }

      write({ type: 'done', fullText: displayText })
    } catch (err) {
      write({ type: 'error', message: String(err) })
    } finally {
      writer.close().catch(() => {})
    }
  })()
}

// ── Apply Handler ────────────────────────────────────────────────────

function handleApply(
  payload: ReturnType<typeof getPayload> extends Promise<infer T> ? T : never,
  planId: number,
  files: Array<{ path: string; content: string }>,
  write: (event: object) => void,
  writer: WritableStreamDefaultWriter,
) {
  ;(async () => {
    try {
      if (files.length === 0) {
        write({ type: 'error', message: 'No files to apply' })
        return
      }

      const { owner, repo, branchName } = await resolveRepoInfo(payload, planId)
      if (!owner || !repo || !branchName) {
        write({ type: 'error', message: 'Could not determine repo/branch info from plan data' })
        return
      }

      write({
        type: 'status',
        message: `📝 Committing ${files.length} file(s) to ${owner}/${repo}@${branchName}...`,
      })

      const committed: string[] = []
      for (const file of files) {
        try {
          await createOrUpdateFile(
            owner,
            repo,
            file.path,
            file.content,
            branchName,
            `fix(chat): update ${file.path}`,
          )
          committed.push(file.path)
          write({ type: 'file_committed', path: file.path })
        } catch (err) {
          write({ type: 'error', message: `Failed to commit ${file.path}: ${String(err)}` })
        }
      }

      if (committed.length === 0) {
        write({ type: 'done', filesCommitted: [] })
        return
      }

      // Trigger sandbox workflow via .sandbox-trigger file
      write({ type: 'status', message: '🔄 Triggering sandbox workflow...' })

      const token = process.env.GITHUB_TOKEN
      const headers: Record<string, string> = {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'codehive-ai/5.0',
        'Content-Type': 'application/json',
      }
      if (token) headers.Authorization = `Bearer ${token}`

      const triggerPath = '.sandbox-trigger'
      let triggerSha: string | undefined

      try {
        const getResp = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/contents/${triggerPath}?ref=${encodeURIComponent(branchName)}`,
          { headers },
        )
        if (getResp.ok) {
          const existing = (await getResp.json()) as { sha: string }
          triggerSha = existing.sha
        }
      } catch {
        // file may not exist
      }

      const triggerBody: Record<string, unknown> = {
        message: '🔄 trigger chat-fix sandbox',
        content: btoa(`chat-fix-${Date.now()}`),
        branch: branchName,
      }
      if (triggerSha) triggerBody.sha = triggerSha

      const putResp = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${triggerPath}`,
        { method: 'PUT', headers, body: JSON.stringify(triggerBody) },
      )

      if (putResp.ok) {
        write({
          type: 'sandbox_triggered',
          message: '✅ Fix committed & sandbox triggered! Use "Run & Fix" above to monitor.',
        })
      } else {
        write({ type: 'error', message: 'Committed files but could not trigger sandbox workflow.' })
      }

      write({ type: 'done', filesCommitted: committed })
    } catch (err) {
      write({ type: 'error', message: String(err) })
    } finally {
      writer.close().catch(() => {})
    }
  })()
}

// ── Context Loaders ──────────────────────────────────────────────────

async function loadFixContext(payload: any, planId: number): Promise<FixContext> {
  let projectName = 'Unknown Project'
  let planSummary = ''
  let branchName = ''
  let prNumber = 0

  try {
    const plan = await payload.findByID({
      collection: 'agent-plans',
      id: planId,
      overrideAccess: true,
    })

    // Extract plan summary
    const spec = plan.productSpec
    if (typeof spec === 'string') planSummary = spec
    else if (spec?.markdown) planSummary = spec.markdown

    // Extract PR info
    if (plan.finalPlan?.prUrl) {
      const prMatch = plan.finalPlan.prUrl.match(/\/pull\/(\d+)/)
      if (prMatch) prNumber = parseInt(prMatch[1])
    }

    // Get project name via codingRequest → project chain
    if (plan.codingRequest) {
      const crId =
        typeof plan.codingRequest === 'number' ? plan.codingRequest : plan.codingRequest
      try {
        const cr = await payload.findByID({
          collection: 'coding-requests',
          id: crId,
          overrideAccess: true,
        })
        if (cr?.project) {
          const projId = typeof cr.project === 'number' ? cr.project : cr.project
          try {
            const project = await payload.findByID({
              collection: 'projects',
              id: projId,
              overrideAccess: true,
            })
            projectName = (project as any)?.name || projectName
          } catch {
            // ignore
          }
        }
      } catch {
        // ignore
      }
    }
  } catch {
    // best effort
  }

  // Load fix attempts
  const fixAttempts: FixContext['fixAttempts'] = []
  try {
    const faRes = await payload.find({
      collection: 'fix-attempts',
      where: { agentPlan: { equals: planId } },
      sort: 'attemptNumber',
      limit: 10,
      overrideAccess: true,
    })

    for (const doc of faRes.docs) {
      const a = doc as any
      branchName = a.branchName || branchName
      prNumber = a.prNumber || prNumber
      fixAttempts.push({
        attemptNumber: a.attemptNumber,
        status: a.status,
        errorCategory: a.errorCategory || 'unknown',
        errorSummary: a.errorSummary || '',
        fixSummary: a.fixSummary || undefined,
        filesUpdated: a.filesUpdated || undefined,
        confidence: a.confidence || undefined,
        riskLevel: a.riskLevel || undefined,
        rawLogs: a.rawLogs || undefined,
      })
    }
  } catch {
    // best effort
  }

  return { projectName, branchName, prNumber, planSummary, fixAttempts }
}

async function resolveRepoInfo(
  payload: any,
  planId: number,
): Promise<{ owner: string; repo: string; branchName: string }> {
  let owner = ''
  let repo = ''
  let branchName = ''

  // Try fix attempts for branchName
  try {
    const faRes = await payload.find({
      collection: 'fix-attempts',
      where: { agentPlan: { equals: planId } },
      limit: 1,
      overrideAccess: true,
    })
    if (faRes.docs[0]) {
      branchName = (faRes.docs[0] as any).branchName || ''
    }
  } catch {
    // ignore
  }

  // Get owner/repo from plan's PR URL or project repoUrl
  try {
    const plan = await payload.findByID({
      collection: 'agent-plans',
      id: planId,
      overrideAccess: true,
    })

    // Try PR URL first
    if (plan.finalPlan?.prUrl) {
      const parsed = parseGithubUrl(plan.finalPlan.prUrl)
      if (parsed) {
        owner = parsed.owner
        repo = parsed.repo
      }
    }

    // If no branch from fix attempts, get from PR API
    if (!branchName && plan.finalPlan?.prUrl && owner && repo) {
      const prMatch = plan.finalPlan.prUrl.match(/\/pull\/(\d+)/)
      if (prMatch) {
        const token = process.env.GITHUB_TOKEN
        const headers: Record<string, string> = {
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'codehive-ai/5.0',
        }
        if (token) headers.Authorization = `Bearer ${token}`

        const prResp = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/pulls/${prMatch[1]}`,
          { headers },
        )
        if (prResp.ok) {
          const prData = (await prResp.json()) as { head?: { ref?: string } }
          branchName = prData.head?.ref || ''
        }
      }
    }

    // Fallback: get owner/repo from project's repoUrl
    if (!owner || !repo) {
      if (plan.codingRequest) {
        const crId =
          typeof plan.codingRequest === 'number' ? plan.codingRequest : plan.codingRequest
        try {
          const cr = await payload.findByID({
            collection: 'coding-requests',
            id: crId,
            overrideAccess: true,
          })
          if (cr?.project) {
            const projId = typeof cr.project === 'number' ? cr.project : cr.project
            const project = await payload.findByID({
              collection: 'projects',
              id: projId,
              overrideAccess: true,
            })
            if ((project as any)?.repoUrl) {
              const parsed = parseGithubUrl((project as any).repoUrl)
              if (parsed) {
                owner = parsed.owner
                repo = parsed.repo
              }
            }
          }
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // ignore
  }

  return { owner, repo, branchName }
}
