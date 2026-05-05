/**
 * Project Manager Agent — Full agentic loop using raw fetch (no SDK).
 * Uses Anthropic tool use API directly to read files, check CI, inspect logs.
 * Streams SSE events: tool_call, tool_result, text_delta, done, error.
 */

import { parseAnthropicStream } from '../lib/stream-parsers'

export interface ProjectContext {
  projectId: number
  projectName: string
  repoOwner: string
  repoName: string
  repoBranch?: string
  plans: Array<{
    id: number
    status: string
    verdictScore?: number
    productSpec?: string
    architectureDesign?: string
    uiuxDesign?: string
    reviewerFeedback?: string
  }>
  fixAttempts: Array<{
    id: number
    attemptNumber: number
    status: string
    errorCategory?: string
    errorSummary?: string
    fixSummary?: string
    confidence?: number
    needsHumanReview?: boolean
    pullRequestUrl?: string
    branchName?: string
  }>
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

type SSEEmit = (event: string, data: unknown) => void

// ─── Tool definitions ─────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'read_repo_file',
    description: 'Read the content of a file from the GitHub repository. Use this to inspect source code, configs, test files, etc.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path relative to repo root, e.g. "src/index.ts" or "package.json"' },
      },
      required: ['path'],
    },
  },
  {
    name: 'list_repo_files',
    description: 'List files in a directory of the GitHub repository.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory path, e.g. "src" or "src/routes". Use "" for root.' },
      },
      required: ['path'],
    },
  },
  {
    name: 'get_ci_status',
    description: 'Get the latest GitHub Actions workflow run status for the project repo or a specific branch.',
    input_schema: {
      type: 'object',
      properties: {
        branch: { type: 'string', description: 'Branch name to filter by. Optional.' },
      },
      required: [],
    },
  },
  {
    name: 'get_ci_job_steps',
    description: 'Get the detailed step-by-step breakdown of a specific CI run to identify exactly which step failed and why.',
    input_schema: {
      type: 'object',
      properties: {
        run_id: { type: 'string', description: 'The GitHub Actions run ID (numeric string).' },
      },
      required: ['run_id'],
    },
  },
]

// ─── Tool executors ───────────────────────────────────────────────────────────

async function execReadRepoFile(
  owner: string,
  repo: string,
  path: string,
  token: string,
): Promise<string> {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' },
  })
  if (!res.ok) return `Error: ${res.status} — file not found or inaccessible at ${path}`
  const data = await res.json() as { content?: string; encoding?: string; message?: string }
  if (data.message) return `Error: ${data.message}`
  if (data.encoding === 'base64' && data.content) {
    const decoded = Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf-8')
    // Cap at 6000 chars to avoid context overload
    if (decoded.length > 6000) return decoded.slice(0, 6000) + '\n\n[...truncated at 6000 chars]'
    return decoded
  }
  return 'Error: unexpected response format'
}

async function execListRepoFiles(
  owner: string,
  repo: string,
  path: string,
  token: string,
): Promise<string> {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' },
  })
  if (!res.ok) return `Error: ${res.status} — directory not found at "${path}"`
  const data = await res.json() as Array<{ name: string; type: string; size?: number }>
  if (!Array.isArray(data)) return 'Error: not a directory'
  const lines = data.map(f => `${f.type === 'dir' ? '📁' : '📄'} ${f.name}${f.type === 'file' && f.size ? ` (${f.size}b)` : ''}`)
  return lines.join('\n')
}

async function execGetCIStatus(
  owner: string,
  repo: string,
  branch: string | undefined,
  token: string,
): Promise<string> {
  let url = `https://api.github.com/repos/${owner}/${repo}/actions/runs?per_page=5`
  if (branch) url += `&branch=${encodeURIComponent(branch)}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' },
  })
  if (!res.ok) return `Error: ${res.status} — could not fetch CI runs`
  const data = await res.json() as { workflow_runs?: Array<{ id: number; name: string; status: string; conclusion: string | null; head_branch: string; head_sha: string; created_at: string; html_url: string }> }
  const runs = data.workflow_runs ?? []
  if (runs.length === 0) return 'No CI runs found.'
  return runs.map(r => (
    `Run #${r.id}: ${r.name}\n  Branch: ${r.head_branch}\n  Status: ${r.status} / ${r.conclusion ?? 'in_progress'}\n  SHA: ${r.head_sha.slice(0, 7)}\n  At: ${r.created_at}\n  URL: ${r.html_url}`
  )).join('\n\n')
}

