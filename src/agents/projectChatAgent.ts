/**
 * Project Manager Agent — Tasklet-grade capability embedded in every project.
 * Features: persistent memory (read+write), direct action triggers, web search, repo inspection, CI analysis.
 * Uses raw fetch to Anthropic API (no SDK). Signature matches the route handler exactly.
 */

export interface MemoryEntry {
  id: number
  type: string
  summary: string
  content: string
  importance: string
  tags?: string
  source: string
  createdAt: string
}

export interface ProjectContext {
  projectId: number
  projectName: string
  projectDescription?: string
  repoOwner: string
  repoName: string
  repoUrl?: string
  memories: MemoryEntry[]
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
  // ── Memory tools ──
  {
    name: 'write_memory',
    description:
      'Store an important lesson, decision, preference, milestone, or context note to persistent project memory. This survives across ALL future conversations. Use proactively whenever you learn something important — a fix that worked, a technology decision, a user preference, a key constraint.',
    input_schema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['lesson', 'decision', 'preference', 'milestone', 'context'],
          description: 'Type of memory entry',
        },
        summary: { type: 'string', description: 'Short title for this memory (max 150 chars)' },
        content: {
          type: 'string',
          description: 'Full detail to remember — be specific and actionable',
        },
        importance: {
          type: 'string',
          enum: ['critical', 'high', 'medium', 'low'],
          description: 'How important is this? critical = must never forget',
        },
        tags: {
          type: 'string',
          description: 'Comma-separated tags for search, e.g. "bcrypt,testing,node20"',
        },
      },
      required: ['type', 'summary', 'content'],
    },
  },
  {
    name: 'search_memory',
    description:
      'Search previously stored memories for this project by keyword or tag. Use before debugging to check if we\'ve seen this error before.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Keyword or tag to search for in memories (e.g. "bcrypt", "test failure")',
        },
      },
      required: ['query'],
    },
  },
  // ── Repo tools ──
  {
    name: 'read_repo_file',
    description:
      'Read the content of a file from a GitHub repository. Defaults to this project\'s repo. Pass owner/repo to read from ANY GitHub repo you have access to (e.g. other projects like viliniu, gotocare).',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'File path relative to repo root, e.g. "src/index.ts" or "package.json"',
        },
        owner: {
          type: 'string',
          description: 'GitHub repo owner. Defaults to this project\'s repo owner. Override to read from another repo.',
        },
        repo: {
          type: 'string',
          description: 'GitHub repo name. Defaults to this project\'s repo. Override to read from another repo (e.g. "gotocare", "viliniu").',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'list_repo_files',
    description: 'List files in a directory of a GitHub repository. Defaults to this project\'s repo. Pass owner/repo to browse ANY GitHub repo you have access to.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Directory path, e.g. "src" or "src/routes". Use "" for root.',
        },
        owner: {
          type: 'string',
          description: 'GitHub repo owner. Optional — defaults to this project\'s owner.',
        },
        repo: {
          type: 'string',
          description: 'GitHub repo name. Optional — defaults to this project\'s repo. Override for other repos.',
        },
      },
      required: ['path'],
    },
  },
  // ── CI tools ──
  {
    name: 'get_ci_status',
    description:
      'Get the latest GitHub Actions workflow run status. Optionally filter by branch. Pass owner/repo to check CI for any repo.',
    input_schema: {
      type: 'object',
      properties: {
        branch: { type: 'string', description: 'Branch name to filter by. Optional.' },
        owner: { type: 'string', description: 'GitHub repo owner. Optional — defaults to this project\'s owner.' },
        repo: { type: 'string', description: 'GitHub repo name. Optional — defaults to this project\'s repo.' },
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
        owner: { type: 'string', description: 'GitHub repo owner. Optional.' },
        repo: { type: 'string', description: 'GitHub repo name. Optional.' },
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
      'Fetch the content of a specific URL — useful for reading documentation pages, GitHub issues, npm package READMEs, etc. GitHub API URLs (api.github.com) are automatically authenticated.',
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

async function execReadRepoFile(owner: string, repo: string, filePath: string, token: string): Promise<string> {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' },
  })
  if (!res.ok) return `Error ${res.status}: file not found at "${filePath}" in ${owner}/${repo}`
  const data = await res.json() as { content?: string; encoding?: string; message?: string }
  if (data.message) return `Error: ${data.message}`
  if (data.encoding === 'base64' && data.content) {
    const decoded = Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf-8')
    return decoded.length > 6000 ? decoded.slice(0, 6000) + '\n\n[...truncated at 6000 chars]' : decoded
  }
  return 'Error: unexpected response format'
}

async function execListRepoFiles(owner: string, repo: string, dirPath: string, token: string): Promise<string> {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${dirPath}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' },
  })
  if (!res.ok) return `Error ${res.status}: directory not found at "${dirPath}" in ${owner}/${repo}`
  const data = await res.json() as Array<{ name: string; type: string; size?: number }>
  if (!Array.isArray(data)) return 'Error: not a directory'
  return data.map(f => `${f.type === 'dir' ? '📁' : '📄'} ${f.name}${f.size ? ` (${f.size}b)` : ''}`).join('\n')
}

