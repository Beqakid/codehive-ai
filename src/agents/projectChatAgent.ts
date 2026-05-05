/**
 * Project Manager Agent — Tasklet-grade capability embedded in every project.
 * Features: persistent context, direct action triggers, web search, repo inspection, CI analysis.
 * Uses raw fetch to Anthropic API (no SDK). Signature matches the route handler exactly.
 */

export interface ProjectContext {
  projectId: number
  projectName: string
  projectDescription?: string
  repoOwner: string
  repoName: string
  repoUrl?: string
  latestPlan?: {
    id: number
    status: string
    reviewScore?: number | null
    verdictReason?: string | null
    prBranch?: string | null
    prUrl?: string | null
    productSpec?: string
    architectureDesign?: string
    uiuxDesign?: string
    reviewFeedback?: string
  }
  fixAttempts: Array<{
    id: number
    attemptNumber: number
    status: string
    errorCategory?: string
    errorSummary?: string
    fixSummary?: string
    confidence?: number
    needsHumanReview?: boolean
    branchName?: string
  }>
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export type ActionDispatcher = (
  action: string,
  params: Record<string, unknown>,
) => Promise<string>

type Send = (obj: object) => void | Promise<void>

// ─── Tool definitions ─────────────────────────────────────────────────────────

const TOOLS = [
  // ── Repo tools ──
  {
    name: 'read_repo_file',
    description:
      'Read the content of a file from the GitHub repository. Use to inspect source code, configs, test files, package.json, etc.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'File path relative to repo root, e.g. "src/index.ts" or "package.json"',
        },
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
        path: {
          type: 'string',
          description: 'Directory path, e.g. "src" or "src/routes". Use "" for root.',
        },
      },
      required: ['path'],
    },
  },
  // ── CI tools ──
  {
    name: 'get_ci_status',
    description:
      'Get the latest GitHub Actions workflow run status. Optionally filter by branch.',
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
    description:
      'Get step-by-step breakdown of a specific CI run to identify exactly which step failed.',
    input_schema: {
      type: 'object',
      properties: {
        run_id: { type: 'string', description: 'The GitHub Actions run ID (numeric string).' },
      },
      required: ['run_id'],
    },
  },
  // ── Web tools ──
  {
    name: 'search_web',
    description:
      'Search the web for documentation, error message solutions, Stack Overflow answers, library docs, etc. Returns DuckDuckGo instant answers and related results.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Search query, e.g. "Jest mock module not found TypeScript" or "bcryptjs vs bcrypt node 20"',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'fetch_url',
    description:
      'Fetch the content of a specific URL — useful for reading documentation pages, GitHub issues, npm package READMEs, etc.',
    input_schema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Full URL to fetch, e.g. "https://jestjs.io/docs/configuration"',
        },
      },
      required: ['url'],
    },
  },
  // ── Action tools ──
  {
    name: 'approve_plan',
    description:
      'Approve the current agent plan so that code generation can begin. Only use if the user explicitly asks to approve.',
    input_schema: {
      type: 'object',
      properties: {
        plan_id: { type: 'number', description: 'The plan ID to approve.' },
        reason: { type: 'string', description: 'Brief reason for approval.' },
      },
      required: ['plan_id'],
    },
  },
  {
    name: 'trigger_fix',
    description:
      'Trigger the automated fix loop to re-run CI and attempt to fix failing tests. Use when the user asks to run a fix.',
    input_schema: {
      type: 'object',
      properties: {
        note: {
          type: 'string',
          description: 'Optional note to the user about what the fix loop will attempt.',
        },
      },
      required: [],
    },
  },
  {
    name: 'trigger_codegen',
    description:
      'Trigger code generation for the approved plan. Use when the user asks to generate code.',
    input_schema: {
      type: 'object',
      properties: {
        note: { type: 'string', description: 'Optional note about what will be generated.' },
      },
      required: [],
    },
  },
  {
    name: 'trigger_sandbox',
    description:
      'Trigger the sandbox test runner to execute tests on the current branch.',
    input_schema: {
      type: 'object',
      properties: {
        note: { type: 'string', description: 'Optional note.' },
      },
      required: [],
    },
  },
]

// ─── Tool executors ───────────────────────────────────────────────────────────