async function execGetCIJobSteps(
  owner: string,
  repo: string,
  runId: string,
  token: string,
): Promise<string> {
  const url = `https://api.github.com/repos/${owner}/${repo}/actions/runs/${runId}/jobs`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' },
  })
  if (!res.ok) return `Error: ${res.status} — could not fetch jobs for run ${runId}`
  const data = await res.json() as { jobs?: Array<{ id: number; name: string; status: string; conclusion: string | null; steps?: Array<{ name: string; status: string; conclusion: string | null; number: number }> }> }
  const jobs = data.jobs ?? []
  if (jobs.length === 0) return 'No jobs found.'
  return jobs.map(j => {
    const steps = (j.steps ?? []).map(s => `    Step ${s.number}: ${s.name} — ${s.conclusion ?? s.status}`).join('\n')
    return `Job: ${j.name} [${j.conclusion ?? j.status}]\n${steps}`
  }).join('\n\n')
}

// ─── Tool dispatcher ──────────────────────────────────────────────────────────

async function dispatchTool(
  toolName: string,
  toolInput: Record<string, string>,
  ctx: ProjectContext,
  token: string,
): Promise<string> {
  switch (toolName) {
    case 'read_repo_file':
      return execReadRepoFile(ctx.repoOwner, ctx.repoName, toolInput.path, token)
    case 'list_repo_files':
      return execListRepoFiles(ctx.repoOwner, ctx.repoName, toolInput.path ?? '', token)
    case 'get_ci_status':
      return execGetCIStatus(ctx.repoOwner, ctx.repoName, toolInput.branch, token)
    case 'get_ci_job_steps':
      return execGetCIJobSteps(ctx.repoOwner, ctx.repoName, toolInput.run_id, token)
    default:
      return `Error: unknown tool "${toolName}"`
  }
}

// ─── System prompt builder ────────────────────────────────────────────────────

function buildSystemPrompt(ctx: ProjectContext): string {
  const latestPlan = ctx.plans[ctx.plans.length - 1]
  const latestFix = ctx.fixAttempts[ctx.fixAttempts.length - 1]

  const planSummary = latestPlan
    ? `Status: ${latestPlan.status}${latestPlan.verdictScore ? ` (score ${latestPlan.verdictScore}/10)` : ''}`
    : 'No plans yet'

  const fixSummary = ctx.fixAttempts.length > 0
    ? `${ctx.fixAttempts.length} fix attempt(s). Latest: ${latestFix?.status ?? 'unknown'} — ${latestFix?.errorSummary ?? 'no summary'}`
    : 'No fix attempts'

  const planContext = latestPlan ? `
## Latest Plan
- Product Spec: ${latestPlan.productSpec?.slice(0, 800) ?? 'none'}
- Architecture: ${latestPlan.architectureDesign?.slice(0, 800) ?? 'none'}
- UI/UX: ${latestPlan.uiuxDesign?.slice(0, 400) ?? 'none'}
- Reviewer: ${latestPlan.reviewerFeedback?.slice(0, 600) ?? 'none'}` : ''

  const fixContext = ctx.fixAttempts.length > 0 ? `
## Fix History
${ctx.fixAttempts.map(f => `- Attempt #${f.attemptNumber}: ${f.status} | ${f.errorCategory ?? 'unknown'} | confidence: ${f.confidence ?? '?'} | ${f.errorSummary ?? ''}`).join('\n')}` : ''

  return `You are the Project Manager Agent for "${ctx.projectName}" — a highly capable AI assistant embedded inside CodeHive AI.

You have full context of this project and live tools to inspect the GitHub repo and CI pipeline.

## Project
- Name: ${ctx.projectName}
- Repo: ${ctx.repoOwner}/${ctx.repoName}
- Branch: ${ctx.repoBranch ?? 'main'}

## Current State
- Plans: ${planSummary}
- Fixes: ${fixSummary}
${planContext}
${fixContext}

## Your capabilities
You have 4 live tools:
1. read_repo_file — read any file in the repo
2. list_repo_files — list directory contents
3. get_ci_status — check latest CI runs (optionally by branch)
4. get_ci_job_steps — drill into a specific run's job steps to find failures

## How to behave
- Be direct and specific — cite file names, line numbers, test names when you know them
- Use tools proactively to give accurate answers (don't guess if you can check)
- When diagnosing failures: check CI → drill into failed job → read the relevant source file
- Suggest concrete next steps the developer can take
- Format responses with markdown — use headers, code blocks, bullet points
- Be honest about uncertainty — say when you need to check something
- You are compared to Tasklet (the parent AI) — match its quality: thorough, tool-driven, concise

When asked for a "briefing", always:
1. Check CI status first
2. Read package.json to understand the tech stack
3. Summarize: plan status, CI health, fix history, recommended next action`
}