async function execGetCIStatus(owner: string, repo: string, branch: string | undefined, token: string): Promise<string> {
  let url = `https://api.github.com/repos/${owner}/${repo}/actions/runs?per_page=5`
  if (branch) url += `&branch=${encodeURIComponent(branch)}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' } })
  if (!res.ok) return `Error ${res.status}: could not fetch CI runs for ${owner}/${repo}`
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
      RelatedTopics?: Array<{ Text?: string; FirstURL?: string; Topics?: Array<{ Text?: string; FirstURL?: string }> }>
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

async function execFetchUrl(url: string, token: string): Promise<string> {
  try {
    // Auto-authenticate GitHub API calls (needed for private repos)
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (compatible; CodeHive-Agent/1.0)',
    }
    if (url.startsWith('https://api.github.com') && token) {
      headers['Authorization'] = `Bearer ${token}`
      headers['Accept'] = 'application/vnd.github.v3+json'
    }
    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return `HTTP ${res.status}: could not fetch ${url}`
    const ct = res.headers.get('content-type') ?? ''
    if (!ct.includes('text') && !ct.includes('json')) return `Non-text content at ${url} (${ct})`
    const text = await res.text()
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

function execSearchMemory(memories: MemoryEntry[], query: string): string {
  const q = query.toLowerCase()
  const matches = memories.filter(m =>
    m.summary.toLowerCase().includes(q) ||
    m.content.toLowerCase().includes(q) ||
    (m.tags ?? '').toLowerCase().includes(q) ||
    m.type.toLowerCase().includes(q)
  )
  if (!matches.length) return `No memories found matching "${query}". No prior knowledge on this topic.`
  return `Found ${matches.length} memory entries matching "${query}":\n\n` +
    matches.map(m =>
      `**[${m.type.toUpperCase()}] ${m.summary}** (${m.importance} importance)\n${m.content}${m.tags ? `\nTags: ${m.tags}` : ''}`
    ).join('\n\n---\n\n')
}

// ─── Tool dispatcher ──────────────────────────────────────────────────────────

async function dispatchTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  ctx: ProjectContext,
  token: string,
  actionDispatcher?: ActionDispatcher,
): Promise<string> {
  // Allow per-call owner/repo overrides — fall back to project context
  const resolveOwner = (input: Record<string, unknown>) =>
    input.owner ? String(input.owner) : ctx.repoOwner
  const resolveRepo = (input: Record<string, unknown>) =>
    input.repo ? String(input.repo) : ctx.repoName

  switch (toolName) {
    case 'write_memory':
      if (actionDispatcher) {
        return actionDispatcher('write_memory', toolInput)
      }
      return 'Memory write not available in this context.'
    case 'search_memory':
      return execSearchMemory(ctx.memories, String(toolInput.query ?? ''))
    case 'read_repo_file':
      return execReadRepoFile(resolveOwner(toolInput), resolveRepo(toolInput), String(toolInput.path ?? ''), token)
    case 'list_repo_files':
      return execListRepoFiles(resolveOwner(toolInput), resolveRepo(toolInput), String(toolInput.path ?? ''), token)
    case 'get_ci_status':
      return execGetCIStatus(resolveOwner(toolInput), resolveRepo(toolInput), toolInput.branch ? String(toolInput.branch) : undefined, token)
    case 'get_ci_job_steps':
      return execGetCIJobSteps(resolveOwner(toolInput), resolveRepo(toolInput), String(toolInput.run_id ?? ''), token)
    case 'search_web':
      return execSearchWeb(String(toolInput.query ?? ''))
    case 'fetch_url':
      return execFetchUrl(String(toolInput.url ?? ''), token)
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

  // Build memory context — prioritise critical/high entries, then chronological
  const sortedMemories = [...ctx.memories].sort((a, b) => {
    const order = { critical: 0, high: 1, medium: 2, low: 3 }
    const aOrder = order[a.importance as keyof typeof order] ?? 2
    const bOrder = order[b.importance as keyof typeof order] ?? 2
    return aOrder - bOrder
  })

  const memoryContext =
    sortedMemories.length > 0
      ? `
## 🧠 Persistent Memory (${sortedMemories.length} entries — loaded from previous conversations)
${sortedMemories
  .slice(0, 20)
  .map(m => {
    const icon = { lesson: '💡', decision: '✅', preference: '⚙️', milestone: '🏆', context: '📋' }[m.type] ?? '📋'
    return `${icon} **[${m.type.toUpperCase()}]** ${m.summary}${m.tags ? ` *(${m.tags})*` : ''}\n   ${m.content.slice(0, 300)}`
  })
  .join('\n\n')}

> These memories were written in past conversations. Treat them as ground truth for this project. Always check them before debugging.`
      : `
## 🧠 Persistent Memory
No memories yet. Start storing lessons as you learn them — use write_memory proactively.`

  return `You are the **Project Manager Agent** for "${ctx.projectName}" — a Tasklet-grade AI assistant embedded inside CodeHive AI.

You have complete context of this project, live tools to inspect any GitHub repo, CI pipeline, and the web, and the ability to take direct actions AND store/retrieve persistent memory.

## Project
- **Name:** ${ctx.projectName}
- **Repo:** ${ctx.repoOwner}/${ctx.repoName}${ctx.repoUrl ? ` (${ctx.repoUrl})` : ''}
${ctx.projectDescription ? `- **Description:** ${ctx.projectDescription}` : ''}

## Current State
- **Plan:** ${planSummary}
- **Fixes:** ${fixSummary}
${planContext}
${fixContext}
${memoryContext}

## Your Tools (12 total)
**Memory:** write_memory (persist lessons/decisions), search_memory (query past knowledge)
**Repo:** read_repo_file, list_repo_files — accept optional owner/repo to read ANY GitHub repo
**CI:** get_ci_status, get_ci_job_steps — accept optional owner/repo for any repo
**Web:** search_web (DuckDuckGo), fetch_url (any URL — GitHub API calls auto-authenticated)
**Actions:** approve_plan, trigger_fix, trigger_codegen, trigger_sandbox

## How to behave
- **Always check memory first** when debugging — search for the error pattern before doing anything else
- **Write memories proactively** — after every fix attempt, every debugging session, every decision
- Be direct, specific, and tool-driven — don't guess when you can check
- **For debugging:** search_memory → get_ci_status → get_ci_job_steps → read failing file → search_web if needed
- **For approvals/triggers:** confirm intent, then use action tool, then write a milestone memory
- **To read another repo** (e.g. gotocare, viliniu): use read_repo_file/list_repo_files with owner="Beqakid" repo="gotocare"
- Cite file names, test names, line numbers, error messages when relevant
- Format with markdown — headers, code blocks, bullet points
- When asked for a "briefing": check memory → check CI → summarize plan + health + recommended next action
- You are compared to Tasklet (the parent AI) — match its quality: thorough, honest, concise, proactive`
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

  const anthropicMessages: Array<{ role: string; content: unknown }> = messages.map(m => ({
    role: m.role,
    content: m.content,
  }))

  let loopCount = 0
  const MAX_LOOPS = 12

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

    // Stream text in chunks for a live feel
    let fullText = ''
    for (const block of textBlocks) {
      if (block.text) {
        fullText += block.text
        const chunkSize = 12
        for (let i = 0; i < block.text.length; i += chunkSize) {
          await send({ type: 'chunk', text: block.text.slice(i, i + chunkSize) })
        }
      }
    }

    // Done if no tool calls
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

      await send({ type: 'tool_start', toolId: toolUseId, tool: toolName, input: toolInput })

      let result: string
      try {
        result = await dispatchTool(toolName, toolInput, ctx, githubToken, actionDispatcher)
      } catch (e) {
        result = `Tool error: ${e instanceof Error ? e.message : String(e)}`
      }

      // If a memory was written, append it to ctx so subsequent searches find it
      if (toolName === 'write_memory' && !result.startsWith('Error') && !result.startsWith('Memory write')) {
        ctx.memories.push({
          id: Date.now(),
          type: String(toolInput.type ?? 'context'),
          summary: String(toolInput.summary ?? ''),
          content: String(toolInput.content ?? ''),
          importance: String(toolInput.importance ?? 'medium'),
          tags: toolInput.tags ? String(toolInput.tags) : undefined,
          source: 'agent',
          createdAt: new Date().toISOString(),
        })
      }

      await send({ type: 'tool_result', toolId: toolUseId, tool: toolName, output: result.slice(0, 2000) })
      toolResults.push({ type: 'tool_result', tool_use_id: toolUseId, content: result })
    }

    // Continue loop with tool results
    anthropicMessages.push({ role: 'assistant', content })
    anthropicMessages.push({ role: 'user', content: toolResults })
  }

  await send({ type: 'error', message: 'Agent reached max loop limit.' })
}