async function execReadRepoFile(owner: string, repo: string, path: string, token: string): Promise<string> {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' },
  })
  if (!res.ok) return `Error ${res.status}: file not found at "${path}"`
  const data = await res.json() as { content?: string; encoding?: string; message?: string }
  if (data.message) return `Error: ${data.message}`
  if (data.encoding === 'base64' && data.content) {
    const decoded = Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf-8')
    return decoded.length > 6000 ? decoded.slice(0, 6000) + '\n\n[...truncated at 6000 chars]' : decoded
  }
  return 'Error: unexpected response format'
}

async function execListRepoFiles(owner: string, repo: string, path: string, token: string): Promise<string> {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' },
  })
  if (!res.ok) return `Error ${res.status}: directory not found at "${path}"`
  const data = await res.json() as Array<{ name: string; type: string; size?: number }>
  if (!Array.isArray(data)) return 'Error: not a directory'
  return data.map(f => `${f.type === 'dir' ? '📁' : '📄'} ${f.name}${f.size ? ` (${f.size}b)` : ''}`).join('\n')
}

async function execGetCIStatus(owner: string, repo: string, branch: string | undefined, token: string): Promise<string> {
  let url = `https://api.github.com/repos/${owner}/${repo}/actions/runs?per_page=5`
  if (branch) url += `&branch=${encodeURIComponent(branch)}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' } })
  if (!res.ok) return `Error ${res.status}: could not fetch CI runs`
  const data = await res.json() as { workflow_runs?: Array<{ id: number; name: string; status: string; conclusion: string | null; head_branch: string; head_sha: string; created_at: string; html_url: string }> }
  const runs = data.workflow_runs ?? []
  if (!runs.length) return 'No CI runs found.'
  return runs.map(r =>
    `Run #${r.id}: ${r.name}\n  Branch: ${r.head_branch}\n  Status: ${r.status} / ${r.conclusion ?? 'in_progress'}\n  SHA: ${r.head_sha.slice(0, 7)}\n  At: ${r.created_at}\n  URL: ${r.html_url}`
  ).join('\n\n')
}