// ─── Main agentic loop ────────────────────────────────────────────────────────

export async function runProjectChat(
  ctx: ProjectContext,
  history: ChatMessage[],
  userMessage: string,
  emit: SSEEmit,
): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  const githubToken = process.env.GITHUB_TOKEN
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')
  if (!githubToken) throw new Error('GITHUB_TOKEN not configured')

  const systemPrompt = buildSystemPrompt(ctx)

  // Build message history for Anthropic
  const messages: Array<{ role: string; content: unknown }> = [
    ...history.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage },
  ]

  let loopCount = 0
  const MAX_LOOPS = 8

  while (loopCount < MAX_LOOPS) {
    loopCount++

    const isLastLoop = loopCount === MAX_LOOPS

    // Non-streaming request for tool use turns, streaming only on final response
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        system: systemPrompt,
        messages,
        tools: isLastLoop ? [] : TOOLS,  // No tools on last loop — force text response
        max_tokens: 4000,
        stream: false,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      emit('error', { message: `Anthropic API error ${res.status}: ${err}` })
      return
    }

    const responseBody = await res.json() as {
      id: string
      stop_reason: string
      content: Array<{
        type: string
        text?: string
        id?: string
        name?: string
        input?: Record<string, string>
      }>
    }

    const { stop_reason, content } = responseBody

    // Collect text blocks and tool use blocks
    const textBlocks = content.filter(b => b.type === 'text')
    const toolUseBlocks = content.filter(b => b.type === 'tool_use')

    // If there's text content, stream it out as deltas
    for (const block of textBlocks) {
      if (block.text) {
        // Emit as character chunks for streaming feel
        const chunkSize = 8
        for (let i = 0; i < block.text.length; i += chunkSize) {
          emit('text_delta', { text: block.text.slice(i, i + chunkSize) })
          // Small artificial delay removed — CF Workers handles timing
        }
      }
    }

    // If stop reason is end_turn or no tools, we're done
    if (stop_reason === 'end_turn' || toolUseBlocks.length === 0) {
      emit('done', {})
      return
    }

    // Execute all tool calls
    const toolResults: Array<{ type: string; tool_use_id: string; content: string }> = []

    for (const toolBlock of toolUseBlocks) {
      const toolName = toolBlock.name!
      const toolInput = toolBlock.input ?? {}
      const toolUseId = toolBlock.id!

      // Emit tool_call event so UI can show what we're doing
      emit('tool_call', {
        id: toolUseId,
        name: toolName,
        input: toolInput,
      })

      // Execute the tool
      let result: string
      try {
        result = await dispatchTool(toolName, toolInput, ctx, githubToken)
      } catch (e) {
        result = `Error executing tool: ${e instanceof Error ? e.message : String(e)}`
      }

      // Emit tool_result event
      emit('tool_result', {
        id: toolUseId,
        name: toolName,
        result: result.slice(0, 2000), // Cap display
      })

      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUseId,
        content: result,
      })
    }

    // Add assistant message + tool results to history for next loop
    messages.push({ role: 'assistant', content })
    messages.push({ role: 'user', content: toolResults })
  }

  emit('error', { message: 'Agent reached max loop limit without completing.' })
}