async function execGetCIJobSteps(owner: string, repo: string, runId: string, token: string): Promise<string> {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/runs/${runId}/jobs`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' },
  })
  if (!res.ok) return `Error ${res.status}: could not fetch jobs for run ${runId}`
  const data = await res.json() as { jobs?: Array<{ id: number; name: string; status: string; conclusion: string | null; steps?: Array<{ name: string; status: string; conclusion: string | null; number: number }> }> }
  const jobs = data.jobs ?? []
  if (!jobs.length) return 'No jobs found.'
  return jobs.map(j => {
    const steps = (j.steps ?? []).map(s => `    Step ${s.number}: ${s.name} — ${s.conclusion ?? s.status}`).join('\n')
    return `Job: ${j.name} [${j.conclusion ?? j.status}]\n${steps}`
  }).join('\n\n')
}

async function execSearchWeb(query: string): Promise<string> {
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } })
    if (!res.ok) return `Search error: HTTP ${res.status}`
    const data = await res.json() as {
      Abstract?: string
      AbstractText?: string
      AbstractURL?: string
      Answer?: string
      AnswerType?: string
      RelatedTopics?: Array<{ Text?: string; FirstURL?: string; Topics?: Array<{ Text?: string; FirstURL?: string }> }>
      Results?: Array<{ Text?: string; FirstURL?: string }>
    }
    const parts: string[] = []
    if (data.Answer) parts.push(`**Direct Answer:** ${data.Answer}`)
    if (data.AbstractText) parts.push(`**Summary:** ${data.AbstractText}\nSource: ${data.AbstractURL || ''}`)
    const topics = (data.RelatedTopics ?? []).slice(0, 5)
    if (topics.length > 0) {
      parts.push('**Related:**')
      for (const t of topics) {
        if (t.Text && t.FirstURL) parts.push(`- ${t.Text.slice(0, 120)} → ${t.FirstURL}`)
        else if (t.Topics) {
          for (const sub of t.Topics.slice(0, 2)) {
            if (sub.Text && sub.FirstURL) parts.push(`- ${sub.Text.slice(0, 120)} → ${sub.FirstURL}`)
          }
        }
      }
    }
    if (parts.length === 0) return `No instant answers found for "${query}". Try fetch_url with a specific docs page.`
    return parts.join('\n\n')
  } catch (e) {
    return `Search failed: ${e instanceof Error ? e.message : String(e)}`
  }
}

async function execFetchUrl(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CodeHive-Agent/1.0)' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return `HTTP ${res.status}: could not fetch ${url}`
    const ct = res.headers.get('content-type') ?? ''
    if (!ct.includes('text') && !ct.includes('json')) return `Non-text content at ${url} (${ct})`
    const text = await res.text()
    // Strip HTML tags for readability
    const stripped = text
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
    return stripped.length > 5000 ? stripped.slice(0, 5000) + '\n\n[...truncated]' : stripped
  } catch (e) {
    return `Fetch failed: ${e instanceof Error ? e.message : String(e)}`
  }
}

// ─── Tool dispatcher ──────────────────────────────────────────────────────────

async function dispatchTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  ctx: ProjectContext,
  token: string,
  actionDispatcher?: ActionDispatcher,
): Promise<string> {
  switch (toolName) {
    case 'read_repo_file':
      return execReadRepoFile(ctx.repoOwner, ctx.repoName, String(toolInput.path ?? ''), token)
    case 'list_repo_files':
      return execListRepoFiles(ctx.repoOwner, ctx.repoName, String(toolInput.path ?? ''), token)
    case 'get_ci_status':
      return execGetCIStatus(ctx.repoOwner, ctx.repoName, toolInput.branch ? String(toolInput.branch) : undefined, token)
    case 'get_ci_job_steps':
      return execGetCIJobSteps(ctx.repoOwner, ctx.repoName, String(toolInput.run_id ?? ''), token)
    case 'search_web':
      return execSearchWeb(String(toolInput.query ?? ''))
    case 'fetch_url':
      return execFetchUrl(String(toolInput.url ?? ''))
    case 'approve_plan':
    case 'trigger_fix':
    case 'trigger_codegen':
    case 'trigger_sandbox':
      if (actionDispatcher) {
        return actionDispatcher(toolName, toolInput)
      }
      return `Action "${toolName}" is not available in this context.`
    default:
      return `Unknown tool: "${toolName}"`
  }
}

// ─── System prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(ctx: ProjectContext): string {
  const plan = ctx.latestPlan
  const planSummary = plan
    ? `Status: ${plan.status}${plan.reviewScore != null ? ` (score ${plan.reviewScore}/10)` : ''}${plan.prUrl ? ` | PR: ${plan.prUrl}` : ''}`
    : 'No plans yet'

  const fixSummary =
    ctx.fixAttempts.length > 0
      ? `${ctx.fixAttempts.length} attempt(s). Latest: ${ctx.fixAttempts[0]?.status ?? 'unknown'} — ${ctx.fixAttempts[0]?.errorSummary ?? 'no summary'}`
      : 'No fix attempts yet'

  const planContext = plan
    ? `
## Current Plan (ID: ${plan.id})
- **Status:** ${plan.status}${plan.reviewScore != null ? ` | Score: ${plan.reviewScore}/10` : ''}
${plan.verdictReason ? `- **Reviewer notes:** ${plan.verdictReason.slice(0, 400)}` : ''}
${plan.productSpec ? `- **Product spec:** ${plan.productSpec.slice(0, 500)}` : ''}
${plan.architectureDesign ? `- **Architecture:** ${plan.architectureDesign.slice(0, 500)}` : ''}
${plan.reviewFeedback ? `- **Reviewer feedback:** ${plan.reviewFeedback.slice(0, 400)}` : ''}`
    : ''

  const fixContext =
    ctx.fixAttempts.length > 0
      ? `
## Fix History (${ctx.fixAttempts.length} attempts)
${ctx.fixAttempts
  .slice(0, 5)
  .map(
    f =>
      `- Attempt #${f.attemptNumber}: **${f.status}** | ${f.errorCategory ?? 'unknown error'} | confidence: ${f.confidence ?? '?'} | ${f.errorSummary ?? ''}`,
  )
  .join('\n')}`
      : ''

  return `You are the **Project Manager Agent** for "${ctx.projectName}" — a Tasklet-grade AI assistant embedded inside CodeHive AI.

You have complete context of this project and live tools to inspect the GitHub repo, CI pipeline, the web, and take direct actions.

## Project
- **Name:** ${ctx.projectName}
- **Repo:** ${ctx.repoOwner}/${ctx.repoName}${ctx.repoUrl ? ` (${ctx.repoUrl})` : ''}
${ctx.projectDescription ? `- **Description:** ${ctx.projectDescription}` : ''}

## Current State
- **Plan:** ${planSummary}
- **Fixes:** ${fixSummary}
${planContext}
${fixContext}

## Your Tools (10 total)
**Repo:** read_repo_file, list_repo_files
**CI:** get_ci_status, get_ci_job_steps
**Web:** search_web (DuckDuckGo), fetch_url (any URL)
**Actions:** approve_plan, trigger_fix, trigger_codegen, trigger_sandbox

## How to behave
- Be direct, specific, and tool-driven — don't guess when you can check
- **For debugging:** check CI status → drill into failed job steps → read the failing source file → search web for the error if needed
- **For approvals/triggers:** confirm the user's intent, then use the action tool
- Cite file names, test names, line numbers, error messages when relevant
- Format with markdown — headers, code blocks, bullet points
- When asked for a "briefing": check CI status first, read package.json, then summarize plan + CI health + fix history + recommended next action
- You are compared to Tasklet (the parent AI) — match its quality: thorough, honest, concise`
}

// ─── Main agentic loop ────────────────────────────────────────────────────────

export async function runProjectChat(
  messages: ChatMessage[],
  ctx: ProjectContext,
  githubToken: string,
  anthropicKey: string,
  send: Send,
  actionDispatcher?: ActionDispatcher,
): Promise<void> {
  if (!anthropicKey) {
    await send({ type: 'error', message: 'ANTHROPIC_API_KEY not configured' })
    return
  }
  if (!githubToken) {
    await send({ type: 'error', message: 'GITHUB_TOKEN not configured' })
    return
  }

  const systemPrompt = buildSystemPrompt(ctx)

  // Build Anthropic messages array from history
  const anthropicMessages: Array<{ role: string; content: unknown }> = messages.map(m => ({
    role: m.role,
    content: m.content,
  }))

  let loopCount = 0
  const MAX_LOOPS = 10

  while (loopCount < MAX_LOOPS) {
    loopCount++
    const isLastLoop = loopCount === MAX_LOOPS

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        system: systemPrompt,
        messages: anthropicMessages,
        tools: isLastLoop ? [] : TOOLS,
        max_tokens: 4096,
        stream: false,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      await send({ type: 'error', message: `Anthropic API error ${res.status}: ${err.slice(0, 200)}` })
      return
    }

    const body = await res.json() as {
      stop_reason: string
      content: Array<{
        type: string
        text?: string
        id?: string
        name?: string
        input?: Record<string, unknown>
      }>
    }

    const { stop_reason, content } = body
    const textBlocks = content.filter(b => b.type === 'text')
    const toolBlocks = content.filter(b => b.type === 'tool_use')

    // Stream text in chunks
    let fullText = ''
    for (const block of textBlocks) {
      if (block.text) {
        fullText += block.text
        // Emit in chunks for streaming feel
        const chunkSize = 12
        for (let i = 0; i < block.text.length; i += chunkSize) {
          await send({ type: 'chunk', text: block.text.slice(i, i + chunkSize) })
        }
      }
    }

    // If no tool calls or end_turn, we're done
    if (stop_reason === 'end_turn' || toolBlocks.length === 0) {
      await send({ type: 'done', fullText })
      return
    }

    // Execute tool calls
    const toolResults: Array<{ type: string; tool_use_id: string; content: string }> = []

    for (const toolBlock of toolBlocks) {
      const toolName = toolBlock.name!
      const toolInput = (toolBlock.input ?? {}) as Record<string, unknown>
      const toolUseId = toolBlock.id!

      // Notify UI: tool starting
      await send({ type: 'tool_start', toolId: toolUseId, tool: toolName, input: toolInput })

      let result: string
      try {
        result = await dispatchTool(toolName, toolInput, ctx, githubToken, actionDispatcher)
      } catch (e) {
        result = `Tool error: ${e instanceof Error ? e.message : String(e)}`
      }

      // Notify UI: tool result
      await send({ type: 'tool_result', toolId: toolUseId, tool: toolName, output: result.slice(0, 2000) })

      toolResults.push({ type: 'tool_result', tool_use_id: toolUseId, content: result })
    }

    // Continue loop with tool results
    anthropicMessages.push({ role: 'assistant', content })
    anthropicMessages.push({ role: 'user', content: toolResults })
  }

  await send({ type: 'error', message: 'Agent reached max loop limit.' })
}
